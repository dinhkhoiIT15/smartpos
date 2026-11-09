# Session Handoff — POS-028 unsigned Windows/macOS DEMO packaging (M6/P1)

## Verified base

- Owner reported POS-027 accepted and proceeded to packaging. GitHub independently verified [PR #52](https://github.com/dinhkhoiIT15/smartpos/pull/52) merged on `main` SHA `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e`, [post-merge Foundation CI #42604675859](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42604675859) SUCCESS.
- POS-028 [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53), [Draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54), feature branch `feature/POS-028-desktop-packaging` from that exact main SHA. NOT merged, Windows/macOS owner acceptance pending.

## Implementation / file map

- No new npm workspace dependency or production runtime requirements. `apps/desktop/package.json` remains `version=0.1.0`, Electron devDependency `44.9.3`; installer CLI pinned `pnpm dlx electron-builder@26.18.1`, NOT in workspace lockfile (transitives not reproducible/locked). Node24/pnpm10.20.0 frozen install.
- `apps/desktop/electron-builder.yml` unsigned DEMO-only appId `vn.smartpos.retail.demo`, ASAR; NSIS win-x64; DMG+ZIP mac-x64 and mac-arm64, `--publish never`, no certs/keychain secrets, `deleteAppDataOnUninstall:false`.
- `apps/desktop/scripts/stage-demo.mjs` stages only `out/main/index.js`, `out/preload/index.js`, Vite `out/renderer`, safe build config and minimal no-deps `package.json` in ignored `.demo-package`. Reject symlink/hardlinks, secrets/raw source/maps/SQLite/WAL/SHM, invalid version/compiled CSP, refuse deletion of unknown folders. Does not touch Electron `userData`. Nonpersistent demo session and IPC guard from POS-027 unchanged.
- `apps/desktop/src/main/index.ts` uses `app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL` to prevent packaged app loading an injected dev Vite URL.
- `apps/desktop/scripts/verify-demo-artifacts.mjs`: check exact filenames/headers and >=1MiB, emit `SHA256SUMS.txt`, `BUILD_PROVENANCE.json`. GitHub source commit is checkout SHA (on PR it can be test merge SHA). Binary/checksum not signed.
- `.github/workflows/demo-installers.yml`: separate native Windows/macOS matrix plus staging tests, artifacts 5-day retention, read-only token; no GitHub Release/production publish. Existing Foundation CI Linux+Windows runs `test:package-demo`, PostgreSQL unchanged.
- [POS-028 acceptance](../docs/POS-028_PACKAGING_ACCEPTANCE.md), [ADR-0005](../docs/ADR-0005-unsigned-demo-packaging.md), D-011 signing not approved.

## Windows safe commands

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-028-desktop-packaging
git pull --ff-only origin feature/POS-028-desktop-packaging
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:package-demo
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm run check
# Optional unsigned user-profile installer, not for public distribution:
pnpm --filter @smartpos/desktop package:demo:win
```

Check generated `apps/desktop/demo-artifacts/SmartPOS-DEMO-0.1.0-win-x64-setup.exe`, SHA256SUMS, BUILD_PROVENANCE; checksum and `UNSIGNED_DEMO_ONLY`. If Windows SmartScreen or macOS Gatekeeper blocks unsigned bundles, record as a blocker, **do not bypass OS security just for GUI acceptance**. No userData deletion, no Neon. Verify installed app uses local packaged file, no Vite server and `DEMO_ONLY` IPC if OS-approved isolated testing permitted.

## Handoff / acceptance boundary

Final feature PR head, final SHA Foundation CI, Docs CI and dedicated packaging matrix MUST be explicitly rechecked before claiming done. Early workflows may be cancelled when docs updates amend PR; do not count cancelled/failing old runs. CI packaging structural PASS is not a signed/notarized native runtime GUI PASS. Owner PASS and manual merge still outstanding. D-009 plaintext SQLite/backup, D-011 signing + toolchain lock/OS versions, D-013 Argon2id/OS private key/shift/clock, POS-023 late ACK and POS-029 crash restore are pilot blockers. Next POS-029 after owner acceptance.
