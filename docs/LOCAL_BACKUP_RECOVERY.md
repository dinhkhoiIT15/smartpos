# Local Data Backup & Recovery — Thiết kế trước triển khai

**Trạng thái:** PARTIAL / POS-013 đã có helper snapshot SQLite theo backup API nhưng chưa mã hóa, lập lịch, lưu giữ hay kiểm thử restore cuối cùng. Chính sách production vẫn DRAFT, cần POS-027/POS-029.

## Hiện trạng POS-013 (chỉ cho development)

- Module `apps/desktop/src/main/local-db` dùng `node:sqlite` trong Electron MAIN. Dữ liệu đặt ở `app.getPath('userData')/smartpos-local.sqlite`; SQLite WAL + FULL synchronous, FK bật và migration có journal, không xóa DB khi lỗi.
- Helper `backupLocalDatabase(db, destination)` sử dụng **SQLite Online Backup API** để sao lưu ảnh chụp nhất quán trong khi WAL đang hoạt động, và từ chối ghi đè file backup hiện có.
- Các bản backup thử nghiệm là **CHƯA MÃ HÓA**. Không cho nhân viên sử dụng helper này để sao chép dữ liệu thật sang USB, thư mục chia sẻ hoặc GitHub. Không xem đây là hoàn thành RPO/RTO hay phục hồi vận hành.
- CI chạy kiểm thử tạo snapshot/reopen và transaction rollback trên thư mục tạm. Trước pilot phải thêm sao lưu được mã hóa, cất giữ ngoài thiết bị, thử phục hồi và xử lý device identity khi restore.
- Quyết định kỹ thuật và rủi ro Node 24 SQLite stability 1.2: [ADR-0003](ADR-0003-local-sqlite-driver.md).

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
