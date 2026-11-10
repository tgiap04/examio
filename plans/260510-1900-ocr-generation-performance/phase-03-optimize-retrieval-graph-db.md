# Phase 03 — Optimize Retrieval, Graph Planning, and Database Queries

## Context Links
- `../kmaedu-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../kmaedu-be/apps/ai-service/src/rag/vector_store_pg.py`
- `../kmaedu-be/libs/database/src/schema.prisma`

## Overview
Priority: high  
Status: implemented  
Reduce repeated full chunk scans and make hot DB reads/indexes match actual access patterns.

## Key Insights
- `retrieve_for_generation()` calls `ocr_service.get_document_chunks(user_storage_id)` and returns selected/flattened chunks.
- `generate_quiz()` and `generate_flashcards()` then call `_get_or_build_graph_entry()` again with a fresh `await ocr_service.get_document_chunks(...)`.
- This duplicates full chunk loading and graph state checks on every generation request.
- `Document` has `userStorageId` but no explicit Prisma `@@index([userStorageId])` or composite `@@index([userStorageId, createdAt])` in the inspected schema.
- Vector search orders by `embeddings <=> query_vector`; performance depends on pgvector index availability and query shape.

## Requirements
- Avoid redundant full document chunk reads during generation.
- Ensure `Document` read path is indexed for `WHERE userStorageId ORDER BY createdAt`.
- Ensure vector search has an appropriate pgvector index if dataset size justifies it.
- Preserve graph/hybrid selection behavior unless measurements prove a simpler path is needed.

## Related Code Files
Modify:
- `../kmaedu-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`
- `../kmaedu-be/libs/database/src/schema.prisma`

Potential migration:
- Prisma migration under `../kmaedu-be/libs/database/src/migrations` or the repo's existing migration workflow.

## Implementation Steps
1. Return enough metadata from `retrieve_for_generation()` to reuse the already-loaded graph entry or generation groups.
2. Remove the second `get_document_chunks()` call in `generate_quiz()` and `generate_flashcards()` by using retrieval-planned groups directly.
3. Add a composite index for `Document`: `@@index([userStorageId, createdAt])` if `EXPLAIN ANALYZE` shows sequential scan or sort cost.
4. Verify pgvector index strategy for `Document.embeddings`; add HNSW/IVFFLAT only if current data volume and query plans require it.
5. Keep graph persistence, but ensure `_load_graph_state_from_db()` uses indexed lookup and does not rebuild when `chunkSignature` matches.
6. Prefer set/dict lookup for chunk id mapping; avoid nested loops over chunks and groups where possible.

## Todo List
- [ ] Remove duplicate chunk read in generation flow.
- [ ] Add or validate `Document(userStorageId, createdAt)` index.
- [ ] Check pgvector index existence and query plan.
- [ ] Confirm graph cache/persistence avoids rebuild for unchanged chunks.
- [ ] Benchmark retrieval before/after.

## Success Criteria
- Generation request performs one full chunk load at most.
- Hot chunk query has stable low latency for large files.
- Graph is not rebuilt when chunk signature is unchanged.
- Retrieval latency drops or remains negligible relative to LLM generation.

## Risk Assessment
- Schema index changes need migration discipline and deployment coordination.
- pgvector index type depends on pgvector version and vector dimensions.

## Security Considerations
- Keep authorization checks at the caller boundaries; do not expose chunks across users.

## Next Steps
Proceed to Phase 04 after retrieval and query cost are stable.
