# POS-018 — Giỏ hàng và xem trước tiền mặt (M3/P0)

**Trạng thái:** [draft PR #34](https://github.com/dinhkhoiIT15/smartpos/pull/34), [Issue #33](https://github.com/dinhkhoiIT15/smartpos/issues/33). [Foundation CI #42395959688](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42395959688) và [Docs CI #42395959676](https://github.com/dinhkhoiIT15/smartpos/actions/runs/42395959676) **PASS** trên code checkpoint `cb8b3d5` (Domain 12/12 cả Linux/Windows; SQLite 7+6; Electron/API/PostgreSQL). Owner Windows GUI chưa nghiệm thu. CI final SHA cần kiểm tra lại nếu có chỉnh tài liệu. POS-017 đã merge `main` tại `28d38555d358c0fad012702a529fbd0c2bffb5d3`.

## Phạm vi được triển khai

- `packages/domain/src/index.ts`: bổ sung `calculateCartAmounts` dùng lại nguyên tắc BigInt/signed-int64; `calculateCashTotals` vẫn từ chối thiếu tiền.
- `packages/domain/src/cart.ts`: pure in-memory operations `addCartVariant`, `setCartQuantity`, `removeCartVariant`, `previewCashCart`, `formatVnd`. SKU trùng được cộng số lượng, snapshot giá/tên/SKU bất biến trong giỏ; SKU cùng ID nhưng giá thay đổi bị từ chối; giới hạn 100 dòng, số lượng nguyên dương ≤ 2.147.483.647 và không vượt tồn mẫu. VND là chuỗi thập phân canonical đầu-cuối; tính toàn bộ bằng `bigint`, không chuyển tiền sang `Number`.
- `packages/domain/src/cart.test.ts`: test ví dụ BR-002 và giới hạn tiền/số lượng, sản phẩm không hoạt động, không đủ tiền, xóa/sửa, overflow và bảo đảm preview không sinh sale/event.
- `apps/desktop/src/renderer/src/app.tsx` + `styles.css`: tab giỏ hàng demo có tìm SKU/tên, thêm, tăng/giảm hoặc sửa số lượng, xóa, xóa cả giỏ, nhập tiền mặt số nguyên, xem thiếu/thừa và validation. Hiển thị banner DEMO. Không có nút thu tiền hay hoàn tất thanh toán.
- Dùng cùng `@smartpos/domain/cart` workspace dependency; `pnpm-lock.yaml` link workspace, không tải thêm thư viện bên ngoài.
- CI Linux chạy domain test + Electron typecheck/build/security, Windows chạy domain test và desktop typecheck; SQLite v1/17 và PostgreSQL CI cũ giữ nguyên.

## Giới hạn bảo mật

**Không bán hàng thật.** 4 SKU mẫu chỉ nằm trong mã UI, giá/tồn giả lập. Chúng không được ghi vào SQLite userData, không gọi API, không thay đổi PostgreSQL/Neon, không thay đổi tồn kho hay sinh `local_sales`/`local_payments`/`outbox_events`. Các giá trị nhận từ renderer đều có thể bị chỉnh sửa bởi người dùng; không bao giờ được coi là chứng cứ đã thanh toán.

POS-019 phải kết nối giỏ tới **đầu vào được xác thực từ MAIN**, kiểm tra grant/identity phiên/thiết bị, stock, giá/discount revision, rồi commit sale+item+payment+stock+outbox trong **một** SQLite transaction mới được phép đánh dấu đã thu tiền. POS-023 sẽ cung cấp luồng catalog xác thực; POS-018 cố ý không mở IPC nhập dữ liệu SQL mới.

Chỉ thanh toán tiền mặt; không VAT/e-invoice, không IMEI/serial. Không thay đổi business rules khóa.

## Nghiệm thu Windows PowerShell

Từ `C:\Users\dinhk\Desktop\smartpos`:

```powershell
git status --short
git fetch origin
git switch feature/POS-018-cash-cart-preview
git pull --ff-only origin feature/POS-018-cash-cart-preview
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @smartpos/domain typecheck
pnpm --filter @smartpos/domain test
pnpm --filter @smartpos/desktop typecheck
pnpm --filter @smartpos/desktop test:local-db
pnpm --filter @smartpos/desktop test:catalog-cache
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check
pnpm --filter @smartpos/desktop dev
```

**Kỳ vọng:** Node 24.x; pnpm 10.20.0; tất cả test/typecheck/build pass; `node:sqlite` v1 vẫn 9 bảng, không migration mới. Sau khi app chạy:

1. Bấm tab **Giỏ hàng & tiền mặt (demo)** trong sidebar, thấy banner không thể bán hàng.
2. Tìm `PHONE-128` rồi **+ Thêm**. Tìm `CASE-01` rồi **+ Thêm**; tổng phải thu đúng **9.340.000 ₫**.
3. Nhập `9500000` vào *Tiền khách đưa*; xem tiền thừa **160.000 ₫**, chỉ là dự kiến, không hiện **Đã thanh toán/Đồng bộ**.
4. Nhập `9000000`; trạng thái thiếu **340.000 ₫**, tiền thừa = 0. Nhập `9.500.000`, `1.5`, `-1` hoặc `9223372036854775808` phải báo lỗi; không được báo thu tiền thành công.
5. Tăng số lượng `PHONE-128` đến 5; tăng lần nữa bị chặn. Giảm, sửa SL bằng ô nhập, xóa một SKU và xóa giỏ.
6. `CABLE-01` (tồn 0) và `OLD-SKU` (ngừng bán) không thể thêm. Đóng/mở app, dữ liệu giỏ không phục hồi vì chưa là sale/outbox, và không được xuất hiện dữ liệu sản phẩm mẫu trong SQLite.
7. Trở về **Tổng quan phát triển**, bấm **Kiểm tra Electron IPC**, kỳ vọng `DEMO_ONLY • SQLite schema v1`. Không xuất hiện mới trang checkout/lưu đơn hay quyền đọc SQL ở renderer.

Nếu Electron thiếu binary sau frozen install trên Windows, có thể chạy `pnpm --filter @smartpos/desktop rebuild electron`, không tắt sandbox/context isolation.

## Điều kiện để merge

- CI ở **final PR SHA** thành công (GitHub Linux + Windows Node24 + API + PostgreSQL disposable + docs).
- Owner PASS kiểm thử Windows và xác nhận thấy cả phép tính và giới hạn DEMO.
- Review giữ nguyên chính sách BR-002/005, tránh mô tả demo như doanh thu/đã thanh toán, không commit secret/userData.
- Chỉ merge sau khi owner nghiệm thu; tiếp tục POS-019 (local sale transaction + outbox), không tự chuyển thành hoạt động bán hàng thật.

Không chạy `migrate:dev` hoặc `test:catalog:pg` trên Neon trong POS-018.
