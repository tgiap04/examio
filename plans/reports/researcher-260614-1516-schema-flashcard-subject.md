# Prisma Schema Research: FlashCard, Subject, UserStorage, and Seed Patterns

**Report:** `/Users/tgiap.dev/devs/examio/plans/reports/researcher-260614-1516-schema-flashcard-subject.md`
**Date:** 2026-06-14
**Scope:** schema.prisma + seed files, Word Family feature research

---

## 1. FlashCardSet, FlashCard, DetailsFlashCard — Full Models

### FlashCardSet (lines 139–164)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `title` | `String` | — |
| `userId` | `String` | FK → `User`, `onDelete: Cascade` |
| `thumbnail` | `String?` | Optional cover image URL |
| `description` | `String?` | — |
| `tag` | `String[]` | Default `[]` |
| `isPublic` | `Boolean` | Default `false` |
| `isPinned` | `Boolean` | Default `false` |
| `viewCount` | `Int` | Default `0` |
| `accessCode` | `String?` | 6-digit private share code |
| `whitelist` | `String[]` | Default `[]` — user IDs allowed access |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedBy` | `String?` | — |
| `createdBy` | `String?` | — |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |

**Relations:**
- `user` → `User` (1:N, cascade)
- `detailsFlashCard` → `DetailsFlashCard[]` (1:N, cascade)
- `labels` → `FlashCardSetLabel[]` (1:N, cascade)
- `viewHistories` → `FlashCardViewHistory[]` (1:N, cascade)
- `userPins` → `UserPinnedFlashcard[]` (1:N, cascade)
- `flashcardStudyProgress` → `FlashcardStudyProgress[]` (1:N, cascade)

**Indexes:** `[accessCode]`

**Key design pattern:** No `subjectId` field — FlashCardSet is user-owned, not categorized. Category bucketing (for Word Family) would need a new relation or field.

---

### FlashCardSetLabel (lines 122–137)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `flashCardSetId` | `String` | FK → `FlashCardSet`, cascade |
| `name` | `String` | Label name, e.g. "Chương 1" |
| `description` | `String?` | — |
| `color` | `String?` | Hex code for UI |
| `order` | `Int` | Default `0` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |

**Constraints:** `@@unique([flashCardSetId, name])` — unique per set.
**Indexes:** `[flashCardSetId]`

This is the labeling pattern analogous to `QuizSetLabel`. Useful for organizing cards within a set (e.g., grouping by root word in a Word Family set).

---

### FlashCard (lines 196–204)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `question` | `String` | Front / prompt |
| `answer` | `String` | Back / response |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |

**Relations:**
- `detailsFlashCards` → `DetailsFlashCard[]` (1:N, cascade)

**Key design pattern:** `FlashCard` is the canonical content record (question + answer). It is **not** directly tied to a set — that junction is `DetailsFlashCard`. This allows the same `FlashCard` to belong to multiple sets.

---

### DetailsFlashCard (lines 206–223)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `flashCardSetId` | `String` | FK → `FlashCardSet`, cascade |
| `flashCardId` | `String` | FK → `FlashCard`, cascade + cascade update |
| `historyGeneratedFlashcardId` | `String?` | FK → `HistoryGeneratedFlashcard`, SetNull |
| `labelId` | `String?` | FK → `FlashCardSetLabel`, SetNull — per-card categorization |

**Constraints:** `@@unique([flashCardSetId, flashCardId])`
**Indexes:** `[flashCardSetId]`, `[flashCardId]`, `[historyGeneratedFlashcardId]`, `[labelId]`

**Key design pattern:** Junction table with `@@unique` constraint prevents duplicate card assignments within a set. The `labelId` field enables per-card labeling within a set (e.g., assign a card to "Prefixes" label).

---

## 2. SubjectCategory and Subject — Full Models

### SubjectCategory (lines 596–611)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `name` | `String` | `@unique` — e.g. "Khoa học Tự nhiên" |
| `slug` | `String` | `@unique` — URL-friendly |
| `description` | `String?` | — |
| `icon` | `String?` | Icon/emoji name |
| `color` | `String?` | Hex color |
| `order` | `Int` | Default `0` — display ordering |
| `isActive` | `Boolean` | Default `true` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |

**Relations:**
- `subjects` → `Subject[]` (1:N, cascade)

**Indexes:** `[isActive, order]`

**This is the closest pattern to Word Family Category** — a named, ordered, color/icon-coded bucket containing sub-items. For Word Family, you'd likely mirror `SubjectCategory` as `WordFamilyCategory` (or reuse it if a subject can own word families).

---

### Subject (lines 614–633)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `categoryId` | `String` | FK → `SubjectCategory`, cascade |
| `name` | `String` | `@unique` — e.g. "Toán học" |
| `slug` | `String` | `@unique` — URL-friendly |
| `description` | `String?` | — |
| `icon` | `String?` | Icon/emoji |
| `color` | `String?` | Hex |
| `systemPrompt` | `String` | `@db.Text` — LLM system prompt, **required** |
| `order` | `Int` | Default `0` — display order within category |
| `isActive` | `Boolean` | Default `true` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |

**Relations:**
- `category` → `SubjectCategory` (N:1)
- `aiChats` → `AIChat[]` (1:N, SetNull)

**Indexes:** `[categoryId, isActive, order]`, `[isActive, order]`

**Word Family mapping:** `Subject` maps to `WordFamily` — same shape (name, slug, description, icon, color, order, isActive). No `systemPrompt` needed unless AI tutoring per word family is desired.

---

## 3. UserStorage Model and Relations

### UserStorage (lines 495–516)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | `@unique` (not @id, uses existing UUID) |
| `userId` | `String` | FK → `User`, cascade |
| `filename` | `String` | Original filename |
| `url` | `String` | Public/cdn URL |
| `mimetype` | `String` | MIME type |
| `size` | `Int` | File size in bytes |
| `keyR2` | `String` | `@unique` — R2 storage key |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@default(now()) @updatedAt` |
| `processingStatus` | `String` | `PENDING \| PROCESSING \| COMPLETED \| FAILED`, default `COMPLETED` |
| `creditCharged` | `Boolean` | Default `false` — OCR credit tracking |

