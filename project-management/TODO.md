# TODO — SmartPOS verified priorities

**Manual GitHub snapshot:** 2026-11-07. Real Issues/PR/CI/commits are source of truth, not this file.

## Merged and validated
- [x] POS-002 / POS-004 (PR #3) — M0 repository and docs CI
- [x] POS-001 (PR #5) — Node/pnpm TypeScript monorepo
- [x] POS-007 (PR #8) — Electron + React demo merged; Windows window launched, **Issue #7 still OPEN pending IPC acceptance**
- [x] POS-008 (PR #10) — Fastify /v1/health; Windows smoke successful, Issue #9 closed
- [x] POS-009 (PR #12 + #13) — Neon DEV SELECT 1 TLS, user verified, Issue #11 closed
- [x] POS-010 (PR #15) — Zod and pure bigint VND contracts, Issue #14 closed
- [x] POS-012 (PR #17) — 17-table PostgreSQL v1 migration, Issue #16 closed; owner confirmed 17 tables and Drizzle journal on development branch only

## In progress
- [ ] [POS-013 Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) — SQLite local schema and migrations in [draft PR #19](https://github.com/dinhkhoiIT15/smartpos/pull/19): Node24 SQLite file-backed CI tests; pending latest CI and Windows Electron IPC/reopen smoke plus ADR review.

## Next M1/M2 (strict dependency order)
- [ ] POS-011 — staff auth / trusted offline-device provisioning design, TTL, revocation, clone/restore threat model (risk R-005). Must complete before offline checkout.
- [ ] POS-014 + POS-015 — catalog SKU/variant API and inventory movements, after merged POS-012.
- [ ] POS-016 — versioned sync API contract, after POS-010/012.
- [ ] POS-017 — catalog cache in SQLite, after POS-013/014.
- [ ] POS-018 + POS-019 — cart/CASH UI and atomic offline sale/outbox only after POS-017, POS-011 auth gates and crash tests.
- [ ] POS-020–030 — receipts, idempotent sync/worker/conflicts, RBAC/report/security, packaging/recovery/production pilot in backlog order.

## Still incomplete: M0 governance
- [ ] POS-003 — import POS-001..030 backlog into GitHub Issues + Project board (only tracked implementation issues created to date).
- [ ] POS-005 — owner/admin configures branch protection, PR review rules and template.
- [ ] POS-006 — fresh-session handoff demonstration with real HEAD and CI.
- [ ] Resolve stale POS-007 open issue once explicit IPC smoke recorded, not simply by assuming PR merge proves all acceptance.

**Never commit local `.sqlite`, `.db`, `-wal`, `-shm`, `.env` or user/customer data. No production pilot yet.**
