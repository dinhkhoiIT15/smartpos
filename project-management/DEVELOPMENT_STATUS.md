# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: 5e4d2928d9b1e2df4ee2f695b8f652e96b71667e
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub commit/issue/PR/CI read-write connector, no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-09
current_milestone: M6 — desktop unsigned installer packaging and provenance
current_phase: POS-028 [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53), [Draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54), feature/POS-028-desktop-packaging. Owner Windows/macOS packaging acceptance PENDING; NOT merged
ci_status: Existing POS-028 Foundation Linux/API + Windows Node24 + ephemeral PG16, Docs and native installer workflows MUST ALL be verified SUCCESS at FINAL feature HEAD; no owner acceptance before SHA-matched run evidence
production_status: NOT DEPLOYED — only UNSIGNED DEMO artifact builds, no public GitHub Releases, no signed/notarized installers, no payment auth. D-011 signing/OS minima/hosting, D-009 backup encryption/restore, D-013 OS keys/Argon2id/offline grant OPEN; SQLite/plain backups and OS ACL risks remain. No Neon writes/migrations

## Owner-verified merged main

- POS-001..POS-026 owner Windows accepted and merged.
- POS-027 [PR #52](https://github.com/dinhkhoiIT15/smartpos/pull/52) owner continued with POS-028; GitHub verified merged into main [`5e4d292`](https://github.com/dinhkhoiIT15/smartpos/commit/5e4d2928d9b1e2df4ee2f695b8f652e96b71667e) at 2026-11-09, [post-merge Foundation CI #42604675859](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42604675859) SUCCESS.
- POS-023 conservative late-ACK stock understatement remains open until dedicated review, and D-012 refunds policy requires owner decision before pilot.

## POS-028 Draft PR #54 (M6/P1)

- `apps/desktop/scripts/stage-demo.mjs`: compiled-only Vite main/preload/renderer build stage and minimal production `package.json` (no runtime npm deps); signed grant or real secrets never enter renderer. Refuse secret files, .env, .sqlite/-wal/-shm, source/maps, symlinks/hardlinks. Version pinned from desktop `0.1.0`, Electron `44.9.3`; refuse unmarked stage deletion. Config copied but excluded from app.asar.
- `apps/desktop/electron-builder.yml`: `asar:true`, native Windows x64 NSIS per-user and macOS Intel x64 + Apple Silicon arm64 DMG/ZIP. Application ID `vn.smartpos.retail.demo`, explicit unsigned (forceCodeSigning false, mac identity null, notarize false), `deleteAppDataOnUninstall:false`, no publish.
- `apps/desktop/package.json`: `package:demo:win`, `package:demo:mac:x64`, `package:demo:mac:arm64` pinned CLI `electron-builder@26.18.1` with short-path flat npm prefix for Windows, pnpm dlx on macOS and `--publish never`, `test:package-demo`; no pnpm-lock or production dependency modification.
- `apps/desktop/scripts/verify-demo-artifacts.mjs`: validates installer magic (PE/PK/DMG), versions, platform, min bytes, creates `SHA256SUMS.txt` and `BUILD_PROVENANCE.json` with 40-hex git HEAD, version/toolchain/UNSIGNED_DEMO_ONLY. SHA alone is not authenticated publisher signature.
- `.github/workflows/demo-installers.yml`: PR/main/manual read-only upload-artifact with 5-day retention, matrix native Windows x64/macOS x64/arm64; no release creation/upload to Releases, signing keys or Neon.
- `apps/desktop/src/main/index.ts`: packaged app always ignores environment-injected `ELECTRON_RENDERER_URL`.
- `apps/desktop/tests/demo-package.test.mjs`, `demo-release-boundary.test.mjs`: stage/symlink/secret/version/manifest and unsigned workflow guards, Linux + Windows Foundation CI.
- [POS-028 acceptance guide](../docs/POS-028_PACKAGING_ACCEPTANCE.md), [ADR-0005 proposed unsigned packaging design](../docs/ADR-0005-unsigned-demo-packaging.md), DECISIONS D-011 OPEN.

## Next

1. Confirm FINAL PR SHA Foundation CI Linux/API, Windows Node24, ephemeral PG16; Documentation CI; dedicated installer workflow: stage and Windows x64 NSIS, macOS x64 DMG+ZIP, macOS arm64 DMG+ZIP all SUCCESS. Fix any failures and recheck after last commit.
2. Owner Windows PowerShell safe tests `pnpm --filter @smartpos/desktop test:package-demo`, `test:security`, `typecheck`, `build`, `pnpm run check`. Optional `package:demo:win` unsigned output. Compare SHA-256, verify demo-only on isolated environment. Never bypass SmartScreen/Gatekeeper just for a PASS.
3. Owner macOS artifact inspection, SHA-256 verification and native demo smoke **only on trusted/signed testing infrastructure** (unsigned Gatekeeper may block, document blocker rather than override). Never put in a live store; no new privileged HTTP, online auth or backup migration.
4. Owner manually accepts/moves PR #54 from Draft to Ready/merges after agreed evidence. Close issue #53 after verified merge. Proceed to POS-029 crash restore and conflict rehearsal, then POS-030 pilot-readiness review with unresolved risks explicitly flagged.
