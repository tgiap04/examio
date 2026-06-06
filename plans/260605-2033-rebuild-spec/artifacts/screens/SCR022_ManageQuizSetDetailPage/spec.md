# SCR018: ManageQuizSetDetailPage — Screen Spec

**Screen**: SCR018: ManageQuizSetDetailPage
**Type**: atomic
**Route**: `/k/manage-quiz-set/:id`
**Generated**: 2026-06-06

## Purpose

A teacher edits a specific quiz set — managing its chapter/section labels and adding, editing, or deleting individual questions — accessed by clicking a quiz set from the ManageExamPage or MyMaterialsPage.

## Screen Layout

The page is a single-column full-height layout (`min-h-screen`) with `max-w-7xl mx-auto` centering. Vertical regions stack top to bottom: a breadcrumb + tag bar header, a 2-column stat cards row (question count, creation date), a `LabelManager` section, and a `Card`-wrapped question list with inline search and a paginated question table. Modals (`DeleteConfirmDialog`) float above the content. Responsive: stat cards stack to single column on mobile; question list is a single-column scrollable card list. (source: `examio-fe/src/pages/k/ManageQuizSetDetailPage.tsx`:191–492)

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ R1: Header (static) — breadcrumb + tags bar          │
├────────────────────────┬────────────────────────────┤
│ R2: Stat Card 1       │ R3: Stat Card 2             │
│ (static)              │ (static)                     │
├────────────────────────┴────────────────────────────┤
│ R4: LabelManager (static) — label CRUD               │
├─────────────────────────────────────────────────────┤
│ R5: Question List (scrollable) — search + paginated │
│     [inline add form if showQuestionForm]            │
├─────────────────────────────────────────────────────┤
│ R6: DeleteConfirmDialog (overlay, conditional)       │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|-----------|----------------|---------------------|
| R1 | Header | static | no | `Breadcrumb`, `Badge` | fluid |
| R2 | Stat Card — Question Count | static | no | `Card` | full-width-sm |
| R3 | Stat Card — Created Date | static | no | `Card` | full-width-sm |
| R4 | LabelManager | static | no | `LabelManager` | fluid |
| R5 | Question List | static | yes | `InlineQuestionEditor`, `RichTextViewer`, `DeleteConfirmDialog` | full-width |
| R6 | DeleteConfirmDialog | overlay | no | `DeleteConfirmDialog` | modal on all sizes |

## User Flow

### Happy Path

