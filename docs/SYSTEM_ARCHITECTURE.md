# System Architecture — v1.0

**Status:** LOCKED BASELINE (logical design, chưa có code thực thi)

## 1. Mô hình
`Electron (main/preload/React renderer) -> SQLite local + Sync Worker -> HTTPS Fastify API -> Neon PostgreSQL`.

- **Electron main:** sở hữu quyền filesystem, SQLite connection và sync worker. Không cho renderer gọi SQL trực tiếp.
- **Preload:** expose các IPC method nhỏ, đã kiểm tra payload; không expose arbitrary file/command.
- **React renderer:** giao diện và state hiển thị, không giữ DB credentials, không dùng Node API.
- **API Fastify:** xác thực, RBAC, kiểm tra payload/domain, idempotency, xử lý transaction.
- **Neon:** nguồn dữ liệu trung tâm đã đồng bộ; không thể đảm bảo đầy đủ trạng thái offline khi chưa ACK.
- **SQLite:** lưu catalog cache, sale local, inventory local, outbox, cursor đồng bộ.

## 2. Monorepo dự kiến
- `apps/desktop`: main, preload, renderer, local-db, sync.
- `apps/api`: auth, products, inventory, sales, sync, reports.
- `packages/contracts`: DTO/versioned schemas + Zod.
- `packages/domain`: logic tính tiền, validate domain thuần.
- `packages/db`: PostgreSQL schema/migrations (và adapter SQLite được tách nếu cần).
- `packages/config`: TypeScript/eslint config chia sẻ.

**Giai đoạn M0 chỉ tạo thư mục tài liệu/placeholder**, không tạo ứng dụng giả chạy được.

## 3. Quyền ghi dữ liệu
- Chính sách MVP: chỉ một POS chính được phép offline checkout; thiết bị khác có thể quản lý dữ liệu khi online theo RBAC, nhưng mọi sửa tồn kho phải được audit và có thể phát sinh sync conflict.
- Catalog/giá/nhân viên do API/Neon quản lý; desktop chỉ cache, không tự cấp quyền chỉnh sửa offline.
- Sale/payment được ghi cục bộ trước (có outbox) và chờ server công nhận khi kết nối lại.
- Server có quyền tạo inventory movement và conflict để giữ audit trail.

## 4. Bảo mật
- Electron: contextIsolation on, nodeIntegration off, sandbox phù hợp, restrictive CSP, validate IPC sender; xem `SECURITY.md`.
- App chỉ gửi HTTPS tới backend, không gọi Neon từ desktop.
- API secrets trong secret store / backend env; không commit .env.
- Quy trình offline authorization là trust boundary riêng: provision một lần online, cache quyền với thời hạn, áp dụng kiểm tra lại khi kết nối.

## 5. Deploy/Infrastructure
- M0–M1: Fastify có thể chạy local; Neon development branch; desktop dev build local.
- M4 trở đi: API HTTPS accessible từ desktop để kiểm thử sync qua internet; hosting cụ thể chưa chốt.
- Neon branches: dev, staging, production theo môi trường; tránh sao chép PII thật sang dev.
- Gói miễn phí không được coi là bảo đảm availability production.

## 6. Mục tiêu chất lượng
Đầu tiên kiểm chứng correctness của transaction, replay và conflict. Sau đó đo benchmark trước khi chốt SLO/performance. Không microservices, message broker hay realtime infrastructure trong MVP.
