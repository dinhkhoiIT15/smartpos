# ADR-0005 — Deterministic inputs for unsigned DEMO desktop packaging

**Status:** PROPOSED IMPLEMENTATION FOR POS-028 (not approved for production release)
**Date:** 2026-11-09
**Issue:** [POS-028 #53](https://github.com/dinhkhoiIT15/smartpos/issues/53)
**PR:** [Draft #54](https://github.com/dinhkhoiIT15/smartpos/pull/54)
**Decision boundaries:** D-006 Electron stack ACCEPTED; D-011 signed release, supported OS and hosting OPEN; D-009/D-013 data protection/OS identity OPEN.

## Context

The app has a secure Electron demo shell (POS-007/POS-027), SQLite v1 and tests for independent internal offline sale/sync logic, but it **cannot take live payments**: real online login, device-bound grants/shift authorization, production database encryption and operational recovery are unresolved. The backlog still calls for reproducible native Windows/macOS install builds as a step toward an eventual pilot. CI needs clear, inspectable evidence without pretending unsigned binaries are production-ready or accidentally shipping `.env`, Neon credentials, SQLite, WAL, outbox or source files.

## Proposed choice and implementation

Use pinned `electron-builder@26.18.1` CLI from `pnpm dlx` rather than adding a new large dependency to the pnpm production/workspace dependency graph during POS-028. Keep `pnpm install --frozen-lockfile`, Node 24.x, pnpm 10.20.0, installed Electron 44.9.3. The exact CLI version is pinned, but `dlx` transitive packages are not frozen by the workspace lockfile; this remains a limitation requiring review before any production-grade release.

A standalone staging script checks pinned desktop `package.json`, production CSP, compiled entrypoints, and traverses `out/main`, `out/preload`, `out/renderer`. It rejects symbolic and multiply-hardlinked files, raw source, source maps, credentials, secrets and local SQLite/backup evidence. Only compiled output, minimal generated app metadata and a build-time config are placed under the ignored `.demo-package` directory. This directory is not Electron `userData`; it refuses deleting unmarked directories. `electron-builder.yml` sets `asar:true`, explicit `electronVersion`, demo app ID, user-scoped NSIS and no automatic userData deletion. For macOS it produces DMG and ZIP for Intel x64 and arm64.

The installed Electron process **ignores `ELECTRON_RENDERER_URL` when `app.isPackaged`**; otherwise a local environment override could accidentally load a development server instead of trusted `file://` assets. Permission/IPC/webRequest guards from POS-027 stay enabled.

GitHub Actions uses native Windows/macOS runners with `contents:read`, no injected signing keys, all commands `--publish never`, no GitHub Releases. Only short-lived unsigned DEMO files are uploaded for **five days** with matching SHA-256 checksums and a machine-readable provenance manifest. The source checkout commit comes from `git rev-parse HEAD`; on PR runs it may represent GitHub's test-merge commit rather than the feature branch HEAD. Verify both repository branch and run before accepting an artifact.

## Versioning

The **desktop package** `version:0.1.0` (SemVer) is the sole installer/app version; the repository root `0.1.0-m0` coordinates the workspace and is not installed. For any subsequently **approved published release**, version changes happen through reviewed PR with explicit release notes and CI checks; never rewrite a previously released semantic version with different content. No release or tag is created by POS-028.

## Non-goals and residual risks

- This is **reproducible inputs and scripts**, NOT a claim of byte-for-byte identical Windows/macOS artifacts. Hosted runners, bundle timestamps, native tools, download mirrors and builder transitive dependencies can vary. A hash is corruption evidence, **not publisher authentication** without a separately verified signed trust anchor.
- Windows Authenticode signing/timestamp/SmartScreen trust, Apple Developer ID/notarization/stapling and supported OS minima are D-011 **OPEN**. Test artifacts are **UNSIGNED, UNNOTARIZED**, should not be given to stores and may be blocked by OS security. Do not advise bypassing OS protections solely to pass QA.
- Windows NTFS ACL, macOS Keychain/Secure Enclave, D-009 encrypted backup/RPO/RTO, D-013 signed offline grant/login/clock/session/restore, one authorized offline POS device, POS-023 late ACK stock handling, POS-029 crash restore evidence and D-012 returns/refunds policy are **not** addressed by packaging.
- No activation of real checkout/sync/privileged Fastify endpoints, Neon migrations or credentials, no auto-update, rollback service or installer-driven customer-data migration.

## Alternatives considered

- Add `electron-builder` as a development dependency and update `pnpm-lock.yaml`: preferred for a formally audited locked toolchain, but introduces a sizable transitive dependency graph and install-script review; defer full supply-chain approval to D-011 before production.
- Use `electron-packager` without an installer: generates unpacked apps, not required NSIS/DMG; rejected for this milestone.
- Sign/notarize with CI tokens: cannot safely proceed without owner-selected certificates, account, entitlements, key custody and supported platforms; rejected.
- Build macOS from Windows: unsafe/incomplete native signing and dmg packaging, rejected in favor of native hosted macOS runners.

## Acceptance and future work

Verify Stage Security tests, Foundation CI Linux/Windows/disposable PG, dedicated Windows x64 + macOS x64/arm64 packaging runs, SHA-256/provenance, demo-only runtime and manual owner review. PR remains Draft until owner Windows/macos packaging evidence and risks are accepted. Before D-011 is accepted for a real pilot, move builder and all transitive deps into a reviewed lockfile, pin native runner/toolchain or use auditable images, sign and notarize, protect release workflow permissions, verify app.asar contents independently, test native launch on supported OS versions and define rollback/recovery strategy.
