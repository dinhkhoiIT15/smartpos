# POS-016 — Hợp đồng push/pull đồng bộ có phiên bản v1

**Trạng thái:** CODE CONTRACT + OpenAPI **ONLY** — [Issue #29](https://github.com/dinhkhoiIT15/smartpos/issues/29), [draft PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30). Không có API đồng bộ đang chạy, không có sync worker, không kết nối Neon.
**Chuẩn gốc:** [OFFLINE_SYNC_DESIGN](../OFFLINE_SYNC_DESIGN.md) (LOCKED); BR-003/007/008/009/010, D-010 thời hạn quyền offline tối đa 4 giờ. Không thay đổi baseline nghiệp vụ.

## 1. Version và trust boundaries

- Request/response có `protocolVersion: 1`; sự kiện bán có `schemaVersion: 1`. Version khác bị từ chối, **không tự động bỏ qua** trường không hiểu hoặc downgrade phiên bản.
- Chỉ `SALE_COMPLETED` (đơn tiền mặt `POSTED`) có DTO v1. Event lấy từ **SQLite đã commit**; không chứng minh SQLite được ghi atomically chỉ bởi việc hợp đồng parse thành công.
- `storeId`, `deviceId`, `cashierId`, `offlineGrantId`, thời điểm bán và hash do client cung cấp **không đủ để cấp quyền**. Fastify tương lai phải kiểm tra **thật** bearer/session, membership, device, grant đã phát và phạm vi cửa hàng trước khi ghi. Mã xác minh chữ ký/khóa an toàn còn chờ D-013/POS-025.
- Hợp đồng không chứa token, password, refresh token, khóa riêng, Neon URL. Token auth sau này chỉ nằm trong HTTPS Authorization header do Electron MAIN sở hữu.
- Số tiền: `"8990000"`, không dùng số JSON; `BigInt` kiểm tra `qty * unitPrice - discount = lineTotal`, `sum(lines) = total`, `due = total`, `tendered >= due`, `change = tendered-due` và phạm vi BIGINT. `quantity` phải là integer dương trong giới hạn 32-bit cho sale_items v1.
- Timestamp: UTC ISO có mili giây `2026-11-07T08:10:00.000Z`, hiển thị tại `Asia/Ho_Chi_Minh` ở UI sau này. Client timestamp **không phải** bằng chứng đáng tin về thời điểm revoke/offline.
- SKU/tên/thuộc tính/giá ở `sale.items` là **snapshot bất biến tại lúc thu tiền**, không tự thay đổi theo catalog mới.

## 2. Canonical hash SHA-256 v1

`payloadHash` gồm **64 chữ hex thường**. Giá trị được tính:

1. Lấy toàn bộ JSON `SALE_COMPLETED` hợp lệ (bao gồm `schemaVersion`, IDs, timestamp, `catalogRevision`, `sale`) **ngoại trừ chính `payloadHash`**.
2. Sắp xếp **mọi key object lồng nhau** theo thứ tự từ điển UTF-16 kiểu JavaScript; mảng giữ đúng thứ tự; chuyển thành JSON compact UTF-8, không chấp nhận `undefined`, `NaN`, `Infinity`, số không an toàn/float.
3. `SHA256(UTF8(canonical JSON))` → lowercase hex. Sử dụng `computeSyncPayloadHash` trong Node/Electron MAIN hoặc backend; không chuyển qua `Number()` và không thay đổi snapshot sau khi tạo event.
4. Server phải tự tính lại và kiểm tra; hash là kiểm tra toàn vẹn, **không phải chữ ký xác thực hay chống người có quyền sửa file SQLite**.

Ví dụ chuẩn: [push.request.json](examples/push.request.json) có `payloadHash = 64caf850ef884a5c682e1dc9c2dc54e80bb0f4a835df4f74ddaebe93079016fd`, được kiểm tra bằng bài test đọc chính fixture từ repo.

## 3. POST /v1/sync/push — Future endpoint, không đăng ký trong Fastify

- Tối đa **25 event**, tối đa **512 KiB** JSON, mỗi sale tối đa **100 dòng**; cùng device/store trong batch; `eventId` và `saleId` không trùng trong batch.
- Cặp `device_id,event_id` có thể dùng làm idempotency key server, cùng với `sale_id` UNIQUE trong schema POS-012. **Cùng event + cùng hash** thì trả lại **ACK cũ nguyên trạng**, không tạo thêm sale/payment/stock. **Cùng event + hash khác**, hoặc saleId bị tái sử dụng dưới event khác, phải bị từ chối và chuyển `NEEDS_REVIEW`/cảnh báo, không tạo sale giả.
- `ACKED`: server **đã commit** sale/items/CASH payment/movements/receipt trong một transaction; `resultCode=APPLIED`, `STOCK_SHORTAGE_RECONCILIATION` hoặc `STALE_PRICE_REVIEW`. Nếu thiếu tồn kho do sale tiền mặt offline đã hoàn tất, **không xóa đơn tiền mặt**; bảo tồn và tạo conflict để manager xem (POS-021/024).
- `NEEDS_REVIEW`: event chưa được xác nhận đồng bộ; giữ nguyên outbox/local paid sale, kiểm tra nghiệp vụ hoặc nhân viên/thiết bị bị thu hồi; **không** mark `SYNCED`.
- `RETRY`: lỗi hạ tầng tạm thời, đợi `retryAfterSeconds`, dùng nguyên eventId/hash khi gửi lại; không tạo ID mới.
- Client phải đối chiếu mọi kết quả trả về với **đúng eventId/saleId theo thứ tự batch** bằng `assertPushResponseMatchesRequest` trước khi thay đổi trạng thái outbox. Body thiếu/ngoài/thứ tự khác → không ACK, thử lại an toàn.
- Validation trước DB trả lỗi HTTP (400/413/401/403/503…) theo [OpenAPI](openapi-v1.yaml). Các result `NEEDS_REVIEW` là kết quả xử lý từng event sau khi server tiếp nhận; không ép event sai schema thành ACK.
- `clientCreatedAt` là chứng cứ client không đáng tin tuyệt đối; server kiểm tra rủi ro revoke với grant đã ký/cấp trước đó và audit, **không tin timestamp client để lách revoke**.

## 4. GET /v1/sync/pull?cursor=N&limit=M — Future endpoint

- `cursor` mặc định chuỗi `"0"`, là **global sequence** của `catalog_change_log.seq`, không phải số thứ tự liên tiếp theo cửa hàng. `limit` 1–100, mặc định 100.
- Server lọc theo **store từ session đã xác thực** và trả `fromCursor`, `nextCursor`, `highWatermark`, `hasMore` và `changes[]` có seq **tăng nghiêm ngặt**. Gaps là hợp lệ vì seq global có thể thuộc cửa hàng khác.
- `fromCursor <= nextCursor <= highWatermark`; nếu `hasMore=true`, trang phải có thay đổi và `nextCursor` bằng seq cuối trang. Nếu `hasMore=false`, `nextCursor = highWatermark`, kể cả trang trống.
- **Chỉ sau khi** SQLite áp dụng thành công **toàn bộ** trang trong **một transaction**, cursor mới nâng lên `nextCursor`. Nếu app crash hoặc báo lỗi → rollback cursor/deltas, tải lại từ cursor cũ; không xóa local sales/outbox/unsynced stock delta. `assertPullResponseMatchesQuery` kiểm tra cursor/limit trước khi áp dụng. Việc áp dụng SQLite thật là POS-017/023.
- `payload` thay đổi catalog là JSON chưa ràng buộc theo từng loại entity; POS-023 sẽ định nghĩa DTO chi tiết và bảo đảm catalog/stock source thực sự phát hành delta đồng bộ. **POS-015 stock adjustments chưa tự phát sinh catalog-change events**, nên chưa thể xem contract này là một luồng tồn kho hoàn chỉnh. Cần review riêng trước khi bật pull thực tế.

## 5. OpenAPI, ví dụ và trạng thái code

- [OpenAPI 3.1](openapi-v1.yaml) mô tả **future endpoints**. `https://api.example.invalid` là placeholder, không phải server thật.
- Ví dụ chính xác: [push request](examples/push.request.json), [push ACK](examples/push.response.json), [hash mismatch → review](examples/push.review.response.json), [pull query](examples/pull.query.json) và [pull page](examples/pull.response.json).
- Runtime server hiện tại vẫn chỉ trả `GET /v1/health`. `POST /v1/sync/push`, `GET /v1/sync/pull` **phải trả 404**, không được bật API mô phỏng quyền.
- Không có DB migration, không có Postgres transaction sync, không có network retry, không có grant ký số thật, không có đồng bộ với Neon; không có test đang chạy trên dữ liệu thật.

## 6. Windows acceptance

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-016-versioned-sync-contract
git pull --ff-only origin feature/POS-016-versioned-sync-contract
pnpm install --frozen-lockfile

pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
pnpm run check
```

**Kỳ vọng:** kiểm tra typecheck PASS, `contracts test` `fail 0` (bao gồm fixture hash/cursor/v1/replay negative cases), `pnpm run check` thành công. Không cần Postgres local hay Neon.

Kiểm tra runtime fail-closed (hai terminal):

```powershell
# Terminal 1
pnpm --filter @smartpos/api dev
```

```powershell
# Terminal 2
Invoke-RestMethod http://127.0.0.1:3001/v1/health
try {
  Invoke-WebRequest "http://127.0.0.1:3001/v1/sync/pull?cursor=0" -ErrorAction Stop
} catch { [int]$_.Exception.Response.StatusCode }
```

Kỳ vọng health `status:ok` và sync pull **404 cố ý**. Tương tự push chưa được đăng ký. **Không chạy** `migrate:dev`, `drizzle-kit push`, sync test với Neon hay copy `.env`/DB/keys vào chat. Khi Windows test PASS, chủ dự án review/merge PR #30 rồi mới đóng Issue #29.

## 7. Test âm bắt buộc

Các test trong `packages/contracts/src/sync-v1.test.ts` phải từ chối: version mới/unknown, trùng event/sale ID, event khác store/device, JSON money dạng number/float/overflow, CASH thay CARD, line total/discount/tendered/change sai, hash bị sửa, token/key nhúng payload, ACK không khớp event/sale ID, replay khác hash, cursor lùi/trùng/out-of-order, trang thiếu/gian lận watermark/hasMore. Đây là **schema/logic tests**, chưa phải kiểm chứng live sync transaction.
