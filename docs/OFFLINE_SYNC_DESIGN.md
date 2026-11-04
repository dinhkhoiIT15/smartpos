# Offline Sync Policy — v1.0

**Status:** LOCKED POLICY. Implementation chưa tồn tại. 1 cửa hàng + 1 thiết bị POS được phép ghi sale offline; nhiều nhân viên có thể dùng lần lượt máy đó.

## 1. Mục tiêu / giới hạn
- Không mất dữ liệu sale đã commit cục bộ khi đóng/mở app bình thường hoặc gián đoạn mạng; mức bảo toàn sau lỗi đĩa/máy hỏng phụ thuộc backup riêng.
- Không tạo trùng sale khi retry timeout/ACK lost.
- Không tự động xóa sale có tiền mặt đã thu do conflict.
- Đồng bộ bất đồng bộ, **không** hứa exactly-once network delivery; đạt exactly-once *effect* server-side bằng receipt + UNIQUE + transaction.
- Không đảm bảo tồn kho toàn cục không âm khi có cập nhật online cạnh tranh, dù chỉ một POS offline.

## 2. Domain event
`SALE_COMPLETED` với `schema_version`, `event_id` UUID, `sale_id` UUID, `device_id`, `store_id`, `cashier_id`, `client_created_at`, `catalog_revision`, sale/items/payment snapshot, `payload_hash` canonical. Không kèm password/token/db secrets trong payload.

## 3. Local write path
1. Xác nhận thiết bị đã provision; nhân viên có quyền offline trong hạn session đã được cấp.
2. Kiểm tra cart/quantity/prices cục bộ; tiền nhận >= tiền phải thu; validate integer overflow.
3. Bắt đầu SQLite transaction; kiểm tra local inventory (không đủ thì từ chối bán bình thường; không cho âm local theo mặc định).
4. Ghi `local_sales`, `local_sale_items`, `local_payments` immutable, cập nhật local stock, append `outbox_events(PENDING)`; commit atomically.
5. Chỉ hiển thị `LOCAL_SAVED`/`PENDING_SYNC` sau commit thành công. Không hiện SYNCED nếu chưa ACK.

## 4. Push path
- Worker gửi sự kiện PENDING/RETRY qua HTTPS, theo thứ tự `created_at,event_id` với một worker trên một thiết bị.
- `POST /v1/sync/push` batch có giới hạn; server xác minh token, device role, schema, payload hash và source.
- Server dùng UNIQUE(device_id,event_id), UNIQUE(sale_id), receipt cache và transaction; event đã xử lý trả ACK cũ, payload hash khác thì báo lỗi bảo mật/xung đột, không coi như trùng hợp lệ.
- Ghi sale + items + payment + stock movement + balance + sync receipt cùng transaction. Lock balance theo variant hoặc dùng điều kiện UPDATE an toàn để xử lý cạnh tranh.
- Nếu tồn cloud không đủ do điều chỉnh online trước đó: bảo tồn sale tiền mặt, cho phép âm tồn có đánh dấu `STOCK_SHORTAGE_RECONCILIATION`; manager được yêu cầu đối soát. **Không** âm thầm trả sale về trạng thái không tồn tại.
- Nếu dữ liệu không hợp lệ hoặc sự kiện vượt quyền: không mark SYNCED; chuyển `NEEDS_REVIEW` và hướng dẫn đối soát, không xóa event.
- ACK phải trả `event_id`, `sale_id`, `server_received_at`, `result`, `conflict_ids?`.

## 5. Pull path
- Khi online, sau push hoặc theo chu kỳ, desktop gọi `GET /v1/sync/pull?cursor=N` để lấy catalog/price/stock snapshot + change log theo watermark tăng dần.
- Áp dụng thay đổi kéo về trong SQLite transaction; cursor chỉ nâng sau khi áp dụng xong.
- Không ghi đè `local_sale_*`, pending outbox hoặc inventory local chưa reconcile bằng snapshot cloud; áp dụng snapshot và pending deltas có quy tắc rõ; ưu tiên rebase local balance = cloud balance + unsynced deltas.
- Revision server mới hơn có thể tạo cảnh báo `PRICE_CHANGED_WHILE_OFFLINE` cho sale pending; không đổi giá của sale đã thu tiền.
- Pagination phải bảo toàn thứ tự và cursor khi nhiều thay đổi.

## 6. Retry & state machine
`PENDING -> SYNCING -> SYNCED` hoặc `RETRY`; `RETRY -> SYNCING`; lỗi business/data -> `NEEDS_REVIEW`. Nếu app crash khi SYNCING, reset về RETRY khi startup; event không được xóa khỏi SQLite sau ACK, có thể lưu archive theo retention policy sau khi backup/đối soát.
- Exponential backoff + jitter; có retry button bằng tay nhưng vẫn idempotent.
- Phân biệt timeout tạm thời vs permanent validation error; rate-limit batch hợp lý.
- Cursor/ACK update SQLite atomically theo từng response.

## 7. Conflict policies
| Loại | Policy |
|---|---|
| `STOCK_SHORTAGE` | Ghi sale + movement, cân bằng có thể âm; mở conflict cần manager xử lý |
| `STALE_PRICE` | Giữ giá snapshot thu tiền; log audit/conflict tùy ngưỡng chính sách |
| `DUPLICATE_EVENT` | Return prior ACK, không tạo thêm bản ghi |
| `PAYLOAD_HASH_MISMATCH` | Reject và nâng cảnh báo bảo mật; không tự sửa |
| `REVOKED_DEVICE` | Quarantine pending events, không xóa; yêu cầu quản lý xử lý bằng quy trình xác minh thủ công |
| `AUTH_EXPIRED` | Giữ local event, chờ re-auth và reconciliation có chứng cứ |

## 8. Local security / recovery
- Chỉ thiết bị đăng ký, cấp quyền offline khi kết nối mạng; lưu quyền local có thời hạn và xác minh lại khi online. Chưa chốt thời hạn: quyết định ở issue riêng trước khi code auth offline.
- Dữ liệu local có thể nhạy cảm: bảo vệ file permissions, keychain/secure storage, encryption at rest được quyết định trước pilot.
- Backup SQLite phải nhất quán (backup API hoặc đóng DB hợp lệ), không chỉ copy file WAL đang mở; diễn tập khôi phục và restore thử.
- Nếu mất hoàn toàn đĩa trước khi sync thì cloud không thể tái tạo sale chưa gửi; đây là residual risk cần mô tả minh bạch cho người dùng.

## 9. Required failure tests
- Offline sale + close/reopen; kill app mid-checkout; network disconnect during push.
- Duplicate delivery & ACK lost; server restart after DB commit but before ACK.
- Revoked device; stale price; cloud stock change while device offline; invalid payload; quota/circuit retry.
- Two overlapping push requests; multiple sale orders; SQLite corruption/recovery drill.

## 10. Những gì chưa thực hiện ở M0
Không có sync worker thật, không có queue thật, không có transaction code và chưa chạy bất kỳ test nào.
