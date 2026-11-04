# SmartPOS Retail — TypeScript Monorepo Foundation

**Status:** M0 / POS-001 workspace preparation. Business baseline v1.0 remains locked; no working POS application yet.

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

## Workspace packages

| Workspace | Purpose now | Runtime implementation |
|---|---|---|
| `apps/desktop` | TypeScript package boundary | Electron + React/Vite in POS-007 |
| `apps/api` | TypeScript package boundary | Fastify health endpoint in POS-008 |
| `packages/contracts` | Shared types/validation boundary | Zod contracts in POS-010 |
| `packages/domain` | Pure business rules boundary | VND/cart domain in POS-010 |
| `packages/db` | Database code boundary | Neon + Drizzle in POS-009/POS-012 |
| `packages/config` | Future shared tooling config | Tooling extracted when useful |

Each package currently has a manifest, TypeScript config and a deliberately empty module in `src/index.ts`. `pnpm dev`, `pnpm build`, `pnpm db:migrate` and POS features are **not** implemented. There is no Neon connection and no local SQLite database yet.

## Documentation and AI handoff

1. Read [AGENTS.md](AGENTS.md), [Business Rules](docs/BUSINESS_RULES.md) and [Security](docs/SECURITY.md).
2. Check [Development Status](project-management/DEVELOPMENT_STATUS.md) and [Session Handoff](project-management/SESSION_HANDOFF.md) against actual GitHub HEAD/CI.
3. Use [Backlog](project-management/BACKLOG.csv), [TODO](project-management/TODO.md) and GitHub Issues to select work.
4. Before coding, follow [CONTRIBUTING.md](CONTRIBUTING.md) and [Development Setup](docs/DEVELOPMENT_SETUP.md).

No real credentials, local database files or sensitive sales data may be committed. `.env.example` contains placeholders only. The logical database model is in [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) and is not a deployed migration.

M0 is completed only when [M0 Checklist](project-management/M0_CHECKLIST.md) is verified with actual commit/PR/CI evidence.
