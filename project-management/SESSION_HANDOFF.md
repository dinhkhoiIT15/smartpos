# Session handoff — backlog audit / POS-006 (2026-11-09)

## Start here
- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified **main** HEAD: `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e`, POS-027 PR #52 MERGED, [Foundation CI SUCCESS](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42604675859).
- Use [BACKLOG_AUDIT_2026-11-09.md](BACKLOG_AUDIT_2026-11-09.md) as the task-by-task reconciliation, not the previous stale `TODO.md`.
- This audit branch adds tracking/docs only; do not mistake an open PR for a merged fix. Review docs CI on final head before owner merge and closing POS-006 #57.

## Remediation issues
- [#55 POS-003](https://github.com/dinhkhoiIT15/smartpos/issues/55): mapping + Project board URL not verified; owner action required.
- [#56 POS-005](https://github.com/dinhkhoiIT15/smartpos/issues/56): GitHub main `protected:false`, only admin can apply ruleset.
- [#57 POS-006](https://github.com/dinhkhoiIT15/smartpos/issues/57): this status/handoff remediation; pending owner PR review + fresh-session check.
- [#58 BUG-023](https://github.com/dinhkhoiIT15/smartpos/issues/58): late ACK after PULL stock undercount; P0 before pilot.
- [#60 SEC-013](https://github.com/dinhkhoiIT15/smartpos/issues/60): actual device-signed grant and cashier auth before live checkout/sync.
- [#61 SEC-009](https://github.com/dinhkhoiIT15/smartpos/issues/61): encrypted offline backup, recovery and RPO/RTO before pilot.
- GitHub issues #7 (POS-007) and #29 (POS-016) closed after confirming merged implementation evidence.

## In-flight POS-028 is NOT merged
- [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53), [draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54). The old Windows installer job [#42609431116](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42609431116) failed: `sep is not defined` in the Windows electron-builder wrapper; macOS x64/arm64 jobs passed on old head.
- Fix and static regression test were committed to `feature/POS-028-desktop-packaging` (feature SHA `80bba378c3493bc7d166c87c9dffcb38d950b081`); [Foundation](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42641036215) and [Docs](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42641036212) SUCCESS, installer workflow [#42641036325](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42641036325) queued at initial checkpoint. **Verify final native Windows/macOS jobs and artifact SHA-256 before passing.**
- Owner manual desktop GUI / uninstall safety and macOS launch remain necessary. Unsigned DEMO artifacts are not safe production distribution.

## Security/financial blockers
- POS-011 design D-010 maximum 4h grant only; D-013 real device key + clock + online cashier shift/grant not implemented. No production checkout/sync.
- D-009 plaintext SQLite/backup, encryption, retention and restore unknown. POS-029 restoration not executed.
- POS-023 potential stock undercount when ACK arrives after PULL cursor: stop before live rollout; write regression tests and reconciliation design, preserve sales/outbox.
- D-011 signing/notarization and D-012 refund policy unresolved; normal privileged Fastify routes intentionally return 404.

## Next handoff smoke (fresh session + local optional)
1. Read `AGENTS.md`, verified `main` SHA, PR #54 state, Issues #55–#58 and latest CI by SHA.
2. Compare against this audit; do not confuse old failed intermediate commits with final HEAD.
3. In a clean local checkout: `node scripts/validate-context.mjs`, `pnpm run check`, `git status --short`. These commands have NOT been claimed as run by remote GitHub auditing.
4. Record actual owner/admin-only Board/protection evidence; merge documentation via PR only after review.
