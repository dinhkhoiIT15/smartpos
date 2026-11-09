# Session handoff — backlog audit / POS-006 (2026-11-09)

## Start here
- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified **main** HEAD: `95485d09c1210cd90fc3c3a82767b328fbbc34d6`, POS-028 [PR #54](https://github.com/dinhkhoiIT15/smartpos/pull/54) MERGED and [post-merge Foundation CI SUCCESS](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484458). POS-028 is UNSIGNED DEMO only, not a signed or production-ready release.
- Use [BACKLOG_AUDIT_2026-11-09.md](BACKLOG_AUDIT_2026-11-09.md) as the task-by-task reconciliation, not the previous stale `TODO.md`.
- This audit branch adds tracking/docs only; do not mistake an open PR for a merged fix. Review docs CI on final head before owner merge and closing POS-006 #57.

## Remediation issues
- [#55 POS-003](https://github.com/dinhkhoiIT15/smartpos/issues/55): mapping + Project board URL not verified; owner action required.
- [#56 POS-005](https://github.com/dinhkhoiIT15/smartpos/issues/56): GitHub main `protected:false`, only admin can apply ruleset.
- [#57 POS-006](https://github.com/dinhkhoiIT15/smartpos/issues/57): this status/handoff remediation; pending owner PR review + fresh-session check.
- [#58 BUG-023](https://github.com/dinhkhoiIT15/smartpos/issues/58): late ACK after PULL stock undercount; P0 before pilot.
- [#60 SEC-013](https://github.com/dinhkhoiIT15/smartpos/issues/60): actual device-signed grant and cashier auth before live checkout/sync.
- [#61 SEC-009](https://github.com/dinhkhoiIT15/smartpos/issues/61): encrypted offline backup, recovery and RPO/RTO before pilot.
- GitHub issues #7 (POS-007) and #29 (POS-016) closed after confirming merged implementation evidence.

## POS-028 merged (preserve integration and installer guidance)

- PR #54 merged into `main` at `95485d09c1210cd90fc3c3a82767b328fbbc34d6`; Issue #53 remained open at review pending bookkeeping/owner evidence. The original Windows `sep is not defined` failure in [#42609431116](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42609431116) was fixed by an explicit `node:path` import with regression coverage on feature SHA `80bba378` before merge.
- [Post-merge native installer run #42642484398](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42642484398) was still IN PROGRESS at review. Verify full matrix, hashes and actual GUI acceptance separately; NEVER assume an unsigned installer is signed or approved for production.

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

## Security/financial blockers
- POS-011 design D-010 maximum 4h grant only; D-013 real device key + clock + online cashier shift/grant not implemented. No production checkout/sync.
- D-009 plaintext SQLite/backup, encryption, retention and restore unknown. POS-029 restoration not executed.
- POS-023 potential stock undercount when ACK arrives after PULL cursor: stop before live rollout; write regression tests and reconciliation design, preserve sales/outbox.
- D-011 signing/notarization and D-012 refund policy unresolved; normal privileged Fastify routes intentionally return 404.

## Next handoff smoke (fresh session + local optional)
1. Read `AGENTS.md`, verified `main` SHA, **PR #54 merged**, PR #59 review state, Issues #55–#58/#60/#61 and latest CI by SHA.
2. Compare against this audit; do not confuse old failed intermediate commits with final HEAD.
3. In a clean local checkout: `node scripts/validate-context.mjs`, `pnpm run check`, `git status --short`. These commands have NOT been claimed as run by remote GitHub auditing.
4. Record actual owner/admin-only Board/protection evidence; merge documentation via PR only after review.
