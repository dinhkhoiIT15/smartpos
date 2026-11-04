# Test Plan — v1.0

## Test layers
- Unit: money calculator (VND bigint), price snapshots, cart validation, inventory invariants.
- Integration SQLite: single transaction sale/items/payment/stock/outbox, rollback, reopen, WAL and backup/restore.
- Integration PostgreSQL: uniqueness, FK/check, transaction rollback, concurrent stock update, idempotent replay.
- Contract API: Zod schema, auth/role, version, errors, auth-expired/device-revoked.
- E2E Desktop: Electron checkout online/offline, reconnect, status, display internal receipt.
- Security: renderer isolation, IPC whitelist, no DB secrets in client build, least privilege.

| ID | Test | Pass criteria |
|---|---|---|
| T-001 | Cash totals / change | Tiền nguyên VND, không sai số, reject underpayment |
| T-002 | Checkout atomicity | Lỗi giữa transaction không để lại bản ghi dở dang |
| T-003 | Offline restart | Sale/outbox còn nguyên sau restart |
| T-004 | Lost ACK | Retry chỉ tạo 1 sale/payment/movement server |
| T-005 | Duplicate payload hash mismatch | Reject/quarantine, không mutate sale |
| T-006 | Stale catalog price | Giữ snapshot giá; có audit/conflict |
| T-007 | Stock change concurrent | Không lost update; conflict đối soát |
| T-008 | Device revoked / auth expired | Pending được bảo tồn, không tự mất data |
| T-009 | Money bounds | Không float, reject negative/overflow và value invalid |
| T-010 | RBAC | Cashier không điều chỉnh kho/giá |
| T-011 | Backup/restore local | Khôi phục dữ liệu có kiểm chứng |
| T-012 | CI | typecheck + lint + unit/integration + build pass khi được cấu hình |

**M0:** chỉ có `node scripts/validate-context.mjs` kiểm tra cấu trúc tài liệu. Nó **không** thay thế các test ở trên.
