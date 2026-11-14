# Phase 02 — Implement OpenAI-Compatible AI2 Client

## Overview
Priority: critical  
Status: implemented  
Add a small OpenAI-compatible HTTP client for AI2 generation and model listing.

## Context Links
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py`
- User-provided API base: `https://ai2.devt.vn/`

## Requirements
- Use OpenAI-compatible paths:
  - `GET {AI2_BASE_URL}/models`
  - `POST {AI2_BASE_URL}/chat/completions`
- Normalize `AI2_BASE_URL`: accept either `https://ai2.devt.vn` or `https://ai2.devt.vn/v1`, but requests should target OpenAI-compatible `/v1` paths exactly once.
- Use bearer auth from env `AI2_API_KEY`.
- Support non-streaming responses only for generation.
- Support system prompt + user prompt.
- Preserve retry and error normalization behavior similar to current Ollama/Gemini handling.

## Request Shape
```json
{
  "model": "minimax-m2.5-free",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "stream": false
}
```

## Implementation Steps
1. Add helper `get_ai2_info(model_id)` in `ModelManager`.
2. Add `_fetch_ai2_model_names()` using `GET /models`.
3. Add `_generate_with_ai2(prompt, model_id, system_prompt)` using `POST /chat/completions`.
4. Parse response from `choices[0].message.content`.
5. Map HTTP 401/403 to missing/invalid key, 404 to unavailable model/path, 429/5xx to retryable runtime errors.
6. Do not pass Ollama `format` JSON schema to AI2 unless API support is proven; parse JSON from text like Gemini.

## Todo List
- [x] Add AI2 base URL normalization.
- [x] Add model listing call.
- [x] Add chat completions call.
- [x] Add retries and timeout from env.
- [x] Add safe error messages without leaking key.

## Success Criteria
- Generation call works with selected AI2 model.
- Availability check can mark missing AI2 models as disabled in catalog.
- API key never appears in logs.

## Risks
- Some free models may not support large `max_tokens`; keep env configurable and surface provider errors clearly.

## Security
- `AI2_API_KEY` must only come from env/secrets.
