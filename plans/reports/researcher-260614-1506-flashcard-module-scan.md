# Study Report: ExamIO Flashcard Module

## Summary

The ExamIO Flashcard module is a full-stack feature spanning 3 backend modules (`flashcardset`, `flashcard-study`, `flashcardset` repository) and ~20 frontend files. It uses a **join-table pattern** (`DetailsFlashCard`) to allow the same `FlashCard` content to belong to multiple sets. AI-generated flashcards are stored in `HistoryGeneratedFlashcard` and can be saved into sets via deduplication. Study progress is tracked per-user per-set.

---

## 1. Complete Data Model

### 1.1 Core Models (Prisma)

#### `FlashCardSet`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `title` | `String` | Required |
| `userId` | `String` | FK to User |
| `thumbnail` | `String?` | R2 URL |
| `description` | `String?` | |
| `tag` | `String[]` | Stored as `tag`, mapped to `tags` in API response |
| `isPublic` | `Boolean` | Default `false` |
| `isPinned` | `Boolean` | Default `false` |
| `viewCount` | `Int` | Default `0` |
| `accessCode` | `String?` | 6-digit code for private access |
| `whitelist` | `String[]` | User IDs allowed access |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |
| `updatedBy` | `String?` | |
| `createdBy` | `String?` | |

Relations: `user`, `detailsFlashCard[]`, `labels[]`, `viewHistories[]`, `userPins[]`, `flashcardStudyProgress[]`

#### `FlashCard`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `question` | `String` | Supports HTML (RichTextEditor) |
| `answer` | `String` | Supports HTML |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

Relations: `detailsFlashCards[]`

#### `DetailsFlashCard` (join table)
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `flashCardSetId` | `String` | FK |
| `flashCardId` | `String` | FK |
| `historyGeneratedFlashcardId` | `String?` | FK — source of AI generation |
| `labelId` | `String?` | FK to FlashCardSetLabel |

- `@@unique([flashCardSetId, flashCardId])` — same card can't be added twice to same set
- This is the **only** entity that links `FlashCard` to `FlashCardSet`

#### `FlashCardSetLabel`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `flashCardSetId` | `String` | FK |
| `name` | `String` | e.g., "Chương 1" |
| `description` | `String?` | |
| `color` | `String?` | Hex color for UI |
| `order` | `Int` | For ordering in UI |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

- `@@unique([flashCardSetId, name])`

#### `HistoryGeneratedFlashcard`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK to User |
| `userStorageId` | `String?` | FK to UserStorage (backward compat) |
| `flashcards` | `Json` | Array of `{ question, answer }` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

Relations: `user`, `userStorage`, `detailsFlashCards[]`

#### `FlashCardViewHistory`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK |
| `flashCardSetId` | `String` | FK |
| `viewedAt` | `DateTime` | |

Indexes: `[userId, viewedAt]`, `[flashCardSetId]`

#### `UserPinnedFlashcard`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK |
| `flashcardSetId` | `String` | FK |
| `pinnedAt` | `DateTime` | |

- `@@unique([userId, flashcardSetId])`

#### `FlashcardStudyProgress`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK |
| `flashCardSetId` | `String` | FK |
| `studiedCardIds` | `String[]` | Array of `detailsFlashCard.id` |
| `totalCards` | `Int` | Snapshot at time of last save |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

- `@@unique([userId, flashCardSetId])`

### 1.2 User Relations (on User model)
- `flashCardSets[]`
- `historyGeneratedFlashcard[]`
- `flashCardViewHistories[]`
- `pinnedFlashcards[]`
- `flashcardStudyProgress[]`

---

## 2. API Endpoints

### 2.1 FlashcardSet CRUD
| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/flashcardsets` | Required | Create set + optional thumbnail upload (multipart/form-data) |
| `GET` | `/flashcardsets` | Required | List user's sets (pagination, search, tag filter) |
| `GET` | `/flashcardsets/stats` | Required | Aggregate stats (total sets, cards, views) |
| `GET` | `/flashcardsets/:id` | Required | Get set by ID (with all flashcards) |
| `PUT` | `/flashcardsets/:id` | Required | Update set + optional thumbnail |
| `DELETE` | `/flashcardsets/:id` | Required | Hard delete set + R2 thumbnail |

### 2.2 Flashcard CRUD (within a set)
| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/flashcardsets/:id/flashcards` | Required | Paginated flashcards (`page`, `limit`, `labelId`) |
| `POST` | `/flashcardsets/:flashcardSetId/flashcards` | Required | Add single flashcard |
| `PUT` | `/flashcardsets/:flashcardSetId/flashcards/:flashcardId` | Required | Update flashcard |
| `DELETE` | `/flashcardsets/:flashcardSetId/flashcards/:flashcardId` | Required | Remove from set (deletes DetailsFlashCard link only) |

