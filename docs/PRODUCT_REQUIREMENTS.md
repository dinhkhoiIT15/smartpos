# Product Requirements Document (PRD) — SmartPOS Retail

**ID:** PRD-001 | **Version:** 1.0 | **Status:** LOCKED BASELINE | **Approved from conversation:** 2026-11-04
**Change control:** Chỉ đổi phạm vi đã khóa khi có ADR hoặc change request liên kết issue và được chủ dự án phê duyệt. Baseline được khóa ở mức yêu cầu, chưa có chứng cứ code hoàn thành.

## 1. Người dùng
- **Admin:** cấu hình cửa hàng, tạo tài khoản, quản lý phân quyền.
- **Manager:** quản lý sản phẩm, giá, kho, báo cáo; xử lý ngoại lệ sync.
- **Cashier:** tìm hàng, bán tiền mặt, xem giao dịch bản thân; không tự ý điều chỉnh tồn/giá.
- **Store:** đúng một cửa hàng, một kho logic, một máy thu ngân offline đang hoạt động tại một thời điểm; tối đa khoảng 20 nhân viên.

## 2. Phạm vi chức năng P0
| ID | Yêu cầu | Tiêu chí nghiệm thu tóm tắt |
|---|---|---|
| FR-01 | Đăng nhập, phân quyền | Không cho cashier thay đổi giá/tồn; offline login có policy riêng; mọi giao dịch gắn nhân viên |
| FR-02 | Danh mục hàng, thương hiệu, sản phẩm/biến thể | Mỗi biến thể có SKU duy nhất, thuộc tính màu/dung lượng/kích cỡ; có thể tìm theo tên/SKU |
| FR-03 | Tồn kho | Nhập tồn đầu kỳ, điều chỉnh có lý do, xem số lượng theo SKU; không xóa lịch sử biến động |
| FR-04 | Giỏ hàng | Thêm SKU, số lượng, xóa, tính tổng tiền nguyên VND; validate giá, tồn và số lượng |
| FR-05 | Thanh toán tiền mặt | Nhập tiền khách đưa, tính tiền thừa; hoàn tất có dữ liệu sale/items/payment đầy đủ |
| FR-06 | Phiếu nội bộ | Hiển thị mã đơn, giờ, nhân viên, dòng hàng, tổng tiền, đã thu và tiền thừa; không gắn nhãn hóa đơn VAT |
| FR-07 | Offline checkout | Khi ngắt mạng vẫn chốt được trên máy POS chính; đơn sống sót sau đóng/mở app |
| FR-08 | Đồng bộ | Outbox gửi lại an toàn; một sự kiện tạo nhiều request vẫn chỉ có một sale server; có trạng thái rõ |
| FR-09 | Xung đột | Không xóa đơn đã thu tiền; conflict về kho hoặc giá được ghi và hiển thị để đối soát |
| FR-10 | Báo cáo | Lịch sử bán hàng theo ngày, nhân viên, mặt hàng; phân biệt số liệu local/pending và cloud/synced |
| FR-11 | Audit | Theo dõi người/thiết bị/thời điểm điều chỉnh giá, kho và thao tác nhạy cảm |

## 3. Chính sách baseline P0
- Không IMEI/serial; SKU là đơn vị tồn kho nhỏ nhất.
- Một máy thu ngân được đăng ký làm điểm ghi bán offline; các thiết bị khác, nếu có, không được chốt offline.
- Thanh toán một lần bằng tiền mặt; không xử lý công nợ hoặc trả góp.
- Phiếu bán nội bộ, không thay thế hóa đơn điện tử.
- Ngôn ngữ tiếng Việt; đơn vị tiền VND; timestamp UTC + hiển thị theo Asia/Ho_Chi_Minh.
- Chỉ thực hiện trên Windows/macOS (không yêu cầu tablet/mobile).

## 4. Ngoài phạm vi P0
IMEI/Serial, bảo hành, hoàn/trả/hủy sau thu tiền tự động, multi-branch, multi-tenant, tích hợp máy quét/in chuyên dụng, thanh toán điện tử, hóa đơn điện tử, nhập hàng nhà cung cấp đầy đủ, dashboard realtime nhiều cửa hàng.

## 5. Các luồng nghiệp vụ bắt buộc
1. Tạo sản phẩm + biến thể → nhập tồn ban đầu → hiển thị trong POS.
2. Offline: đăng nhập đã provision → thêm SKU → nhận tiền mặt → lưu giao dịch SQLite transaction → hiện phiếu và pending.
3. Online lại → đồng bộ → kiểm tra idempotency → ghi nhận server và chuyển trạng thái synced.
4. Phát hiện stock conflict → ghi nhận sale đã thu tiền, tạo nhiệm vụ đối soát, không âm thầm ghi đè.
5. Đóng/mở lại app trước khi sync → dữ liệu chưa đồng bộ còn nguyên.

## 6. Phi chức năng
- An toàn dữ liệu: transaction, unique keys, retry, không dùng float cho tiền.
- Bảo mật: IPC giới hạn, bí mật DB không vào renderer, phân quyền server-side, không log secrets.
- Truy vết: mỗi sale có `sale_id`, `device_id`, `cashier_id`, thời gian client và server.
- Bảo trì: migration, unit/integration/e2e test, CI, docs, AI handoff.
- Định lượng performance/SLO chỉ khóa sau benchmark môi trường thật. Không tự cam kết latency hoặc uptime.

## 7. Điều kiện nghiệm thu MVP
- E2E pass cho cả online/offline, restart, retry, duplicate event, stock conflict.
- Nghiệp vụ tiền và kho có integration test chứng minh transaction.
- CI typecheck, lint, tests và build pass sau khi thiết lập.
- Quy trình đối soát sự cố được thử; backup/restore SQLite được diễn tập.
- Mọi tính năng được báo cáo kèm issue/PR/commit/test evidence.

## 8. Điều kiện còn mở (không thay đổi baseline)
- Thư viện SQLite/binding cụ thể, giải pháp desktop packaging/signing và hosting API.
- Thời hạn phiên làm việc offline, quy trình cấp quyền thiết bị và backup cục bộ chi tiết.
- Phương án vận hành trả hàng trước khi chạy cửa hàng thật.
Các quyết định này cần ADR/issue trước khi viết phần code liên quan.
