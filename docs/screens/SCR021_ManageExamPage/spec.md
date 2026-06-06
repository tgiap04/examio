# SCR017: ManageExamPage — Screen Spec

**Screen**: SCR017: ManageExamPage
**Type**: atomic
**Route**: `/k/manage-exam`
**Generated**: 2026-06-06

## Purpose

A teacher views and manages their authored quiz sets — creating, editing, and deleting them — accessed from the protected dashboard sidebar under the exam management section.

## Screen Layout

The page renders inside a `TeacherRoute` wrapper with a `max-w-7xl mx-auto` container and standard padding. The layout is a vertical stack: a header row (title + create button), a stats summary section (4 metric cards), and a full-width data table with search/filter controls. The table scrolls independently. Responsive: table scrolls horizontally on small screens. (source: `examio-fe/src/pages/k/ManageExamPage.tsx`:207–247)

### Layout Sketch

```
┌────────────────────────────────────────────────────┐
│ R1: Header (static) — title + Create button       │
├────────────────────────────────────────────────────┤
│ R2: Stats Summary (static) — 4 metric cards        │
├────────────────────────────────────────────────────┤
│ R3: Table Controls (static) — search + filter       │
├────────────────────────────────────────────────────┤
│ R4: Exam Table (scrollable) — paginated rows       │
└────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|-----------|----------------|---------------------|
| R1 | Header | static | no | `ExamManagementTemplate` (internal) | fluid |
| R2 | Stats Summary | static | no | `ExamManagementTemplate` (internal) | 4-col grid → 2-col on mobile |
| R3 | Table Controls | static | no | `ExamManagementTemplate` (internal) | stacked on mobile |
| R4 | Exam Table | static | yes (horizontal) | `ExamManagementTemplate` (internal) | horizontal scroll-sm |

## User Flow

### Happy Path

1. User lands on `/k/manage-exam`; `TeacherRoute` checks auth → renders content
2. On mount, `fetchQuizStats()` loads aggregate stats; `loadQuizSets()` fetches paginated quiz set list (first page, `limit=10`)
3. `ExamManagementTemplate` renders stats cards + search bar + filter dropdown + exam table
4. User types in search → debounced 500ms → `loadQuizSets()` re-fires with `search` param
5. User changes status filter dropdown → `loadQuizSets()` re-fires with `isPublic` param
6. User clicks "Tạo đề thi mới" → `QuizSetModal` opens in create mode
7. User fills form and submits → `handleCreateSubmit()` calls `createQuizSet()` → modal closes, stats + list refresh
8. User clicks row View button → `handleViewExam(id)` navigates to `/k/manage-quiz-set/:id`
9. User clicks row Edit button → `handleEditExam(id)` populates form + opens `QuizSetModal` in edit mode
10. User clicks row Delete button → `DeleteConfirmDialog` opens → confirm → `deleteQuizSet()` → list + stats refresh

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading && quizSetsK.length === 0` | initial load | `TableSkeletonLoader` renders | `ManageExamPage.tsx:231` |
| Search query changes | debounced 500ms | `loadQuizSets()` re-fires; table updates | `ManageExamPage.tsx:41,69` |
| Status filter changes | dropdown select | `loadQuizSets()` re-fires; table updates | `ManageExamPage.tsx:70` |
| Create fails | `createQuizSet()` throws | error logged; modal stays open | `ManageExamPage.tsx:188` |
| Delete fails | `deleteQuizSet()` throws | error logged; dialog stays open | `ManageExamPage.tsx:159` |
| Empty result set | `quizSetsK.length === 0` after load | empty state rendered by template | `ManageExamPage.tsx:232` |
| Edit form pre-fill | `quizSetsK.find(id)` | `editFormData` populated; modal opens | `ManageExamPage.tsx:129` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| stats.totalExams | Tổng số đề | `fetchQuizStats()` → `totalGroups` | integer | `0` | `MODEL-007.id` |
| stats.totalExamsTrend | Xu hướng đề | `totalGroupsTrend` | integer delta | `0` | `N/A` |
| stats.activeExams | Đề đang hoạt động | `activeExams` | integer | `0` | `N/A` |
| stats.totalQuestions | Tổng số câu hỏi | `totalQuestions` | integer | `0` | `MODEL-009.id` |
| stats.totalQuestionsTrend | Xu hướng câu hỏi | `totalQuestionsTrend` | integer delta | `0` | `N/A` |
| stats.completionRate | Tỷ lệ hoàn thành | `completionRate` | percentage | `0%` | `N/A` |
| exam.name | Tên đề thi | `quizSet.title` | string | `—` | `MODEL-007.title` |
| exam.description | Mô tả | `quizSet.description` | string | `—` | `MODEL-007.description` |
| exam.questionCount | Số câu hỏi | `quizSet.questionCount` | integer | `—` | `MODEL-007.detailsQuizQuestions` |
| exam.status | Trạng thái | `quizSet.isPublic` | public/private | `—` | `MODEL-007.isPublic` |
| exam.createdDate | Ngày tạo | `quizSet.createdAt` | `toLocaleDateString("vi-VN")` | `—` | `MODEL-007.createdAt` |
| exam.lastStudied | Lần cuối học | `quizSet.lastStudied` | `toLocaleDateString("vi-VN")` | `—` | `MODEL-007.updatedAt` |
| exam.tags | Nhãn | `quizSet.tags` | string array | hidden | `MODEL-007.tags` |
| exam.thumbnail | Ảnh bìa | `quizSet.thumbnail` | URL string | hidden | `MODEL-007.thumbnail` |
| totalResults | Tổng số kết quả | computed from API response | integer | `0` | `N/A` |
| currentPage | Trang hiện tại | local state | integer | `1` | `N/A` |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `loading && quizSetsK.length === 0` | `TableSkeletonLoader` (10 rows) | none | `ManageExamPage.tsx:231` |
| empty | `quizSetsK.length === 0` after load | empty state in template | N/A | `ManageExamPage.tsx:232` |
| error | `catch` in any mutation | error logged to console (no toast) | retry via re-mount | `ManageExamPage.tsx:159,188` |
| saving (create) | `createQuizSet()` in-flight | modal spinner; form disabled | none | `ManageExamPage.tsx:168` |
| saving (edit) | `updateQuizSet()` in-flight | modal spinner; form disabled | none | `ManageExamPage.tsx:196` |
| saving (delete) | `deleteQuizSet()` in-flight | dialog spinner; confirm button disabled | none | `ManageExamPage.tsx:151` |
| success (create/edit/delete) | mutation resolves | modal/dialog closes; list + stats refresh | dismiss | `ManageExamPage.tsx:186,218,156` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| title | string | yes | min 1 char (HTML5) | none | browser default |
| description | string | no | none | none | N/A |
| isPublic | boolean | no | default false | none | N/A |
| tags | string[] | no | max length per tag | none | N/A |
| thumbnail | File \| string | no | image/* if File | none | N/A |

### B) Server-side

#### Create quiz set
- **Endpoint:** `POST /api/v1/quizsets` → via `createQuizSet()` in `useQuizSetStore`
- **Request:** `{ title, description, isPublic, isPinned, tags, thumbnail, questionCount: 0, questions: [] }` + optional thumbnail File
- **Success:** `201` → list + stats refresh; modal closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; modal stays open
- **Trigger:** `QuizSetModal` form submit
- **Source:** `ManageExamPage.tsx:166–194`

#### Update quiz set
- **Endpoint:** `PUT /api/v1/quizsets/:id` → via `updateQuizSet()` in `useQuizSetStore`
- **Request:** `{ title, description, isPublic, isPinned, tags, thumbnail, questionCount: 0, questions: [] }` + optional thumbnail File
- **Success:** `200` → list + stats refresh; modal closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; modal stays open
- **Trigger:** `QuizSetModal` form submit (edit mode)
- **Source:** `ManageExamPage.tsx:196–229`

#### Delete quiz set
- **Endpoint:** `DELETE /api/v1/quizsets/:id` → via `deleteQuizSet()` in `useQuizSetStore`
- **Request:** `{ id }`
- **Success:** `200` → list + stats refresh; dialog closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; dialog stays open
- **Trigger:** `DeleteConfirmDialog` confirm button
- **Source:** `ManageExamPage.tsx:151–164`

#### Fetch quiz sets (paginated)
- **Endpoint:** `GET /api/v1/quizsets` → via `fetchQuizSets()` in `useQuizSetStore`
- **Request:** `{ page, limit, search?, isPublic? }`
- **Success:** `200` → `quizSetsK` state + `totalResults` updated
- **Errors:** silent (no visible error state)
- **Trigger:** mount, search debounce, filter change, page change
- **Source:** `ManageExamPage.tsx:47–69`

#### Fetch quiz stats
- **Endpoint:** `GET /api/v1/quizsets/stats` → via `fetchQuizStats()` in `useStatsStore`
- **Request:** none
- **Success:** `200` → `quizStats` state updated
- **Errors:** silent
- **Trigger:** mount
- **Source:** `ManageExamPage.tsx:43`

## Interaction Patterns

- **Debounced search (500ms)** — `useDebounce(searchQuery, 500)` delays API call until user stops typing; source: `ManageExamPage.tsx:41,69`
- **Optimistic stats invalidation** — `invalidateQuizStats()` called before and after mutations to force refresh; source: `ManageExamPage.tsx:155,185,217`
- **Pagination state** — `currentPage` local state drives `loadQuizSets()`; source: `ManageExamPage.tsx:31,69`
- **Status filter maps to `isPublic` boolean** — `statusFilter === "public"` → `true`, `"private"` → `false`, `"all"` → `undefined`; source: `ManageExamPage.tsx:49–54`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `ExamManagementTemplate` may have `aria-label`; not confirmed from static analysis |
| Keyboard navigation | unknown | tab order depends on template; search input supports keyboard |
| Focus management | unknown | no explicit focus management in page |
| Screen reader compatibility | unknown | no semantic landmarks confirmed in page |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading && quizSetsK.length === 0` | data-driven | `TableSkeletonLoader` | template content | `ManageExamPage.tsx:231` |
| `quizSetsK.length === 0` after load | data-driven | empty state | table rows | via template |
| `debouncedSearchQuery` value | feature-flag | debounced search results | immediate results | `ManageExamPage.tsx:41` |
| `statusFilter === "all/public/private"` | feature-flag | filtered results | unfiltered list | `ManageExamPage.tsx:49` |

## Component Variants

Omit — no shared polymorphic component rendered on this page.

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `TeacherRoute` wrapper | auth | Renders nothing; redirects to `/login` if unauthenticated; redirects to `/` if authenticated but not teacher |
| Route guard on `/k/manage-exam` | auth | Same as above — parent K layout handles route-level guard |

`TeacherRoute` is a client-side auth gate. `[UNVERIFIED]` server enforcement — static analysis cannot confirm API middleware.

## Source References

- Page: `examio-fe/src/pages/k/ManageExamPage.tsx`
- Quiz set store: `examio-fe/src/stores/useQuizSetStore.ts`
- Stats store: `examio-fe/src/stores/useStatsStore.ts`
- Quiz set API: `examio-fe/src/apis/quizsetApi.ts`
- Debounce hook: `examio-fe/src/hooks/useDebounce.ts`
- ExamManagementTemplate: `examio-fe/src/templates/ExamManagementTemplate.tsx` (referenced, not read)
- TeacherRoute: `examio-fe/src/components/organisms/TeacherRoute.tsx`
