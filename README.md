# SmartPOS Retail — TypeScript Monorepo Foundation

**Status:** M1 / POS-007 secure Electron desktop demo in an open Pull Request. The approved business baseline is unchanged; there is no working sales checkout or database yet.

SmartPOS is an offline-first desktop POS learning project for one electronics/phone store: one cashier device can sell offline, SQLite holds unsynced cash sales, and a future Fastify API syncs with Neon PostgreSQL. For approved scope see [PRD](docs/PRODUCT_REQUIREMENTS.md), [architecture](docs/SYSTEM_ARCHITECTURE.md) and [offline sync policy](docs/OFFLINE_SYNC_DESIGN.md).

## Requirements

- Git
- **Node.js 24.x** (pinned in `.node-version`)
- **pnpm 10.20.0** (pinned in root `package.json`)

To install pnpm when it is missing, use a compatible Node.js/Corepack setup or `npm install --global pnpm@10.20.0`. Do not use npm/yarn to create additional lockfiles.

## Set up workspace (from repository root)

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm -r list --depth -1
pnpm run check
pnpm run context:report
```

`pnpm run check` runs M0 documentation/syntax checks, manifest/workspace validation and TypeScript strict typechecks. These **are not** desktop E2E, Fastify API integration or PostgreSQL tests.

## Desktop demo — POS-007 (once PR #8 is merged)

A real Electron window with a React/Vite dashboard and a read-only IPC demo is under review in [PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8). To test the feature branch before merge, follow [Desktop README](apps/desktop/README.md).

```bash
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop dev
```

In the window, click **Kiểm tra Electron IPC**; expected response contains `DEMO_ONLY`. To compile without launching a GUI:

```bash
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
```

**Warning:** This is a development-only desktop demo, not a finished POS. No catalog, checkout, SQLite offline sales, Fastify API or Neon integration exists yet. Installation packaging/signing belongs to POS-028.

## Workspace packages

| Workspace | Purpose now | Runtime implementation |
|---|---|---|
| `apps/desktop` | Electron + React/Vite demo shell in PR #8 | Real offline checkout follows in later issues |
| `apps/api` | TypeScript package boundary | Fastify health endpoint in POS-008 |
| `packages/contracts` | Shared types/validation boundary | Zod contracts in POS-010 |
| `packages/domain` | Pure business rules boundary | VND/cart domain in POS-010 |
| `packages/db` | Database code boundary | Neon + Drizzle in POS-009/POS-012 |
| `packages/config` | Future shared tooling config | Tooling extracted when useful |

Other workspace packages remain empty TypeScript boundaries. The desktop has its own `dev`, `build`, `preview`, `typecheck` and `security:check` scripts; use `pnpm --filter @smartpos/desktop <script>`. Root-level `pnpm dev` and database migration commands are **not** implemented. There is no Neon connection and no local SQLite database yet.

## Documentation and AI handoff

1. Read [AGENTS.md](AGENTS.md), [Business Rules](docs/BUSINESS_RULES.md) and [Security](docs/SECURITY.md).
2. Check [Development Status](project-management/DEVELOPMENT_STATUS.md) and [Session Handoff](project-management/SESSION_HANDOFF.md) against actual GitHub HEAD/CI.
3. Use [Backlog](project-management/BACKLOG.csv), [TODO](project-management/TODO.md) and GitHub Issues to select work.
4. Before coding, follow [CONTRIBUTING.md](CONTRIBUTING.md) and [Development Setup](docs/DEVELOPMENT_SETUP.md).

No real credentials, local database files or sensitive sales data may be committed. `.env.example` contains placeholders only. The logical database model is in [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) and is not a deployed migration.

M0 is completed only when [M0 Checklist](project-management/M0_CHECKLIST.md) is verified with actual commit/PR/CI evidence.
