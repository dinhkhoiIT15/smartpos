# Integration & E2E tests (future)

Thư mục dự kiến chứa các bài kiểm thử luồng xuyên suốt desktop ↔ API ↔ Neon/test database.

**M0:** chưa có test ứng dụng hay test database được thực thi.

- POS-021: duplicate delivery, ACK lost, idempotency.
- POS-029: crash, restore, stale price, stock conflict, retry.
- Test dùng dữ liệu giả; không tự động kết nối Production.
