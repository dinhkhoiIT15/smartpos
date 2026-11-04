# Project Overview — SmartPOS Retail

- **Phiên bản baseline:** 1.0, ngày 2026-11-04
- **Đối tượng:** Một cửa hàng điện thoại/điện máy, 4–20 nhân viên.
- **Thiết bị:** Windows/macOS; một máy POS chính duy nhất tạo giao dịch offline.
- **Mục tiêu:** Học tập theo tiêu chuẩn kỹ thuật production; chi phí thấp; chưa phải phát hành thương mại.
- **Bài toán trọng tâm:** Ghi bán tiền mặt bền vững khi không có mạng, đồng bộ an toàn lên Neon PostgreSQL.

## Giá trị
1. Quản lý sản phẩm theo biến thể SKU; quản lý tồn kho và điều chỉnh có lịch sử.
2. Chốt đơn tiền mặt, lưu phiếu nội bộ, theo dõi nhân viên.
3. Kiểm soát giao dịch pending/synced/conflict và đối soát rõ ràng.
4. Duy trì tiến độ xuyên phiên bằng GitHub Issues + tài liệu + kiểm thử.

## Những gì KHÔNG có ở MVP
- IMEI/Serial, bảo hành, sửa chữa, trả góp/QR/thẻ, thanh toán nhiều phần.
- Hóa đơn điện tử, quản lý thuế đầy đủ, kết nối máy in/scan chuyên dụng.
- SaaS/multi-tenant/multi-branch; multi-cashier offline đồng thời.
- Hệ thống trả hàng/hoàn tiền tự động (chưa đủ quy trình để vận hành cửa hàng thật).

## Tiêu chuẩn đầu ra
MVP hoàn thành không đồng nghĩa “production ready”. Production pilot yêu cầu security review, backup/restore rehearsal, dữ liệu thử nghiệm, quy trình hỗ trợ, kiểm thử liên tục và xác nhận tuân thủ pháp lý riêng.
