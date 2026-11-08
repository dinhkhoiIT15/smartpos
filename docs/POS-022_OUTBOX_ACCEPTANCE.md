# POS-022 — Windows Acceptance: recoverable outbox retry worker (M4/P0)

**Current:** [Issue #41](https://github.com/dinhkhoiIT15/smartpos/issues/41), [Draft PR #42](https://github.com/dinhkhoiIT15/smartpos/pull/42) from `feature/POS-022-desktop-outbox-retry`. POS-021 merged/owner PASS at main `b2f1835280ca536b18d1fae7bf4b1318e6d3a1ab`. POS-022 owner Windows PASS still required before merge.

## What POS-022 implements

The opt-in `OutboxRetryWorker` in `apps/desktop/src/main/local-db/outbox-worker.ts` is a MAIN-only **internal service**. Real `commitLocalCashSale` (POS-019) writes an immutable sale + cash receipt + POS-016 `SALE_COMPLETED` event into SQLite in one transaction. The new worker selects one eligible PENDING or due RETRY event (ordered `created_at,event_id`), sets SYNCING in an IMMEDIATE transaction, sends the original event through an explicitly **injected** `OutboxTransport` (a fake function in CI tests) and validates a matching POS-016 v1 response with the real shared Zod `assertPushResponseMatchesRequest`.

The server response is **never accepted as a trusted ACK** merely because a promise resolves or HTTP status would be 200. The response must have correct `protocolVersion`, device, event and sale IDs, correct v1 `ACKED` enum/code, UTC receipt time and conflict IDs. Only then does one SQLite transaction update `outbox_events.state='SYNCED'`, store the immutable matching result in `ack_json`, and update `local_sales.sync_status`. An `ACKED` receipt with `STOCK_SHORTAGE_RECONCILIATION` or `STALE_PRICE_REVIEW` is durably synced server-side but leaves local sale in `NEEDS_REVIEW` to flag unresolved inventory/price conflict. `NEEDS_REVIEW` response stores review evidence, never deletes original sales.

For network loss, timeout or `RETRY/TEMPORARY_UNAVAILABLE`, outbox remains RETRY with a persistent `attempt_count` and `next_retry_at`, using exponential delay (1s to 5m baseline) plus 0–20% jitter, with 1h cap and server retryAfterSeconds minimum. Manual reconnect can clear a due time only for RETRY; never auto-resolves NEEDS_REVIEW. An interrupted SYNCING claim is recovered to RETRY on explicit startup recovery, keeping exact event ID/hash/payload. No outbox/sale/item/payment deletion or stock re-debit; `pending_delta` stays untouched until POS-023 pull/rebase.

**Important:** SQLite schema remains v1 with 9 tables. No migration, no new external npm dependency; `@smartpos/contracts` already exists as shared workspace and is consumed only in privileged MAIN code. `OutboxRetryWorker` is **not instantiated or started in normal Electron `main.ts`**; test code injects a deterministic fake transport with no network. Demo receipt/cart still do not create real payments. **No live HTTP sync is enabled** by POS-022.

## BLOCKER D-013 / security

D-013 real, signed short-lived offline grants, cashier+shift authentication, device OS private key proof, role/revocation, expiry and clock rollback validation are **not implemented**. A UUID `offlineGrantId` or a `local_device_metadata` row is NOT authentication. Although POS-021 PostgreSQL server transaction service exists, the normal server still **does not register `POST /v1/sync/push`**. Do NOT inject a live HTTP transport, token, secret or IP into these tests, or enable auto-start/renderer/IPC before D-013 security approval. This issue has no Neon writes or public deployment.

## Windows PowerShell — safe test commands

From `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-022-desktop-outbox-retry
git pull --ff-only origin feature/POS-022-desktop-outbox-retry

node --version
pnpm --version
pnpm install --frozen-lockfile

pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop test:receipt-boundary

pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary

pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Expected: Node.js **24.x**, pnpm **10.20.0**; TypeScript and Electron build PASS; each Node test suite shows `fail 0`. The POS-022 new test suite writes **only disposable temp SQLite files** and cleans up; never uses real shop sales, network, Neon or an authorized device.

### Specific cases to observe in POS-022 test output

- A synthetic PHONE-128 8.990.000₫ + CASE-01 350.000₫ sale remains **9.340.000₫ due / 9.500.000₫ tendered / 160.000₫ change**, while the worker does not alter any financial/stock snapshot.
- `ACKED/APPLIED` matched strict v1 response causes atomic SYNCED outbox + sale status, persisted `ack_json` and matching read-only persisted receipt projection.
- Network error causes RETRY with next_retry_at. Immediate tick is IDLE; explicit manual reconnect sends the **same** original event with no stock debit twice.
- App/crash mid SYNCING then close/reopen recovers RETRY with the same `event_id`, `payload_hash` and JSON.
- Lost server ACK + new worker after reopen reuses exact original event, then accepts durable replay.
- Wrong sale ID, wrong device ID, missing results, malformed/extra ACK fields or damaged payload/hash **never** mark SYNCED; event/sale goes to NEEDS_REVIEW (retains evidence).
- Injected local SQLite trigger failure when updating sale status forces **whole ACK transaction rollback**; after trigger removed, startup recovery and retry succeeds.
- Multiple rapid `runOnce()` calls are single-flight. Two different sale events dispatch in stable deterministic order and keep both original CASH payments.
- Static security boundary test verifies renderer/preload/current Electron entrypoint contains **no worker invocation or public sync route**; no HTTP or token in outbox module.

### Optional GUI smoke

```powershell
pnpm --filter @smartpos/desktop dev
```

Expected: still **DEMO ONLY**, Electron IPC schema v1, demo cart/receipt prints only a watermarked sample. Browser `http://127.0.0.1:5173` has no preload bridge by design; use the Electron window for IPC verification. No real sale and no worker progress widget exists yet. Stop with Ctrl+C.

## CI and acceptance gate

- [ ] Linux Node24 strict TS/Electron build + POS-022 file SQLite worker/boundary + prior API/contracts/domain.
- [ ] Windows Node24 POS-022 worker/boundary + prior SQLite 7/6/16/1/8/2 regression suites.
- [ ] Disposable PostgreSQL 16 migration + POS-014/015/021 tests PASS; no production database contacted.
- [ ] Docs CI PASS at **final PR HEAD**.
- [ ] Owner confirms Windows PASS and security boundary/limitations, then manually merges PR #42. Issue #41 may be closed after merge.

Next: POS-023 server catalog delta pull and POS-024 manager review; D-013 auth is a hard gate before enabling actual network or paid checkout.
