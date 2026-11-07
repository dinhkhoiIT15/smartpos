# Risk Register — SmartPOS M0

**Cập nhật:** 2026-11-04 | **Trạng thái:** Kế hoạch, chưa có test thực tế. `OPEN` không có nghĩa đã xảy ra.

| ID | Rủi ro | Mức | Giảm thiểu / xác minh | Cổng |
|---|---|---|---|---|
| R-001 | Mất sale chưa sync khi hỏng ổ đĩa | Cao | Local backup + restore drill; nêu residual risk | M6 POS-029 |
| R-002 | Retry tạo trùng đơn/tiền/kho | Cao | Event ID unique, receipt + PostgreSQL transaction; test ACK lost | M4 POS-021 |
| R-003 | Tồn cloud âm do sửa kho khi offline | Cao | Chính sách một POS, conflict review, audit | M4 POS-024 |
| R-004 | Lộ Neon credential qua renderer/log | Cao | DB chỉ ở API; kiểm IPC/secret scan | M1/M5 |
| R-005 | Người bị thu hồi quyền vẫn bán offline | **Cao — OPEN** | [ADR-0004](../docs/ADR-0004-offline-auth-device-provisioning.md) và [threat model POS-011](../docs/security/POS-011_THREAT_MODEL.md) đề xuất grant có chữ ký gắn với thiết bị và ca nhân viên, hết hạn chặt chẽ, deny khi đã biết revoke/clock rollback, chuyển máy có kiểm soát. **Không thể thu hồi tức thì khi máy mất mạng**; chưa có auth implementation/owner approval nên chưa được giảm mức rủi ro. | M1 POS-011, M3 POS-019, M4 POS-021 |
| R-006 | Sai tiền do số thập phân / overflow | Cao | BIGINT + validator + tests | M1/M3 |
| R-007 | Lược đồ SQLite/Postgres không tương thích | Trung bình | Schema versions + migration tests | M1/M4 |
| R-008 | Tài liệu trạng thái lỗi thời so với HEAD | Trung bình | Commit SHA/CI evidence + read-only context report | M0 POS-006 |
| R-009 | Thiếu quy trình trả hàng / hoàn tiền khi pilot | Cao | Manual SOP + chính sách vận hành được phê duyệt | M6 POS-030 |
| R-010 | Ngân sách cloud vượt dự kiến | Trung bình | Giới hạn môi trường, quan sát usage, báo động quota | M1/M6 |

## Quy trình rà soát
- Mỗi PR tác động đến rủi ro phải liên kết ID và bằng chứng test.
- Mức Cao không được tự đóng chỉ vì có tài liệu; cần kiểm chứng giải pháp.
- Chủ dự án duyệt thay đổi chính sách kinh doanh hoặc chấp nhận residual risk.