### 2.3 Study Progress
| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/flashcard-study/progress/:flashCardSetId` | Required | Save progress (`studiedCardIds[]` or single `cardId`) |
| `GET` | `/flashcard-study/progress/:flashCardSetId` | Required | Get progress (studiedCardIds, totalCards, percentage) |

### 2.4 Labels
| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/flashcardsets/:flashcardSetId/labels` | Required | List labels + unlabeled count |
| `POST` | `/flashcardsets/:flashcardSetId/labels` | Required | Create label |
| `PUT` | `/flashcardsets/:flashcardSetId/labels/:labelId` | Required | Update label |
| `DELETE` | `/flashcardsets/:flashcardSetId/labels/:labelId` | Required | Delete label (nulls labelId on cards) |
| `POST` | `/flashcardsets/:flashcardSetId/labels/:labelId/flashcards` | Required | Assign flashcards to label |
| `DELETE` | `/flashcardsets/:flashcardSetId/labels/:labelId/flashcards` | Required | Remove flashcards from label |
| `GET` | `/flashcardsets/:flashcardSetId/labels/:labelId/flashcards` | Required | Get flashcards by label (paginated) |

### 2.5 Sharing & Access
| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/flashcardsets/public/:id` | Optional | Get public set (no auth required) |
| `GET` | `/flashcardsets/study/:id/access` | Optional | Check access (public/owner/whitelist/code_required/denied) |
| `GET` | `/flashcardsets/study/:id/info` | None | Public info (no auth) |
| `GET` | `/flashcardsets/study/:id` | Optional | Get set for study (with Turnstile token support) |
| `POST` | `/flashcardsets/study/:id/verify-code` | None | Verify 6-digit access code |
| `POST` | `/flashcardsets/study/:id/with-code` | Optional | Get set using access code |
| `POST` | `/flashcardsets/:id/share` | Required | Generate share link + access code |
| `GET` | `/flashcardsets/:id/sharing` | Required | Get sharing settings |
| `PUT` | `/flashcardsets/:id/sharing` | Required | Update sharing settings |
| `POST` | `/flashcardsets/:id/generate-code` | Required | Generate new 6-digit code |
| `GET` | `/flashcardsets/users/search` | Required | Search users for whitelist |

### 2.6 Bulk / AI Import
| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/flashcardsets/set-flashcards-to-flashcardset` | Required | Bulk add flashcards to multiple sets |
| `POST` | `/flashcardsets/save-history-to-flashcardset` | Required | Save AI-generated flashcards from HistoryGeneratedFlashcard to sets (with dedup) |

---

## 3. Frontend State Management & UI Structure

### 3.1 API Client (`examio-fe/src/apis/flashcardSetApi.ts`)
Flat functions: `createFlashcardSetApi`, `getFlashcardSetsApi`, `getFlashcardSetByIdApi`, `updateFlashcardSetApi`, `deleteFlashcardSetApi`, `addFlashcardToFlashcardSet`, `updateFlashcardInFlashcardSet`, `deleteFlashcardFromFlashcardSet`, `getFlashcardSetFlashcardsApi`, `getFlashcardSetStatsApi`, `setFlashcardsToFlashcardSet`, `setHistoryFlashcardsToFlashcardSet`, label CRUD, sharing CRUD.

Also: `examio-fe/src/apis/flashcardStudyApi.ts` — study progress API.

### 3.2 Zustand Store (`examio-fe/src/stores/useFlashcardSetStore.ts`)
Single store with:
- State: `flashcardSetsK[]`, `currentFlashcardSet`, `loading`, `error`
- Actions: `fetchFlashcardSets` (with 5-min cache), `fetchFlashcardSetById`, `createFlashcardSet`, `updateFlashcardSet`, `deleteFlashcardSet`, `setHistoryFlashcardsToFlashcardSet`, `invalidateCache`
- Flashcard CRUD: `addFlashcard`, `updateFlashcard`, `deleteFlashcard`
- Pattern: Optimistic update → clear cache → refetch from server

