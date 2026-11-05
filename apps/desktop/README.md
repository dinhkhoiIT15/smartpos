# SmartPOS Desktop — POS-007

**Status:** Electron + React/Vite development shell; **not a POS application capable of sales**.

## Run on Windows/macOS

Use Node.js 24.x and pnpm 10.20.0. From the **repository root**:

```bash
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop dev
```

Electron should open a SmartPOS desktop window. Click **Kiểm tra Electron IPC**. Expected result: a green line containing `SmartPOS Retail v0.1.0 — DEMO_ONLY`. The frontend is a demo shell: catalog, checkout, stock and sync remain disabled.

### Typecheck / build / security checks

```bash
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm --filter @smartpos/desktop preview
```

`build` creates Electron main/preload and Vite renderer bundles in `apps/desktop/out/`; `preview` opens the compiled build using local Electron. This is **not an installer**; packaging/signing happens in POS-028.

## Architecture and security boundary

- `src/main/index.ts`: creates BrowserWindow, enforces `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`; blocks navigation/popup/webviews; denies permission prompts.
- `src/preload/index.ts`: fully bundled CommonJS preload with a narrowly scoped `window.smartpos.getAppInfo()` method. Electron internals are not exposed.
- `src/renderer/`: React/Vite only; no Node.js filesystem API, local database access or Neon credential.
- `electron.vite.config.ts`: stricter production content security policy; development permits the React refresh script for HMR while only accepting loopback URLs.
- `scripts/security-check.mjs`: *static* source regression checks, **not a proof of runtime security**. Manual smoke verification and later security E2E are necessary.

### Manual smoke acceptance

1. Start `pnpm --filter @smartpos/desktop dev`, confirm desktop window appears with clear **DEMO** label.
2. Click the IPC button; expect `DEMO_ONLY` response and no error.
3. Confirm attempting navigation/popup to unrelated websites does not open new pages (review security behavior in DevTools; automated tests come later).
4. Close the window; app exits on Windows or can be quit from macOS app menu.
5. Run `pnpm --filter @smartpos/desktop build` and `preview` to verify compiled files load.
6. Compare `node --version`, `pnpm --version`; note platform, logs and commit SHA in the POS-007 issue.

### Troubleshooting

- Electron binary missing: check whether `pnpm install` executed allowed Electron postinstall scripts; `onlyBuiltDependencies` includes `electron` and `esbuild` in the root workspace.
- Blank screen: run `pnpm --filter @smartpos/desktop build` and inspect Electron DevTools for preload errors. Do not disable isolation/sandbox as a workaround.
- `pnpm install --frozen-lockfile` mismatch: **do not** silently disable frozen install. Regenerate lockfile with pinned pnpm on the feature branch, commit, and rerun CI.
- This branch never creates `.env` or a database; no Neon connection is required for POS-007.

## Next issues

POS-008 will provide a Fastify `/v1/health` endpoint; POS-009 Neon dev connectivity; POS-010 domain contracts; POS-013 local SQLite. Real offline checkout and sync come later (POS-019 through POS-024). Never enter or rely on real sales data in this demo.
