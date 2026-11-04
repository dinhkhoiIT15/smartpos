# Business Rules — v1.0

| Rule | Quy tắc |
|---|---|
| BR-001 | Mỗi `product_variant` có SKU duy nhất trong cửa hàng, SKU không tự đổi khi lịch sử bán đã tham chiếu. |
| BR-002 | Số tiền tính bằng `BIGINT` VND; số lượng bán là integer dương; giá không âm; tiền nhận >= phải thu; tiền thừa = tiền nhận - phải thu. |
| BR-003 | Đơn đã hoàn tất thu tiền không được xóa/chỉnh sửa dòng hàng; sửa sai bằng nghiệp vụ điều chỉnh/hoàn trả sau này. |
| BR-004 | `sale_items` lưu bản sao tên, SKU, attributes, đơn giá và chiết khấu lúc bán. |
| BR-005 | Nhân viên cashier không tự ý đổi giá/điều chỉnh kho. Các thay đổi cần đúng quyền và audit. |
| BR-006 | Một POS được chỉ định tạo đơn offline; các máy còn lại không có quyền offline checkout trong MVP. |
| BR-007 | Khi không có mạng, đơn đã lưu local với outbox có thể là `PENDING`; không gọi là đã ghi thành công trên Neon. |
| BR-008 | Đồng bộ lặp lại cùng event phải trả cùng kết quả, không tạo đơn/payments/movements trùng. |
| BR-009 | Nếu kho server không đủ khi đồng bộ sau bán, vẫn bảo tồn chứng cứ sale tiền mặt; server ghi movement và conflict đối soát, có thể âm tồn theo chính sách kiểm soát. |
| BR-010 | Thay đổi giá trên server không thay đổi các đơn offline đã thu tiền. Divergence giá cần audit/đối soát. |
| BR-011 | Không xuất hóa đơn điện tử / VAT; phiếu nội bộ không được ghi nhãn như chứng từ thuế hợp lệ. |
| BR-012 | Ngày bán hiển thị theo `Asia/Ho_Chi_Minh`, lưu `timestamptz` UTC trên server. |
| BR-013 | Không hỗ trợ sửa/hủy giao dịch sau thanh toán như quy trình tự động trong MVP; phải có quy trình vận hành tạm thời trước pilot thực tế. |

## Ví dụ nghiệp vụ
SKU A giá 8.990.000 VND, SL 1; SKU B giá 350.000 VND, SL 1. Tổng phải thu 9.340.000 VND. Nhận 9.500.000 VND => tiền thừa 160.000 VND. Mọi phép tính dùng integer.

## Lưu ý nghiệp vụ điện thoại/điện máy
Không quản lý IMEI/serial đồng nghĩa chưa đủ để truy xuất từng thiết bị, thực hiện bảo hành theo serial hoặc quản lý hàng đặc thù. Đây là giới hạn có chủ đích của MVP học tập.
