# Phase 02 — Lược đồ 0002, trích thực thể/quan hệ, GraphIndex worker

## Context Links
- [plan.md](plan.md) · Alembic: `kmaedu-be/apps/ai-service/alembic/versions/0001_init.py`
- Trigger hiện tại: `src/backend/messaging/document_handlers.py:72-91` (`_process` → `asyncio.create_task(_extract_entities)`)
- Code trích cũ: `src/backend/services/entity_extraction_service.py` (prompt, parse, model gán cứng)

## Overview
- Priority: high · Status: pending · **Vùng an toàn: migration + xóa dữ liệu**
- Thêm bảng GraphRAG (migration mở rộng, không đụng bảng cũ). Viết bước trích thực thể và quan hệ theo chunk. Thay kiểu bắn rồi quên bằng hàng đợi trong DB do worker nhận việc, có lease và retry.

## Key Insights
- Cột vector không khai báo số chiều (giống `Document.embeddings`), nên không tạo được index HNSW. Mỗi tài liệu chỉ có vài trăm thực thể và mọi truy vấn đều lọc `userStorageId` trước, nên quét tuần tự vẫn đủ nhanh.
- Đã có mẫu poller kiểu `r2_delete_tasks` (claim `FOR UPDATE SKIP LOCKED`) ở phía Node. Làm tương tự trong ai worker, không thêm event mới, nên contract giữ nguyên.
- Bài học 2026-11-14: model reasoning tiêu hết token cho phần suy luận, JSON bị cắt. Vì vậy phải dùng model không reasoning, đặt `max_tokens`, và kiểm tra `finish_reason`.

## Requirements
- Functional:
  - Migration `0002_graphrag` tạo 5 bảng trong schema `ai`:
    - `GraphIndex(userStorageId PK, status PENDING|BUILDING|READY|FAILED, attempts int, leaseUntil ts, nextAttemptAt ts, error text, chunkSignature text, stats jsonb, builtAt, createdAt, updatedAt)` + index `(status, nextAttemptAt)`
    - `GraphEntity(id PK, userStorageId, name, normName, type, description, descriptionCount int, embedding extensions.vector NULL, degree int, rank float, createdAt)` + unique `(userStorageId, type, normName)`, index `(userStorageId)`
    - `GraphRelationship(id PK, userStorageId, sourceId, targetId, description, weight float)` + index `(userStorageId)`, `(sourceId)`, `(targetId)`. Không đặt FK tới `Document`; xóa theo `userStorageId`.
    - `GraphTextUnitEntity(userStorageId, chunkId, entityId, PK(chunkId, entityId))` + index `(entityId)`, `(userStorageId)`
    - `GraphCommunity(id PK, userStorageId, level smallint, communityKey int, parentId NULL, entityIds jsonb, size int, title, summary, findings jsonb, rating float, embedding extensions.vector NULL, createdAt)` + index `(userStorageId, level)`
    - `downgrade()` drop đúng 5 bảng này.
  - `src/graphrag/extraction.py`:
    - prompt tiếng Việt và Anh, trả `{entities:[{name,type,description}], relationships:[{source,target,description,strength 1-10}]}`;
    - `type ∈ {concept, definition, formula, process, example, person_or_org, other}`;
    - tối đa 10 thực thể và 15 quan hệ mỗi chunk;
    - parse chặt: bỏ quan hệ trỏ tới tên không có trong entities, bỏ quan hệ tự vòng, cắt độ dài chuỗi.
  - Hàng đợi:
    - `_process` (sau khi lưu chunk) upsert `GraphIndex` = PENDING, ghi `chunkSignature`. Xóa `_extract_entities` và `create_task`.
    - Worker poller `src/graphrag/index_worker.py` (chạy khi `ROLE` có `worker`) claim 1 dòng: PENDING, hoặc FAILED có `attempts<3` và `nextAttemptAt<=now()`, hoặc BUILDING đã hết `leaseUntil`. Đổi sang BUILDING, `leaseUntil=now()+15m`.
  - Pipeline P2 chạy trích xong và ghi entity/relationship/text-unit thô (chưa gộp, chưa cộng đồng). Bước cuối tạm thời đặt READY. P3 chèn thêm bước vào trước READY.
  - Ngưỡng: số chunk trích thành công / tổng ≥ 0.7 thì READY, ngược lại FAILED với `nextAttemptAt` backoff 1m, 5m, 30m.
  - Dựng lại: xóa dữ liệu graph cũ của `userStorageId` rồi ghi mới trong **một transaction** (không để chỉ mục nửa cũ nửa mới).
  - `on_document_deleted`: thêm DELETE cho 5 bảng mới (giữ DELETE bảng cũ tới P7).
- Non-functional:
  - Concurrency trích qua env `GRAPHRAG_CONCURRENCY` (mặc định 5), model qua `GRAPHRAG_LLM_MODEL`, `GRAPHRAG_MAX_TOKENS` (mặc định 2048).
  - Log `[GRAPHRAG_TIMING] stage=extract user_storage_id=… chunks=… ok=… failed=… elapsed_ms=…`.
  - Mỗi file < 200 dòng.

