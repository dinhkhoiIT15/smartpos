# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: b2f1835280ca536b18d1fae7bf4b1318e6d3a1ab
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — connected GitHub Issues/branches/PRs; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M4 — recoverable local outbox retry (not a live sync API)
current_phase: POS-022 [Issue #41](https://github.com/dinhkhoiIT15/smartpos/issues/41), [Draft PR #42](https://github.com/dinhkhoiIT15/smartpos/pull/42) — implementation ready for CI/owner Windows review; NOT merged
ci_status: POS-022 strengthened code checkpoint 047dd17a [Foundation CI #42437798730](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42437798730) SUCCESS Linux/Windows Node24 (outbox file-backed 18/18 + boundary 2/2 each, including validly rehashed forged event rejection), disposable PostgreSQL POS-021 11/11 and baseline Electron/API/SQLite; [Docs CI #42437798816](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42437798816) SUCCESS. Final docs-only HEAD CI must be verified before owner acceptance.
production_status: NOT DEPLOYED — D-013 signed device/cashier grant not implemented, normal Electron outbox worker NOT activated, normal API PUSH HTTP 404, no real paid-sale IPC or Neon sale writes

## Owner-verified accepted main

- POS-001–POS-019 previously accepted and merged, including POS-016 exact v1 sync contract and POS-019 MAIN-only atomic SQLite sale/outbox. Normal Electron UI remains demo-only; immutable local sale functions are unavailable to preload/renderer.
- POS-020 [PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38) owner Windows PASS/merged at `cab4787220`: sample receipt always watermarked; persisted receipt read projection is MAIN-only, not IPC exposed.
- POS-021 [PR #40](https://github.com/dinhkhoiIT15/smartpos/pull/40) **owner Windows PASS and merged** at [verified main `b2f1835280ca536b18d1fae7bf4b1318e6d3a1ab`](https://github.com/dinhkhoiIT15/smartpos/commit/b2f1835280ca536b18d1fae7bf4b1318e6d3a1ab), [Issue #39 closed](https://github.com/dinhkhoiIT15/smartpos/issues/39). Server PostgreSQL-only per-store serializable sale+item+cash/stock/conflict+durable receipt transaction, idempotent duplicate/lost ACK; **never mounted to public HTTP**, absent D-013.
- D-010 4-hour offline grant design approved; **D-013** real cryptographic signature/device secure OS key, staff+shift, server session/role, revocation, time/clock validation still OPEN. Neon development schema only; no production sync.

## POS-022 working branch (Draft PR #42, NOT merged)

- `apps/desktop/src/main/local-db/outbox-worker.ts`: opt-in Electron MAIN-only transport-injected `OutboxRetryWorker`. One IMMEDIATE SQLite transaction claims oldest eligible PENDING/RETRY by `created_at,event_id`, sets SYNCING, increments attempt; another single transaction atomically stores matching v1 ACK and updates local sales status. Uses **actual POS-016 Zod v1** event hash and `assertPushResponseMatchesRequest`, not a locally forked weak ACK model.
- Before sending, POS-020 `loadCommittedLocalReceipt` independently cross-checks immutable saved sale/items/CASH payment and outbox event. Even a correctly rehashed tampered outbox payload must not be sent if it contradicts original cash evidence. No repricing, no stock delta mutation or outbox deletion.
- `ACKED/APPLIED` -> outbox SYNCED + local sale SYNCED; `ACKED/STOCK_SHORTAGE_RECONCILIATION` or `STALE_PRICE_REVIEW` -> outbox SYNCED (server received) + local sale NEEDS_REVIEW (manager review pending) with exact `ack_json` conflict IDs. `NEEDS_REVIEW` -> both review, no auto replay. Wrong/missing/malformed ACK -> NEEDS_REVIEW without false SYNCED.
- Timeout, network error or v1 RETRY -> persistent next_retry_at, bounded exponential backoff 1s–5m + jitter and optional server retryAfterSeconds floor (up to 1h). `retryOutboxNow` unlocks RETRY for manually simulated reconnect; `recoverOrphanedOutbox` resets stranded SYNCING to RETRY on startup. Internal `runOnce` shares one in-flight promise. No timers/transport started by normal Electron `main.ts`; no HTTP/credential/Neon access.
- **SQLite schema v1 unchanged** (9 tables), stock `server_qty+pending_delta` retained for POS-023 rebase. Only existing shared workspace `@smartpos/contracts` added as desktop dependency/lock link; no new npm registry packages, no new migrations.
- `apps/desktop/tests/outbox-worker.test.ts`: real temp-file SQLite POS-019 sale fixture and simulated ACK/timeout/duplicate/reconnect/reopen/missing or forged response, two sale orders, transaction fault rollback and cross-store denied; added correctly rehashed malicious cash event detection. `apps/desktop/tests/outbox-boundary.test.mjs`: static normal main/preload/renderer/IPC/HTTP D-013 boundary. Linux+Windows Node24 CI runs both.
- [POS-022 Windows/CI acceptance](../docs/POS-022_OUTBOX_ACCEPTANCE.md), root/desktop README, PRD FR-08/09 traceability updated.
- CI checkpoint **17/17 outbox + 2/2 security boundary** on both Linux and Windows and all older test regressions PASSED at `1ebda765` ([#42437612525](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42437612525)). Final source changes for independent financial recheck and rehashed attack test need final-green HEAD verification.

## Next actions

1. POS-022 strengthened code checkpoint confirmed green Linux/Windows/PG (outbox 18/18 + boundary 2/2 both OS). Verify final docs-only PR #42 HEAD Foundation/Docs; keep draft until owner acceptance.
2. Owner Windows: frozen pnpm on Node24, `pnpm --filter @smartpos/desktop typecheck`, `test:outbox-worker`, `test:outbox-boundary`, existing `test:offline-sale`, `test:offline-sale:wire`, `test:receipt-db`, `security:check`, `build`, `pnpm run check`. File-backed tests are temp-file only and require NO Neon or network.
3. Optionally open Electron demo to verify `DEMO_ONLY • SQLite schema v1`; no active outbox UI/progress is expected or authorized. Only tests exercise fake transport. No public sync allowed.
4. After owner Windows PASS and security review, owner manually merges Draft PR #42 and closes Issue #41. Next POS-023 catalog delta pull, POS-024 conflicts and D-013 auth prerequisites; production release blocked.
