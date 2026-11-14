# Phase 01 — Bộ đo chất lượng và số liệu nền

## Context Links
- [plan.md](plan.md) · [brainstorm](../reports/brainstorm-261115-graphrag-ai-service.md)
- Có sẵn: `kmaedu-be/apps/ai-service/src/backend/scripts/benchmark_generation_modes.py`, `benchmark_hybrid_retrieval.py`

## Overview
- Priority: high · Status: pending
- Dựng bộ đo chạy được trên cả hybrid (bây giờ) và GraphRAG (sau P6) với cùng đầu vào, rồi ghi số liệu nền. Không có số nền thì đồ án không có gì để so.

## Key Insights
- Hai script benchmark hiện có đo tốc độ và số chunk, không đo chất lượng.
- Tỉ lệ trùng phải đo **không phụ thuộc thực thể**, vì hybrid không có thực thể. Cách đo: cosine giữa các câu hỏi, cộng LLM-judge.
- Câu trả lời chat gọi qua `chat_service.answer_query(ChatParams)`, không cần dựng gRPC.

## Requirements
- Functional:
  - CLI `python -m src.backend.scripts.eval_rag_quality --storage-ids a,b,c --dataset <json> --out <json> --label baseline`.
  - Đo quiz: với mỗi tài liệu sinh 20 câu quiz + 20 flashcard (gọi thẳng `generation_service.generate_quiz` / `generate_flashcards`), tính:
    - `duplicate_rate`: tỉ lệ item nằm trong ít nhất một cặp có cosine embedding câu hỏi ≥ 0.88;
    - `judge_duplicate_rate`: LLM-judge gom item theo khái niệm, tỉ lệ = 1 − số cụm/số item;
    - `page_coverage`: số trang khác nhau trong nguồn / tổng số trang.
  - Đo chat: dataset JSON gồm `{storageId, question, type: local|multi_hop|global, keyPoints[]}`, khoảng 30 câu cho 3–5 tài liệu. LLM-judge chấm `correct` (0–2), `complete` (tỉ lệ keyPoints có mặt), `grounded` (0–1).
  - Báo cáo JSON gồm điểm theo tài liệu, theo loại câu hỏi, độ trễ p50/p95, `retrieval_mode`.
- Non-functional: judge dùng model mạnh hơn model sinh nếu có, cố định `temperature=0`, ghi tên model vào báo cáo. Script không ghi gì vào DB.

## Architecture
```
eval_rag_quality.py (CLI, <200 dòng)
 ├─ eval/metrics.py        duplicate_rate, page_coverage (thuần, test được)
 ├─ eval/judge.py          prompt + parse cho judge quiz-dedupe và chat
 └─ eval/datasets/rag_eval_v1.json
```
Đặt dưới `src/backend/eval/`. Embedding dùng `GeminiEmbeddings.embed_documents`.

## Related Code Files
- Tạo: `src/backend/scripts/eval_rag_quality.py`, `src/backend/eval/{__init__,metrics,judge}.py`, `src/backend/eval/datasets/rag_eval_v1.json`, `src/backend/tests/test_eval_metrics.py`
- Đọc: `generation_service.py` (`generate_quiz`, request type), `chat_service.py` (`ChatParams`, `answer_query`)

## Implementation Steps
1. Viết `metrics.py` (cosine pairwise trên numpy, ngưỡng là tham số) và test trước: không có item, 1 item, toàn trùng, không trùng, ngưỡng biên.
2. Viết `judge.py`: prompt tiếng Việt, ép JSON, parse chặt. Parse lỗi thì ghi `null`, không ngầm tính 0.
3. Soạn dataset: chọn 3–5 PDF môn học KMA (≤50 trang), mỗi tài liệu 6–10 câu, đủ ba loại. keyPoints viết tay.
4. Upload các PDF qua UI local, ghi lại `userStorageId` vào dataset.
5. Chạy với `AI_RETRIEVAL_MODE=hybrid`, lưu `plans/261115-0128-graphrag-ai-service/reports/eval-baseline.json` và một bảng tóm tắt `.md`.

## Todo List
- [ ] metrics.py + test
- [ ] judge.py
- [ ] dataset rag_eval_v1.json (≥30 câu)
- [ ] CLI eval_rag_quality.py
- [ ] Chạy baseline, lưu báo cáo

## Success Criteria
- `pytest src/backend/tests/test_eval_metrics.py` pass.
- Có `eval-baseline.json` với đủ chỉ số cho mọi tài liệu. Chạy lại 2 lần thì điểm judge chênh ≤ 10% (kiểm tra độ ổn định).

## Risk Assessment
- Judge dao động → temperature 0, chạy 2 lần lấy trung bình, ghi lại độ lệch.
- Router AI2 hết quota giữa chừng → script ghi tiến độ từng tài liệu, chạy lại được bằng `--resume`.

## Security Considerations
- Không in API key. PDF mẫu không chứa dữ liệu cá nhân, chỉ đặt dataset (câu hỏi) trong repo, không commit PDF.

## Next Steps
- P2. Bộ đo này được chạy lại ở P6.
