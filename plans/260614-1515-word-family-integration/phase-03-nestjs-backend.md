---
title: "Phase 3: NestJS Backend — WordFamily Module"
description: "Add WordFamilyModule in exam-service: controller, service, DTOs, Redis cache, bridge to FlashCard creation"
status: pending
priority: P1
effort: 5h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: Phase 1 (schema), Phase 2 (AI endpoint)
- Reports: [flashcard-module-scan](../reports/researcher-260614-1506-flashcard-module-scan.md)

## Overview

**Date:** 2026-06-14
**Description:** Add `WordFamilyModule` in exam-service with full CRUD, Redis cache, AI generation orchestration, and FlashCard bridge.
**Priority:** P1
**Status:** pending

## Key Insights

- Follow existing module pattern: `*Controller` → `*Service` → `*Repository` (Prisma)
- Use `BaseRepository` pattern with Redis cache invalidation
- FlashCard bridge: **Async (job queue)** — tạo job → trả jobId → user poll. Follow existing async pattern: Redis lock → fire-and-forget → poll status → complete. NOT sync.
- AI generation: call Python endpoint → save to DB → cache in Redis
- Deduplication: check `WordFamily` table for existing root words before calling AI

## Requirements

### Functional
- **Category CRUD** (admin-only): `GET /word-family/categories`, `POST /word-family/categories`, `PUT /word-family/categories/:id`, `DELETE /word-family/categories/:id`
- **Root words by category**: `GET /word-family/categories/:slug/roots` — returns list of root words in category (from DB cache, or call AI if empty)
- **Word Family detail**: `GET /word-family/:rootWord` — returns full `WordFamilyData` with all words
- **Generate word family**: `POST /word-family/generate` — call AI, save to DB, cache in Redis
- **Save to collection**: `POST /word-family/:id/save` — save reference to user's collection
- **Get saved collections**: `GET /word-family/saved` — user's saved word families
- **FlashCard bridge**: `POST /word-family/:id/to-flashcard` — convert selected words to FlashCard deck

### Non-functional
- O(1) lookup for user saved word families
- Redis cache: TTL 30 min for word family data
- FE cache: Zustand TTL 5 min (handled in Phase 4)
- No N+1 queries — use `include` for relations
- Cache invalidation on CUD operations

## Architecture

### Module Structure

```
exam-service/src/modules/word-family/
├── word-family.module.ts           # Module definition
├── word-family.controller.ts       # HTTP endpoints
├── word-family.service.ts         # Business logic
├── word-family.repository.ts      # Prisma access + cache
├── word-family-bridge.service.ts  # FlashCard bridge logic
├── dto/
│   ├── generate-word-family.dto.ts
│   ├── word-family-response.dto.ts
│   ├── save-to-collection.dto.ts
│   └── to-flashcard.dto.ts
└── interfaces/
    └── word-family.interface.ts
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/word-family/categories` | public | List all active categories |
| POST | `/word-family/categories` | Admin | Create category |
| PUT | `/word-family/categories/:id` | Admin | Update category |
| DELETE | `/word-family/categories/:id` | Admin | Soft-delete category |
| GET | `/word-family/categories/:slug/roots` | Bearer | Get root words in category |
| GET | `/word-family/:rootWord` | Bearer | Get full word family |
| POST | `/word-family/generate` | Bearer | Generate word family via AI |
| POST | `/word-family/:id/save` | Bearer | Save to user collection |
| GET | `/word-family/saved` | Bearer | Get user's saved word families |
| DELETE | `/word-family/saved/:id` | Bearer | Remove from collection |
| POST | `/word-family/:id/to-flashcard` | Bearer | Create flashcard deck |

### Cache Strategy

```
Word Family Cache (Redis):
  Key: "wf:category:{slug}"
  Value: { rootWords: string[], generatedAt: timestamp }
  TTL: 30 min

Word Family Detail Cache (Redis):
  Key: "wf:detail:{rootWord}"
  Value: WordFamilyData (JSON)
  TTL: 30 min

Cache invalidation:
  - On generate: DEL "wf:category:{slug}" + DEL "wf:detail:{rootWord}"
  - On category update: DEL "wf:category:{slug}"
```

