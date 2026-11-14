# SCR017_FlashcardsPage — Screen Spec

**Screen**: SCR017: FlashcardsPage
**Type**: atomic
**Route**: `/k/flash-card`
**Generated**: 2026-06-06

## Purpose

Authenticated users browse, search, filter, and manage their authored flashcard sets. They can create new decks, edit metadata, delete decks, and share decks via access code. The page shows aggregate stats (total decks, cards, views) and a paginated table of all flashcard sets with inline actions.

---

## Screen Layout

The page uses a single-column stacked layout rendered entirely inside `FlashcardManagementTemplate`. The template organizes content into four stacked sections: a header with the create button, a stats row, a search/filter bar, and a data table with pagination. No sidebar or tab bar is present. The page has no shell layout wrapper and uses the browser's default scroll. (source: `FlashcardsPage.tsx:257`)

### Layout Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  R1: FlashcardManagementHeader — title + "Tạo bộ thẻ" CTA   │
├──────────────────────────────────────────────────────────────┤
│  R2: FlashcardStatsSection — 3 stat cards (decks/cards/views)│
├──────────────────────────────────────────────────────────────┤
│  R3: FlashcardSearchFilterBar — search input + sort + filter│
├──────────────────────────────────────────────────────────────┤
│  R4: FlashcardTable — data rows with action buttons          │
├──────────────────────────────────────────────────────────────┤
│  R5: FlashcardTablePagination — page nav (conditional)       │
├──────────────────────────────────────────────────────────────┤
│  [Modal Stack — floating above all regions]                 │
│    FlashcardSetModal (create | edit mode)                   │
│    DeleteConfirmDialog                                       │
│    ShareFlashcardModal                                       │
└──────────────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | no | Title + create button | Always visible |
| R2 | Stats Row | static | no | 3 stat cards (groups/cards/views with trend) | `grid-cols-3` on sm+ |
| R3 | Search/Filter Bar | static | no | Search input, sort dropdown, status filter | Always visible |
| R4 | Data Table | static | yes | Table rows with manage/edit/delete/share actions | Full width, overflow-x scroll on small screens |
| R5 | Pagination | static | no | Page buttons + prev/next | Hidden when `totalResults === 0` |
| R6 | Modal Stack | absolute overlay | no | FlashcardSetModal, DeleteConfirmDialog, ShareFlashcardModal | Floating, `z-50` |

---

## User Flow

### Happy Path

