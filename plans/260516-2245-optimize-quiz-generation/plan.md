# Optimize Quiz/Flashcard Generation — Speed + Entity-Aware Retrieval

## Summary

Giảm thời gian sinh quiz/flashcard từ 30-60s xuống <15s và cải thiện retrieval accuracy bằng entity extraction.

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| [Phase 1](phase-01-optimize-generation-pipeline.md) | pending | Optimize generation pipeline (batch size, concurrency) |
| [Phase 2](phase-02-entity-extraction-layer.md) | pending | Entity extraction lúc upload + entity-aware retrieval |

## Key Decisions

- Không thay đổi architecture RAG hiện tại (giữ HybridRetrievalService)
- Không thêm dependency mới cho Phase 1
- Phase 2 thêm entity extraction nhưng chạy background lúc upload, không ảnh hưởng generation time
- LightRAG có thể xem xét sau nếu cần cải thiện thêm

## Success Criteria

- Phase 1: 10 câu quiz sinh trong <15s (hiện 30-60s)
- Phase 2: Câu hỏi chính xác hơn (ít meta-document questions), retrieval hit rate tăng
