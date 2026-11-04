# Backlog Import Guide

`BACKLOG.csv` có 30 issue đề xuất: M0 (6), M1 (7), M2 (4), M3 (3), M4 (4), M5 (3), M6 (3). Mã POS-XXX ở CSV là mã logic; GitHub issue number là giá trị riêng sau khi tạo.

## Cách nhập vào GitHub
1. Kết nối repo GitHub; kiểm tra quyền và URL.
2. Tạo labels `foundation,docs,management,ci,governance,ai-context,desktop,api,database,domain,security,catalog,inventory,sync,checkout,offline,reporting,release,reliability` và `P0`, `P1` (hoặc dùng label `priority:P0`...).
3. Mở `BACKLOG.csv` và tạo từng issue với ID trong **title**, acceptance criteria trong body, dependencies liên kết tới issue tương ứng.
4. Tạo GitHub Project với các trạng thái Backlog, Ready, In Progress, Review, Done.
5. Ghi các issue URL vào TODO/STATUS sau khi xác minh; đừng đổi ID logic khi GitHub issue number khác.

**Không** giả định file CSV tự động tạo issue. Có thể dùng coding agent có quyền tương ứng hoặc tạo thủ công.
