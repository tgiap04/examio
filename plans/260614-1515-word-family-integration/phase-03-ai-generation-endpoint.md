# Phase 3: AI Generation Endpoint (Python + NestJS Orchestrator)

## Context
- Python AI API: `kmaedu-be/apps/ai-service/src/backend/api/generation.py`
- Python generation service: `kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`
- NestJS AI module: `kmaedu-be/apps/exam-service/src/modules/ai/`
- Prisma schema: `kmaedu-be/libs/database/src/schema.prisma`

## Overview
Add AI-powered Word Family generation: given a category + number of root words, generate root words and their family variations. Two-step process: (1) generate root words, (2) generate family words for each root. Includes JSON normalization and Redis caching.

**Priority:** P1 | **Status:** pending | **Effort:** 6h

## Key Insights
- AI2 models lack structured output → use Pydantic schema + text extraction fallback (existing pattern from `generation_service.py`)
- Two-step generation: roots first, then families per root (avoids token limit issues)
- NestJS orchestrator handles Redis lock, DB persistence, and fallback to cached data
- Same model selection pattern as quiz/flashcard (`AI2_DEFAULT_MODEL` + fallback list)

## Requirements
- Python endpoint: `POST /generate/word-family` — accepts category context + numRoots
- Python response: `{ success, roots: [{ word, meaning, words: [WordFamilyWord] }] }`
- NestJS orchestrator: `POST /exam-service/api/word-family/generate/:categoryId`
- Cache generated results in Redis (TTL 24h) and DB (`WordFamilyRootWord` + `WordFamilyWord`)
- Redis lock to prevent duplicate generation per user
- JSON normalization layer before DB save

## Architecture

### Data Flow
```
FE → NestJS orchestrator → Python AI service → LLM call → Pydantic validate → normalize → save to DB → Redis cache → return to FE
```

### Python AI Contract

Request:
```json
{
  "categoryName": "Mua sắm, nhà hàng",
  "categoryDescription": "Vocabulary for shopping and restaurants",
  "numRoots": 10,
  "modelType": "optional-model-id"
}
```

Response (after normalization):
```json
{
  "success": true,
  "roots": [
    {
      "word": "shop",
      "meaning": "cửa hàng",
      "words": [
        {
          "word": "shop",
          "pos": "noun",
          "meaningEn": "a place where goods are sold",
          "meaningVi": "cửa hàng",
          "example": "I bought this at the shop.",
          "prefix": "",
          "root": "shop",
          "suffix": ""
        },
        {
          "word": "shopper",
          "pos": "noun",
          "meaningEn": "a person who shops",
          "meaningVi": "người mua sắm",
          "example": "The shoppers lined up outside.",
          "prefix": "",
          "root": "shop",
          "suffix": "per"
        }
      ]
    }
  ]
}
```

### NestJS Orchestrator Flow
1. Check Redis cache → return if hit
2. Acquire Redis lock (same pattern as `acquireGenerationLock`)
3. Call Python AI service via HTTP
4. Normalize JSON response (handle malformed AI output)
5. Save to DB in transaction: `WordFamilyRootWord` + `WordFamilyWord` records
6. Save to Redis cache (TTL 24h)
7. Release lock
8. Return result

### JSON Normalization Layer
```python
# In Python service - same pattern as generation_service.py
def normalize_word_family_response(raw_text: str) -> dict:
    """Extract JSON from AI response, handle markdown fences, fix common issues"""
    # 1. Try direct JSON parse
    # 2. Try extracting from ```json ... ``` fences
    # 3. Try regex extraction of JSON array/object
    # 4. Return fallback with error details
```

## Files to Create
- `kmaedu-be/apps/ai-service/src/backend/api/word_family.py` — Python endpoint
- `kmaedu-be/apps/ai-service/src/backend/services/word_family_service.py` — generation logic
- `kmaedu-be/apps/ai-service/src/backend/prompts/word_family_prompt.py` — prompt templates
- `kmaedu-be/apps/exam-service/src/modules/word-family/dto/generate-word-family.dto.ts`

## Files to Modify
- `kmaedu-be/apps/ai-service/src/backend/main.py` — register word_family router
- `kmaedu-be/apps/exam-service/src/modules/word-family/word-family.service.ts` — orchestrator (create in Phase 4)
- `kmaedu-be/apps/exam-service/src/modules/word-family/word-family.controller.ts` — endpoint (create in Phase 4)

## Implementation Steps

1. Create prompt template in `word_family_prompt.py`:
   - System prompt: "You are an English vocabulary teacher. Generate word families for the given category."
   - User prompt: category name + description + numRoots
   - Output format: JSON with roots and their word variations
   - Include examples of correct output format

2. Create `WordFamilyGenerationService` in Python:
   - `generate_word_family(category_name, description, num_roots, model_type)`
   - Call LLM with prompt
   - Parse response with JSON normalization
   - Validate with Pydantic `WordFamilyResponse` model
   - Return normalized response

3. Create Pydantic models:
   ```python
   class WordFamilyWordItem(BaseModel):
       word: str
       pos: str  # "noun" | "verb" | "adjective" | "adverb"
       meaningEn: str
       meaningVi: str
       example: str
       prefix: str = ""
       root: str
       suffix: str = ""

   class WordFamilyRootItem(BaseModel):
       word: str
       meaning: str
       words: List[WordFamilyWordItem]

   class WordFamilyResponse(BaseModel):
       roots: List[WordFamilyRootItem]
   ```

4. Register router in `main.py`:
   ```python
   from src.backend.api.word_family import router as word_family_router
   app.include_router(word_family_router, prefix="/generate", tags=["word-family"])
   ```

5. Create NestJS DTO `GenerateWordFamilyDto`:
   - categoryId: string (required)
   - numRoots: number (default 10, max 20)

6. Implement NestJS orchestrator (Phase 4 will expand this):
   - Redis cache check
   - HTTP call to Python service
   - JSON normalization fallback
   - DB save in transaction
   - Redis cache set

## Todo
- [ ] Create word_family_prompt.py with prompt templates
- [ ] Create Pydantic models for validation
- [ ] Implement WordFamilyGenerationService in Python
- [ ] Create /generate/word-family endpoint in Python
- [ ] Register router in main.py
- [ ] Test Python endpoint independently with curl
- [ ] Create NestJS DTO for generate endpoint
- [ ] Implement Redis cache check in NestJS orchestrator
- [ ] Implement HTTP call to Python service
- [ ] Implement JSON normalization fallback
- [ ] Implement DB save in transaction
- [ ] Test full flow: FE → NestJS → Python → DB → Redis

## Success Criteria
- Python endpoint returns valid JSON matching `WordFamilyResponse` schema
- JSON normalization handles malformed AI output (markdown fences, extra text)
- NestJS orchestrator caches result in Redis (verify with Redis CLI)
- DB contains generated root words and family words after generation
- Duplicate calls within TTL return cached result (no re-generation)
- Redis lock prevents concurrent generation per user

## Risk Assessment
- AI may return inconsistent POS values → validate against allowed set (noun/verb/adjective/adverb)
- AI may generate fewer roots than requested → accept partial results, log warning
- Token limit exceeded for large numRoots → split into batches of 5 roots
- Python service timeout → NestJS should have 60s timeout with retry once

## Security Considerations
- Generation requires active subscription (check via `FinanceClientService` in NestJS)
- Rate limit: 1 generation per user per category per 24h (Redis lock)
- Input sanitization on category name/description (prevent prompt injection)

## Next Steps
- Phase 4: Full Exam-Service Word Family API (controller + routes + cache)
- Phase 3 and Phase 4 are tightly coupled — implement together
