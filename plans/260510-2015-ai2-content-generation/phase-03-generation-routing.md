# Phase 03 — Route Content Generation to AI2 Only

## Overview
Priority: high  
Status: implemented  
Ensure quiz/flashcard/content generation uses AI2 provider and never calls Ollama generation.

## Context Links
- `../examio-be/apps/ai-service/src/backend/services/generation_service.py`
- `../examio-be/apps/ai-service/src/llm/model_manager.py`
- `../examio-be/apps/ai-service/src/llm/llm_factory.py`

## Requirements
- `generate_content_with_model()` routes provider `ai2` to `_generate_with_ai2()`.
- Remove Ollama branch from content generation path or make it unreachable because registry no longer has Ollama generation models.
- Keep Gemini branch only if existing non-requested flows still require it; for quiz/flashcard selected catalog should be AI2-only.
- Update structured-output behavior: AI2 should use plain JSON-in-text parsing, same as current non-Ollama path.
- Ensure `generation_service.py` does not set `response_model` for AI2 models.

## Implementation Steps
1. Update `generate_content_with_model()` provider dispatch: `ai2` → AI2, `gemini` if retained → Gemini, no Ollama generation for registry models.
2. In `_generate_quiz_batch_for_chunk()` and `_generate_flashcard_batch_for_chunk()`, replace `is_ollama` structured-output condition with capability check such as `model.supports_structured_output`.
3. Set AI2 registry entries `supports_structured_output=False` unless verified.
4. Update `LLMFactory.create_llm_for_model()` so AI2 either uses a compatible `ChatOpenAI` wrapper if dependency exists, or fails explicitly for unsupported LangChain flows.
5. Search for all direct `ChatOllama` generation usages and either keep only embedding/OCR-adjacent usage or move generation callers to AI2.

## Todo List
- [x] Route `ai2` in `ModelManager.generate_content_with_model()`.
- [x] Remove Ollama generation reachability from registry.
- [x] Update structured output condition in generation service.
- [x] Audit `LLMFactory`/LangChain generation usage.
- [x] Keep current quiz/flashcard parser and retry quality gate.

## Success Criteria
- Quiz/flashcard generation calls AI2 `/chat/completions` only.
- No runtime path calls Ollama `/api/generate` for content generation.
- Existing JSON parser still handles AI2 output.

## Risks
- AI2 models may include markdown wrappers or explanations; existing `_extract_json()` should handle common code block cases.

## Security
- Do not send document content to AI2 except explicit generation prompts; embedding/OCR stays local.
