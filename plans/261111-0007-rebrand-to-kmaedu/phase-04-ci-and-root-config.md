# Phase 04 — CI và cấu hình gốc

## Context Links
- [plan.md](plan.md) · [phase-02](phase-02-backend-identifiers.md)

## Overview
Ưu tiên cao. CI sau khi đổi tên phải xanh ngay trên PR đổi tên.

## Key Insights
- `ci.yml` dùng `examio-be`/`examio-fe` ở `working-directory`, `cache-dependency-path`, `paths`, `subdir=examio-be/proto` và DB `examio_ci`. Script đổi được hết các chỗ này.
- Bước `buf breaking` so với commit base. Base vẫn có `examio-be/proto` và package `examio.*`, nên mọi file sẽ bị báo xóa. Đây là lần đổi có chủ đích.
- Label phải gắn **trước khi** mở PR, nếu không CI chạy lúc PR vừa mở sẽ không thấy label (bài học từ PR #13). Lỡ quên thì đóng rồi mở lại PR.

## Requirements
- Bước `buf breaking` chỉ chạy khi PR không có label `proto:breaking`: `breaking: ${{ github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'proto:breaking') }}`.
- Tạo label `proto:breaking` trên GitHub (mô tả: "Cố ý phá contract proto, bỏ qua buf breaking").
- `breaking_against` dùng `subdir=kmaedu-be/proto` (đúng cho mọi PR sau này).

## Related Code Files
- Sửa: `.github/workflows/ci.yml` (script + bước buf bằng tay)
- Soát (script đã sửa): `.vscode/settings.json`, `.repomixignore`, `.codegraph`, `.gitignore`, `release-manifest.json`, `architecture-overview.mmd`, `ui-design.html`, `DESIGN.md`, `grammay-plan-study.md`

## Implementation Steps
1. Sửa bước buf như trên.
2. `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'` để kiểm tra cú pháp.
3. `git grep -n "examio" -- .github .vscode .gitignore .repomixignore .codegraph` phải rỗng.
4. `gh label create proto:breaking ...` (việc ngoài repo, làm lúc mở PR ở phase 08).

## Todo
- [x] Bước buf có điều kiện theo label
- [x] YAML hợp lệ
- [x] Cấu hình gốc sạch chữ cũ

## Success Criteria
CI của PR đổi tên xanh 22/22 job (`buf` lint vẫn chạy, chỉ bỏ breaking).

## Risk Assessment
Label `proto:breaking` bị lạm dụng về sau: ghi vào CLAUDE.md (phase 05) rằng label chỉ dùng cho thay đổi contract có chủ đích, giống `migration:contract`.

## Security Considerations
Không đổi quyền workflow.

## Next Steps
Phase 05 ghi quy ước label vào tài liệu.
