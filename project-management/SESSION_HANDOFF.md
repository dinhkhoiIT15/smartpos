# Session Handoff — POS-024 SmartPOS

## Verified main / branch

- User confirmed POS-023 Windows PASS. GitHub verified [PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44) merged into main at `f102091c6de9ba4d6616129d7df2129415173377` and [Foundation CI #42451595741](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42451595741) all jobs SUCCESS; Issue #43 closed after owner acceptance.
- POS-024 [Issue #45](https://github.com/dinhkhoiIT15/smartpos/issues/45) and [Draft PR #46](https://github.com/dinhkhoiIT15/smartpos/pull/46) branch `feature/POS-024-conflict-review` created from exactly that main SHA. **NOT merged / owner Windows PASS pending**.

## Implementation

- `apps/api/src/sync/conflict-review.ts`: internal PostgreSQL `ConflictReviewService` with strict list + record get, enforce active manager/admin role on store_memberships/users at transaction time. Cross-store conflict join by `sales.store_id`, no disclosure; bounded lists.
- Review requires stable UUID `resolutionId`, 12–1000 character note. `SELECT FOR UPDATE` row lock serializes concurrent resolutions. The status change OPEN -> RESOLVED plus append-only `audit_logs` actor/note/key commit together; repeat same actor/key/note returns REPLAYED and different resolution yields 409. A forced audit failure rolls everything back. No adjustments to financial sale/items/CASH, stock movements/balance, conflict details or immutable POS-021 receipt/ACK.
- `apps/api/src/sync/conflict-review-routes.ts` registered in `buildServer` only when tests supply `conflictReview`; actual main.ts supplies no resolver. An `x-role: ADMIN` spoof must never unlock routes, which remain HTTP 404. No real D-013 signed grants/employee sessions.
- `apps/desktop/src/renderer/src/conflict-demo.tsx`: clearly labeled fixed synthetic shortage and stale price, filter/list/details/in-memory review note. No PostgreSQL, SQLite, IPC, auth or real audit. Status resets after reload.
- API route tests, disposable PG16 real POS-021 generated conflicts integration and Linux+Windows CI configured; SQLite and PG migrations unchanged.
- Files are limited to API sync, server opt-in, desktop renderer demo, CI, docs. No new packages or Neon access.

## Testing and safety

- Windows (safe): `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/api test:conflicts`, `pnpm --filter @smartpos/desktop typecheck`, `pnpm --filter @smartpos/desktop build`, `pnpm run check`, then `pnpm --filter @smartpos/desktop dev`.
- Normal Fastify health 200, `GET /v1/sync/conflicts` 404, `POST /v1/sync/conflicts/:id/resolve` 404; demo preview should be clearly synthetic and non-persistent.
- `test:conflicts:pg` ONLY GitHub disposable PostgreSQL 16 at 127.0.0.1:5432/smartpos_ci; NEVER Neon.
- Review [full acceptance](../docs/POS-024_CONFLICT_REVIEW_ACCEPTANCE.md). **GitHub final SHA CI results are not yet verified in this snapshot.** Must check Foundation and Docs CI before claiming PASS.

## Remaining blockers

D-013 device-bound signature/shift/session verification, POS-025 real auth/RBAC, POS-023 late-ACK conservative stock understatement and operational stock-adjustment policy before pilot. Current internal review does not change inventory. Keep PR **Draft and unmerged** until owner Windows PASS and manual merge.
