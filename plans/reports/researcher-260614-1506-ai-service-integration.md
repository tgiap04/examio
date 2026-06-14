# Study Report: Examio AI Service Integration Pattern

**Date:** 2026-06-14
**Scope:** Quiz/Flashcard generation + AI chat integration across all three layers
**Sources:** 12 files across `examio-be/apps/ai-service`, `examio-be/apps/exam-service`, `examio-fe`

---

## Summary

Examio has a layered AI generation pipeline: NestJS backend orchestrates file upload + job management, a Python FastAPI service handles OCR/embedding and LLM generation, and the frontend polls for results. Two model providers are supported: AI2 (OpenAI-compatible, default) and Google Gemini (cloud with API key rotation). Generation is async with Redis locks and 10s polling (up to 60 min). Chat uses SSE streaming; quiz/flashcard uses batch + poll.

---

## 1. How AI Generation Currently Works

### End-to-End Flow (Quiz/Flashcard)

```
User uploads file
  → NestJS AIService.generateFromFile()
      1. Upload file to R2 via gRPC
      2. Create UserStorage record (PENDING)
      3. Call processFileAsync() (fire-and-forget)
         → POST /ai/process-file  (OCR + embedding)
         → POST /generate/quiz or /generate/flashcards
      4. Return jobId immediately to FE
  → FE polls getJobStatus(jobId) every 10s
  → When COMPLETED, FE reads quizzes/flashcards from result
```

**Regenerate from existing file:**
- If `processingStatus === COMPLETED`: skip OCR, go straight to generation
- If `PENDING` or `FAILED`: re-trigger full OCR + generation
- Redis lock prevents duplicate same-type job per user

### AI Chat Flow (non-streaming and streaming)

```
User sends message
  → NestJS AIChatService.streamMessage()
      1. Save user message to DB
      2. Trim history (last 4 messages, max 1200 chars each)
      3. Collect linked document IDs → on-demand OCR if needed
      4. POST /chat/stream to Python AI service
      5. Relay SSE chunks to FE (user_message, chunk, done, error)
      6. On stream end: save assistant message to DB
```

### Key Files

| Layer | File | Role |
|---|---|---|
| Python | `ai-service/src/backend/services/generation_service.py` | Core generation logic, chunk batching, LLM calls |
| Python | `ai-service/src/llm/model_manager.py` | Model abstraction (AI2 + Gemini), retries, error normalization |
| Python | `ai-service/src/llm/model_registry.py` | Static model registry (names, providers, capabilities) |
| Python | `ai-service/src/backend/api/generation.py` | FastAPI endpoints `/generate/quiz`, `/generate/flashcards` |
| Python | `ai-service/src/backend/api/chat.py` | FastAPI SSE streaming endpoints `/chat/query`, `/chat/stream` |
| NestJS | `exam-service/src/modules/ai/ai.service.ts` | Orchestrator: upload, lock, process, poll, credit deduction |
| NestJS | `exam-service/src/modules/ai-chat/ai-chat.service.ts` | Chat session management, streaming relay |
| FE | `examio-fe/src/stores/useAIGeneratorStore.ts` | Job polling, localStorage persistence of pending job |
| FE | `examio-fe/src/stores/useAIModelCatalogStore.ts` | Model catalog with lazy singleton fetch |
| FE | `examio-fe/src/apis/aiApi.ts` | REST client for job management |
| FE | `examio-fe/src/apis/aiChatApi.ts` | SSE streaming client for chat |

---

## 2. AI Models Used

### Providers

| Provider | Type | Runtime Name | Used For | Config Env |
|---|---|---|---|---|
| **AI2** | OpenAI-compatible | `Claude Opus 4.6`, `nemotron-3-super-free`, `trinity-large-preview-free` (defaults) | Quiz/flashcard generation, chat | `AI2_API_KEY`, `AI2_BASE_URL`, `AI2_GENERATION_MODEL_NAMES`, `AI2_DEFAULT_MODEL`, `AI2_MAX_TOKENS`, `AI2_TIMEOUT_SECONDS` |
| **Gemini** | Cloud (Google) | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-pro-preview`, etc. (rotated) | Chat + generation fallback | `GEMINI_API_KEY` / `GEMINI_API_KEYS` (comma-separated, rotated), `GEMINI_MODEL` |
| **Gemini Embedding** | Google embedding | `models/gemini-embedding-001` | Document chunk vectorization | `GEMINI_EMBEDDING_MODEL` |

### Model Resolution

```python
# model_registry.py — static registry, built at startup
AI2_GENERATION_MODELS = tuple(
    ModelRegistryEntry(id=model_name, provider='ai2', runtime_model_name=model_name, ...)
    for model_name in AI2_GENERATION_MODEL_NAMES  # from env
)

