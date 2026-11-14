# F007_FlashcardAuthoring

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

FlashcardAuthoring enables authenticated teachers to create, edit, and delete flashcard sets; manage labels and flashcards within each set; control visibility (public/private with optional 6-digit access code); and generate flashcards from uploaded documents via AI. The feature spans `SCR016/REG002` (flashcard set grid on MyMaterialsPage), `SCR017` (flashcard browsing and AI generation), and `SCR023` (flashcard set detail page). Backend lives in `kmaedu-be/apps/exam-service/src/modules/flashcardset/` and the AI generation pipeline in `kmaedu-be/apps/exam-service/src/modules/ai/`.

## Polymorphic Behavior

N/A — no discriminator fields in FlashcardAuthoring Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|------------------|------------|
| FR-007_01 | Authenticated users list their own flashcard sets | `GET /api/v1/flashcardsets` | yes |
| FR-007_02 | Authenticated users create a flashcard set | `POST /api/v1/flashcardsets` | yes |
| FR-007_03 | Flashcard set owners update set metadata | `PUT /api/v1/flashcardsets/:id` | yes |
| FR-007_04 | Flashcard set owners delete a set | `DELETE /api/v1/flashcardsets/:id` | yes |
| FR-007_05 | Flashcard set owners manage labels | `POST/PUT/DELETE /api/v1/flashcardsets/:id/labels` | yes |
| FR-007_06 | Flashcard set owners add/edit/delete flashcards | `POST/PUT/DELETE /api/v1/flashcardsets/:id/flashcards/:flashcardId` | yes |
| FR-007_07 | Users initiate AI flashcard generation job | `POST /api/v1/ai/job` | yes |
| FR-007_08 | Users poll AI job status | `GET /api/v1/ai/job/:jobId` | yes |
| FR-007_09 | Users cancel AI generation job | `DELETE /api/v1/ai/job/:jobId` | yes |

### Business Rules


None.
### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations

**INT-007_01 — AI Generation Pipeline**
**Linked FR:** FR-007_07, FR-007_08
**Source:** `kmaedu-be/apps/exam-service/src/modules/ai/ai-job.controller.ts` (inferred)
**Type:** api-call
**Target:** `ai-service` (Python FastAPI)
**Trigger:** `POST /api/v1/ai/job` with `generationType: "flashcard"`
**Payload:** `{ sourceFileId, generationType, userId, flashcardSetId? }`
**Failure handling:** Job status set to `failed`; credits restored if deduction was upfront

**INT-007_02 — Credit Deduction (FinanceClientService)**
**Linked FR:** FR-007_07
**Source:** `kmaedu-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` (BL004)
**Type:** api-call
**Target:** `finance-service` via gRPC
**Trigger:** Before creating AI flashcard generation job
**Payload:** `{ userId, creditsToDeduct }`
**Failure handling:** Job creation blocked if insufficient credits; unless `FREE_MODE = true`

### Verification

