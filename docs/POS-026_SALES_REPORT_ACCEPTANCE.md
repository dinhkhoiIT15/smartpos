# POS-026 — Sales history and separated cloud/local reporting (M5/P1)

**[Issue #49](https://github.com/dinhkhoiIT15/smartpos/issues/49) • [Draft PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50)** (number must match the PR actually created).
Based on owner-accepted POS-025 [PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48), verified main merge `efd18aeaaf524660ef33867c76048a936da889d9`, [post-merge Foundation CI #42598447814](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42598447814) SUCCESS.

## What is implemented — no live operations

- **Cloud PostgreSQL internal report:** read-only `SalesReportService` `apps/api/src/reporting/sales-report.ts` returns **only server-committed POSTED sales**. A trusted POS-025 server session resolver can be injected to test. Every query rechecks `users.active`, `store_memberships.active`, actual role and store. ADMIN/MANAGER see own store; CASHIER **own** sales only. Role/store/client headers are not trusted. Date based on *client-created time* rendered in `Asia/Ho_Chi_Minh` (not settlement/server-received time). Page 1–100, offset <=10000, interval <=31 calendar dates; exact sale amount and full summary across all matches despite pagination. `matchedSalesGrossVnd` means the **full total of sales that contain the optional SKU**; `skuLineGrossVnd` is **only** filtered SKU line total. They MUST NOT be confused; top 50 SKU is labeled truncated if more exist. Cloud POSTED sale with conflict still counts as accepted paid sale (not conflict-free).
- **SQLite read-only local report:** `apps/desktop/src/main/local-db/sales-report.ts` stays Electron MAIN-only, reads local paid-sale/items/CASH payment/outbox, verifies each persisted receipt including payload hash and line totals before aggregating. Categories are `LOCAL_PENDING` (PENDING/SYNCING/RETRY), `LOCAL_NEEDS_REVIEW_UNCONFIRMED` (not confirmed server-absent), and `SERVER_ACKED_MIRROR` (ACKED copy; **NOT new cloud revenue**). Bounded full scan cap 5000: refuses oversized views rather than return falsely complete totals. VND summary uses BigInt string decimals, not floating point. Wrong store/device/cashier scope fails; sale/stock/payments/ACK never mutate. No SQLite schema migrations.
- **Demo-only renderer:** synthetic tab "Lịch sử & báo cáo (demo)" with four static mock records. Same demo sale `DEMO-001` appears in cloud and local ACK mirror intentionally. Four category totals are kept separate. React has no real HTTP/SQLite/IPC or credentials; data resets on reload. **No combined real sales total.**
- **Test-only route:** opt-in `GET /v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD`. Normal Fastify main.ts returns HTTP **404** to this route even with forged `x-role` or Authorization; true staff login, HTTPS/device grants, key storage and D-013 are NOT complete.
- **PostgreSQL** migration from POS-025 is reused, no new migrations. No Neon access, no real customer data.

## Why a single combined cloud+offline total is prohibited

Server `CLOUD_POSTED` is the authoritative set of committed remote sales. A SQLite `SERVER_ACKED_MIRROR` of the same sale MUST NOT be counted again. A local `LOCAL_PENDING` or `LOCAL_NEEDS_REVIEW_UNCONFIRMED` may still have reached the server with an ACK lost or a retry pending. Consequently adding "cloud total + pending local total" is **not a proven correct worldwide total**. Keep separate projections until durable server cross-source dedup/reconciliation is enabled and verified. Local status is not evidence that the cloud lacks a sale.

## Windows PowerShell SAFE acceptance

Run from `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-026-sales-reporting
git pull --ff-only origin feature/POS-026-sales-reporting
git log -1 --oneline

node --version
pnpm --version
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

Expected **Node 24.x**, pnpm **10.20.0**, exit code **0** on every command, zero failed tests. These commands do not access Neon.

**Never run** `pnpm --filter @smartpos/api test:report:pg` with a Neon URL or `pnpm --filter @smartpos/db migrate:dev` without separate owner approval. PostgreSQL tests are restricted to disposable CI PostgreSQL16 at `127.0.0.1:5432/smartpos_ci`. CI tests store-scoped reporting, suspended user, wrong role, cashier-only records, zone date boundary, exact >2^53 VND, SKU line totals versus whole-sale totals, invariant no writes or double stock.

## Manual demo UI

```powershell
pnpm --filter @smartpos/desktop dev
```

1. Launch **Electron** and confirm Overview Electron bridge remains `DEMO_ONLY`, SQLite schema v1.
2. Click **Lịch sử & báo cáo (demo)** in left sidebar. Prominent warning says synthetic, no live invoices, no customer revenue.
3. Review FOUR categories: cloud posted, local server-ACK mirror, local pending, unconfirmed review. **DEMO-001** occurs twice deliberately; ACK mirror must explicitly state **do not add again**.
4. Filter by date (08/11 and 09/11), cashier (A/B), SKU (PHONE-128/CASE-01) and state; observed counts/totals change only within each category. No combined cloud+offline revenue is shown.
5. Browse old cart/sample receipt and conflict demo; nothing is connected to real checkout, printing paid proof, or automatic sync.
6. Reload; demo records remain fixed. No local paid sale/outbox status change is performed.

The Vite browser tab deliberately lacks Electron preload/IPC; check IPC using the **Electron app**, not ordinary web page.

## Fastify default deny smoke

In terminal 1:

```powershell
pnpm --filter @smartpos/api dev
```

In another:

```powershell
curl.exe -i "http://127.0.0.1:3001/v1/health"
curl.exe -i "http://127.0.0.1:3001/v1/reports/sales?from=2026-11-08&to=2026-11-09"
curl.exe -i -H "x-role: ADMIN" "http://127.0.0.1:3001/v1/reports/sales?from=2026-11-08&to=2026-11-09"
```

Expected: health 200, all real report paths **HTTP 404**. `GET /v1/reports/sales` is only opt-in Fastify.inject testing, not an advertised running endpoint.

## Acceptance checklist

- [ ] Final PR SHA Foundation CI Linux/API, Windows Node24 + disposable PostgreSQL16 **all green**
- [ ] Documentation CI at same SHA **green**
- [ ] Windows safe test commands **all PASS** including local file-backed receipt/ACK checks and API route guard
- [ ] Demo shows source-separated figures, explicit mirror and uncertain-review label and no fabricated aggregate
- [ ] Previous Electron sample cart/receipt/IPC/conflict pages unaffected
- [ ] Fastify report paths 404, no Neon migration or production writes
- [ ] Owner reviews security boundaries, reports PASS, manually merges Draft PR; close issue after verified merge

**Not production-ready:** D-013 signed device/shift grants, Argon2id online login/rate limit, OS-backed credentials and the POS-023 late-ACK stock rebase caveat still block live sync/checkout.
