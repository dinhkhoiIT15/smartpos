# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: 28d38555d358c0fad012702a529fbd0c2bffb5d3
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator can open branches/Issues/PRs; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M3 — cash cart and preview before persisted offline sales
current_phase: POS-018 interactive demo cart / pure bigint VND cash preview — feature branch review pending
ci_status: POS-018 latest feature HEAD CI NOT YET VERIFIED; must check GitHub before acceptance
production_status: NOT DEPLOYED — no real login, checkout, sync API, worker or Neon payment writes

## Owner-accepted and merged foundation

- POS-001/002/004 workspace/docs; POS-007 Electron; POS-008 Fastify health; POS-009 read-only Neon DEV connectivity; POS-010 shared Zod and bigint domain; POS-011 offline grant four-hour policy **design only**, D-013 real auth remains open.
- POS-012 PostgreSQL schema v1 17 tables merged, owner confirmed only on Neon development. POS-013 SQLite v1 and Windows cleanup accepted, 9 STRICT tables, no production checkout.
- POS-014 catalog/variants, POS-015 stock balances/atomic movements merged, normal runtime APIs still deny real routes absent auth.
- POS-016 v1 sync contract PR #30 merged; no live HTTP sync.
- POS-017 [PR #32](https://github.com/dinhkhoiIT15/smartpos/pull/32) **merged/owner Windows PASS** at verified [main SHA `28d38555d358`](https://github.com/dinhkhoiIT15/smartpos/commit/28d38555d358c0fad012702a529fbd0c2bffb5d3) on 2026-11-07. MAIN-only `catalog-cache.ts` supports atomic initial trusted snapshot + cursor and safe SKU read, no renderer importer. Source-of-truth GitHub merge and owner message supersede stale prior handoff.

## POS-018 feature branch pending acceptance

- [Issue #33](https://github.com/dinhkhoiIT15/smartpos/issues/33), branch `feature/POS-018-cash-cart-preview` based on verified `main`.
- [POS-018 Windows acceptance](../docs/POS-018_CASH_CART_ACCEPTANCE.md) describes demo-only UI and no sale authorization.
- Pure `@smartpos/domain/cart`: immutable SKU/price snapshots in memory, deterministic merge/update/remove with bounded quantity/store's sample stock, `BigInt` signed-64-bit canonical money string calculations, cash shortfall/change preview; extends `calculateCartAmounts` while retaining `calculateCashTotals`.
- Electron React sidebar demo cart: hardcoded synthetic SKU examples, search, quantity increment/decrement/edit, remove/clear, tender input and summary, explicit DEMO warning and **no checkout/receipt/SQLite/network write**.
- Unit tests `packages/domain/src/cart.test.ts`: 7 cases for BR-002 9,340,000 due / 9,500,000 received / 160,000 change, duplicate SKUs, stock bounds, malformed and overflow VND, insufficient tender and no fabricated sale.
- Desktop adds existing workspace domain dependency to package/lock, no new remote dependency. Linux CI existing domain/build; Windows Node24 now runs domain test and desktop TS check in addition to SQLite checks.
- CI and owner Windows UI acceptance still required. Do not claim PR merged, real sale processing, network sync or security-approved auth.

## Next actions

1. Open/check POS-018 draft PR from feature branch and retrieve GitHub CI latest SHA.
2. Owner Windows: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/domain typecheck`, `pnpm --filter @smartpos/domain test`, `pnpm --filter @smartpos/desktop typecheck`, `pnpm --filter @smartpos/desktop security:check`, `pnpm --filter @smartpos/desktop build`, `pnpm run check`, `pnpm --filter @smartpos/desktop dev`; verify two-SKU example and no real completion button.
3. Merge PR only after CI, owner review and local Windows UI PASS. Keep Issue #33 open until accepted merged.
4. POS-019 follows for authenticated offline atomic sale/items/payment/stock/outbox; POS-020 receipt, POS-021–023 sync and D-013 real auth remain unimplemented. D-009 local backup encryption/recovery OPEN.
