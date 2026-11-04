# Roadmap — SmartPOS

**Version:** 1.0 | **Date:** 2026-11-04 | **State:** PLANNED

| Milestone | Mục tiêu | Exit criteria | Issues |
|---|---|---|---|
| M0 | Foundation & AI context | Repo có cấu trúc, docs đã review, CI docs pass, issue board được tạo | POS-001..POS-006 |
| M1 | App & DB foundation | Electron + Fastify dev boot; Neon dev + SQLite migrations; auth outline | POS-007..POS-013 |
| M2 | Catalog & Inventory | SKU/variants/stock/adjustments có test | POS-014..POS-017 |
| M3 | Local Cash Checkout | Checkout offline + receipt + SQLite atomicity + restart test | POS-018..POS-020 |
| M4 | Sync & Conflict | Push/pull idempotent + conflict management + failure tests | POS-021..POS-024 |
| M5 | Operations/Security | RBAC, reports, audit, security review | POS-025..POS-027 |
| M6 | Pilot Readiness | Packaging, recovery drill, CI E2E, deployment instructions | POS-028..POS-030 |

Milestone không có ngày hoàn thành dự đoán khi chưa biết tốc độ triển khai. Chưa milestone nào đạt exit criteria. GitHub Issues là nguồn task sau khi nhập backlog.
