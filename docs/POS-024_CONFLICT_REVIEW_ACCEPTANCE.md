# POS-024 — Manager conflict review + audit (M4/P0) Windows acceptance

**Issue [#45](https://github.com/dinhkhoiIT15/smartpos/issues/45) • Draft PR [#46](https://github.com/dinhkhoiIT15/smartpos/pull/46)**
Base: owner-accepted POS-023 merge `f102091c6de9ba4d6616129d7df2129415173377`.

## Important status

- **INTERNAL ONLY.** Real staff RBAC/login/OS key/signed offline grant (D-013 / POS-025) is not implemented. Normal Fastify `main.ts` must return **HTTP 404** for ALL conflict review routes, as well as sync PUSH/PULL.
- PostgreSQL `ConflictReviewService` uses trusted-injected manager/admin principal **plus authoritative active store membership and role recheck**. All SQL queries join `sales.store_id` to avoid cross-store leak. Reads/list are bounded. Cashier and revoked/role-changed staff cannot review.
- `resolve` requires a stable UUID `resolutionId` and 12–1000 character nonempty note. Under row lock, it changes OPEN -> RESOLVED and writes append-only `audit_logs.SYNC_CONFLICT_RESOLVED` in **the same transaction** with actor/note/key. Same actor+key+note retry returns REPLAYED without duplicate audit; divergent follow-up returns 409. Audit INSERT failure rolls status back to OPEN.
- No stock correction or price rewrite occurs in review. If a shortage needs correcting, an authorized separate inventory movement with its own reason/audit is mandatory. Always retain original sale/items/payment, balance/movements, POS-021 receipt/ACK and conflict details.
- Electron 'Đối soát xung đột (demo)' tab contains two fixed synthetic records. Marking one reviewed only updates React memory; reload restores it. **No real PostgreSQL, IPC, token, authentication, audit or stock modification.**
- PostgreSQL schema v1 and SQLite schema v1 unchanged. No Neon writes, no migrations and no third-party dependencies.

## Windows PowerShell — SAFE (no database credentials)

From `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-024-conflict-review
git pull --ff-only origin feature/POS-024-conflict-review
git log -1 --oneline
node --version
pnpm --version
pnpm install --frozen-lockfile

pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:conflicts
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Expect Node 24.x, pnpm 10.20.0, exit code 0 and **zero failed tests**. All these scripts run without Neon or a production database.

**Never run `test:conflicts:pg` against Neon.** Its URL guard accepts only `127.0.0.1:5432/smartpos_ci`, and the disposable GitHub CI PostgreSQL 16 job applies migrations and then runs this test. It tests genuine POS-021 stock shortage + stale price, business evidence immutability, manager-only store scoping, 6 concurrent identical resolutions, one audit, conflicting retry 409, role revocation and rollback after injected audit failure.

## Manual Electron demo

```powershell
pnpm --filter @smartpos/desktop dev
```

1. Window opens in `DEMO_ONLY` mode; existing cart/print demo still works.
2. Select **Đối soát xung đột (demo)** in the left sidebar. Look for the large disclaimer and two synthetic cases: **Thiếu tồn kho** and **Chênh lệch giá**.
3. Inspect before/after quantity for PHONE-128 and sold/server VND price for CASE-01. Prices must remain the original sold-price snapshot on the screen.
4. Enter a note shorter than 12 characters; it is rejected by the demo UI. Enter a longer note and select **Đánh dấu đã rà soát — DEMO**; the status changes in React memory only.
5. Filter to 'Đã ghi nhận'; your simulated note appears. Reload the page/app; the two records return to OPEN. No real SQLite sale/outbox/stock, Neon's data or audit is touched.
6. Open the Vite page directly in the web browser: the Electron preload/IPC button on the Overview tab may be unavailable; this is expected outside Electron and unrelated to POS-024.

## API deny-by-default smoke test

In a PowerShell window:

```powershell
pnpm --filter @smartpos/api dev
```

In another:

```powershell
curl.exe -i http://127.0.0.1:3001/v1/health
curl.exe -i http://127.0.0.1:3001/v1/sync/conflicts
curl.exe -i -H "x-role: ADMIN" http://127.0.0.1:3001/v1/sync/conflicts
curl.exe -i http://127.0.0.1:3001/v1/sync/pull?cursor=0
```

Expected: health 200, all other routes 404. Never expose synthetic resolver/manager permission via HTTP.

## Acceptance checklist

- [ ] Foundation CI final PR HEAD Linux/API, Windows Node24, PostgreSQL16 disposable all success.
- [ ] Documentation CI final PR HEAD success.
- [ ] Windows PowerShell safe scripts all PASS.
- [ ] Synthetic UI status, filters, note validation, memory-only reset PASS.
- [ ] API health 200, conflict/sync endpoints 404 even with fake headers.
- [ ] Review/audit is non-destructive. D-013/POS-025 and POS-023 late-ACK conservative stock understatement remain unresolved for commercial rollout.
- [ ] Owner explicitly confirms Windows PASS and manually merges Draft PR after security review.

No genuine customer or real paid-sale data is authorized by these tests.
