# SmartPOS API — POS-008 Fastify Foundation

**Status:** API health server under review in [POS-008 PR](https://github.com/dinhkhoiIT15/smartpos/pulls). Not production-ready; no database, auth, catalog, sales or sync yet.

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

## Source layout and next steps

- `src/server.ts`: factory, route and no-store response; no real database dependency.
- `src/config.ts`: validated port and explicit loopback host.
- `src/main.ts`: starts API listener and fails on invalid port.
- `src/server.test.ts`: happy-path, 404, safe response and invalid port regression.

A later issue POS-009 introduces Neon dev credentials **server-side only**, not through the Electron renderer. POS-010 introduces shared DTO/Zod contracts, POS-012 PostgreSQL migrations and later POS-016/021 sync endpoints. Never put `DATABASE_URL` or authentication secrets in the renderer or repository.
