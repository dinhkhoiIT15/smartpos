# Repository Intake — lần đầu kết nối GitHub

> Chỉ điền khi được cấp quyền đọc repository. Không giả định từ link repository rằng có quyền chỉnh sửa.

## Nhận diện nguồn
- Repository URL: `NOT PROVIDED`
- Visibility: `NOT VERIFIED`
- Default branch: `NOT VERIFIED`
- HEAD SHA: `NOT VERIFIED`
- Working tree status: `NOT VERIFIED`
- GitHub integration permissions: `NOT VERIFIED`
- GitHub Issues/Projects status: `NOT VERIFIED`
- CI latest run URL: `NOT VERIFIED`

## Các bước xác minh
1. Kiểm tra URL/nhánh mặc định, quyền và branch ruleset trước khi tạo PR.
2. `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git log -3 --oneline` nếu có clone.
3. So sánh file hiện có với gói SmartPOS v1.1; không ghi đè dữ liệu hoặc file đã chỉnh sửa mà không review.
4. Chạy `node scripts/validate-context.mjs` sau khi chép file vào repo; đọc `node scripts/context-report.mjs`.
5. Tạo issue, PR hoặc commit **chỉ** khi có quyền tương ứng và yêu cầu rõ ràng.
6. Sau khi merge, ghi commit SHA/URL CI vào DEVELOPMENT_STATUS và session handoff; nếu chưa merge, ghi `PROPOSED`.

## Quy tắc nguồn sự thật
- Git commit xác nhận code đã nằm trong Git; PR xác nhận thay đổi được đề xuất/duyệt; CI xác nhận các checks đã chạy.
- Những nguồn này không tự xác nhận doanh nghiệp đã sẵn sàng sử dụng sản phẩm.
