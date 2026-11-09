# Bug Tracker — GitHub is source of truth

**Reviewed 2026-11-09** against main `95485d09c1210cd90fc3c3a82767b328fbbc34d6`. Reproduction and acceptance should live in linked GitHub issues. Do not record old failing intermediate CI as an unresolved bug if final HEAD passed.

| Issue | Severity | State | Evidence / owner action |
|---|---|---|---|
| [BUG-013 #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) | Windows test teardown | CLOSED | [PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) merged; SQLite handle cleanup fix; no longer a current blocker. |
| [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58) | P0 correctness before pilot | OPEN | Late server stock PULL delta before lost PUSH ACK can retain an already applied negative local delta. Requires reviewed durable reconciliation + tests. |
| [POS-028 PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) packaging error | M6 unsigned DEMO | FIX MERGED, NATIVE GUI VERIFICATION SEPARATE | [Windows job #42609431116](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42609431116) failed `sep is not defined` on old feature HEAD. Explicit import + regression test at `80bba378` was merged in PR #54 at main `95485d09`; [post-merge packaging CI #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398) and owner GUI acceptance must be rechecked. |

See [full backlog audit](BACKLOG_AUDIT_2026-11-09.md), [development status](DEVELOPMENT_STATUS.md), and [risk register](RISK_REGISTER.md). Do not use this tracker as a substitute for current CI/issue state.
