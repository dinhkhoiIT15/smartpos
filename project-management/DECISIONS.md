# Decisions Register

**Rule:** `LOCKED` = user-approved product baseline; `ACCEPTED` = current technical design; `OPEN` = must decide before relevant code. Revisions need linked ADR/Issue + owner approval.

| ID | State | Decision | Source |
|---|---|---|---|
| D-001 | LOCKED | 1 electronics/phone store, 4–20 employees, Windows/macOS | User survey |
| D-002 | LOCKED | One offline cashier device (not multi-device offline checkout) | User follow-up |
| D-003 | LOCKED | No IMEI/serial; inventory by product variant SKU | User follow-up |
| D-004 | LOCKED | Cash only; internal receipt, no fiscal invoice | User follow-up |
| D-005 | LOCKED | Neon PostgreSQL central, low-cost learning/production-oriented | User requirement |
| D-006 | ACCEPTED | Electron+SQLite + Fastify API + Neon; modular monolith | ADR-0001 |
| D-007 | ACCEPTED | Local atomic outbox, idempotent server; cash sales preserved on conflict | ADR-0002 |
| D-008 | ACCEPTED | GitHub Issues + PR + CI truth; Markdown snapshot with commit evidence | AGENTS.md |
| D-009 | OPEN | POS-013 proposes built-in Node 24 `node:sqlite` for Electron MAIN local data; **encryption, backup retention, restore/RPO/RTO still OPEN**, not pilot-approved | [ADR-0003](../docs/ADR-0003-local-sqlite-driver.md); POS-013/027/029 |
| D-010 | OPEN — OWNER APPROVAL REQUIRED | [ADR-0004](../docs/ADR-0004-offline-auth-device-provisioning.md) proposes per-shift signed, device-bound offline grant; server-only staff RBAC, no new login/switch offline, fail-closed on expiry/revoke/clock rollback. Exact maximum grant time, offline outage behavior, secure key storage and device handover **not approved**. | [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), [threat model](../docs/security/POS-011_THREAT_MODEL.md) |
| D-011 | OPEN | Hosting API, Node LTS version pin, desktop signing/release | POS-001/POS-028 |
| D-012 | OPEN | Operational refund/cancel/returns policy before live pilot | Pilot requirement |

Review decisions before implementing related modules.

## M0 v1.1 implementation defaults (reversible)
- Root config uses Node.js 24.x LTS and pnpm 10.20.0 for reproducible tooling; POS-001 must verify platform compatibility before app bootstrap.
- No LICENSE chosen without user instruction.
- `context-report.mjs` is intentionally read-only and does not auto-update status; future GitHub-driven status generation remains an implementation task.
