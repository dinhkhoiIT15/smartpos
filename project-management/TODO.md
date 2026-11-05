# TODO — SmartPOS current priorities

**Manual review:** 2026-11-05. GitHub Issues and merged commits are the real source of truth; this file is an informational snapshot, not automatic sync.

## Merged on main
- [x] [POS-002 #1](https://github.com/dinhkhoiIT15/smartpos/issues/1) — repository layout repaired; [PR #3](https://github.com/dinhkhoiIT15/smartpos/pull/3) merged.
- [x] [POS-004 #2](https://github.com/dinhkhoiIT15/smartpos/issues/2) — CI M0 documents repaired; PR #3 merged.
- [x] [POS-001 #4](https://github.com/dinhkhoiIT15/smartpos/issues/4) — pnpm/TypeScript monorepo with six packages; [PR #5](https://github.com/dinhkhoiIT15/smartpos/pull/5) merged to main SHA `07aa1ea8`.

## In progress
- [ ] [POS-007 #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) — Secure Electron + React/Vite Desktop demo in [draft PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8), pending latest CI and Windows/macOS GUI smoke confirmation.

## Remaining M0 governance
- [ ] POS-003 — Import the planned backlog and establish a GitHub Project board.
- [ ] POS-005 — Owner confirms main protection / PR review rules (collaborator has no admin rights).
- [ ] POS-006 — Fresh-session handoff verification against main SHA, latest CI and active issue.

## Next M1
- [ ] POS-008 — Fastify API + `/v1/health` endpoint once desktop bootstrap is reviewed; can be developed in a separate branch.
- [ ] POS-009 — Neon development database server-only credentials, no connection from Electron renderer.
- [ ] POS-010 — Shared contracts/domain, and POS-011 offline device auth design.

**Do not treat an Electron dashboard screenshot as proof of cash checkout, SQLite persistence or cloud sync.**
