---
title: "Phase 1: Database & Prisma Migration"
description: "Add WordFamilyCategory, WordFamily, UserSavedWordFamily models to Prisma schema + create seed file for 10 categories"
status: completed
priority: P1
effort: 3h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: None
- Reports: [flashcard-module-scan](../reports/researcher-260614-1506-flashcard-module-scan.md), [schema-flashcard-subject](../reports/researcher-260614-1516-schema-flashcard-subject.md)

## Overview

**Date:** 2026-06-14
**Description:** Add 3 new Prisma models for Word Family + create seed file for 10 default categories.
**Priority:** P1 — Must complete before all other phases.
**Status:** pending

## Key Insights

- Join-table pattern (`DetailsFlashCard`) already proven in codebase — follow same pattern
- `SubjectCategory` + `Subject` models exist but are AI teacher-specific (have `systemPrompt`) — do NOT reuse
- Seed file pattern: `PrismaClient` + `upsert by slug` idempotent — follow `subject.seed.ts` pattern
- Category `imageUrl` is R2 URL — admin uploads via R2 service before saving category

## Requirements

### Functional
- 3 new Prisma models: `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily`
- Seed file with 10 categories (Vietnamese names, slugs, descriptions, imageUrl placeholder)
- Unique constraints: `categorySlug + rootWord` on `WordFamily`, `userId + wordFamilyId` on `UserSavedWordFamily`
- Indexes for O(1) lookups: `categorySlug` on `WordFamily`, `userId` on `UserSavedWordFamily`

### Non-functional
- O(1) lookup for user saved word families (no N+1)
- Idempotent seed (safe to re-run)
- Soft-delete consideration: `isActive` flag on categories

## Architecture

### New Models

```prisma
// Word Family Category (seeded, admin-managed)
model WordFamilyCategory {
  id          String   @id @default(cuid())
  name        String   @unique                    // "Mua sắm, nhà hàng"
  slug        String   @unique                    // "shopping-restaurant"
  description String?
  imageUrl    String?                           // R2 URL (AI-generated thumbnail)
  order       Int      @default(0)
  isActive    Boolean  @default(true)
  wordFamilies WordFamily[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([isActive, order])
}

// Cached word family data (AI-generated, global)
model WordFamily {
  id           String   @id @default(cuid())
  rootWord     String                          // "act"
  categorySlug String                          // "shopping-restaurant"
  data         Json                            // WordFamilyWord[] structure
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([rootWord, categorySlug])
  @@index([categorySlug])
  @@index([rootWord])
}

// User's saved word families (reference-based, O(1) lookup)
model UserSavedWordFamily {
  id           String   @id @default(cuid())
  userId       String
  wordFamilyId String
  savedAt      DateTime @default(now())
  @@unique([userId, wordFamilyId])
  @@index([userId])
}

// Add relation to User model:
User {
  ...
  savedWordFamilies UserSavedWordFamily[]
}
```

### WordFamilyWord JSON Schema (stored in `data` field)

```typescript
interface WordFamilyWord {
  word: string;               // "action"
  pos: string;                // "noun" | "verb" | "adjective" | "adverb"
  meaningEn: string;          // "the process of doing something"
  meaningVi: string;          // "hành động"
  example: string;            // "She took action immediately."
  affix: {
    prefix: string;          // "" or "re"
    root: string;            // "act"
    suffix: string;          // "ion"
  };
}

interface WordFamilyData {
  rootWord: string;           // "act"
  categorySlug: string;       // "shopping-restaurant"
  words: WordFamilyWord[];    // 10-20 variants
}
```

## Related Code Files

### Files to Modify
- `examio-be/libs/database/src/schema.prisma` — add 3 models + User relation

### Files to Create
- `examio-be/libs/database/src/seed/word-family-category.seed.ts` — seed 10 categories

## Implementation Steps

1. **Read current schema.prisma** — find where to insert new models, check User relation placement
2. **Add `WordFamilyCategory` model** — with `name`, `slug`, `description`, `imageUrl`, `order`, `isActive`, `@@index([isActive, order])`
3. **Add `WordFamily` model** — with `rootWord`, `categorySlug`, `data Json`, `@@unique([rootWord, categorySlug])`, `@@index([categorySlug])`, `@@index([rootWord])`
4. **Add `UserSavedWordFamily` model** — with `userId`, `wordFamilyId`, `@@unique([userId, wordFamilyId])`, `@@index([userId])`
5. **Add `savedWordFamilies` relation to `User` model** — `UserSavedWordFamily[]`
6. **Create seed file** `word-family-category.seed.ts`:
   - 10 categories (shopping-restaurant, traffic-construction, workplace-leisure, position-title, location-place, meeting-work-office, travel-entertainment, banking-post-office, announcement-advertising, news-broadcasting-travel)
   - Use `toSlug()` helper + `upsert` for idempotency
   - ImageUrl: null (will be updated by admin after AI generation)
7. **Update `seed.ts`** — import and call `wordFamilyCategorySeed()`
8. **Run `prisma validate`** — check schema syntax
9. **Run `prisma generate`** — generate Prisma client
10. **Run seed locally** — verify 10 categories created

## Todo List

- [x] Add `WordFamilyCategory` model to schema.prisma
- [x] Add `WordFamily` model to schema.prisma
- [x] Add `UserSavedWordFamily` model to schema.prisma
- [x] Add `savedWordFamilies` relation to User model
- [x] Create `word-family-category.seed.ts` with 10 categories
- [x] Update `seed.ts` to call new seed
- [x] Run `prisma validate` + `prisma generate`
- [ ] Run seed locally and verify

## Success Criteria

- `prisma validate` passes with no errors
- `prisma generate` produces valid client
- Seed creates exactly 10 categories with correct slugs
- Seed is idempotent (re-running doesn't duplicate)
- Unique constraints enforced: `(rootWord, categorySlug)` on `WordFamily`, `(userId, wordFamilyId)` on `UserSavedWordFamily`
- All indexes present for O(1) lookups

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema conflict with existing models | Low | High | Place new models after existing, verify unique field names |
| Seed idempotency failure | Low | Medium | Use `upsert` with `slug` as unique key |
| Missing relation on User model | Low | High | Verify User model has `savedWordFamilies` relation after generation |

## Security Considerations

- Category `imageUrl` stored as R2 URL — no file upload in this phase
- All models use `@default(cuid())` for IDs — no sequential IDs exposed
- No auth checks needed at DB level (handled at API layer)

## Next Steps

- Phase 2: Python AI Service endpoint for Word Family generation
- Phase 3: NestJS backend module (depends on Phase 1 schema)