- **SC-007_01** — Flashcard set created with title appears in flashcard set grid (covers FR-007_02)
- **SC-007_02** — Non-owner receives 403 on flashcard set edit/delete (covers FR-007_03, FR-007_04)
- **SC-007_03** — Public flashcard set appears on FlashcardsPage browse grid (covers PERM044)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`screen-flow.md`](../../docs/system/screen-flow.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US016 — Create Flashcard Set (Priority: P1)

**What happens:** A teacher clicks "Create Flashcard Set" in the flashcard set grid on MyMaterialsPage or FlashcardsPage. A modal accepts title, description, and visibility. On submit, the API creates the record and the user is redirected to the flashcard set detail page to add cards.
**Why this priority:** Core authoring action — flashcard sets are the primary unit of study content.
**Independent Test:** POST `/api/v1/flashcardsets` with title+description+isPublic=true returns 201 and the new `flashcardSetId`.

**Acceptance Scenarios:**

1. **Given** the user is authenticated, **When** they submit the create modal with a valid title, **Then** a new flashcard set is created and the user is redirected to `/k/manage-flashcard-set/:id`.
2. **Given** the user is unauthenticated, **When** they attempt to create, **Then** 401 is returned.

**Requirements fulfilled:**
- **FR-007_02** Authenticated users create a flashcard set — `POST /api/v1/flashcardsets` via `FlashcardSetController.create`
- **FR-007_04** Visibility control — `isPublic` field set on create

**Rules enforced:** PERM017 (FlashcardSetAuthorCreate), PERM044 (FlashcardSetVisibilityControl)

---

### US017 — Edit Flashcard Set (Priority: P1)

**What happens:** A teacher navigates to their flashcard set detail page. They update title, description, and visibility via the header. They add, edit, or delete labels and flashcards using the respective manager components.
**Why this priority:** Content maintenance is a daily workflow for teachers updating study materials.
**Independent Test:** PUT `/api/v1/flashcardsets/:id` with updated title returns 200.

**Acceptance Scenarios:**

1. **Given** the user owns the flashcard set, **When** they update the title and save, **Then** the new title is persisted.
2. **Given** a non-owner sends the edit request, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-007_03** Flashcard set owners update metadata — `PUT /api/v1/flashcardsets/:id`
- **FR-007_05** Flashcard set owners manage labels — `POST/PUT/DELETE /api/v1/flashcardsets/:id/labels`
- **FR-007_06** Flashcard set owners add/edit/delete flashcards — `POST/PUT/DELETE /api/v1/flashcardsets/:id/flashcards/:flashcardId`

**Rules enforced:** PERM018 (FlashcardSetAuthorEdit)

---

### US018 — Delete Flashcard Set (Priority: P2)

**What happens:** A teacher clicks delete on a flashcard set row. A confirmation dialog appears. On confirm, the set and all associated cards are removed.
**Why this priority:** Content hygiene; removes outdated or unwanted decks.
**Independent Test:** DELETE `/api/v1/flashcardsets/:id` returns 200 and the set disappears from the grid.

**Acceptance Scenarios:**

1. **Given** the user owns the flashcard set, **When** they confirm deletion, **Then** the set and all flashcards are removed.
2. **Given** a non-owner attempts deletion, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-007_04** Flashcard set owners delete a set — `DELETE /api/v1/flashcardsets/:id`

**Rules enforced:** PERM019 (FlashcardSetAuthorDelete)

---

### US022 — Browse Flashcard Sets (Priority: P2)

**What happens:** A student opens the FlashcardsPage and sees a grid of public flashcard sets. Clicking a set navigates to the study interface.
**Why this priority:** Discovery of study materials created by other teachers.
**Independent Test:** GET `/api/v1/flashcardsets` returns only public sets for unauthenticated browsing.

**Acceptance Scenarios:**

1. **Given** a user is on FlashcardsPage, **When** they scroll the grid, **Then** only sets with `isPublic=true` appear.
2. **Given** a set has an access code, **When** a non-owner visits it, **Then** they must enter the code before studying.

**Requirements fulfilled:**
- **FR-007_01** List flashcard sets — `GET /api/v1/flashcardsets`

**Rules enforced:** PERM044 (FlashcardSetVisibilityControl)

---

### US023 — Generate Flashcards via AI (Priority: P1)

**What happens:** A student or teacher on FlashcardsPage or AIToolPage selects a source document (COMPLETED status only) and triggers flashcard generation. Credits are checked via `FinanceClientService`; if insufficient and FREE_MODE is false, an error is shown.
**Why this priority:** AI generation dramatically reduces manual card creation effort.
**Independent Test:** POST `/api/v1/ai/job` with `generationType: "flashcard"` returns a `jobId`; polling the ID eventually returns `status: "completed"` with a `HistoryGeneratedFlashcard` ID.

**Acceptance Scenarios:**

1. **Given** the user has a COMPLETED document and sufficient credits (or FREE_MODE), **When** they submit generation, **Then** a job is created and pollable.
2. **Given** the document is still PROCESSING, **When** generation is attempted, **Then** the generate button is disabled.
3. **Given** credits are insufficient and FREE_MODE is false, **Then** an error is shown with a subscription link.

**Requirements fulfilled:**
- **FR-007_07** Users initiate AI flashcard generation — `POST /api/v1/ai/job`
- **FR-007_08** Users poll job status — `GET /api/v1/ai/job/:jobId`

**Rules enforced:** PERM035 (AIGenerationAccess), PERM036 (AIGenerationCredits), PERM041 (FreeModeCreditBypass)

---

### US032 — Manage Flashcard Set Labels (Priority: P2)

**What happens:** A teacher uses FlashcardLabelManager on the detail page to add, rename, or delete labels. Labels organize cards by topic within a set.
**Why this priority:** Enables topic-based organization for large decks.
**Independent Test:** POST `/api/v1/flashcardsets/:id/labels` with name returns 201 and the label appears in the manager.

**Acceptance Scenarios:**

1. **Given** the user is on the detail page, **When** they add a label named "Chapter 1", **Then** the label appears in the list.
2. **Given** a label has cards tagged with it, **When** the teacher deletes the label, **Then** the tag is removed from cards (SetNull) but cards remain.

**Requirements fulfilled:**
- **FR-007_05** Flashcard set owners manage labels — `POST/PUT/DELETE /api/v1/flashcardsets/:id/labels`

---

### US033 — Add Flashcard to Set (Priority: P1)

**What happens:** A teacher clicks "Add Flashcard" on the detail page. A dialog opens with front (question) and back (answer) text fields. On save, the card appears in the list with a flip preview.
**Why this priority:** Core content creation — no deck without cards.
**Independent Test:** POST `/api/v1/flashcardsets/:id/flashcards` with front+back returns 201 and the card ID is returned.

**Acceptance Scenarios:**

1. **Given** the user is on the detail page, **When** they submit a card with front and back text, **Then** the card appears in the list.
2. **Given** the user submits with empty front text, **Then** validation error is returned.

**Requirements fulfilled:**
- **FR-007_06** Flashcard set owners add flashcards — `POST /api/v1/flashcardsets/:id/flashcards`

---

### US034 — Edit Flashcard in Set (Priority: P1)

**What happens:** A teacher clicks edit on an existing card. The editor dialog pre-fills with current front and back text. Saving updates the record.
**Why this priority:** Content accuracy requires ongoing edits.
**Independent Test:** PUT `/api/v1/flashcardsets/:id/flashcards/:flashcardId` returns 200 and updated text is returned.

**Acceptance Scenarios:**

1. **Given** a card exists, **When** the teacher changes the back text and saves, **Then** the change is persisted.
2. **Given** a non-owner attempts the edit, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-007_06** Flashcard set owners edit flashcards — `PUT /api/v1/flashcardsets/:id/flashcards/:flashcardId`

---

### US035 — Delete Flashcard from Set (Priority: P2)

**What happens:** A teacher clicks delete on a card row. A confirmation is required before the card is removed from the set.
**Why this priority:** Content hygiene; removes incorrect or unwanted cards.
**Independent Test:** DELETE `/api/v1/flashcardsets/:id/flashcards/:flashcardId` returns 200 and the card no longer appears in the list.

**Acceptance Scenarios:**

1. **Given** a card exists, **When** the teacher confirms deletion, **Then** the card is removed from the set.
2. **Given** a non-owner attempts deletion, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-007_06** Flashcard set owners delete flashcards — `DELETE /api/v1/flashcardsets/:id/flashcards/:flashcardId`

---

### US036 — Generate Quiz via AI (Priority: P1)

**What happens:** (FlashcardAuthoring participates in quiz generation as a destination for generated content.) User initiates quiz generation that may target a flashcard set or create a new quiz set from source documents. Credit and document status checks are identical to US023.
**Why this priority:** Overlaps with F006; documented here for completeness as SCR017 and SCR024 both serve both quiz and flashcard generation.
**Independent Test:** Same as F006 US036.

**Acceptance Scenarios:**

1. **Given** the user has a COMPLETED document and sufficient credits, **When** they generate a quiz, **Then** a quiz generation job is created.
2. **Given** credits are insufficient, **When** generation is attempted, **Then** an error is shown.

**Requirements fulfilled:**
- **FR-007_07** Users initiate AI generation (quiz path) — `POST /api/v1/ai/job`

**Rules enforced:** PERM035, PERM036, PERM041

---

### US037 — Manage AI Generation Jobs (Priority: P2)

**What happens:** User manages all AI generation jobs (quiz and flashcard) from AIToolPage. They can view status, cancel pending jobs, and see completed job results.
**Why this priority:** Users need to monitor and manage background generation tasks.
**Independent Test:** DELETE `/api/v1/ai/job/:jobId` cancels a pending job.

**Acceptance Scenarios:**

1. **Given** a flashcard generation job is pending, **When** the user clicks cancel, **Then** the job is terminated.
2. **Given** a job has completed, **When** the user views it, **Then** the generated card count is displayed.

**Requirements fulfilled:**
- **FR-007_08** Poll job status — `GET /api/v1/ai/job/:jobId`
- **FR-007_09** Cancel job — `DELETE /api/v1/ai/job/:jobId`

---

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User without ownership attempts to edit a flashcard set | HTTP 403: "You do not have permission to edit this flashcard set" |
| User creates a flashcard with empty front text | HTTP 400: "Front text cannot be empty" |
| Generate flashcards from a PROCESSING document | UI disables generate button; tooltip explains document is not ready |
| Generate flashcards with insufficient credits (FREE_MODE=false) | Error: "You don't have enough credits" with subscription page link |
| Delete flashcard set linked to an active study session | API returns 409 or cascades deletion (behavior unverified) |
| Delete a label that has tagged flashcards | Label tag removed from cards (SetNull); cards remain intact |
| AI generation job fails after credit deduction | Credits restored or not depending on deduction timing (unverified) |
| Concurrent edits by two users on same set | Last-write-wins; no optimistic locking detected |

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| FlashCardSet | `FlashCardSet` | id, userId, title, description, isPublic, accessCode | Core flashcard set entity; owner = teacher |
| FlashCardSetLabel | `FlashCardSetLabel` | id, flashCardSetId, name | Chapter/section labels for organizing cards |
| FlashCard | `FlashCard` | id, front, back, flashCardSetId | Individual question/answer pair |
| DetailsFlashCard | `DetailsFlashCard` | flashCardSetId, flashCardId, labelId | Join table placing card into set with optional label |
| HistoryGeneratedFlashcard | `HistoryGeneratedFlashcard` | id, userId, userStorageId | AI-generated batch linked to source document |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F007 | [x] |
| Screens | [screens.md](./screens.md) | SCR016/REG002, SCR017, SCR023 | [x] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL004, BL015 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM002, PERM003, PERM017, PERM018, PERM019, PERM035, PERM036, PERM041, PERM044 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US016, US017, US018, US022, US023, US032, US033, US034, US035, US036, US037 | [x] |
| Data Model | [data-model.md](../../docs/system/data-model.md) | MODEL-012, MODEL-013, MODEL-014, MODEL-015 | [x] |

## Assumptions

- `isPublic` defaults to `false` on flashcard set creation.
- `accessCode` is a 6-digit numeric string, optional, and only enforced when `isPublic=false`.
- Cascade delete on FlashCardSet: associated FlashCard and FlashCardSetLabel records are removed by Prisma cascade.
- AI job polling for flashcards uses the same `useGenerationGuard` hook as quiz generation.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| FlashcardSetController | `kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcardset.controller.ts` | REST endpoints for flashcard set CRUD |
| FlashcardSetService | `kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` | Business logic for flashcard set operations |
| FlashcardController | `kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcard.controller.ts` | Flashcard CRUD within sets |
| AIJobController | `kmaedu-be/apps/exam-service/src/modules/ai/ai-job.controller.ts` | AI job create/poll/cancel |
| FinanceClientService | `kmaedu-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` | Credit check (BL004) |
| useGenerationGuard | `kmaedu-fe/src/hooks/useGenerationGuard.ts` | Client-side job polling (BL015) |
| FlashcardSetModal | `kmaedu-fe/src/components/k/flashcardset/FlashcardSetModal.tsx` | Create/edit flashcard set dialog |
| FlashcardEditorDialog | `kmaedu-fe/src/components/k/flashcardset/FlashcardEditorDialog.tsx` | Add/edit flashcard dialog |
| ViewFlashcardDialog | `kmaedu-fe/src/components/k/flashcardset/ViewFlashcardDialog.tsx` | Flip card preview dialog |

## Unresolved Questions

1. **Credit refund policy on failed jobs**: Are credits automatically restored if a flashcard generation job fails after deduction?
2. **Access code enforcement**: Is the 6-digit access code validated server-side on every study session access, or only on initial entry?
3. **Cascade delete scope**: Does deleting a FlashCardSet also delete the associated `FlashcardStudyProgress` records for students who studied the set?
4. **DetailsFlashCard usage**: Is the join table populated for all cards, or only when a label is assigned? If label assignment is optional, how does the system handle cards without a DetailsFlashCard row?
