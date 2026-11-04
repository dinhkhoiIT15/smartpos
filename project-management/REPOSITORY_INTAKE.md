# Repository Intake — GitHub verification

**Verified at:** 2026-11-04 (M0 POS-002 / POS-004 review).

## Confirmed repository facts
- Repository URL: https://github.com/dinhkhoiIT15/smartpos
- Owner: `dinhkhoiIT15` (personal account); visibility: **public**.
- Default branch: `main`.
- Verified initial main HEAD: `d41f4750e445b2a1b65049ce2c3eee3add67781e` (first commit).
- Linked user: `iameewh-lgtm` (collaborator; pull/push/triage allowed, admin not allowed).
- PR branch: `feature/POS-002-004-fix-foundation-layout`.
- PR: https://github.com/dinhkhoiIT15/smartpos/pull/3 (**not merged at initial intake**).
- Tracking issues: [#1 POS-002](https://github.com/dinhkhoiIT15/smartpos/issues/1), [#2 POS-004](https://github.com/dinhkhoiIT15/smartpos/issues/2).
- GitHub Project board: **NOT VERIFIED / NOT CREATED IN THIS TASK**.
- Branch ruleset/protection: **NOT VERIFIED** (owner/admin must review).
- Local working tree status: **NOT VERIFIED** (no local Git checkout here).
- GitHub Actions initial runs for PR #3: [M0 Repository Checks](https://github.com/dinhkhoiIT15/smartpos/actions/runs/41860574654) and [M0 Documentation Validation](https://github.com/dinhkhoiIT15/smartpos/actions/runs/41860574762); initially **queued**, recheck latest runs before merge.

## Evidence and boundaries
- GitHub connector read repository files, created a feature branch and compared changes against main.
- Documentation, source files and M0 scripts were examined. No app code, Neon database, migrations or live tests executed.
- `verified_commit` in `DEVELOPMENT_STATUS.md` is the inspected **main** SHA, not the current unmerged PR head.
- Pull Request changes are not production deployments; after merge, refresh main SHA, actual CI conclusion and handoff.

## Re-verify next session
1. Read `AGENTS.md`, `DEVELOPMENT_STATUS.md` and `SESSION_HANDOFF.md`.
2. Re-fetch main SHA and PR HEAD; inspect PR checks, merge state and CI run details.
3. If PR #3 checks pass, owner/reviewer may merge; do not infer merge from PR creation.
4. Record the actual merged main SHA and verify `node scripts/validate-context.mjs` on checkout or CI.
5. Then progress POS-001 workspace initialization and M0 issue-board/governance work.
