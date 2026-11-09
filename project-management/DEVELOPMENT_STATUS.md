# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: 95485d09c1210cd90fc3c3a82767b328fbbc34d6
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub read/write PR/CI; repository admin permission FALSE
last_github_synced_at: GITHUB API / PR #59 CONFLICT RESOLUTION 2026-11-09
current_milestone: M0 governance remediation + M6 unsigned DEMO installer merged; pilot NOT approved
current_phase: POS-006 #57 / PR #59 still IN REVIEW; POS-028 #53 / PR #54 MERGED at main 95485d09; BUG-023 #58 and security D-009/D-013 remain OPEN
ci_status: main 95485d09c1210cd90fc3c3a82767b328fbbc34d6 Foundation [#42642484458](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484458) SUCCESS; PR #59 prior HEAD dc50a67c Foundation [#42642055734](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642055734) + Docs [#42642055764](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642055764) SUCCESS; resolve-merge HEAD must re-run. Post-POS-028 merge installer workflow [#42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398) was IN PROGRESS at review
production_status: NOT DEPLOYED / DEMO_ONLY. Real cashier/device offline authentication and transport not enabled; SQLite/backups plaintext, D-009/D-013 OPEN; privileged Fastify routes default 404. NO Neon writes in this audit.

## Verified main and backlog

- POS-001, POS-002, POS-004 and POS-007..POS-028 have corresponding MERGED PRs and scoped implementation evidence. PR #52 POS-027 merged at main `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e` on 2026-11-09, post-merge Foundation CI #42604675859 SUCCESS.
- POS-011 is DESIGN ONLY, POS-018..024 contain DEMO/INTERNAL components, POS-025 uses INTERNAL server sessions, POS-027 does not encrypt local SQLite.
- POS-003 #55 Project board not verified. POS-005 #56 main branch protection is FALSE (owner/admin required). POS-006 #57 context snapshot work remains IN REVIEW.
- POS-007 #7 and POS-016 #29 closed as bookkeeping cleanup after verifying their previous merged PRs and owner acceptance.
- POS-028 [PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) **MERGED** into main `95485d09` on 2026-11-09; [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) still OPEN when inspected. Old Windows `sep is not defined` failure was fixed in feature HEAD `80bba378`. Merged artifact code is UNSIGNED DEMO, not native GUI acceptance or signed production release. Post-merge packaging CI requires independent verification.
- POS-029 and POS-030 PLANNED, not started. [Full task-by-task evidence](BACKLOG_AUDIT_2026-11-09.md).

## POS-028 integrated packaging detail (preserved from prior main handoff)

The following describe compiled-only, intentionally unsigned DEMO packaging and do **not** imply a signed release or GUI acceptance.

- `apps/desktop/scripts/stage-demo.mjs`: compiled-only Vite main/preload/renderer build stage and minimal production `package.json` (no runtime npm deps); signed grant or real secrets never enter renderer. Refuse secret files, .env, .sqlite/-wal/-shm, source/maps, symlinks/hardlinks. Version pinned from desktop `0.1.0`, Electron `44.9.3`; refuse unmarked stage deletion. Config copied but excluded from app.asar.
- `apps/desktop/electron-builder.yml`: `asar:true`, native Windows x64 NSIS per-user and macOS Intel x64 + Apple Silicon arm64 DMG/ZIP. Application ID `vn.smartpos.retail.demo`, explicit unsigned (forceCodeSigning false, mac identity null, notarize false), `deleteAppDataOnUninstall:false`, no publish.
- `apps/desktop/package.json`: `package:demo:win`, `package:demo:mac:x64`, `package:demo:mac:arm64` pinned CLI `electron-builder@26.18.1` with short-path flat npm prefix for Windows, pnpm dlx on macOS and `--publish never`, `test:package-demo`; no pnpm-lock or production dependency modification.
- `apps/desktop/scripts/verify-demo-artifacts.mjs`: validates installer magic (PE/PK/DMG), versions, platform, min bytes, creates `SHA256SUMS.txt` and `BUILD_PROVENANCE.json` with 40-hex git HEAD, version/toolchain/UNSIGNED_DEMO_ONLY. SHA alone is not authenticated publisher signature.
- `.github/workflows/demo-installers.yml`: PR/main/manual read-only upload-artifact with 5-day retention, matrix native Windows x64/macOS x64/arm64; no release creation/upload to Releases, signing keys or Neon.
- `apps/desktop/src/main/index.ts`: packaged app always ignores environment-injected `ELECTRON_RENDERER_URL`.
- `apps/desktop/tests/demo-package.test.mjs`, `demo-release-boundary.test.mjs`: stage/symlink/secret/version/manifest and unsigned workflow guards, Linux + Windows Foundation CI.
- [POS-028 acceptance guide](../docs/POS-028_PACKAGING_ACCEPTANCE.md), [ADR-0005 proposed unsigned packaging design](../docs/ADR-0005-unsigned-demo-packaging.md), DECISIONS D-011 OPEN.

## Release and correctness blockers

- [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58): server stock PULL before late PUSH ACK can understate local stock. Preserve immutable paid sales and pending deltas until a formally tested reconciliation exists.
- D-009 plaintext SQLite/backup encryption, RPO/RTO, device restore; D-013 device/cashier signed 4h grant, real password login and revocation; D-011 signing/notarization; D-012 refund policy — remain unresolved.
- No live authorized checkout, public privileged endpoints, production API transport, Neon writes or userData cleanup is authorized by this audit.

## Immediate next verification

1. Confirm PR #59 conflict-resolution merge commit, final-head Foundation and Docs CI, review and manual merge.
2. Inspect [POS-028 post-merge packaging run #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398) for all three Windows/macOS jobs and SHA256 output; owner to verify native GUI and close #53 only with evidence.
3. Owner/admin review POS-003 [#55](https://github.com/dinhkhoiIT15/smartpos/issues/55) Project board and POS-005 [#56](https://github.com/dinhkhoiIT15/smartpos/issues/56) branch protection; remain not accepted.
4. BUG-023 [#58](https://github.com/dinhkhoiIT15/smartpos/issues/58), SEC-013 [#60](https://github.com/dinhkhoiIT15/smartpos/issues/60), SEC-009 [#61](https://github.com/dinhkhoiIT15/smartpos/issues/61) and D-011/D-012 before any pilot.
