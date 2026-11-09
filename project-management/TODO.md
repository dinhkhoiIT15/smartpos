# TODO — SmartPOS audit-backed priorities (2026-11-09)

**Source of truth:** [Full 30-task audit](BACKLOG_AUDIT_2026-11-09.md), GitHub issues/PRs/CI. Latest verified main: `989a9badc971f84f51a26b7fe9618363d2eb2244` (BUG-023 PR #62 merged).

## Confirmed scoped merges
- [x] POS-001/002/004, POS-007..028 merged to main through PR #54. This includes DESIGN/DEMO/INTERNAL deliverables, not live production authorization.
- [x] POS-007 issue #7 and POS-016 issue #29 bookkeeping closed (merged PRs #8 and #30; owner-reported tests PASS).
- [x] Main Foundation [CI #42654918980](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42654918980) SUCCESS at `989a9bad`.

## Missing M0 acceptance
- [ ] [POS-003 #55](https://github.com/dinhkhoiIT15/smartpos/issues/55) board verification, import/mapping all 30 logical tasks; owner must supply valid Project URL.
- [ ] [POS-005 #56](https://github.com/dinhkhoiIT15/smartpos/issues/56) main currently unprotected; owner/admin must configure and test branch ruleset.
- [x] [POS-006 #57](https://github.com/dinhkhoiIT15/smartpos/issues/57) merged via [PR #59](https://github.com/dinhkhoiIT15/smartpos/pull/59) and issue CLOSED; this handoff updates the audit.

## Critical pre-pilot work
- [x] [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58) fixed in merged PR #62 at `989a9bad` (SQLite v2 new PULL coverage). Pre-v2 historic uncertain stock remains a separate trusted-recovery gate; never auto-clear.
- [ ] [SEC-013 #60](https://github.com/dinhkhoiIT15/smartpos/issues/60): D-013 actual authenticated online cashier login, device provisioning/OS-backed signing keys, 4-hour grant, single authorized offline device, shift/revocation/clock evidence. POS-011 design and POS-025 internal session do not cover this.
- [ ] [SEC-009 #61](https://github.com/dinhkhoiIT15/smartpos/issues/61): D-009 encrypted SQLite backup/retention/restore; do not treat POS-013 unencrypted backup helper as production disaster recovery.
- [ ] D-011/D-012: release signing/notarization and refund/cancel/returns operating policy before pilot.

## Work in progress / planned
- [x] [POS-028 PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) MERGED at `95485d09` with corrected `sep` import and UNSIGNED DEMO artifacts. [ ] Verify [native installer post-merge CI #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398), Windows/macOS GUI acceptance and close [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) only after evidence. No signed production release.
- [ ] POS-029: crash/restore and sync-conflict rehearsal — not started.
- [ ] POS-030: production pilot readiness — not started.

**Safety:** no production DB writes, no Neon credential upload, no auto-merges, no deletion of local SQLite/userData.

## SEC-013A proposed design test slice (unmerged)
- [ ] Owner reviews [ADR-0006](../docs/ADR-0006-sec013-offline-grant-crypto-proposal.md) and makes D-013 technical decision; new Ed25519 verifier is docs-only and is **not** checkout authorization.
- [ ] Verify Linux + Windows CI signed-envelope negative tests and [SEC-013A acceptance](../docs/SEC-013A_GRANT_PROTOTYPE_ACCEPTANCE.md) prior to manual merge; SEC-013 #60 stays OPEN.
