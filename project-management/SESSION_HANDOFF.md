# Session Handoff — SmartPOS

## POS-018 cash cart preview — 2026-11-08

- Repo: https://github.com/dinhkhoiIT15/smartpos
- GitHub verified `main` SHA `28d38555d358c0fad012702a529fbd0c2bffb5d3` is [POS-017 PR #32](https://github.com/dinhkhoiIT15/smartpos/pull/32) merged and owner Windows PASS. POS-016/#30 and preceding merged work accepted.
- Current [POS-018 Issue #33](https://github.com/dinhkhoiIT15/smartpos/issues/33), branch `feature/POS-018-cash-cart-preview`, **NOT MERGED**. `DEVELOPMENT_STATUS.verified_commit` is verified main not feature HEAD.

## Changed scope

- `packages/domain/src/index.ts` factors `calculateCartAmounts` so both cash calculation and pre-tender totals use one bigint arithmetic source.
- `packages/domain/src/cart.ts` pure cart APIs add/merge/update/remove/preview/format. Immutable price/name/SKU/attributes snapshots, exact VND decimal strings, max 100 lines/quantity 2,147,483,647, validated synthetic available stock, detect duplicate/stale variant, insufficient tender/overflow; **not persisted**.
- `packages/domain/src/cart.test.ts` 7 unit cases with 9.340.000→9.500.000→160.000 business example.
- `apps/desktop/src/renderer/src/app.tsx` and `styles.css`: responsive demo cart tab with SKU search, static synthetic catalog, quantity controls, cash input, shortfall/change. Huge DEMO warning and no payment-complete button.
- `apps/desktop/package.json`, `packages/domain/package.json`, `pnpm-lock.yaml`: existing workspace dependency `@smartpos/domain/cart`, no new external package. Windows CI domain tests and desktop TS; existing Linux CI remains.
- [Full Windows acceptance](../docs/POS-018_CASH_CART_ACCEPTANCE.md), relevant README and traceability.
- No change to SQLite schema, local device real data, Neon, server authentication, Fastify, sales, payments, outbox or actual stock. Demo renderer fixture is not authorized source data; POS-019 must reverify real sale inputs in MAIN under authenticated device/cashier.

## Owner checks Windows

```powershell
git status --short
git fetch origin
git switch feature/POS-018-cash-cart-preview
git pull --ff-only origin feature/POS-018-cash-cart-preview
pnpm install --frozen-lockfile
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
pnpm --filter @smartpos/desktop dev
```

Open **Giỏ hàng & tiền mặt (demo)**. Add `PHONE-128` (8.990.000 ₫) and `CASE-01` (350.000 ₫), due 9.340.000 ₫. Receive `9500000`: change 160.000 ₫. Receive `9000000`: shortfall 340.000 ₫. Invalid decimal/over-limit/malformed input shows validation. Quantity beyond sample stock denied; out-of-stock/inactive disabled. Verify **no real sale** and original `getAppInfo` IPC works. Review code/security and accept only after all CI successful.

## Pending after POS-018

- POS-019 verified offline device/cashier + SQLite transaction (sale/items/payment/stock/outbox), robust retry and abort/crash tests, no completed sale from untrusted renderer calculation. Real staff auth D-013 unresolved.
- POS-020 internal receipt, POS-021 server idempotent push, POS-022 retry outbox, POS-023 authenticated catalog pulls. No production rollout or Neon writes.
