# TODO — SmartPOS M0 priorities

**Reviewed:** 2026-11-04. GitHub Issues are the task source of truth. This file is a manually reviewed summary, **not** an automatic synchronization.

## Verified completed / merged
- [x] [POS-002 / Issue #1](https://github.com/dinhkhoiIT15/smartpos/issues/1) — Repository dotfile/template structure repaired in [merged PR #3](https://github.com/dinhkhoiIT15/smartpos/pull/3).
- [x] [POS-004 / Issue #2](https://github.com/dinhkhoiIT15/smartpos/issues/2) — M0 documentation CI restored, checks passed on PR #3; issue closed.

## Current work
- [ ] [POS-001 / Issue #4](https://github.com/dinhkhoiIT15/smartpos/issues/4) — Initialize pinned pnpm/TypeScript workspace. [PR #5](https://github.com/dinhkhoiIT15/smartpos/pull/5) under review; do not call Done until CI passes and PR merges.

## Remaining M0
- [ ] POS-003 — Import backlog and create GitHub Project board (30 planned tasks in `BACKLOG.csv`, not all created as GitHub Issues yet).
- [ ] POS-005 — Owner reviews branch protection/PR process. Linked account has no admin rights.
- [ ] POS-006 — End-to-end AI handoff after checking the latest merged commit + CI evidence.

## Next recommendation
Check PR #5 CI on its latest head; fix frozen install/typecheck errors if any, review, squash merge and then refresh `DEVELOPMENT_STATUS.md` against actual `main`.
