# Phase 01 — Measure Baseline and Query Cost

## Context Links
- `../examio-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../examio-be/apps/ai-service/src/rag/vector_store_pg.py`
- `../examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`
- `../examio-be/apps/ai-service/src/backend/services/generation_service.py`

## Overview
Priority: critical  
Status: implemented  
Establish timing and query baselines before changing algorithms or concurrency.

## Key Insights
- Existing logs already include `[AI_TIMING]` for embedding batch, vector store batch, quiz/flashcard prepare, generation config, and total generation.
- Missing detailed timing around PDF OCR extraction, document preparation, chunk reads, graph load/build, vector search, and save-history.
- Without baseline numbers, concurrency changes can overload Ollama/Postgres and make tail latency worse.

## Requirements
- Add timing spans around OCR extraction, chunk splitting, `get_document_chunks()`, graph load/build, vector search, generation task execution, and history save.
- Log chunk count, page count if available, content chars, model id, item count, batch count, concurrency, and elapsed ms.
- Run DB `EXPLAIN ANALYZE` for hot queries against realistic `userStorageId` values.

## Related Code Files
Modify:
- `../examio-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`
- `../examio-be/apps/ai-service/src/backend/services/generation_service.py`

Read/query:
- `../examio-be/libs/database/src/schema.prisma`

## Implementation Steps
1. Add compact `[AI_TIMING]` logs for each missing stage.
2. Add query count and chunk count to generation logs so repeated full reads are visible.
3. Use `psql` to run `EXPLAIN ANALYZE` for:
   - `SELECT ... FROM "Document" WHERE "userStorageId" = $1 ORDER BY "createdAt"`
   - vector search with `ORDER BY embeddings <=> $1::vector LIMIT $n`
   - graph state/group load queries.
4. Capture before/after numbers from the same file, same item count, same model.

## Todo List
- [ ] Add missing timing logs.
- [ ] Run representative OCR + embedding baseline.
- [ ] Run representative quiz baseline.
- [ ] Run representative flashcard baseline.
- [ ] Record hot query plans.

## Success Criteria
- One baseline table exists in the conversation or report with stage timings.
- Bottlenecks are ranked by elapsed time and call count.
- No optimization is implemented before baseline is captured.

## Risk Assessment
- Extra logging can become noisy; keep logs structured and single-line.
- Query plans need realistic data; tiny dev data may hide index needs.

## Security Considerations
- Do not log full document content, tokens, URLs with signed secrets, or user PII.

## Next Steps
Proceed to Phase 02 after identifying OCR/embedding share of total latency.
