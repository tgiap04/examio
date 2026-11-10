# F006_QuizAuthoring

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

QuizAuthoring enables authenticated teachers to create, edit, and delete quiz sets; manage labels (chapters/sections) and questions within each set; control visibility (public/private); and generate quizzes from uploaded documents via AI. Students can view their own AI-processed PDF history and delete records. The feature spans `SCR016/REG001` (quiz set grid on MyMaterialsPage), `SCR018/REG001` (PDF history list), `SCR020` (PDF history page), `SCR021` (manage exam page), `SCR022` (quiz set detail), `SCR024` (AI tool, quiz portion), and `SCR017` (flashcard page, modal trigger). Backend lives in `examio-be/apps/content-service/src/modules/quizset/` and the AI job pipeline in `examio-be/apps/content-service/src/modules/ai/`.

## Polymorphic Behavior

### DISC-013 — UserStorage.processingStatus

| Value | Render | Validation | Persistence |
|-------|--------|------------|-------------|
| PENDING | Processing spinner badge, disabled "Generate" button | Cannot be used as AI generation source | Document queued for processing |
| PROCESSING | Progress bar, "In progress" badge | Cannot be used as AI generation source | OCR + chunking pipeline running |
| COMPLETED | Ready badge, enabled "Generate" button | Eligible as AI generation source | Chunks + embeddings stored; linked to `Document` |
| FAILED | Error badge, "Retry" button visible | Must reprocess before use | Error reason logged; no chunks created |

**Source:** `data-model.md` § `MODEL-016 UserStorage > Discriminator Fields`

N/A — no other discriminator fields in QuizAuthoring Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|------------------|------------|
| FR-006_01 | Authenticated users list their own quiz sets | `GET /api/v1/quizsets` | yes |
| FR-006_02 | Authenticated users create a quiz set | `POST /api/v1/quizsets` | yes |
| FR-006_03 | Quiz set owners update set metadata | `PUT /api/v1/quizsets/:id` | yes |
| FR-006_04 | Quiz set owners delete a set | `DELETE /api/v1/quizsets/:id` | yes |
| FR-006_05 | Quiz set owners manage labels | `POST/PUT/DELETE /api/v1/quizsets/:id/labels` | yes |
| FR-006_06 | Quiz set owners add/edit/delete questions | `POST/PUT/DELETE /api/v1/quizsets/:id/questions/:questionId` | yes |
| FR-006_07 | Users view PDF upload history | `GET /api/v1/student/recent-flashcards` | yes |
| FR-006_08 | Users delete PDF history records | `DELETE /api/v1/student/recent-flashcards` | yes |
| FR-006_09 | Users initiate AI quiz generation job | `POST /api/v1/ai/job` | yes |
| FR-006_10 | Users poll AI job status | `GET /api/v1/ai/job/:jobId` | yes |
| FR-006_11 | Users cancel AI generation job | `DELETE /api/v1/ai/job/:jobId` | yes |
| FR-006_12 | Quiz set owners (`content:share`) read and change sharing by delta (`addUserIds`, `removeUserIds`, `removeCodeGrantedIds`, `isPublic`, `codeEnabled`); lists capped at 2000 (409 `SHARE_LIST_FULL`); non-owner gets 404 | `GET/PUT /api/v1/quizsets/:id/sharing` | yes |
| FR-006_13 | Owners rotate the 6-digit code; everyone who unlocked with the old code is evicted, whitelist kept | `POST /api/v1/quizsets/:id/generate-code` | yes |
| FR-006_14 | Students (`quiz:practice`) list granted sets (whitelist, code-unlocked, or public with an attempt) | `GET /api/v1/quiz-practice/sets` | yes |
| FR-006_15 | Anyone checks whether a set needs a code; anonymous on a code-protected set learns only `requiresCode` | `GET /api/v1/quiz-practice/sets/:id/access` | yes |
| FR-006_16 | Students unlock a set with its code (5 wrong in 15 min = 429 `CODE_LOCKED`); the unlock is remembered until the code changes | `POST /api/v1/quiz-practice/sets/:id/unlock` | yes |
| FR-006_17 | Owner or student starts or resumes a practice attempt; questions carry no answer fields | `POST /api/v1/quiz-practice/attempts` | yes |
| FR-006_18 | Students autosave answers, then submit; the server scores 0-10 from stored answers and freezes `resultSnapshot`; resubmit or late save = 409 `ALREADY_SUBMITTED` | `PUT /api/v1/quiz-practice/attempts/:id`, `POST .../submit` | yes |
| FR-006_19 | Students read an open attempt only while they still have access to the set (else 404); a submitted attempt stays readable; history lists submitted attempts newest first | `GET /api/v1/quiz-practice/attempts[/:id]` | yes |

