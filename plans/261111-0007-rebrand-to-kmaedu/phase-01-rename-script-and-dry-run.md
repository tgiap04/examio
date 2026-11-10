# Phase 01 — Script đổi tên + chạy thử khô

## Context Links
- [plan.md](plan.md) · [clarifications.md](clarifications.md)

## Overview
Ưu tiên cao, chặn mọi phase khác. Viết một script Python lặp lại được, làm cả hai việc: đổi tên đường dẫn và thay nội dung. Mọi thay đổi cơ học đi qua script này, không sửa tay hàng nghìn chỗ.

## Key Insights
- 1.155 file chứa chữ cũ. Phần lớn chỉ cần thay chữ máy móc; phần cần tay là logo, wordmark và gỡ mobile.
- Các biến thể hoa thường: `examio` 16.081, `Examio` 322, `ExamIO` 6, `EXAMIO` 7.
- Không file migration Prisma hay Alembic nào chứa chữ cũ, nên checksum migration không đổi.
- File nhị phân đang được theo dõi: `docx/*.docx`, logo PNG, favicon, `.pkl` trong `apps/ai-service/src/storage/graph_cache`. Script bỏ qua file nhị phân và liệt kê ra; phase 03/06 xử lý riêng.

## Requirements
- Script: `plans/261111-0007-rebrand-to-kmaedu/scripts/rebrand.py`, chỉ dùng thư viện chuẩn Python 3.
- Chỉ đụng file do `git ls-files -z` trả về. Không bao giờ đọc hay ghi file bị gitignore (`.env`, `deploy/env/*.env`, `node_modules`, `venv`).
- Bỏ qua thư mục plan này và file `docs/project-changelog.md` (mục đổi tên được viết tay ở phase 05).
- `--dry-run` (mặc định): in số chỗ thay theo từng quy tắc, danh sách đường dẫn sẽ đổi, danh sách file nhị phân còn chữ cũ. `--apply`: thực hiện.

## Architecture
1. **Thay nội dung** theo bảng trong plan.md, đúng thứ tự (tên miền, image, repo trước; sau đó 4 biến thể hoa thường). Mỗi quy tắc là một `re.sub` có đếm. File nhị phân (có byte NUL) bị bỏ qua.
2. **Đổi đường dẫn**: mọi đường dẫn có thành phần chứa `examio` (mọi kiểu hoa thường) được đổi bằng `git mv`. Đổi thư mục từ sâu tới nông, rồi mới tới hai thư mục gốc `examio-be` → `kmaedu-be`, `examio-fe` → `kmaedu-fe`, để `git mv` không đụng đường dẫn đã đổi.
3. Chạy lại `--apply` lần hai phải ra 0 thay đổi.

## Related Code Files
- Tạo: `plans/261111-0007-rebrand-to-kmaedu/scripts/rebrand.py`
- Sửa: không (script chỉ chạy ở phase 02–06)

## Implementation Steps
1. Tạo nhánh `chore/rebrand-kmaedu` từ `develop` mới nhất.
2. Viết script, kèm vài test nhỏ (`scripts/test_rebrand.py`, chạy bằng `python3 -m unittest`) cho thứ tự quy tắc. Ví dụ: `api.examio.top` → `kmaedu.fayedark.com`, không ra `api.kmaedu.top`; `ExamioApp` → `KMAEduApp`; `@examio/common` → `@kmaedu/common`; `examio_dot_ai` → `kmaedu_dot_ai`.
3. Chạy `--dry-run`, lưu kết quả vào `reports/dry-run.txt`. Đối chiếu số liệu với khảo sát (khoảng 16.4k chỗ). Có quy tắc ra 0 hoặc số bất thường thì sửa script trước.
4. Chưa `--apply` ở phase này.

## Todo
- [x] Nhánh `chore/rebrand-kmaedu`
- [x] `rebrand.py` + test thứ tự quy tắc xanh
- [x] `reports/dry-run.txt`

## Success Criteria
- Dry-run liệt kê đủ cả 4 biến thể, quy tắc tên miền và đường dẫn.
- Test thứ tự quy tắc xanh.

## Risk Assessment
- Thay nhầm một từ khác có chứa "examio". Khảo sát không thấy từ nào như vậy; dry-run in mẫu từng quy tắc để soát bằng mắt.
- Chạy nhầm lên file gitignore chứa secret. Script chỉ nhận danh sách từ `git ls-files`.

## Security Considerations
Không in nội dung file ra log, chỉ in đường dẫn và số lượng.

## Next Steps
Phase 02–06 chạy `--apply` một lần ở đầu phase 02, rồi mỗi phase xử lý phần tay của mình.
