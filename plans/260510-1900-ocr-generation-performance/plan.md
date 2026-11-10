---
name: OCR and generation performance optimization
status: implemented
created: 2026-05-10
blockedBy: []
blocks: []
---

# OCR, Embedding, Quiz/Flashcard Performance Optimization

## Goal
Reduce end-to-end latency for document OCR, embedding storage, retrieval planning, and quiz/flashcard generation without changing product behavior or generation quality.

## Current Evidence
- Embedding uses Ollama via `kmaedu-be/apps/ai-service/src/llm/ollama_embeddings.py`.
- `create_embeddings_batch()` reads env values but hard-caps batch size to `3` and concurrency to `2`.
- `GenerationService.DEFAULT_GENERATION_MAX_CONCURRENCY = 1`, so quiz/flashcard LLM calls are sequential unless env overrides it.
- `retrieve_for_generation()` reads all document chunks, builds/loads graph, then `generate_quiz()`/`generate_flashcards()` calls `_get_or_build_graph_entry()` again with another full `get_document_chunks()` call.
- Prisma schema shows `Document.userStorageId` but no explicit `@@index([userStorageId])`; query path orders by `createdAt`.
- Vector DB writes are already batched with `executemany`, so first priority is measuring embedding, graph, retrieval, and generation time rather than rewriting storage blindly.

## Phases
1. [Measure baseline and query cost](phase-01-measure-baseline.md) — status: implemented
2. [Optimize OCR and embedding pipeline](phase-02-optimize-ocr-embedding.md) — status: implemented
3. [Optimize retrieval, graph planning, and queries](phase-03-optimize-retrieval-graph-db.md) — status: implemented
4. [Optimize quiz and flashcard generation](phase-04-optimize-generation.md) — status: implemented
5. [Validate performance and regressions](phase-05-validate-performance.md) — status: implemented

## Success Metrics
- OCR + embedding time decreases by at least 30% on representative PDFs with many chunks.
- Quiz/flashcard generation time decreases by at least 30% for the same document/model/item count.
- DB query plan for chunk loading uses index scan or otherwise proves sequential scan is acceptable for small per-file datasets.
- No infinite polling, missing result, duplicate chunk, or generation quality regression.
- Memory remains bounded for large PDFs; no unbounded full-file duplication beyond unavoidable OCR extraction.

## Key Files
- `../kmaedu-be/apps/ai-service/src/llm/ollama_embeddings.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../kmaedu-be/apps/ai-service/src/rag/vector_store_pg.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`
- `../kmaedu-be/libs/database/src/schema.prisma`

## Constraints
- Keep changes small and measurable; do not change model/provider unless user approves.
- Prefer env-tunable limits with safe defaults over hard-coded high concurrency.
- Do not remove graph/RAG logic unless measurements prove it is the bottleneck and fallback quality is acceptable.
- Avoid N+1 queries and repeated full chunk scans.
