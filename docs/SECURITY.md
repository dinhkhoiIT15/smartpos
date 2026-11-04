# Security Baseline — v1.0

## Bắt buộc
1. Renderer Electron `contextIsolation=true`, `nodeIntegration=false`, sandbox khi tương thích; restrictive Content Security Policy, kiểm tra IPC sender và payload. Không chạy nội dung remote không tin cậy trong renderer ưu tiên cao.
2. Renderer không nhận DB URL, API secret, full filesystem access. Kết nối Neon chỉ tại API server.
3. API xác thực token/session, RBAC theo vai trò, store scope; kiểm tra device trước sync; revalidate trường nhạy cảm server-side.
4. Secrets trong `.env` không commit; chỉ dùng `.env.example` giả. Không in secret trong log/test/PR.
5. Password hash dùng thuật toán an toàn được lựa chọn ở ADR (ví dụ Argon2id); không lưu plaintext password trên máy.
6. Offline session có expiration và device provision, không cho tự tạo nhân viên offline; thời hạn cụ thể chốt trước triển khai auth.
7. Audit các thay đổi giá/kho, sync quarantine, quyền tài khoản. Tránh ghi PII không cần thiết.
8. Schema validation, SQL parameterization qua ORM, giới hạn request, pagination và rate limiting ở API.
9. Tách Neon dev/staging/production; migration production yêu cầu approval và kiểm tra backup/restore.
10. Định kỳ cập nhật dependencies, scan vulnerabilities, test backup restore, document security incidents.

## Incident & quyền AI
Coding agent không có quyền truy xuất hoặc sửa dữ liệu Production mặc định. Bất kỳ thao tác xóa/bulk update hoặc thay đổi migration destructive cần người quản lý xác nhận và ghi issue + kế hoạch rollback.

## Nguồn tham khảo
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
