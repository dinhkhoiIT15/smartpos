# Từ điển thuật ngữ SmartPOS

| Thuật ngữ | Ý nghĩa ngắn |
|---|---|
| MVP | Phiên bản nhỏ nhất đáp ứng luồng kinh doanh đầu tiên. |
| SKU | Mã duy nhất của biến thể hàng hóa bán được. |
| Product variant | Biến thể cụ thể theo màu, dung lượng, kích thước... |
| Monorepo | Một Git repository chứa desktop, API, các package dùng chung. |
| Electron main | Tiến trình desktop có quyền hệ thống; không đưa quyền này cho UI. |
| Electron renderer | Phần hiển thị giao diện React; cần được cách ly. |
| Preload / IPC | Cầu nối có giới hạn giữa renderer và main. |
| SQLite | Database cục bộ chạy trên máy thu ngân. |
| Neon PostgreSQL | PostgreSQL managed làm nguồn dữ liệu trung tâm. |
| Migration | Tập thay đổi database có lịch sử và có thể review. |
| Outbox | Hàng đợi sự kiện lưu chung transaction với giao dịch offline. |
| Idempotency | Gửi lại cùng một yêu cầu không gây tác dụng nghiệp vụ lặp lại. |
| ACK | Xác nhận server đã xử lý sự kiện. |
| Sync conflict | Mâu thuẫn giữa dữ liệu offline và cloud cần chính sách xử lý. |
| PR | Pull Request, nơi review code trước khi merge. |
| CI | Các kiểm tra tự động chạy khi thay đổi code. |
| ADR | Architecture Decision Record: hồ sơ quyết định kỹ thuật và lý do. |
| RPO / RTO | Mục tiêu mất dữ liệu tối đa chấp nhận được / thời gian khôi phục mục tiêu. Chưa cam kết trong MVP. |
