# Session Handoff — SmartPOS

## Session 2026-11-07: POS-017 trusted initial SQLite catalog cache

- GitHub repo: https://github.com/dinhkhoiIT15/smartpos
- Latest verified main: `beb760097e35ee5a7d39ed1c96f0b2f4f7e7c23b` (merge POS-016 PR #30; owner reported Windows acceptance).
- Current work: [Issue #31](https://github.com/dinhkhoiIT15/smartpos/issues/31), feature branch `feature/POS-017-local-catalog-cache`. Feature code is NOT yet accepted/merged. `DEVELOPMENT_STATUS.verified_commit` tracks main, not feature HEAD.

## Implemented feature branch

- `apps/desktop/src/main/local-db/catalog-cache.ts`: strict initial snapshot parser, atomic SQLite bootstrap into existing v1 catalog rows + first cursor, idempotent exact replay, reject different or older cursor/snapshot, fail on other-store or pre-populated uncursored cache. Read-only scoped SKU prefix lookup (escaped SQL wildcard, string VND, inactive excluded).
- `apps/desktop/tests/catalog-cache.test.mjs`: Node24 file-backed tests with OS temp paths/Windows-safe handles to verify persist/reopen, strict validation, triggered transaction rollback, replay/rewind refusal, protected sale/item/payment/outbox and pending stock, other-store/no-cursor refusal.
- `apps/desktop/package.json`: `test:catalog-cache`; Linux and Windows Node24 CI jobs run it. `docs/POS-017_CATALOG_CACHE_ACCEPTANCE.md` documents Windows checks, trust boundary and future POS-023 gap.
- No migration, production/Neon access, external HTTP, auth bypass or renderer IPC import, no hidden real userData fixture. Security design: real auth and verified source required before actual online catalog; POS-023 handles incremental pull and pending stock rebase.

## Verification/owner acceptance

From `C:\Users\dinhk\Desktop\smartpos` on Windows PowerShell:

```powershell
git status --short
git fetch origin
git switch feature/POS-017-local-catalog-cache
git pull --ff-only origin feature/POS-017-local-catalog-cache
pnpm install --frozen-lockfile
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Expected Node 24.x, 7 POS-013 local DB tests + 6 POS-017 cache tests all pass, plus full checks. Manual `pnpm --filter @smartpos/desktop dev` shows existing demo/SQLite v1, no product import UI; no unauthorized cache writes or real sale. Do not point PostgreSQL test suites at Neon.

**Important:** GitHub CI and Windows verification for POS-017 must be fetched and reported before claims of PASS. Keep issue/feature PR open for owner acceptance, no merge.

## Known pending work

- Real backend authentication and catalog snapshot projection (D-013/POS-025); POS-023 bounded incremental catalog/stock pages, replay checks, atomic cursor advancement and pending stock reconciliation.
- POS-018 cart/checkout totals, POS-019 offline sale atomic transaction/outbox, POS-021 server idempotent push, POS-022 retry worker. No paid-sale support yet.
- D-009 local encryption/restore decision and pilot/production hardening. M0 management board/branch rules remain incomplete.
