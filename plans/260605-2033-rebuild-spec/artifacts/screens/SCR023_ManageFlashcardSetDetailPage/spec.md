# SCR019: ManageFlashcardSetDetailPage — Screen Spec

**Screen**: SCR019: ManageFlashcardSetDetailPage
**Type**: atomic
**Route**: `/k/manage-flashcard-set/:id`
**Generated**: 2026-06-06

## Purpose

A teacher edits a specific flashcard deck — managing its chapter/section labels and adding, editing, or deleting individual flashcards — accessed by clicking a flashcard set from the FlashcardsPage or MyMaterialsPage.

## Screen Layout

The page is a single-column full-height layout (`min-h-screen`) with `max-w-7xl mx-auto` centering. Vertical regions stack top to bottom: a breadcrumb + description bar header, a 3-column stat cards row (total cards, view count, creation date), a `FlashcardLabelManager` section, and a `Card`-wrapped flashcard list with label filter and pagination. Two dialogs (`FlashcardEditorDialog`, `DeleteConfirmDialog`) float above the content. Responsive: stat cards stack to single column on mobile; flashcard grid shifts from 3→2→1 columns. (source: `kmaedu-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx`:218–465)

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ R1: Header (static) — breadcrumb + description       │
├─────────────────┬─────────────────┬─────────────────┤
│ R2: Stat Card 1 │ R3: Stat Card 2 │ R4: Stat Card 3 │
│ (total cards)   │ (view count)    │ (created date)  │
├─────────────────┴─────────────────┴─────────────────┤
│ R5: FlashcardLabelManager (static)                  │
├─────────────────────────────────────────────────────┤
│ R6: Flashcard List (scrollable) — filter + grid     │
│     [FlashcardEditorDialog overlay]                  │
│     [DeleteConfirmDialog overlay]                    │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|-----------|----------------|---------------------|
| R1 | Header | static | no | `Breadcrumb`, `Badge` | fluid |
| R2 | Stat Card — Total Cards | static | no | `Card` | full-width-sm |
| R3 | Stat Card — View Count | static | no | `Card` | full-width-sm |
| R4 | Stat Card — Created Date | static | no | `Card` | full-width-sm |
| R5 | FlashcardLabelManager | static | no | `FlashcardLabelManager` | fluid |
| R6 | Flashcard List | static | yes | `FlashcardEditorDialog`, `DeleteConfirmDialog` | 3-col→2-col→1-col grid |
| R7 | FlashcardEditorDialog | overlay | no | `FlashcardEditorDialog` | modal on all sizes |
| R8 | DeleteConfirmDialog | overlay | no | `DeleteConfirmDialog` | modal on all sizes |

## User Flow

### Happy Path