# model_manager.py — runtime resolver
def resolve_model(model_id: str | None):
    # 1. Check LEGACY_MODEL_ALIASES (e.g. 'ai2' → '__default__' → default model)
    # 2. Look up in ALL_MODELS dict
    # 3. Check task_types includes 'generation'
    # 4. Check enabled flag
```

### AI2 API Call Pattern

```python
# model_manager.py _generate_with_ai2()
url = f"{ai2_info['url']}/chat/completions"
payload = {
    'model': ai2_info['model'],         # runtime_model_name from registry
    'messages': [{'role': 'user', 'content': prompt}],
    'temperature': self.get_temperature(),   # DEFAULT_TEMPERATURE env, default 0.7
    'max_tokens': self.get_ai2_max_tokens(), # AI2_MAX_TOKENS env, default min(4096, cap)
    'stream': False,
}
# 3 retries with exponential backoff for 429/500/502/503/504
```

### Gemini API Call Pattern

```python
# model_manager.py _generate_with_gemini()
# Rotates both API keys (comma-separated) AND model names
for api_key in api_keys:
    for model_name in model_names:
        model = generative_model_cls(model_name)
        response = model.generate_content(
            final_prompt,
            generation_config=GenerationConfig(
                temperature=self.get_temperature(),
                max_output_tokens=self.get_max_tokens(),  # capped at DEFAULT_MAX_TOKENS_CAP
            ),
        )
```

### Frontend Model Selection

- FE calls `GET /ai/models` → NestJS `AIService.getModelCatalog()` → proxies to Python `GET /ai/models`
- Python returns `AIModelCatalog` with `embeddingModel`, `generationModels[]`, `defaultGenerationModel`
- FE stores in `useAIModelCatalogStore` (lazy singleton, cached)
- Selected model passed as `modelType` in generation DTO

---

## 3. JSON Response Format and Validation

### Pydantic Schemas (Python — generation_service.py)

```python
class QuizItem(BaseModel):
    question: str
    options: List[str]          # 4 choices
    answer: str                 # exact match to one option
    sourcePageRange: str | None

class QuizList(BaseModel):
    items: List[QuizItem]

class FlashcardItem(BaseModel):
    question: str               # front (concept/question)
    answer: str                 # back (definition/answer)
    sourcePageRange: str | None

class FlashcardList(BaseModel):
    items: List[FlashcardItem]
```

### Dual Validation Strategy

The generation service uses a **structured output fallback pattern**:

```
1. If model.supports_structured_output == True:
     → Pass QuizList/FlashcardList as response_model to LLM
     → Validate: response_model.model_validate_json(response)
     → If validation fails → fall back to JSON parsing

2. If structured output not supported (AI2 models):
     → Ask model for raw JSON array (no markdown, no preamble)
     → Parse: _extract_json() → _parse_quiz_response() → _normalize_json_items()
     → Normalization includes:
        - Strip A./B./C./D. prefixes from options and answers
        - Answer matching by substring similarity
        - Default to "A" if unresolvable
```

### JSON Extraction

```python
def _extract_json(self, text: str) -> str:
    # 1. Try markdown block: ```json [...] ```
    # 2. Fall back: find first '[' and last ']' in text
```

### API Response Shape

```python
# /generate/quiz returns:
{
    "success": True,
    "history_id": "<uuid>",
    "quizzes": [
        {"question": "...", "options": [...], "answer": "A", "sourcePageRange": "1-3"},
        ...
    ],
    "count": 10
}

# /generate/flashcards returns:
{
    "success": True,
    "history_id": "<uuid>",
    "flashcards": [
        {"question": "...", "answer": "...", "sourcePageRange": "1-3"},
        ...
    ],
    "count": 10
}
```

### NestJS Error Propagation

```python
# ai.service.ts — normalize model errors to user-facing messages
error_codes = {
    'MODEL_UNAVAILABLE'         → "Model hiện tại không khả dụng, thử model khác.",
    'MODEL_INSUFFICIENT_VRAM'   → same,
    'MODEL_RUNTIME_ERROR'       → same,
    'MODEL_CONFIGURATION_ERROR' → "AI2_API_KEY chưa được cấu hình.",
}
```

---

## 4. Backend Calls to Python AI Service

### HTTP Client Pattern

**NestJS → Python (NestJS `HttpService` / Axios):**

```typescript
// ai.service.ts constructor
this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/api';

