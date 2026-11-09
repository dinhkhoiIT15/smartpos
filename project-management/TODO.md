# TODO — SmartPOS audit-backed priorities (2026-11-09)

**Source of truth:** [Full 30-task audit](BACKLOG_AUDIT_2026-11-09.md), GitHub issues/PRs/CI. Latest verified main: `95485d09c1210cd90fc3c3a82767b328fbbc34d6` (POS-028 merged).

## Confirmed scoped merges
- [x] POS-001/002/004, POS-007..028 merged to main through PR #54. This includes DESIGN/DEMO/INTERNAL deliverables, not live production authorization.
- [x] POS-007 issue #7 and POS-016 issue #29 bookkeeping closed (merged PRs #8 and #30; owner-reported tests PASS).
- [x] Main Foundation [CI #42642484458](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484458) SUCCESS at `95485d09`.

## Missing M0 acceptance
- [ ] [POS-003 #55](https://github.com/dinhkhoiIT15/smartpos/issues/55) board verification, import/mapping all 30 logical tasks; owner must supply valid Project URL.
- [ ] [POS-005 #56](https://github.com/dinhkhoiIT15/smartpos/issues/56) main currently unprotected; owner/admin must configure and test branch ruleset.
- [ ] [POS-006 #57](https://github.com/dinhkhoiIT15/smartpos/issues/57) documentation audit PR + final docs CI + fresh session handoff verification before close.

## Critical pre-pilot work
- [ ] [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58) late ACK/rebase correctness. Write fail-before/pass-after SQLite restart and idempotency tests; no destructive migration.
- [ ] [SEC-013 #60](https://github.com/dinhkhoiIT15/smartpos/issues/60): D-013 actual authenticated online cashier login, device provisioning/OS-backed signing keys, 4-hour grant, single authorized offline device, shift/revocation/clock evidence. POS-011 design and POS-025 internal session do not cover this.
- [ ] [SEC-009 #61](https://github.com/dinhkhoiIT15/smartpos/issues/61): D-009 encrypted SQLite backup/retention/restore; do not treat POS-013 unencrypted backup helper as production disaster recovery.
- [ ] D-011/D-012: release signing/notarization and refund/cancel/returns operating policy before pilot.

## Work in progress / planned
- [x] [POS-028 PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) MERGED at `95485d09` with corrected `sep` import and UNSIGNED DEMO artifacts. [ ] Verify [native installer post-merge CI #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398), Windows/macOS GUI acceptance and close [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) only after evidence. No signed production release.
- [ ] POS-029: crash/restore and sync-conflict rehearsal — not started.
- [ ] POS-030: production pilot readiness — not started.

**Safety:** no production DB writes, no Neon credential upload, no auto-merges, no deletion of local SQLite/userData.
