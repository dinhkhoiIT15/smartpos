# TODO — SmartPOS Current Priorities

**Manual GitHub review:** 2026-11-05. GitHub Issues/PR/CI are the real source of truth, not this Markdown snapshot.

## Verified merged work
- [x] [POS-002 #1](https://github.com/dinhkhoiIT15/smartpos/issues/1) — M0 structure, merged PR #3.
- [x] [POS-004 #2](https://github.com/dinhkhoiIT15/smartpos/issues/2) — documentation CI, merged PR #3.
- [x] [POS-001 #4](https://github.com/dinhkhoiIT15/smartpos/issues/4) — pnpm TypeScript workspace, merged PR #5.
- [x] [POS-007 #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) — Electron + React demo merged [PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8); user confirmed Windows window opens (IPC button unreported).

## Current PR
- [ ] [POS-008 #9](https://github.com/dinhkhoiIT15/smartpos/issues/9) — Fastify API health endpoint and Node tests proposed in [draft PR #10](https://github.com/dinhkhoiIT15/smartpos/pull/10). CI and Windows health smoke must pass before merge.

## Remaining M0 governance
- [ ] POS-003 — Import backlog into Issues and create GitHub Project board.
- [ ] POS-005 — Owner reviews/protects main and sets PR policy (linked collaborator is not admin).
- [ ] POS-006 — Verify context handoff in fresh session against latest GitHub commit and CI.

## Next M1
- [ ] POS-009 — Neon development credentials through API server only.
- [ ] POS-010 — Shared Zod contracts/domain rules.
- [ ] POS-011 — Offline device authorization/expiry design.

Do not treat a local Fastify liveness probe as proof of Neon, SQLite checkout, payment processing, or sync.
