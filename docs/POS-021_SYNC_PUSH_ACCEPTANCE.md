# POS-021 — Internal PostgreSQL idempotent offline sale PUSH v1 (M4/P0)

**GitHub:** [Issue #39](https://github.com/dinhkhoiIT15/smartpos/issues/39), [Draft PR #40](https://github.com/dinhkhoiIT15/smartpos/pull/40), branch `feature/POS-021-idempotent-sync-push`. Owner-accepted POS-020 [PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38) merged on `main` at `cab478722068560a1f104bd2d36a9af300866967`. **POS-021 owner Windows acceptance PENDING.**

## Đã thực hiện

`apps/api/src/sync/schema.ts`: strict POS-016-compatible `SALE_COMPLETED` v1 input, max 25 events, 100 items/event, 512 KiB UTF-8, UUIDs/decimal VND canonical signed-int64 (all values `BigInt`), hash SHA-256 deterministic sorted-key. Reject unknown properties, bad event/sale sums, duplicate batch IDs, wrong device/store and stale/tampered hash. `apps/api/src/sync/schema-parity.test.mjs` compares outputs with **actual POS-016 Zod+hash** contract, using existing `tsx` dependency. This is a local schema mirror because API TS NodeNext compilation has `rootDir=src`; keeping parity checked is mandatory until a packaged compiled shared contract is available. Do not change v1 contract silently.

`apps/api/src/sync/service.ts`: internal `SyncPushService.push(verifiedContext, raw)`. For each event (bounded batch), uses PostgreSQL transaction plus per-store advisory lock, verifies device belongs to store, is enabled/not revoked and cashier's store membership/user are active; verifies SKU exists in same store. This is **not signed-grant verification**. The transaction writes `sales.POSTED`, immutable `sale_items`, `payments.CASH`, `inventory_balances`, append-only `inventory_movements(SALE_OFFLINE)`, `sync_conflicts.OPEN` if negative stock or price/active drift, and **`sync_receipts` with canonical event hash + exact ACK last**. A timeout after commit and a retry return the *same stored ACK*, without duplicate sale/items/movement or stock debit. `sale_id` uniqueness and `(device_id,event_id)` receipt PK are enforced by existing PostgreSQL v1. Concurrent incoming events for a store are serialized. Receipts/movements cannot be edited by database triggers.

**Negative stock exception:** if a cash sale was already accepted offline but server stock became insufficient, do not delete the sale or retroactively alter its price. Write signed negative balance and conflict `STOCK_SHORTAGE`, return `ACKED/STOCK_SHORTAGE_RECONCILIATION` with `conflictIds` (up to 20 IDs in ACK; all conflict records stay in PG). For stale price or deactivated variant, preserve the immutable sold snapshot and write `STALE_PRICE`, result `STALE_PRICE_REVIEW`. Managers must reconcile in POS-024, not auto-dismiss.

**Idempotency/security:** exact repeated `deviceId,eventId,saleId,payloadHash` returns cached original ACK from `sync_receipts.ack_json`. Different content with same identity returns `NEEDS_REVIEW/PAYLOAD_HASH_MISMATCH`; new event referencing existing sale returns `NEEDS_REVIEW/DUPLICATE_SALE`, no stock changes. Unexpected DB failure returns `RETRY/TEMPORARY_UNAVAILABLE` after rollback, never a fabricated ACK. Invalid format returns 400 on test-injected HTTP, unsupported version 409; physical error reason/PG credentials are not sent to clients.

## CRITICAL: real endpoint is **NOT enabled**

`apps/api/src/sync/routes.ts` is opt-in through `buildServer({sync: {...}})` for controlled `Fastify.inject` tests. **Normal `apps/api/src/main.ts` calls `buildServer({logger:true})` without sync registration; therefore `POST /v1/sync/push` returns 404 even with forged `x-role` or `x-device-id` headers.** The `VerifiedSyncContext` type is a *test-only representation of a future trusted server principal*, **not** an authorization token. `offlineGrantId` supplied by an event is an opaque string and **NOT proof of a server-issued signed offline grant**.

**BLOCKER D-013** must first implement and independently review server-issued cryptographically signed offline grants, OS/device key possession, cashier authenticated session/shift/role, store and device exclusivity, 4-hour expiry/clock anti-rollback and revocation (per approved POS-011 policy). Do not add `sync` injection to `main.ts`, use untrusted headers or deploy write routes to public traffic before D-013. No Neon migrations, live endpoints or real customer data are used by POS-021. POS-022 desktop worker will be separate.

## Bài kiểm thử tự động

- `apps/api/src/sync/routes.test.ts`: default 404, explicit synthetic server-injected principal, 401/400/409 envelopes, strict money/duplicate/hash/size, no untrusted header bypass.
- `apps/api/src/sync/schema-parity.test.mjs`: compare local validation and canonical hash with actual shared POS-016 `syncPushRequestSchema`, `computeSyncPayloadHash`, including unicode and money > JS safe integer.
- `apps/api/src/sync/sync.pg.test.ts`: **disposable PostgreSQL 16** integration: BR-002 9.340.000 due/9.500.000 cash/160.000 change, exact persisted original ACK replay, eight concurrent duplicate sends, two distinct concurrent sales and explicit negative balance review, immutable sale price with stale server price, wrong-store SKU, revoked device/membership, price >2^53, failure at final receipt write proves rollback of all sale/items/payment/movement/stock then retry.
- Prior POS-014 catalog, POS-015 inventory and PostgreSQL v1 migration/immutability tests remain in CI. Windows Node24 tests API unit/schema parity and original SQLite/POS-020 regressions; PostgreSQL integration runs only under GitHub disposable Postgres 16.

## Nghiệm thu Windows PowerShell (safe, NO Neon)

From `C:\Users\dinhk\Desktop\smartpos`, run:

```powershell
git status --short
git fetch origin
git switch feature/POS-021-idempotent-sync-push
git pull --ff-only origin feature/POS-021-idempotent-sync-push
node --version
pnpm --version
pnpm install --frozen-lockfile

pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api build
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/api test:sync
pnpm --filter @smartpos/api test:sync:parity
pnpm --filter @smartpos/contracts test
pnpm run check

pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
```

**Do not run** `pnpm --filter @smartpos/api test:sync:pg` or database migration on local Windows without a specifically provisioned **disposable** localhost PostgreSQL 16 `127.0.0.1:5432/smartpos_ci`. The integration test strictly refuses any other target, including Neon and production. Github CI starts a disposable instance and automatically runs it against migration v1.

Optional smoke for real normal runtime (read-only health, verify sync endpoint denied):

```powershell
pnpm --filter @smartpos/api dev
```

In a second PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/v1/health
try {
  Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3001/v1/sync/push -ContentType 'application/json' -Body '{"protocolVersion":1,"deviceId":"fake","events":[]}'
} catch { $_.Exception.Response.StatusCode.value__ }
```

Expected health 200 with `{"status":"ok","service":"smartpos-api"}`, and **HTTP 404** for sync PUSH. Never add a test authorization secret or temporary bypass to the normal running server. Stop server with Ctrl+C.

## Điều kiện trước khi merge

- [ ] Final GitHub Linux/Windows TypeScript/build/API test, POS-016 parity, disposable PostgreSQL 16 sync integration including fault/concurrency, Docs CI **SUCCESS** at last PR HEAD.
- [ ] Owner Windows safe unit tests PASS and optionally confirms default PUSH 404 + health 200.
- [ ] Code/security review confirms D-013 still blocking live API, no fake signed-grant claims, Neon/production untouched, no baseline v1 schema modification.
- [ ] Human owner accepts then manually merges Draft PR #40. Issue #39 closes only after merge.

Next POS-022 desktop retry outbox worker, POS-023 pull, POS-024 conflict review and **D-013 auth gating** remain pending. Real sync cannot be activated in this PR.
