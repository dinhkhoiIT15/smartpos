# Requirements Traceability — PRD v1.0

**Nguồn yêu cầu:** [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md). **Nguồn backlog lúc khởi tạo:** [BACKLOG.csv](../project-management/BACKLOG.csv). GitHub Issues là nguồn status sau khi import. Tất cả mapping bên dưới là **kế hoạch**, chưa là bằng chứng hoàn thành.

| PRD | Nghiệp vụ | Các issue chính | Evidence để Done (dự kiến) |
|---|---|---|---|
| FR-01 | Auth / RBAC | [POS-011 #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), POS-025, POS-027 | [ADR-0004](ADR-0004-offline-auth-device-provisioning.md), [threat model](security/POS-011_THREAT_MODEL.md), design-only [reference tests](security/offline-access-reference.test.mjs). Actual API login, signatures, OS keys and Windows E2E remain **UNIMPLEMENTED** |
| FR-02 | Danh mục, SKU, biến thể | POS-014, POS-017 | Unique SKU + variant CRUD tests |
| FR-03 | Tồn kho | POS-015, POS-013 | Stock transaction, movement tests |
| FR-04 | Giỏ hàng | POS-018 | Calculation/quantity tests |
| FR-05 | Thu tiền mặt | POS-018, POS-019 | Integer currency + atomic checkout tests |
| FR-06 | Phiếu bán hàng nội bộ | POS-020 | Receipt content review, no VAT invoice label |
| FR-07 | Offline checkout | POS-013, POS-019, POS-029 | Restart/crash/local commit tests |
| FR-08 | Đồng bộ | POS-016, POS-021, POS-022, POS-023 | Duplicate/ACK-lost/retry tests |
| FR-09 | Xung đột | POS-024, POS-029 | Stock conflict preserved, reconciliation tests |
| FR-10 | Báo cáo | POS-026 | Local pending vs cloud synced tests |
| FR-11 | Audit | POS-015, POS-025, POS-027 | Audit integrity/access tests |

Khi tạo PR: tham chiếu `FR-ID`, `Issue ID`, commit, tên test và kết quả thực sự. Nếu yêu cầu thay đổi, cập nhật bảng + ADR/Change Request trước khi đổi code.
