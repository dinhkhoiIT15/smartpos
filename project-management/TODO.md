# TODO — SmartPOS current priorities

**Manual GitHub review:** 2026-11-05. Commits, Issues, PRs and CI (not this file) are the source of truth.

## Merged
- [x] POS-002 / POS-004 (PR #3) — M0 repository and documentation CI
- [x] POS-001 (PR #5) — pnpm TypeScript monorepo
- [x] POS-007 (PR #8) — Electron/React demo shell; user launched on Windows
- [x] POS-008 (PR #10, Issue #9) — Fastify /v1/health; Windows smoke confirmed
- [x] POS-009 (PR #12 + #13, [Issue #11](https://github.com/dinhkhoiIT15/smartpos/issues/11)) — Neon development connectivity, user confirmed read-only SELECT 1 over TLS, issue closed

## In progress
- [ ] [POS-010 #14](https://github.com/dinhkhoiIT15/smartpos/issues/14) — Zod DTOs and bigint VND calculations, [draft PR #15](https://github.com/dinhkhoiIT15/smartpos/pull/15); review lockfile and CI, do not call Done before merge

## Next M1
- [ ] POS-012 — PostgreSQL v1 schema/migrations, depends on POS-009 + POS-010
- [ ] POS-011 — staff auth/offline device provisioning design
- [ ] POS-013 — SQLite local migration, also needs POS-010
- [ ] POS-014/015 — catalog and inventory services, blocked until schema

## Outstanding M0 governance
- [ ] POS-003 — import full backlog and Project board
- [ ] POS-005 — owner configures main branch rules
- [ ] POS-006 — fresh-session handoff verification