### 3.3 Key UI Components
| File | Purpose |
|---|---|
| `pages/k/FlashcardsPage.tsx` | Main flashcard management page |
| `pages/k/ManageFlashcardSetDetailPage.tsx` | Detail view for managing a set |
| `pages/study-flashcard/FlashcardStudyPage.tsx` | Study/quiz page |
| `components/organisms/FlashcardEditorDialog.tsx` | Dialog for editing flashcards |
| `components/organisms/FlashcardInlineForm.tsx` | Inline add/edit form (question + answer via RichTextEditor) |
| `components/organisms/FlashcardSetForm.tsx` | Form for creating/updating a set |
| `components/organisms/FlashcardSetModal.tsx` | Modal for set creation |
| `components/organisms/FlashcardLabelManager.tsx` | Label management UI |
| `components/organisms/ShareFlashcardModal.tsx` | Sharing settings modal |
| `components/organisms/k/FlashcardGenerator.tsx` | AI flashcard generation UI |
| `components/organisms/k/FlashcardTable.tsx` | Paginated table of flashcards |
| `components/organisms/k/FlashcardSearchFilterBar.tsx` | Search/filter bar |
| `components/organisms/k/FlashcardStatsSection.tsx` | Stats display |
| `components/organisms/k/FlashcardManagementHeader.tsx` | Header with actions |
| `templates/FlashcardManagementTemplate.tsx` | Page template |

### 3.4 Types (`examio-fe/src/types/flashcardSet.ts`)
`Flashcard`, `FlashcardSet`, `FlashcardSetPublicInfo`, `AccessCheckResult`, `SharingSettings`, `FlashcardStudySession`, `FlashcardSetProgress`, `FlashcardSetCreator`

---

## 4. Flashcard Creation Flow

### 4.1 User Action → DB Write

```
User fills FlashcardInlineForm
  (question: HTML string, answer: HTML string)
        ↓
onSave({ question, answer })
        ↓
useFlashcardSetStore.addFlashcard(flashcardSetId, { question, answer })
        ↓
addFlashcardToFlashcardSet(flashcardSetId, { question, answer })
  → POST /flashcardsets/:flashcardSetId/flashcards
        ↓
FlashcardsetController.addFlashcard()
  → flashcardsetService.addFlashcardToFlashcardSet()
        ↓
Prisma.$transaction([
  tx.flashCard.create({ id, question, answer }),
  tx.detailsFlashCard.create({ id, flashCardSetId, flashCardId })
])
        ↓
repository.invalidateCache()
        ↓
storeCache.clear()
        ↓
getFlashcardSetByIdApi() → refetch fresh data
        ↓
store updated with fresh data
```

### 4.2 Key Design Decisions

1. **Join-table pattern**: `FlashCard` is content-only (no set reference). `DetailsFlashCard` is the only link. This allows the same card to appear in multiple sets with different labels.

2. **Soft-delete on card removal**: `deleteFlashcardFromFlashcardSet` deletes only the `DetailsFlashCard` link, not the `FlashCard` itself. The `FlashCard` content remains reusable.

3. **Bulk add**: `setFlashcardsToFlashcardSet` creates one `FlashCard` + N `DetailsFlashCard` records (one per target set) in a single transaction.

4. **AI import with dedup**: `saveHistoryToFlashcardSet` hashes `{question.trim().toLowerCase()}|||{answer.trim().toLowerCase()}` to detect duplicates before creating new records. Uses `skipDuplicates: true` on both `createMany` calls.

5. **Progress tracking**: `studiedCardIds` stores `detailsFlashCard.id` (not `flashCard.id`). Percentage = `studiedCardIds.length / totalCards`.

6. **Access model**: 3-tier — public (anyone), whitelist (specific user IDs), code (6-digit). Owner always has access.

7. **Tag field naming**: Prisma stores as `tag` (String[]), API/frontend transforms to `tags` for consistency.

---

## Unresolved Questions

1. **AI generation flow**: `HistoryGeneratedFlashcard` is created by the AI service — how is that triggered and what API endpoint creates the `HistoryGeneratedFlashcard` record? Not visible in `flashcardset` module.
2. **Study modes**: `FlashcardStudySession` type exists in frontend but no backend model for it yet — is this planned?
3. **`FlashcardSetProgress` type** defined in frontend but `FlashcardStudyProgress` in backend uses simpler schema (`studiedCardIds[]`, `totalCards`) — no `masteredCards`, `reviewDueCards`, `averageQuality` fields in DB.
4. **Thumbnail deletion on R2**: Only handled for `deleteFlashcardSet` and `updateFlashcardSet`. Not handled for `saveHistoryToFlashcardSet` or bulk operations.
