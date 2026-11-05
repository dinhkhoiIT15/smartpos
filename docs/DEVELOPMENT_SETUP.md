# SmartPOS — Development Setup (M1 POS-007)

**Status:** POS-001 workspace merged; POS-007 Electron/React demo in [PR #8](https://github.com/dinhkhoiIT15/smartpos/pull/8). This is not a functioning checkout or synced POS.

## Prerequisites

- Git and access to `dinhkhoiIT15/smartpos`.
- Node.js **24.x** (`.node-version`).
- pnpm **10.20.0** (`package.json` `packageManager`); install via compatible Corepack or `npm install --global pnpm@10.20.0` if needed.
- Windows/macOS workstation; GitHub Actions uses Ubuntu to validate M0 checks.

## Install and verify (from project root)

```bash
git status --short
git branch --show-current
git rev-parse HEAD
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm -r list --depth -1
pnpm run check
pnpm run context:report
```

**Expected:** Six workspace packages are listed; `pnpm run check` runs `ci:m0`, `workspace:check`, then `typecheck`. A successful check only validates documentation, manifests and simple TypeScript module boundaries, **not** application features.

If `pnpm install --frozen-lockfile` fails because the lockfile differs from manifests, do not silently disable frozen mode in CI. Re-generate the lockfile with the pinned pnpm version on the feature branch, review its diff, commit it, and rerun the check.

## Repository structure

- `apps/desktop`: secure Electron + React/Vite development shell proposed in POS-007 PR #8. Not a sales application.
- `apps/api`: Fastify **planned POS-008**, no health endpoint yet.
- `packages/contracts` and `packages/domain`: future shared Zod contracts/business rules (POS-010).
- `packages/db`: Neon/Drizzle **planned POS-009/012**. No schema migrations yet.
- `packages/config`: reserved for shared tooling.
- `scripts/validate-workspace.mjs`: manifest/tsconfig/lockfile structural checks.

Desktop has scoped `dev`, `build`, `preview` and `security:check` commands. Root `pnpm dev`, root `pnpm build`, POS tests and `pnpm db:migrate` do **not** exist yet.

## Launch desktop shell (after checking out PR #8 branch or after merge)

```bash
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop dev
```

Click **Kiểm tra Electron IPC** and verify `DEMO_ONLY`; keep in mind no actual sales functionality exists. You can also compile and check without GUI:

```bash
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
```

See [desktop README](../apps/desktop/README.md) for detailed smoke checks and troubleshooting. CI can compile the app but cannot prove it opens correctly on an actual Windows/macOS display. The repository owner should verify on a workstation before merging POS-007.

## Security

- `.env.example` is a fake sample; never commit a real `.env`.
- Neon `DATABASE_URL` will belong only to the server API process, never the desktop renderer.
- Database/environment plan: [NEON_SETUP.md](NEON_SETUP.md), [ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md).
- Read [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md) and [SESSION_HANDOFF.md](../project-management/SESSION_HANDOFF.md) before editing.

## Source of truth

GitHub commit + code + CI evidence take precedence over a stale status document. The `context:report` script is read-only and does **not** contact GitHub. Record CI run links and the correct base/feature commit when handing off a coding session.
