# Phase 4: Exam-Service Word Family API

## Context
- Exam-service modules: `examio-be/apps/exam-service/src/modules/`
- Flashcard service: `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts`
- Redis module: `examio-be/libs/redis/src/`
- AI orchestrator: `examio-be/apps/exam-service/src/modules/ai/ai.service.ts`

## Overview
Build the full Word Family API in exam-service: category listing, word family generation (orchestrates Python AI), word family details, user collection management, and flashcard bridge creation.

**Priority:** P1 | **Status:** pending | **Effort:** 5h

## Key Insights
- Module structure follows flashcardset pattern: controller + service + repository + dto
- Uses `PrismaService` for DB access, `RedisService` for caching
- Bridge to FlashCard uses same transaction pattern as `saveHistoryToFlashcardSet`
- Gateway proxy for exam-service already handles all routes under `/exam-service/api/*`

## Requirements
- GET `/word-family/categories` — public list of active categories
- GET `/word-family/categories/:id/words` — get or generate words for category
- GET `/word-family/words/:id` — get single word family detail
- POST `/word-family/words/:id/save` — save word to user collection
- DELETE `/word-family/words/:id/save` — remove from user collection
- GET `/word-family/collection` — get user's saved word families
- POST `/word-family/create-flashcard` — bridge: create flashcard deck from selected words

## Architecture

### API Endpoints (under exam-service)
```
GET    /api/word-family/categories
GET    /api/word-family/categories/:id/words
GET    /api/word-family/words/:id
POST   /api/word-family/words/:id/save
DELETE /api/word-family/words/:id/save
GET    /api/word-family/collection
POST   /api/word-family/create-flashcard
```

### Cache Strategy
- **Redis** (BE): `word-family:categories` (TTL 1h), `word-family:words:{categoryId}` (TTL 24h)
- **Zustand** (FE): TTL 5min (handled in Phase 5-6)
- **Invalidation**: On category CUD (admin), invalidate categories cache. On generation, set words cache.

### FlashCard Bridge Flow
```
User selects words → POST /word-family/create-flashcard
  → Validate user owns selected word families
  → In transaction:
    1. Create FlashCardSet (title: "Gia đình từ: [Root word]")
    2. For each selected word: create FlashCard (front: word, back: pos+meaning+example)
    3. Create DetailsFlashCard links
    4. Create WordFamilyWordToFlashCard links
  → Invalidate flashcard set caches
  → Return new flashcard set ID
```

### Repository Pattern
Same as `FlashCardSetRepository` — extend base repository for caching.

## Files to Create
- `examio-be/apps/exam-service/src/modules/word-family/word-family.module.ts`
- `examio-be/apps/exam-service/src/modules/word-family/word-family.controller.ts`
- `examio-be/apps/exam-service/src/modules/word-family/word-family.service.ts`
- `examio-be/apps/exam-service/src/modules/word-family/word-family.repository.ts`
- `examio-be/apps/exam-service/src/modules/word-family/dto/generate-words.params.ts`
- `examio-be/apps/exam-service/src/modules/word-family/dto/create-flashcard.body.ts`
- `examio-be/apps/exam-service/src/modules/word-family/dto/collection-query.dto.ts`

## Files to Modify
- `examio-be/apps/exam-service/src/exam-service.module.ts` — register `WordFamilyModule`

## Implementation Steps

1. Create `WordFamilyModule`:
   ```typescript
   @Module({
     imports: [DatabaseModule, RedisModule, R2Module, FinanceClientModule],
     controllers: [WordFamilyController],
     providers: [WordFamilyService, WordFamilyRepository, PrismaService],
     exports: [WordFamilyService],
   })
   export class WordFamilyModule {}
   ```

2. Create `WordFamilyRepository` extending base repository:
   - Cache invalidation helpers for categories and words
   - Same pattern as `FlashCardSetRepository`

3. Create DTOs with Zod:
   - `GenerateWordsParamsDto`: categoryId (string), numRoots (number, default 10, max 20)
   - `CreateFlashcardBodyDto`: wordFamilyIds (string[]), title? (string, optional override)
   - `CollectionQueryDto`: page, limit

4. Implement `WordFamilyService`:
   - `getCategories()` — Redis cache → DB query → cache result
   - `getCategoryWords(categoryId, numRoots)` — Redis cache → check DB → call Python AI → save to DB → cache
   - `getWordDetail(wordId)` — DB query with rootWord include
   - `saveWordToCollection(userId, wordId)` — upsert UserWordFamily
   - `removeWordFromCollection(userId, wordId)` — delete UserWordFamily
   - `getUserCollection(userId, page, limit)` — paginated query with word + rootWord + category
   - `createFlashcardDeck(userId, wordFamilyIds, title?)` — transaction following `saveHistoryToFlashcardSet` pattern

5. Implement `WordFamilyController` with guards:
   - Public: `GET /categories`
   - Auth required: all other endpoints
   - Subscription check for generation endpoint

6. Register in `ExamServiceModule`

7. Test all endpoints via gateway proxy

## Todo
- [ ] Create word-family module directory structure
- [ ] Implement WordFamilyRepository
- [ ] Create DTOs with Zod validation
- [ ] Implement getCategories with Redis caching
- [ ] Implement getCategoryWords with AI orchestration
- [ ] Implement getWordDetail
- [ ] Implement saveWordToCollection / removeWordFromCollection
- [ ] Implement getUserCollection with pagination
- [ ] Implement createFlashcardDeck (bridge)
- [ ] Create WordFamilyController with guards
- [ ] Create WordFamilyModule
- [ ] Register in ExamServiceModule
- [ ] Test all endpoints via curl through gateway
- [ ] Verify Redis cache works correctly

## Success Criteria
- All 7 endpoints respond correctly through gateway
- Category listing returns from Redis cache on second call
- Word generation calls Python AI and saves to DB
- FlashCard bridge creates valid FlashCardSet + FlashCards + join table links
- User collection operations work with proper ownership checks
- Redis cache invalidation works on write operations
- No N+1 queries (use `include` for all relations)

## Risk Assessment
- FlashCard bridge transaction could be large (many words) — batch in groups of 50
- Python AI service timeout → 60s timeout with single retry
- Redis cache stampede → use `SETNX` lock pattern

## Security Considerations
- All authenticated endpoints verify user ownership
- FlashCard bridge checks subscription status
- Input validation on all DTOs (Zod)
- Rate limit generation to 1 per user per category per 24h

## Next Steps
- Phase 5: Frontend category list + tree/list UI (uses this API)
- Phase 6: Frontend save + flashcard bridge (uses this API)
