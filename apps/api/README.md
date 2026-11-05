# SmartPOS API — POS-008 Fastify Foundation

**Status:** POS-008 health API merged. POS-009 adds an optional read-only Neon **development** connection CLI in an open PR. Not production-ready; no database migrations, authentication, catalog, sales or sync.

## Requirements

Node.js 24.x and pnpm 10.20.0. From the **repository root**:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @smartpos/api dev
```

On Windows PowerShell in a **second terminal**:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/v1/health
```

Or open `http://127.0.0.1:3001/v1/health` in a browser.

Expected JSON:

```json
{"status":"ok","service":"smartpos-api"}
```

This endpoint reports **Fastify process liveness only**. It DOES NOT verify Neon connectivity, migrations, offline sync, or POS functionality.

The default API server binds `127.0.0.1:3001` for local development (not public `0.0.0.0`). To use another port in PowerShell:

```powershell
$env:API_PORT="3101"
pnpm --filter @smartpos/api dev
```

macOS/Linux: `API_PORT=3101 pnpm --filter @smartpos/api dev`. Port must be an integer in the 1..65535 range.

## Build, test and start compiled server

```powershell
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api start
```

- `build`: strict TypeScript compilation to `apps/api/dist`.
- `test`: builds and executes Node `node:test` tests with `Fastify.inject()`, without opening a TCP port.
- `start`: runs compiled JavaScript, bound to loopback by default.
- Stop dev/start server with `Ctrl+C`.

## Optional Neon development connection check (POS-009)

Follow the [Neon setup checklist](../../docs/NEON_SETUP.md). Keep all passwords in `apps/api/.env` locally and out of Git/ChatGPT.

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
notepad .\apps\api\.env
pnpm --filter @smartpos/api db:check
```

Expected: `Neon development database: SELECT 1 succeeded (TLS connection).`. Never share connection strings, screenshots showing credentials or the .env file. `db:check` is a read-only CLI, **not** an unauthenticated API route. `/v1/health` stays independent of the database.

## Source layout and next steps

- `src/server.ts`: factory, route and no-store response; no real database dependency.
- `src/config.ts`: validated port and explicit loopback host.
- `src/main.ts`: starts API listener and fails on invalid port.
- `src/server.test.ts`: happy-path, 404, safe response and invalid port regression.

POS-009 introduces Neon development connectivity in an opt-in server-only CLI; actual developer credential setup is not automated. POS-010 introduces shared DTO/Zod contracts, POS-012 PostgreSQL migrations and later POS-016/021 sync endpoints. Never put `DATABASE_URL` or authentication secrets in the renderer or repository.