### Business Rules


None.
### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations

**INT-006_01 — AI Generation Pipeline**
**Linked FR:** FR-006_09, FR-006_10
**Source:** `examio-be/apps/exam-service/src/modules/ai/ai-job.controller.ts` (inferred)
**Type:** api-call
**Target:** `ai-service` (Python FastAPI)
**Trigger:** `POST /api/v1/ai/job` with `generationType: "quiz"`
**Payload:** `{ sourceFileId, generationType, userId, quizSetId? }`
**Failure handling:** Job status set to `failed`; user notified via polling response

### Verification

- **SC-006_01** — Quiz set created with title is visible in quiz set grid (covers FR-006_02)
- **SC-006_02** — Non-owner receives 403 on quiz set edit/delete (covers FR-006_03, FR-006_04)
- **SC-006_03** — PDF history shows processing status badges correctly (covers DISC-013)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`screen-flow.md`](../../docs/system/screen-flow.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US013 — Create Quiz Set (Priority: P1)

**What happens:** A teacher clicks "Create Quiz Set" in the quiz set grid on MyMaterialsPage. A modal appears accepting title, description, and visibility. On submit, the API creates the record and the user is redirected to the quiz set detail page to add questions.
**Why this priority:** Core authoring action — nothing else in the quiz ecosystem works without a set to hold questions.
**Independent Test:** POST `/api/v1/quizsets` with title+description+isPublic=true returns 201 and the new `quizSetId`.

**Acceptance Scenarios:**

1. **Given** the user is authenticated, **When** they submit the create modal with a valid title, **Then** a new quiz set is created and the user is redirected to `/k/manage-quiz-set/:id`.
2. **Given** the user is unauthenticated, **When** they attempt to create a quiz set, **Then** the request is rejected with 401.

**Requirements fulfilled:**
- **FR-006_02** Authenticated users create a quiz set — `POST /api/v1/quizsets` via `QuizSetController.create`
- **FR-006_11** Quiz set visibility control — `isPublic` field set on create

**Rules enforced:** PERM014 (QuizSetAuthorCreate), PERM043 (QuizSetVisibilityControl)

**Verification:**
- **SC-006_04** Quiz set appears in grid immediately after creation (covers FR-006_02, FR-006_11)

---

### US014 — Edit Quiz Set (Priority: P1)

**What happens:** A teacher navigates to their quiz set detail page. They can update the title, description, and visibility via the header section. They can add/edit/delete labels and questions using the respective manager components.
**Why this priority:** Content maintenance is a daily workflow — stale or incorrect quiz content degrades student trust.
**Independent Test:** PUT `/api/v1/quizsets/:id` with updated title returns 200 and the change is reflected in the detail page.

**Acceptance Scenarios:**

1. **Given** the user owns the quiz set, **When** they edit the title and save, **Then** the new title is persisted and visible.
2. **Given** a non-owner attempts to edit, **When** they send a PUT request, **Then** they receive 403.

**Requirements fulfilled:**
- **FR-006_03** Quiz set owners update set metadata — `PUT /api/v1/quizsets/:id` via `QuizSetController.update`
- **FR-006_05** Quiz set owners manage labels — `POST/PUT/DELETE /api/v1/quizsets/:id/labels`
- **FR-006_06** Quiz set owners add/edit/delete questions — `POST/PUT/DELETE /api/v1/quizsets/:id/questions/:questionId`

**Rules enforced:** PERM015 (QuizSetAuthorEdit)

**Verification:**
- **SC-006_05** Label added via LabelManager appears in question filter dropdown (covers FR-006_05)
- **SC-006_06** New question appears in QuestionList after save (covers FR-006_06)

---

### US015 — Delete Quiz Set (Priority: P2)

**What happens:** A teacher clicks delete on a quiz set row in the grid. A confirmation dialog asks "Delete this quiz set? This will also delete all questions and labels." On confirm, the set and all related records are removed.
**Why this priority:** Content cleanup is lower frequency but critical for data hygiene.
**Independent Test:** DELETE `/api/v1/quizsets/:id` returns 200 and the set disappears from the grid.

**Acceptance Scenarios:**

1. **Given** the user owns the quiz set, **When** they confirm deletion, **Then** the set and all its questions and labels are removed.
2. **Given** a non-owner attempts deletion, **Then** 403 is returned and the set remains.

**Requirements fulfilled:**
- **FR-006_04** Quiz set owners delete a set — `DELETE /api/v1/quizsets/:id`

**Rules enforced:** PERM016 (QuizSetAuthorDelete)

---

### US028 — Manage Quiz Set Labels (Priority: P2)

**What happens:** A teacher uses the LabelManager on the quiz set detail page to add chapter/section labels. Labels can be renamed or deleted. Labels tag questions to allow topic-based filtering.
**Why this priority:** Enables organization for large quiz sets; without labels, question filtering is impossible.
**Independent Test:** POST `/api/v1/quizsets/:id/labels` with name returns 201 and the label is selectable in the question editor.

**Acceptance Scenarios:**

1. **Given** the user is on the quiz set detail page, **When** they add a label named "Chapter 1", **Then** the label appears in the LabelManager list.
2. **Given** a label has tagged questions, **When** the teacher deletes the label, **Then** the tag is removed from questions (SetNull) but questions remain.

**Requirements fulfilled:**
- **FR-006_05** Quiz set owners manage labels — `POST/PUT/DELETE /api/v1/quizsets/:id/labels`

**Verification:**
- **SC-006_07** Label deletion does not cascade to questions (covers FR-006_05)

---

### US029 — Add Question to Quiz Set (Priority: P1)

**What happens:** A teacher clicks "Add Question" in the QuestionList. A dialog opens for question text, 2+ options, and marking the correct answer. On save, the question is persisted and appears in the list.
**Why this priority:** Core content creation — no quiz without questions.
**Independent Test:** POST `/api/v1/quizsets/:id/questions` with valid data returns 201 and the question ID is returned.

**Acceptance Scenarios:**

1. **Given** the quiz set exists, **When** the teacher submits a question with text, 4 options, and a correct answer, **Then** the question is stored and appears in the list.
2. **Given** the teacher submits with fewer than 2 options, **Then** validation error is returned.

**Requirements fulfilled:**
- **FR-006_06** Quiz set owners add questions — `POST /api/v1/quizsets/:id/questions`

**Verification:**
- **SC-006_08** Question with correct answer appears in list after save (covers FR-006_06)

---

### US030 — Edit Question in Quiz Set (Priority: P1)

**What happens:** A teacher clicks edit on an existing question row. The editor dialog is pre-filled with current values. Saving updates the record in place.
**Why this priority:** Same rationale as US014 — content accuracy is ongoing.
**Independent Test:** PUT `/api/v1/quizsets/:id/questions/:questionId` returns 200 and the updated text is returned.

**Acceptance Scenarios:**

1. **Given** a question exists in the set, **When** the teacher changes the correct answer, **Then** the updated question is persisted.
2. **Given** a non-owner sends the edit request, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-006_06** Quiz set owners edit questions — `PUT /api/v1/quizsets/:id/questions/:questionId`

---

### US031 — Delete Question from Quiz Set (Priority: P2)

**What happens:** A teacher clicks delete on a question row. A confirmation is required before the question is removed.
**Why this priority:** Content hygiene; prevents clutter from outdated questions.
**Independent Test:** DELETE `/api/v1/quizsets/:id/questions/:questionId` returns 200 and the question no longer appears in the list.

**Acceptance Scenarios:**

1. **Given** a question exists, **When** the teacher confirms deletion, **Then** the question is removed from the set.
2. **Given** a non-owner attempts deletion, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-006_06** Quiz set owners delete questions — `DELETE /api/v1/quizsets/:id/questions/:questionId`

---

### US024 — View PDF History (Priority: P2)

**What happens:** A student navigates to HistoryPage and sees the PDF history list in the left panel. Each row shows file name, upload date, and processing status badge. Clicking navigates to PDFHistoryPage for download actions.
**Why this priority:** Students need to access previously processed documents for regeneration or review.
**Independent Test:** GET `/api/v1/student/recent-flashcards` returns a list sorted by upload date, each with `processingStatus`.

**Acceptance Scenarios:**

1. **Given** the user has uploaded PDFs, **When** they open the history page, **Then** all records appear with correct status badges.
2. **Given** a PDF is still PROCESSING, **When** the page loads, **Then** a progress indicator is shown.

**Requirements fulfilled:**
- **FR-006_07** Users view PDF upload history — `GET /api/v1/student/recent-flashcards`

**Verification:**
- **SC-006_09** Processing badge shown for PENDING/PROCESSING records (covers DISC-013)

---

### US025 — Delete PDF History Record (Priority: P3)

**What happens:** A student clicks delete on a PDF history row. Confirmation dialog appears. On confirm, the record and its associated `UserStorage` entry are removed.
**Why this priority:** Allows cleanup of unwanted history entries.
**Independent Test:** DELETE `/api/v1/student/recent-flashcards` with record ID returns 200.

**Acceptance Scenarios:**

1. **Given** a PDF history record exists, **When** the user confirms deletion, **Then** the record is removed from history.
2. **Given** the user tries to delete another user's record, **Then** 403 is returned.

**Requirements fulfilled:**
- **FR-006_08** Users delete PDF history records — `DELETE /api/v1/student/recent-flashcards`

---

### US036 — Generate Quiz via AI (Priority: P1)

**What happens:** A student or teacher on AIToolPage selects a source document (from completed UserStorage files) and quiz generation parameters. Clicking "Generate" creates an AI job. The job is polled via `GET /api/v1/ai/job/:jobId` every 10 seconds until completion or failure.
**Why this priority:** AI generation is the key differentiator — without it, users must manually create all questions.
**Independent Test:** POST `/api/v1/ai/job` with `generationType: "quiz"` returns a `jobId`. Polling the job ID eventually returns `status: "completed"` with the generated `HistoryGeneratedQuizz` ID.

**Acceptance Scenarios:**

1. **Given** the user has a COMPLETED document, **When** they submit quiz generation, **Then** a job is created and the status becomes pollable.
2. **Given** the source document has PROCESSING status, **When** the user tries to generate, **Then** the generate button is disabled.

**Requirements fulfilled:**
- **FR-006_09** Users initiate AI quiz generation job — `POST /api/v1/ai/job`
- **FR-006_10** Users poll AI job status — `GET /api/v1/ai/job/:jobId`

**Rules enforced:** PERM035 (AIGenerationAccess)

**Verification:**
- **SC-006_10** Job status transitions: PENDING → PROCESSING → COMPLETED/FAILED (covers FR-006_10)

---

### US037 — Manage AI Generation Jobs (Priority: P2)

**What happens:** A user views the pending job dialog which shows job progress details. They can cancel a pending or failed job. Completed jobs show the generated content count.
**Why this priority:** Users need to monitor long-running jobs and cancel wrong requests.
**Independent Test:** DELETE `/api/v1/ai/job/:jobId` on a pending job returns 200 and the job no longer appears in the list.

**Acceptance Scenarios:**

1. **Given** a job is in PENDING state, **When** the user clicks cancel, **Then** the job is terminated and removed from the polling loop.
2. **Given** a job has completed, **When** the user views it, **Then** the generated quiz count is displayed.

**Requirements fulfilled:**
- **FR-006_10** Users poll AI job status — `GET /api/v1/ai/job/:jobId`
- **FR-006_11** Users cancel AI generation job — `DELETE /api/v1/ai/job/:jobId`

---

### US023 — Generate Flashcards via AI (Priority: P1)

**What happens:** A student on FlashcardsPage or AIToolPage selects a source document and triggers flashcard generation. The same document status check applies (no charge). Generated flashcards are linked to the source document via `HistoryGeneratedFlashcard`.
**Why this priority:** Same as US036 but for the flashcard authoring workflow.
**Independent Test:** POST `/api/v1/ai/job` with `generationType: "flashcard"` returns a `jobId`; polling eventually returns `status: "completed"`.

**Acceptance Scenarios:**

1. **Given** the user has a COMPLETED document, **When** they generate flashcards, **Then** the job is created and flashcards are associated with the document record.
2. **Given** generation is initiated, **Then** nothing is charged.

**Requirements fulfilled:**
- **FR-006_09** Users initiate AI generation (flashcard path) — `POST /api/v1/ai/job`

**Rules enforced:** PERM035 (AIGenerationAccess)

---

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User without ownership sends PUT to quiz set | HTTP 403: "You do not have permission to edit this quiz set" |
| Create question with fewer than 2 options | HTTP 400: "At least 2 options are required" |
| Generate quiz from a FAILED document | UI prevents generation; "Retry processing" prompt shown |
| Polling exceeds 60 minutes (360 attempts) | Polling stops; user shown "Generation timed out — please try again" |
| Delete quiz set that is linked to an active ExamRoom | HTTP 409: "Cannot delete quiz set linked to active exam room" (or cascade — behavior unverified) |

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| QuizSet | `QuizSet` | id, userId, title, description, isPublic | Core quiz authoring entity; owner = teacher |
| QuizSetLabel | `QuizSetLabel` | id, quizSetId, name | Chapter/section labels for organizing questions |
| QuizQuestion | `QuizQuestion` | id, questionText, options, correctAnswer | Reusable question; instantiated via DetailsQuizQuestion |
| QuizPracticeAttempt | `QuizPracticeAttempt` | id, quizSetId, userId, answers, isSubmitted, score, resultSnapshot | Student practice attempt; many per user and set (history) |
| DetailsQuizQuestion | `DetailsQuizQuestion` | quizSetId, quizQuestionId, labelId | Join table placing question into a set with optional label |
| HistoryGeneratedQuizz | `HistoryGeneratedQuizz` | id, userId, userStorageId | AI-generated batch linked to source document |
| HistoryGeneratedFlashcard | `HistoryGeneratedFlashcard` | id, userId, userStorageId | AI-generated flashcards linked to source document |
| UserStorage | `UserStorage` | id, userId, filename, processingStatus, mimetype | Source documents uploaded for AI processing |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F006 | [x] |
| Screens | [screens.md](./screens.md) | SCR016/REG001, SCR018/REG001, SCR020, SCR021, SCR022, SCR024, SCR017 | [x] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL015 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM002, PERM003, PERM014, PERM015, PERM016, PERM035, PERM038, PERM043 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US013, US014, US015, US023, US024, US025, US028, US029, US030, US031, US036, US037 | [x] |
| Data Model | [data-model.md](../../docs/system/data-model.md) | MODEL-007, MODEL-008, MODEL-009, MODEL-010, MODEL-011, MODEL-016 | [x] |

## Assumptions

- Cascade delete behavior on QuizSet deletion (questions and labels) is enforced at the Prisma schema level — confirm via `apps/content-service/prisma/schema.prisma` `onDelete: Cascade`.
- AI job polling interval is 10 seconds up to 360 attempts (60 minutes) per `useGenerationGuard` hook.
- `isPublic` flag defaults to `false` on quiz set creation.
- Ownership check for quiz set edit/delete is enforced at the repository layer (service throws `ForbiddenException` on mismatch).

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| QuizSetController | `examio-be/apps/content-service/src/modules/quizset/quizset.controller.ts` | REST endpoints for quiz set CRUD |
| QuizSetService | `examio-be/apps/content-service/src/modules/quizset/quizset.service.ts` | Business logic for quiz set operations |
| QuizQuestionRepository | `examio-be/apps/exam-service/src/modules/quizset/quiz-question.repository.ts` | Question CRUD via Prisma |
| AIJobController | `examio-be/apps/exam-service/src/modules/ai/ai-job.controller.ts` | AI job create/poll/cancel endpoints |
| useGenerationGuard | `examio-fe/src/hooks/useGenerationGuard.ts` | Client-side job polling + localStorage resume (BL015) |
| QuizSetModal | `examio-fe/src/components/k/quizset/QuizSetModal.tsx` | Create/edit quiz set dialog |
| QuestionList | `examio-fe/src/components/k/quizset/QuestionList.tsx` | Question management list on detail page |
| LabelManager | `examio-fe/src/components/k/quizset/LabelManager.tsx` | Label CRUD on quiz set detail page |

## Unresolved Questions

1. **Cascade delete scope for ExamRoom dependency**: If a quiz set is used as the source for an active ExamRoom, does DELETE return 409 or does Prisma cascade delete ExamRoom records too? Requires source read of `quizset.service.ts` delete method.
2. **Question deduplication**: Can the same QuizQuestion appear in multiple quiz sets via DetailsQuizQuestion? If so, editing the question text in one set changes it in all sets — intended behavior or bug?
3. **PDF record delete side effects**: Does deleting a UserStorage record also delete the associated Document chunks and embeddings?
