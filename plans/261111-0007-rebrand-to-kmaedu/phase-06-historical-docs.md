# Phase 06 — Tài liệu lịch sử (plans, journals, archive, docx)

## Context Links
- [plan.md](plan.md)

## Overview
Ưu tiên thấp. Script đã đổi chữ và đổi tên file/thư mục trong `plans/`, `docs/journals`, `docs/.review-archive`, `plans/reports`. Phase này lo bộ docx nhị phân và soát kết quả.

## Key Insights
- `docx/examio-full-spec-bundle.docx` là file nhị phân (zip), script bỏ qua. Bản `.md` cùng tên đã được script đổi. Sinh lại `.docx` từ `.md` bằng `pandoc` (đã có trên máy) với tên mới `kmaedu-full-spec-bundle.docx`, rồi xóa file cũ.
- `docx/manifest.json` ghi đường dẫn và mô tả: script đã đổi.
- Bằng chứng JSON trong `plans/261017-1547-.../evidence/*.json` có đường dẫn máy `-Users-tgiap-dev-devs-examio`. Script đổi thành `...-kmaedu`, khớp với thư mục máy mới ở phase 08.
- File `.pkl` trong `kmaedu-be/apps/ai-service/src/storage/graph_cache/` là cache nhị phân. Nếu có chữ cũ thì xử lý ở phase 07 (cache được sinh lại, có thể xóa khỏi git).

## Requirements
- `git ls-files | grep -i examio` chỉ còn đường dẫn trong thư mục plan này.
- `.docx` mới mở được và có chữ KMAEdu.

## Related Code Files
- Tạo: `docx/kmaedu-full-spec-bundle.docx` (sinh từ `.md`)
- Xóa: `docx/examio-full-spec-bundle.docx`
- Soát (script): `plans/**`, `docs/journals/**`, `docs/.review-archive/**`, `docx/*.md`, `docx/manifest.json`

## Implementation Steps
1. `pandoc docx/kmaedu-full-spec-bundle.md -o docx/kmaedu-full-spec-bundle.docx`, rồi `git rm docx/examio-full-spec-bundle.docx`.
2. `unzip -p docx/kmaedu-full-spec-bundle.docx word/document.xml | grep -ci examio` phải bằng 0.
3. Đọc lướt vài plan và journal đã đổi, xem có câu nào vô nghĩa không (ví dụ "kmaedu-app" trong plan mobile cũ là chấp nhận được).

## Todo
- [x] Sinh lại docx, xóa bản cũ
- [x] Soát mẫu plans/journals

## Success Criteria
Không còn đường dẫn hay nội dung chữ cũ ngoài phần ngoại lệ.

## Risk Assessment
Định dạng `.docx` sinh lại khác bản gốc (bản gốc có thể đã được chỉnh tay). Chấp nhận, vì nội dung đến từ `.md` nguồn.

## Security Considerations
Không có.

## Next Steps
Phase 07.