**Relations:**
- `documents` → `Document[]` (1:N, cascade)
- `documentEntities` → `DocumentEntity[]` (1:N, cascade)
- `graphState` → `UserStorageGraph?` (1:1 optional, cascade)
- `graphGroups` → `UserStorageGraphGroup[]` (1:N, cascade)
- `historyGeneratedQuizz` → `HistoryGeneratedQuizz[]` (1:N, cascade)
- `historyGeneratedFlashcard` → `HistoryGeneratedFlashcard[]` (1:N, cascade)
- `aiChatDocuments` → `AIChatDocument[]` (1:N, cascade)

**Key pattern:** `UserStorage` is the canonical "user uploaded file" record. Other models reference it via junction tables (`AIChatDocument`, `HistoryGeneratedFlashcard`) rather than direct FK.

---

## 4. Seed File Patterns

### `subject.seed.ts` (src/seed/subject.seed.ts)

Pattern used by this file:
1. Hard-coded static array of category/subject definitions (no DB fetch for seed data)
2. Per-category: `prisma.subjectCategory.upsert({ where: { slug }, update: ..., create: ... })`
3. Per-subject: `prisma.subject.upsert({ where: { slug }, update: ..., create: ... })`
4. Slug is the unique key for upsert detection
5. `isActive: true` set on create
6. `systemPrompt` generated inline with template string per subject

**Pattern summary:** Static data → upsert by slug → cascade create/update.

---

### `prisma/seed.ts` (main entry point)

