# SmartPOS Retail — Project Foundation (M0)

**Status:** Product / architecture baseline v1.0 approved in planning; repository implementation **NOT VERIFIED**.
**Last reviewed:** 2026-11-04. **Language:** Vietnamese. **Currency:** VND. **Time zone:** Asia/Ho_Chi_Minh.

POS ứng dụng desktop phục vụ cửa hàng điện thoại/điện máy, học tập theo tiêu chuẩn production. Một máy thu ngân bán được khi mất internet, lưu SQLite và đồng bộ tới Neon PostgreSQL qua API.

> ĐÂY LÀ GÓI TÀI LIỆU VÀ NỀN TẢNG M0, KHÔNG PHẢI ỨNG DỤNG POS ĐÃ CHẠY. Chưa có API, desktop app, database migration thực thi hoặc unit test nghiệp vụ.

## Bắt đầu
1. Đọc `AGENTS.md` và `docs/PRODUCT_REQUIREMENTS.md`.
2. Đọc `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/OFFLINE_SYNC_DESIGN.md`.
3. Kiểm tra `project-management/DEVELOPMENT_STATUS.md`, `SESSION_HANDOFF.md` và `BACKLOG.csv`.
4. Chạy `node scripts/validate-context.mjs` (yêu cầu Node.js bản LTS hiện hành); chỉ kiểm tra cấu trúc tài liệu M0.
5. Sau khi kết nối GitHub, tạo issue theo `project-management/BACKLOG.csv`, rồi thực hiện POS-001 trước.

## Chưa có gì được triển khai
`apps/desktop`, `apps/api` và `packages/*` chỉ là vị trí dành cho code tương lai. **Không** mô tả bước `npm install`, `pnpm dev`, `migrate` hoặc deploy là sẵn có.

## Sơ đồ tài liệu
- `docs/PRODUCT_REQUIREMENTS.md`: yêu cầu & tiêu chí nghiệm thu.
- `docs/BUSINESS_RULES.md`: quy tắc bán hàng, tồn kho, thanh toán.
- `docs/SYSTEM_ARCHITECTURE.md`: ranh giới thành phần và hệ thống.
- `docs/DATABASE_SCHEMA.md`: lược đồ logic PostgreSQL/SQLite.
- `docs/OFFLINE_SYNC_DESIGN.md`: outbox, retry, idempotency, conflict.
- `docs/SECURITY.md` và `docs/TEST_PLAN.md`: yêu cầu an toàn/kiểm chứng.
- `docs/API_DOCUMENTATION.md`: hợp đồng API dự kiến, chưa thực thi.
- `docs/adr/`: quyết định kiến trúc có lịch sử.
- `project-management/`: roadmap, backlog, trạng thái, nhật ký, bàn giao.

## Nguyên tắc nguồn sự thật
- Git commit + code: trạng thái thực thi; CI: chứng cứ test/build.
- GitHub Issues: task/bug; Pull Request: thay đổi có thể truy vết.
- `DEVELOPMENT_STATUS.md`: snapshot phải ghi commit và thời điểm kiểm chứng; **không** thay thế việc đối chiếu GitHub.
- Khi chưa đọc được repository, ghi `NOT VERIFIED`, không được tự nhận triển khai thành công.

## Điều kiện để bắt đầu M1
M0 hoàn thành khi tài liệu đã được chủ dự án duyệt, code nền tảng được khởi tạo ở các issue POS-001 đến POS-006, validator và CI có chứng cứ chạy thành công trên GitHub.

## Bộ file bổ sung trước khi code — M0 v1.1
- `package.json`, `pnpm-workspace.yaml`, `.node-version` (Node 24): chuẩn bị cấu hình workspace; **chưa** có app dependencies hoặc lockfile.
- `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `tsconfig.base.json`: quy ước mã nguồn đa nền tảng.
- `CONTRIBUTING.md`, `SECURITY.md`, `docs/DEVELOPMENT_SETUP.md`: quy trình PR, an toàn, cách bắt đầu.
- `docs/ENVIRONMENT_MATRIX.md`, `docs/LOCAL_BACKUP_RECOVERY.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/GLOSSARY.md`: bảo vệ offline, truy vết yêu cầu và hỗ trợ người mới.
- `project-management/M0_CHECKLIST.md`, `RISK_REGISTER.md`, `CHANGE_REQUEST.md`, `REPOSITORY_INTAKE.md`: kiểm soát quyết định và bằng chứng tiến độ.
- `node scripts/context-report.mjs`: báo cáo trạng thái cục bộ chỉ đọc, KHÔNG đồng bộ GitHub.
- `.github/workflows/ci.yml` và `.github/workflows/validate-docs.yml`: chỉ chạy check M0. App CI sẽ bổ sung ở POS-001 trở đi.

Tài liệu và gói starter có thể có trước khi repository được kết nối; **không** đồng nghĩa đã commit vào GitHub. Xem [hướng dẫn bắt đầu](docs/DEVELOPMENT_SETUP.md) và [checklist M0](project-management/M0_CHECKLIST.md).


Xem thêm [quy ước code](docs/CODING_CONVENTIONS.md) và [hướng dẫn chuẩn bị Neon](docs/NEON_SETUP.md); chưa có kết nối hoặc migration thật.
