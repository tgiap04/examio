---
title: "Chuyển RAG của ai-service sang GraphRAG tự xây trên Postgres"
status: in-progress
created: 2026-11-15
priority: high
effort: lớn (7 phase, ~3–4 tuần một người)
branch: develop (tách feature/graphrag-* theo phase, PR vào develop)
blockedBy: []
blocks: []
---

# Chuyển RAG của ai-service sang GraphRAG

Nguồn: [brainstorm-261115-graphrag-ai-service.md](../reports/brainstorm-261115-graphrag-ai-service.md)

Thay đồ thị theo đoạn văn và chế độ `hybrid` bằng GraphRAG kiểu Microsoft, gói trong từng tài liệu (`userStorageId`):
- **Lập chỉ mục**: thực thể và quan hệ do LLM trích, gộp trùng, embedding, cộng đồng Louvain 2 cấp, báo cáo cộng đồng. Trạng thái nằm trong `GraphIndex`, worker có retry.
- **Truy vấn**: chat dùng tìm cục bộ, câu hỏi tổng quan dùng tìm toàn cục, quiz/flashcard sinh theo "khe khái niệm". Khi chỉ mục chưa READY thì dùng tìm vector thuần.
- pgvector vẫn dùng: text unit chính là các dòng `Document` đã có embedding.

Contract giữa các service **không đổi**: event `ai.document.*` và `ai.generation.*`, gRPC `StreamChat`/`Query`, và shape item quiz/flashcard trả cho content-service.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Bộ đo chất lượng + số liệu nền trên hybrid](phase-01-eval-harness-baseline.md) | In Progress |
| 2 | [Lược đồ `0002` + trích thực thể/quan hệ + `GraphIndex` worker](phase-02-schema-extraction-index-worker.md) | Completed |
| 3 | [Gộp thực thể, embedding, cộng đồng, báo cáo, backfill](phase-03-resolution-communities-reports.md) | Completed |
| 4 | [Chat: tìm cục bộ + toàn cục + fallback vector](phase-04-chat-local-global-search.md) | Completed |
| 5 | [Sinh quiz/flashcard theo khe khái niệm](phase-05-concept-slot-generation.md) | Completed |
| 6 | [Gỡ hybrid và module cũ, cập nhật docs, đo lại](phase-06-remove-legacy-docs-eval.md) | In Progress |
| 7 | [Migration thu hẹp: drop bảng cũ (PR riêng, `migration:contract`)](phase-07-contract-drop-legacy-tables.md) | Completed |

## Phụ thuộc chính
- Phase phải chạy nối tiếp: P1 → P2 → P3 → (P4 ∥ P5) → P6 → P7. P4 và P5 có thể chạy song song vì sửa file riêng; cả hai dùng `src/graphrag/store.py` và `types.py` của P2/P3.
- P7 chỉ chạy sau khi bản P2–P6 đã deploy và backfill xong (`GraphIndex` READY cho các tài liệu còn dùng).
- Cần stack local (`docker-development ./project up`), 3–5 PDF mẫu upload lại (R2 `examio` đã bị xóa tay), AI2 key hợp lệ, và `GEMINI_API_KEY` cho embedding.

## Vùng an toàn (chạy đủ nhóm test)
Migration/schema (P2, P7), xóa dữ liệu (`document.deleted`, P2/P7), contract liên service (shape output generation, P5), config/deploy env (P6).

## Quyết định đã chốt
- Tự xây, không dùng LightRAG hay Microsoft GraphRAG. Code mới nằm ở package `src/graphrag/` (khác `src/graph_rag/` cũ, package cũ bị xóa ở P6).
- Model trích thực thể là model rẻ, **không reasoning**. Đọc env `GRAPHRAG_LLM_MODEL`, mặc định là model generation mặc định của AI2.
- Bộ chọn cục bộ/toàn cục chỉ dùng heuristic từ khóa (khác brainstorm: chưa thêm LLM phân loại, YAGNI; cân nhắc lại sau khi đo).
- Chỉ mục READY khi ≥70% chunk trích thành công.

## Thước đo thành công (đo ở P6 so với P1)
- Quiz 20 câu: tỉ lệ trùng khái niệm < 10%, phủ ≥ 80% cộng đồng cấp 0.
- Chat: điểm LLM-judge trên bộ 30 câu cao hơn hybrid, rõ nhất ở loại `multi_hop` và `global`.
- PDF 50 trang dựng chỉ mục < 5 phút, tỉ lệ READY ≥ 95%.
