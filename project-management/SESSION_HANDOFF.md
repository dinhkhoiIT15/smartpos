# Session Handoff — POS-026 sales reports (M5/P1)

## GitHub verified main

- Owner confirmed POS-025 Windows PASS and merge; GitHub verified [PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48) merged at main `efd18aeaaf524660ef33867c76048a936da889d9`; [post-merge Foundation CI #42598447814](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42598447814) SUCCESS.
- [Issue #49](https://github.com/dinhkhoiIT15/smartpos/issues/49), [Draft PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50), branch `feature/POS-026-sales-reporting` from that exact main SHA. **NOT merged**; owner Windows PASS pending.

## Scope / code

- Server `apps/api/src/reporting/sales-report.ts`: internal read-only PostgreSQL sales history/source CLOUD_POSTED with authoritative current user/store/role recheck, CASHIER own-only. Use client's created timestamp grouped in Asia/Ho_Chi_Minh; not a server settlement date. Query 1..100 page, max 31 local days. Summaries cover all filtered records even if page returns one. Money is string and PG numeric. Distinguish full-sale totals where SKU appears from only matching SKU-line totals. Includes conflict counts; server POSTED with unresolved conflict stays posted.
- `apps/api/src/reporting/sales-routes.ts`: opt-in Fastify.inject trusted resolver only; `main.ts` does not mount report, fake x-role/Bearer remains HTTP 404. POS-025 trusted internal staff principal can be injected only in tests.
- SQLite `apps/desktop/src/main/local-db/sales-report.ts`: MAIN-only read-only paid history, verify each receipt, CASH payment, outbox evidence/hash, classify pending/review-unconfirmed/server ACKED mirror; group day, cashier, SKU and exact VND with BigInt. Refuse >5000 local sales rather than fake totals. NO combined cloud+local total due lost ACK and mirror double count; no writes or IPC.
- `apps/desktop/src/renderer/src/sales-report-demo.tsx`: 4 fixed synthetic records, `DEMO-001` intentionally cloud+local ACK mirror; filters date, cashier, SKU, kind. Prominent DEMO only; existing cart, receipt, conflict and Electron IPC unaffected.
- CI Linux/Windows Node24/disposable PG16 reporting tests; no Neon, no new deps, no migrations.
- Full [acceptance guide](../docs/POS-026_SALES_REPORT_ACCEPTANCE.md).

## Windows safe acceptance

```powershell
git fetch origin
git switch feature/POS-026-sales-reporting
git pull --ff-only origin feature/POS-026-sales-reporting
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop test:sales-report
pnpm --filter @smartpos/desktop test:sales-report:boundary
pnpm --filter @smartpos/api test:report
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Fastify health 200, `/v1/reports/sales?from=2026-11-08&to=2026-11-09` 404 even with fake admin. Electron report demo must not expose real DB or add mirrored ACK to server totals. PostgreSQL `test:report:pg` only GitHub disposable PostgreSQL16 `127.0.0.1:5432/smartpos_ci`, never Neon.

## Handoff status

Before reporting final CI green, **verify workflows on final feature HEAD**. Some early intermediate commits may fail and must be fixed, not counted as PASS. Owner Windows PASS/security review **pending**, PR remains DRAFT, no merge. D-013 live login/device grant and POS-023 late ACK remain blockers. After owner merge move to POS-027 secrets/IPC/local data protection (M5/P0).
