# Session Handoff — SmartPOS

## Session: POS-016 versioned offline sync contract (2026-11-07)
- Repo: https://github.com/dinhkhoiIT15/smartpos
- Verified `main` SHA **`269f035da106e1ec6787e95c8fd9f91967b7599a`**. Owner reported **POS-015 Windows accepted and PR #28 merged**; [Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27) closed with evidence. Prior POS-014, POS-013, POS-012, POS-011 design milestones accepted (not real auth).
- Current [POS-016 Issue #29](https://github.com/dinhkhoiIT15/smartpos/issues/29), [draft PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30), branch `feature/POS-016-versioned-sync-contract`, **UNMERGED**. Status `verified_commit` refers to reviewed main, not PR head.

## Current work and scope
- `packages/contracts/src/sync-v1.ts`: sync protocol v1 Zod schemas:
  - `SALE_COMPLETED` event with immutable POS sale/items/CASH receipt snapshot, nonnegative canonical BIGINT VND decimal strings; positive integer sale qty, hard overflow and cash/change invariant checks; exact UTC timestamps, store/device/cashier/grant UUIDs.
  - Deterministic recursively sorted-key UTF-8 SHA-256 computed over event without `payloadHash`. A hash guards data integrity only — **not trusted device authentication**.
  - Push max 25 events/512 KiB, same device/store and unique sale/event ID; response `ACKED`/`NEEDS_REVIEW`/`RETRY`, result ID+order match helper, pure receipt replay conflict model for original ACK vs mismatched hash. Live server unique(receipt)/transaction remains POS-021.
  - Pull `cursor` BIGINT JSON string and `limit` 1–100, globally increasing `seq`, stable high watermark, `hasMore`/nextCursor validation and request/page match helper. SQLite transaction to apply page+cursor remains POS-017/023.
  - HTTP error schema including version negotiation.
- `packages/contracts/src/vnd.ts` is a pure refactor of existing VND contracts to avoid circular ESM imports. `index.ts` retains all prior public cart/money exports plus versioned sync exports.
- `packages/contracts/src/sync-v1.test.ts` includes negative-case schema/version/batch/overbyte/hash/sale money/ACK/retry/replay/cursor tests and reads **real checked example JSON files** from `docs/sync/examples/`. Example push request hash `64caf850ef884a5c682e1dc9c2dc54e80bb0f4a835df4f74ddaebe93079016fd` is recomputed by test.
- [OpenAPI 3.1](../docs/sync/openapi-v1.yaml) and [wire security/replay/pagination spec & Windows acceptance guide](../docs/sync/POS-016_SYNC_CONTRACT.md). OpenAPI has documentation-only `api.example.invalid` server and future routes; **DO NOT register them** in Fastify until real auth/DB transaction is implemented.
- No migration, Neon contact/writes, local SQLite/renderer changes, real sales, credentials or dependency additions. Existing locked rules/offline sync policy unchanged.

## CI regressions discovered and fixes
1. Initial TypeScript test object duplicated `sale` key — replaced by one safe spread.
2. First runtime tests exposed ESM circular import (`index.ts` exports `sync-v1.ts` while sync imported VND from index): moved canonical money schema into `vnd.ts`, re-exported prior names. **Full contracts tests must pass both `index.test.ts` and `sync-v1.test.ts`**.
3. Nested Zod refinement attempted `BigInt('1.1')` for malformed VND and threw rather than returning validation issues. Added guard verifying all nested money inputs using Zod before BigInt arithmetic; now should fail closed normally.
4. OpenAPI/fixtures + oversized batch, HTTP version-error and malformed cursor tests were verified at code checkpoint `7af0dddc65008e6a05e9c84dca96fee7056681d1`: [Foundation run 42392721677](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42392721677) **SUCCESS**, contracts **19/19** (including both legacy index and sync v1); existing Fastify/Electron, Windows SQLite, PostgreSQL 16 green; [Docs run 42392721705](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42392721705) **SUCCESS**. Verify latest PR HEAD after final docs commits.

## Windows owner acceptance
From `C:\Users\dinhk\Desktop\smartpos` in VS Code PowerShell:

```powershell
git status --short
git fetch origin
git switch feature/POS-016-versioned-sync-contract
git pull --ff-only origin feature/POS-016-versioned-sync-contract
pnpm install --frozen-lockfile
pnpm --filter @smartpos/contracts typecheck
pnpm --filter @smartpos/contracts test
pnpm run check
```

Expected all commands success, Node `contracts test` `fail 0` including JSON fixtures. No local PostgreSQL or Neon needed.

Normal `pnpm --filter @smartpos/api dev` still exposes `/v1/health` 200. `GET http://127.0.0.1:3001/v1/sync/pull?cursor=0` should return **404** intentionally because sync routes not implemented. Never run `migrate:dev` or send live sale/DB/passwords/keys.

## Next
1. Re-fetch latest PR #30 HEAD, all GitHub CI and diff before completion claims; read full docs and validate examples.
2. Owner Windows smoke and review; keep draft PR and Issue #29 OPEN until owner accepts/merges.
3. POS-017 catalog cache is next independent backlog task. Real POS-021 receipt/idempotent push, POS-022 retry and POS-023 authenticated pull cursor apply are required before calling sync implemented.
4. Critical unimplemented security: D-013 real staff login/device keys/signed grant verification; D-009 backup encryption/restore; R-005 HIGH OPEN. M0 POS-003/005/006 governance incomplete.
