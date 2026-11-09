# POS-027 — Electron IPC, renderer cache, secrets and local SQLite protection

**M5/P0, [Issue #51](https://github.com/dinhkhoiIT15/smartpos/issues/51), Draft PR (see current branch)**.
Owner Windows PASS/MERGE POS-026 [PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50), [main `00cb417`](https://github.com/dinhkhoiIT15/smartpos/commit/00cb41704be50a54588b730d4e347509e9b7f8be), [Foundation post-merge CI #42601151173](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42601151173) SUCCESS.

## Secure scope (DEMO ONLY)

- Electron `src/main/index.ts` creates an **in-memory non-persistent renderer session** `smartpos-demo-memory-only` with `cache:false`. Cookies, localStorage and HTTP blockfile cache of this renderer are not retained on disk between app runs. No automatic deletion of older cache folders or SQLite data is attempted. This addresses a likely contributing factor to the Windows `CreateMapBlock` Chromium cache error (whether the old error disappears needs a GUI test).
- Session denies permission requests/checks and downloads; webRequest blocks subresources, fetch and WebSocket connections outside the active development Vite origin or packaged local renderer asset directory. Vite HMR WebSocket remains allowed only on the same host+port. BrowserWindow still has `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, `webviewTag:false`; denies navigation, redirects, external new windows and webviews.
- Only the **existing read-only** `smartpos:app-info` preload IPC exists. Electron main validates sender WebContents reference, exact mainFrame identity, current URL **and** trusted entrypoint; returns only name/version/`DEMO_ONLY`/SQLite schema version (not appData path, credential, token, sale or DB handle). No D-013 privileged IPC added.
- `src/main/local-db/storage-policy.ts`: before opening SQLite and again after migrations/WAL enabled, reject directly symlinked/junctioned directory, database file, `-wal`, `-shm` and multiply-hardlinked data files. On POSIX apply `0700` to DB directory and `0600` to existing SQLite/WAL/SHM; never delete, overwrite or truncate. Backup destination uses `lstat` to reject even dangling symlinks and occupied targets, checks directory and adjusts modes. Existing schema remains SQLite v1 9 tables, no cash/outbox logic changes.
- Node24 shell and file-backed tests verify origin/port/HMR isolation, mainFrame sender reference identity, packaged asset traversal refusal, SQLite open/close/reopen with durable cash/outbox/WAL, symlink/hardlink traps, backup collision, no changes to committed records.

## Threat review / residual risks — do not hide release blockers

| Threat | Added defense | Remains open for real pilot |
|---|---|---|
| Chromium disk cache corrupt (`CreateMapBlock`) | Memory-only renderer session, `cache:false`; no disk HTTP cache for new renderer session | OS/Electron cache outside this partition, GPU/OS issues may still exist; confirm GUI on Windows and macOS. Old folders not removed automatically |
| Attacker changes React origin or tricks dev renderer | Trusted loopback root-only dev URL; exact host and port subresource + HMR allowed; packaged renderer cannot fetch arbitrary file:// paths or remote URLs | Local malicious program can replace dev server on the same localhost port; **DEV mode is not secure production distribution**. Renderer XSS still possible via trusted content |
| Fake renderer or subframe invokes sensitive IPC | WebContents object, exact mainFrame, URL entrypoint checks; one read-only IPC method | Electron runtime zero-day/OS compromise; no sensitive IPC functionality or real identity yet |
| Electron sends files/secrets to internet | Block unapproved requests, all downloads, dialogs/permissions, popup/window navigation | Network-layer interception not equivalent to full app content isolation; compiler/build supply-chain needs packaging/signing review POS-028 |
| Attack redirects SQLite/WAL/SHM | Refuse direct symlink/junction, hardlinked main/WAL/SHM targets before SQLite open, fail closed without resetting files | Symlinked **ancestor** directories, race between lstat and open, malicious same-user local process, OS admin/root, file cloning, Windows reparse-point behavior and device image backup are NOT fully solved. No OS-level authenticated device identity |
| Casual OS file disclosure | POSIX owner-only `0700/0600`; block renderer file/DB APIs; backup checks | **Windows NTFS DACL cannot be secured via `chmod`**; verify `icacls` manually, disk encryption/BitLocker/FileVault and endpoint protection. SQLite and backups remain **plaintext** |
| Theft/restore of local data or grants | No secrets or grants stored in SQLite; data/receipt/outbox preserved and remote routes unmounted | D-009: encrypted backups and restore retention/RPO/RTO OPEN. D-013: DPAPI/CNG or Windows Hello + macOS Keychain/Secure Enclave, device-bound private key, shift lock, anti-clock-rollback and restore/key-loss OPEN |
| Reused/expired credentials | No production credentials or login are created in this change | Argon2id verified login, rate limiting, token refresh, role revocation to cashier session, signed 4h offline grant and single POS device still NOT implemented |
| Late-ACK reconciliation | POS-027 leaves immutable event/revenue data untouched | POS-023 conservative late-ACK stock understatement and POS-029 recovery rehearsal must still be resolved |

**This ticket does not claim end-to-end data-at-rest encryption**; switching from plaintext SQLite to encrypted storage requires D-009/D-013 approved OS key management and migration/recovery design. POS-027 also cannot assert absolute protection against an administrator or another process running as the same user.

## Windows safe acceptance (PowerShell, Node 24 / pnpm 10.20.0)

At `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-027-security-hardening
git pull --ff-only origin feature/POS-027-security-hardening
git log -1 --oneline
node --version
pnpm --version
pnpm install --frozen-lockfile

pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop test:security-shell
pnpm --filter @smartpos/desktop test:storage-security
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:sales-report
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm run check
```

All exit code **0**; no need to connect to Neon or run PostgreSQL test locally. Security tests use only isolated temp directories generated under OS temp and clean up after closing SQLite handles.

### Electron GUI validation

```powershell
pnpm --filter @smartpos/desktop dev
```

1. **Electron application window**, not Vite-only browser: Overview `Kiểm tra Electron IPC` succeeds and returns `DEMO_ONLY`, `SQLite schema v1`. Vite console may show Node/SQLite experimental notices, but no blocking errors.
2. Switch **Giỏ hàng & tiền mặt (demo)**, sample internal receipt/print, **Đối soát xung đột (demo)**, **Lịch sử & báo cáo (demo)**; filters still respond. No real paid sale or server sync has been enabled.
3. Open Electron DevTools (if present), inspect Console + Network: no denied same-origin Vite scripts/HMR WebSocket or blank renderer. On reload/HMR UI updates as expected. Link navigation/popup/webview/download requests must not escape app; nothing is saved to OS Downloads.
4. Close Electron and relaunch. Confirm IPC still works and SQLite v1 still opens. Re-running `test:local-db` verifies WAL and transaction durability; never manually delete an active `-wal` or `-shm`.
5. If `disk_cache\\block_files.cc` appears again, capture a short log and report it. It may come from another Chromium session; do not erase data files in response.

### Windows local permissions (read-only inspection; do not auto-modify ACLs)

**Close Electron first.** In PowerShell use:

```powershell
Get-ChildItem $env:APPDATA -Directory |
  Where-Object { $_.Name -match 'smartpos|desktop' } |
  Select-Object FullName
```

Use the actual app **userData** folder found in the output; never assume that a folder name or screenshot is a verified path. For a folder you have verified:

```powershell
icacls "C:\YOUR_VERIFIED_USERDATA_FOLDER"
```

Check access for your Windows account, SYSTEM and Administrators (inheritance may be expected); flag unexpected shared `Everyone`, `Users` or guest write/read grants. Also check local drive BitLocker/device encryption state if policy permits. **Do not run `icacls /reset`, `/grant`, `/inheritance` or any delete/move commands** without a reviewed migration/backup plan. Windows DACL/BitLocker acceptance remains a manual prerequisite before live financial data.

**DO NOT DELETE:** `smartpos-local.sqlite`, `smartpos-local.sqlite-wal`, `smartpos-local.sqlite-shm`, any outbox/receipt evidence, or the entire Electron `userData` folder. Cache-only cleanup may be discussed separately after exact folder verification and closing all app processes.

### Security acceptance checklist

- [ ] Linux/API/typecheck/build and Windows Node24 security/SQLite tests PASS; disposable PostgreSQL16 regressions PASS; docs CI PASS **at final PR HEAD**
- [ ] GUI IPC still succeeds in Electron, tabs and Vite HMR work, no network or malicious file access
- [ ] Historical sales/outbox are preserved on reopen; SQLite schema v1 stays intact; backups never overwritten
- [ ] Owner reviewed Windows DACL/FileVault/BitLocker expectations and above remaining D-009/D-013 blockers
- [ ] Fastify privileged URLs still 404; no production login/checkout/sync, no Neon write
- [ ] Owner Windows PASS, review and **manual merge Draft PR**; close Issue #51 after verified merge

**Next after accepted POS-027:** POS-028 Windows/macOS reproducible packaging and version/release documentation.