1. User lands on `/k/flash-card`; `useEffect` calls `fetchFlashcardStats()` and `fetchFlashcardSets({ page: 1, limit, search, isPublic })`; stats cards and table render; skeleton shown until resolved. R2, R4
2. User types in search input; `debouncedSearchQuery` (500 ms) fires; `currentPage` resets to 1; `fetchFlashcardSets` re-fires with new search term; table re-renders with filtered results. R3 → R4
3. User selects a sort option (Mới nhất / Tên A-Z / Số thẻ / Lượt xem); `setSortBy` updates; `fetchFlashcardSets` re-fires; table re-sorts. R3 → R4
4. User selects a status filter (Tất cả / Công khai / Riêng tư); `setStatusFilter` updates; `fetchFlashcardSets` re-fires with `isPublic` flag. R3 → R4
5. User clicks **Tạo bộ thẻ** in header; `setIsCreateModalOpen(true)`; `FlashcardSetModal` in create mode opens. R6
6. User fills form (title required, description optional, isPublic toggle, tags); on submit `handleCreateSubmit` calls `createFlashcardSet`; on success modal closes, stats invalidated, `fetchFlashcardStats` re-fires. R6 → R2
7. User clicks **Sửa** on a table row; `handleEditFlashcard(id)` populates `editFormData` from the set; `setIsEditModalOpen(true)`; `FlashcardSetModal` in edit mode opens. R6
8. User clicks **Xóa** on a table row; `handleDeleteFlashcard(id)` sets selected ID; `setIsDeleteDialogOpen(true)`; `DeleteConfirmDialog` opens; on confirm `handleConfirmDelete` calls `deleteFlashcardSet`; on success stats invalidated. R6
9. User clicks **Chia sẻ** on a table row; `handleShareFlashcard(id)` sets selected ID and title; `setIsShareModalOpen(true)`; `ShareFlashcardModal` opens. R6
10. User clicks a page number; `setCurrentPage(page)`; `fetchFlashcardSets` re-fires with new page. R5 → R4

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading && flashcardSetsK.length === 0` | initial load | `TableSkeletonLoader` shown (10 rows) | `FlashcardsPage.tsx:253` |
| `response` from `fetchFlashcardSets` is falsy | API returns null | `setTotalResults(0)`; no rows rendered | `FlashcardsPage.tsx:65` |
| `fetchFlashcardSets` throws | API rejects | `[UNVERIFIED]` no error UI; table shows empty/previous data | `FlashcardsPage.tsx:71` |
| `createFlashcardSet` throws | API rejects | `[UNVERIFIED]` no error toast; modal stays open | `FlashcardsPage.tsx:212` |
| `deleteFlashcardSet` throws | API rejects | `[UNVERIFIED]` dialog stays open; stats not invalidated | `FlashcardsPage.tsx:181` |
| `thumbnail` is `File` instance | form data check | Extract as `thumbnailFile` for `createFlashcardSet` upload | `FlashcardsPage.tsx:196` |
| `thumbnail` is `string` | form data check | Pass as `thumbnailUrl` for `createFlashcardSet` update | `FlashcardsPage.tsx:197` |
| `totalResults === 0` | pagination state | Pagination component not rendered | `FlashcardsPage.tsx:88` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `stats.totalGroups` | Tổng bộ thẻ | API field | integer | `0` | MODEL-012 (count) |
| `stats.totalGroupsTrend` | Xu hướng bộ thẻ | API field | integer (+/-) | `0` | N/A |
| `stats.totalCards` | Tổng thẻ | API field | integer | `0` | MODEL-014 (count) |
| `stats.totalCardsTrend` | Xu hướng thẻ | API field | integer (+/-) | `0` | N/A |
| `stats.totalViews` | Tổng lượt xem | API field | integer | `0` | MODEL-012.viewCount |
| `stats.totalViewsTrend` | Xu hướng lượt xem | API field | integer (+/-) | `0` | N/A |
| `set.title` | Tiêu đề | API field | raw string | — | MODEL-012.title |
| `set.description` | Mô tả | API field | raw string | empty string shown | MODEL-012.description |
| `set.thumbnail` | Hình thu nhỏ | API field | URL | emoji icon fallback | MODEL-012.thumbnail |
| `set._count.detailsFlashCard` | Số thẻ | API field | integer + " thẻ" suffix | `0` | MODEL-015 |
| `set.viewCount` | Lượt xem | API field | integer | `0` | MODEL-012.viewCount |
| `set.isPublic` | Trạng thái | API field | boolean → "public" / "private" ExamStatus | — | MODEL-012.isPublic |
| `set.createdAt` | Ngày tạo | API field | `toLocaleDateString("vi-VN")` | — | MODEL-012.createdAt |
| `set.tags` | Tags | API field | string array | hidden if empty | MODEL-012.tag |
| `currentPage` | Trang | local state | integer (1-indexed) | `1` | N/A |
| `totalResults` | Tổng kết quả | API field | integer | `0` | N/A |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `fetchFlashcardSets` in-flight AND `flashcardSetsK.length === 0` | `TableSkeletonLoader` (10 rows) | none | `FlashcardsPage.tsx:253` |
| empty | `totalResults === 0` after load | Table shows 0 rows (no explicit empty state component) | none | `FlashcardsPage.tsx:67` |
| error | `fetchFlashcardSets` throws | `[UNVERIFIED]` no error UI | none | `FlashcardsPage.tsx:71` |
| create-modal-open | `isCreateModalOpen === true` | `FlashcardSetModal` renders in create mode | fill form, submit, cancel | `FlashcardsPage.tsx:281` |
| edit-modal-open | `isEditModalOpen === true` | `FlashcardSetModal` renders in edit mode with `initialData` | fill form, submit, cancel | `FlashcardsPage.tsx:289` |
| delete-dialog-open | `isDeleteDialogOpen === true` | `DeleteConfirmDialog` renders | confirm or cancel | `FlashcardsPage.tsx:298` |
| share-modal-open | `isShareModalOpen === true` | `ShareFlashcardModal` renders | interact with share dialog | `FlashcardsPage.tsx:307` |
| saving | `createFlashcardSet` or `updateFlashcardSet` in-flight | Modal submit button shows spinner | none | `FlashcardsPage.tsx:286,295` |
| deleting | `deleteFlashcardSet` in-flight | DeleteConfirmDialog confirm button shows spinner | none | `FlashcardsPage.tsx:303` |
| pagination | `totalResults > 0` | `FlashcardTablePagination` renders | click page buttons | `FlashcardsPage.tsx:88` |

---

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| title | text | yes | non-empty (from form schema) | none | [UNVERIFIED] from modal form |
| description | textarea | no | maxLength 500 | none | [UNVERIFIED] |
| isPublic | boolean | no | toggle | none | — |
| thumbnail | File \| string | no | image/* MIME if File | none | — |

### B) Server-side

#### Fetch flashcard sets
- **Endpoint:** `GET /flashcard-sets?page={page}&limit={limit}&search={search}&isPublic={isPublic}`
- **Request:** `{ page, limit, search?, isPublic? }` via query params
- **Success:** `200` → `{ data: FlashcardSet[], total: number }` → `setTotalResults(total)`
- **Errors:** `[UNVERIFIED]` — no user-visible error state
- **Trigger:** Page mount, page change, search debounce, filter change
- **Source:** `FlashcardsPage.tsx:58`

#### Fetch flashcard stats
- **Endpoint:** `GET /flashcard-sets/stats`
- **Request:** none
- **Success:** `200` → stats state updated; stats cards re-render
- **Errors:** `[UNVERIFIED]` — no user-visible error state
- **Trigger:** Page mount and after create/update/delete mutations
- **Source:** `FlashcardsPage.tsx:46`

#### Create flashcard set
- **Endpoint:** `POST /flashcard-sets` (via `createFlashcardSet` store action)
- **Request:** `{ title, description, isPublic, isPinned, tags, thumbnail }` + optional `thumbnailFile` FormData field
- **Success:** `200` → modal closes, stats invalidated, `fetchFlashcardStats` re-fires
- **Errors:** `[UNVERIFIED]` — no error toast; modal stays open
- **Trigger:** FlashcardSetModal submit (create mode)
- **Source:** `FlashcardsPage.tsx:199`

#### Update flashcard set
- **Endpoint:** `PUT /flashcard-sets/:id` (via `updateFlashcardSet` store action)
- **Request:** `{ title, description, isPublic, isPinned, tags, thumbnail }` + optional `thumbnailFile`
- **Success:** `200` → modal closes, `fetchFlashcardStats` re-fires
- **Errors:** `[UNVERIFIED]` — no error toast; modal stays open
- **Trigger:** FlashcardSetModal submit (edit mode)
- **Source:** `FlashcardsPage.tsx:228`

#### Delete flashcard set
- **Endpoint:** `DELETE /flashcard-sets/:id` (via `deleteFlashcardSet` store action)
- **Request:** none (id in URL)
- **Success:** `200` → dialog closes, stats invalidated, `fetchFlashcardStats` re-fires
- **Errors:** `[UNVERIFIED]` — dialog stays open; no error toast
- **Trigger:** DeleteConfirmDialog confirm button
- **Source:** `FlashcardsPage.tsx:176`

---

## Interaction Patterns

- **Debounced search** — `useDebounce(searchQuery, 500)` delays API call until user stops typing for 500 ms — source: `FlashcardsPage.tsx:43`
- **Status filter to isPublic mapping** — `statusFilter === "public" ? true : statusFilter === "private" ? false : undefined` converts filter label to API boolean — source: `FlashcardsPage.tsx:51`
- **Pagination resets search** — changing `currentPage` resets to page 1 via `useEffect` dependency; changing search also resets `currentPage` to 1 — source: `FlashcardsPage.tsx:71`
- **Thumbnail polymorphic handling** — `data.thumbnail instanceof File` for new uploads; `typeof data.thumbnail === "string"` for existing URL preservation — source: `FlashcardsPage.tsx:196`
- **Stats invalidation** — `invalidateFlashcardStats()` clears stats cache; `fetchFlashcardStats` re-fires after every mutation (create/update/delete) — source: `FlashcardsPage.tsx:210,183`
- **Edit form pre-population** — `handleEditFlashcard` finds set by ID and populates `editFormData` before opening modal — source: `FlashcardsPage.tsx:137`

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Table rows use `<tr>` semantics; action buttons have `aria-label`; modals use Radix `Dialog` component with `aria-modal` |
| Keyboard navigation | supported | Standard tab order; modal focus trap handled by Radix Dialog |
| Focus management | managed | Radix Dialog manages focus trap on open/close; [UNVERIFIED] focus return on close |
| Screen reader compatibility | unknown | `aria-live` not used for search/filter changes; no explicit role for stats section |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading && flashcardSetsK.length === 0` | auth | TableSkeletonLoader | FlashcardTable | |
| `totalResults === 0` | auth | Pagination hidden | FlashcardTablePagination | |
| `isCreateModalOpen` | auth | FlashcardSetModal (create) | — | |
| `isEditModalOpen` | auth | FlashcardSetModal (edit) with initialData | — | |
| `isDeleteDialogOpen` | auth | DeleteConfirmDialog | — | |
| `isShareModalOpen` | auth | ShareFlashcardModal | — | |
| `selectedFlashcardSetId` is truthy | auth | ShareFlashcardModal content | — | |

