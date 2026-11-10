# Phase 02 — Optimize OCR and Embedding Pipeline

## Context Links
- `../kmaedu-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../kmaedu-be/apps/ai-service/src/llm/ollama_embeddings.py`
- `../kmaedu-be/apps/ai-service/src/rag/vector_store_pg.py`

## Overview
Priority: high  
Status: implemented  
Reduce chunk embedding latency and avoid unnecessary memory/CPU work during OCR preparation.

## Key Insights
- `ollama_embeddings.create_embeddings_batch()` currently clamps `batch_size` to max `3` and `max_concurrency` to max `2`, despite defaults of `5`.
- Ollama `/api/embeddings` still embeds one prompt per request, so complexity remains O(chunks), but wall-clock can improve with safe bounded concurrency.
- `store_documents_batch()` already batches DB writes; DB insert is likely less expensive than embedding.
- PDF processing builds `documents_to_store` in memory before embedding; this is simple but can be heavy for large PDFs.

## Requirements
- Replace hidden hard caps with env-tunable safe limits.
- Keep conservative defaults to avoid Ollama VRAM exhaustion.
- Preserve per-item retry behavior.
- Avoid duplicate status writes and avoid per-row DB fallback unless batch upsert fails.

## Related Code Files
Modify:
- `../kmaedu-be/apps/ai-service/src/llm/ollama_embeddings.py`
- `../kmaedu-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../kmaedu-be/apps/ai-service/src/rag/vector_store_pg.py`

## Implementation Steps
1. Introduce explicit env caps such as `OLLAMA_EMBED_MAX_BATCH_SIZE` and `OLLAMA_EMBED_MAX_CONCURRENCY_CAP`, or remove the `3/2` clamp while preserving minimum validation.
2. Benchmark candidate settings: `batch=3/concurrency=2`, `batch=5/concurrency=3`, `batch=8/concurrency=4`.
3. Add fail-fast validation for chunks exceeding `OLLAMA_EMBED_MAX_LENGTH`; keep splitter aligned with embedding limit.
4. If memory is a bottleneck, stream PDF page groups into bounded batches instead of building every chunk before embedding.
5. Keep DB `executemany` path; only improve fallback logging so a fallback is visible in timing.

## Todo List
- [ ] Make embedding batch/concurrency limits explicit and tunable.
- [ ] Benchmark Ollama throughput and error rate per setting.
- [ ] Confirm chunk length never exceeds embedding model limit.
- [ ] Consider bounded chunk streaming only if memory baseline proves it is needed.

## Success Criteria
- Embedding throughput improves without increased failure/retry rate.
- A large PDF does not produce unbounded memory growth beyond accepted OCR extraction cost.
- Status is `COMPLETED` only after chunks and embeddings are persisted.

## Risk Assessment
- Too much concurrency can exhaust Ollama VRAM or degrade all requests.
- Larger batches may worsen p95 if one slow request blocks a batch.

## Security Considerations
- Never send document content to a new external embedding API without explicit approval.

## Next Steps
Proceed to Phase 03 after embedding is measured and tuned.
