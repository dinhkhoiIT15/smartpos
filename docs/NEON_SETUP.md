# Neon PostgreSQL — SmartPOS Development Setup (POS-009)

**State:** code for an optional server-only development connection check is proposed in [POS-009 Issue #11](https://github.com/dinhkhoiIT15/smartpos/issues/11). No actual Neon project, database, credential or successful remote query has been verified. No production database access or migrations are authorized here.

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

## Testing, limitations and next issue

```powershell
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api typecheck
```

Automated CI uses **fake client tests** — no Neon credential is supplied or contacted. The human developer must provide evidence from an actual development database check before POS-009 may be marked Done. Never include the URL in evidence.

**Out of scope:** Drizzle schema creation or migrations (POS-012), database write endpoints, transactions, online cash sales, auth, SQLite offline checkout, and production access. A working `SELECT 1` is only proof of connectivity.
