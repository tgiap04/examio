# Phase 08 — Commit, PR, đổi repo GitHub, đổi thư mục máy

## Context Links
- [plan.md](plan.md) · [clarifications.md](clarifications.md)

## Overview
Ưu tiên cao, gồm các thao tác ra bên ngoài. **Mỗi bước commit, push, PR, đổi repo đều hỏi bạn trước** (CLAUDE.md: không commit/push khi chưa được phép).

## Implementation Steps

### A. Commit và PR (sau khi bạn cho phép)
Tách commit theo nhóm để dễ review. Tác giả là bạn, có trailer Claude:
1. `chore!: rename examio to kmaedu across the repository` (kết quả script: đổi đường dẫn và chữ)
2. `feat(fe)!: rebrand ui to KMAEdu` (logo, wordmark, favicon, soát i18n)
3. `ops(ci): skip buf breaking for prs labelled proto:breaking`
4. `docs: drop the mobile app and document the KMAEdu rebrand`
5. `chore(plans): add rebrand plan and reports`

Rồi:
- `gh label create proto:breaking`;
- push nhánh;
- mở PR vào `develop`, **gắn label `proto:breaking` ngay trong lệnh tạo PR**;
- chờ CI xanh 22/22.

### B. Đổi repo GitHub (sau khi PR merge, hỏi trước)
1. `gh repo rename kmaedu --repo tgiap04/examio`. GitHub tự chuyển hướng URL cũ; branch protection, label và PR giữ nguyên.
2. `git remote set-url origin git@github.com:tgiap04/kmaedu.git`.
3. Image `ghcr.io/tgiap04/kmaedu-*` chưa từng được đẩy; sẽ được tạo khi làm lại CD. Không có gì phải chuyển.
4. Release `develop → main` làm khi bạn yêu cầu.

### C. File `.env` bị gitignore (bạn tự sửa, Claude không đọc)
Tên biến cần xem lại trong `kmaedu-be/.env`, `kmaedu-be/apps/*/.env`, `kmaedu-be/deploy/.env`, `kmaedu-be/deploy/env/*.env`:
- `JWT_ISSUER`, `JWT_AUDIENCE`: đặt `kmaedu-auth` / `kmaedu`, hoặc giữ giá trị cũ nhưng mọi service phải dùng cùng một giá trị;
- `FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, `ADMIN_EMAILS`;
- `DATABASE_URL` / `*_DATABASE_URL`: **giữ tên DB remote hiện tại** nếu đang trỏ DB dev dùng chung;
- Google OAuth console: thêm redirect `https://kmaedu.fayedark.com/api/v1/auth/google/callback`.

Dev Docker local: `docker compose down -v` một lần (DB, exchange và network đổi tên).

### C2. Hạ tầng ngoài repo (bạn làm trên Cloudflare / mail)
- **R2:** giữ hạ tầng cũ, không tạo mới (quyết định 2026-11-11). Mặc định trong code trả về bucket `examio` và host công khai `https://examio-r2.fayedark.com`; content, document và r2-service dùng chung một mặc định. `R2_PUBLIC_URL` vẫn phải giống nhau ở r2, content, document, auth và vocabulary, nếu không việc xóa ảnh sẽ âm thầm bỏ qua.
- **Email:** template mail ghi địa chỉ hỗ trợ `support@kmaedu.fayedark.com`. Cần tạo hộp thư này hoặc chuyển tiếp nó.
- **OAuth app redirect:** ví dụ chỉ còn `kmaedu://`; thêm host thật nếu sau này có client native.

### D. Đổi thư mục máy (bước cuối, bạn chạy sau khi thoát phiên Claude Code)
```bash
cd /Users/tgiap.dev/devs && mv examio kmaedu
# trí nhớ Claude Code theo đường dẫn
cp -R ~/.claude/projects/-Users-tgiap-dev-devs-examio ~/.claude/projects/-Users-tgiap-dev-devs-kmaedu
# venv Python có đường dẫn tuyệt đối → tạo lại
cd /Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/ai-service && rm -rf venv && python3.12 -m venv venv && ./venv/bin/pip install -r requirements.txt
```
Ở phiên mới trong `/Users/tgiap.dev/devs/kmaedu`, Claude cập nhật nội dung các file trí nhớ:
- đổi `examio` thành `kmaedu`;
- xóa các mục về mobile app: `examio-app-*`, `examio-exam-room-feature`;
- sửa `examio-branch-flow` theo tên repo mới.

Giữ thư mục trí nhớ cũ cho tới khi phiên mới chạy ổn rồi mới xóa.

## Todo
- [x] 5 commit (e685f54..1c0d4c8, thêm fix ce278b8)
- [x] Label + PR có label + CI xanh (PR #14, merge 54edea3)
- [x] Đổi repo + remote (`tgiap04/kmaedu`, remote SSH mới)
- [x] Danh sách `.env` gửi bạn (mục C, C2)
- [x] Đổi thư mục máy + trí nhớ + venv (2026-11-11: xóa 6 trí nhớ mobile, đổi tên 7 file `examio-*` → `kmaedu-*`, tạo lại venv ai-service)

## Success Criteria
- PR merge với CI xanh.
- `git remote -v` trỏ `tgiap04/kmaedu`.
- Phiên mới trong `/Users/tgiap.dev/devs/kmaedu` đọc được trí nhớ.

## Risk Assessment
- Đổi repo làm webhook hay tích hợp bên ngoài trỏ URL cũ: GitHub chuyển hướng git và web; không có CD nên ít rủi ro.
- Nếu sau này tạo repo mới tên `examio`, chuyển hướng sẽ mất. Đừng tạo lại repo trùng tên cũ.

## Security Considerations
Soát diff tìm secret trước commit. Không đẩy `.env`.

## Next Steps
Chạy `/tkm:capture-lessons`.
