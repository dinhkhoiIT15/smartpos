# ADR-0001 — Desktop Offline-First Modular Monolith

- Date: 2026-11-04
- Status: ACCEPTED (baseline)
- Context: Một cửa hàng điện thoại/điện máy; 1 máy thu ngân offline; người học mới lập trình; ngân sách thấp.
- Decision: Electron + React/Vite + TypeScript; SQLite local; Fastify Node API; Neon PostgreSQL central; Drizzle; monorepo pnpm; modular monolith.
- Rationale: Local SQLite transaction cho sale/outbox, server riêng có validation và giao tiếp DB; TypeScript xuyên suốt giúp bảo trì và làm việc với AI.
- Consequences: thêm công việc desktop packaging/signing, bảo mật IPC và sync hai database; giảm phức tạp microservices.
- Alternatives: PWA + IndexedDB (ít packaging hơn nhưng cần kiểm soát đặc thù offline browser); Next.js-only (không phù hợp khi desktop offline là yêu cầu P0).
- Revisiting: Khi hỗ trợ mobile/web hoặc đa thiết bị offline đồng thời, tạo ADR mới.
