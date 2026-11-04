# ADR-0002 — Offline Sale and Sync Contract

- Date: 2026-11-04
- Status: ACCEPTED (baseline)
- Decision: SQLite sale + payment + stock delta + outbox cùng transaction; backend idempotent, transaction trên PostgreSQL, giữ sale tiền mặt khi conflict; 1 offline cashier device at a time.
- Rationale: Không thể đảm bảo mạng exactly-once; receipt + unique IDs bảo đảm xử lý lặp không tạo đơn trùng. Dữ liệu tiền đã nhận cần giữ để đối soát.
- Consequences: conflict stock có thể âm tạm thời và cần quản lý xử lý; phải kiểm thử crash/ACK lost/revocation.
- Rejected: Lưu sale chỉ sau network ACK; xóa sale khi server reject; silent last-write-wins.
