# POS-028 — Windows/macOS unsigned DEMO installers and release acceptance

**Milestone M6/P1.** [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) • [Draft PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) • branch `feature/POS-028-desktop-packaging`. Based on POS-027 [PR #52](https://github.com/dinhkhoiIT15/smartpos/pull/52), verified merged main `5e4d2928d9b1e2df4ee2f695b8f652e96b71667e` and [post-merge Foundation CI #42604675859](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42604675859) SUCCESS.

## Deliverables (all intentionally UNSIGNED and NOT production releases)

| Host / architecture | Output filename | Function |
|---|---|---|
| Windows 64-bit x64 | `SmartPOS-DEMO-0.1.0-win-x64-setup.exe` | NSIS per-user installation, no elevation requested, no userData deletion on uninstall |
| macOS Intel x64 | `SmartPOS-DEMO-0.1.0-mac-x64.dmg` + `.zip` | Unsigned/unnotarized drag-and-drop DEMO archive |
| macOS Apple Silicon arm64 | `SmartPOS-DEMO-0.1.0-mac-arm64.dmg` + `.zip` | Unsigned/unnotarized DEMO archive |

Each target additionally contains `SHA256SUMS.txt` and `BUILD_PROVENANCE.json` with exact checksum, file size, source commit, version and `UNSIGNED_DEMO_ONLY` status. Files are uploaded to **GitHub Actions artifacts** (`unsigned-demo-win-x64`, `unsigned-demo-mac-x64`, `unsigned-demo-mac-arm64`) with five-day retention; **not** GitHub Releases. No auto-update, certificate or notarization request. Download from the correct POS-028 branch PR [GitHub Actions runs](https://github.com/dinhkhoiIT15/smartpos/actions) after its job reports SUCCESS. Do not obtain binaries from an unknown source.

- `apps/desktop/scripts/stage-demo.mjs` verifies compiled `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html`, Content Security Policy, Electron pin and build config; rejects symlinks/hardlinks, `.env`, secrets/keys, `.sqlite`, `-wal`, `-shm`, source `.ts/.tsx`, source maps, arbitrary directories. Copies *only* the compiled app plus minimal `package.json` (no runtime npm dependencies), trusted builder config, and a regeneration marker into ignored `.demo-package`. Refuses overwriting an unmarked stage directory. This directory is **never** app `userData` and does not contain customer data.
- `apps/desktop/electron-builder.yml`: electron-builder v26 schema, Electron **44.9.3**, ASAR packaging, demo-only app ID/name, unsigned Windows NSIS and macOS DMG/ZIP, `--publish never`; protects Windows `deleteAppDataOnUninstall:false`. Build script fixes electron-builder **26.18.1** through `pnpm dlx`. No new package dependency or changes to frozen pnpm lockfile.
- `apps/desktop/src/main/index.ts`: when `app.isPackaged`, ignores the `ELECTRON_RENDERER_URL` environment variable; a built installer cannot accidentally switch to Vite localhost.
- `apps/desktop/scripts/verify-demo-artifacts.mjs`: refuses wrong target/version/installer extension or invalid binary header/trailer; demands files >=1MiB, generates deterministic SHA-256 list + machine-readable provenance. The manifest is a verifier, **not a cryptographic publisher signature**; a malicious actor could replace both binary and checksum unless independently verified.
- [Dedicated packaging workflow](../.github/workflows/demo-installers.yml) builds native Windows/macOS on pull-request or `main`, and via manual `workflow_dispatch`. GitHub token is read-only, upload-artifact only, no GitHub Release/publishing. Existing Foundation CI remains separate and includes packaging-security tests.

## Version and reproducibility policy

- App version is **`apps/desktop/package.json` `0.1.0`** and appears inside the built app via Electron `app.getVersion()`. GitHub repository root version `0.1.0-m0` is a separate workspace coordinator marker and must **not** be used as installer version.
- Before an approved release, increase the desktop app's semver under reviewed PR, update expected test fixtures/artifact naming and release notes. Never reuse an already **published** version for changed code. This change does **not** publish a version; names may be rebuilt as throwaway CI artifacts.
- Toolchain inputs pinned: Node 24.x (version family), pnpm 10.20.0, Electron 44.9.3 from frozen workspace lockfile, electron-builder **26.18.1** invoked with exact version. Build tool is downloaded via `pnpm dlx`, so its transitive dependency graph and OS runner image can change. **This is not fully lockfile-reproducible or bit-for-bit deterministic.** No repeat-build byte-identical guarantee; record SHA-256, Git checkout commit, OS/architecture and CI run. For actual signed production distribution, D-011 must decide locked packaging-tool dependencies, pinned images, certificate storage, notarization and verifiable attestations.
- Every package is explicitly **DEMO ONLY**. Fake cart/receipt/history/conflict UI is not a real sale. The SQLite DB in Electron `userData` is still plaintext and has no approved key/restore policy; D-009/D-013 remain OPEN.

## Windows PowerShell — safe automated checks

From `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-028-desktop-packaging
git pull --ff-only origin feature/POS-028-desktop-packaging

node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:package-demo
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm run check
```

Expected **Node 24.x, pnpm 10.20.0**, zero failures. No database migration, Neon access, authentication keys or file deletions are required. To build a **local unsigned DEMO installer** (after CI job passes):

```powershell
pnpm --filter @smartpos/desktop package:demo:win
```

Expected `apps\desktop\demo-artifacts\SmartPOS-DEMO-0.1.0-win-x64-setup.exe`, `SHA256SUMS.txt`, `BUILD_PROVENANCE.json`. If GitHub Actions downloads a ZIP containing the same files, extract into a **new empty temporary folder**, not onto existing userData.

For a verified local output folder:

```powershell
cd apps\desktop\demo-artifacts
Get-Content .\SHA256SUMS.txt
(Get-FileHash .\SmartPOS-DEMO-0.1.0-win-x64-setup.exe -Algorithm SHA256).Hash.ToLowerInvariant()
Get-Content .\BUILD_PROVENANCE.json
```

The hash must match the first field of the SHA256SUMS line; `kind` should be `UNSIGNED_DEMO_ONLY`, `publish` false, version `0.1.0`, target `win-x64`. This checks corruption, not publisher authenticity.

### Windows GUI manual checks

1. Prefer a separate **disposable VM/OS user profile** (no real customer or local sales data). Scan the downloaded installer through normal endpoint security, and do **not override Windows SmartScreen** for unknown unsigned binaries solely to pass testing.
2. With a trusted test-only environment permitting the unsigned build under reviewed organizational policy, run NSIS user-level installation; start `SmartPOS Retail DEMO`. The **DEMO — CHƯA THỂ BÁN HÀNG** warning must be present; click **Kiểm tra Electron IPC** and verify `DEMO_ONLY` and SQLite v1. Verify tabs for demo cart, internal sample receipt/print watermark, conflict demo and sales-report demo. No remote API, payment processing or production sync should be active.
3. Close then reopen from Start menu; IPC still works and SQLite is not migrated/reset. No Vite server should be required for the installed application; setting the `ELECTRON_RENDERER_URL` environment variable must not redirect it.
4. Verify installer user-level behavior, no unwanted administrator elevation or auto-update. Uninstall using normal OS Apps controls; ensure the app **did not deliberately delete** the per-user SQLite `userData` (the manifest sets `deleteAppDataOnUninstall:false`). Do **not manually delete** `smartpos-local.sqlite`, `-wal` or `-shm`; don't test preservation with valuable real data.
5. Reinstall same version in the isolated test profile and verify app starts without erasing existing test-only data. Document Windows version, command results and relevant GUI screenshots (without secrets).

**Expected limitation:** An unsigned installer is not Authenticode-signed and may be blocked by SmartScreen, antivirus or enterprise software. A blocked unsigned application is **not** a reason to disable OS protections: mark GUI validation blocked and record it until signed test distribution is available.

## macOS packaging and manual acceptance

On a macOS Intel or Apple Silicon machine with **Node 24/pnpm 10.20.0**, run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:package-demo
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop build
# On a macOS build runner:
pnpm --filter @smartpos/desktop package:demo:mac:x64
# Or, on the appropriate runner:
pnpm --filter @smartpos/desktop package:demo:mac:arm64
shasum -a 256 apps/desktop/demo-artifacts/SmartPOS-DEMO-0.1.0-mac-*.dmg
```

Compare hashes to `SHA256SUMS.txt` for the matching target. Check `.dmg` and `.zip` exist and match exact version/arch, and `BUILD_PROVENANCE.json` reports `UNSIGNED_DEMO_ONLY`. Use native macOS to inspect installer metadata and application signature status. **Apple Gatekeeper can block unsigned/unnotarized apps by design. Do not bypass Gatekeeper/quarantine controls to manufacture a PASS.** When signed/notarized test packaging is available, check launch, demo-only notice, IPC, four demo tabs, close/reopen, and preservation of test-only `userData` in a disposable test account. Document whether GUI validation was blocked pending signing; CI archive/build structural PASS alone is not proof of macOS launch acceptance.

## Security / release gating and rollback

- Never distribute or install these **unsigned** artifacts in a production POS, take cash, or put them on a public releases page.
- **D-011 OPEN:** Authenticode certificate procurement/expiry/timestamping, Apple Developer ID/notarization/stapling/entitlements, signed update metadata, protected release tag/permissions and supported Windows/macOS minimum OS versions.
- **D-009/D-013 OPEN:** SQLite/backup encryption + retention/restore, NTFS ACL validation and host OS key store/non-exportable device identity, password login/Argon2id, device-bound signed four-hour cashier grant and clock/shift lock. POS-023 late ACK stock reconciliation and POS-029 crash-recovery evidence remain blocked for pilot.
- If an unsigned demo installer fails, return to `pnpm --filter @smartpos/desktop dev` on the reviewed branch, not a production store. Keep existing SQLite/outbox data intact; do not edit or delete `userData` to fix installer errors. Avoid downgrading any real database because older executables may reject a newer schema. No automated deploy/rollback/auto-update exists.
- No migration in this PR. Project app data `userData` may differ between dev and installed DEMO names; **no automatic data migration/copy** and never use the installer as a backup/restore path.

### Owner acceptance checklist

- [ ] Final HEAD existing Foundation CI (Linux/API, Windows Node24, disposable PG16) + Docs CI SUCCESS
- [ ] Native packaging workflow stage-validation + win-x64, mac-x64, mac-arm64 jobs all SUCCESS
- [ ] Installer target/version/hash manifest verifies on each host; demo stage holds only built files, no secrets/source/DB
- [ ] Windows safe tests and optional isolated unsigned-installer GUI verified, no data deletion (or explicitly documented OS protection block)
- [ ] macOS x64/arm64 artifacts generated; signature/Gatekeeper limitation documented; native launch verified only when permissible, not fabricated
- [ ] Owner approves **DEMO packaging PR only**, reviews D-011/D-009/D-013 blockers, manually merges Draft #54. No signing/publishing/live pilot.
