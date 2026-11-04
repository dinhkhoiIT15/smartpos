# GitHub Setup for ChatGPT Work / coding agent

**Current status:** user said they will connect GitHub; **not yet verified** in this package.

1. Kết nối GitHub trong ChatGPT bằng luồng kết nối chính thức, xác nhận quyền phù hợp repo cần làm việc; không cấp quyền toàn bộ org khi không cần.
2. Cung cấp repository URL và nhánh chính cho agent. Agent phải đọc HEAD, `git status` và README trước khi chỉnh sửa.
3. Tạo branch `docs/POS-002-initialize-m0` (nếu repo thực sự trống, commit từ branch khởi tạo phù hợp) và thêm toàn bộ gói.
4. Chạy `node scripts/validate-context.mjs`, mở PR, xác minh CI.
5. Tạo 30 Issue hoặc tối thiểu 6 Issue M0 từ BACKLOG.csv; map ID logic sang GitHub issue URL.
6. Thiết lập labels & GitHub Project; cập nhật `TODO.md` link issue và status.
7. Merge khi review pass; cập nhật verified SHA, PR link và CI URL vào `DEVELOPMENT_STATUS.md`/`SESSION_HANDOFF.md` ở commit tiếp theo nếu cần.

## Mẫu lệnh giao việc cho coding agent
> Hãy làm POS-002 cho SmartPOS. Đọc AGENTS.md, PRD, ARCHITECTURE, DATABASE_SCHEMA, OFFLINE_SYNC_DESIGN, DEVELOPMENT_STATUS và SESSION_HANDOFF; kiểm tra repository HEAD; thêm bộ tài liệu M0 từ package đã cung cấp; chạy `node scripts/validate-context.mjs`; tạo PR. Không tạo code desktop/backend hoặc chạy Neon migration. Báo cáo các lệnh đã chạy, commit SHA, diff, CI và cập nhật handoff với nguồn kiểm chứng.

## Không nhầm lẫn
Kết nối GitHub không có nghĩa ChatGPT giám sát realtime. Hỏi lại trạng thái repository trong mỗi phiên hoặc dùng automation/reporting đã thiết lập. Chỉ công bố thay đổi đã push/merge khi có chứng cứ.
