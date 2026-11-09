# Session Handoff — POS-027 Electron security hardening (M5/P0)

## Base GitHub verified

- Owner Windows pass and merge POS-026; verified [PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50) merged at main `00cb41704be50a54588b730d4e347509e9b7f8be`, [post-merge Foundation CI #42601151173](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42601151173) SUCCESS. Owner specifically reported app functional despite Chromium `CreateMapBlock`/disk cache errors.
- [POS-027 Issue #51](https://github.com/dinhkhoiIT15/smartpos/issues/51), [Draft PR #52](https://github.com/dinhkhoiIT15/smartpos/pull/52) `feature/POS-027-security-hardening` based on that main. **NOT merged**, owner Windows acceptance PENDING.

## Implementation

- Electron `shell-policy.mts` pure exact entrypoint allowlist (loopback host port for Vite, same-host HMR, packaged file only within renderer asset root). `main/index.ts` isolates the DEMO window to nonpersistent `session.fromPartition('smartpos-demo-memory-only',{cache:false})`, blocks permissions/downloads/off-origin resources and WS, navigation, redirect, popup and webview; no automatic userData/cache deletions. Read-only `smartpos:app-info` IPC still checks sender WebContents reference, mainFrame identity, current window URL and expected entrypoint; zero new privileged channels.
- `local-db/storage-policy.mts` refuses directly symlinked/junctioned storage directory or SQLite / `-wal` / `-shm` and nlink>1 files before opening and after migration; POSIX 0700/0600. Backup uses lstat for destination (including broken symlinks) and restricts destination dir modes. No new migrations, no financial/outbox mutation or deletion. Windows NTFS DACL cannot be set via chmod; user must inspect manually. Ancestor symlinks, same-user/admin attacks and file-race are not solved.
- Tests `tests/security-shell.test.mjs`, `storage-security.test.mjs`, `security:check`; CI Linux and Windows Node24; existing DB/outbox/receipt/report and disposable PG16 unmodified.
- Full [Windows GUI/security acceptance](../docs/POS-027_SECURITY_ACCEPTANCE.md), including manual read-only `icacls`, malware/BitLocker review and no deletion of `smartpos-local.sqlite` or WAL/SHM.
- D-009 (backup/restore/encryption) and D-013 (OS keys/clock/shift/key rotation, signed 4h offline grant, Argon2id login) still OPEN. No production authentication or authorized checkout/sync; plain SQLite and backups; normal Fastify privileged routes remain HTTP 404.

## Windows SAFE

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/POS-027-security-hardening
git pull --ff-only origin feature/POS-027-security-hardening
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm run check
pnpm --filter @smartpos/desktop dev
```

UI smoke: Electron IPC OK `DEMO_ONLY`, SQLite schema v1, Vite HMR updates, POS-026 reports filter, POS-024 conflicts and sample cash/receipt unaffected. Web-only Vite tab has no IPC as designed. DB paths/secrets never displayed to renderer.

## Handoff checkpoint

Initial Foundation CI ran before temporary Node24 CJS policy import-test issue was fixed: new standalone pure TS policy files use explicit `.mts` extension, MJS tests import `.mts` directly, instead of relying on TypeScript ESM in `type:commonjs` package. **Do NOT cite old failing CI as success**. Verify final PR HEAD: Foundation all Linux/Windows/PG16 jobs + Docs CI green. Owner Windows GUI/security PASS PENDING, PR stays DRAFT; no production rollout or Neon migrations. Next POS-028 packaging Windows/macOS.
