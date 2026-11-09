# Session Handoff — POS-025 SmartPOS

## Verified main and current feature

- Owner confirmed POS-024 Windows PASS/merge; GitHub verified [PR #46](https://github.com/dinhkhoiIT15/smartpos/pull/46) merged into main at `026bfa1ce51274525cb99cb44c847a115ac00744`, [Foundation CI #42588442780](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42588442780) SUCCESS.
- [POS-025 Issue #47](https://github.com/dinhkhoiIT15/smartpos/issues/47), [Draft PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48) on `feature/POS-025-staff-rbac-sessions`, created from exactly that main SHA. **NOT merged; owner Windows acceptance pending**.

## Implementation and invariants

- PostgreSQL additive `0001_staff_sessions.sql` + Drizzle schema/journal/snapshot, 18th table. UUID session and store/user, SHA-256 hash of 256-bit random bearer, 15-minute max online TTL, revoke timestamp/actor, indexes/constraints. Migration tested only on disposable PG16; no Neon migration approved.
- `StaffSessionService` is strictly server/internal. Issuance `issueForVerifiedIdentity` assumes **already verified online identity by a future reviewed login provider**, does not authenticate caller inputs itself, and MUST NEVER be mounted as a public endpoint. `resolve` checks current active membership, role, user status, expiry and revocation each time. No token plaintext in DB/audit; no role spoof by HTTP headers.
- ADMIN can update member role/active with reason; store-scoped advisory lock, last-active-admin rule, revoke affected sessions, append audit atomically. Manager/Cashier have no staff-admin permissions; own logout is audited. Existing catalog/inventory/conflict services still do their own DB membership checks and can use an opt-in resolver based on `StaffSessionService`.
- Opt-in `buildServer({staff:...})` Fastify routes only for test injection; real `main.ts` exposes no staff/login/privileged routes. Desktop remains DEMO ONLY with no new IPC/token handling. Existing offline sale/stock/receipt evidence untouched.
- Unit/API default-deny tests, disposable PG16 issue/revoke/role/expiry/cross-store/last-admin/concurrent audit rollback tests, additive migration tests; CI Linux, Windows Node24 and disposable PostgreSQL.
- D-013 still OPEN: Argon2id password verification + rate limiting, validated login, refresh, OS-backed credential/key storage, device-bound signed grants/shift/clock, secure public HTTP lifecycle before any live use.

## Windows SAFE acceptance (NO Neon)

```powershell
git fetch origin
git switch feature/POS-025-staff-rbac-sessions
git pull --ff-only origin feature/POS-025-staff-rbac-sessions
pnpm install --frozen-lockfile
pnpm --filter @smartpos/db typecheck
pnpm --filter @smartpos/db schema:check
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:staff
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Detailed [Windows acceptance guide](../docs/POS-025_STAFF_RBAC_ACCEPTANCE.md). Actual PG `test:staff:pg` only GitHub CI localhost smartpos_ci, never Neon. Normal Fastify health200, staff/login/sync paths 404 even with spoofed headers. Owner must manually review/merge Draft PR after Windows PASS.

## Handoff checkpoint

POS-025 checkpoint `e675fea` CI verified: [Foundation #42590414219](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42590414219) SUCCESS all 3 Linux/API, Windows Node24 and disposable PG16 jobs (including staff RBAC sessions and migration); [Docs #42590414113](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42590414113) SUCCESS at same SHA. Since this handoff documentation is subsequently updated, recheck final HEAD CI before owner signoff. Human Windows PASS NOT YET reported; no Neon, no production auth. Keep issue open, PR Draft and no production rollout until explicit owner acceptance. Next backlog after owner merge: POS-026 synced vs pending sales reporting (M5/P1).
