---
title: "Phase 2: Python AI Service — Word Family Endpoint"
description: "Add /generate/word-family endpoint in Python AI service with Pydantic schema, JSON normalization, and dedup logic"
status: pending
priority: P1
effort: 4h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: Phase 1 (schema ready)
- Reports: [ai-service-integration](../reports/researcher-260614-1506-ai-service-integration.md)

## Overview

**Date:** 2026-06-14
**Description:** Add `/generate/word-family` endpoint in Python AI service. Handles: Pydantic schema validation, JSON normalization, AI generation with dedup based on user history.
**Priority:** P1
**Status:** pending

## Key Insights

- AI2 models (Claude Opus 4.6, etc.) do NOT support structured output — always use text extraction + normalization fallback
- Existing pattern: `_extract_json()` → `_parse_quiz_response()` → `_normalize_json_items()`
- Same model selection as quiz/flashcard generation (`AI2_GENERATION_MODEL_NAMES`)
- Deduplication: check user's previously generated root words before generating new ones

## Requirements

### Functional
- `POST /api/generate/word-family` endpoint
- Input: `{ categorySlug: string, categoryName: string, numWords: int, excludeRootWords: string[] }`
- Output: `{ success: bool, data: WordFamilyData, error?: string }`
- Pydantic schema validation + text extraction fallback
- JSON normalization layer before returning
- Dedup: exclude previously generated root words for this user

### Non-functional
- Use same AI models as quiz/flashcard generation
- Return within same timeout as other generation endpoints
- Cache-friendly response shape

## Architecture

### Pydantic Schemas

```python
class Affix(BaseModel):
    prefix: str = ""
    root: str
    suffix: str = ""

class WordFamilyWord(BaseModel):
    word: str
    pos: str  # "noun" | "verb" | "adjective" | "adverb"
    meaningEn: str
    meaningVi: str
    example: str
    affix: Affix

class WordFamilyData(BaseModel):
    rootWord: str
    categorySlug: str
    words: List[WordFamilyWord]

class WordFamilyRequest(BaseModel):
    categorySlug: str
    categoryName: str
    numWords: int = 10
    excludeRootWords: List[str] = []

class WordFamilyResponse(BaseModel):
    success: bool
    data: Optional[WordFamilyData]
    error: Optional[str] = None
```

### AI Prompt Design

```
You are an English vocabulary expert specializing in Word Family analysis.

Given the category "{categoryName}" (slug: {categorySlug}), generate {numWords} root words and their word family variations.

Requirements:
- Each root word must be common and relevant to the category "{categoryName}"
- For each root word, provide 3-5 word family variations (noun, verb, adjective, adverb forms)
- Each variation must include:
  - word: the derived word
  - pos: part of speech (noun/verb/adjective/adverb)
  - meaningEn: English definition
  - meaningVi: Vietnamese definition
  - example: an example sentence using the word
  - affix: {prefix, root, suffix} — clearly identify the affix components

Exclude these root words that have already been generated: {excludeRootWords}

Return ONLY a valid JSON object matching this schema:
{{
  "rootWord": "act",
  "categorySlug": "{categorySlug}",
  "words": [
    {{
      "word": "action",
      "pos": "noun",
      "meaningEn": "the process of doing something",
      "meaningVi": "hành động",
      "example": "She took action immediately.",
      "affix": {{"prefix": "", "root": "act", "suffix": "ion"}}
    }}
  ]
}}

Return ONLY the JSON, no markdown, no explanation.
```

### Generation Flow

```
1. Validate request with Pydantic
2. Build prompt with category info + exclude list
3. Call LLM (AI2 or Gemini)
4. Extract JSON from response text
5. Normalize: strip affix prefixes (A./B./, etc.), validate pos values
6. Validate against Pydantic schema
7. If validation fails: retry once with corrected prompt
8. Return WordFamilyResponse
```

## Related Code Files

### Files to Modify
- `examio-be/apps/ai-service/src/backend/api/generation.py` — add endpoint
- `examio-be/apps/ai-service/src/backend/services/generation_service.py` — add generation logic

### Files to Create
- `examio-be/apps/ai-service/src/backend/schemas/word_family.py` — Pydantic schemas

## Implementation Steps

1. **Read existing generation.py** — understand endpoint structure, routing, error handling
2. **Create `word_family.py` schemas** — Affix, WordFamilyWord, WordFamilyData, WordFamilyRequest, WordFamilyResponse
3. **Add `POST /api/generate/word-family` endpoint** in `generation.py`:
   - Route: `/generate/word-family`
   - Auth: check `x-internal-service-token` header
   - Parse request body → `WordFamilyRequest`
   - Call generation service
4. **Add `generate_word_family()` method** in `generation_service.py`:
   - Build prompt with category name + exclude list
   - Call LLM via `ModelManager`
   - Extract JSON via `_extract_json()`
   - Normalize via `_normalize_word_family()` (new method)
   - Validate via Pydantic `WordFamilyData.model_validate()`
   - Retry once on validation failure
5. **Implement `_normalize_word_family()`**:
   - Strip A./B./C./D. prefixes from words
   - Validate `pos` values (only allow noun/verb/adjective/adverb)
   - Validate `affix.root` matches `rootWord`
   - Ensure `affix.prefix + affix.root + affix.suffix` approximates the word
6. **Test locally** — call endpoint with sample category, verify JSON output
7. **Run ruff check + black** — format code

## Todo List

- [ ] Create `word_family.py` Pydantic schemas
- [ ] Add `POST /generate/word-family` endpoint in `generation.py`
- [ ] Add `generate_word_family()` method in `generation_service.py`
- [ ] Implement `_normalize_word_family()` normalization
- [ ] Test endpoint with sample request
- [ ] Run ruff check + black

## Success Criteria

- Endpoint returns valid `WordFamilyData` JSON matching schema
- JSON normalization handles malformed AI output gracefully
- Dedup excludes user-provided root words from generation
- Pydantic validation fails gracefully with retry
- Same model selection as quiz/flashcard generation

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI returns invalid JSON | High | Medium | Retry once, fallback to partial data |
| Affix parsing incorrect | Medium | Low | Validate structure, not exact string match |
| Dedup not working | Medium | High | Pass exclude list in prompt, verify in test |
| Timeout on large generation | Low | Medium | Limit numWords to 20 max |

## Security Considerations

- Internal service token required (`x-internal-service-token` header)
- No user data exposed in prompt (only category info)
- Rate limiting handled by NestJS layer (generation lock in Redis)

## Next Steps

- Phase 3: NestJS backend WordFamily module (calls this endpoint)
- Phase 4: Frontend UI (consumes this endpoint)
