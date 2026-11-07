# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-07
verified_commit: 269f035da106e1ec6787e95c8fd9f91967b7599a
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub collaborator supports branches, Issues, PRs but not admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-07
current_milestone: M2 — versioned sync contracts (M0 governance still pending)
current_phase: POS-016 ZOD + OPENAPI SYNC WIRE V1 — DRAFT PR #30, UNMERGED
ci_status: POS-016 checkpoint 7af0dddc65008e6a05e9c84dca96fee7056681d1 verified Foundation CI 42392721677 and Docs CI 42392721705 SUCCESS; contracts suite 19/19 PASS; final docs-only HEAD needs recheck
production_status: NOT DEPLOYED — no real checkout, sync worker, auth or Neon writes

## Verified main and owner-completed work
- POS-001 Node/pnpm PR #5, POS-002/004 docs/CI PR #3, POS-007 Electron demo PR #8, POS-008 Fastify health PR #10, POS-009 Neon DEV read-only TLS check PR #12/#13, POS-010 Zod/bigint VND contracts PR #15 merged.
- POS-012 PostgreSQL v1 17-table Drizzle migration PR #17 merged; owner separately verified 17 tables + migration journal in isolated **Neon development**, not production.
- POS-013 SQLite v1 PR #19 and Windows SQLite cleanup PR #22 merged, user reported all Windows tests/demo accepted. Issues #18/#21 closed.
- POS-011 offline device/staff authorization DESIGN PRs #23/#24 merged; owner approved D-010 maximum four-hour offline grant policy. Actual login/secure keys/clock anti-rollback remain unimplemented D-013/R-005.
- POS-014 catalog/SKU service PR #26 merged, Windows accepted, Issue #25 closed. Catalog mutation routes disabled until real authentication exists.
- [POS-015 inventory PR #28](https://github.com/dinhkhoiIT15/smartpos/pull/28) **merged and owner accepted on Windows**; [Issue #27](https://github.com/dinhkhoiIT15/smartpos/issues/27) CLOSED. Latest verified [main SHA `269f035da106`](https://github.com/dinhkhoiIT15/smartpos/commit/269f035da106e1ec6787e95c8fd9f91967b7599a). Server inventory routes remain disabled absent real login. `verified_commit` refers to actual main, NOT current feature head.

## POS-016 code/design in review
- Tracking [Issue #29](https://github.com/dinhkhoiIT15/smartpos/issues/29), [draft PR #30](https://github.com/dinhkhoiIT15/smartpos/pull/30), branch `feature/POS-016-versioned-sync-contract`.
- `packages/contracts/src/vnd.ts` factors existing VND schema out of `index.ts` to prevent circular import. Legacy exported `vndStringSchema`, `MAX_VND`, `parseVndString` and cart DTOs preserved.
- `packages/contracts/src/sync-v1.ts`: Zod strict v1 cash `SALE_COMPLETED` event with immutable sale/items/payment snapshots and `BigInt` line/cash arithmetic; canonical sorted-key UTF-8 SHA-256 integrity digest; max 25 event batch/512 KiB; duplicate event/sale ID and mixed-device/store rejection; exact event/sale ACK matching and pure receipt replay identity (identical hash repeats original ACK; changed hash conflicts); ACKED/NEEDS_REVIEW/RETRY response and HTTP error schema; pull query + high watermark/order/page invariants.
- [Sync design](../docs/sync/POS-016_SYNC_CONTRACT.md), [OpenAPI 3.1](../docs/sync/openapi-v1.yaml), 6 versioned JSON fixtures in `docs/sync/examples/`, `packages/contracts/src/sync-v1.test.ts` confirms fixture SHA-256/hash and rejects invalid protocol, money, sale ID, revision/page, auth payload fields.
- Two CI regressions fixed: TypeScript duplicate `sale` object key in test; circular import from `index.ts` to `sync-v1.ts`; unsafe `BigInt('1.1')` in nested Zod refinement. All resolved on branch with VND module extraction and validation guard.
- **No server sync route, real credential/signature validation, sync receipt transaction, desktop outbox worker or SQLite cursor writes.** Normal Fastify `/v1/sync/*` remains 404.
- Source-of-truth locked offline policy and approved business rules unchanged. No migration, Neon/production data access, SQLite DB changes, package dependencies or credential files.

## Pending review and acceptance
1. Verify CI on latest PR #30 HEAD: Node 24 strict TypeScript + full contracts tests/JSON examples, existing Fastify/Electron, Windows SQLite, PostgreSQL 16 and Docs checks.
2. Owner checks out POS-016 branch, runs `pnpm --filter @smartpos/contracts typecheck`, `pnpm --filter @smartpos/contracts test`, `pnpm run check`. API health 200 and `GET /v1/sync/pull` 404 are manual smoke checks.
3. Human review/merge PR #30 only after Windows acceptance; close Issue #29 only after verified merged/accepted. No Neon connection/test or migration for this issue.
4. Follow-ups: POS-017 SQLite catalog cache; POS-021 live server idempotent sync/negative-stock reconciliation; POS-022 retry outbox; POS-023 pull cursor/canonical store stock delta stream; POS-024 conflict workflow, secure auth POS-025 and D-013 implementation before any real checkout.
5. M0 management POS-003 board/POS-005 branch protection/POS-006 handoff remain unfinished. D-009 local backup encryption/restore still OPEN.
