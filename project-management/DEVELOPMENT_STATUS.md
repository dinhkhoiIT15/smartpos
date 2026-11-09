# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: 989a9badc971f84f51a26b7fe9618363d2eb2244
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub read/write repo and CI; admin permission FALSE
last_github_synced_at: GITHUB API 2026-11-09 / SEC-013A base verification
current_milestone: Security SEC-013 #60; proposed unshipped signature verification slice
current_phase: BUG-023 PR #62 MERGED and #58 closed; SEC-013A proposed prototype in feature branch, awaiting CI and owner cryptographic design approval; SEC-009 #61, POS-003 #55, POS-005 #56 and POS-028 GUI #53 remain open
ci_status: main 989a9badc971f84f51a26b7fe9618363d2eb2244 [Foundation #42654918980](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42654918980) SUCCESS; [unsigned DEMO installer #42654918882](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42654918882) queued at baseline verification; verify final SEC-013A PR SHA CI independently.
production_status: NOT DEPLOYED / DEMO_ONLY; D-013 OPEN, D-009 plaintext SQLite/backup, D-011 signing OPEN; privileged Fastify routes default 404 and Electron no real paid IPC. No Neon writes.

## Current verified facts (supersede outdated 2026-11-09 audit references)

- BUG-023 [PR #62](https://github.com/dinhkhoiIT15/smartpos/pull/62) is **MERGED** into main at `989a9bad`; Issue #58 is CLOSED, post-merge Foundation CI [#42654918980](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42654918980) SUCCESS. This protects newly observed server-stock PULL and late-ACK coverage; historic pre-v2 uncertainty still needs trusted remediation.
- SEC-013 [#60](https://github.com/dinhkhoiIT15/smartpos/issues/60) is OPEN. D-010 four-hour offline maximum is owner-approved POLICY; D-013 real OS key, Argon2id login, signed server issuer, protected monotonic clock, shift and revocation are NOT implemented.
- [ADR-0006 proposed grant protocol](../docs/ADR-0006-sec013-offline-grant-crypto-proposal.md) and [SEC-013A acceptance](../docs/SEC-013A_GRANT_PROTOTYPE_ACCEPTANCE.md) are **UNWIRED REFERENCE ONLY** in this feature branch; do not describe as deployed auth. `main` is unchanged until review and merge.
- POS-003 #55 board and POS-005 #56 branch ruleset remain unverified/open; `main.protected=false` at latest GitHub check. SEC-009 #61 encryption and POS-028 #53 desktop GUI acceptance still open.

## Verified main and backlog

- POS-001, POS-002, POS-004 and POS-007..POS-028 have corresponding MERGED PRs and scoped implementation evidence. PR #52 POS-027 merged at main `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e` on 2026-11-09, post-merge Foundation CI #42604675859 SUCCESS.
- POS-011 is DESIGN ONLY, POS-018..024 contain DEMO/INTERNAL components, POS-025 uses INTERNAL server sessions, POS-027 does not encrypt local SQLite.
- POS-003 #55 Project board not verified. POS-005 #56 main branch protection is FALSE (owner/admin required). POS-006 PR #59 was MERGED into main at `2af99303`.
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

- [BUG-023 #58](https://github.com/dinhkhoiIT15/smartpos/issues/58) CLOSED following merged PR #62. SQLite v2 handles newly observed PULL-before-late-ACK movements; **pre-v2 consumed cursor history cannot be automatically inferred**. Never clear unknown reservations.
- D-009 plaintext SQLite/backup encryption, RPO/RTO, device restore; D-013 device/cashier signed 4h grant, real password login and revocation; D-011 signing/notarization; D-012 refund policy — remain unresolved.
- No live authorized checkout, public privileged endpoints, production API transport, Neon writes or userData cleanup is authorized by this audit.

## Next verification / gates

1. Review SEC-013A proposal and verify all six new signature tests + existing D-010 policy reference in Linux/Windows CI on final PR SHA; owner must explicitly approve/modify proposed ADR-0006 before operational implementation.
2. No Electron checkout/sync or real login enabling until key proof, protected clock, session/shift/revocation, Windows/macOS E2E and SEC-009 backup recovery are complete.
3. Owner/admin must close remaining POS-003 #55 / POS-005 #56 governance and POS-028 #53 native GUI acceptance with evidence. POS-029 and POS-030 are not started.
4. No live DB migrations or Neon writes, no userData cleanup, no automatic merge.
