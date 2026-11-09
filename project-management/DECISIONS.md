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
| D-010 | **ACCEPTED — owner approved 2026-11-07** | **At most 4 hours** per server-issued, store/device/cashier-bound offline checkout grant; begin/switch cashier shift **online only**; **no offline renewal or grace**; on expiry stop new cash checkouts but preserve committed sales/outbox. Reassign the sole offline POS only after verified old-device stop or **all** previously issued grants have expired (no emergency overlap approved). Owner acknowledges up-to-four-hour residual offline-revocation exposure from issuance. This approves a **policy, not live auth**. | [ADR-0004](../docs/ADR-0004-offline-auth-device-provisioning.md), [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), [threat model](../docs/security/POS-011_THREAT_MODEL.md), owner approval in project conversation |
| D-011 | OPEN — production signing/release NOT approved | Hosting API and Windows/macOS supported minima; Windows Authenticode/SmartScreen, Apple Developer ID, notarization/stapling, certificate custody, auto-update, exact builder lockfile and artifact attestation remain open. POS-028 [ADR-0005](../docs/ADR-0005-unsigned-demo-packaging.md) only proposes **unsigned, unpublished, short-lived DEMO CI artifacts**, pinned tooling and SHA-256 manifests; this does NOT close D-011. | POS-001/POS-028 [Issue #53](https://github.com/dinhkhoiIT15/smartpos/issues/53) |
| D-012 | OPEN | Operational refund/cancel/returns policy before live pilot | Pilot requirement |
| D-013 | OPEN — IMPLEMENTATION DETAIL; [ADR-0006](../docs/ADR-0006-sec013-offline-grant-crypto-proposal.md) is only PROPOSED and must receive owner security approval | Still decide inactivity screen lock / re-unlock policy, specific Windows/macOS OS-backed non-exportable key APIs, anti-clock-rollback strength, cryptographic key rotation, old-device shutdown proof and restore/key-loss procedure before live offline authentication. These decisions are **not implied** by D-010's 4h approval. | [POS-011 ADR-0004](../docs/ADR-0004-offline-auth-device-provisioning.md), future reviewed implementation issue, R-005 |

Review decisions before implementing related modules.

## M0 v1.1 implementation defaults (reversible)
- Root config uses Node.js 24.x LTS and pnpm 10.20.0 for reproducible tooling; POS-001 must verify platform compatibility before app bootstrap.
- No LICENSE chosen without user instruction.
- `context-report.mjs` is intentionally read-only and does not auto-update status; future GitHub-driven status generation remains an implementation task.
