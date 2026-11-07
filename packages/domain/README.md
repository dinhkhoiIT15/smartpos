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

## POS-018 cart + cash-change preview

`@smartpos/domain/cart` exports `addCartVariant`, `setCartQuantity`, `removeCartVariant`, `previewCashCart` and `formatVnd`. All amounts are canonical decimal VND strings for UI input/output, internally using `bigint`; no float money arithmetic. Duplicate SKU adds quantity; price/attributes are snapshot-locked, with bounded stock and quantity. `calculateCartAmounts` previews subtotal/discount/amount due without inventing a payment; `calculateCashTotals` continues to reject insufficient tender.

This is an in-memory **estimate**, not trusted sale authentication, card processing, persistent checkout or stock mutation. The Electron demo does not call POST APIs, import a real catalog or write sales. Execute `pnpm --filter @smartpos/domain test` to run the unit cases. Review [POS-018 acceptance](../../docs/POS-018_CASH_CART_ACCEPTANCE.md).