This is the more complete, production-grade seed entry point. Key characteristics:
1. Imports `PrismaClient` from `@prisma/client`
2. Has helper functions: `toSlug()`, `getCategoryIcon()`, `getSubjectIcon()`, `generateSystemPrompt()`
3. `toSlug()` normalizes Vietnamese diacritics (NFD strip, `đ→d`)
4. Icon mapping via `Record<string, string>` lookups
5. `generateSystemPrompt()` produces a full LLM system prompt with subject list
6. Main `seedSubjects()` loops through `subjectData` array, upserting both Category and Subject
7. Upsert by `slug` on both Category and Subject
8. Color stored as hex string (e.g., `'#3B82F6'`) in this version vs. named color (`'blue'`) in subject.seed.ts
9. Exit with `process.exit(1)` on error, `$disconnect()` in finally

**Pattern summary:** Static seed data array → upsert cascade → descriptive logging → error handling.

---

## 5. Existing Learning Tracking / Vocabulary Models

**No `UserVocabulary` model exists in the schema.** The closest learning-tracking models are:

| Model | Purpose | Key fields |
|---|---|---|
| `FlashcardStudyProgress` | Tracks which cards in a set a user has studied | `userId`, `flashCardSetId`, `studiedCardIds` (`String[]`), `totalCards` |
| `FlashCardViewHistory` | Logs each time a user views a flashcard set | `userId`, `flashCardSetId`, `viewedAt` |
| `QuizPracticeAttempt` | Tracks quiz practice per user per quiz set | `userId`, `quizSetId`, `type`, `answers` (Json), `score`, `isSubmitted`, `timeSpentSeconds`, `markedQuestions`, `currentIndex` |
| `UserPinnedFlashcard` | Pins a flashcard set to user's list | `userId`, `flashcardSetId`, `pinnedAt` |
| `UserPinnedExamRoom` | Pins an exam room | `userId`, `examRoomId`, `pinnedAt` |

**For Word Family vocabulary tracking**, the most relevant reference is `FlashcardStudyProgress`:
- `@@unique([userId, flashCardSetId])` — one progress record per user per set
- `studiedCardIds String[]` — which items the user has studied (reversible: could track learned vs. not-learned words)
- `totalCards Int` — snapshot of set size at time of progress

---

## 6. Summary: Schema Patterns Relevant to Word Family

### Category-level pattern (SubjectCategory)
```
name @unique, slug @unique, description?, icon?, color?, order Int, isActive Boolean
→ 1:N → sub-items (Subject or WordFamily)
→ @@index([isActive, order])
```

### Sub-item pattern (Subject / FlashCard)
```
name @unique, slug @unique, description?, icon?, color?, order Int, isActive Boolean
→ FK to parent Category
→ @@index([categoryId, isActive, order])
```

### Content record pattern (FlashCard)
```
question String, answer String, timestamps
→ Junction table (DetailsFlashCard) for N:N with sets
→ @@unique([flashCardSetId, flashCardId])
```

### Learning progress pattern (FlashcardStudyProgress)
```
@@unique([userId, flashCardSetId])
studiedCardIds String[]
totalCards Int
→ tracks per-user, per-set progress
```

### User-owned set pattern (FlashCardSet)
```
userId FK, title, description?, tag[], isPublic, isPinned, viewCount, accessCode?, whitelist[]
→ labels (FlashCardSetLabel) for internal grouping
→ @@index([accessCode])
```

---

## Unresolved Questions

1. **Should WordFamily reuse SubjectCategory/Subject or get its own models?** Reusing avoids new tables but blurs domain boundaries. New tables (`WordFamilyCategory`, `WordFamily`) are cleaner but require new seed data.
2. **Should Word Family cards follow the FlashCard junction pattern** (`WordFamilyCard` + `DetailsWordFamilyCard`) or use direct FK to `WordFamily` (1:N)? Junction enables cross-set reuse; direct FK is simpler.
3. **Does Word Family need its own study progress model** (like `FlashcardStudyProgress`) or can vocabulary tracking reuse/extend it?
4. **Should vocabulary items have AI-generated definitions/examples** stored as fields (like `systemPrompt` on Subject), or computed on-the-fly via AI service?

---

*Sources: schema.prisma (lines 1–756), subject.seed.ts, seed.ts*