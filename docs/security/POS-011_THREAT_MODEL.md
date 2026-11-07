# POS-011 — Threat model: nhân viên, phiên offline và một thiết bị POS

**Trạng thái:** D-010 **ACCEPTED** (chính sách vận hành được chủ dự án duyệt ngày 2026-11-07); các kiểm soát kỹ thuật chưa triển khai, R-005 vẫn HIGH OPEN.
**Nguồn:** [ADR-0004](../ADR-0004-offline-auth-device-provisioning.md), [Issue #20](https://github.com/dinhkhoiIT15/smartpos/issues/20), R-004/R-005, PRD FR-01/07, BR-005/006
**Giới hạn:** Tài liệu và test tham chiếu; **không có hệ thống login, cấp grant, ký số, kiểm chứng khóa hay bán hàng thật** tại thời điểm này.

## Tài sản và ranh giới tin cậy

| Thành phần | Có thể tin | Không được tin mặc định |
|---|---|---|
| Fastify API | Kết quả kiểm tra mật khẩu, membership đang active, role/store, DB state, chữ ký do server phát | Role/store/permission do request gửi lên; đồng hồ, `device_id` hoặc trạng thái bán hàng do client tự khai |
| Neon `users/store_memberships/devices` | Trạng thái online sau transaction; index một thiết bị offline còn hiệu lực | Không có khả năng thu hồi tức thì grant đã phát cho máy đang mất mạng |
| Electron main | Mã app được ký/được triển khai tin cậy; được phép truy cập SQLite và OS key store | Tệp SQLite, cấu hình, đồng hồ hệ thống, OS bị xâm nhập hoặc image máy bị clone |
| Electron preload/renderer | Chỉ được yêu cầu qua whitelist IPC, dữ liệu có validation | Mọi input từ React, DevTools hoặc IPC không xác thực sender; không được nhận mật khẩu/tokens/private keys |
| SQLite offline | Bảo tồn dữ liệu sale/outbox đã commit | Không phải hệ thống cấp quyền; không chứa `DATABASE_URL`, password hash hay copyable bearer token |
| Người quản lý vận hành | Quyết định cấp/chuyển/revoke thiết bị sau tái xác thực online | Không thể chứng minh máy cũ đã dừng khi máy đó mất mạng và grant chưa hết hạn |

## Mô hình đe dọa và kiểm soát

| ID | Tình huống | Mức | Kiểm soát đề xuất / kết quả mong đợi | Rủi ro còn lại |
|---|---|---|---|---|
| T-01 | Cashier tự sửa `role=MANAGER` trong renderer | Cao | API lấy role từ membership tại DB, mỗi request được kiểm tra và audit; từ chối sửa giá/tồn | API triển khai sai RBAC |
| T-02 | Một máy phụ clone `device_id` / copy SQLite rồi bán offline | Rất cao | Chỉ cấp grant có chữ ký, bound store/device/public-key proof; key không xuất được; mismatch phải online reprovision | OS/admin compromise có thể clone key/image |
| T-03 | Hai máy cùng được cấp offline | Rất cao | Unique partial index trên Neon **và** quy trình chuyển máy phải chờ old grant hết hạn hoặc xác nhận máy cũ đã dừng | Không thể đảm bảo máy mất mạng nhận revoke tức thì |
| T-04 | Admin/manager thu hồi nhân viên đang offline | Cao | Revocation có hiệu lực online ngay; cache chỉ chạy đến `min(grant expiry, shift expiry)`, không cho gia hạn offline; sync báo `NEEDS_REVIEW` khi cần | Bán trong khoảng chưa thể biết thu hồi |
| T-05 | Người dùng đổi đồng hồ máy về quá khứ | Cao | Phát hiện `now < lastObserved`, grant future-issued, anti-rollback state mất và fail-closed | Admin OS có thể rollback cả snapshot clock state |
| T-06 | Đổi đồng hồ đi tương lai, vượt expiry | Trung bình | Hết hạn luôn fail-closed; không có grace | Có thể ngừng bán tạm thời, cần online xác minh |
| T-07 | Nhân viên đã logout hoặc chuyển ca offline | Cao | Session và grant gắn user; logout hủy grant runtime; không cho khởi tạo session mới offline theo phương án đề xuất | Nghiệp vụ cần quyết định với chủ cửa hàng |
| T-08 | Replay một grant hết hạn / bị copy | Cao | Signature/issuer/audience/nonce/expiry/key version/session id kiểm chứng; key proof; offline chỉ dùng một grant còn hiệu lực và đã provision | Key bị chiếm quyền sau khi mở máy |
| T-09 | Khôi phục SQLite từ backup cũ trên máy khác | Cao | Không tin device metadata khi OS private key không khớp; yêu cầu online reprovision; giữ sale/outbox cũ để đối soát | Cần test restore và device lineage ở POS-029 |
| T-10 | Rò token/password/hash qua renderer/log | Cao | Mật khẩu xử lý server-side, Argon2id hash; Electron main dùng OS keystore, whitelist IPC; logs sanitize | Memory dump trên OS bị xâm nhập |
| T-11 | Mất mạng trước login ca hoặc grant hết hạn | Trung bình | Mặc định từ chối tạo đơn mới; không xóa/đổi đơn đã commit; hướng dẫn phục hồi kết nối | Gián đoạn vận hành; cần owner quyết định SLA |
| T-12 | Mất mạng giữa khi thanh toán tiền mặt và sync | Cao | POS-019 SQLite atomic commit + outbox; khi grant hết hạn sau commit vẫn giữ chứng cứ, POS-021 đối soát server | Tiền đã thu nhưng cần quản lý review |
| T-13 | API cấp quyền lại dựa trên số điện thoại hoặc `device_id` thuần | Cao | Yêu cầu admin online + chứng minh sở hữu key thiết bị; không dùng device ID làm secret | Quy trình hỗ trợ quản lý quá yếu |
| T-14 | Brute-force mật khẩu hoặc mật khẩu rò rỉ | Cao | Server rate limit, hash mạnh có salt (Argon2id), cảnh báo, session revoke/re-auth sau sự kiện nhạy cảm | Phụ thuộc triển khai/giám sát API |
| T-15 | Cashier sửa `lastObservedTime` trong SQLite | Cao | State chống rollback phải bảo vệ/tamper-evident bằng OS key storage/hardware nếu khả dụng; không tin SQLite tự thân | Máy có quyền admin/root vẫn rủi ro; không giả tuyên bố chống gian lận tuyệt đối |

## Kiểm soát khi cấp/chuyển máy offline

1. API chỉ cho một `devices.offline_checkout_enabled=true AND revoked_at IS NULL` tại một store (đã có index PostgreSQL POS-012).
2. Khi muốn đổi máy, ADMIN đăng nhập online lại; hệ thống ghi audit `DEVICE_TRANSFER_REQUESTED`. Nếu máy cũ có kết nối, nó xác nhận xóa grant và ngừng checkout.
3. **ĐÃ DUYỆT:** Nếu máy cũ mất mạng, **không cho phép kích hoạt máy thứ hai khi grant cũ còn hạn**; chỉ khi máy cũ đã xác nhận dừng một cách có thể kiểm chứng hoặc mọi grant cũ hết hạn. **Chưa duyệt bất kỳ ngoại lệ khẩn cấp cho phép chồng lấn hai máy**; sửa `revoked_at` trên server không đủ để dừng máy offline.
4. Thu hồi thiết bị phải chặn cấp grant mới, ngừng checkout khi máy kết nối, nhưng không xóa các sale/outbox đã thu tiền trước đó.
5. Quá trình pair lại cùng `device_id` phải đổi revision/key fingerprint; không chấp nhận restore SQLite đơn thuần làm chứng thực máy.
6. **ĐÃ DUYỆT:** thời hạn grant không vượt quá **4 giờ từ khi máy chủ cấp**, hết hạn không grace và không gia hạn khi offline; dừng đơn mới nhưng giữ nguyên sale/outbox đã thu trước đó.

## Chính sách đã duyệt D-010 và chi tiết triển khai chưa chốt

| Quyết định D-010 | Phương án thận trọng để chủ dự án duyệt | Ảnh hưởng nếu từ chối |
|---|---|---|
| Thời hạn grant offline | **ĐÃ DUYỆT: tối đa 4 giờ** kể từ thời điểm server cấp; nếu ca hết trước thì chặn sớm hơn, không gia hạn khi offline | Mất mạng quá hạn dừng đơn mới; cần online để gia hạn |
| Gia hạn khi offline | **ĐÃ DUYỆT: Không gia hạn, không grace**; dừng tạo đơn mới khi hết hạn, giữ nguyên sale/outbox đã lưu | Mạng mất dài thì phải chờ kết nối để tiếp tục bán |
| Đổi cashier khi offline | **ĐÃ DUYỆT: Không**; đăng nhập bắt đầu ca/chuyển cashier phải online | Không thể tự chuyển ca khi mất mạng |
| Máy mất / chuyển máy | **ĐÃ DUYỆT: Chỉ khi xác minh máy cũ đã dừng hoặc mọi grant cũ hết hạn**; **chưa duyệt ngoại lệ khẩn cấp cho phép chồng lấn quyền** | Có thể chờ tối đa 4 giờ kể từ grant gần nhất; cần cách chứng minh máy cũ dừng |
| Inactivity/khóa màn hình | **CHƯA CHỐT:** thời lượng khóa khi không thao tác, unlock/re-auth và xử lý giờ ca ngắn hơn 4 giờ | Phải quyết định trước khi tích hợp đăng nhập thật |
| OS key store/clock protection | **CHƯA CHỐT:** API/kho khóa trên Windows/macOS, key non-exportability, anti-rollback và restore | Không thể coi chính sách đã duyệt là triển khai bảo mật hoàn chỉnh |
| Backup encryption / restore | Phải phê duyệt POS-027/POS-029 trước khi có dữ liệu bán thật | SQLite plaintext copy có thể lộ dữ liệu |

## Test chấp nhận / negative cases

Automated policy-reference tests map to the proposed behavior, run in CI using only synthetic facts. They cover: valid single device cashier grant, expired at boundary, future-issued grant, wrong store/device, invalid signature/key proof, unauthorized second device, known user/device revoke, cashier switch, wrong operation, oversized/invalid duration, lost anti-rollback state, clock rollback, and server-side role restrictions.

**Không nên nhầm các bài test logic này với kiểm thử cryptography thật.** D-010 đã duyệt *chính sách*; trước khi mở bán thực tế phải có signature/key/OS-keystore thật, kiểm thử tampering, key rotation, revocation concurrency, Windows/macOS E2E và phê duyệt những chi tiết bảo mật còn mở. Test app hiện tại vẫn là **DEMO ONLY**.

## Hướng dẫn xử lý khi có sự cố

- Grant hết hạn/không xác thực được: dừng giao dịch mới, không xóa sale/outbox cũ, hiển thị yêu cầu kết nối quản lý để gia hạn.
- Máy bị mất: đánh dấu revoked trên API và audit, không hứa thu hồi tức thì với thiết bị offline; theo dõi các event gửi lại từ máy cũ.
- Đồng bộ event từ session/grant hết hạn: không tự xóa; quarantine + đối soát người quản lý theo [OFFLINE_SYNC_DESIGN](../OFFLINE_SYNC_DESIGN.md).
- Không log session tokens, password/private key hoặc Neon URL trong báo cáo lỗi.

**R-005 giữ OPEN** đến khi có bằng chứng auth end-to-end, quy trình revoke, xử lý cấp lại thiết bị và chủ dự án chấp nhận rủi ro offline.
