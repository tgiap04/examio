---
title: Đổi thương hiệu Examio → KMAEdu (toàn bộ repo, repo GitHub, thư mục máy)
status: in-progress
priority: high
work_type: feature
spec_waived: "Đổi tên thuần, không thêm hành vi mới; quyết định nằm trong clarifications.md"
branch: chore/rebrand-kmaedu (tách từ develop)
created: 2026-11-11
blockedBy: []
blocks: []
---

# Đổi thương hiệu Examio → KMAEdu

Mọi thứ đang được git theo dõi đổi từ `examio` sang `kmaedu` / `KMAEdu`: 1.155 file, 16.416 chỗ, 2 thư mục gốc (`examio-be`, `examio-fe`), file và thư mục con có chữ examio, npm scope `@examio/*`, proto package `examio.*.v1`, exchange `examio.events`, JWT iss/aud, container, network, image, DB, tên miền, chữ hiển thị trên UI, logo. Sau đó đổi repo GitHub và thư mục trên máy. Quyết định đã chốt: [clarifications.md](clarifications.md).

## Bảng đổi tên (áp dụng theo thứ tự, cụ thể trước, chung sau)

| Cũ | Mới |
|---|---|
| `https://api.examio.vn` / `https://api.examio.top` | `https://kmaedu.fayedark.com` |
| `api.examio.vn`, `api.examio.top`, `examio.vn`, `examio.top` | `kmaedu.fayedark.com` (cookie domain `.examio.top` → `.kmaedu.fayedark.com`) |
| `r2.examio.com` | `r2.kmaedu.fayedark.com` |
| `ghcr.io/cychipo/examio-`, `cychipo/examio`, `tgiap04/examio` | `ghcr.io/tgiap04/kmaedu-`, `tgiap04/kmaedu`, `tgiap04/kmaedu` |
| `EXAMIO` / `ExamIO` / `Examio` / `examio` | `KMAEDU` / `KMAEdu` / `KMAEdu` / `kmaedu` |

`examio` và `kmaedu` dài bằng nhau (6 ký tự), nên chuỗi protobuf đã tuần tự hóa không lệch độ dài. Dù vậy stub vẫn được sinh lại.

## Ngoại lệ duy nhất

Thư mục plan này và đúng một mục changelog "đổi tên từ Examio" được giữ chữ cũ, vì chúng ghi lại chính việc đổi tên. Kiểm tra cuối loại trừ đúng 2 đường dẫn này. Lịch sử commit git không viết lại.

## Phases

| # | Phase | Status |
|---|---|---|
| 01 | [Script đổi tên + chạy thử khô](phase-01-rename-script-and-dry-run.md) | done |
| 02 | [Backend: thư mục, @kmaedu, proto, broker, JWT, DB, deploy](phase-02-backend-identifiers.md) | done |
| 03 | [Frontend: thư mục, chữ hiển thị, i18n, logo, favicon](phase-03-frontend-branding.md) | done |
| 04 | [CI và cấu hình gốc](phase-04-ci-and-root-config.md) | done |
| 05 | [Tài liệu hiện hành + gỡ phần mobile](phase-05-current-docs-and-mobile-removal.md) | done |
| 06 | [Tài liệu lịch sử (plans, journals, archive, docx)](phase-06-historical-docs.md) | done |
| 07 | [Kiểm tra toàn bộ + soát sót](phase-07-verification-and-residue-gate.md) | done |
| 08 | [Commit, PR, đổi repo GitHub, đổi thư mục máy](phase-08-ship-repo-and-local-folder.md) | pending |

## Phụ thuộc

- 01 → 02, 03, 04, 05, 06. Script chạy một lần cho cả cây; các phase sau chỉ sửa tay phần script không làm được.
- 02 + 03 + 04 + 05 + 06 → 07 → 08.
- Không chồng lấn plan đang mở nào. Các plan cũ chỉ bị đổi chữ ở phase 06.

## Ảnh hưởng khi chạy (chấp nhận được vì stack mới chưa deploy, cutover reset DB)

- Token cũ mất hiệu lực (JWT iss/aud đổi), người dùng đăng nhập lại.
- Exchange `kmaedu.events`, DB `kmaedu`, network `kmaedu-*`: dev phải `docker compose down -v`.
- Khóa localStorage `kmaedu.locale`: lựa chọn ngôn ngữ trên trình duyệt về mặc định một lần.
- File `.env` bị gitignore **không** bị đụng (có cái trỏ DB remote). Phase 08 liệt kê tên biến để bạn tự sửa.
