# Session Handoff — SmartPOS

## 2026-11-08 — POS-020 internal receipt preview

**Verified GitHub `main`:** `ec71c07e45e27b1158811a309da79402786fef5a`, POS-019 [PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36) **owner Windows PASS, merged**. Issue #35 closed. Previous POS-018 #34 and POS-017 #32 owner accepted. Development status `verified_commit` means merged `main`, not the POS-020 branch.

**Current [Issue #37](https://github.com/dinhkhoiIT15/smartpos/issues/37), [Draft PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38)** from branch `feature/POS-020-internal-receipt` → `main`. **NOT MERGED**, owner Windows human acceptance pending.

## POS-020 implemented

- New shared pure `@smartpos/domain/receipt` export `packages/domain/src/receipt.ts`: strict signed-64-bit VND decimal string/BigInt, item snapshots, line discounts, cash due/tender/change, deterministic VN timezone, local sync labels. `createDemoInternalReceipt` cannot generate real ID/paid state and always includes DEMO watermark + non-tax notice. `buildPersistedInternalReceipt` is for future MAIN-verified evidence only; pure function itself grants no authorization. `receipt.test.ts` 7 cases including BR-002 and invalid money/time.
- New MAIN-only `apps/desktop/src/main/local-db/receipt.ts`: read committed sale/items/CASH payment/outbox in read-only SQL; validates row totals, immutable SKU/name/attrs, canonical POS-016 event SHA256 and matching outbox IDs/snapshots. Does not use mutable latest catalog, does not update any financial state. `SYNCED` status now needs matching saved ACKED response, still labeled local.
- New `apps/desktop/src/renderer/src/internal-receipt.tsx` with accessible modal/focus/Escape, print via `window.print()`, receipt item list/VND/change and big **MẪU — KHÔNG CÓ GIAO DỊCH**, no real tax invoice. `app.tsx` opens it only from *synthetic, sufficient cash preview*; no main DB/receipt IPC or real SALE_COMPLETED. `styles.css` @media print preserves visible DEMO watermark in plain black when backgrounds are off. No sale ID or cashier identity is invented for real people.
- New `apps/desktop/tests/receipt-db.test.ts` 8 file-backed SQLite tests (including missing/tampered outbox/payment and ACK status gate); `receipt-boundary.test.mjs` 2 static security/print tests. Desktop package scripts `test:receipt-db`, `test:receipt-boundary` executed in GitHub CI on Linux and Windows; domain test auto-picks `receipt.test.ts`.
- [POS-020 Windows acceptance](../docs/POS-020_RECEIPT_ACCEPTANCE.md), README and traceability updated; no SQLite migration or external dependency/Neon write.

## CI evidence, outstanding

- [Foundation CI #42432529844](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42432529844) was SUCCESS for early code checkpoint `9ff9964`: Linux domain tests and saved receipt 8/8, existing Electron/API/PG; subsequent Windows coverage for receipt-db was added to CI. Final ACK gate and IPC/print boundary test were added **after** this checkpoint.
- Need check latest PR #38 HEAD CI and record final [Foundation/Docs] run URLs with all Linux+Windows tests green. Do not say owner local tests PASS without owner confirmation.

## Owner Windows commands

```powershell
git status --short
git fetch origin
git switch feature/POS-020-internal-receipt
git pull --ff-only origin feature/POS-020-internal-receipt
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop test:offline-sale
pnpm --filter @smartpos/desktop test:offline-sale:wire
pnpm --filter @smartpos/desktop test:receipt-db
pnpm --filter @smartpos/desktop test:receipt-boundary
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
pnpm --filter @smartpos/desktop dev
```

Expected baseline SQLite 7/7, cache 6/6, offline sale 16/16, wire 1/1, receipt-db 8/8, receipt-boundary 2/2 and domain 7 new receipt tests + old domain tests. With demo PHONE-128 8.990.000 + CASE-01 350.000, tender `9500000`: receipt sample due 9.340.000 / change 160.000, NEVER no-watermark/no-tax label. With insufficient `9000000`, the preview button remains disabled. On **Windows print preview**, watermark must appear even with *Background graphics* disabled. Confirm `DEMO_ONLY • SQLite schema v1`, no actual checkout or real receipt IPC. Cancel print dialog; no data persisted.

## Critical boundary / next

D-013 real signed staff/device grant + cashier session/OS key/shift/clock/revocation still unimplemented, do not wire persisted `loadCommittedLocalReceipt` or `commitLocalCashSale` into untrusted renderer. D-010 4h is **policy**, not a validated grant. No real customer receipt or VAT invoice. After owner Windows PASS and manual PR merge, close Issue #37 and proceed POS-021 idempotent server sync API (still requires real auth to expose). No production/Neon writes.
