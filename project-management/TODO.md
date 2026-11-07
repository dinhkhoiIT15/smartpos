# TODO — SmartPOS verified priorities

**Manual status snapshot:** 2026-11-07. GitHub PR/Issue/CI and the actual main SHA remain authoritative.

## Merged and user-accepted milestones
- [x] POS-001 PR #5 — pnpm/Node 24 workspace
- [x] POS-002/POS-004 PR #3 — baseline docs and docs CI
- [x] POS-007 PR #8 — secure Electron demo and Windows acceptance ([Issue #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) still open for bookkeeping)
- [x] POS-008 PR #10 — Fastify health
- [x] POS-009 PR #12/#13 — server-only Neon development read-only TLS check
- [x] POS-010 PR #15 — Zod contracts and bigint VND
- [x] POS-012 PR #17 — PostgreSQL 17-table migration; owner reported 17 tables + Drizzle history on isolated **Neon development**
- [x] POS-013 PR #19 + Windows bugfix #22 — SQLite local schema, Windows runtime and tests accepted (Issues #18/#21 closed)
- [x] POS-011 design PR #23 and owner-approved four-hour grant policy PR #24 — D-010 ACCEPTED, Issue #20 closed **design only**, real authentication and secure OS key storage remain unimplemented D-013/R-005
- [x] [POS-014 PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26) — catalog/variant service with store-scoped SKU, attrs, money, revisions and audit; Windows accepted, [Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25) closed. Verified main `55659902b89e62a542cb5bb6b62a2c61ad3215e0`.

## In progress / waiting for Windows owner acceptance
- [ ] [POS-015 Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27), [draft PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28): PostgreSQL stock balances + append-only movement and reason audit in one transaction, retry idempotency, non-lost concurrent updates, oversell/overflow protection, strict active-role checks and default 404 for unauthenticated API. CI isolated PostgreSQL 16, Windows tests and review required. **No Neon writes/migrations, no actual stock UI.**
- [ ] Verify last PR #28 HEAD CI, then Windows `pnpm --filter @smartpos/api typecheck`, `test:inventory`, `test`, `pnpm --filter @smartpos/db schema:check`, Fastify health and intentional inventory-404. See [guide](../docs/POS-015_INVENTORY_ACCEPTANCE.md).

## Next dependent tasks
- [ ] POS-016 — versioned sync API contract (Zod/OpenAPI, negative cases).
- [ ] POS-017 — catalog to SQLite cache with pull cursor and pending local deltas preserved.
- [ ] POS-018/019/020 — cash cart, atomic local sale/outbox and internal receipt. Do not allow real offline checkout before actual auth/key issuance and tests.
- [ ] POS-021–024 — server idempotent sync, retries, conflict visibility and safe reconciliation (including BR-009 exceptional negative stock).
- [ ] POS-025–030 — real staff RBAC, audit/report, encryption/backup, packaging and production pilot safety.
- [ ] Separately approve real staff login/device provisioning and cryptographic grant verification, OS key storage, clock protection and device transfer proof (D-013).

## M0 governance still OPEN
- [ ] POS-003 GitHub Project board and full issue import
- [ ] POS-005 owner-admin main branch protection/reviewer requirements
- [ ] POS-006 fresh-session handoff rehearsal
- [ ] Resolve old POS-007 Issue #7 if exact IPC acceptance is documented

No production deployment, no real sales/stock data, no secrets, no Neon migrations as part of POS-015.
