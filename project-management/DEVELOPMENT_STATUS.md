# Development Status — SmartPOS

status_schema: 1
last_reviewed_at: 2026-11-08
verified_commit: ec71c07e45e27b1158811a309da79402786fef5a
verified_ref: main
repository_url: https://github.com/dinhkhoiIT15/smartpos
repo_connection: CONFIRMED — GitHub connected; Issues/branches/PRs available; no admin
last_github_synced_at: MANUAL GITHUB REVIEW 2026-11-08
current_milestone: M3 — internal cash receipt preview + immutable SQLite read model
current_phase: POS-020, [draft PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38), [Issue #37](https://github.com/dinhkhoiIT15/smartpos/issues/37) — owner Windows acceptance pending
ci_status: POS-020 early code [Foundation CI 42432529844](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42432529844) SUCCESS; latest strict SYNCED ACK gate and IPC/print boundary tests have pending final-HEAD CI; verify run before acceptance
production_status: NOT DEPLOYED — no real staff login, signed offline grant, live paid-sale/receipt IPC, sync worker/HTTP, Neon sale writes or fiscal invoices

## Owner-accepted foundation on verified main

- POS-001–POS-018 foundation/catalog/stock/sync contracts/local cache and demo cart all previously accepted and merged. POS-017 [PR #32](https://github.com/dinhkhoiIT15/smartpos/pull/32) and POS-018 [PR #34](https://github.com/dinhkhoiIT15/smartpos/pull/34) were owner Windows PASS and merged.
- POS-019 [PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36) **owner Windows PASS + MERGED** on `main` [SHA `ec71c07e45e27b1158811a309da79402786fef5a`](https://github.com/dinhkhoiIT15/smartpos/commit/ec71c07e45e27b1158811a309da79402786fef5a). Issue #35 closed. Internal MAIN-only SQLite atomic cash sale/items/payment/stock delta/v1 outbox hash, crash recovery and idempotent replay core. This still does not enable paid sales from UI or prove authorization.
- POS-011/D-010 signed offline grant **policy accepted** up to 4h; D-013 cryptographic device/cashier grants, OS key proof, shift/revocation and clock protection remain OPEN. No Neon production/real auth.

## POS-020 feature branch (NOT merged)

- Branch `feature/POS-020-internal-receipt` created from verified `main`; [Issue #37](https://github.com/dinhkhoiIT15/smartpos/issues/37), [Draft PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38).
- `packages/domain/src/receipt.ts`, `receipt.test.ts`, package export: strictly validated pure internal receipt view model in bigint VND canonical decimal strings; receipt line SKU/name/attributes, quantity/price/discount, due/tender/change, local sync labels and `Asia/Ho_Chi_Minh` date. A DEMO view always has `MẪU — KHÔNG CÓ GIAO DỊCH`, no sale ID or paid state. Existing domain tests automatically include 7 new receipt tests.
- `apps/desktop/src/main/local-db/receipt.ts`: strictly **read-only** `loadCommittedLocalReceipt(db,storeId,saleId)` from immutable SQLite sale/items/CASH payment/outbox; verifies exact bigint money snapshots, payment cash, stable SKU order, POS-016 canonical SHA-256, event identity/payload and mismatched items; no mutable catalog repricing. Fails closed if missing/out-of-scope/tampered/partial. `SYNCED` requires matching local outbox state and stored `ACKED` response; no false cloud ACK claims.
- `apps/desktop/src/renderer/src/internal-receipt.tsx`, `app.tsx`, `styles.css`: POS-018 synthetic in-memory cart can open/print **only watermarked DEMO** receipt if valid sufficient tender. Shows item snapshot, subtotal/discount/due, cash/change, VN time, sample cashier, no sale ID, `CHƯA LƯU • CHƯA THU TIỀN`, internal **non-tax** notice. Print CSS keeps watermark visible even when background colors suppressed. No access to MAIN persisted read-model, no new runtime/preload/IPC handler.
- `apps/desktop/tests/receipt-db.test.ts`: 8 temp-file SQLite tests (close/reopen, immutable historic prices, wrong store, missing/tampered payment/outbox, cash/discount arithmetic and >JS-safe VND, local PENDING/NEEDS_REVIEW/SYNCED ACK gate). `apps/desktop/tests/receipt-boundary.test.mjs`: static regression for no persisted sale/receipt IPC and watermark printed. CI Linux + Windows now runs read-model + boundary tests along with preexisting POS-019/SQLite regressions and pure domain test.
- `docs/POS-020_RECEIPT_ACCEPTANCE.md` owner Windows CLI and visual print acceptance guide. No DB migration, new external package, actual sale/Neon mutation, real receipt/tax invoicing, or bypass of D-013. Existing 9-table SQLite v1 unchanged.
- Initial GitHub CI at code `9ff9964` PASS (Linux, Windows, PostgreSQL), before adding the stronger SYNCED ACK gate and boundary. **Verify final HEAD** rather than claiming these new tests passed prematurely.

## Next actions

1. Verify latest PR #38 SHA + **Foundation CI** Linux/Windows+API/Postgres and Docs CI fully green; fix any test issues. Document final run and only then hand owner Windows steps.
2. Windows PowerShell: frozen pnpm, `pnpm --filter @smartpos/domain typecheck`, `pnpm --filter @smartpos/domain test`, `pnpm --filter @smartpos/desktop typecheck`, `test:receipt-db`, `test:receipt-boundary`, existing `test:local-db`, `test:catalog-cache`, `test:offline-sale`, `test:offline-sale:wire`, `security:check`, `build`, `pnpm run check`; Electron `dev` demo print/screen checks.
3. Owner confirms sample watermark appears in OS print preview (with Background graphics off) and no paid result; approves PR manually. Only then merge and close Issue #37.
4. Next backlog POS-021 server-side idempotent sync push API, POS-022 retry and POS-023 pull; D-013 signed staff/device auth is a production blocker. Receipt for actual customer paid sale must remain disabled pending D-013.