1. User lands on `/k/manage-flashcard-set/:id`; `fetchFlashcardSetById(id)` loads deck metadata; `fetchFlashcards()` loads first page; `fetchLabels()` loads labels
2. Skeleton loader renders while `loading` is true
3. On resolve, page renders breadcrumb, stat cards, `FlashcardLabelManager`, and flashcard grid
4. User selects a label filter from the dropdown → `setSelectedLabelId()` → `currentPage` resets to 1 → `fetchFlashcards()` re-fires with label filter
5. User clicks "Thêm thẻ" → `FlashcardEditorDialog` opens in add mode
6. User fills the form (question + answer) and saves → `handleSaveCard()` calls `addFlashcard()` → dialog closes, `fetchFlashcards()` re-fires, new card appears
7. User clicks the Edit (pencil) button on a card → `FlashcardEditorDialog` opens pre-filled with the card data
8. User saves the edit → `updateFlashcardInFlashcardSet()` API call → local state updated; dialog closes
9. User clicks the Delete (trash) button → `DeleteConfirmDialog` opens
10. User confirms deletion → `deleteFlashcard()` → `fetchFlashcards()` re-fires; if last item on last page, page decrements
11. User clicks a label in `FlashcardLabelManager` → `handleLabelChange()` fires → label cache invalidated → `fetchLabels()` re-fires

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading || !currentFlashcardSet` | initial load | skeleton UI renders (stat card skeletons + list skeleton) | `ManageFlashcardSetDetailPage.tsx:202` |
| Flashcard list empty | `paginatedFlashcards.length === 0` | "Chưa có thẻ nhớ nào" empty state with CTA | `ManageFlashcardSetDetailPage.tsx:449` |
| Delete last item on last page | `paginatedFlashcards.length === 1 && currentPage > 1` | `currentPage` decrements by 1 after delete | `ManageFlashcardSetDetailPage.tsx:168` |
| Label filter "Chưa gán nhãn" | `selectedLabelId === "unlabeled"` | API fetches cards with null labelId | `ManageFlashcardSetDetailPage.tsx:325` |
| Edit mode pre-fill | `selectedCard` is set | `FlashcardEditorDialog` pre-filled with card data | `ManageFlashcardSetDetailPage.tsx:299` |
| Label changed in manager | `handleLabelChange` fires | label cache invalidated; `fetchLabels()` re-fires | `ManageFlashcardSetDetailPage.tsx:127` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| currentFlashcardSet.title | Tên bộ flashcard | `fetchFlashcardSetById` → `currentFlashcardSet.title` | string | hidden | `MODEL-012.title` |
| currentFlashcardSet.description | Mô tả | `currentFlashcardSet.description` | string | hidden | `MODEL-012.description` |
| currentFlashcardSet.tags | Tags | `currentFlashcardSet.tags` | string array | hidden | `MODEL-012.tag` |
| currentFlashcardSet.viewCount | Lượt xem | `currentFlashcardSet.viewCount` | integer | `0` | `MODEL-012.viewCount` |
| currentFlashcardSet.createdAt | Ngày tạo | `currentFlashcardSet.createdAt` | `toLocaleDateString("vi-VN")` | `—` | `MODEL-012.createdAt` |
| totalFlashcards | Tổng số thẻ | `pagination.total` | integer | `0` | `MODEL-014.id` |
| card.question | Câu hỏi (mặt trước) | paginated list | HTML via `RichTextViewer` | `—` | `MODEL-014.question` |
| card.answer | Trả lời (mặt sau) | paginated list | HTML via `RichTextViewer` | `—` | `MODEL-014.answer` |
| card.label | Nhãn thẻ | paginated list | colored badge with dot | hidden | `MODEL-015.labelId` |
| card.index | Số thứ tự | computed `actualIndex` | badge "Thẻ N" | `—` | `N/A` |
| availableLabels | Danh sách nhãn | `fetchLabels()` | array of `{id, name, color}` | empty select | `MODEL-013.id` |
| pagination.totalPages | Tổng trang | API response | integer | `0` | `N/A` |
| pagination.currentPage | Trang | local state | integer | `1` | `N/A` |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `loading || !currentFlashcardSet` | skeleton UI (card skeletons + list skeleton) | none | `ManageFlashcardSetDetailPage.tsx:202` |
| flashcardsLoading | `flashcardsLoading` | 6 skeleton cards in grid | none | `ManageFlashcardSetDetailPage.tsx:348` |
| empty (no cards) | `paginatedFlashcards.length === 0 && !flashcardsLoading` | empty state illustration + "Chưa có thẻ nhớ nào" text | click "Thêm thẻ" CTA | `ManageFlashcardSetDetailPage.tsx:449` |
| editor dialog open (add) | `showCardForm && !selectedCard` | `FlashcardEditorDialog` modal with empty form | fill + save or cancel | `ManageFlashcardSetDetailPage.tsx:298` |
| editor dialog open (edit) | `showCardForm && selectedCard` | `FlashcardEditorDialog` modal pre-filled | fill + save or cancel | `ManageFlashcardSetDetailPage.tsx:299` |
| delete dialog open | `isDeleteDialogOpen` | `DeleteConfirmDialog` modal | confirm or cancel | `ManageFlashcardSetDetailPage.tsx:458` |
| success (card saved) | `handleSaveCard` resolves | dialog closes; list updates | dismiss | `ManageFlashcardSetDetailPage.tsx:177` |
| success (card deleted) | `deleteFlashcard` resolves | dialog closes; list refreshes | dismiss | `ManageFlashcardSetDetailPage.tsx:153` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| question | string | yes | min 1 char (handled by `FlashcardEditorDialog` form) | none | per form component |
| answer | string | yes | min 1 char | none | per form component |
| label | string | no | must match existing label ID | none | N/A |

### B) Server-side

#### Add flashcard
- **Endpoint:** `POST /api/v1/flashcardsets/:id/cards` → via `addFlashcard()` in `useFlashcardSetStore`
- **Request:** `FlashcardFormData` (question, answer, labelId)
- **Success:** `201` → `fetchFlashcards()` re-fires; dialog closes
- **Errors:** `[UNVERIFIED]` server error → dialog stays open; no error shown
- **Trigger:** save button in `FlashcardEditorDialog` (add mode)
- **Source:** `ManageFlashcardSetDetailPage.tsx:192`

#### Update flashcard
- **Endpoint:** `PUT /api/v1/flashcardsets/:id/cards/:cardId` → via `updateFlashcardInFlashcardSet()`
- **Request:** `FlashcardFormData` (question, answer, labelId)
- **Success:** `200` → local state updated with returned card; dialog closes
- **Errors:** `[UNVERIFIED]` server error → dialog stays open
- **Trigger:** save button in `FlashcardEditorDialog` (edit mode)
- **Source:** `ManageFlashcardSetDetailPage.tsx:183`

#### Delete flashcard
- **Endpoint:** `DELETE /api/v1/flashcardsets/:id/cards/:cardId` → via `deleteFlashcard()` in store
- **Request:** `{ flashcardSetId, cardId }`
- **Success:** `200` → list refreshes; dialog closes; page decrements if last item on last page
- **Errors:** `[UNVERIFIED]` server error → dialog stays open
- **Trigger:** confirm in `DeleteConfirmDialog`
- **Source:** `ManageFlashcardSetDetailPage.tsx:153`

#### Fetch flashcards (paginated)
- **Endpoint:** `GET /api/v1/flashcardsets/:id/cards` → via `getFlashcardSetFlashcardsApi()`
- **Request:** `{ page, limit: 9, labelId? }`
- **Success:** `200` → `paginatedFlashcards` + `pagination` state updated
- **Errors:** `console.error` "Failed to fetch flashcards:" — no user-visible error
- **Trigger:** mount, page change, label filter change
- **Source:** `ManageFlashcardSetDetailPage.tsx:76`

#### Fetch labels
- **Endpoint:** `GET /api/v1/flashcardsets/:id/labels` → via `getFlashcardSetLabelsApi()`
- **Request:** `{ flashcardSetId: id }`
- **Success:** `200` → `availableLabels` state updated
- **Errors:** `console.error` "Failed to fetch labels:" — no user-visible error
- **Trigger:** mount, label change in manager
- **Source:** `ManageFlashcardSetDetailPage.tsx:91`

#### Fetch flashcard set by ID
- **Endpoint:** `GET /api/v1/flashcardsets/:id` → via `fetchFlashcardSetById()` in store
- **Request:** `{ id }`
- **Success:** `200` → `currentFlashcardSet` state updated
- **Errors:** `[UNVERIFIED]`
- **Trigger:** mount
- **Source:** `ManageFlashcardSetDetailPage.tsx:70`

## Interaction Patterns

- **Label filter with cache invalidation** — `invalidateLabelFlashcardsCache(labelId)` called on card add/update/delete if the card had a label; source: `ManageFlashcardSetDetailPage.tsx:121,165,189`
- **"Unlabeled" filter** — selecting `"unlabeled"` in the filter dropdown sets `selectedLabelId` to `null`, filtering cards with no label; source: `ManageFlashcardSetDetailPage.tsx:325`
- **Client-side label selection** — `availableLabels` drives the `<Select>` options in the filter dropdown; source: `ManageFlashcardSetDetailPage.tsx:335`
- **Pagination with page-aware delete** — if deleting the last item on the last page, `currentPage` is decremented before `fetchFlashcards()`; source: `ManageFlashcardSetDetailPage.tsx:168`

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
| `loading || !currentFlashcardSet` | data-driven | skeleton UI | full content | `ManageFlashcardSetDetailPage.tsx:202` |
| `flashcardsLoading` | data-driven | 6 skeleton cards in grid | flashcard grid | `ManageFlashcardSetDetailPage.tsx:348` |
| `paginatedFlashcards.length === 0` | data-driven | empty state with CTA | flashcard grid | `ManageFlashcardSetDetailPage.tsx:449` |
| `showCardForm` | feature-flag | `FlashcardEditorDialog` modal | — | `ManageFlashcardSetDetailPage.tsx:298` |
| `selectedCard` (edit mode) | feature-flag | dialog pre-filled with card data | empty form | `ManageFlashcardSetDetailPage.tsx:299` |
| `totalPages <= 1` | data-driven | pagination controls hidden | pagination bar | `ManageFlashcardSetDetailPage.tsx:410` |
| `currentFlashcardSet.tags?.length > 0` | data-driven | tag badges row | hidden | `ManageFlashcardSetDetailPage.tsx:244` |

## Component Variants

Omit — no shared polymorphic component rendered on this page.

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| Route guard on `/k/manage-flashcard-set/:id` | auth | Redirect to `/login` if unauthenticated (parent K layout) |
| No teacher-role guard in page | permission | Any authenticated user can access; `[UNVERIFIED]` API enforces owner-only |

No `TeacherRoute` wrapper in this page. Auth is handled by the parent K layout shell. Backend likely enforces that only the flashcard set owner can modify cards.

## Source References

- Page: `kmaedu-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx`
- Flashcard set store: `kmaedu-fe/src/stores/useFlashcardSetStore.ts`
- Flashcard set API: `kmaedu-fe/src/apis/flashcardSetApi.ts`
- Store cache: `kmaedu-fe/src/lib/storeCache.ts`
- FlashcardEditorDialog: `kmaedu-fe/src/components/organisms/FlashcardEditorDialog.tsx` (referenced, not read)
- FlashcardLabelManager: `kmaedu-fe/src/components/organisms/FlashcardLabelManager.tsx` (referenced, not read)
- DeleteConfirmDialog: `kmaedu-fe/src/components/organisms/DeleteConfirmDialog.tsx` (referenced, not read)
