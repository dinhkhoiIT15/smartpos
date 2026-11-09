# Session Handoff — SEC-013A proposal, 2026-11-09

## GitHub verified baseline

- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified `main` HEAD: `989a9badc971f84f51a26b7fe9618363d2eb2244` after [BUG-023 PR #62](https://github.com/dinhkhoiIT15/smartpos/pull/62) MERGED; [Foundation CI #42654918980](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42654918980) SUCCESS. Issue #58 CLOSED.
- SEC-013 #60 remains OPEN. [ADR-0006](../docs/ADR-0006-sec013-offline-grant-crypto-proposal.md) is PROPOSED and D-013 remains OPEN. An internal docs-only Ed25519 grant signature prototype is NOT a live auth gate, not wired to Electron/API, and may need protocol changes on owner review.
- [SEC-013A acceptance](../docs/SEC-013A_GRANT_PROTOTYPE_ACCEPTANCE.md) lists Windows/Linux checks; verify final PR commit and CI. Do not infer successful native Windows/macOS E2E from a Node cryptographic test.
- Owner action [POS-003 #55](https://github.com/dinhkhoiIT15/smartpos/issues/55) board and [POS-005 #56](https://github.com/dinhkhoiIT15/smartpos/issues/56) main protection: not yet verified. [SEC-009 #61](https://github.com/dinhkhoiIT15/smartpos/issues/61) encrypted backup/restore and [POS-028 #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) GUI acceptance still open.

## Security next gates

1. Review/approve key protocols: Windows CNG/TPM, macOS Keychain/Secure Enclave, fallback restrictions, grant issuer key rotation, monotonic clock state, 4-hour grant, one-device transfer, shift idle lock, revoke/logout, key-loss restore.
2. SEC-013B: server Argon2id login/re-auth and verified staff session issuance (ephemeral PG and rate-limit tests).
3. SEC-013C/D: OS proof and signed grant issuance + MAIN offline verifier only after approved key/clock design. No renderer secrets, checkout without signed grant, or hidden API exposure.
4. SEC-013E: server verified sync transport + Windows/macOS real E2E, expired/revoked/rollback cases; keep paid sale/outbox immutable.
5. D-011 signing and D-009 backup encryption remain release gates. POS-029/POS-030 not begun. Do not migrate Neon or auto-merge.

## Existing POS-028 unsigned DEMO packaging notes (retained)

### Packaging implementation preserved from previous main handoff

- No new npm workspace dependency or production runtime requirements. `apps/desktop/package.json` remains `version=0.1.0`, Electron devDependency `44.9.3`; installer CLI pinned `electron-builder@26.18.1` via flat short-path npm prefix for Windows and pnpm dlx for macOS, NOT in workspace lockfile (transitives not reproducible/locked). Node24/pnpm10.20.0 frozen install.
- `apps/desktop/electron-builder.yml` unsigned DEMO-only appId `vn.smartpos.retail.demo`, ASAR; NSIS win-x64; DMG+ZIP mac-x64 and mac-arm64, `--publish never`, no certs/keychain secrets, `deleteAppDataOnUninstall:false`.
- `apps/desktop/scripts/stage-demo.mjs` stages only `out/main/index.js`, `out/preload/index.js`, Vite `out/renderer`, safe build config and minimal no-deps `package.json` in ignored `.demo-package`. Reject symlink/hardlinks, secrets/raw source/maps/SQLite/WAL/SHM, invalid version/compiled CSP, refuse deletion of unknown folders. Does not touch Electron `userData`. Nonpersistent demo session and IPC guard from POS-027 unchanged.
- `apps/desktop/src/main/index.ts` uses `app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL` to prevent packaged app loading an injected dev Vite URL.
- `apps/desktop/scripts/verify-demo-artifacts.mjs`: check exact filenames/headers and >=1MiB, emit `SHA256SUMS.txt`, `BUILD_PROVENANCE.json`. GitHub source commit is checkout SHA (on PR it can be test merge SHA). Binary/checksum not signed.
- `.github/workflows/demo-installers.yml`: separate native Windows/macOS matrix plus staging tests, artifacts 5-day retention, read-only token; no GitHub Release/production publish. Existing Foundation CI Linux+Windows runs `test:package-demo`, PostgreSQL unchanged.
- [POS-028 acceptance](../docs/POS-028_PACKAGING_ACCEPTANCE.md), [ADR-0005](../docs/ADR-0005-unsigned-demo-packaging.md), D-011 signing not approved.

### Windows safe validation commands against updated main

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
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

## Safe smoke from clean local Windows checkout

```powershell
git status --short
git fetch origin
git switch feature/SEC-013A-signed-grant-prototype
git pull --ff-only origin feature/SEC-013A-signed-grant-prototype
pnpm install --frozen-lockfile
node --test docs/security/offline-grant-signature-prototype.test.mjs
node --test docs/security/offline-access-reference.test.mjs
pnpm run check
pnpm --filter @smartpos/api test:staff
pnpm --filter @smartpos/desktop test:security
```

Keep API staff/sync POST routes default HTTP 404, Electron DEMO_ONLY; no real credential or Neon data used.
