# @smartpos/contracts — shared money/cart and versioned sync DTOs

**Merged baseline:** POS-010 v1 Zod cart estimate + signed BIGINT VND decimal strings. **Current review:** [POS-016 Issue #29](https://github.com/dinhkhoiIT15/smartpos/issues/29), [PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30) defining an **unshipped** offline push/pull v1 contract. This package **never writes** SQLite/Neon or registers Fastify routes.

## POS-010 cart and VND
- `vndStringSchema` is canonical decimal nonnegative VND in PostgreSQL signed BIGINT range, sent as a JSON **string**, not a float or JS number.
- `cartLineSchema` carries `skuSnapshot`, `nameSnapshot`, positive integer quantity, price/discount. `cashCartEstimateSchema` estimates a cart, **not** an immutable paid sale.
- `parseVndString` uses `BigInt` only after validation. Money schema moved into `src/vnd.ts` to avoid a circular dependency when exposing sync-v1 exports; prior public exports remain unchanged.

## POS-016 versioned sync wire v1
- `syncSaleCompletedEventSchema`, `syncPushRequestSchema`, `syncPushResponseSchema`: strictly versioned `SALE_COMPLETED` cash sale snapshots, canonical sorted-key SHA-256 over all event fields but hash, bounded push and ACK/review/retry result schemas. `computeSyncPayloadHash` validates trusted event body and hashes with Node `node:crypto`, so use only in Electron MAIN / Fastify, not renderer.
- `assertPushResponseMatchesRequest`: verifies exact device/event/sale linkage and result order before a later outbox worker considers marking `SYNCED`.
- `classifySyncReceiptReplay`: **pure identity model** for equal (deviceId,eventId,saleId,hash), differing hash vs new event; this is **not** persistent server idempotency or authorization.
- `syncPullQuerySchema`, `syncPullResponseSchema`, `assertPullResponseMatchesQuery`: bounded global change-log cursor, sorted change seq, watermark, `hasMore`, matching query; SQLite page apply + cursor atomicity is POS-017/023.
- `syncHttpErrorSchema`: strict HTTP-level version/authorization/error response description. Actual API handlers to implement in POS-021/023.

For field-by-field security, examples, OpenAPI and Windows acceptance see [POS-016 sync contract](../../docs/sync/POS-016_SYNC_CONTRACT.md) and [OpenAPI 3.1](../../docs/sync/openapi-v1.yaml). This is **contract only**, not a working `/v1/sync/push` or `/v1/sync/pull` endpoint.

```bash
pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
```

Expect `fail 0` for all tests, including JSON examples, malformed cash totals, version mismatch, wrong hash, replay/conflicting ID, ACK mismatch, cursor regression and a >512 KiB request. These tests need no DB or credentials.

**Security:** the event's `offlineGrantId`, client time, storeId and hash are NOT a verified authorization. A real HTTPS API must authenticate the session/device, check the grant and validate DB roles. A paid local sale must not be deleted because of sync failure or review. No production rollout or database migrations are authorized under POS-016.
