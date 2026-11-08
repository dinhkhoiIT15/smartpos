# POS-020 — Phiếu bán hàng nội bộ (M3/P0)

**Trạng thái:** [Issue #37](https://github.com/dinhkhoiIT15/smartpos/issues/37), [draft PR #38](https://github.com/dinhkhoiIT15/smartpos/pull/38), nhánh `feature/POS-020-internal-receipt`. POS-019 [PR #36](https://github.com/dinhkhoiIT15/smartpos/pull/36) đã PASS nghiệm thu Windows và merge trên main tại `ec71c07e45e27b1158811a309da79402786fef5a`. **Owner POS-020 chưa nghiệm thu/merge.**

## Đã triển khai

- `packages/domain/src/receipt.ts`: mô hình hiển thị phiếu, kiểm tra snapshot SKU/tên/thuộc tính, SL, đơn giá, chiết khấu theo dòng, tổng tiền, tiền nhận/thừa bằng **BigInt VND nguyên 64-bit**. Định dạng giờ theo **Asia/Ho_Chi_Minh** từ ISO UTC (không phụ thuộc múi giờ máy người dùng). Phiếu ghi rõ `PENDING_SYNC`, `SYNCED` hoặc `NEEDS_REVIEW` theo *trạng thái local*, không giả vờ có ACK Neon.
- `apps/desktop/src/main/local-db/receipt.ts`: truy vấn **chỉ đọc** `local_sales` + `local_sale_items` + `local_payments(CASH)` + `outbox_events`. Kiểm tra tổng và discount từ snapshot, tiền nhận/thừa, event ID/hash SHA-256 canonical và nội dung outbox khớp hàng/dữ liệu thanh toán; thiếu/sai chứng cứ thì **từ chối dựng phiếu**. Không sử dụng giá/catalog hiện tại để sửa giá lịch sử, không thay đổi sync state.
- `apps/desktop/src/renderer/src/internal-receipt.tsx`, `app.tsx`, `styles.css`: nút **Xem / in phiếu MẪU** cho giỏ hàng demo POS-018. Nút chỉ bật khi có hàng và tiền mẫu nhập hợp lệ, đủ tiền. Modal có danh sách SKU, SL, attributes, giá, chiết khấu, tổng phải thu, tiền khách đưa, tiền thừa dự kiến; thông tin thu ngân MẪU, `KHÔNG CÓ MÃ ĐƠN`, thời gian VN và nhãn **CHƯA LƯU • CHƯA THU TIỀN**.
- Chữ **MẪU — KHÔNG CÓ GIAO DỊCH** lặp lại phía trên/dưới và trong bản in ngay cả khi tắt in nền; `PHIẾU NỘI BỘ — KHÔNG PHẢI HÓA ĐƠN THUẾ`. Nút **In phiếu MẪU** chỉ gọi `window.print()` mở giao diện in hệ điều hành; không tích hợp máy in chuyên dụng (ngoài MVP). Đóng bằng nút hoặc Escape. CSS in mặc định gọn khoảng 90mm, hỗ trợ trang A4, không cam kết tương thích giấy cuộn/máy in nhiệt chưa được kiểm thử.
- Unit `packages/domain/src/receipt.test.ts`: 7 ca, kiểm tra nước rút BR-002, giờ VN qua ngày, tiền cực lớn, chiết khấu, thiếu tiền/sai tổng/VND lỗi, cấm nhãn hóa đơn thuế và watermark demo.
- `apps/desktop/tests/receipt-db.test.ts`: 8 ca với database SQLite file thật, temp OS, reopen/immutability, thay đổi catalog không đổi chứng cứ, sai store/UUID, thiếu payment/outbox, hash hoặc dòng bị chỉnh, sai thanh toán, >2^53 VND và các trạng thái local. Không dùng database `userData`, không động đến Neon.
- Không thay migration SQLite v1 (9 bảng), Fastify/PostgreSQL, chính sách D-010/BR-011/BR-012; không có dependency ngoài mới.

## Phân biệt phiếu mẫu và phiếu từ sale đã commit

**Phần đọc sale đã lưu chỉ tồn tại ở Electron MAIN**, không có IPC mới trong preload hoặc renderer. Đây là bước chuẩn bị cho **kịch bản sau khi D-013 hoàn tất**. Chức năng đăng nhập/ủy quyền staff/device bằng signed grant, khóa OS, ràng buộc phiên cashier và đồng hồ chống rollback chưa triển khai, nên **không được bật đường đọc phiếu thật trong giao diện**. Hàm đọc chỉ nhận UUID không phải lớp xác thực. Tên phiếu trong lớp MAIN là `PERSISTED` và chỉ có ý nghĩa rằng **các hàng SQLite tương ứng và outbox được kiểm tra nhất quán**, không chứng minh auth thực tế hoặc trạng thái thanh toán Neon.

Trong ứng dụng hiện tại, phiếu **DEMO** đến từ giỏ mẫu POS-018 **chưa hề lưu thành sale**. Thậm chí khi nhập đủ tiền, UI không gọi API, không ghi sale/outbox/inventory, không xác nhận đã thu tiền và không tạo mã đơn thật. Bản in mẫu không được dùng bán hàng hay giao khách như chứng từ đã thanh toán.

## Nghiệm thu Windows PowerShell

Từ `C:\Users\dinhk\Desktop\smartpos`, trong terminal PowerShell:

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
pnpm --filter @smartpos/desktop security:check
pnpm --filter @smartpos/desktop build
pnpm run check

pnpm --filter @smartpos/desktop dev
```

**Mong đợi:** Node 24.x, pnpm 10.20.0; `test:local-db` **7/7**, `test:catalog-cache` **6/6**, `test:offline-sale` **16/16**, `test:offline-sale:wire` **1/1**, `test:receipt-db` **8/8**; domain tests gồm 7 test phiếu mới (cộng các test cũ), toàn bộ typecheck, build, security và `pnpm run check` PASS. GitHub CI Linux/Windows + disposable PostgreSQL 16 + docs cần green tại commit PR cuối. Nếu khác phải ghi lại kết quả thật.

### Kiểm thử giao diện & in

1. Mở app Electron, vào **Giỏ hàng & tiền mặt (demo)**, thấy banner **DEMO — CHƯA THỂ BÁN HÀNG**; đây là dữ liệu giả lập, không phải giá/tồn từ SQLite.
2. Nhập `PHONE-128` → **+ Thêm**, `CASE-01` → **+ Thêm**; tổng phải thu **9.340.000 ₫**. Chưa nhập tiền → nút **Xem / in phiếu MẪU** phải **bị vô hiệu hóa**.
3. Nhập `9000000` → thiếu **340.000 ₫**, không thể mở phiếu mẫu. Nhập `9.500.000` hoặc số vượt 64-bit → báo lỗi, không mở phiếu.
4. Nhập `9500000` → tiền thừa dự kiến **160.000 ₫**. Bấm **Xem / in phiếu MẪU**, kiểm tra có **MẪU — KHÔNG CÓ GIAO DỊCH** trên/dưới, danh sách hai SKU và thông số, tổng 9.340.000 ₫, tiền khách đưa 9.500.000 ₫, thừa 160.000 ₫; thu ngân MẪU, **KHÔNG CÓ MÃ ĐƠN**, **CHƯA LƯU • CHƯA THU TIỀN**, thời gian Việt Nam, và **KHÔNG PHẢI HÓA ĐƠN THUẾ**. Không được thấy bất kỳ dòng khẳng định đã thu tiền, đã đồng bộ lên Neon hay hóa đơn VAT chính thức.
5. Bấm **In phiếu MẪU** → cửa sổ in Windows/preview mở. **Chỉ xem trước rồi Cancel**, kiểm tra chữ MẪU hiển thị trên trang in kể cả khi *Background graphics* tắt; không in ra để sử dụng bán hàng.
6. Đóng bằng nút **Đóng (Esc)** hoặc Esc; đổi số lượng, tiền nhận, xóa giỏ → chỉ còn phép tính/phiếu mẫu tương ứng. Đóng/mở ứng dụng, giỏ/phiếu mẫu không tồn tại lại.
7. Trở về Tổng quan → **Kiểm tra Electron IPC** vẫn báo `DEMO_ONLY • SQLite schema v1`; không có nút hoàn tất thanh toán thật hoặc khả năng đọc phiếu sale thật từ renderer.

### Điểm trọng yếu trong test SQLite

- Test thật ghi synthetic sale vào **OS-temp SQLite** bằng POS-019 đã merge; sau đó đọc bằng POS-020, đóng/mở DB và so sánh; số tiền luôn là *decimal string*, không chuyển sang JS float.
- Khi thay giá/tên/active của catalog sau khi bán, giá và tên trong phiếu vẫn giữ snapshot lúc commit.
- Xóa payment/outbox trong database thử nghiệm, cố tình làm sai hash hoặc dòng hàng sau khi tắt trigger **chỉ trong temp test**, kết quả **từ chối dựng phiếu**.
- Các bài kiểm tra tắt trigger/SQLite CHECK chỉ chạy với database tạm tạo trong test, không phải database Electron userData hoặc Neon.

## Điều kiện merge / việc chưa làm

- [ ] CI cuối cùng cả Linux, Windows, docs và disposable PostgreSQL SUCCESS; không tự động merge.
- [ ] Chủ dự án PASS kiểm thử lệnh và giao diện Windows, bao gồm bản xem trước in không thể thiếu watermark.
- [ ] Review bảo mật: read-model persisted không được xuất qua IPC, không có dữ liệu người dùng thật; bản mẫu không nhận thanh toán.
- [ ] Chỉ khi chủ dự án PASS & merge mới đóng Issue #37. D-013 xác thực offline thật, POS-021 idempotent sync, POS-022 worker, POS-023 pull và POS-027/029 backup là những phạm vi khác.

**Không chạy migration hoặc kiểm thử trực tiếp trên Neon/Production.**
