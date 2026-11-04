# Local Data Backup & Recovery — Thiết kế trước triển khai

**Trạng thái:** DRAFT / POLICY WORK TO BE VERIFIED AT M6. Chưa có cơ chế backup thực tế.

## Dữ liệu cần bảo vệ
Một máy thu ngân có thể giữ `local_sales`, `local_payments`, `local_inventory_balances`, `outbox_events` chưa gửi được Neon. Mất toàn bộ ổ đĩa trước khi đồng bộ sẽ khiến cloud **không thể tự khôi phục** các giao dịch chưa từng nhận.

## Quy tắc bắt buộc khi triển khai
1. SQLite checkout và outbox phải commit atomically; không coi giao dịch hoàn thành trước khi local commit thành công.
2. Không copy thủ công một file `.db` đang mở và bỏ qua WAL; dùng backup API/biện pháp nhất quán đã kiểm thử.
3. Bản backup phải được bảo vệ truy cập, mã hóa theo chính sách được duyệt và đặt ở vị trí không cùng một điểm lỗi với ổ đĩa chính.
4. Không xóa giao dịch/outbox chưa có ACK đã xác minh; retention của dữ liệu đã sync cần ADR riêng.
5. Quy trình restore phải nhận diện `device_id`, ngăn đồng bộ hai bản sao cùng một danh tính thiết bị đồng thời, và dùng idempotency để tránh bán trùng khi replay.
6. Mọi sự cố cần ghi audit: giờ, thiết bị, giao dịch bị ảnh hưởng và kết quả đối soát.

## Kịch bản kiểm thử trước pilot
- Đóng/mở ứng dụng sau khi hoàn tất sale offline.
- Tắt tiến trình khi đang commit (không hiển thị thành công nếu rollback).
- Giả lập mất mạng sau server commit nhưng trước ACK, rồi retry.
- Khôi phục bản sao của SQLite có outbox chưa đồng bộ, thực hiện replay mà không tạo đơn trùng.
- Giả lập hỏng local DB, cảnh báo quản lý và chuyển về quy trình phục hồi; không xóa file ngay.

## Chưa chốt
- Thư viện SQLite, vị trí lưu app data trên Windows/macOS, backup cadence, mã hóa, thời gian lưu và tiêu chí khôi phục (RPO/RTO).
- Phải có quyết định trong POS-013/POS-027 và diễn tập trong POS-029 trước khi chạy pilot thực tế.
