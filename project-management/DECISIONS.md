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
| D-009 | OPEN | Specific SQLite driver, encryption & backup strategy | Future issue |
| D-010 | OPEN | Offline auth cache expiry, device provision/revoke reconciliation | POS-011 |
| D-011 | OPEN | Hosting API, Node LTS version pin, desktop signing/release | POS-001/POS-028 |
| D-012 | OPEN | Operational refund/cancel/returns policy before live pilot | Pilot requirement |

Review decisions before implementing related modules.

## M0 v1.1 implementation defaults (reversible)
- Root config uses Node.js 24.x LTS and pnpm 10.20.0 for reproducible tooling; POS-001 must verify platform compatibility before app bootstrap.
- No LICENSE chosen without user instruction.
- `context-report.mjs` is intentionally read-only and does not auto-update status; future GitHub-driven status generation remains an implementation task.
