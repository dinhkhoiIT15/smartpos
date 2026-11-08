# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: cab478722068560a1f104bd2d36a9af300866967
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator can manage branches/Issues/PRs; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M4 — internal PostgreSQL PUSH and idempotent offline sale reconciliation
current_phase: POS-021 internal server-side sale sync, draft PR #40, owner Windows acceptance pending
ci_status: POS-021 PostgreSQL code checkpoint 76a5628 [Foundation CI #42434326435](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42434326435) SUCCESS Linux/Windows/API/disposable PostgreSQL; strict POS-016 schema parity test added afterwards, latest PR HEAD CI pending verification
production_status: NOT DEPLOYED — no signed offline grant, real staff/device authorization, public sync HTTP route, desktop worker, paid checkout, Neon sale writes or production deployment

## Verified merged main

- POS-001–POS-019 foundation/workspace, catalog/inventory, POS-016 v1 event schema, POS-017 cache, POS-018 demo cart, POS-019 atomic SQLite sale/outbox were owner accepted and merged; all real local sales remain unexposed from Electron IPC pending D-013.
- POS-020 [PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38) **merged/owner PASS** at [verified main `cab478722068560a1f104bd2d36a9af300866967`](https://github.com/dinhkhoiIT15/smartpos/commit/cab478722068560a1f104bd2d36a9af300866967). [Issue #37](https://github.com/dinhkhoiIT15/smartpos/issues/37) closed after verifying owner acceptance. Synthetic sample receipt has a permanent MẪU watermark; SQLite persisted receipt read-model is MAIN-only and never exposed to renderer.
- D-010 max 4h signed offline grant design approved; **D-013** cryptographic grant, OS-backed key possession, cashier/shift role and session, clock/revocation enforcement **OPEN**. No authenticated live network sync.
- Neon owner verified **development schema only**, migration v1 (17 tables). POS-021 changes do not migrate DB or write Neon.

## POS-021 feature / draft PR (NOT merged)

- [Issue #39](https://github.com/dinhkhoiIT15/smartpos/issues/39), branch `feature/POS-021-idempotent-sync-push` based on verified merged main, [Draft PR #40](https://github.com/dinhkhoiIT15/smartpos/pull/40).
- `apps/api/src/sync/schema.ts`: strict Zod-ish POS-016 v1 event/receipt input mirror with 512KiB/25 events/100 items, canonical sorted UTF-8 SHA256, exact signed64 VND and payment/line sums. The local mirror is checked against actual [POS-016 contract](../packages/contracts/src/sync-v1.ts) by standalone `apps/api/tests/sync-parity.test.ts` to avoid NodeNext API `rootDir=src` cross-package emission; no external dependency.
- `apps/api/src/sync/service.ts`: `SyncPushService` uses a per-store PostgreSQL advisory transaction lock + database membership/device checks. Each event executes **one transaction**: sale POSTED, immutable SKU item snapshots, CASH payment, stock balance decrement/movements, conflict rows for stock shortage/stale price, append-only `sync_receipts` with exact v1 ACK as LAST write. Identical retry replays cached exact ACK without double debit; conflicting IDs/hash return NEEDS_REVIEW, not a second sale. Negative cloud inventory permitted only when recognizing an already-paid offline sale, with explicit conflict and review ID. Any late DB failure rolls back and returns RETRY, not ACK.
- `apps/api/src/sync/routes.ts` and `server.ts`: **opt-in Fastify.inject synthetic-auth-only** PUSH route. Normal `apps/api/src/main.ts` NEVER provides `sync` option, so network `POST /v1/sync/push` is still **HTTP 404**. A UUID or `x-role` header is NOT an authorized signed grant; D-013 must be completed before any real exposure.
- `apps/api/src/sync/routes.test.ts`, `apps/api/src/sync/sync.pg.test.ts`, `apps/api/tests/sync-parity.test.ts`. PG tests are strictly guarded for **disposable 127.0.0.1:5432/smartpos_ci only**, not Neon. Verify exact ACK replay after duplicate/lost response, 8 concurrent same deliveries, 2 distinct overlapping sales, negative stock conflict, price divergence, cross-store/forged device, user revocation, >2^53 VND, final receipt trigger failure and full transaction rollback.
- Existing PostgreSQL v1 schema migrations/constraint guards and POS-014/015 regressions unaffected; API test scripts `test:sync`, `test:sync:pg`, `test:sync:parity`, CI Linux/Windows parity and PG integration added.
- [POS-021 Windows acceptance](../docs/POS-021_SYNC_PUSH_ACCEPTANCE.md), README, API README and traceability updated.
- **CI:** [Foundation #42434326435](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42434326435) **SUCCESS** on complete PostgreSQL transactional code revision `76a5628`, before standalone POS-016 parity test. First parity script .mjs couldn't be processed by TSX on Node24, migrated to standalone `.ts` outside API build root and fixed its fixture nesting. Recheck new latest-HEAD CI before claiming parity verified.

## Next

1. Verify latest PR #40 HEAD Foundation Linux/Windows + real disposable PostgreSQL; Docs validation. Fix parity or any strict validations until all pass. Keep draft.
2. Windows owner: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/api typecheck`, `build`, `test`, `test:sync`, `test:sync:parity`, `pnpm run check`. Optional `pnpm --filter @smartpos/api dev`, check `/v1/health` returns 200, `POST /v1/sync/push` returns **404**, even with forged headers.
3. PG integration **ONLY** on GitHub disposable CI. Do not run `test:sync:pg` or migrations against Neon or real shop DB; test guard hardcodes local `smartpos_ci`.
4. Owner Windows PASS and security/code review then manually merge PR #40 and close Issue #39. POS-022 retry worker, POS-023 pull, POS-024 conflict review and D-013 real grant verification remain pending. No public sync activation until real cryptographic auth.
