# Phase 1: Prisma Schema + Seed

## Context
- Schema: `examio-be/libs/database/src/schema.prisma`
- Seed entry: `examio-be/libs/database/prisma/seed.ts`
- Reference pattern: `examio-be/libs/database/src/seed/subject.seed.ts`

## Overview
Add Word Family tables to Prisma schema and create seed file for 10 default categories.

**Priority:** P1 | **Status:** pending | **Effort:** 4h

## Key Insights
- Follow existing `SubjectCategory` + `Subject` taxonomy pattern
- Use join table `WordFamilyWordToFlashCard` for bridge (same shape as `DetailsFlashCard`)
- Seed uses `upsert` for idempotency (same as subject.seed.ts)

## Requirements
- 4 new models: `WordFamilyCategory`, `WordFamilyRootWord`, `WordFamilyWord`, `UserWordFamily`
- 1 join table: `WordFamilyWordToFlashCard`
- Seed 10 categories with Vietnamese names + descriptions
- Index on `categoryId` and `rootWordId` for O(1) lookups

## Architecture

### New Prisma Models

```prisma
model WordFamilyCategory {
  id          String   @id @default(cuid())
  name        String                   // "Mua sắm, nhà hàng"
  description String?                  // Vietnamese description
  imageUrl    String?                  // R2 URL for AI-generated thumbnail
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rootWords   WordFamilyRootWord[]
  userFamilies UserWordFamily[]

  @@index([isActive])
  @@index([sortOrder])
}

model WordFamilyRootWord {
  id         String   @id @default(cuid())
  categoryId String
  word       String                   // "action"
  meaning    String                   // Vietnamese meaning of root
  createdAt  DateTime @default(now())

  category   WordFamilyCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  words      WordFamilyWord[]

  @@unique([categoryId, word])
  @@index([categoryId])
}

model WordFamilyWord {
  id          String   @id @default(cuid())
  rootWordId  String
  word        String                   // "action"
  pos         String                   // "noun" | "verb" | "adjective" | "adverb"
  meaningEn   String                   // English meaning
  meaningVi   String                   // Vietnamese meaning
  example     String                   // Example sentence
  prefix      String   @default("")
  root        String                   // "act"
  suffix      String   @default("ion")
  createdAt   DateTime @default(now())

  rootWord    WordFamilyRootWord @relation(fields: [rootWordId], references: [id], onDelete: Cascade)
  flashcardLinks WordFamilyWordToFlashCard[]
  userFamilies  UserWordFamily[]

  @@index([rootWordId])
  @@index([word])
}

model UserWordFamily {
  id           String   @id @default(cuid())
  userId       String
  wordFamilyId String
  createdAt    DateTime @default(now())

  user         User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  wordFamily   WordFamilyWord @relation(fields: [wordFamilyId], references: [id], onDelete: Cascade)

  @@unique([userId, wordFamilyId])
  @@index([userId])
}

model WordFamilyWordToFlashCard {
  id            String   @id @default(cuid())
  wordFamilyId  String
  flashCardId   String
  createdAt     DateTime @default(now())

  wordFamily    WordFamilyWord @relation(fields: [wordFamilyId], references: [id], onDelete: Cascade)
  flashCard     FlashCard     @relation(fields: [flashCardId], references: [id], onDelete: Cascade)

  @@unique([wordFamilyId, flashCardId])
  @@index([flashCardId])
}
```

### Seed File Pattern
Same as `subject.seed.ts`: PrismaClient + upsert on `WordFamilyCategory`.

## Files to Create
- `examio-be/libs/database/src/seed/word-family.seed.ts`

## Files to Modify
- `examio-be/libs/database/src/schema.prisma` — add 5 models
- `examio-be/libs/database/prisma/seed.ts` — import + call word family seed

## Implementation Steps

1. Add 5 models to `schema.prisma` (see Architecture above)
2. Run `yarn prisma:generate` to verify schema compiles
3. Create `word-family.seed.ts` with 10 categories:
   - Use `upsert` on category name for idempotency
   - Vietnamese names from consultation summary
   - Each category has a description field
4. Register seed in `seed.ts` entry point
5. Run `yarn prisma:push` locally to verify migration
6. Verify with `yarn prisma:studio` that tables exist

## Todo
- [ ] Add WordFamilyCategory model to schema.prisma
- [ ] Add WordFamilyRootWord model to schema.prisma
- [ ] Add WordFamilyWord model to schema.prisma
- [ ] Add UserWordFamily model to schema.prisma
- [ ] Add WordFamilyWordToFlashCard model to schema.prisma
- [ ] Add proper indexes and unique constraints
- [ ] Run prisma generate to verify
- [ ] Create word-family.seed.ts with 10 categories
- [ ] Register seed in seed.ts
- [ ] Run prisma push locally and verify

## Success Criteria
- `yarn prisma:generate` passes without errors
- `yarn prisma:push` creates all 5 tables locally
- Seed file runs idempotently (can run multiple times without duplicates)
- 10 categories visible in prisma studio

## Risk Assessment
- Schema changes affect all services using Prisma (BE impact: exam-service, gateway) — Mitigated by additive-only changes (no existing models modified)
- Migration on production DB — Use `prisma migrate deploy` with rollback plan

## Security Considerations
- No auth changes needed — these are new tables only
- Cascade deletes on word family → user words

## Next Steps
- Phase 2: Admin CRUD for categories (can run in parallel with Phase 3-4)
- Phase 4: Exam-service Word Family API (depends on this schema)
