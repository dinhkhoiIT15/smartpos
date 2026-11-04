# AGENTS.md — SmartPOS AI Development Contract

**Version:** 1.0 | **Status:** APPROVED BASELINE | **Updated:** 2026-11-04

## 1. Vai trò
Bạn là kỹ sư hỗ trợ dự án, không phải nguồn xác nhận duy nhất về trạng thái code. Luôn ưu tiên dữ liệu thật từ commit, issue, PR và kết quả test. Không tự suy đoán rằng repository hoặc dịch vụ đã được kết nối.

## 2. Đọc trước khi làm
1. `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_RULES.md`.
2. `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/OFFLINE_SYNC_DESIGN.md` nếu task ảnh hưởng kiến trúc, dữ liệu hay đồng bộ.
3. `project-management/DEVELOPMENT_STATUS.md`, `SESSION_HANDOFF.md`, `DECISIONS.md`.
4. `git status`, nhánh, HEAD, commit gần nhất, issue/PR liên quan (nếu công cụ cho phép).
5. So sánh HEAD thực tế với `verified_commit` trong status; nếu khác phải xác minh lại, không gọi snapshot là mới nhất.

## 3. Bất biến nghiệp vụ (không tự ý phá vỡ)
- Một cửa hàng; một máy POS được chỉ định có thể tạo đơn offline; các máy còn lại không được đồng thời chốt offline trong MVP.
- Không quản lý IMEI/Serial trong MVP; tồn theo `product_variant`.
- Chỉ thu tiền mặt; chứng từ chỉ dùng nội bộ, không gọi là hóa đơn thuế/hóa đơn điện tử.
- Tiền VND lưu kiểu integer 64-bit trong cả SQLite và PostgreSQL; không dùng float.
- Đơn bán đã thu tiền là bằng chứng bất biến; không xóa vì lỗi sync, không tự cập nhật giá đã bán.
- Ghi local `sale + items + payment + stock delta + outbox event` trong một SQLite transaction.
- Ghi server `sale + items + payment + stock movement + sync receipt` trong một PostgreSQL transaction có idempotency.
- Khi conflict tồn kho, giữ lịch sử bán đã thu tiền, đánh dấu cần đối soát; không âm thầm xóa/gộp.
- Không kết nối Neon trực tiếp từ renderer; credential chỉ ở backend.

## 4. Quy tắc kỹ thuật
- Stack được đề xuất: pnpm workspace; Electron + React/Vite + TypeScript; Fastify API; SQLite local; Neon/PostgreSQL + Drizzle server; Zod contracts; Vitest/Playwright.
- Modular monolith, ưu tiên code đơn giản và có giải thích cho người mới.
- Mọi thay đổi DB phải có migration, rollback/forward-fix plan, không sửa dữ liệu Production khi chưa có phê duyệt.
- Electron renderer: `contextIsolation=true`, `nodeIntegration=false`, sandbox khi thích hợp; IPC whitelist có validate sender và payload.
- Không commit `.env`, token, connection string, mật khẩu, dữ liệu khách hàng hoặc database local.
- Không thêm dependency lớn hoặc thay đổi kiến trúc đã khóa nếu chưa lập ADR và nhận xác nhận.

## 5. Workflow mỗi issue
1. Nêu `Issue ID`, mục tiêu, acceptance criteria, file bị ảnh hưởng, rủi ro và bài test.
2. Tạo nhánh `feature/POS-XXX-short-name` (hoặc `fix/BUG-XXX-*`).
3. Thực hiện phần nhỏ nhất đáp ứng tiêu chí, thêm test tương ứng.
4. Chạy các kiểm tra **thực sự có trong repository**; không giả định script tồn tại.
5. Báo cáo file thay đổi, lệnh test, kết quả, test chưa chạy và các rủi ro.
6. Tạo PR, liên kết issue, chỉ cập nhật Done khi merge và đạt điều kiện nghiệm thu.
7. Cập nhật `SESSION_HANDOFF.md`, những tài liệu bị ảnh hưởng và snapshot `DEVELOPMENT_STATUS.md` sau khi đối chiếu commit.

## 6. Quy trình giữa các phiên
- Đầu phiên: đọc status + handoff + kiểm tra GitHub/HEAD + xác nhận divergence.
- Cuối phiên: viết `SESSION_HANDOFF.md` theo template; đặt `verified_commit` đúng khi có commit đã xác minh, nếu không `NOT VERIFIED`.
- `BACKLOG.csv` là kế hoạch khởi tạo, GitHub Issues sẽ là nguồn task/bug chính sau khi import.
- `CHANGELOG.md` ghi thay đổi **đã tích hợp**, không ghi ý tưởng như đã phát hành.
- Nếu không có quyền truy cập repository/API, báo giới hạn cụ thể và bàn giao patch hoặc file, tuyệt đối không claim đã push, run CI, migrate hoặc deploy.

## 7. Definition of Done
- Acceptance criteria được chứng minh.
- Có test phù hợp (bao gồm retry/crash/concurrency khi liên quan sync hoặc tồn kho).
- Code review và CI pass (khi CI đã thiết lập).
- Migration/version compatibility được kiểm tra nếu có đổi schema.
- Tài liệu + handoff cập nhật cùng PR, không có secrets.
- `DEVELOPMENT_STATUS` phản ánh commit đã xác minh, không dựa vào câu nói của AI.

## 8. Tài liệu phục vụ M0 và source-of-truth bổ sung
- `CONTRIBUTING.md`: DoR/DoD và quy trình PR.
- `docs/REQUIREMENTS_TRACEABILITY.md`: mapping yêu cầu ↔ issue/test dự kiến.
- `docs/LOCAL_BACKUP_RECOVERY.md`: rủi ro bảo toàn dữ liệu offline.
- `project-management/RISK_REGISTER.md` và `M0_CHECKLIST.md`: các điều kiện chưa được kiểm chứng.
- `scripts/context-report.mjs`: báo cáo cục bộ chỉ đọc; **không** truy vấn GitHub, Neon hay CI.
- Node 24.x và pnpm được khai báo ở root config cho M0. POS-001 vẫn chưa DONE trước khi xác minh workspace, lockfile và các package thực tế.
- File `generate-status.ts` trong sơ đồ ý tưởng được thay bằng script **read-only** `context-report.mjs` ở M0 để không phát sinh trạng thái sai; tự động tạo snapshot từ GitHub sẽ xây sau khi có quyền và dữ liệu thật.
- `docs/CODING_CONVENTIONS.md`, `tsconfig.base.json`: quy chuẩn TypeScript trước khi code; cấu hình riêng cho Electron/API sẽ do POS-001/007/008 tạo.
- `docs/NEON_SETUP.md`: checklist Neon theo nguyên tắc không lộ credential; không tự động tạo database.
