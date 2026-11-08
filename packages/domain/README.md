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

## POS-020 internal cash receipt model (not a tax invoice)

`@smartpos/domain/receipt` provides `buildPersistedInternalReceipt` for validated **MAIN-only** immutable SQLite evidence and `createDemoInternalReceipt` for a **permanently watermarked, never-posted sample**. Receipt view models include SKU/name/attributes, integer quantity, VND decimal-string unit price/line discount/total, subtotal/due, cash tendered/change, and deterministic `Asia/Ho_Chi_Minh` display time. All money checks use `bigint` and fail on signed-64-bit overflow or mismatches. A local sync label is NOT a cloud/server ACK.

This pure module is not an authorization library. No persisted receipt is available to the renderer without future D-013 signed cashier/device grants. A synthetic sample must never be used as evidence of a completed sale or tax invoice. Run `pnpm --filter @smartpos/domain test` and see [POS-020 acceptance](../../docs/POS-020_RECEIPT_ACCEPTANCE.md).
