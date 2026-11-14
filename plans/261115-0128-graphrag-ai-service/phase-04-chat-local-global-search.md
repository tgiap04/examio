# Phase 04 — Chat: tìm cục bộ, tìm toàn cục, fallback vector

## Context Links
- [plan.md](plan.md) · [phase-03](phase-03-resolution-communities-reports.md)
- Điểm gọi: `src/backend/services/chat_service.py:82` (`answer_query`) và `:118` (`stream_chat`), đều gọi `hybrid_retrieval_service.retrieve_for_chat(...)` → dùng `combined_context`, `sources`
- Tìm vector: `src/rag/vector_store_pg.py:253` `search_similar`

## Overview
- Priority: high · Status: pending
- Thay `retrieve_for_chat` bằng `graphrag_retrieval.retrieve_for_chat`, giữ nguyên shape trả về (`combined_context`, `sources`, `retrieval_mode`, `metadata`). `chat_service` chỉ đổi import và chỗ gọi.

## Key Insights
- `stream_chat` phát frame `started` trước khi truy xuất, nên bước map của tìm toàn cục (thêm 1–3 lần gọi LLM) không làm lỗi status gRPC. Lỗi lúc này thành frame `error`, đúng contract hiện có.
- Mỗi tài liệu có ít báo cáo cấp 0 (≤30), nên map-reduce chỉ cần 1–3 lô.
- `sources` phải vẫn là danh sách text unit có `pageRange`, vì ai-chat và FE hiển thị trích dẫn theo đó.

## Requirements
- Functional:
  - `query/router.py`:
    - `classify(query) -> 'global' | 'local'` bằng heuristic từ khóa tiếng Việt và Anh: "tổng quan", "tóm tắt", "nội dung chính", "ý chính", "các chủ đề", "tài liệu nói về", "overview", "summar", "main idea";
    - không phân biệt hoa/thường và dấu.
  - `query/local_search.py`:
    - embed câu hỏi → top-k thực thể (`k=10`, `ORDER BY embedding <=> $1`, lọc `userStorageId`);
    - quan hệ giữa các thực thể đó và quan hệ 1 bước ra ngoài, theo weight, tối đa 30;
    - text unit xếp theo số thực thể khớp, rồi theo cosine với câu hỏi;
    - báo cáo cấp 1 chứa các thực thể đó, tối đa 3.
    
    Ghép ngữ cảnh theo ngân sách ký tự `max_content_length` với tỉ lệ: báo cáo 20%, thực thể và quan hệ 20%, trích đoạn 60%. Có nhãn từng phần và số trang.
  - `query/global_search.py`:
    - map: chia báo cáo cấp 0 thành lô ~8; mỗi lô một lần gọi LLM trả `[{point, score 0–100}]` liên quan câu hỏi;
    - reduce: lấy các ý có điểm cao nhất theo ngân sách làm ngữ cảnh;
    - `sources` = text unit của các thực thể trong những cộng đồng được chọn, tối đa 5.
  - `query/vector_fallback.py`: dùng khi `GraphIndex` không READY hoặc đồ thị rỗng; `search_similar` top_k; `retrieval_mode='vector_fallback'`.
  - `graphrag_retrieval.py`: `retrieve_for_chat(user_storage_id, query, model_type, top_k, max_content_length)` → kiểm tra trạng thái → router → local hoặc global → `ChatRetrievalResult`.
  - Log `[GRAPHRAG_QUERY] mode=local|global|vector_fallback entities=… reports=… units=… elapsed_ms=…`.
- Non-functional: p95 truy xuất cục bộ < 800 ms (không tính LLM), toàn cục < 8 s.

## Architecture
```
chat_service ─► graphrag_retrieval.retrieve_for_chat
                  ├─ store.index_status(id) ──not READY──► vector_fallback
                  ├─ router.classify(q)
                  ├─ local_search (SQL + context_builder)
                  └─ global_search (map LLM ∥, reduce)
```
Dùng chung `query/context_builder.py` (ghép theo ngân sách, định dạng nguồn).

## Related Code Files
- Tạo: `src/graphrag/graphrag_retrieval.py`, `src/graphrag/query/{__init__,router,local_search,global_search,vector_fallback,context_builder}.py`; test `tests/graphrag/test_router.py`, `test_context_builder.py`, `test_local_search.py` (tích hợp DB), `test_global_search.py` (LLM giả), `test_chat_retrieval_fallback.py`
- Sửa: `src/backend/services/chat_service.py` (import và chỗ gọi), `src/graphrag/store.py` (truy vấn đọc)
- Không sửa: proto, ai-chat-service

## Implementation Steps
1. Test router (các câu ví dụ hai ngôn ngữ, có dấu và không dấu, câu cục bộ chứa chữ "tóm" nhưng không phải tổng quan) → viết router.
2. Test context_builder: đúng ngân sách, phần rỗng không in tiêu đề, nguồn không trùng.
3. Viết truy vấn đọc trong store, cùng test tích hợp với đồ thị nhỏ dựng sẵn bằng fixture SQL.
4. Viết local_search, global_search, vector_fallback, graphrag_retrieval.
5. Đổi `chat_service`. Chạy `test_grpc_stream.py`, `test_sync_stream.py` (phải pass mà không sửa assertion).
6. Thử bằng tay trên UI chat với 1 câu mỗi loại và xem log mode.

## Todo List
- [x] router + test
- [x] context_builder + test
- [x] store read queries + test tích hợp
- [x] local_search, global_search, vector_fallback
- [x] graphrag_retrieval + đổi chat_service
- [x] Test stream hiện có vẫn pass; thử tay

## Success Criteria
- Câu hỏi "tài liệu này nói về gì" đi `mode=global`, câu hỏi khái niệm đi `mode=local`, tài liệu đang BUILDING đi `vector_fallback` và vẫn trả lời được.
- `sources` vẫn có `pageRange`. FE không phải sửa.

## Risk Assessment
- Heuristic phân loại sai → câu tổng quan đi local vẫn có báo cáo cấp 1 trong ngữ cảnh nên không trả lời trống. Đo lại ở P6, nếu tệ thì thêm bước phân loại bằng LLM.
- Embedding câu hỏi khác chiều với embedding thực thể (đổi model) → bắt lỗi pgvector "different vector dimensions", fallback vector, log cảnh báo.

## Security Considerations
- Mọi truy vấn lọc `userStorageId`. Quyền sở hữu đã được ai-chat kiểm tra (`AssertOwnership`) trước khi gọi ai-service. Không trả nội dung báo cáo của tài liệu khác.

## Next Steps
- P6 gỡ `hybrid_retrieval_service.retrieve_for_chat`.
