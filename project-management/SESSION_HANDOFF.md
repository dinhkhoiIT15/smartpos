# Session Handoff — SmartPOS

## Current task (2026-11-05)
- [Issue #14 — POS-010](https://github.com/dinhkhoiIT15/smartpos/issues/14): Shared Zod contracts and pure VND bigint domain helpers.
- Repository: https://github.com/dinhkhoiIT15/smartpos
- Verified main base: `e138ca32290ff30041487ce594bdbefdccae11dd` (POS-009 diagnostic PR #13 merged).
- Feature branch: `feature/POS-010-contracts-vnd-domain`, [draft PR #15](https://github.com/dinhkhoiIT15/smartpos/pull/15); NOT merged.
- [POS-009 #11](https://github.com/dinhkhoiIT15/smartpos/issues/11) closed after user confirmed `SELECT 1 succeeded (TLS connection)` on Neon development in Windows; no credentials stored.

## Feature branch scope
- `packages/contracts`: Zod v4.6.7 validated cart estimate inputs with SKU/name snapshots, positive integer quantity and canonical decimal VND strings bounded by signed 64-bit.
- `packages/domain`: pure bigint calculations of line subtotal, discount, cash amount due/change; reject floats, over-discounts, invalid quantities, overflows and insufficient tender.
- Added Node tests + CI step running both package test suites.
- Dependency lockfile generated with pinned pnpm and temporary workflow removed before merge; inspect actual CI evidence.
- README/status/handoff updated. No changes to PRD, architecture, ADR, logical DB schema or offline sync.
- No sale is posted, no PostgreSQL table/schema created, no migration executed and no actual money received.

## Verification pending
- Latest PR HEAD must pass frozen `pnpm install --frozen-lockfile`, `pnpm run check` (strict TypeScript), `pnpm --filter @smartpos/contracts test` and `pnpm --filter @smartpos/domain test`.
- Existing Fastify health/security and Electron build checks must remain green.
- Review source and CI results; PR #15 should not be merged until those gates pass.
- Repository owner/admin approval remains necessary for main branch governance; this session does not alter it.

## Next step after POS-010 review/merge
- POS-012 PostgreSQL schema + migrations is next dependency. Follow the approved `docs/DATABASE_SCHEMA.md` logical baseline and `docs/OFFLINE_SYNC_DESIGN.md`; review FK, CHECK, uniqueness, indexes and transaction/rollback plan before testing migrations.
- Only run against isolated Neon **development** branch with explicit user approval, never production. Do not request/publish `DATABASE_URL`.
- Update this handoff after merge against the true new main SHA and CI URLs.

## Required recheck at next session
1. Read AGENTS.md, this handoff and DEVELOPMENT_STATUS.md.
2. Compare real main SHA and PR #15 HEAD/checks/merge status.
3. Record changed files/tests and address any CI failure on branch.
4. Do not call POS-010 done until review, CI and merge.
