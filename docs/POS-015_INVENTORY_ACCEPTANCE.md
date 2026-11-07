# POS-015 — Kiểm thử nghiệm thu tồn kho và biến động kho (Windows)

**Trạng thái:** [Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27), [PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28) trong giai đoạn review, **CHƯA triển khai sản xuất**.

## Phạm vi đã xây dựng

`apps/api/src/inventory/` là dịch vụ PostgreSQL chạy trên server:
- Đọc số dư tồn kho theo `store_id + variant_id`; chưa có hàng tồn sẽ đọc là **0** mà không tự tạo bản ghi khi chỉ xem.
- Nhập tồn `RECEIPT` (delta dương), xuất `ISSUE` (delta âm), điều chỉnh `CORRECTION` (delta khác 0). Bắt buộc `reason` có độ dài hợp lệ và `movementId` UUID dùng lại khi retry, không tạo UUID mới mỗi lần retry.
- `qty`, `qty_delta`, `revision` là **BIGINT nguyên 64-bit**, JSON chứa **chuỗi thập phân chuẩn**, không dùng JavaScript float.
- Chỉ **ADMIN/MANAGER** được điều chỉnh, **CASHIER chỉ đọc**; yêu cầu principal do server xác thực và membership active trùng role/store trong PostgreSQL.
- Giao dịch ghi `inventory_movements + inventory_balances + audit_logs` **đồng thời trong một PostgreSQL transaction**. Nếu thiếu hàng/overflow/lỗi audit sẽ rollback cả ba.
- Cập nhật kho theo phép cộng trong database có điều kiện, không ghi đè tồn khi hai request chạy song song; revision tăng đúng một lần với mỗi thao tác thành công.
- `inventory_movements` và `audit_logs` đã có trigger **append-only** từ POS-012. Không xóa, không sửa các movement lịch sử.
- Điều chỉnh kho thủ công **không cho âm tồn**. Quy tắc BR-009 (có thể ghi âm khi đối soát sale đã thu tiền offline) chỉ dành cho **luồng sync POS-021 sau này**, không được mở ở POS-015.

**Ranh giới bảo mật:** hiện chưa có login/RBAC thực thi, nên chương trình Fastify thông thường **KHÔNG đăng ký các route tồn kho**. `/v1/inventory/*` trả về **404 là đúng**, kể cả header giả `x-role: ADMIN`. Route chỉ được tiêm vào server thử nghiệm với principal giả lập; **không dùng để cập nhật Neon hoặc hàng thật**.

## Nghiệm thu trên Windows — KHÔNG cần Neon

Mở PowerShell trong VS Code (thư mục dự án):

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-015-inventory-transactions
git pull --ff-only origin feature/POS-015-inventory-transactions
pnpm install --frozen-lockfile

pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:inventory
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/db schema:check
```

**Đạt** khi TypeScript thoát không lỗi; hai bộ test đều `fail 0`; Drizzle Kit hiện `Everything's fine`.

Nếu Git không cho chuyển nhánh vì bạn có thay đổi cục bộ, **không** dùng `reset --hard` hoặc xóa dữ liệu; gửi kết quả `git status --short` không chứa thông tin bí mật để kiểm tra. Giữ pnpm **10.20.0** theo cấu hình dự án, không nâng phiên bản chỉ do thông báo cập nhật.

### Kiểm tra API khỏe và route tồn kho chưa được mở

Terminal số 1:

```powershell
pnpm --filter @smartpos/api dev
```

Terminal số 2:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/v1/health
```

Kỳ vọng `status: ok` và `service: smartpos-api`.

```powershell
try {
  Invoke-WebRequest "http://127.0.0.1:3001/v1/inventory/variants/00000000-0000-4000-8000-000000000001/balance" -ErrorAction Stop
} catch {
  [int]$_.Exception.Response.StatusCode
}
```

Kỳ vọng **404 (Not Found)** — không cho public đọc/ghi kho cho đến khi có xác thực server thật. Dừng Fastify bằng `Ctrl+C`.

## PostgreSQL integration — bằng chứng CI, không chạy trên Neon

GitHub Actions dùng container **PostgreSQL 16 tạm** trên `127.0.0.1:5432/smartpos_ci`, áp dụng migration v1 trong test rồi chạy:

```bash
pnpm --filter @smartpos/api test:inventory:pg
```

Script **bắt buộc** `POS_DB_TEST_URL` trỏ tới `127.0.0.1/smartpos_ci`. Nó dùng dữ liệu giả do CI tạo; **KHÔNG truyền DATABASE_URL Neon, KHÔNG chạy trên production**, không cần tạo products/tồn kho thật.

Những tiêu chí CI phải chứng minh:
1. Đọc tồn trống, cách ly cửa hàng và kiểm tra nhân viên đang active.
2. Nhập kho tạo movement, revision và audit.
3. Retry cùng `movementId` chỉ ghi một lần, thay đổi payload với cùng ID bị từ chối.
4. Gửi đồng thời hai phiếu nhập không mất số lượng, gửi trùng cùng ID không nhân đôi.
5. Hai phiếu xuất song song vượt tồn chỉ một phiếu được áp dụng, tồn không âm.
6. Delta ngoài miền 64-bit bị chặn; tràn số lượng/revision không ghi movement.
7. Nếu audit INSERT thất bại, movement/balance/audit cùng rollback.
8. Bản ghi movement/audit bất biến (PostgreSQL trigger).

## Giới hạn nghiệm thu

Kết quả CI + kiểm thử Windows xác nhận **nền tảng dịch vụ kho**, **không phải** giao diện quản lý kho có thể dùng bởi nhân viên. Người dùng thực tế chưa thể nhập/xuất hàng qua API, vì chưa có đăng nhập và phân quyền. POS-021 mới là nơi xử lý sale offline và tồn âm ngoại lệ.

Không cần chạy `migrate:dev`, `drizzle-kit push`, hoặc bất kỳ lệnh `INSERT/UPDATE` nào trên Neon để nghiệm thu POS-015. Chỉ merge PR sau khi CI xanh và chủ dự án xác nhận các lệnh Windows.
