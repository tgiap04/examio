# Phase 07 — Migration thu hẹp: drop bảng cũ

## Context Links
- [plan.md](plan.md) · `alembic/versions/0001_init.py` (DDL bảng cũ)
- Quy tắc repo: migration phải tương thích ngược; phần phá hủy làm ở PR sau, gắn label `migration:contract` (CLAUDE.md, mục Deploy)

## Overview
- Priority: low · Status: pending · **Vùng an toàn: migration + xóa dữ liệu**
- PR riêng drop `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup` sau khi bản GraphRAG đã chạy ổn trên môi trường thật.

## Key Insights
- Sau P6 không còn code đọc hay ghi các bảng này, chỉ còn câu DELETE trong `document_handlers` và fixture test.
- `scripts/lint-migrations.sh` chặn SQL phá hủy với Prisma. Phải xác minh nó có quét Alembic không. Dù có hay không vẫn gắn label `migration:contract`.

## Requirements
- Functional:
  - `alembic/versions/0003_drop_legacy_graph.py`:
    - `upgrade` drop `UserStorageGraphGroup`, `UserStorageGraph`, `DocumentEntity` (dùng `IF EXISTS`);
    - `downgrade` tạo lại đúng DDL của 0001 (bảng rỗng).
  - Gỡ `DELETE_ENTITIES_SQL`, `DELETE_GRAPH_SQL` khỏi `document_handlers.py`.
  - Cập nhật `tests/conftest.py` `TABLES`, `test_alembic.py` (`EXPECTED`, version `0003`, FK list giờ rỗng hoặc chỉ còn FK mới nếu có), `tests/messaging/test_handlers.py`.
  - CLAUDE.md: bỏ các bảng cũ khỏi bảng dữ liệu và ví dụ domain của ai.
- Điều kiện trước khi merge: production đã chạy bản P6 ≥ 1 tuần; `SELECT status, count(*) FROM ai."GraphIndex" GROUP BY 1` cho READY ≥ 95% tài liệu còn hoạt động.

## Architecture
Không có kiến trúc mới.

## Related Code Files
- Tạo: `alembic/versions/0003_drop_legacy_graph.py`
- Sửa: `src/backend/messaging/document_handlers.py`, `src/backend/tests/conftest.py`, `test_alembic.py`, `tests/messaging/test_handlers.py`, `/CLAUDE.md`

## Implementation Steps
1. Sửa test_alembic trước (bảng mong đợi, version, upgrade → downgrade → upgrade).
2. Viết migration 0003.
3. Gỡ câu DELETE cũ và cập nhật test handler.
4. Chạy pytest ai-service (tích hợp) và kiểm tra `lint-migrations.sh`.
5. Mở PR vào develop, gắn label `migration:contract`, ghi điều kiện trước khi merge vào mô tả PR.

## Todo List
- [x] test_alembic cập nhật
- [x] 0003 migration
- [x] Gỡ DELETE cũ + test
- [ ] PR + label (chưa mở PR; khi mở nhớ gắn `migration:contract`)

## Success Criteria
- `alembic upgrade head` trên DB có dữ liệu cũ chạy thành công. Downgrade về 0002 tạo lại bảng rỗng.
- Xóa tài liệu vẫn xóa sạch các bảng Graph*.

## Risk Assessment
- Mất dữ liệu bảng cũ là có chủ đích; GraphRAG không dùng tới. Muốn quay lại hybrid thì phải revert cả P6 và dựng lại, nên làm P7 muộn.

## Security Considerations
- Không có thay đổi quyền.

## Next Steps
- Đóng plan: đặt `status: completed` trong plan.md, cập nhật roadmap nếu repo có.
