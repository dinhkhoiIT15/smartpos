# Neon PostgreSQL — Checklist chuẩn bị môi trường

**Trạng thái:** KẾ HOẠCH. M0 chưa tạo/đăng nhập tài khoản Neon và chưa kết nối database thực tế.

## Quy trình dành cho chủ dự án
1. Tạo/kiểm tra Neon project riêng cho SmartPOS, đặt khu vực cloud phù hợp, quan sát chi phí trong dashboard.
2. Chuẩn bị development branch/database để thử migration bằng dữ liệu giả. Staging/production sẽ tạo khi cần thực sự.
3. Tạo credential riêng với quyền tối thiểu cho API development; giữ trong file `.env` trên máy hoặc secret manager, tuyệt đối không copy vào repo/ChatGPT.
4. Ghi **tên** môi trường và phương pháp cấp secret, không ghi giá trị secret, vào `docs/ENVIRONMENT_MATRIX.md` hoặc phần cấu hình runtime khi implement.
5. POS-009: API server xác minh kết nối bằng health/check không trả về connection string; ghi test evidence trong issue/PR.
6. POS-012: Drizzle migrations được review, chạy trên Neon development, kiểm tra constraints/index/transaction. Không apply Production từ coding agent không có phê duyệt.

## Lưu ý
- Desktop/Electron renderer không được biết `DATABASE_URL`; chỉ API server kết nối Neon.
- Database branch không được coi là Git branch được merge trực tiếp; thay đổi schema đi qua migration được version hóa.
- Với Free plan, chủ dự án theo dõi quota và nhánh đang hoạt động; không giữ branch test không dùng đến.
- Test độ sẵn sàng backup/restore riêng; Neon branching không thay thế kế hoạch phục hồi dữ liệu offline trên máy POS.
