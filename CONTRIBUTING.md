# Hướng dẫn đóng góp — SmartPOS

> Trước khi làm việc, đọc [AGENTS.md](AGENTS.md) và [DEVELOPMENT_STATUS.md](project-management/DEVELOPMENT_STATUS.md). Đây là dự án học tập theo chuẩn production, nhưng M0 mới có tài liệu và scripts kiểm tra.

## Trình tự một thay đổi
1. Chọn một issue `POS-XXX` từ GitHub sau khi đã import backlog; đọc PRD, ADR và tiêu chí nghiệm thu liên quan.
2. Kiểm tra `git status`, `git branch --show-current`, `git rev-parse HEAD`; không ghi trạng thái verified nếu chưa đọc được repository.
3. Tạo nhánh `feature/POS-XXX-short-description` hoặc `fix/BUG-XXX-short-description`; ưu tiên PR nhỏ, có thể review.
4. Nêu phạm vi, thay đổi dự kiến, kiểm thử và rủi ro; không tự ý đổi quyết định `LOCKED`.
5. Cập nhật test và tài liệu liên quan trong cùng PR; không sửa Production/Neon Production nếu chưa được phê duyệt.
6. Chạy `node scripts/validate-context.mjs` và `node scripts/context-report.mjs` ở M0. **Không** mô tả đây là kiểm thử ứng dụng.
7. Điền PR template, ghi lệnh đã chạy/kết quả và test chưa chạy. Chỉ đánh dấu Done khi điều kiện nghiệm thu thực sự đạt, PR merge và CI liên quan thành công.

## Definition of Ready (DoR)
- Có issue, mục tiêu, giới hạn, dependency và acceptance criteria.
- Nếu chạm database/offline/auth, phải tham chiếu ADR hoặc chính sách tương ứng.
- Có kế hoạch test và phương án bảo vệ dữ liệu.

## Definition of Done (DoD)
- Acceptance criteria có bằng chứng; review hoàn tất; CI áp dụng đã thành công.
- Không lộ secret hoặc dữ liệu khách hàng; migration và rollback/forward-fix được review nếu cần.
- `SESSION_HANDOFF.md` và tài liệu bị ảnh hưởng được cập nhật; trạng thái ghi rõ commit/PR khi đã xác minh.
- Không được dùng thông tin của agent như bằng chứng thay thế test, commit hay deploy.

## Quy tắc đặc biệt của POS offline
- Không xóa giao dịch đã thu tiền dù gặp conflict; mọi event phải idempotent.
- Chỉ một máy POS được phép tạo giao dịch offline trong MVP.
- Tách `SQLite` trên thiết bị và `Neon PostgreSQL` trên server; renderer không được truy cập connection string.

## Về mã nguồn mở
Chưa có quyết định cấp phép dự án. **Không** thêm LICENSE giả định. Chủ repository sẽ quyết định public/private và license ở bước quản trị.
