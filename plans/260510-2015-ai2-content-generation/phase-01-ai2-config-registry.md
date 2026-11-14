# Phase 01 — Define AI2 Config and Model Registry

## Overview
Priority: critical  
Status: implemented  
Introduce AI2 as a first-class generation provider and remove Ollama generation models from the exposed generation registry.

## Context Links
- `../kmaedu-be/apps/ai-service/src/llm/model_registry.py`
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py`
- `../kmaedu-be/apps/ai-service/src/backend/api/file.py`
- `../kmaedu-be/apps/exam-service/src/modules/ai/ai.service.ts`
- `../kmaedu-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`

## Requirements
- Add provider value `ai2` to model registry types.
- Keep `EMBEDDING_MODEL` provider as `ollama`.
- Replace generation catalog with the 3 AI2 models requested by user.
- Make default generation model env-configurable via `AI2_DEFAULT_MODEL` or existing `DEFAULT_MODEL_ID` with a clear precedence.
- Keep frontend DTO shape unchanged: `id`, `name`, `provider`, `runtimeModelName`, `isDefault`, `supportsStructuredOutput`, etc.

## Implementation Steps
1. Change `ModelProvider` from `Literal['gemini', 'ollama']` to include `ai2`.
2. Define generation entries:
   - id/runtime: `minimax-m2.5-free`
   - id/runtime: `nemotron-3-super-free`
   - id/runtime: `trinity-large-preview-free`
3. Mark only one default, controlled by env if possible.
4. Remove or disable Ollama generation entries from `GENERATION_MODELS`; keep legacy aliases mapping to the new default only if needed for backward compatibility.
5. Update `AIModelType` enum if code still references old generation IDs.
6. Update model availability logic so AI2 models validate against AI2 `/models`, not Ollama `/api/tags`.

## Todo List
- [x] Add `ai2` provider type.
- [x] Replace generation model registry entries.
- [x] Keep embedding model unchanged.
- [x] Update legacy aliases/default behavior.
- [x] Keep `/ai/models` response shape stable.

## Success Criteria
- `/ai/models` no longer exposes Ollama generation models.
- Default generation model resolves to one of AI2 models.
- Existing FE model selector does not require response shape changes.

## Risks
- If old stored jobs pass `qwen3_8b`, strict removal can fail. Prefer alias old IDs to default AI2 model during transition.

## Security
- No API key in registry or logs.
