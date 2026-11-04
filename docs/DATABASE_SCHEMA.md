# Database Schema — Logical Model v1.0

**Status:** LOCKED LOGICAL BASELINE. Chưa có migration thực thi. SQL types dưới đây là hợp đồng thiết kế, không xác nhận đã tạo trên Neon.

## 1. Nguyên tắc
- PostgreSQL trên Neon là nguồn dữ liệu trung tâm cho giao dịch **đã sync**; SQLite local bảo tồn giao dịch **chưa sync**.
- Khóa chính UUID (client-generated UUID cho sale/event). FK, CHECK, UNIQUE, index ở migration.
- VND dùng `bigint` / SQLite INTEGER; không dùng floating point. Thời gian PostgreSQL `timestamptz`, SQLite lưu Unix milliseconds/ISO UTC nhất quán.
- SKU và tên đã bán phải có snapshot; không cascade-delete lịch sử sale/payments.
- Một kho logic mặc định / store trong MVP. `store_id` vẫn hiện diện để mở rộng một cách có kiểm soát.

## 2. Server tables (Neon PostgreSQL)

| Table | Cột chính (kiểu gợi ý) | Ràng buộc quan trọng |
|---|---|---|
| `stores` | `id uuid`, `name text`, `timezone text`, `created_at timestamptz` | PK(id); timezone default Asia/Ho_Chi_Minh |
| `users` | `id uuid`, `email text`, `password_hash text`, `active bool` | unique(email); không sync hash xuống desktop |
| `store_memberships` | `store_id uuid`, `user_id uuid`, `role text`, `active bool` | PK(store_id,user_id); role enum app |
| `devices` | `id uuid`, `store_id uuid`, `name text`, `offline_checkout_enabled bool`, `revoked_at timestamptz` | store FK; ràng buộc chỉ 1 thiết bị được cấp offline tại một thời điểm bằng partial unique index |
| `categories` | `id uuid`, `store_id uuid`, `name text` | FK store |
| `brands` | `id uuid`, `store_id uuid`, `name text` | FK store |
| `products` | `id uuid`, `store_id uuid`, `category_id uuid`, `brand_id uuid`, `name text`, `active bool` | FK; soft deactivate |
| `product_variants` | `id uuid`, `store_id uuid`, `product_id uuid`, `sku text`, `attributes jsonb`, `attributes_key text`, `price_vnd bigint`, `revision bigint`, `active bool` | UNIQUE(store_id,sku), UNIQUE(product_id,attributes_key), CHECK(price_vnd>=0) |
| `inventory_balances` | `store_id uuid`, `variant_id uuid`, `qty bigint`, `revision bigint` | PK(store_id,variant_id); qty có thể âm *chỉ* khi reconcile ngoại lệ theo policy |
| `inventory_movements` | `id uuid`, `store_id uuid`, `variant_id uuid`, `sale_id uuid?`, `qty_delta bigint`, `kind text`, `created_at timestamptz` | index(variant_id,created_at); unique business source để tránh ghi lặp |
| `sales` | `id uuid`, `store_id uuid`, `device_id uuid`, `cashier_id uuid`, `client_created_at timestamptz`, `server_received_at timestamptz`, `total_vnd bigint`, `status text` | FK, CHECK(total_vnd>=0), unique(id); sale immutable sau posted |
| `sale_items` | `id uuid`, `sale_id uuid`, `variant_id uuid`, `sku_snapshot text`, `name_snapshot text`, `attributes_snapshot jsonb`, `quantity int`, `unit_price_vnd bigint`, `discount_vnd bigint`, `line_total_vnd bigint` | FK sale, CHECK(quantity>0), CHECK(amount>=0), UNIQUE(sale_id,id) |
| `payments` | `id uuid`, `sale_id uuid`, `method text`, `due_vnd bigint`, `tendered_vnd bigint`, `change_vnd bigint` | method=CASH trong MVP; CHECK(tendered>=due); unique(sale_id) ở MVP |
| `sync_receipts` | `event_id uuid`, `device_id uuid`, `sale_id uuid`, `payload_hash text`, `result_code text`, `ack_json jsonb`, `received_at timestamptz` | UNIQUE(device_id,event_id), UNIQUE(sale_id) cho create-sale event; hash mismatch = reject |
| `sync_conflicts` | `id uuid`, `event_id uuid`, `sale_id uuid`, `kind text`, `details jsonb`, `status text`, `created_at timestamptz`, `resolved_at timestamptz?` | FK, index(status, created_at), không xóa khi chưa review |
| `audit_logs` | `id uuid`, `store_id uuid`, `actor_id uuid?`, `device_id uuid?`, `action text`, `entity_type text`, `entity_id uuid`, `metadata jsonb`, `created_at timestamptz` | index(store_id,created_at), không log credentials |
| `catalog_change_log` | `seq bigint identity`, `store_id uuid`, `entity_type text`, `entity_id uuid`, `op text`, `payload jsonb`, `created_at timestamptz` | PK(seq), index(store_id,seq); dùng sync pull cursor |

**Quan trọng:** `sale_items.line_total_vnd` phải được tính lại server-side từ giá snapshot và chiết khấu có ràng buộc; không tin tổng tiền do client tự khai. Giá offline đã được snapshot trước đó; thay đổi giá xảy ra sau offline có thể tạo audit conflict thay vì sửa lại đơn.

## 3. Local SQLite tables
| Table | Mục đích |
|---|---|
| `local_products`, `local_variants` | Cache catalog + revision/price snapshot |
| `local_inventory_balances` | Tồn cục bộ đã điều chỉnh bởi sale pending + revision cloud gần nhất |
| `local_sales`, `local_sale_items`, `local_payments` | Sale immutable tại máy, trạng thái sync |
| `outbox_events` | `event_id`, `event_type`, `schema_version`, `payload_json`, `payload_hash`, `status`, `retry_count`, `next_attempt_at`, `created_at`, `last_error` |
| `sync_state` | Server pull cursor, thời gian sync gần nhất; schema version |
| `local_audit_logs` | Người dùng, thiết bị, hành động cục bộ và timestamp |
| `device_profile` | Định danh thiết bị và chính sách offline được provision; không cất server DB secret |

## 4. DB transaction boundaries
**SQLite checkout transaction:** kiểm tra tồn local → tạo sale/items/payment → trừ local tồn → ghi outbox event → commit. Nếu bất kỳ bước nào lỗi, rollback toàn bộ.

**PostgreSQL push transaction:** kiểm tra device/user/authorization + schema; reserve unique idempotency; tạo sale/items/payment; tạo inventory movement và cập nhật balance (lock row); tạo conflict nếu cần; ghi receipt/ack → commit. Nếu lỗi, rollback; retry an toàn.

## 5. DDL & migration plan
- POS-012: Tạo Drizzle schema + migration cho tables P0. Review FK/index/check và transaction thực tế.
- POS-013: Tạo SQLite schema + local migrations. Test crash/restart và integrity.
- Không chạy migration production từ AI nếu thiếu approval; dùng forward-fix/backfill có kiểm soát.

## 6. Mở rộng sau MVP
Serial/IMEI cần bảng `inventory_units` gắn mỗi thiết bị vật lý, quy tắc trạng thái và nhập/bán cụ thể. Không ép dữ liệu serial vào `product_variants` vì mỗi variant chứa nhiều đơn vị hàng.
