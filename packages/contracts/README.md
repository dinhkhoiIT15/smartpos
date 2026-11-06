# @smartpos/contracts — POS-010

Shared Zod validation for price/checkout draft input, **not** a posted sale or sync event.

- A VND amount travels over JSON as a **canonical decimal string** (e.g. `"9340000"`), not a JavaScript `number`.
- `vndStringSchema` rejects negative/fraction/exponential/noncanonical values and amounts exceeding PostgreSQL signed 64-bit BIGINT.
- `cartLineSchema` carries `skuSnapshot`, `nameSnapshot`, integer positive `quantity`, `unitPriceVnd` and line-level `discountVnd`. This is an *estimate input*; POS-016 will design and version the authoritative sync contract.
- `cashCartEstimateSchema` validates 1–100 line items and tendered cash.
- `parseVndString` converts a successfully validated amount to `bigint`; do not use `Number(value)`.

Local check:

```bash
pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
```

Contracts deliberately do not create a payment, write SQL, check stock or issue receipts.
