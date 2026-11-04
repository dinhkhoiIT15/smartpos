# API Contract Draft — v1.0

**Status:** PROPOSED (not implemented). Endpoint/version có thể cập nhật qua ADR trước khi triển khai; không dùng tài liệu này như bằng chứng API đang hoạt động.

## HTTP conventions
- Base path `/v1` qua HTTPS; errors thống nhất `{code,message,request_id,details?}`.
- Bearer/session auth + device binding đối với sync; idempotency event IDs.
- Body input validated qua Zod; UUID/ISO UTC; tiền integer VND.

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/v1/health` | Health probe (không tiết lộ credentials) |
| `POST` | `/v1/auth/login` | Online sign-in/provision flow (chi tiết TBD) |
| `GET` | `/v1/catalog/variants` | Trang danh mục/SKU online |
| `POST` | `/v1/catalog/variants` | Tạo SKU (manager/admin) |
| `GET` | `/v1/inventory` | Lấy tồn kho đã sync |
| `POST` | `/v1/inventory/adjustments` | Điều chỉnh có lý do và audit |
| `GET` | `/v1/sales` | Danh sách đơn server đã ghi |
| `POST` | `/v1/sync/push` | Nhận sự kiện offline có idempotency |
| `GET` | `/v1/sync/pull?cursor=N&limit=M` | Catalog và số dư thay đổi theo cursor |
| `GET` | `/v1/sync/conflicts` | Danh sách ngoại lệ đối soát |

## Push request (minh họa)
```json
{
  "schema_version": 1,
  "device_id": "<uuid>",
  "events": [{
    "event_id": "<uuid>",
    "type": "SALE_COMPLETED",
    "sale_id": "<uuid>",
    "client_created_at": "2026-11-04T08:00:00.000Z",
    "payload_hash": "<sha256>",
    "payload": {"items": [], "payment": {"method": "CASH"}}
  }]
}
```

Phản hồi từng event có `result: SYNCED|CONFLICT|REJECTED`, `event_id`, `sale_id`, `conflict_ids?`. Lỗi network không phải đã thất bại tại server; retry phải an toàn. Phiên bản API và lỗi cụ thể chốt ở POS-016.
