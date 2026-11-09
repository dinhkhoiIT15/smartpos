# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: 026bfa1ce51274525cb99cb44c847a115ac00744
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub issue/PR/commit/CI connector, no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-09
current_milestone: M5 — internal server staff RBAC/session foundation
current_phase: POS-025 [Issue #47](https://github.com/dinhkhoiIT15/smartpos/issues/47), [Draft PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48); implementation on feature/POS-025-staff-rbac-sessions; owner Windows acceptance PENDING, NOT merged
ci_status: POS-025 Foundation CI Linux/API, Windows Node24, disposable PG16 and Docs require final feature HEAD verification; CI failures on intermediate commits were corrected but must not be counted as PASS without final checks
production_status: NOT DEPLOYED — no real Argon2id/rate-limited login, OS-backed desktop credential storage, signed offline device/cashier grant or authorized checkout/sync (D-013); normal staff/catalog/inventory/conflict/sync privileged HTTP routes remain 404; Neon not migrated

## Owner-verified merged main

- POS-001..POS-023 owner accepted and merged.
- POS-024 [PR #46](https://github.com/dinhkhoiIT15/smartpos/pull/46) owner reported Windows PASS and GitHub verified merged at [main `026bfa1`](https://github.com/dinhkhoiIT15/smartpos/commit/026bfa1ce51274525cb99cb44c847a115ac00744). [Foundation CI #42588442780](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42588442780) SUCCESS on merge.
- POS-024 internal conflict review audit and clearly synthetic UI do not activate real online authorization. Conservative late-ACK stock understatement from POS-023 still pending before pilot.

## POS-025 Draft PR #48

- Additive PostgreSQL migration `0001_staff_sessions.sql` + versioned Drizzle metadata and schema; 18th table and 2-entry journal. Store only SHA-256 digest of random 256-bit opaque bearer; 15m expiry, FK to user membership, explicit revocation. Old PostgreSQL 17 tables and SQLite v1 9 tables remain intact; **not applied to Neon**.
- `apps/api/src/auth/staff-sessions.ts`: `issueForVerifiedIdentity` may run ONLY after a trusted upstream identity proof, with no API login route. `resolve` reads active user/membership/store/role/revocation/expiry from PostgreSQL on every call. Admin-only role/active changes with reason and per-store advisory serialization, last-admin protection, affected session revocation plus immutable audit in the SAME transaction; own session revoke audited.
- `apps/api/src/auth/staff-routes.ts`: optional test-injected `/v1/staff/me`, `/v1/staff/logout`, `/v1/staff/members/:id`; `createStaffPrincipalResolver` obtains verified principal from bearer for POS-014/015/024 opt-in test interfaces, never spoofed x-role/header. Normal `main.ts` mounts none of them.
- `apps/api/src/auth/staff-routes.test.ts`, `staff-sessions.pg.test.ts`, new migration constraint tests, Linux/Windows/PG CI regression; no production secrets or real cashier grant.
- [POS-025 Windows/migration/security acceptance](../docs/POS-025_STAFF_RBAC_ACCEPTANCE.md).

## Next

1. Verify final branch SHA Foundation CI (Linux/API, Windows Node24, disposable PostgreSQL 16) and Docs CI all SUCCESS. Fix all errors before owner handoff.
2. Owner Windows SAFE: `pnpm install --frozen-lockfile`, `pnpm --filter @smartpos/db schema:check`, `pnpm --filter @smartpos/api test:staff`, `pnpm --filter @smartpos/api test`, `pnpm --filter @smartpos/desktop build`, `pnpm run check`.
3. Confirm normal Fastify health 200 and staff/privileged routes 404, and Electron remains DEMO ONLY; do not connect Neon/migrate without approval.
4. Owner reviews security, migration and D-013 scope; Windows PASS and manually merges Draft #48. Then close Issue #47, proceed to POS-026 reporting after POS-025 accepted.
