# Brainstorm: chuyển RAG của ai-service sang GraphRAG

Ngày: 2026-11-15 · Góc nhìn: CTO · Trạng thái: hướng đã chốt, chưa có plan

## Bài toán

Người dùng muốn GraphRAG giải bốn việc:
1. Quiz/flashcard bị trùng ý và không phủ hết các chủ đề của tài liệu.
2. Chat trả lời thiếu khi câu hỏi cần nối nhiều phần của tài liệu.
3. Câu hỏi tổng quan ("tài liệu nói về gì", "các ý chính") trả lời kém.
4. Đồ án cần một kiến trúc GraphRAG đúng nghĩa.

Lựa chọn của người dùng: **chuyển hẳn sang GraphRAG** (không giữ hybrid làm đường chính). Chấp nhận khoảng 1 lần gọi LLM cho mỗi đoạn lúc upload, dùng model rẻ.

## Hiện trạng (đã đọc code)

- `src/graph_rag/graph_builder.py`: đồ thị theo đoạn. Nút là chunk, cạnh là cấu trúc/metadata/ngữ nghĩa (cosine ≥ 0.7). Chia cụm bằng Louvain, lưu vào `UserStorageGraph`/`UserStorageGraphGroup`.
- `hybrid_retrieval_service.py` (1009 dòng), `AI_RETRIEVAL_MODE=vector|graph|hybrid`:
  - chat: tìm vector rồi mở rộng 1 bước trên đồ thị đoạn;
  - generation: chọn theo nhóm cộng đồng.
- `entity_extraction_service.py`: trích thực thể bằng LLM vào `DocumentEntity`. Chạy kiểu bắn rồi quên (`asyncio.create_task`), model gán cứng `gemini-2.5-flash`.
- Còn thiếu:
  - `relatedNames` không thành cạnh;
  - thực thể không được gộp trùng;
  - truy xuất không đi qua thực thể (generation chỉ nhét 15 tên vào metadata, chat không dùng);
  - `summary=None` gán cứng (`hybrid_retrieval_service.py:359`), nên không có tóm tắt cộng đồng;
  - module cũ không còn dùng: `department_graph_manager*.py`, `graph_retriever.py`, `rag/rag_graph.py`; cache bằng pickle.
- Quy mô: PDF tối đa 50 trang, khoảng 120 đoạn mỗi tài liệu. Mỗi đồ thị gói trong một tài liệu (`userStorageId`).

## Các hướng đã xét

| Hướng | Kết luận |
|---|---|
| A. Tự xây GraphRAG kiểu Microsoft trên Postgres hiện có | **Chọn**: không thêm hạ tầng, đi qua Alembic, chỉnh được prompt tiếng Việt |
| B. Thư viện LightRAG / nano-graphrag | Loại: thư viện tự quản bảng (vướng quy tắc schema `ai` + Alembic), khó chỉnh prompt và model, gọi LLM nhiều |
| C. Microsoft GraphRAG nguyên bản | Loại: pipeline chạy theo lô, lưu parquet, quá nặng với tài liệu 50 trang |
| D. Giữ hybrid, thêm BM25 + rerank | Loại: không giải được (1) và (3) |

## Thiết kế đã chốt

"Hoàn toàn GraphRAG" **vẫn dùng vector**. GraphRAG tìm thực thể bằng embedding của mô tả thực thể, và text unit chính là chunk đã có embedding. Phần bị bỏ là đồ thị đoạn và chế độ hybrid, không phải pgvector.

### Lập chỉ mục (worker, sau OCR + embed)
1. **Text unit** = các dòng `Document` hiện có, giữ nguyên embedding.
2. **Trích thực thể + quan hệ**: mỗi chunk một lần gọi LLM, trả JSON `{entities:[name,type,description], relationships:[source,target,description,strength]}`.
   - Dùng model rẻ, **không dùng model reasoning** (bài học từ lỗi `finish_reason=length` hôm 2026-11-14).
   - Đặt `max_tokens`, parse chặt, mỗi chunk retry 1 lần; chunk lỗi thì bỏ qua và ghi log.
3. **Gộp thực thể** trong một tài liệu:
   - chuẩn hóa tên (lowercase, bỏ dấu câu) rồi gộp;
   - thực thể có ≥3 mô tả thì gọi LLM tóm lại thành một.
4. **Embed** mô tả thực thể bằng `gemini-embedding-001`.
5. **Cộng đồng**: dùng Louvain (networkx/python-louvain đã có) trên đồ thị thực thể, 2 cấp (resolution thô và mịn).
6. **Báo cáo cộng đồng**: mỗi cộng đồng một lần gọi LLM, trả tiêu đề, tóm tắt, các ý chính và độ quan trọng; báo cáo được embed.
7. **Trạng thái** `GraphIndex(status PENDING|BUILDING|READY|FAILED, error, counts)`, retry có kiểm soát, thay cho kiểu bắn rồi quên.

Ước lượng cho một PDF 50 trang: khoảng 120 lần gọi trích + 10–30 lần gọi báo cáo + vài lần gọi gộp mô tả. Với concurrency 5–6 thì mất khoảng 2–5 phút.

