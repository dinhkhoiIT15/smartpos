# Bug Tracker — GitHub is source of truth

**Reviewed 2026-11-09** against main `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e`. Reproduction and acceptance should live in linked GitHub issues. Do not record old failing intermediate CI as an unresolved bug if final HEAD passed.

| Issue | Severity | State | Evidence / owner action |
|---|---|---|---|
| [BUG-013 #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) | Windows test teardown | CLOSED | [PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) merged; SQLite handle cleanup fix; no longer a current blocker. |
| [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58) | P0 correctness before pilot | OPEN | Late server stock PULL delta before lost PUSH ACK can retain an already applied negative local delta. Requires reviewed durable reconciliation + tests. |
| [POS-028 PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) packaging error | M6 release gate | IN VERIFICATION | [Windows job #42609431116](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42609431116) failed `sep is not defined` on old feature HEAD. Explicit import + regression test committed to branch at `80bba378`; latest installer run must pass before merge. |

See [full backlog audit](BACKLOG_AUDIT_2026-11-09.md), [development status](DEVELOPMENT_STATUS.md), and [risk register](RISK_REGISTER.md). Do not use this tracker as a substitute for current CI/issue state.
