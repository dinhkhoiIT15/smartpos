# Coding Conventions — SmartPOS

**Trạng thái:** ACCEPTED STARTER. Áp dụng từ POS-001; nếu đổi convention, ghi ADR/PR, không tự ý trộn nhiều phong cách trong một module.

## Ngôn ngữ và tổ chức
- TypeScript `strict`. Sử dụng `tsconfig.base.json` làm nền; từng package có `tsconfig` riêng phù hợp Electron main, renderer, API.
- File TS dùng `kebab-case` khi dễ đọc, tên class/type `PascalCase`, hàm/biến `camelCase`, hằng domain có tên diễn tả rõ ràng.
- Tách `apps/desktop` thành main/preload/renderer/local-db/sync, API theo module nghiệp vụ. Không đặt SQL trong React component.
- Package `contracts` chỉ định nghĩa DTO/schema; `domain` chứa logic thuần không phụ thuộc Electron/HTTP/Postgres.
- Không tạo abstraction/general framework khi chỉ có một use case; ưu tiên function rõ nghĩa và test được.

## Tiền, thời gian, số lượng
- Tiền VND: `bigint` hoặc biểu diễn string an toàn khi đi qua JSON; validate và chuyển đổi tại boundary. Không `Number` cho phép tính tiền có nguy cơ vượt giới hạn.
- Dữ liệu trên PostgreSQL/SQLite dùng BIGINT integer; không dùng float và không gọi `.toFixed` để tính tiền.
- Timestamps lưu UTC ISO hoặc `timestamptz`; hiển thị theo `Asia/Ho_Chi_Minh`; không lấy timezone local để quyết định business date khi chưa có quy tắc.
- Số lượng tồn/bán integer dương; validate ở UI, API và DB constraints.

## API, database, sync
- Validate input ở API bằng Zod; route handler chỉ parse + auth + gọi service + map response.
- Data access ở repository/DB module, migration được version hóa. Không gọi Neon từ renderer.
- Idempotency được thực thi ở unique constraint + transaction, không chỉ logic `if (exists)` dễ race.
- Lỗi sync phải phân biệt retryable và permanent; không được xóa outbox khi ACK chưa được commit local.

## Test và nhật ký
- Tên test mô tả nghiệp vụ. Test tiền, kho và offline phải có case âm/timeout/crash/retry.
- Không log credential, token hoặc payload có PII không cần thiết; dùng request/correlation ID.
- Không claim pass khi chưa chạy: báo lệnh và output thực tế, môi trường và điều kiện test.

## Code review
- Giữ PR nhỏ; giải thích lý do, không chỉ liệt kê file.
- Bất kỳ thay đổi `LOCKED` phải có CR + ADR được phê duyệt.
