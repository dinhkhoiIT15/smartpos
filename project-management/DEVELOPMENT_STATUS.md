# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: f102091c6de9ba4d6616129d7df2129415173377
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub read/write connector; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-09
current_milestone: M4 — offline sync reconciliation
current_phase: POS-024 [Issue #45](https://github.com/dinhkhoiIT15/smartpos/issues/45), [Draft PR #46](https://github.com/dinhkhoiIT15/smartpos/pull/46); owner Windows acceptance PENDING; NOT merged
ci_status: Foundation/API/Windows/disposable PostgreSQL CI runs are pending final HEAD verification; do not treat PR as PASS before run and owner evidence.
production_status: NOT DEPLOYED — D-013 signed device/cashier grant and real staff RBAC/POS-025 missing, normal API conflict/PUSH/PULL routes 404, normal Electron demo workers not activated, no Neon sale writes

## Verified owner-accepted main

- POS-001–POS-022 already accepted and merged.
- POS-023 [PR #44](https://github.com/dinhkhoiIT15/smartpos/pull/44) owner Windows PASS, merged [main `f102091`](https://github.com/dinhkhoiIT15/smartpos/commit/f102091c6de9ba4d6616129d7df2129415173377); Foundation CI [#42451595741](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42451595741) SUCCESS all 3 jobs. Issue #43 closed 2026-11-09 after owner acceptance. No live sync activated.
- POS-023 conservative late-ACK-after-stock-PULL caveat remains: local available qty may be temporarily understated pending durable rebase marker/trusted reconciliation; must be addressed before pilot, never erase cash sale.

## Current POS-024 Draft PR #46

- `apps/api/src/sync/conflict-review.ts`: internal authoritative active manager/admin membership; store-scoped list/detail for STOCK_SHORTAGE and STALE_PRICE, 1..100 page; actor note/UUID review, row-lock OPEN -> RESOLVED, exact repeat returns REPLAYED, divergent close 409, atomic append-only audit with rollback.
- `apps/api/src/sync/conflict-review-routes.ts`: opt-in Fastify.inject test adapter with trusted synthetic principal; normal `main.ts` does not mount review endpoints and fake role headers fail closed.
- `apps/api/src/sync/conflict-review-routes.test.ts` and `conflict-review.pg.test.ts`: default-deny, strict schema, real PG16 POS-021 generated shortage/stale-price conflict, manager/cashier/foreign-store/revocation, concurrent idempotency, audit rollback and original financial/stock/receipt immutability.
- `apps/desktop/src/renderer/src/conflict-demo.tsx`: two synthetic fixed demo scenarios with only in-memory state, no network/DB/IPC/auth. Does not display real conflicts or record a true audit.
- CI includes Linux/Windows Node24 default-deny and ephemeral PG16 integration. No migrations, production/Neon writes, real auth, new dependencies.
- [POS-024 full Windows acceptance](../docs/POS-024_CONFLICT_REVIEW_ACCEPTANCE.md).

## Next

1. Verify final HEAD CI Foundation (Linux/Windows/disposable PG16) and Documentation ALL green; fix any regressions on the branch.
2. Owner Windows safe scripts: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/api test:conflicts`, `pnpm --filter @smartpos/api test`, `pnpm --filter @smartpos/desktop typecheck`, `pnpm --filter @smartpos/desktop security:check`, `pnpm --filter @smartpos/desktop build`, `pnpm run check`.
3. Manual Electron demo conflict filter/note/ack memory-only, existing cart/receipt/IPC regression and normal conflict API HTTP404; no Neon.
4. Owner security review and explicit Windows PASS, then manually merge PR #46 and close Issue #45. D-013/POS-025 still block production functionality.
