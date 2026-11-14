# Phase 06 — Gỡ hybrid và module cũ, cập nhật docs, đo lại

## Context Links
- [plan.md](plan.md) · [phase-01](phase-01-eval-harness-baseline.md) (bộ đo)
- `kmaedu-be/deploy/compose/ai.yml`, `deploy/README.md`, `deploy/.env.example`, `apps/ai-service/.env.example`, `apps/ai-service/README.md`, root `CLAUDE.md` (mục "Kiến trúc phần AI", bảng "Hình dạng dữ liệu")

## Overview
- Priority: medium · Status: pending · **Vùng an toàn: config/deploy env**
- Xóa code truy xuất cũ, không còn ai gọi. Cập nhật env, docs. Chạy lại bộ đo P1 và viết báo cáo so sánh.

## Key Insights
- Bảng cũ vẫn còn tới P7, nên giữ các câu DELETE bảng cũ trong `document_handlers` cho tới lúc drop.
- Bỏ pickle cache cũng bỏ luôn rủi ro deserialize (`graph_builder._assert_trusted_cache_path`).

## Requirements
- Functional, xóa (xác minh bằng `git grep` trước khi xóa từng file):
  - `src/backend/services/hybrid_retrieval_service.py`, `graph_storage_service.py`, `entity_extraction_service.py`
  - `src/graph_rag/` (cả package: `graph_builder`, `graph_retriever`, `subgraph_partitioner`, `department_graph_manager*.py`, `semantic_department_detector`)
  - `src/rag/rag_graph.py` và các file chỉ nó dùng, nếu không còn ai gọi (kiểm tra `streamlit_app.py`, `simple_chat_agent.py`)
  - `src/storage/graph_cache/*.pkl` (nếu tracked)
  - `src/backend/tests/test_hybrid_retrieval_service.py`
  - `src/backend/scripts/benchmark_hybrid_retrieval.py`: viết lại `benchmark_generation_modes.py` dùng đường mới, hoặc xóa nếu bộ đo P1 đã thay thế
  - dependency `python-louvain` (nếu không còn import), `faiss-cpu` (nếu không còn import; xác minh)
- Env: bỏ `AI_RETRIEVAL_MODE`, `AI_GRAPH_USE_FAISS`, `AI_GRAPH_CACHE_ROOT` (và biến `AI_GRAPH_*` khác tìm thấy). Thêm `GRAPHRAG_LLM_MODEL`, `GRAPHRAG_CONCURRENCY`, `GRAPHRAG_MAX_TOKENS`, `GRAPHRAG_MERGE_THRESHOLD` vào compose `ai.yml` (cho `ai` và `ai-worker`), `.env.example`, README.
- Docs:
  - `CLAUDE.md`, mục "Kiến trúc phần AI": GraphRAG theo tài liệu, `GraphIndex` worker, local/global/fallback, khe khái niệm.
  - `CLAUDE.md`, bảng dữ liệu, dòng ai: thêm bảng Graph*; ghi chú bảng cũ sẽ drop ở P7.
  - README ai-service: kiến trúc và lệnh backfill.
  - `deploy/README.md`: env mới, bước chạy `python -m src.graphrag.backfill` sau deploy.
  - Changelog thủ công nếu có trong `docs/`.
- Đo: chạy `eval_rag_quality --label graphrag` trên cùng dataset và tài liệu, ghi `reports/eval-graphrag.json` + `reports/eval-comparison.md` (bảng trước/sau theo từng chỉ số, kèm nhận xét và các chỗ GraphRAG kém hơn).

## Architecture
Không có kiến trúc mới, chỉ dọn dẹp.

## Related Code Files
- Xóa: danh sách ở trên
- Sửa: `pyproject.toml` (+ lock file nếu có), `deploy/compose/ai.yml`, `deploy/.env.example`, `deploy/README.md`, `apps/ai-service/.env.example`, `apps/ai-service/README.md`, `/CLAUDE.md`, `src/backend/eval/*` (nếu import cũ)

## Implementation Steps
1. `git grep -n` cho từng module trước khi xóa, ghi danh sách người gọi. Còn người gọi thì sửa trước.
2. Xóa code, dependency. Chạy `ruff check src`, import smoke (`python -c "import src.main"`), toàn bộ pytest ai-service.
3. Sửa env và compose. Chạy `node --test deploy/compose-topology.spec.cjs` (nếu spec có kiểm env) và `docker compose config` cho file ai.
4. Cập nhật docs.
5. Dựng lại stack dev, chạy backfill, chạy bộ đo, viết báo cáo so sánh.

## Todo List
- [ ] Rà người gọi, xóa module cũ
- [ ] Bỏ dependency thừa
- [ ] Env/compose/README
- [ ] CLAUDE.md + README ai-service + deploy README
- [ ] Bộ đo sau + eval-comparison.md

## Success Criteria
- `git grep -nE "hybrid_retrieval|graph_rag\.|AI_RETRIEVAL_MODE|entity_extraction_service"` chỉ còn trong `plans/` và journal.
- Pytest ai-service pass (trừ lỗi đã biết `test_benchmark_runner_smoke_humaneval`).
- `eval-comparison.md` đạt các thước đo trong plan.md, hoặc ghi rõ chỉ số nào chưa đạt và vì sao.

## Risk Assessment
- Xóa nhầm module mà `streamlit_app`/script dev còn dùng → xóa luôn script dev chết, hoặc giữ lại nếu người dùng muốn. Hỏi trước khi xóa `streamlit_app.py`.
- Đo không đạt mục tiêu → không chặn P6 merge, nhưng phải ghi rõ và đề xuất chỉnh ngưỡng hoặc prompt trước P7.

## Security Considerations
- Gỡ đường `pickle.load`. Không thêm secret mới, env mới chỉ là cấu hình.

## Next Steps
- Release develop → main, deploy, backfill, rồi P7.
