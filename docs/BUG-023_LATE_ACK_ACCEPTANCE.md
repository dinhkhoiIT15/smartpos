# BUG-023 — Late ACK stock rebase acceptance (SQLite v2)

**Issue:** [#58](https://github.com/dinhkhoiIT15/smartpos/issues/58). **Base:** main `2af99303e0525ba917f6e1ce4923f71a6c4a1b78`.

**Scope:** Internal Electron MAIN-only SQLite stock correctness; no production sales, HTTP endpoints, live sync, Neon writes or device authorization.

## Root cause

After a server commits a cash sale PUSH but the client loses its ACK, a later stock PULL can already include that movement and advance its catalog cursor. SQLite v1 kept the negative local pending_delta because the exact ACK was not yet stored. A late ACK never saw that covered event again; the local available quantity could remain understated.

## Fix

- Append SQLite schema v2 without editing historical v1 migration SQL. Tenth table `local_stock_pull_coverage` records immutable store, sale, variant, event identity, cursor sequence and exact sold quantity with a one-way released marker.
- Within the same BEGIN IMMEDIATE PULL transaction, match the local immutable sale, outbox, device and sale item. Record the server-covered sale without accepting it as proof of payment. Other-device changes do not clear local pending stock.
- A strict, matching persisted POS-016 ACK is mandatory. During the exact ACK transaction, or on a subsequent PULL if ACK already arrived, release only that sale/SKU's un-released covered quantity once. Never zero every pending reservation, never change cash evidence.
- If a release fails, rollback the outbox ACK, sale state and stock changes atomically. Failed/outstanding claims are recovered through existing outbox retry on restart.
- No cursor rewinds, forged event acceptance, extra server stock increments or duplicate releases.

## Historical SQLite v1 upgrade limitation

Migration v1 → v2 is additive, idempotent, and preserves financial sales, outbox and existing pending balances. It MUST NOT invent provenance for stock events consumed by a v1 client before upgrade. Such pre-upgrade uncertain sales need a separately reviewed authenticated full-stock reconciliation/bootstrap before live use; do not silently clear pending_delta. Existing SQLite/backups remain plaintext (SEC-009 #61).

## Windows PowerShell safe test commands

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch fix/BUG-023-late-ack-stock-rebase
git pull --ff-only origin fix/BUG-023-late-ack-stock-rebase
pnpm install --frozen-lockfile
pnpm run check
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-pull
pnpm --filter @smartpos/desktop test:catalog-pull:boundary
pnpm --filter @smartpos/desktop test:outbox-worker
pnpm --filter @smartpos/desktop test:outbox-boundary
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop test:storage-security
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop build
```

All commands must exit 0, tests must report fail 0. These tests use disposable local SQLite databases. Do not run PostgreSQL test or migrate commands against Neon.

## Acceptance checklist

- [ ] Fresh SQLite v2, actual v1 → v2 upgrade, reopen and backup preserve paid/outbox/pending data; legacy unknown coverage is not guessed.
- [ ] PULL before ACK writes durable marker, leaves pending until exact late ACK; restart/replay never double-releases.
- [ ] ACK before PULL and duplicate same-sale later stock events release exactly once.
- [ ] Two sales, two SKUs, multiple pages and different ACK orders converge without duplicate cash sale/payment/outbox.
- [ ] Forged local sale/event identity, untrusted/negative ACK and other-device stock cannot release pending; PULL cursor rolls back on error.
- [ ] Inject release fault: ACK, sale status and pending all roll back; recover orphan claim after restart and retry.
- [ ] Linux/Windows Node24 typecheck/build/local SQLite tests, API/contracts, ephemeral PostgreSQL16 and docs CI PASS on final PR SHA.
- [ ] Electron demo remains DEMO_ONLY, read-only IPC now shows SQLite schema v2, fake cart/report/conflict still work; no live login/sync/checkout.
- [ ] Owner reviews and merges PR manually before closing #58. No real customer data, production migration, userData deletion or Neon writes.

**Scope boundary:** This fixes newly observed covered PULL events, but is not proof that historical pre-v2 uncertainty, SEC-009 or SEC-013 is solved.
