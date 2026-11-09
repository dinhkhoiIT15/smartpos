# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-09
verified_commit: efd18aeaaf524660ef33867c76048a936da889d9
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub read/write, no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-09
current_milestone: M5 — sales history and source-separated reporting
current_phase: POS-026 [Issue #49](https://github.com/dinhkhoiIT15/smartpos/issues/49), [Draft PR #50](https://github.com/dinhkhoiIT15/smartpos/pull/50), branch feature/POS-026-sales-reporting. Owner Windows acceptance PENDING; NOT merged
ci_status: POS-026 Linux/API, Windows Node24, disposable PostgreSQL16 plus Docs final HEAD verification PENDING; no owner acceptance without green full workflow on final PR SHA
production_status: NOT DEPLOYED — D-013 real password login, OS-backed staff/device identity, signed offline grant and checkout/sync remain UNIMPLEMENTED. Normal report API 404. No Neon migrations or writes.

## Owner-verified merged main

- POS-001 through POS-024 owner accepted and merged.
- POS-025 [PR #48](https://github.com/dinhkhoiIT15/smartpos/pull/48) owner Windows acceptance and merge verified at [main `efd18ae`](https://github.com/dinhkhoiIT15/smartpos/commit/efd18aeaaf524660ef33867c76048a936da889d9), with [post-merge Foundation CI #42598447814](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42598447814) SUCCESS. Issue #47 closed 2026-11-09 after owner report. Its internal short-lived sessions are NOT a shipped login.
- POS-023 conservative late-ACK/stock-rebase understatement remains open; verify before pilot.

## POS-026 Draft PR #50, implementation

- `apps/api/src/reporting/sales-report.ts` + `sales-routes.ts`: read-only server sale `POSTED` projection with current DB membership check, ADMIN/MANAGER own-store, CASHIER own sales, VN local client-created day, 31-day bounded range, fixed SQL and deterministic pagination. Returns separate `matchedSalesGrossVnd` (full totals of matching sales) and `skuLineGrossVnd` (SKU line totals), per day/cashier/top 50 SKU, conflict counts, VND numeric-to-text.
- `apps/desktop/src/main/local-db/sales-report.ts`: MAIN-only store/device scoped read-only local paid sale report with persisted receipt/hash/CASH evidence verification; `LOCAL_PENDING`, `LOCAL_NEEDS_REVIEW_UNCONFIRMED`, `SERVER_ACKED_MIRROR` buckets, BigInt string VND. Report refuses >5000 local sales instead of silent truncation; local ACKED mirror must never be added to cloud totals.
- Synthetic React `sales-report-demo.tsx`: four fixture rows, a cloud sale and local ACKed mirror deliberately repeated; date/cashier/SKU/state filters, no real IPC/network/database, `DEMO_ONLY`.
- Tests `sales-routes.test.ts`, disposable `sales-report.pg.test.ts`, file-backed SQLite `sales-report.test.ts`, D-013 `sales-report-boundary.test.mjs`; CI Linux/Windows Node24/disposable PG16. No new PostgreSQL or SQLite schema migration.
- [POS-026 Windows acceptance guide](../docs/POS-026_SALES_REPORT_ACCEPTANCE.md).

## Next

1. Final SHA Foundation CI Linux/API, Windows Node24, ephemeral PG16 + Docs all SUCCESS; fix any regressions before owner handoff.
2. Owner Windows safe local/API tests, desktop build/security and `pnpm run check`.
3. Electron demo filter, ACKed mirror and zero combined-total check; health200 and reports endpoint404 even with spoofed headers.
4. Owner Windows PASS/security review/manual merge PR #50; close Issue #49. POS-027 (M5/P0 secrets IPC/local data protection) is next after POS-026.