1. User lands on `/k/manage-quiz-set/:id`; `fetchQuizSetById(id)` loads quiz set metadata; `fetchQuestions()` loads first page of questions
2. Skeleton loader renders while `loading` is true
3. On resolve, page renders breadcrumb, stat cards, `LabelManager`, and question list
4. User types in the question search bar → debounced 300ms → filters displayed questions client-side by text match; highlights matching text in yellow
5. User clicks "Thêm câu hỏi" → `InlineQuestionEditor` renders inline (no dialog) in R5 above the list
6. User fills the editor form and saves → `handleSaveQuestion()` calls `addQuestion()` → editor collapses, `fetchQuestions()` re-fires, new question appears in list
7. User clicks the Edit (pencil) button on a question row → `InlineQuestionEditor` replaces that row inline for in-place editing
8. User saves the edit → `updateQuestionInQuizSet()` API call → local state updated with returned question; editor collapses back to read-only row
9. User clicks the Delete (trash) button → `DeleteConfirmDialog` opens
10. User confirms deletion → `deleteQuestion()` → `fetchQuestions()` re-fires; if last item on last page, page decrements to `currentPage - 1`
11. User clicks a label filter in `LabelManager` → `handleLabelChange()` fires → label questions cache invalidated → `fetchQuestions()` re-fires with updated data

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading || !currentQuizSet` | initial load | skeleton UI renders (3 stat card skeletons + question area skeleton) | `ManageQuizSetDetailPage.tsx:174` |
| Search yields 0 matches | `debouncedSearch && displayed.length === 0` | "Không tìm thấy câu hỏi phù hợp" empty state in list | `ManageQuizSetDetailPage.tsx:321` |
| Question list empty | `paginatedQuestions.length === 0` | "Chưa có câu hỏi nào" empty state with CTA | `ManageQuizSetDetailPage.tsx:476` |
| Delete last item on last page | `paginatedQuestions.length === 1 && currentPage > 1` | `currentPage` decrements by 1 after delete | `ManageQuizSetDetailPage.tsx:137` |
| Inline editor already open | `showQuestionForm === true` | "Thêm câu hỏi" button disabled; no second editor opens | `ManageQuizSetDetailPage.tsx:283` |
| Search clears page reset | search input change | `currentPage` resets to 1 before API re-fires | `ManageQuizSetDetailPage.tsx:270` |
| `showQuestionForm && selectedQuestion` | edit mode | `InlineQuestionEditor` renders for the selected question row | `ManageQuizSetDetailPage.tsx:353` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| currentQuizSet.title | Tên bộ đề | `fetchQuizSetById` → `currentQuizSet.title` | string | hidden | `MODEL-007.title` |
| currentQuizSet.tags | Tags | `currentQuizSet.tags` | string array | hidden | `MODEL-007.tags` |
| currentQuizSet.createdAt | Ngày tạo | `currentQuizSet.createdAt` | `toLocaleDateString("vi-VN")` | `—` | `MODEL-007.createdAt` |
| currentQuizSet.labels | Nhãn | `currentQuizSet.labels` | array | none | `MODEL-008.id` |
| totalQuestions | Tổng số câu | `pagination.total` | integer | `0` | `MODEL-009.id` |
| question.question | Câu hỏi | paginated list | HTML via `RichTextViewer` | `—` | `MODEL-009.question` |
| question.options | Các lựa chọn | paginated list | 4 options A–D rendered as bordered cards | `—` | `MODEL-009.options` |
| question.answer | Đáp án | paginated list | highlighted in coral if correct | `—` | `MODEL-009.answer` |
| question.label | Nhãn câu hỏi | paginated list | colored badge | hidden | `MODEL-010.labelId` |
| question.index | Số thứ tự | computed `actualIndex` | monospace number | `—` | `N/A` |
| pagination.totalPages | Tổng trang | API response | integer | `0` | `N/A` |
| pagination.currentPage | Trang | local state | integer | `1` | `N/A` |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `loading || !currentQuizSet` | 3 skeleton cards + skeleton list rows | none | `ManageQuizSetDetailPage.tsx:174` |
| questionsLoading | `questionsLoading` | 3 skeleton rows in question list area | none | `ManageQuizSetDetailPage.tsx:303` |
| empty (no questions) | `paginatedQuestions.length === 0 && !questionsLoading` | empty state illustration + "Chưa có câu hỏi nào" text | click "Thêm câu hỏi" CTA | `ManageQuizSetDetailPage.tsx:476` |
| empty (search no results) | `debouncedSearch && displayed.length === 0` | search empty state message | clear search | `ManageQuizSetDetailPage.tsx:321` |
| inline add form open | `showQuestionForm && !selectedQuestion` | `InlineQuestionEditor` renders above question list | fill + save or cancel | `ManageQuizSetDetailPage.tsx:290` |
| inline edit form open | `showQuestionForm && selectedQuestion` | `InlineQuestionEditor` replaces read-only question row | fill + save or cancel | `ManageQuizSetDetailPage.tsx:353` |
| delete dialog open | `isDeleteDialogOpen` | `DeleteConfirmDialog` modal | confirm or cancel | `ManageQuizSetDetailPage.tsx:485` |
| success (question saved) | `handleSaveQuestion` resolves | form collapses; list updates | dismiss | `ManageQuizSetDetailPage.tsx:146` |
| success (question deleted) | `deleteQuestion` resolves | dialog closes; list refreshes | dismiss | `ManageQuizSetDetailPage.tsx:122` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| question text | string | yes | min 1 char (handled by `InlineQuestionEditor` form) | none | per form component |
| options (4 fields) | string[] | yes | each min 1 char | none | per form component |
| answer | string | yes | must match one option | none | per form component |
| label | string | no | must match existing label ID | none | N/A |

### B) Server-side

#### Add question
- **Endpoint:** `POST /api/v1/quizsets/:id/questions` → via `addQuestion()` in `useQuizSetStore`
- **Request:** `InlineQuestionFormData` (question text, options, answer, labelId)
- **Success:** `201` → `fetchQuestions()` re-fires; inline editor collapses
- **Errors:** `[UNVERIFIED]` server error → inline form stays open; no error shown
- **Trigger:** save button in `InlineQuestionEditor` (add mode)
- **Source:** `ManageQuizSetDetailPage.tsx:161`

#### Update question
- **Endpoint:** `PUT /api/v1/quizsets/:quizSetId/questions/:questionId` → via `updateQuestionInQuizSet()`
- **Request:** `InlineQuestionFormData` (question text, options, answer, labelId)
- **Success:** `200` → local state updated with returned question; inline editor collapses
- **Errors:** `[UNVERIFIED]` server error → inline form stays open
- **Trigger:** save button in `InlineQuestionEditor` (edit mode)
- **Source:** `ManageQuizSetDetailPage.tsx:152`

#### Delete question
- **Endpoint:** `DELETE /api/v1/quizsets/:quizSetId/questions/:questionId` → via `deleteQuestion()` in store
- **Request:** `{ quizSetId, questionId }`
- **Success:** `200` → list refreshes; dialog closes; page decrements if last item on last page
- **Errors:** `[UNVERIFIED]` server error → dialog stays open
- **Trigger:** confirm in `DeleteConfirmDialog`
- **Source:** `ManageQuizSetDetailPage.tsx:122`

#### Fetch questions (paginated)
- **Endpoint:** `GET /api/v1/quizsets/:id/questions` → via `getQuizSetQuestionsApi()`
- **Request:** `{ page, limit: 9 }`
- **Success:** `200` → `paginatedQuestions` + `pagination` state updated
- **Errors:** error toast "Failed to fetch questions:" logged
- **Trigger:** mount, page change, search debounce
- **Source:** `ManageQuizSetDetailPage.tsx:88`

#### Fetch quiz set by ID
- **Endpoint:** `GET /api/v1/quizsets/:id` → via `fetchQuizSetById()` in store
- **Request:** `{ id }`
- **Success:** `200` → `currentQuizSet` state updated
- **Errors:** `[UNVERIFIED]`
- **Trigger:** mount
- **Source:** `ManageQuizSetDetailPage.tsx:82`

## Interaction Patterns

- **Inline question editing** — `InlineQuestionEditor` replaces the read-only question row in-place (no dialog); edit mode triggered by clicking Edit button; source: `ManageQuizSetDetailPage.tsx:353`
- **Client-side search highlighting** — matching text in question HTML stripped of tags, matched case-insensitively, highlighted with `<mark class="bg-yellow-200">`; source: `ManageQuizSetDetailPage.tsx:334–351`
- **Label cache invalidation** — `invalidateLabelQuestionsCache(labelId)` called on question add/update/delete if the question had a label; source: `ManageQuizSetDetailPage.tsx:67–70,133`
- **Debounced search** — `useDebounce(questionSearch, 300)` delays client-side filter re-run; page resets to 1 on search input change; source: `ManageQuizSetDetailPage.tsx:60,270`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `aria-label` on edit/delete buttons via `Button` component |
| Keyboard navigation | unknown | no explicit keyboard shortcuts; pagination buttons support tab |
| Focus management | unknown | no explicit focus management in page |
| Screen reader compatibility | unknown | no semantic landmarks confirmed |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading || !currentQuizSet` | data-driven | skeleton UI | full content | `ManageQuizSetDetailPage.tsx:174` |
| `showQuestionForm && !selectedQuestion` | feature-flag | inline add editor above list | — | `ManageQuizSetDetailPage.tsx:290` |
| `showQuestionForm && selectedQuestion` | feature-flag | inline edit editor replacing row | read-only row | `ManageQuizSetDetailPage.tsx:353` |
| `questionsLoading` | data-driven | 3 skeleton list rows | question list | `ManageQuizSetDetailPage.tsx:303` |
| `debouncedSearch` value | feature-flag | highlighted search matches in question text | plain text | `ManageQuizSetDetailPage.tsx:334` |
| `totalPages <= 1` | data-driven | pagination controls hidden | pagination bar | `ManageQuizSetDetailPage.tsx:437` |

## Component Variants

Omit — no shared polymorphic component rendered on this page.

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| Route guard on `/k/manage-quiz-set/:id` | auth | Redirect to `/login` if unauthenticated (parent K layout) |
| No teacher-role guard in page | permission | Any authenticated user can access; `[UNVERIFIED]` API enforces owner-only |

No `TeacherRoute` wrapper in this page. Auth is handled by the parent K layout shell. Backend likely enforces that only the quiz set owner can modify questions.

## Source References

- Page: `examio-fe/src/pages/k/ManageQuizSetDetailPage.tsx`
- Quiz set store: `examio-fe/src/stores/useQuizSetStore.ts`
- Quiz set API: `examio-fe/src/apis/quizsetApi.ts`
- Store cache: `examio-fe/src/lib/storeCache.ts`
- Debounce hook: `examio-fe/src/hooks/useDebounce.ts`
- InlineQuestionEditor: `examio-fe/src/components/organisms/InlineQuestionEditor.tsx` (referenced, not read)
- LabelManager: `examio-fe/src/components/organisms/LabelManager.tsx` (referenced, not read)
- DeleteConfirmDialog: `examio-fe/src/components/organisms/DeleteConfirmDialog.tsx` (referenced, not read)
