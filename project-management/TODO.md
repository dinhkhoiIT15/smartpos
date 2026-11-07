# TODO — SmartPOS priorities (manual GitHub review, 2026-11-07)

GitHub PR/Issues and CI remain source of truth; this file is a snapshot.

## Merged / verified user acceptance
- [x] POS-001 (PR #5) — Node 24 / pnpm 10.20 monorepo
- [x] POS-002/POS-004 (PR #3) — approved documentation foundation and docs CI
- [x] POS-007 (PR #8) — secure Electron shell, Windows GUI accepted; [Issue #7](https://github.com/dinhkhoiIT15/smartpos/issues/7) remains open pending bookkeeping
- [x] POS-008 (PR #10) — Fastify /v1/health, Windows response validated
- [x] POS-009 (PR #12/#13) — Neon development SELECT 1 over TLS validated, no production
- [x] POS-010 (PR #15) — Zod contracts and bigint VND
- [x] POS-012 (PR #17) — 17-table PostgreSQL v1 migration applied to isolated Neon development, migration history verified by developer
- [x] POS-013 (PR #19) — Electron-main SQLite v1 schema, WAL/atomic transaction/backup test, Windows re-open accepted. [Issue #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) closed.
- [x] BUG-013 (PR #22) — Windows `EPERM` test cleanup fixed, local acceptance and Windows 7/7 tests passed. [Issue #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) closed; main `36e73cd4bf97`.

## In progress — owner decisions pending
- [ ] [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20) — design staff online login, one-device offline signed grant/revocation; [draft PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23). ADR-0004 + threat model + 32 reference tests, **D-010 still OPEN for approval**. There are no real login endpoints or offline checkout permissions.

## Subsequent critical path
- [ ] Owner approves D-010 grant lifetime, expiry, offline switch/outage and device replacement risk, key storage.
- [ ] Real staff login/provision/revoke + cryptographic grant-verification implementation with new reviewed issue, before POS-019 checkout.
- [ ] POS-014 — catalog/variant API; POS-015 — inventory/adjustment/audit API (POS-012 prerequisite met).
- [ ] POS-016 — versioned sync contract; POS-017 — catalog into SQLite after POS-014.
- [ ] POS-018/019/020 — cashier cart, immutable atomic CASH offline sale/outbox and internal receipt after role/device authorization is truly implemented.
- [ ] POS-021–024 — server idempotency, retry, pull/conflict audits, retain paid sales on sync errors.
- [ ] POS-025–030 — RBAC, reporting, secrets/key protection, installers, recoverability tests, production pilot safety gates.

## Outstanding M0 governance
- [ ] POS-003 GitHub Issues Project board/backlog mapping
- [ ] POS-005 owner/admin branch protection and PR process
- [ ] POS-006 verify fresh AI session against current main SHA/CI
- [ ] Reconcile old POS-007 Issue #7 after explicit IPC smoke evidence and owner approval.

Never share Neon credential, real SQLite/backup files, tokens or passwords. Do not confuse reference-model tests with shipped authentication.
