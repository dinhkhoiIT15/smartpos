# M0 — Checklist trước khi bắt đầu coding

**Phạm vi:** Đây là danh sách kiểm tra cho repository **thực tế**, không phải cho bản ZIP. Không tự đánh dấu `x` vì file có mặt trong gói tải về.

## Yêu cầu và ngữ cảnh
- [ ] PRD v1.0, business rules và ADR được đưa lên GitHub bằng commit/PR có SHA kiểm chứng.
- [ ] `AGENTS.md`, `CONTRIBUTING.md`, tài liệu security và session handoff được chủ dự án đọc/duyệt.
- [ ] Lựa chọn license/public/private được ghi lại (không tạo LICENSE giả định).

## Kho mã nguồn
- [ ] Kiểm tra repo URL, nhánh chính, quyền truy cập bằng kết quả thật.
- [ ] `package.json`, `pnpm-workspace.yaml`, `.node-version`, `.editorconfig`, `.gitattributes`, `.gitignore` có mặt ở repo.
- [ ] POS-001 khởi tạo gói workspace thực tế, lockfile được commit và lệnh `pnpm` được xác minh trên máy.
- [ ] Secret/SQLite data thật không nằm trong Git history.

## GitHub và CI
- [ ] Tạo/import issues POS-001 đến POS-030 và ghi mapping URL.
- [ ] Tạo Project board; có trạng thái task được thống nhất.
- [ ] Chạy CI M0 và lưu URL workflow run + SHA; không gọi đây là app tests.
- [ ] Review branch protection/ruleset khả dụng theo quyền và gói GitHub.

## Handoff
- [ ] Đối chiếu HEAD thật với `DEVELOPMENT_STATUS.md`.
- [ ] Thử phiên ChatGPT mới: tìm chính xác issue hiện hành, test evidence và blockers.
- [ ] Sau khi verified, cập nhật `SESSION_HANDOFF.md` và ghi task kế tiếp.

**Exit:** M0 chỉ DONE sau khi các tiêu chí trên được xác minh trong repository. Gói này là tài liệu để bắt đầu, không phải bằng chứng M0 hoàn thành.
