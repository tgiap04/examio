---
name: AI2 content generation provider migration
status: implemented
created: 2026-05-10
blockedBy: []
blocks: []
---

# AI2 Content Generation Provider Migration

## Goal
Remove Ollama from all content-generation paths and use the OpenAI-compatible AI2 API only for quiz/flashcard/content generation. Keep Ollama only for OCR-related embedding/vector work.

## Requested AI2 Models
- `minimax-m2.5-free`
- `nemotron-3-super-free`
- `trinity-large-preview-free`

## Provider Boundary
- AI2: generation only (`/v1/chat/completions`, `/v1/models`).
- Ollama: embedding/OCR only (`/api/embeddings` via existing `ollama_embeddings.py`).
- Frontend must never call `ai2.devt.vn` directly; FE continues calling gateway/exam-service APIs, and backend AI service owns provider routing.
- Do not route embeddings, OCR, vector storage, or graph/RAG chunk embedding to AI2.

## Current Code Findings
- `../kmaedu-be/apps/ai-service/src/llm/model_registry.py` defines generation models as `gemini`/`ollama` providers and embedding as Ollama.
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py` routes generation through `_generate_with_gemini()` or `_generate_with_ollama()`.
- `../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py` conditionally uses Pydantic structured output only for Ollama models.
- `../kmaedu-be/apps/ai-service/src/llm/llm_factory.py` can still instantiate Ollama chat models for higher-level flows.
- Model catalog endpoint exists at AI service `/ai/models`, proxied by exam-service and gateway; FE should only consume this proxied BE route.

## Phases
1. [Define AI2 config and model registry](phase-01-ai2-config-registry.md) — status: implemented
2. [Implement OpenAI-compatible AI2 client](phase-02-ai2-client.md) — status: implemented
3. [Route content generation to AI2 only](phase-03-generation-routing.md) — status: implemented
4. [Preserve Ollama OCR/embedding boundary](phase-04-ocr-embedding-boundary.md) — status: implemented
5. [Validate API, catalog, generation, and fallback behavior](phase-05-validation.md) — status: implemented

## Success Criteria
- Quiz/flashcard generation never calls Ollama generation endpoints.
- OCR/embedding still calls Ollama embedding endpoint and remains unchanged functionally.
- `/ai/models` returns only AI2 generation models plus the existing embedding model metadata.
- AI2 base URL, API key, model list/default, timeout, temperature, and max tokens are env-configurable.
- Build/compile checks pass for backend and Python AI service.
- FE code has no AI2 base URL/API key/config usage.

## Key Env Variables
- `AI2_BASE_URL=https://ai2.devt.vn/v1`
- `AI2_API_KEY=<secret>`
- `AI2_GENERATION_MODEL_NAMES=minimax-m2.5-free,nemotron-3-super-free,trinity-large-preview-free`
- `AI2_DEFAULT_MODEL=minimax-m2.5-free`
- `AI2_TIMEOUT_SECONDS=3600`
- Reuse or map existing `DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS` unless a stronger reason appears.

## Non-Goals
- Do not implement AI2 embeddings.
- Do not remove `ollama_embeddings.py`.
- Do not change OCR, chunking, vector store schema, or retrieval quality logic.
- Do not hard-code API keys.

## Cook Command
`/cook /Users/tgiap.dev/devs/kma-edu/plans/260510-2015-ai2-content-generation/plan.md`
