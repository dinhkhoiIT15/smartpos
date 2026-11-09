# TODO — SmartPOS audit-backed priorities (2026-11-09)

**Source of truth:** [Full 30-task audit](BACKLOG_AUDIT_2026-11-09.md), GitHub issues/PRs/CI. Latest verified main: `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e`.

## Confirmed scoped merges
- [x] POS-001/002/004, POS-007..027 merged to main through PR #52. This includes DESIGN/DEMO/INTERNAL deliverables, not live production authorization.
- [x] POS-007 issue #7 and POS-016 issue #29 bookkeeping closed (merged PRs #8 and #30; owner-reported tests PASS).
- [x] Main Foundation CI #42604675859 SUCCESS.

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
- [ ] [POS-028 #53 / Draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54): `sep` Windows packaging bug fixed on feature; final installer CI + owner Windows/macOS GUI smoke still required. No production release.
- [ ] POS-029: crash/restore and sync-conflict rehearsal — not started.
- [ ] POS-030: production pilot readiness — not started.

**Safety:** no production DB writes, no Neon credential upload, no auto-merges, no deletion of local SQLite/userData.
