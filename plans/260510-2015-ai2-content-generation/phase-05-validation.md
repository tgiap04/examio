# Phase 05 — Validate API, Catalog, Generation, and Fallback Behavior

## Overview
Priority: critical  
Status: implemented  
Validate that AI2 content generation works and Ollama is only used for OCR/embedding.

## Context Links
- `../examio-be/apps/ai-service/src/backend/api/file.py`
- `../examio-be/apps/ai-service/src/backend/api/generation.py`
- `../examio-be/apps/exam-service/src/modules/ai/ai.service.ts`
- `../examio-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`

## Requirements
- Validate `/ai/models` returns the 3 AI2 generation models and Ollama embedding metadata.
- Validate AI2 `/models` integration with configured key and base URL.
- Validate quiz generation with each requested AI2 model.
- Validate flashcard generation with default AI2 model.
- Validate missing `AI2_API_KEY` returns a clear configuration error for generation but not OCR.
- Validate no request goes to Ollama `/api/generate` for generation.
- Validate frontend contains no `ai2.devt.vn`, `AI2_BASE_URL`, or `AI2_API_KEY` usage; all AI provider calls stay behind backend APIs.

## Commands
- Python compile:
  - `cd ../examio-be && python3 -m py_compile apps/ai-service/src/llm/model_registry.py apps/ai-service/src/llm/model_manager.py apps/ai-service/src/llm/llm_factory.py apps/ai-service/src/backend/services/generation_service.py`
- Backend build:
  - `cd ../examio-be && yarn build`
- Prisma not required unless schema changes.
- Optional live AI2 smoke test only if API key is configured in env:
  - `GET ${AI2_BASE_URL}/models`
  - `POST ${AI2_BASE_URL}/chat/completions`

## Implementation Steps
1. Run static search: no Ollama generation IDs in `GENERATION_MODELS`.
2. Run static search: generation path has no `_generate_with_ollama()` dispatch for AI2 registry models.
3. Run Python compile and backend build.
4. If env key exists, call AI2 `/models` and one short chat completion with each model.
5. Run one quiz/flashcard flow in dev if services are available.
6. Search frontend for AI2 config or direct provider URL and fail validation if any exists.
7. Document any AI2 model that is listed in registry but unavailable from provider.

## Todo List
- [x] Python compile pass.
- [x] Backend build pass.
- [x] Catalog endpoint shape verified.
- [ ] AI2 model list verified live (skipped: `AI2_API_KEY` not configured in env).
- [ ] Generation smoke test verified live (skipped: `AI2_API_KEY` not configured in env).
- [x] OCR-only flow does not require AI2 key.
- [x] Frontend has no direct AI2 provider usage.

## Success Criteria
- Generation provider migration is fully covered by compile/build plus smoke test when credentials exist.
- Error messages are clear and do not leak API key.
- No frontend route/API contract changes needed.

## Risks
- Free models may be temporarily unavailable or rate-limited; availability check should disable unavailable models instead of crashing catalog.

## Security
- Never commit `.env` values or API keys.
- Redact API key in all logs/errors.
