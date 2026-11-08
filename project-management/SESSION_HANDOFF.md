# Session Handoff — SmartPOS POS-022

## Verified baseline / current PR

- GitHub `main` verified at `b2f1835280ca536b18d1fae7bf4b1318e6d3a1ab`, owner Windows-accepted and merged [POS-021 PR #40](https://github.com/dinhkhoiIT15/smartpos/pull/40); Issue #39 closed. Earlier POS-020 #38 and previous foundation merged.
- [POS-022 Issue #41](https://github.com/dinhkhoiIT15/smartpos/issues/41) / [Draft PR #42](https://github.com/dinhkhoiIT15/smartpos/pull/42) from `feature/POS-022-desktop-outbox-retry` against above main. **NOT merged; owner POS-022 Windows PASS pending.** Always distinguish `verified_commit` for merged main vs PR feature HEAD.

## Implementation / trust boundary

- New `apps/desktop/src/main/local-db/outbox-worker.ts`: Electron MAIN-only, **no live HTTP or automatic worker start**, synthetic `OutboxTransport` injected in tests. Claims one oldest eligible PENDING/RETRY in SQLite with `BEGIN IMMEDIATE`, sets SYNCING/increments attempts before any async call; `runOnce` single-flight, explicit opt-in timer `start/stop`, startup `recoverOrphanedOutbox` resets SYNCING -> RETRY and manual `retryOutboxNow` only affects RETRY.
- Reuses exact production-shared POS-016 `syncSaleCompletedEventSchema`, `syncPushRequestSchema` and `assertPushResponseMatchesRequest`. Before sending, MAIN-only POS-020 `loadCommittedLocalReceipt` verifies stored IMMUTABLE sale/items/CASH/outbox evidence (including canonical hash), not just event self-validation; added a forged-but-rehashed payload test to ensure a valid signatureless hash cannot rewrite paid local history.
- Only exact authenticated-IN-THE-FUTURE matching v1 `ACKED` outcome can make `outbox.state=SYNCED`. One SQLite transaction saves event-specific exact result in `ack_json` and `local_sales.sync_status`; unexpected response -> NEEDS_REVIEW and not SYNCED. Cloud ACK with shortage/stale-price conflict -> outbox SYNCED, local sale NEEDS_REVIEW, manager review still needed. Transient failure/RETRY -> retry via capped exponential backoff+jitter, obey server retry-after; never delete original event, payment or stock pending_delta. SQLite v1 nine-table schema unchanged.
- `apps/desktop/tests/outbox-worker.test.ts` disposable SQLite file-backed Node24 tests and `apps/desktop/tests/outbox-boundary.test.mjs` verify no normal Electron startup/IPC/preload/renderer/HTTP network route. Uses shared `@smartpos/contracts` workspace dependency/lock link (no new remote lib). CI Linux/Windows tests include all POS-019/020 baseline; PostgreSQL test stays disposable and unchanged.
- Normal Electron remains `DEMO_ONLY`, real `commitLocalCashSale` and worker are **not accessible to UI/IPC**, normal Fastify `POST /v1/sync/push` still HTTP 404; no actual internet/Neon. D-013 must establish signed grant, OS device key, cashier shift/login, clock and revocation before any real network transport/auth injection.

## CI evidence / status

- Early branch caught TypeScript narrowing error accessing `retryAfterSeconds`; fixed using discriminated `result.status==='RETRY'` before reading. POS-022 code checkpoint `1ebda76565bf0d303e8fc11a68ecaf6ce1f1c3e2` [Foundation #42437612525](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42437612525) **SUCCESS all Linux/Windows Node24/PostgreSQL 16**: POS-022 file-backed **17/17**, static boundary **2/2** both Linux and Windows, original SQLite 7/6/16/1/8/2, API 39/39 and POS-021 real PG 11/11. [Docs #42437612520](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42437612520) SUCCESS.
- After checkpoint, added independent POS-020 persisted financial read-model verification in dispatch path and additional forged-but-**correctly rehashed** malicious payment test (ensures outbox JSON cannot contradict immutable sale). **Recheck final PR HEAD Foundation and Docs CI** before declaring POS-022 done/asking for owner PASS.

## Owner Windows safe commands

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

All new tests run **only disposable local SQLite files and fake injected ACK callbacks**, no Neon/HTTP/service needed. Expected zero fails Linux/Windows. `pnpm --filter @smartpos/desktop dev` optional Electron demo IPC/SQLite v1 smoke, not worker activation. [Full guide](../docs/POS-022_OUTBOX_ACCEPTANCE.md).

## Next / blockers

Do NOT merge PR #42 until user Windows PASS. Once merged, close #41. Next POS-023 server catalog delta pull + POS-024 conflict workflow, D-013 real authorization gates all live sync/checkout. No new public API, token/secret in renderer, Neon sale writes, or true cashier sale in this branch.
