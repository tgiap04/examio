# Phase 05 — Tài liệu hiện hành + gỡ phần mobile

## Context Links
- [plan.md](plan.md) · [clarifications.md](clarifications.md)

## Overview
Ưu tiên trung bình. Script đã đổi chữ. Phase này gỡ mọi chỗ nhắc tới app mobile trong tài liệu hiện hành, rồi viết mục changelog đổi tên.

## Key Insights
- Thư mục mobile không còn trong repo, nhưng tài liệu hiện hành vẫn nhắc tới: `CLAUDE.md` (5 chỗ: cấu trúc 3 workspace, quy tắc "sửa cả iosApp và androidApp" ở hai nơi, Note cuối file), `AGENTS.md` (2), `ARCHITECTURE.md` (11), `README.md` (1), `docs/system/overview.md` (1), `docs/system/business-rules.md` (1).
- Tài liệu lịch sử (plans, journals) **không** gỡ mobile, chỉ đổi tên (phase 06).
- `docs/generated/*` và `kmaedu-fe/src/types/permissions.generated.ts` là file sinh: chạy lại generator để biết chắc không lệch so với code.

## Requirements
- `CLAUDE.md`, `AGENTS.md`: repo còn 2 workspace (`kmaedu-be/`, `kmaedu-fe/`). Bỏ quy tắc mobile. Thêm quy ước label `proto:breaking`. Tên thương hiệu KMAEdu, tên miền `kmaedu.fayedark.com`.
- `ARCHITECTURE.md`, `README.md`, `docs/system/*`, `docs/index.md`, `docs/development-roadmap.md`: bỏ client mobile khỏi sơ đồ và mô tả.
- `docs/project-changelog.md`: thêm mục ngày 2026-11-11 "Đổi thương hiệu Examio → KMAEdu" liệt kê các thay đổi phá vỡ (thư mục, `@kmaedu/*`, proto `kmaedu.*`, `kmaedu.events`, JWT iss/aud, DB, image, tên miền, khóa locale). Đây là chỗ duy nhất ngoài thư mục plan còn chữ cũ. Các mục changelog cũ đã được script đổi tên.

## Related Code Files
- Sửa tay: `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `README.md`, `docs/system/overview.md`, `docs/system/business-rules.md`, `docs/project-changelog.md`, các file khác trong `docs/` mà `git grep -iE "mobile|kotlin|iosApp|androidApp|kmaedu-app"` tìm ra (trừ `docs/journals`, `docs/.review-archive`)
- Sinh lại: `docs/generated/permissions-matrix.md`, block trong `docs/system/permissions.md`, `kmaedu-fe/src/types/permissions.generated.ts` (`yarn gen:permissions-doc`, `yarn gen:fe-permissions`)

## Implementation Steps
1. `git grep -niE "mobile|kotlin|iosApp|androidApp|kmaedu-app|com\.kmaedu\.app"` trên tài liệu hiện hành, sửa từng chỗ.
2. Viết mục changelog.
3. Chạy hai generator; `git diff` của file sinh chỉ được đổi chữ (hoặc rỗng).

## Todo
- [x] Gỡ mobile khỏi tài liệu hiện hành
- [x] Quy ước `proto:breaking` trong CLAUDE.md/AGENTS.md
- [x] Mục changelog đổi tên
- [x] Sinh lại docs và permissions

## Success Criteria
- Lệnh grep ở bước 1 rỗng trên tài liệu hiện hành.
- Job `fe-permissions-drift` và `permissions-doc-drift` xanh.

## Risk Assessment
Gỡ nhầm đoạn có chữ "mobile" nhưng nói về giao diện web responsive. Đọc từng chỗ, không xóa hàng loạt.

## Security Considerations
Không có.

## Next Steps
Phase 06.
