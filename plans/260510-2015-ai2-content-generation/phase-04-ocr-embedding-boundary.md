# Phase 04 — Preserve Ollama OCR/Embedding Boundary

## Overview
Priority: high  
Status: implemented  
Keep local Ollama only for embedding/vector work required by OCR/RAG and prevent accidental AI2 embedding usage.

## Context Links
- `../examio-be/apps/ai-service/src/llm/ollama_embeddings.py`
- `../examio-be/apps/ai-service/src/rag/vector_store_pg.py`
- `../examio-be/apps/ai-service/src/backend/services/ocr_service.py`
- `../examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py`

## Requirements
- `get_embedding_info()` remains Ollama-based.
- `PgVectorStore.create_embedding()` and `create_embeddings_batch()` keep using `ollama_embeddings`.
- OCR processing still stores document chunks with Ollama embeddings.
- AI2 config must not affect OCR, chunking, vector search, graph build, or retrieval.
- Env naming must make the boundary obvious.

## Implementation Steps
1. Leave `ollama_embeddings.py` untouched except comments/logs if needed.
2. Add tests/search checks to ensure no `AI2_*` env is referenced in embedding/vector store code.
3. Keep model catalog response with `embeddingModel` as `qwen3_embedding_8b` provider `ollama`.
4. Update descriptions to state AI2 is generation-only and Ollama is embedding-only.
5. If old code calls `model_manager.get_model_type()` for embedding, ensure it does not resolve to AI2 by accident.

## Todo List
- [x] Search embedding/vector code for accidental AI2 usage.
- [x] Keep `EMBEDDING_MODEL` unchanged.
- [x] Confirm OCR job still persists vectors with Ollama.
- [x] Confirm retrieval query embedding still uses Ollama.

## Success Criteria
- OCR and RAG retrieval behavior remains unchanged except generation provider.
- No AI2 embedding endpoint is introduced.
- AI2 API key is not required for OCR-only jobs.

## Risks
- Over-broad provider refactor can break embeddings if generation and embedding registry are coupled. Keep changes scoped.

## Security
- Local OCR/embedding avoids sending uploaded documents to AI2 except the selected generation snippets already used for content generation.
