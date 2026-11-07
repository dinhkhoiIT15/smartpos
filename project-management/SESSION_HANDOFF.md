# Session Handoff — SmartPOS

## Session focus: POS-011 auth and offline device design (2026-11-07)
- Repo: https://github.com/dinhkhoiIT15/smartpos
- Verified main at session start: `36e73cd4bf97d1fe76a0001ed8cc1565bd58d06e` — [BUG-013 PR #22](https://github.com/dinhkhoiIT15/smartpos/pull/22) merged.
- Developer accepted SQLite on Windows (all tests plus runtime smoke), [POS-013 #18](https://github.com/dinhkhoiIT15/smartpos/issues/18) and [BUG-013 #21](https://github.com/dinhkhoiIT15/smartpos/issues/21) closed after evidence comment. POS-013 remains development-only local SQLite; no actual checkout.
- Current [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), [draft PR #23](https://github.com/dinhkhoiIT15/smartpos/pull/23), branch `feature/POS-011-offline-auth-device-design`. **UNMERGED**, D-010 owner approval still OPEN.

## Design deliverables in PR #23
- `docs/ADR-0004-offline-auth-device-provisioning.md`: staff roles, online login/reauth, Argon2id password-hashing proposal, pairing a single offline authorized device and key proof, signed purpose-scoped grant bound to store/device/cashier, expiration and known revocation behavior.
- `docs/security/POS-011_THREAT_MODEL.md`: 15 threat cases, clock rollback, cloned/restored SQLite and OS key, stolen device, offline cashier switch, delayed revocation and manual failover.
- `docs/security/offline-access-reference.mjs` and `.test.mjs`: **non-runtime, synthetic design reference only**. There is no cryptographic verification, OS-backed key or real authorization endpoint. Tests simulate already-verified facts; production code MUST NOT import these modules.
- `.github/workflows/ci.yml` runs `node --test docs/security/offline-access-reference.test.mjs`, retaining SQLite Windows/Ubuntu, API/Electron, PostgreSQL jobs.
- Decisions D-010 and risk R-005 stay OPEN; reference links/traceability/status/handoff updated. No locked requirements changed.

## Last verified CI evidence
- Checkpoint `c86e6541df5bdef9dade8c1d6a4c47008484d74f`: [Foundation run 42383728487](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42383728487) succeeded, **32/32 reference policy tests PASS, 0 failures**. Existing Fastify/Electron, Linux+Windows SQLite and disposable PostgreSQL CI passed.
- [Docs run 42383728480](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42383728480) succeeded.
- Latest PR #23 head **after** this checkpoint includes docs edits; re-fetch actual head/workflow runs before calling all checks green.

## Owner decisions REQUIRED before POS-011 accepted
1. Approve or revise proposed policy for staff online login at start of shift and refusal to **start/switch** cashier while offline.
2. Choose maximum age for an offline grant/shift timeout and inactivity lock. **4h in ADR is an example, not a configured policy**. No grace after absolute expiry.
3. Decide operations if Internet outage exceeds grant expiry (proposal: stop new sales, preserve all existing pending sale/outbox records).
4. Decide replacement of offline POS when old register is disconnected. Pure PostgreSQL unique index cannot revoke its cached grant immediately; owner must choose wait for old expiry / verified shutdown or documented emergency residual-risk process.
5. Choose supported Windows/macOS secure key storage and response to device restore/clone. Current SQLite metadata is not a secure key store; D-009 backup encryption remains open.
6. Approve risk R-005 tradeoff: server can reject new grants immediately but previously issued offline grants may remain usable to expiry.

After owner response, update ADR status and D-010 with explicit decision evidence through a new reviewed commit on PR branch. Never mark ACCEPTED based on AI assumption.

## Next session steps
1. Read AGENTS, DEVELOPMENT_STATUS, DECISIONS, ADR-0004, threat model, and actual latest main/PR #23 HEAD with CI.
2. Re-run `node --test docs/security/offline-access-reference.test.mjs` (no credentials needed) after any policy refactor.
3. Review tests against final owner-approved expiry/outage/device replacement rules; update before merging PR #23.
4. Merge after CI and owner approval; only then close [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20).
5. **Do not implement real checkout yet**. POS-011 is a design issue; real server login, cryptographic verification, device provisioning, key storage, audit and tests need their own implementation scope/migrations before POS-019.
6. Next backlog implementation can continue POS-014 catalog / POS-015 inventory separately; POS-003/005/006 M0 governance remain incomplete.

## Security and deployment restrictions
- No real token, password, private key, device credential or Neon `.env` submitted in chat/GitHub.
- No Neon migration or production database changes under POS-011.
- Client clock or device ID alone never grants authority; server validates all online roles/device status; offline verification requires trusted, time-bounded proofs.
