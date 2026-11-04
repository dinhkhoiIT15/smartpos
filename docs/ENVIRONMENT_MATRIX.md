# Environment Matrix — SmartPOS

**Mục tiêu:** Không trộn môi trường phát triển với dữ liệu bán hàng thật.

| Nơi chạy | Vai trò | Database | Credential | Trạng thái M0 |
|---|---|---|---|---|
| Developer workstation | M0 docs, sau này Electron + API dev | SQLite local + Neon development | `.env` local/secret store, không commit | Chưa kết nối |
| CI GitHub | Kiểm tra docs, sau này lint/test/build | Test DB ephemeral hoặc Neon branch riêng | GitHub Actions secrets/identities khi cần | Chỉ docs workflow là cấu hình |
| Staging | Kiểm tra đồng bộ/khôi phục | Neon staging + SQLite test | Secret môi trường staging | Chưa tạo |
| Production | Vận hành thực tế sau pilot approval | Neon production + SQLite trên POS | Quyền tối thiểu, không cấp cho agent mặc định | Chưa triển khai |

## Biến môi trường dự kiến
- `DATABASE_URL`: chỉ trong API process; định nghĩa thực tế xác nhận ở POS-009.
- `API_PORT`: cổng lắng nghe của API.
- `API_BASE_URL`: đường dẫn công khai của API cho desktop; **không chứa thông tin DB**.
- Auth secret, device binding, token lifecycle: chưa có ở M0; chốt ở POS-011.

## Quy tắc database change
- Mỗi schema change đi qua migration có review; migration không được thay thế bằng sửa dashboard thủ công.
- Neon database branching là môi trường tách biệt, không tự động hợp nhất schema như nhánh Git; áp migration đã kiểm thử vào từng môi trường.
- Sao lưu/khôi phục phải được kiểm tra; database branching không thay thế backup và diễn tập restore.
- Từ chối đưa URL credential thật hoặc sample dữ liệu nhạy cảm vào commit, issue, PR hay hội thoại.

## Quy tắc release
- M0: chỉ source/docs.
- M1-M5: development/test bằng dữ liệu giả.
- M6: review bảo mật, vận hành, phục hồi và dữ liệu; chỉ pilot thật khi phê duyệt rõ ràng.
