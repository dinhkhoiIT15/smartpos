# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-05
verified_commit: e138ca32290ff30041487ce594bdbefdccae11dd
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub linked collaborator; no admin permissions
last_github_synced_at: MANUAL REVIEW 2026-11-05 (not automatic)
current_milestone: M1 (M0 issue board/branch governance/handoff still outstanding)
current_phase: POS-010 ZOD AND BIGINT VND DOMAIN IN DRAFT PR #15 — UNMERGED
ci_status: POS-010 CI/lockfile pending, verify latest PR head
production_status: NOT DEPLOYED

## Verified merged work
- POS-002/POS-004 (PR #3); POS-001 (PR #5) merged.
- POS-007 Electron + React demo (PR #8) merged; user reported Windows desktop window opened.
- POS-008 Fastify health (PR #10) merged; user reported Windows /v1/health status ok, Issue #9 closed.
- POS-009 Neon development connectivity probe (PR #12) and safe diagnostic fix (PR #13) **merged**.
- Developer confirmed Windows `pnpm --filter @smartpos/api db:check` returned `Neon development database: SELECT 1 succeeded (TLS connection).`. [POS-009 Issue #11](https://github.com/dinhkhoiIT15/smartpos/issues/11) closed. This proves read-only development connectivity only; no tables or migrations.
- Verified `main` at [commit `e138ca32290f`](https://github.com/dinhkhoiIT15/smartpos/commit/e138ca32290ff30041487ce594bdbefdccae11dd). Feature branch HEAD must be re-read separately.

## Current M1 POS-010 (not done)
- [Issue #14](https://github.com/dinhkhoiIT15/smartpos/issues/14), [draft PR #15](https://github.com/dinhkhoiIT15/smartpos/pull/15), branch `feature/POS-010-contracts-vnd-domain`.
- Shared Zod cart-estimate DTOs with SKU/name snapshots, integer quantities and VND canonical decimal strings, bounded by signed PostgreSQL BIGINT.
- Pure bigint cash calculations (subtotal, line discounts, due, tendered, change). Tests cover source business rules and overflow/invalid money.
- Exact pinned pnpm lockfile and full CI must be verified, reviewed and merged before POS-010 is Done.
- Approved business rules, PRD, architecture, offline sync policy and logical PostgreSQL model remain unchanged.

## Next planned M1 issue
- POS-012 PostgreSQL schema/migration v1 **depends on POS-009 and POS-010**.
- No Neon development migration has been executed; review schema, FK, indexes, CHECK and rollback/forward-fix plan before applying any SQL. Never run production migrations without explicit owner approval.

## Remaining M0
- POS-003 GitHub board/backlog import.
- POS-005 main branch protection (needs repository owner/admin).
- POS-006 new-session handoff verification against actual HEAD and CI.
