# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-04
verified_commit: NOT VERIFIED
repository_url: NOT PROVIDED
repo_connection: NOT VERIFIED
last_github_synced_at: NEVER
current_milestone: M0
current_phase: PLANNING / M0 v1.1 FOUNDATION PACKAGE PREPARED
ci_status: NOT RUN ON GITHUB
production_status: NOT DEPLOYED

## Confirmed decisions
- Product baseline v1.0 agreed: 1 store, 1 offline POS, 4–20 employees, SKU variants, cash, internal receipt; no IMEI.
- Architecture baseline: Electron + SQLite, Fastify API, Neon PostgreSQL, outbox/idempotent sync.

## Implementation state
- No application implementation verified.
- No Neon database project/branch verified.
- No GitHub repository contents inspected or modified.
- No GitHub Issues/PR/CI results verified.
- M0 files in this package are **proposed artifacts** until committed by user/agent.

## M0 exit checklist
- [ ] Package committed into user's repo
- [ ] GitHub backlog issues created and linked
- [ ] Monorepo initialization implemented
- [ ] CI docs check green on GitHub
- [ ] Main branch governance reviewed
- [ ] Handoff reconciled against actual HEAD

## Current risks
- Credential and offline-auth policy pending design task.
- Single-device offline conflict handling requires tests.
- Device data recovery/backup not implemented.
- Return/refund process deferred; not ready for live commercial operation.

## Next task
POS-001 (initialize pnpm workspace), after GitHub connection + repo verification.

## Evidence
Project decisions came from requirements conversation; **no code / deployment test evidence**. Local document validator may pass on the ZIP, but is not equivalent to GitHub CI.

## Package v1.1 notes
- Added monorepo root config, contribution/security instructions, environment/backup/traceability documents, risk register and read-only context report.
- Artifacts are prepared **outside the target GitHub repository**; no CI/PR/commit from the user repository has been verified.
