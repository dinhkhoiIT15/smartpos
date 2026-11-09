# SEC-013A — Signed offline-grant prototype acceptance (DESIGN ONLY)

**Issue:** [#60](https://github.com/dinhkhoiIT15/smartpos/issues/60). **ADR:** [ADR-0006](ADR-0006-sec013-offline-grant-crypto-proposal.md) PROPOSED. Base main `989a9badc971f84f51a26b7fe9618363d2eb2244`.

This is **NOT SEC-013 complete**. No production API login, device enrollment, OS-backed private key, antireplay/clock store, cashier checkout IPC or auth HTTP transport exists. App remains DEMO_ONLY.

## Run on Windows (PowerShell, no database/network secrets)

```powershell
cd C:\Users\dinhk\Desktop\smartpos
git status --short
git fetch origin
git switch feature/SEC-013A-signed-grant-prototype
git pull --ff-only origin feature/SEC-013A-signed-grant-prototype
pnpm install --frozen-lockfile
node --test docs/security/offline-grant-signature-prototype.test.mjs
node --test docs/security/offline-access-reference.test.mjs
pnpm --filter @smartpos/api test:staff
pnpm --filter @smartpos/desktop test:security
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop build
pnpm run check
```

Every test must have `fail 0`; no `migrate:dev`, no live PostgreSQL/Neon, no real cashier credentials.

## Acceptance

- [ ] Cryptographic prototype tests: positive pinned-key Ed25519, payload/signature mutation, unpinned/unknown key, algorithm confusion, invalid role/permissions, 4-hour upper bound, strict IDs and JSON canonicalization.
- [ ] Boundary test: no prototype import in Electron main/preload/renderer or normal Fastify main. IPC remains read-only and returns DEMO_ONLY; staff/login, sync and paid routes are 404 by default.
- [ ] CI Linux Foundation + Windows Node 24 + Docs validation PASS on final PR SHA. Installer CI is an independent DEMO release gate.
- [ ] Review risks T-02, T-03, T-05, T-08, T-09, T-10, T-15 and proposed ADR-0006. D-013 still OPEN until explicit owner decision.
- [ ] No real key generated/stored, no new npm dependency, PostgreSQL/SQLite migration, checkout or payment record, API route or userData deletion.

### Next SEC-013 slices after owner design approval

SEC-013B server Argon2id login and online reauthentication (disposable integration tests); SEC-013C OS-backed device proof and single-device grant issuance; SEC-013D protected clock + cashier shift / revocation + checked Electron MAIN integration; SEC-013E authenticated sync transport and Windows/macOS end-to-end security acceptance. No single slice alone permits live pilot.