### Truy vấn
- **Chat cục bộ**: embed câu hỏi → top-k thực thể → quan hệ 1 bước → text unit có nhắc tới các thực thể đó → báo cáo cộng đồng chứa chúng. Ghép ngữ cảnh theo ngân sách token. Giải (2).
- **Chat toàn cục** cho câu hỏi tổng quan: map-reduce trên báo cáo cộng đồng (chỉ 10–30 báo cáo nên rẻ). Chọn cục bộ hay toàn cục bằng heuristic từ khóa, rồi fallback bằng một lần gọi phân loại rẻ. Giải (3).
- **Sinh quiz/flashcard theo "khe khái niệm"**:
  - chia số câu cho các cộng đồng theo độ quan trọng;
  - mỗi câu nhắm một thực thể hoặc quan hệ khác nhau;
  - prompt gồm mô tả thực thể + text unit làm bằng chứng;
  - lọc trùng theo thực thể đích.
  
  Giải (1). Chế độ hẹp (keyword) thì chọn thực thể gần keyword nhất làm hạt giống.
- **Khi chỉ mục chưa READY**: generation/chat dùng tìm vector thuần trên text unit (một hàm nhỏ, không phải hybrid cũ). Kết quả trả về ghi rõ `retrieval_mode=vector_fallback`. Upload không phải chờ dựng đồ thị.

### Lược đồ (schema `ai`, Alembic)
- Migration mở rộng `0002`, tạo bảng mới:
  - `GraphIndex`;
  - `GraphEntity` (userStorageId, name, normName, type, description, embedding, degree, rank);
  - `GraphRelationship` (source, target, description, weight);
  - `GraphTextUnitEntity` (chunkId ↔ entityId);
  - `GraphCommunity` (level, parentId, entityIds, title, report, rating, embedding).
  
  Mỗi bảng có index theo `userStorageId`.
- `document.deleted` (`document_handlers.py` `DELETE_*_SQL`) phải xóa cả các bảng mới. Không có ảnh R2 nên quy tắc xóa R2 không áp dụng.
- Migration thu hẹp (PR sau, label `migration:contract`): bỏ `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`.

### Ranh giới giữa các service
- Không đổi contract: `ai.document.processed` vẫn phát sau OCR + embed như hiện tại; `content.generation.requested` / `ai.generation.*` và gRPC `StreamChat`/`Query` giữ nguyên.
- Đây là thay đổi nội bộ ai-service. Phía content-service và FE không phải sửa. Tùy chọn: hiển thị trạng thái "đang dựng đồ thị".

### Phần bị gỡ
- `hybrid_retrieval_service.py` (đồ thị đoạn, nhóm), biến `AI_RETRIEVAL_MODE`.
- `graph_rag/department_graph_manager*.py`, `graph_retriever.py`, `semantic_department_detector.py`, `subgraph_partitioner.py` (phần Louvain viết lại cho đồ thị thực thể).
- `rag/rag_graph.py` (nếu không còn ai gọi), pickle cache `src/storage/graph_cache/*.pkl`. Bỏ pickle cũng bỏ luôn một lỗ hổng deserialize.

## Rủi ro cần theo dõi
- **Router miễn phí không ổn định**: JSON bị cắt, lỗi 401/404 model. Cần model rẻ không reasoning, `max_tokens` + kiểm tra `finish_reason`, cho phép một số chunk trích lỗi mà chỉ mục vẫn READY (ngưỡng: ≥70% chunk thành công).
- **Gộp thực thể tiếng Việt** (có dấu/không dấu, viết tắt): bắt đầu bằng chuẩn hóa + embedding similarity ≥0.92 trong cùng loại; không dùng LLM để gộp hàng loạt.
- **Chi phí và độ trễ upload**: dựng chạy nền, có trạng thái, fallback vector trong lúc chờ.
- **Chứng minh tốt hơn**: phải đo trước và sau, không thì đồ án không có số liệu.

## Thước đo thành công
- Tỉ lệ câu quiz trùng khái niệm (cùng thực thể đích) < 10% với 20 câu/tài liệu; số cộng đồng được phủ ≥ 80%.
- Chat: bộ 30 câu hỏi (cục bộ, nối nhiều phần, tổng quan) trên 3–5 tài liệu mẫu, LLM-judge chấm đúng/đủ; GraphRAG phải hơn hybrid hiện tại. Mở rộng `scripts/benchmark_generation_modes.py`, `benchmark_hybrid_retrieval.py`.
- Dựng chỉ mục PDF 50 trang < 5 phút, tỉ lệ READY ≥ 95%.

## Bước tiếp theo (gợi ý chia phase)
1. Bộ đo và số liệu nền trên hybrid hiện tại.
2. Lược đồ `0002` + indexer trích thực thể/quan hệ + `GraphIndex`.
3. Gộp thực thể, embedding, cộng đồng, báo cáo cộng đồng.
4. Chat cục bộ + toàn cục + fallback vector.
5. Generation theo khe khái niệm (quiz + flashcard, cả chế độ hẹp).
6. Gỡ hybrid/module cũ, cập nhật docs (`CLAUDE.md` phần AI, README ai-service), đo lại.
7. PR thu hẹp: drop bảng cũ.
