# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: 00cb41704be50a54588b730d4e347509e9b7f8be
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub repository read/write and PR/CI connector, no admin permissions
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-09
current_milestone: M5 — secrets, IPC and SQLite storage hardening
current_phase: POS-027 [Issue #51](https://github.com/dinhkhoiIT15/smartpos/issues/51), [Draft PR #52](https://github.com/dinhkhoiIT15/smartpos/pull/52), feature/POS-027-security-hardening. Windows owner acceptance pending, NOT merged.
ci_status: POS-027 Foundation CI Linux/Windows/ephemeral PostgreSQL16 + docs need SUCCESS on FINAL HEAD; early transient Node24 TypeScript CJS import-test error prompted explicit ESM .mts policy modules. Do not accept old run; reverify.
production_status: NOT DEPLOYED. SQLite+backups are PLAINTEXT; Windows DACL policy, encryption, server password login and device-signed cashier/shift offline grant remain OPEN D-009/D-013. Default privileged Fastify routes 404. NO Neon writes.

## Owner-verified merged main

- POS-001 through POS-025 owner-accepted and merged.
- POS-026 [PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50) owner said Windows UI/IPC working and merged. GitHub verified [main `00cb417`](https://github.com/dinhkhoiIT15/smartpos/commit/00cb41704be50a54588b730d4e347509e9b7f8be) and post-merge [Foundation CI #42601151173](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42601151173) SUCCESS. Issue #49 should be closed after merge verification.
- POS-023 conservative late-ACK stock rebase can understate true stock, still needs dedicated review before live pilot.

## POS-027 Draft PR #52

- `apps/desktop/src/main/shell-policy.mts`: pure exact dev-renderer-origin and packed-file-asset policy, only loopback HTTP dev root and same-origin Vite HMR; deny path/query/credentials, no arbitrary file, network, WS or adjacent-port API. Pure WebContents+mainFrame+current URL IPC oracle.
- `apps/desktop/src/main/index.ts`: isolated in-memory Chromium partition `smartpos-demo-memory-only` with `cache:false` (previous Windows Chromium disk-cache errors); deny permissions, downloads, remote subresources, navigation, redirects, popups, webviews. One read-only `smartpos:app-info` stays tightly checked; Electron remains DEMO_ONLY.
- `apps/desktop/src/main/local-db/storage-policy.mts`, `local-db/index.ts`: SQLite DB, WAL, SHM directly symlinked/junctioned/hardlinked target rejection and POSIX 0700/0600; lstat backup collision incl dangling symlink, no deletion/rewrites. Windows ACL review manual and disk encryption/keys OPEN; ancestor symlinks and TOCTOU remain residual risks.
- `apps/desktop/tests/security-shell.test.mjs`, `storage-security.test.mjs`, expanded `security-check.mjs`, CI Linux and Windows Node24 tests, existing outbox/sale/report/receipt and disposable PostgreSQL suites retained.
- [POS-027 Windows acceptance and threat review](../docs/POS-027_SECURITY_ACCEPTANCE.md). D-009 encryption, backup retention/RPO/RTO, D-013 Argon2id login, OS non-exportable keys, session/offline grant/shift/clock/key-loss still open; no claim production security.

## Next

1. Verify final feature branch SHA Foundation Linux/API, Windows Node24, PG16 and Docs CI all SUCCESS; fix failures.
2. Owner Windows SAFE tests: `pnpm --filter @smartpos/desktop test:security`, `test:local-db`, `typecheck`, `build`, `pnpm run check`.
3. Windows Electron GUI: normal IPC and Vite HMR, POS-018 cart, POS-020 sample receipt/print, POS-024 conflict demo, POS-026 report demo; no new cache/blank screen errors. Confirm unchanged SQLite v1.
4. Review Windows filesystem ACL with `icacls` READ ONLY; no DACL edits, no file deletes/Neon. Owner Windows PASS manually merges Draft #52; close Issue #51 after verified merge. POS-028 packaging is next.
