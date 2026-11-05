# SmartPOS Retail — Desktop + API Foundation

**Status:** Milestone M1 development. Secure Electron/React desktop demo is merged; POS-008 Fastify health API is under review. **No real checkout, database or cloud sync yet.**

SmartPOS is a planned offline-first, cash-only POS for a single electronics store. The accepted baseline (one authorized offline cashier, immutable sales, integer VND, SKU inventory) is recorded in [AGENTS.md](AGENTS.md), [PRD](docs/PRODUCT_REQUIREMENTS.md), [Business Rules](docs/BUSINESS_RULES.md) and [Architecture](docs/SYSTEM_ARCHITECTURE.md).

## Prerequisites and install

- Git, **Node.js 24.x** (`.node-version`), **pnpm 10.20.0** (`packageManager`).
- Windows or macOS for the desktop window.

```bash
pnpm install --frozen-lockfile
pnpm run check
```

## Terminal 1 — Launch desktop development demo

```bash
pnpm --filter @smartpos/desktop dev
```

The SmartPOS window shows **DEMO ONLY** and has a small `getAppInfo()` preload IPC test. It does not process sales. On Windows, if Electron reports its binary is missing, try `pnpm --filter @smartpos/desktop rebuild electron` then start again.

## Terminal 2 — Start Fastify health API (POS-008 branch)

```bash
pnpm --filter @smartpos/api dev
```

In a browser, open <http://127.0.0.1:3001/v1/health>. Expected HTTP 200 JSON:

```json
{"status":"ok","service":"smartpos-api"}
```

On Windows PowerShell use `Invoke-RestMethod http://127.0.0.1:3001/v1/health`. For compiled server, run:

```bash
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api start
```

This health probe confirms the API process only; it does **not** check Neon, SQLite or synchronization. The server listens on loopback `127.0.0.1` and defaults to port 3001.

## Monorepo layout

| Workspace | What exists |
|---|---|
| `apps/desktop` | Electron + React/Vite secure demo with IPC test (POS-007) |
| `apps/api` | Fastify health endpoint and Node tests (POS-008 proposal) |
| `packages/contracts` | Reserved for Zod contracts (POS-010) |
| `packages/domain` | Reserved for VND/business logic (POS-010) |
| `packages/db` | Reserved for Drizzle/Neon migrations (POS-009/POS-012) |
| `packages/config` | Shared TypeScript tooling boundary |

See [Desktop README](apps/desktop/README.md), [API README](apps/api/README.md), [Development Setup](docs/DEVELOPMENT_SETUP.md), [Development Status](project-management/DEVELOPMENT_STATUS.md), [Session Handoff](project-management/SESSION_HANDOFF.md) and [Backlog](project-management/BACKLOG.csv).

## Boundaries

- No Neon credentials, authentication, sales, stock or SQLite persistence in POS-008.
- All business values in VND are integer/bigint when those modules are implemented; no float money calculations.
- Do not commit `.env`, local SQLite files, tokens, private data or real customer sales.
- Keep secrets server-side in future issues; Electron renderer must never access Neon directly.
- GitHub commit, CI and issue/PR state are authoritative; documentation may lag merge events.