// Example: process OCR
const ocrResponse = await firstValueFrom(
    this.httpService.post(`${this.aiServiceUrl}/ai/process-file`, payload, {
        timeout: 3600000,  // 60 min for large files
    })
);

// Example: generate content
const generateResponse = await firstValueFrom(
    this.httpService.post(endpoint, { userStorageId, userId, numQuestions, modelType, ... }, {
        timeout: 3600000,
    })
);

// Python side: require X-Internal-Service-Token header
# main.py middleware
expected_token = os.getenv("INTERNAL_SERVICE_TOKEN")
received_token = request.headers.get("x-internal-service-token")
if received_token != expected_token:
    return JSONResponse(status_code=401, ...)
```

**Note:** NestJS does NOT pass the service token in the Axios calls — the Python service middleware requires it. This means the current setup may be broken (401 on generation calls) unless the token is configured.

### Python Service Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai/process-file` | POST | OCR + chunk + embedding |
| `/api/generate/quiz` | POST | Generate quiz questions |
| `/api/generate/flashcards` | POST | Generate flashcards |
| `/api/chat/query` | POST | Non-streaming RAG chat |
| `/api/chat/stream` | POST | SSE streaming RAG chat |
| `/api/ai/models` | GET | Model catalog for FE |
| `/api/ai/clear-cache/{userStorageId}` | DELETE | Clear retrieval cache |
| `/api/tutor/ingest` | POST | Tutor knowledge ingestion |
| `/api/tutor/knowledge-files` | POST/GET/DELETE | Knowledge file CRUD |

---

## 5. Caching Patterns

### Frontend Caching

| Cache | Mechanism | TTL/Invalidation |
|---|---|---|
| Recent uploads list | `storeCache` (in-memory Map) | On force-refresh or mutation |
| Upload history | `storeCache` with key `upload-history-{uploadId}` | On delete |
| Model catalog | `useAIModelCatalogStore` singleton + promise deduplication | No expiry in current code |
| Pending job | `localStorage` key `pending_generation_job` | Cleared on complete/cancel/fail |

### Python AI Service Caching

| Cache | Mechanism | TTL |
|---|---|---|
| AI2 model names list | Module-level dict `_ai2_models_cache` | 5 min (`_AI2_MODELS_CACHE_TTL_SECONDS`) |
| Graph schema | Service init on startup | Persistent (schema only) |
| Tutor storage schema | Service init on startup | Persistent (schema only) |

### NestJS Caching

| Cache | Mechanism | TTL |
|---|---|---|
| Generation lock | Redis `ai:generation:lock:{userId}:{type}` | 30 min (`EXPIRED_TIME.THIRTY_MINUTES`) |

### Generation Concurrency

- `asyncio.Semaphore` limits concurrent LLM calls: `GENERATION_MAX_CONCURRENCY` env (default 3, cap 5)
- Batching: max 12 items per LLM call (`MAX_ITEMS_PER_CALL`)
- Chunk grouping: max 10 source chunks (`MAX_SOURCE_CHUNKS`)

---

## Unresolved Questions

1. **Service token mismatch**: Python `main.py` requires `x-internal-service-token` header, but NestJS `HttpService` calls do not appear to send it. Generation/OCR calls may currently 401.

2. **Redis generation lock collision**: Lock TTL is 30 min but job can run up to 60 min (360 polling attempts × 10s). If the job succeeds, lock is released in `finally`. But if NestJS process crashes mid-job, the lock persists for 30 min — user cannot start new job of same type.

3. **AI2 model `supports_structured_output`**: All AI2 models in the registry have `supports_structured_output=False`, meaning they always use JSON parsing fallback. This is less reliable than Pydantic validation.

4. **Credit deduction race condition**: Credits are deducted synchronously before async `processFileAsync()` fires. If the async job fails, credits are NOT refunded (they're deducted and the job fires). The comment says "skip if fails to let job run" but the actual code throws on credit failure.

5. **No response model in `_generate_with_gemini`**: Gemini calls do not use `response_model` parameter — they rely on text extraction only. This is inconsistent with the structured output path for AI2.