# Session Handoff — SmartPOS

## Last session
- Date: 2026-11-04
- Context: Requirements locked; generated M0 documentation/starter package. User plans to connect GitHub.
- Issue: NONE EXECUTED; backlog IDs are proposed.
- Branch: NOT VERIFIED
- Commit SHA: NOT VERIFIED
- PR URL: NONE
- Repository connection: NOT VERIFIED

## What was produced
- Locked PRD v1.0, business rules, architecture ADRs, logical DB schema and offline sync policy.
- AI development contract, status/roadmap/backlog, templates and docs-validation workflow starter.

## Actual code changes in user's GitHub repo
NONE VERIFIED. Any files bundled locally are not automatically committed or pushed.

## Tests
- No product unit/integration/e2e tests executed.
- Run local doc validator after extracting package: `node scripts/validate-context.mjs`.

## Decisions / risks
- One offline till at a time. Keep immutable cash sales through sync conflicts.
- No IMEI/Serial, tax invoice, or hardware integrations at MVP.
- Need to design offline authentication, secret handling and backup before pilot.

## Immediate next steps
1. User connects GitHub and identifies repository.
2. Coding agent compares repository HEAD to this package; only then commits files (scoped PR preferred).
3. Import M0 issues; check docs CI; run POS-001.

## Template for NEXT SESSION
- Date / operator:
- Issue ID / goal:
- Repository URL / branch / verified HEAD:
- Diff summary / touched files:
- Commands actually executed and results:
- CI URL/status:
- PR / merge status:
- New ADR/change requests:
- Remaining blockers and proposed next task:

## Follow-up package v1.1 (prepared locally)
- Added root workspace configuration, governance and onboarding docs, risk/change tracking, extra templates, M0 CI checks and `context-report.mjs`.
- No application source code and no GitHub commit verified.
- Next action: inspect user repository after connection, compare files and create a scoped PR for M0 documents/config.
- Thiết lập `tsconfig.base.json`, coding conventions và Neon setup checklist; những nội dung này chưa là mã nguồn ứng dụng.