## Architecture
```
document.uploaded → _process (OCR+embed) → upsert GraphIndex PENDING → outbox ai.document.processed (không đổi)
ai-worker: index_worker loop (poll 5s, jitter) → claim → indexer.build(storage_id)
   indexer: load chunks (ocr_service.get_document_chunks) → extraction (semaphore) → store.replace_graph(tx) → status
```
Module: `src/graphrag/{__init__,types,extraction,store,indexer,index_worker}.py`.
- `store.py` chứa mọi SQL asyncpg, dùng pool chung `src.db`.
- `types.py` chứa dataclass `ExtractedEntity`, `ExtractedRelationship`, `ChunkExtraction`.

## Related Code Files
- Tạo: `alembic/versions/0002_graphrag.py`, các file `src/graphrag/*` ở trên, test `src/backend/tests/graphrag/test_extraction_parse.py`, `test_index_store.py`, `test_index_worker.py`
- Sửa: `src/backend/messaging/document_handlers.py` (trigger + DELETE), chỗ khởi động worker theo `ROLE` (`src/main.py` hoặc module worker, xác minh lúc làm), `src/backend/tests/conftest.py` (`TABLES` thêm bảng mới), `test_alembic.py` (`EXPECTED`, version `0002`, index mới), `tests/messaging/test_handlers.py` (delete xóa cả bảng mới)
- Đọc: `src/llm/model_manager.py` (`generate_content_with_model`, cách truyền max_tokens, log `[AI_OUTPUT]`)

## Implementation Steps
1. Viết test migration trước (bảng, index, downgrade, upgrade idempotent), rồi viết `0002_graphrag.py` theo kiểu `STATEMENTS` của 0001.
2. Viết test parse trước, gồm: JSON hợp lệ; JSON bị cắt (trả lỗi, không trả nửa danh sách); thiếu trường; quan hệ trỏ tên lạ; quá giới hạn; bọc trong markdown fence. Rồi viết `extraction.py`.
3. Nếu `model_manager` chưa cho truyền `max_tokens` và lấy `finish_reason`, thêm tham số tùy chọn (mặc định giữ hành vi cũ) và test nó.
4. Viết `store.py`: `upsert_pending`, `claim_next` (SKIP LOCKED + lease), `mark_ready/failed`, `replace_graph(tx, entities, relationships, links)`, `delete_for(storage_ids)`.
5. Viết `indexer.py` và `index_worker.py`. Worker dừng sạch khi nhận SIGTERM (hủy task, giải phóng lease bằng cách đặt lại PENDING).
6. Sửa `document_handlers.py`: bỏ `_background`/`_extract_entities`, gọi `upsert_pending`, thêm DELETE.
7. Chạy pytest nhóm ai-service (tích hợp với `AI_TEST_DATABASE_URL`), rồi upload thử 1 PDF local, xem log và đếm dòng.

## Todo List
- [x] Migration 0002 + test_alembic
- [x] extraction.py + test parse
- [x] max_tokens / finish_reason trong model_manager (nếu thiếu)
- [x] store.py + test tích hợp (claim song song 2 worker chỉ 1 nhận; lease hết hạn bị nhận lại; replace_graph atomic)
- [x] indexer.py + index_worker.py + test ngưỡng 70%
- [x] document_handlers: trigger + DELETE + test
- [x] Thử thật 1 PDF

## Success Criteria
- Upload 1 PDF → `GraphIndex` đi PENDING → BUILDING → READY trong < 3 phút, `GraphEntity` > 0, `GraphRelationship` > 0.
- Xóa tài liệu → 0 dòng ở cả 5 bảng.
- Cho LLM lỗi (fake) 40% chunk → FAILED, `attempts=1`, có `nextAttemptAt`.
- Toàn bộ test ai-service đang pass vẫn pass (ngoại lệ đã biết: `test_benchmark_runner_smoke_humaneval`).

## Risk Assessment
- Hai worker dựng cùng một tài liệu → SKIP LOCKED + lease. Ghi trong một transaction nên dù chạy trùng vẫn không hỏng dữ liệu.
- Tài liệu được upload lại khi đang BUILDING → `upsert_pending` đổi `chunkSignature`. Indexer so signature trước khi ghi; nếu khác thì bỏ kết quả và để PENDING.
- Router trả lỗi 401/429 hàng loạt → cả chỉ mục FAILED, retry backoff. Sau 3 lần thì dừng, log rõ.

## Security Considerations
- Nội dung tài liệu là dữ liệu không tin cậy (có thể chứa prompt injection). Đầu ra LLM chỉ được parse thành JSON có giới hạn độ dài, không bao giờ thực thi. Mọi SQL đều tham số hóa và lọc `userStorageId`.
- Không thêm quyền DB mới: `ai_svc` sở hữu schema `ai`.

## Next Steps
- P3 thêm gộp thực thể, embedding, cộng đồng và báo cáo vào `indexer.build` trước bước READY.