### FlashCard Bridge Mapping

```typescript
// WordFamilyWord → FlashCard
interface FlashCardCreate {
  question: string;  // HTML: <strong>{word}</strong> <em>({pos})</em>
  answer: string;   // HTML: <p>{meaningVi}</p><p><em>"{example}"</em></p>
}

// WordFamily → FlashCardSet
interface FlashCardSetCreate {
  title: string;    // "Gia đình từ: {rootWord}"
  userId: string;
  isPublic: false;
  description: string; // Category name + root word
}
```

## Related Code Files

### Files to Create
- `examio-be/apps/exam-service/src/modules/word-family/` — entire module

### Files to Modify
- `examio-be/apps/exam-service/src/app.module.ts` — import WordFamilyModule
- `examio-be/apps/exam-service/src/modules/index.ts` — export WordFamilyModule
- `examio-be/apps/gateway-service/src/controllers/` — add proxy routes for word-family

## Implementation Steps

1. **Read existing flashcardset module** — understand pattern: controller → service → repository
2. **Create `word-family.module.ts`** — module with Prisma, Redis, AI service imports
3. **Create `word-family.repository.ts`**:
   - CRUD for `WordFamilyCategory`
   - CRUD for `WordFamily`
   - CRUD for `UserSavedWordFamily`
   - Use `include` for relations (no N+1)
   - Implement Redis cache get/set/del
4. **Create `word-family.service.ts`**:
   - `getCategories()` — list active categories
   - `getRootWords(categorySlug)` — check cache → DB → return
   - `getWordFamily(rootWord)` — check cache → DB → return
   - `generateWordFamily(dto)` — dedup check → call AI → save → cache
   - `saveToCollection(wordFamilyId, userId)` — create UserSavedWordFamily
   - `getSavedCollections(userId)` — O(1) lookup with include
5. **Create `word-family-bridge.service.ts`**:
   - `createFlashcardDeck(wordFamilyId, selectedWordIds, userId)`:
     - Get WordFamily data
     - Filter selected words
     - `Prisma.$transaction([create FlashCardSet, create N FlashCard, create N DetailsFlashCard])`
     - Return created deck ID
6. **Create `word-family.controller.ts`**:
   - All endpoints listed in API table
   - Use `AuthGuard` for user endpoints
   - Use `AdminGuard` for category CRUD
7. **Create DTOs** with Zod validation (follow existing pattern)
8. **Update `app.module.ts`** — import WordFamilyModule
9. **Add gateway proxy routes** — `GET/POST /api/v1/word-family/*` → exam-service
10. **Run tests** — verify all endpoints work

## Todo List

- [ ] Create `word-family.module.ts`
- [ ] Create `word-family.repository.ts` with Redis cache
- [ ] Create `word-family.service.ts` with all business logic
- [ ] Create `word-family-bridge.service.ts` for FlashCard conversion
- [ ] Create `word-family.controller.ts` with all endpoints
- [ ] Create DTOs with Zod validation
- [ ] Update `app.module.ts`
- [ ] Add gateway proxy routes
- [ ] Run tests

## Success Criteria

- All endpoints return correct data shape
- Redis cache works: same request within 30 min hits cache
- Cache invalidation works on CUD operations
- FlashCard bridge creates valid FlashCardSet + FlashCards + DetailsFlashCards
- No N+1 queries (verified via Prisma query logging)
- O(1) lookup for user saved collections

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis cache stale data | Medium | Medium | TTL 30 min + explicit invalidation on CUD |
| FlashCard bridge failure | Low | High | Transaction rollback on partial failure |
| AI endpoint timeout | Medium | Medium | Async job pattern (like existing quiz generation) |
| Gateway proxy missing route | Medium | High | Add all routes, test with curl |

## Security Considerations

- Admin endpoints require `AdminGuard`
- User endpoints require `AuthGuard` (JWT + session)
- FlashCard bridge only creates decks for authenticated user
- No cross-user data access (verified via userId filter)

## Next Steps

- Phase 4: Frontend UI + Store (consumes these endpoints)
- Phase 5: Admin panel (uses admin endpoints)
