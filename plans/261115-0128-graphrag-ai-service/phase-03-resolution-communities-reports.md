# Phase 03 — Gộp thực thể, embedding, cộng đồng, báo cáo, backfill

## Context Links
- [plan.md](plan.md) · [phase-02](phase-02-schema-extraction-index-worker.md)
- Louvain cũ để tham khảo: `src/graph_rag/subgraph_partitioner.py`; embedding: `src/llm/gemini_embeddings.py`

## Overview
- Priority: high · Status: pending
- Biến kết quả trích thô thành đồ thị thực thể: gộp trùng, gộp mô tả, embedding, cộng đồng 2 cấp, báo cáo cho từng cộng đồng. Thêm script backfill cho tài liệu cũ.

## Key Insights
- networkx ≥3 có sẵn `louvain_communities(seed=…)`, nên không cần `python-louvain`. Cố định seed để kết quả lặp lại được, test được.
- Một PDF 50 trang ước khoảng 300–600 thực thể thô, sau khi gộp còn 150–350, chia được 10–30 cộng đồng cấp 0. Chi phí báo cáo là một lần gọi LLM cho mỗi cộng đồng.
- Tài liệu cũ có thể đã được embed bằng `text-embedding-004` (768 chiều), còn model hiện tại trả 3072 chiều. Embedding của câu hỏi và của thực thể phải cùng model.

## Requirements
- Functional:
  - `resolution.py`:
    - `norm_name` gồm: Unicode NFC, lowercase, gộp khoảng trắng, bỏ dấu câu ở đầu và cuối; giữ dấu tiếng Việt;
    - gộp theo `(type, norm_name)`, rồi gộp tiếp theo cosine embedding của `name + description` ≥ `GRAPHRAG_MERGE_THRESHOLD` (mặc định 0.92), chỉ trong cùng type;
    - quan hệ được ánh xạ lại sang id đã gộp: cộng weight, nối mô tả (bỏ trùng), bỏ tự vòng.
  - Gộp mô tả: thực thể có ≥3 mô tả thì gọi LLM tóm thành ≤60 từ (concurrency chung). Có 1–2 mô tả thì nối lại.
  - Embedding: embed `name: description` của mọi thực thể theo lô (`embed_documents` chạy trong thread, lô 50).
  - `communities.py`:
    - đồ thị có trọng số là weight quan hệ;
    - cấp 0 dùng `resolution=0.7`, cấp 1 dùng `resolution=1.3`; `parentId` của cấp 1 là cộng đồng cấp 0 có giao nhiều nhất;
    - cộng đồng < 2 thực thể không viết báo cáo, thực thể của nó vẫn giữ;
    - `degree` và `rank` (= degree chuẩn hóa) ghi vào `GraphEntity`.
  - `community_reports.py`:
    - đầu vào: thực thể (ưu tiên rank cao, tối đa 40), quan hệ nội bộ (tối đa 60), tối đa 3 trích đoạn text unit ngắn;
    - đầu ra JSON `{title, summary (≤120 từ), findings:[{summary, explanation}] (≤5), rating 0–10}`;
    - embed `title + summary`.
  - Indexer: extract → resolve → embed → communities → reports → `replace_graph` (một transaction) → READY. `stats` gồm số lượng từng bước và thời gian.
  - `src/graphrag/backfill.py` (CLI `python -m src.graphrag.backfill [--dry-run]`): với mỗi `userStorageId` có trong `Document` mà chưa có `GraphIndex`, upsert PENDING. Bỏ qua (và báo cáo) tài liệu có chiều embedding khác chiều model hiện tại; những tài liệu này cần upload lại.
- Non-functional: báo cáo cộng đồng giữ ngôn ngữ của tài liệu (prompt yêu cầu "viết cùng ngôn ngữ với trích đoạn"). Mỗi file < 200 dòng.

## Architecture
```
indexer.build
  extraction (P2) → resolution.merge → descriptions.summarize → embeddings.embed_entities
  → communities.detect(levels=[0.7,1.3]) → community_reports.write(concurrency) → store.replace_graph → READY
```
Mock ở đúng ranh giới: `LLMClient` (một hàm `complete(prompt, max_tokens)`) và `Embedder` (`embed(texts)`) truyền vào indexer, để test thay bằng bản giả.

## Related Code Files
- Tạo: `src/graphrag/{resolution,descriptions,embeddings,communities,community_reports,backfill}.py`; test `tests/graphrag/test_resolution.py`, `test_communities.py`, `test_community_reports_parse.py`, `test_indexer_pipeline.py`, `test_backfill.py`
- Sửa: `src/graphrag/indexer.py`, `src/graphrag/store.py` (ghi community, cập nhật degree/rank/embedding)

## Implementation Steps
1. Test resolution trước, gồm: hoa/thường; khoảng trắng; "Mã hóa AES" và "mã hóa aes" gộp; khác type không gộp; có dấu và không dấu **không** tự gộp ở bước tên (để bước embedding quyết định); quan hệ dồn weight; tự vòng bị bỏ.
2. Viết resolution, descriptions, embeddings.
3. Test communities: đồ thị cố định cho cùng kết quả với cùng seed; cấp 1 có parent; đồ thị rỗng và đồ thị 1 nút không lỗi.
4. Viết communities, community_reports (cùng test parse như P2).
5. Nối vào indexer. Test pipeline tích hợp với LLM và embedder giả trên DB test: READY, số bảng khớp, dựng lại cho cùng kết quả.
6. Backfill + test (dry-run không ghi; chiều lệch thì bị bỏ qua).
7. Chạy thật 1–2 PDF mẫu của P1, đọc vài báo cáo cộng đồng bằng mắt và ghi nhận xét vào `reports/p3-sample-review.md`.

## Todo List
- [x] resolution + test
- [x] descriptions + embeddings
- [x] communities + test
- [x] community_reports + test parse
- [x] indexer nối đủ bước + test pipeline
- [x] backfill + test
- [x] Soát mẫu thật

## Success Criteria
- PDF 50 trang: READY < 5 phút, có ≥ 5 cộng đồng cấp 0 có báo cáo, gộp giảm ≥ 20% số thực thể thô.
- Test pipeline lặp lại được (seed cố định).

## Risk Assessment
- Gộp quá tay, hai khái niệm khác nhau bị nhập làm một → ngưỡng 0.92, chỉ gộp trong cùng type, ngưỡng cấu hình được. Ghi danh sách cặp đã gộp vào `stats` để soát.
- Đồ thị rời rạc (ít quan hệ) → nhiều cộng đồng 1 nút. Thêm cạnh yếu (weight 0.5) giữa các thực thể cùng xuất hiện trong một chunk, để Louvain có cấu trúc.
- Thêm 20–30 lần gọi LLM làm tăng thời gian → chạy song song theo semaphore chung.

## Security Considerations
- Báo cáo do LLM sinh từ tài liệu của chính user và chỉ phục vụ lại cho tài liệu đó (lọc `userStorageId`). Mọi trường text đều cắt độ dài trước khi lưu.

## Next Steps
- P4 và P5 đọc đồ thị qua `store.py`.
