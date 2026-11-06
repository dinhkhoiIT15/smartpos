# @smartpos/domain — POS-010

Pure cash/VND logic, aligned with BR-002 (integer VND, qty positive, tendered >= due).

`calculateLineTotalVnd({quantity, unitPriceVnd, discountVnd})`: quantity × unit price − total line discount.

`calculateCashTotals(lines, tenderedVnd)`: returns subtotal, total line discounts, amount due and change in `bigint`.

All amounts must be nonnegative and within signed PostgreSQL 64-bit range. Overflow, excessive discount, invalid quantity and insufficient cash are rejected; there are no floating point operations.

Example: `8_990_000n + 350_000n = 9_340_000n`, tender `9_500_000n`, change `160_000n`.

```bash
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
```

This is an isolated calculation primitive, **not** offline checkout implementation. Atomic SQLite write/outbox, audit, price validation and server reconciliation are future issues.
