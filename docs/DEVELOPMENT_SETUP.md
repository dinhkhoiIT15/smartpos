# Development Setup — trước khi code

**Trạng thái:** M0 documents-only. Các lệnh dưới đây kiểm tra gói M0; **chưa** có API server, Electron app, migration hoặc ứng dụng chạy được.

## 1. Công cụ cần có
- Git và tài khoản GitHub có quyền trên repository đích.
- Node.js **24.x LTS** (theo `.node-version`). Lệnh `node --version` phải hiển thị 24.x.
- pnpm được khóa phiên bản trong `package.json` bằng `packageManager`; có thể dùng Corepack hoặc trình quản lý phiên bản tương thích.
- Trình biên tập mã: VS Code hoặc tương đương (tùy chọn).

## 2. Chép bộ M0 vào repository trống
1. Giải nén gói v1.1; đưa **nội dung** bên trong vào root repository, không chồng lên file có thay đổi khi chưa review.
2. Từ thư mục root chạy:
   ```bash
   node scripts/validate-context.mjs
   node scripts/context-report.mjs
   ```
3. Xem diff: `git status` và `git diff --stat`; không commit `.env` thật hay SQLite file.
4. Tạo nhánh và PR theo [CONTRIBUTING.md](../CONTRIBUTING.md) nếu repository đã có branch chính.
5. Sau merge, xem GitHub Actions và ghi URL run + SHA thực tế vào `DEVELOPMENT_STATUS.md`.

## 3. Điều gì chưa thể chạy?
- `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm db:migrate` cho ứng dụng **chưa tồn tại**.
- `pnpm install` sẽ trở nên hữu ích ở POS-001 khi workspaces và package riêng được triển khai; lúc đó tạo và commit `pnpm-lock.yaml`.
- Database Neon thực sẽ được kết nối trong POS-009; URL phải lưu ở secret quản lý của server, không nằm trong desktop renderer.

## 4. Quy ước môi trường
Xem [ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md). Chỉ dùng dữ liệu giả trong dev/test; không clone thông tin khách hàng thật vào Neon development.

## 5. Khi coding agent tiếp tục
1. Đọc `AGENTS.md` và `project-management/SESSION_HANDOFF.md`.
2. Kiểm tra HEAD và kiểm tra task liên quan trên GitHub; phát hiện tài liệu trạng thái lỗi thời.
3. Chỉ thực hiện issue đã chọn; cập nhật các tài liệu liên quan và test evidence.
