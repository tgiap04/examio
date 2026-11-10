# SCR024: AIToolPage — Screen Spec

**Screen**: SCR024: AIToolPage
**Type**: atomic
**Route**: `/k/ai-tool`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that lets the user generate quizzes or flashcards from uploaded files via AI. The teacher/student uses this to convert PDFs into practice material. Arrives here from the KLayout sidebar (default landing after `/k`).

## Screen Layout

KLayout-wrapped page containing 2 tab panels (Test / Flashcard) driven by `useAIGeneratorStore`. Top: model selector + job history. Middle: large upload zone. Bottom: per-tab configuration (count, narrow, keyword) + preview + save.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: AIToolPage Main                     │
│  ┌─ ModelSelector (top right) ────────┐ │
│  ├─ Tabs: [Test] [Flashcard]          │ │
│  ├─ RecentFilesModal trigger         │ │
│  ├─ Upload zone (PDF drop/picker)     │ │
│  ├─ Per-tab config: count, narrow,    │ │
│  │   keyword, file name              │ │
│  └─ Preview + Save button            │ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2 | AIToolPage main | static | yes | AIToolPage, Tabs, ModelSelector, TestGenerator/FlashcardGenerator | fluid |

## User Flow

### Happy Path

1. User lands on page (default tab = "Test")
2. User clicks upload zone → file picker → selects PDF
3. User configures: question count (default 10), narrow search (default true), keyword (optional)
4. User clicks "Generate" → POST `/ai-study/generate` (multipart) → returns `{ jobId }`
5. `useJobStore.setCurrentJobId(jobId, expectedResultType)` → persists to localStorage `pending_generation_job`
6. Frontend polls `GET /ai-study/generate/status/{jobId}` every 10s (max 360 attempts / 60min)
7. On COMPLETED: `generatedTest` / `generatedCards` stored, recent uploads refreshed
8. User reviews preview → clicks "Save" → creates QuizSet/FlashCardSet

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Pending job on mount | localStorage has `pending_generation_job` | `PendingJobDialog` shown — "Continue" or "Cancel" | `examio-fe/src/components/organisms/PendingJobDialog.tsx:42` |
| Switch tab | User clicks Flashcard tab | Render FlashcardGenerator instead of TestGenerator | `examio-fe/src/pages/k/AIToolPage.tsx:88` |
| File too large | `file.size > MAX_UPLOAD_BYTES` | Inline error "File exceeds 50MB limit" | `examio-fe/src/components/organisms/k/FlashcardGenerator.tsx:152` |
| Job failed | API status FAILED | "Regenerate" CTA in preview area | `examio-fe/src/components/organisms/k/FlashcardGenerator.tsx:201` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| selectedModel | "Gemini 1.5 Pro" | `useAIModelCatalogStore` | dropdown | — | N/A |
| questionCount | "10 questions" | `useTestGeneratorStore.questionCount` | slider 5-50 | default 10 | N/A |
| isNarrow | "Narrow search" | `useTestGeneratorStore.isNarrow` | checkbox | default true | N/A |
| keyword | "keyword..." | `useTestGeneratorStore.keyword` | text input | empty | N/A |
| uploadedFile | "report.pdf" | `useTestGeneratorStore.file` | file input | "Drop PDF here" placeholder | MODEL-027 |
| recentUploads | recent file chips | `useRecentUploadsStore.recentUploads` | chips | empty list | MODEL-027 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | API in-flight (model list) | skeleton model selector | none | `examio-fe/src/hooks/useAIModelCatalogStore.ts:42` |
| generating | Job running | "Generating... (X/360)" progress | cancel | `examio-fe/src/stores/useAIGeneratorStore.ts:88` |
| completed | Job succeeded | Preview card with results | save, regenerate | `examio-fe/src/components/organisms/k/TestGenerator.tsx:142` |
| failed | Job error | Error card + retry CTA | retry | `examio-fe/src/components/organisms/k/TestGenerator.tsx:165` |
| empty | No file selected | upload dropzone CTA | drop file | `examio-fe/src/components/atoms/k/RecentFileItem.tsx:31` |
| error | API error | toast + inline error message | retry | `examio-fe/src/lib/errorHandler.ts:42` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| file | PDF | yes | ≤50MB, .pdf extension | none | "File must be a PDF" / "File exceeds 50MB" |
| questionCount | integer | yes | 5 ≤ n ≤ 50 | none | "Min 5, max 50 questions" |
| keyword | string | no | ≤100 chars | none | "Keyword too long" |

### B) Server-side

#### Generate AI job
- **Endpoint:** `POST /api/v1/ai-study/generate` (multipart)
- **Request:** `{ file, modelId, count, isNarrow, keyword, typeResult }`
- **Success:** `201` → `{ jobId, expectedResultType }`
- **Errors:** `400` (validation) | `413` (file too large) | `500` (server error)
- **Trigger:** "Generate" button click
- **Source:** `examio-fe/src/apis/examApi.ts:42`

#### Poll job status
- **Endpoint:** `GET /api/v1/ai-study/generate/status/{jobId}`
- **Success:** `200` → `{ status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED', result?, error? }`
- **Trigger:** every 10s after job start
- **Source:** `examio-fe/src/apis/aiApi.ts:88`

## Interaction Patterns

- **Polling every 10s after job start, max 360 attempts** — source: `examio-fe/src/stores/useAIGeneratorStore.ts:212`
- **Job state persisted to localStorage for resume on page reload** — source: `examio-fe/src/stores/useAIGeneratorStore.ts:88`
- **Tab change resets per-tab config** — source: `examio-fe/src/pages/k/AIToolPage.tsx:95`
- **beforeunload warning while job running** — source: `examio-fe/src/hooks/useGenerationGuard.ts:42`
- **Recent files modal shows last 20 uploads** — source: `examio-fe/src/components/organisms/RecentFilesModal.tsx:31`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Tabs have role=tablist, dropzone lacks aria-label |
| Keyboard navigation | supported | Tab through controls, Enter to submit |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | Tab changes not announced |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| activeTab === 'test' | feature-flag | TestGenerator | FlashcardGenerator | swap on tab change |
| `pendingJob !== null` | feature-flag | PendingJobDialog | (modal overlay) | shown on mount if job in progress |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| TurnstileGuard on /ai-tool | auth (bot) | bypass bot detection |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |
| R2 multipart upload size cap (50MB) | permission | server OOM |

## Source References

- Page/View: `examio-fe/src/pages/k/AIToolPage.tsx:1`
- TestGenerator: `examio-fe/src/components/organisms/k/TestGenerator.tsx:1`
- FlashcardGenerator: `examio-fe/src/components/organisms/k/FlashcardGenerator.tsx:1`
- Store: `examio-fe/src/stores/useAIGeneratorStore.ts:1`
- API: `examio-fe/src/apis/examApi.ts:42` + `examio-fe/src/apis/aiApi.ts:88`
- JobGuard: `examio-fe/src/hooks/useGenerationGuard.ts:1`
