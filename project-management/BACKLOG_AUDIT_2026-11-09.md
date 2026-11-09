# SmartPOS backlog audit — 2026-11-09

**Updated audit basis:** GitHub `main` SHA `95485d09c1210cd90fc3c3a82767b328fbbc34d6` (POS-028 PR #54 merged); [post-merge Foundation CI #42642484458](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484458) SUCCESS. Initial pre-POS-028 audit baseline was `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e`. This is an evidence snapshot, not an assertion that the app is ready for production. We compared the 30 logical IDs from `project-management/BACKLOG.csv` with actual GitHub PRs/issues/CI and the source tree.

**Counting rule:** `MERGED` means the PR's scoped code/docs reached main; it does NOT certify completed production functionality. `DESIGN`, `DEMO`, `INTERNAL CORE` remain subject to launch gates. A red X on an intermediate PR commit does not invalidate a later successful final-head run.

## Full 30-task reconciliation

| Task | Milestone | Verified scope/state | Issue | PR |
|---|---|---|---|---|
| POS-001 | M0 | MERGED | [#4](https://github.com/dinhkhoiIT15/smartpos/issues/4) | [#5](https://github.com/dinhkhoiIT15/smartpos/pull/5) |
| POS-002 | M0 | MERGED | [#1](https://github.com/dinhkhoiIT15/smartpos/issues/1) | [#3](https://github.com/dinhkhoiIT15/smartpos/pull/3) |
| POS-003 | M0 | OPEN | [#55](https://github.com/dinhkhoiIT15/smartpos/issues/55) | — |
| POS-004 | M0 | MERGED | [#2](https://github.com/dinhkhoiIT15/smartpos/issues/2) | [#3](https://github.com/dinhkhoiIT15/smartpos/pull/3) |
| POS-005 | M0 | OPEN | [#56](https://github.com/dinhkhoiIT15/smartpos/issues/56) | — |
| POS-006 | M0 | IN REVIEW | [#57](https://github.com/dinhkhoiIT15/smartpos/issues/57) | audit PR |
| POS-007 | M1 | MERGED | [#7](https://github.com/dinhkhoiIT15/smartpos/issues/7) | [#8](https://github.com/dinhkhoiIT15/smartpos/pull/8) |
| POS-008 | M1 | MERGED | [#9](https://github.com/dinhkhoiIT15/smartpos/issues/9) | [#10](https://github.com/dinhkhoiIT15/smartpos/pull/10) |
| POS-009 | M1 | MERGED | [#11](https://github.com/dinhkhoiIT15/smartpos/issues/11) | [#12](https://github.com/dinhkhoiIT15/smartpos/pull/12), [#13](https://github.com/dinhkhoiIT15/smartpos/pull/13) |
| POS-010 | M1 | MERGED | [#14](https://github.com/dinhkhoiIT15/smartpos/issues/14) | [#15](https://github.com/dinhkhoiIT15/smartpos/pull/15) |
| POS-011 | M1 | DESIGN MERGED | [#20](https://github.com/dinhkhoiIT15/smartpos/issues/20) | [#23](https://github.com/dinhkhoiIT15/smartpos/pull/23), [#24](https://github.com/dinhkhoiIT15/smartpos/pull/24) |
| POS-012 | M1 | MERGED | [#16](https://github.com/dinhkhoiIT15/smartpos/issues/16) | [#17](https://github.com/dinhkhoiIT15/smartpos/pull/17) |
| POS-013 | M1 | MERGED | [#18](https://github.com/dinhkhoiIT15/smartpos/issues/18) | [#19](https://github.com/dinhkhoiIT15/smartpos/pull/19), [#22](https://github.com/dinhkhoiIT15/smartpos/pull/22) |
| POS-014 | M2 | MERGED | [#25](https://github.com/dinhkhoiIT15/smartpos/issues/25) | [#26](https://github.com/dinhkhoiIT15/smartpos/pull/26) |
| POS-015 | M2 | MERGED | [#27](https://github.com/dinhkhoiIT15/smartpos/issues/27) | [#28](https://github.com/dinhkhoiIT15/smartpos/pull/28) |
| POS-016 | M2 | MERGED | [#29](https://github.com/dinhkhoiIT15/smartpos/issues/29) | [#30](https://github.com/dinhkhoiIT15/smartpos/pull/30) |
| POS-017 | M2 | MERGED | [#31](https://github.com/dinhkhoiIT15/smartpos/issues/31) | [#32](https://github.com/dinhkhoiIT15/smartpos/pull/32) |
| POS-018 | M3 | DEMO/CORE MERGED | [#33](https://github.com/dinhkhoiIT15/smartpos/issues/33) | [#34](https://github.com/dinhkhoiIT15/smartpos/pull/34) |
| POS-019 | M3 | INTERNAL CORE MERGED | [#35](https://github.com/dinhkhoiIT15/smartpos/issues/35) | [#36](https://github.com/dinhkhoiIT15/smartpos/pull/36) |
| POS-020 | M3 | DEMO/CORE MERGED | [#37](https://github.com/dinhkhoiIT15/smartpos/issues/37) | [#38](https://github.com/dinhkhoiIT15/smartpos/pull/38) |
| POS-021 | M4 | INTERNAL CORE MERGED | [#39](https://github.com/dinhkhoiIT15/smartpos/issues/39) | [#40](https://github.com/dinhkhoiIT15/smartpos/pull/40) |
| POS-022 | M4 | INTERNAL CORE MERGED | [#41](https://github.com/dinhkhoiIT15/smartpos/issues/41) | [#42](https://github.com/dinhkhoiIT15/smartpos/pull/42) |
| POS-023 | M4 | INTERNAL CORE MERGED; BUG-023 OPEN | [#43](https://github.com/dinhkhoiIT15/smartpos/issues/43) | [#44](https://github.com/dinhkhoiIT15/smartpos/pull/44) |
| POS-024 | M4 | INTERNAL/DEMO MERGED | [#45](https://github.com/dinhkhoiIT15/smartpos/issues/45) | [#46](https://github.com/dinhkhoiIT15/smartpos/pull/46) |
| POS-025 | M5 | INTERNAL SERVER RBAC MERGED | [#47](https://github.com/dinhkhoiIT15/smartpos/issues/47) | [#48](https://github.com/dinhkhoiIT15/smartpos/pull/48) |
| POS-026 | M5 | INTERNAL/DEMO MERGED | [#49](https://github.com/dinhkhoiIT15/smartpos/issues/49) | [#50](https://github.com/dinhkhoiIT15/smartpos/pull/50) |
| POS-027 | M5 | DEMO HARDENING MERGED | [#51](https://github.com/dinhkhoiIT15/smartpos/issues/51) | [#52](https://github.com/dinhkhoiIT15/smartpos/pull/52) |
| POS-028 | M6 | UNSIGNED DEMO PACKAGING MERGED; GUI/SIGNING STILL OPEN | [#53](https://github.com/dinhkhoiIT15/smartpos/issues/53) | [#54](https://github.com/dinhkhoiIT15/smartpos/pull/54) |
| POS-029 | M6 | PLANNED (not started) | — | — |
| POS-030 | M6 | PLANNED (not started) | — | — |

## Confirmed omissions / regressions

1. **M0 POS-003 [#55](https://github.com/dinhkhoiIT15/smartpos/issues/55):** Project board URL/coverage is not verified; prior M0 report says NOT VERIFIED. GitHub connector in this session cannot create/administer Projects. An owner must verify/create the Project, attach issue tracking, and record its link. Do not falsely claim no Project exists without checking owner settings.
2. **M0 POS-005 [#56](https://github.com/dinhkhoiIT15/smartpos/issues/56):** GitHub `main.protected=false` on 2026-11-09. Connector permissions `admin=false`, so only repository admin can establish enforceable main protection/ruleset and required reviews/checks. Existing PR template/CI alone do not protect main.
3. **M0 POS-006 [#57](https://github.com/dinhkhoiIT15/smartpos/issues/57):** pre-audit `DEVELOPMENT_STATUS.md` points to obsolete `00cb417` and marks POS-027 unmerged; handoff/TODO/traceability/bug tracker are stale. This audit PR updates the tracking snapshot. A clean fresh-session context read and final docs CI are required before closing.
4. **Old issue bookkeeping fixed:** [POS-007 #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) and [POS-016 #29](https://github.com/dinhkhoiIT15/smartpos/issues/29) were still OPEN despite merged PR #8 and PR #30 plus user-reported Windows PASS. Closed as completed on 2026-11-09. Other POS-001..027 issues are closed.
5. **Known stock correctness gap** [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58): if the server inventory PULL delta passes the cursor before a previously lost PUSH ACK arrives, SQLite v1 may retain already-committed sale's negative pending delta and understate available stock. Requires reviewed reconciliation, idempotency and restart tests before live sync.
6. **POS-028 [#53](https://github.com/dinhkhoiIT15/smartpos/issues/53), [draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54):** previously failed native Windows packaging job showed `sep is not defined` in `run-win-builder.mjs` ([run #42609431116](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42609431116)); repaired on feature branch with explicit `node:path` import and regression assertion at feature HEAD `80bba378c3493bc7d166c87c9dffcb38d950b081`. PR #54 was MERGED into main `95485d09` on 2026-11-09; native packaging/GUI acceptance is a separate gate. Foundation and Docs CI on final feature HEAD were SUCCESS ([#42641036215](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42641036215), [#42641036212](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42641036212)). After merge, recheck [post-merge native installer CI #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398) and owner GUI acceptance; do not claim a signed production release.

## Technical scope NOT equivalent to production feature delivery

- POS-011 approved **policy/design only**: signed maximum 4-hour offline cashier grant and one offline device; the live OS-backed key, device proof, grant verifier, clock/shift/revocation are not implemented (D-013).
- POS-025 implements **internal server RBAC/session primitives**, not a complete public password login + cross-platform offline device provisioning.
- POS-018..024 provide demo UI or independently tested MAIN/internal PostgreSQL/SQLite services; real cashier checkout/sync authorization, server endpoints and desktop transport are not enabled for production. Normal privileged API routes intentionally 404.
- D-009 remains OPEN: local SQLite and backups are plaintext; no approved encrypted backup retention/RPO/RTO or verified disaster restore. [SEC-009 #61](https://github.com/dinhkhoiIT15/smartpos/issues/61) tracks completion. D-011 signing/notarization and D-012 refund/returns policy remain OPEN.
- D-013 real online cashier authorization, signed offline device-bound 4h grants and OS key provision are tracked in [SEC-013 #60](https://github.com/dinhkhoiIT15/smartpos/issues/60). POS-011 policy + POS-025 internal staff sessions do not satisfy live FR-01/FR-07.
- POS-029 recovery/conflict rehearsal and POS-030 pilot readiness were never started; they must not be marked done merely because PR #54 produces a DEMO installer.

## Gate/order before new feature tasks

1. Finish POS-006 audit PR: review actual docs CI and fresh handoff, then merge manually and close #57.
2. Repository owner completes POS-005 branch ruleset and POS-003 board verification.
3. Repair/verify BUG-023 with fault-injection and restart scenarios before enabling real PULL/checkout.
4. Address D-009/D-013 through reviewed implementation/decision work; keep real sales and signed production deployment disabled.
5. POS-028 PR #54 was already merged. Recheck native installer output and Windows/macOS owner smoke, D-011 signing/OS policy, then POS-029 and POS-030. An unsigned DEMO installer is NOT a production release.

**Verification scope:** Remote GitHub metadata/files/workflow-job logs checked; no local working tree, Windows/macOS GUI, physical cash transaction, production database or Neon credential was accessed. All unknown owner/admin-only states remain explicitly unverified.
