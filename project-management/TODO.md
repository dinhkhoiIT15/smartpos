# TODO — SmartPOS verified priorities

**Manual snapshot:** 2026-11-07. Actual GitHub main/PR/Issues/CI are authoritative.

## Merged and accepted
- [x] POS-001 PR #5 — Node 24/pnpm 10.20.0 monorepo
- [x] POS-002/004 PR #3 — approved baseline docs and docs CI
- [x] POS-007 PR #8 — secure Electron shell Windows accepted ([Issue #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) still open for bookkeeping)
- [x] POS-008 PR #10 — Fastify `/v1/health`
- [x] POS-009 PR #12/13 — server-only Neon development read-only TLS probe
- [x] POS-010 PR #15 — Zod + canonical BIGINT VND contracts
- [x] POS-012 PR #17 — 17-table PostgreSQL Drizzle migration v1, applied manually by owner to **Neon development only**
- [x] POS-013 PR #19/BUG-013 PR #22 — local SQLite schema, WAL/Windows handle-cleanup accepted, Issues #18/#21 closed
- [x] POS-011 design PRs #23/#24 — 4-hour grant D-010 approved, Issue #20 closed **DESIGN ONLY**; real staff/device keys not yet implemented
- [x] POS-014 PR #26 — catalog/SKU/variant service, owner Windows accepted, Issue #25 closed; default HTTP catalog route disabled without auth
- [x] POS-015 [PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28) — atomic inventory balance/movement/audit, idempotent stock adjustment, CI PostgreSQL 12/12, owner Windows accepted; [Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27) closed. Verified `main`: `269f035da106e1ec6787e95c8fd9f91967b7599a`.

## Current POS-016 review, not yet merged
- [ ] [Issue #29](https://github.com/dinhkhoiIT15/smartpos/issues/29) and [draft PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30) — strict Zod v1 `SALE_COMPLETED` immutable CASH snapshots, hash integrity, bounded push batches, receipt-replay and ACK/review/retry contracts, pull cursor/watermark pages, checked JSON fixtures and OpenAPI 3.1. **No live HTTP sync, DB receipt transaction or desktop worker**.
- [ ] Latest PR #30 head CI green (full contracts tests, Node/TS, Fastify, Electron, Windows SQLite, disposable PostgreSQL and docs), owner Windows `contracts typecheck`, `contracts test`, `pnpm run check`, health and intentional sync-404 smoke. Review/merge, then close Issue #29.
- [ ] Explicitly retain future POS-023 stock delta materialization gap: POS-015 manual stock adjustments do not yet emit `catalog_change_log` entries; pull contract alone does not deliver updated stock.

## Later milestones and security gates
- [ ] POS-017 — cache catalog into local SQLite with cursor; don't wipe pending unsynced local sales/stock.
- [ ] POS-018/019/020 — cart/cash sale/outbox atomic SQLite checkout/internal receipt; **real** offline authorization must exist before allowing checkout.
- [ ] POS-021–024 — idempotent server cash sale sync, retry, versioned pull and conflict/audit resolution; preserve paid sale after errors.
- [ ] POS-025 — staff authentication/RBAC implementation, server audit; D-013 grant/key/clock/storage decisions and R-005 still open.
- [ ] POS-026–030 — accurate reports, backup encryption/recovery, secure builds, pilot gating; D-009 storage encryption not yet approved.

## M0 governance outstanding
- [ ] POS-003 GitHub Project board and backlog import
- [ ] POS-005 protect `main` with owner-admin PR checks
- [ ] POS-006 fresh context handoff verification
- [ ] Resolve old POS-007 Issue #7 with owner evidence

Never share `.env`, token, DB connection URL, local SQLite, hashes of real transactions or Neon credentials. No production/Neon DB migration under POS-016.
