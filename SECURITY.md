# Báo cáo bảo mật cho SmartPOS

Hướng dẫn kỹ thuật chi tiết nằm tại [docs/SECURITY.md](docs/SECURITY.md).

## Báo cáo vấn đề
- Không công bố token, mật khẩu, Neon URL có credential, dữ liệu bán hàng hoặc dữ liệu khách hàng trong GitHub Issue công khai.
- Nếu repository hỗ trợ **GitHub Security Advisories / private vulnerability reporting**, ưu tiên kênh riêng tư đó.
- Nếu không có kênh bảo mật riêng, liên hệ trực tiếp chủ repository bằng phương thức đã được họ công bố; **không** dán secret trong chat hoặc issue.
- Hiện M0 chưa có API/ứng dụng triển khai; không khẳng định đã kiểm thử bảo mật sản phẩm.

## Nguyên tắc đối với coding agent
- Không truy cập Production nếu chưa được phê duyệt.
- Không yêu cầu người dùng chia sẻ mật khẩu hoặc full connection string qua chat.
- Kiểm tra file thay đổi có chứa dữ liệu nhạy cảm trước khi commit/PR.
