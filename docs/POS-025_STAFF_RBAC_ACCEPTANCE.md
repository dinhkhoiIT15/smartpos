# POS-025 — Online staff sessions and server RBAC, Windows acceptance

**M5/P0 • [Issue #47](https://github.com/dinhkhoiIT15/smartpos/issues/47) • [Draft PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48)**

## Exact security boundary

This is an **internal server foundation**, NOT a login shipped to operators. It implements **revocable server-side session records and authorization** only after an independent trusted online identity verification step. POS-011 [ADR-0004](ADR-0004-offline-auth-device-provisioning.md) explicitly requires an Argon2id login policy, throttling, secure desktop storage, online shift validation, a signed device-bound offline grant and OS-backed key/clock handling. **Those are still absent (D-013 OPEN); don't mount these routes publicly or allow live checkout/sync.**

- Server token: 32 bytes of CSPRNG data encoded to a 43-character base64url bearer. Only its SHA-256 digest is stored in PostgreSQL; never store or log the original bearer.
- A fixed 15-minute *online session* expiry is enforced in database CHECK. This is NOT the approved 4-hour D-010 signed offline cashier grant (not implemented).
- Issue only after a caller has genuinely verified identity server-side. `issueForVerifiedIdentity` is **internal and not exposed** on `main.ts`; a caller-supplied UUID, header or fictional login is not proof.
- Every resolve checks current users.active, store_memberships.active/role, store scope, expiry and revocation against PostgreSQL. Manager/Cashier cannot change staff; Admin can with reason, atomically invalidating affected sessions and appending immutable audit. Never demote the last active Admin.
- `buildServer({staff:...})` routes and `createStaffPrincipalResolver` are opt-in **Fastify.inject test interfaces only**. Normal Fastify `/v1/staff/*`, catalog mutations, inventory and sync/conflicts still 404.
- New **additive migration** `0001_staff_sessions.sql` creates 18th PostgreSQL table and new Drizzle journal entry. Existing v1 SQLite nine tables unchanged. This migration has **NOT been applied to Neon**; owner must separately approve any development DB migration after reviewing data/rollback plan.

## Windows commands — SAFE, without database secrets

From `C:\Users\dinhk\Desktop\smartpos`, after protecting local changes:

```powershell
git status --short
git fetch origin
git switch feature/POS-025-staff-rbac-sessions
git pull --ff-only origin feature/POS-025-staff-rbac-sessions
git log -1 --oneline

node --version
pnpm --version
pnpm install --frozen-lockfile

pnpm --filter @smartpos/db typecheck
pnpm --filter @smartpos/db schema:check
pnpm --filter @smartpos/api typecheck
pnpm --filter @smartpos/api test:staff
pnpm --filter @smartpos/api test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
```

Node **24.x**, pnpm **10.20.0**, all exits 0, test failures 0. **Do NOT run** `pnpm --filter @smartpos/db migrate:dev` or tests against Neon; any migrations require a separate, explicit development-only approval.

## CI-disposable PostgreSQL integration, not Neon

Only GitHub Actions creates local **PostgreSQL 16** on `127.0.0.1:5432/smartpos_ci`, applies both Drizzle migrations using `test:migrations`, then runs `pnpm --filter @smartpos/api test:staff:pg`. Guard rejects any other host/database. Verify final PR SHA and ALL jobs green. Scenarios:

1. Wrong-store/missing/inactive staff cannot receive an internal token, malformed/forged token rejected; token digest stored, never plaintext; 15-minute expiry, single audit per issue.
2. Current authoritative role is read live on every resolve: cashier stays read-only, manager no staff administration, revoked/expired session or disabled user/membership immediately denied.
3. Admin reason-required change updates role and active flag, revokes all affected sessions and records audit in one transaction. Repeated same state is no-op; concurrent requests produce one mutation; no last-admin removal.
4. Invalid target/other-store ID not disclosed; a forced `audit_logs` failure rolls back *both* membership update and session revocation. Catalog/inventory/conflict data are not rewritten.
5. Existing POS-024 injected conflict route can use POS-025 session resolver; unknown/malformed role and spoofed headers do not confer permissions.
6. Drizzle migration history is **2** entries and staff token digest, TTL and FK DB constraints reject bad records.

## Manual Fastify default-deny smoke

Terminal 1:

```powershell
pnpm --filter @smartpos/api dev
```

Terminal 2:

```powershell
curl.exe -i "http://127.0.0.1:3001/v1/health"
curl.exe -i "http://127.0.0.1:3001/v1/staff/me"
curl.exe -i "http://127.0.0.1:3001/v1/staff/login"
curl.exe -i -H "x-role: ADMIN" -H "authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" "http://127.0.0.1:3001/v1/staff/me"
curl.exe -i "http://127.0.0.1:3001/v1/sync/conflicts"
```

Expected health **HTTP 200**, ALL staff/conflict routes **HTTP 404**. No real login, authorization or Neon session created from this smoke.

Optional Electron `pnpm --filter @smartpos/desktop dev`: existing **DEMO ONLY** cart, sample receipt, conflict mock and IPC remain unchanged. Browser Vite lacks Electron preload by design.

## Migration and rollback/forward fix

- Migration 0001 is **additive**, no existing table changes. For a disposable database, reset it and rerun both migrations. Never delete a migration from history or drop sessions on real environments without independent owner approval, backup and operational plan.
- If a future owner-approved **Neon development** migration runs and must be rolled forward, disable session issuance and revoke active sessions server-side before an independently reviewed corrective migration; do not apply arbitrary reverse SQL or rewrite Drizzle migration history.
- No account passwords, customer data, real store secrets, device keys or production tokens are used in fixtures.

## Owner sign-off

- [ ] Final HEAD Foundation CI Linux/API, Windows Node24, disposable PostgreSQL16 all SUCCESS
- [ ] Final HEAD Docs CI SUCCESS
- [ ] Windows safe commands pass, migration journal/schema check, no Neon
- [ ] Fastify health200, all unauthenticated staff/sync privileged paths 404
- [ ] Electron demo regression pass
- [ ] D-013/Argon2id/session lifecycle and OS-backed offline authorization are not accidentally described as shipped
- [ ] Owner reviews migration and security, reports PASS; **manually merges Draft PR #48**, then closes Issue #47

NOT production-ready, no live checkout, no authenticated cashier shift, no signed offline grant.
