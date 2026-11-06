# TODO — SmartPOS Current Priorities

**Reviewed:** 2026-11-06. GitHub Issues/PRs/actual CI/merged commits are source of truth.

## Merged and verified
- [x] POS-002 / POS-004 (PR #3) — M0 repository structure and documentation CI
- [x] POS-001 (PR #5) — Node/pnpm TypeScript monorepo
- [x] POS-007 (PR #8) — Electron + React demo, Windows GUI launched
- [x] POS-008 (PR #10, Issue #9) — Fastify /v1/health, Windows smoke verified
- [x] POS-009 (PR #12 + #13, Issue #11) — Neon dev read-only SELECT 1 TLS, user verified
- [x] [POS-010 Issue #14](https://github.com/dinhkhoiIT15/smartpos/issues/14) (PR #15) — Zod contracts and pure bigint VND calculations, merged to main `c16382008b17`

## Current
- [ ] [POS-012 Issue #16](https://github.com/dinhkhoiIT15/smartpos/issues/16) — 17-table PostgreSQL v1 schema and migration; [draft PR #17](https://github.com/dinhkhoiIT15/smartpos/pull/17) under review. Disposable CI PostgreSQL verified; **Neon dev migration not executed**. Review and explicit consent required.

## Next M1
- [ ] POS-011 — offline staff/device provisioning design and threat model
- [ ] POS-013 — local SQLite schema and atomic migrations
- [ ] POS-014 / POS-015 — catalog/inventory APIs after reviewed Postgres migration
- [ ] POS-016 — versioned sync API contract after domain and DB

## Outstanding M0 governance
- [ ] POS-003 — import whole backlog and GitHub Project board
- [ ] POS-005 — owner configures main protection/PR governance
- [ ] POS-006 — fresh session handoff drill with GitHub HEAD/CI evidence

**Never run a production migration from this project session. Never share Neon credentials or `.env`.**