---

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| FlashcardSetModal | `mode` prop | create / edit | `open`, `onOpenChange`, `mode`, `initialData`, `isLoading`, `onSubmit` | N/A |
| DeleteConfirmDialog | N/A (single variant) | — | `open`, `onOpenChange`, `title`, `description`, `isLoading`, `onConfirm` | N/A |
| ShareFlashcardModal | N/A (single variant) | — | `open`, `onOpenChange`, `flashcardSetId`, `flashcardSetTitle` | N/A |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` on `/k/flash-card` | auth | Redirect to `/login` if not authenticated |
| CRUD operations scoped to own sets | auth | Server filters by `userId` from auth token — cannot modify other users' sets [UNVERIFIED] |
| Share settings only for set owner | permission | `updateSharingSettings` requires ownership — server-enforced [UNVERIFIED] |

---

## Source References

- Page/View: `kmaedu-fe/src/pages/k/FlashcardsPage.tsx:1`
- FlashcardManagementTemplate: `kmaedu-fe/src/templates/FlashcardManagementTemplate.tsx:1`
- FlashcardSetStore: `kmaedu-fe/src/stores/useFlashcardSetStore.ts:1`
- StatsStore: `kmaedu-fe/src/stores/useStatsStore.ts:1`
- FlashcardSetModal: `kmaedu-fe/src/components/organisms/FlashcardSetModal.tsx:1`
- DeleteConfirmDialog: `kmaedu-fe/src/components/organisms/DeleteConfirmDialog.tsx:1`
- ShareFlashcardModal: `kmaedu-fe/src/components/organisms/ShareFlashcardModal.tsx:1`
- useDebounce: `kmaedu-fe/src/hooks/useDebounce.ts:1`
