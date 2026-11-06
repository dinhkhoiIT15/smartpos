# Neon PostgreSQL — SmartPOS Development Setup (POS-009 / POS-012)

**State:** POS-009 development connectivity was confirmed by the developer on Windows (`SELECT 1 succeeded (TLS connection)`) and Issue #11 is closed. POS-012 Drizzle schema/migration is proposed in [draft PR #17](https://github.com/dinhkhoiIT15/smartpos/pull/17), but **no Neon development or production migration has been executed**.

## Step 1 — Create a development database

1. Sign in at [Neon Console](https://console.neon.tech/). Create a **SmartPOS development** project (or reuse an existing safe development project). Pick a nearby region and monitor quotas/costs.
2. In the project, create/select the **development** branch, database and role. Never use a production database/role to try the POS-009 diagnostic.
3. Click **Connect** and select the development branch, database and role. Copy the PostgreSQL connection string. Neon displays a pooled connection URL by default. Retain its `sslmode=require` and `channel_binding=require` query parameters; for development health checks the pooled URL is fine.
4. Keep all credentials locally. **Never paste DATABASE_URL, passwords, screenshots showing the URL, or .env into GitHub, ChatGPT, an issue, a log or an email.**

Official guide: [Neon — Connect to your database](https://neon.com/docs/get-started/connect-neon).

## Step 2 — Configure server-only API environment on Windows

From a **PowerShell** window at the repository root, on the POS-009 feature branch:

```powershell
pnpm install --frozen-lockfile
Copy-Item .\apps\api\.env.example .\apps\api\.env
notepad .\apps\api\.env
```

In Notepad, replace the entire example value of `DATABASE_URL` with **your actual Neon development connection string** and save. Keep surrounding double quotes. Do not paste the value into this conversation. Do not put it in the Electron app. The repository `.gitignore` ignores `.env` and `.env.*` except `.env.example`.

To ensure secrets are untracked, `git status --short` must **not** list `apps/api/.env`.

On macOS/Linux, run `cp apps/api/.env.example apps/api/.env` and edit the local file with an editor.

## Step 3 — Run read-only Neon connectivity check

At the repository root:

```powershell
pnpm --filter @smartpos/api db:check
```

Expected success output:

```text
Neon development database: SELECT 1 succeeded (TLS connection).
```

This reads `apps/api/.env` when present, validates PostgreSQL/TLS/Neon URL structure and runs one read-only `SELECT 1 AS ok` using a short-lived `pg` client. It closes the connection afterward, prints **no credentials**, and never changes schema or data.

Failure prints a generic message without password/hostname. Verify internet access, database endpoint, role/password, project branch and SSL flags on your own computer. If the CLI fails, share only the generic output and **not** the connection string.

## Step 4 — Confirm API health is independent of database

```powershell
pnpm --filter @smartpos/api dev
```

In a second terminal or browser, request `http://127.0.0.1:3001/v1/health`. It still returns `{"status":"ok","service":"smartpos-api"}`, with or without a Neon connection.

This remains a **process liveness** endpoint, not a database readiness endpoint, and must never expose credentials.

## POS-009 safe troubleshooting for Windows

If `pnpm --filter @smartpos/api db:check` fails, update to the safe-diagnostics branch in [PR #13](https://github.com/dinhkhoiIT15/smartpos/pull/13). The CLI prints only a bracketed failure category and never prints the URL, username, password, or raw PostgreSQL exception.

- `CONFIG_MISSING`: no `DATABASE_URL` in local `apps/api/.env` or inherited environment.
- `TEMPLATE_NOT_REPLACED`: `.env.example` placeholders have not been replaced.
- `CONFIG_INVALID`: invalid PostgreSQL URL, Neon hostname, credentials or TLS URL parameter.
- `AUTH_FAILED`: wrong development role/password or revoked credentials; copy a fresh development connection string from Neon Console.
- `DATABASE_NOT_FOUND`: the chosen database name does not exist on that Neon development branch.
- `DNS_FAILED`: Windows DNS could not resolve the Neon endpoint.
- `NETWORK_UNREACHABLE` or `CONNECTION_TIMEOUT`: network, firewall, VPN, port 5432, or transient connection timeout; check Neon status.
- `TLS_CERTIFICATE_FAILED`: certificate validation/hostname mismatch or TLS interception; do not disable certificate verification.
- `CONNECTION_FAILED`: unknown or unmapped failure; check the Neon Console and network privately.

A `pg` warning about `sslmode=require` is **not itself proof of failure**. In your local `.env` you may replace just `sslmode=require` with `sslmode=verify-full` for explicit hostname/certificate verification and to remove the driver warning. Keep the rest of the Neon URL exactly as supplied, including `channel_binding=require`, unless Neon instructs you otherwise. Do **not** change to `sslmode=disable`, `no-verify`, or `rejectUnauthorized=false`.

The local CLI now gives `apps/api/.env` precedence over any older `DATABASE_URL` inherited from the current PowerShell session. The app server `/v1/health` is still database independent.

Only share the category (for example `[DNS_FAILED]`) and whether `SELECT 1 succeeded`, **never** post the URL, `.env` file, password, hostname or a screenshot displaying credentials.

## POS-012 migration v1 — review first, no automatic application

A reviewed SQL migration and schema snapshot are proposed in [POS-012 PR #17](https://github.com/dinhkhoiIT15/smartpos/pull/17). GitHub Actions runs them only against disposable PostgreSQL 16 with fake credentials.

**Before applying to Neon development:** inspect the committed `packages/db/drizzle/*.sql`, check the Drizzle journal and transaction/constraint test report, back up or branch your Neon development database, and verify in Neon Console that this is **not production**. Database migrations create 17 tables and indexes; they are not equivalent to `SELECT 1` and should not be attempted without a review.

Once the owner explicitly authorizes development migration, the documented guarded CLI may be run by the developer from the repository root after installing dependencies and selecting the POS-012 branch:

```powershell
pnpm --filter @smartpos/db typecheck
pnpm --filter @smartpos/db schema:check
pnpm --filter @smartpos/db migrate:dev --confirm-neon-development
```

The migration CLI reads the **local** ignored `apps/api/.env`, requires an explicit confirmation flag and a TLS Neon URL, and rejects unmanaged pre-existing SmartPOS tables. It never outputs the URL or password. Do not run against a production database, a real customer database, or a shared Neon branch whose contents you cannot safely restore.

After manual application, **read-only** verification in Neon should list 17 tables in the `public` schema and one entry in `drizzle.__drizzle_migrations`. Record only counts and status, not credentials. For errors, follow the [forward-fix plan](../packages/db/README.md); do not try deleting tables or clearing the migration journal to force a rerun.

## Testing, limitations and next issue

```powershell
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api typecheck
```

Automated CI uses **fake client tests** — no Neon credential is supplied or contacted. The human developer must provide evidence from an actual development database check before POS-009 may be marked Done. Never include the URL in evidence.

**Out of scope:** Drizzle schema creation or migrations (POS-012), database write endpoints, transactions, online cash sales, auth, SQLite offline checkout, and production access. A working `SELECT 1` is only proof of connectivity.
