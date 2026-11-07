# TODO — SmartPOS verified priorities

**Snapshot:** 2026-11-07. Source of truth is GitHub Issues, PR status, main SHA and CI, not this Markdown file.

## Main — verified merged and developer accepted
- [x] POS-001 PR #5 — Node 24 / pnpm 10.20.0 monorepo
- [x] POS-002 + POS-004 PR #3 — approved M0 docs and CI
- [x] POS-007 PR #8 — secure Electron demo; Windows GUI accepted (old [Issue #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) remains open for governance reconciliation)
- [x] POS-008 PR #10 — Fastify health endpoint verified on Windows
- [x] POS-009 PRs #12/#13 — server-only Neon development SELECT 1 TLS connection check
- [x] POS-010 PR #15 — Zod and signed BIGINT VND domain contracts
- [x] POS-012 PR #17 — 17-table PostgreSQL migration; developer manually verified schema and Drizzle journal in **Neon development**; no production migration
- [x] POS-013 PR #19 and BUG-013 PR #22 — local SQLite v1 and Windows EPERM cleanup; 7/7 Windows CI and user-accepted launch/reopen (Issues #18/#21 closed)
- [x] POS-011 design PR #23 + owner-approved four-hour offline grant policy PR #24 — D-010 ACCEPTED, 35/35 synthetic reference tests. [Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) CLOSED for **design only**; real authentication/OS keys not implemented, R-005 HIGH OPEN. Verified main `9be30b9f6a1a`.

## Current task — POS-014 review and Windows acceptance
- [ ] [POS-014 Issue #25](https://github.com/dinhkhoiIT15/smartpos/issues/25), [draft PR #26](https://github.com/dinhkhoiIT15/smartpos/pull/26): strict Zod catalog/product/variant CRUD, uppercase per-store SKU and per-product attribute key, VND bigint decimal wire, optimistic variant revision and atomic catalog change/audit append. **Catalog routes intentionally disabled in normal API** until real auth/RBAC; no Neon writes.
- [ ] Latest PR #26 CI green (including disposable PostgreSQL 16 integration), owner Windows `typecheck` / `test:catalog` / `test` / health and catalog-404 smoke. Then review/merge and close #25.

## Next milestones, dependent work
- [ ] POS-015 — inventory balances/movements + audit + non-lost concurrent stock updates
- [ ] POS-016 — versioned sync API contracts
- [ ] POS-017 — catalog sync/cache into local SQLite (requires POS-014 merged)
- [ ] POS-018/019 — cash cart UI and atomic offline sale+payment+stock+outbox; real cryptographic offline device authorization must exist before checkout.
- [ ] POS-020–024 — internal receipt, idempotent sync, retry/outbox and conflict reconciliation.
- [ ] POS-025–030 — actual staff RBAC, reports, secrets/backup hardening, Windows/macOS release and pilot review.
- [ ] Separately authorize implementation of staff login/device provisioning/signature verification and decide D-013 idle lock, OS key storage and device handover proof. **D-010 design approval is not live login.**

## M0 governance still open
- [ ] POS-003 — GitHub Issues / Project board imported
- [ ] POS-005 — owner-admin protects `main` and configures PR review
- [ ] POS-006 — independently verify fresh-session handoff
- [ ] Reconcile old POS-007 Issue #7 after confirming its IPC acceptance record

**Safety:** no secret `.env`, production data, SQLite binaries or Neon credentials; no production migration, no real customer checkout.
