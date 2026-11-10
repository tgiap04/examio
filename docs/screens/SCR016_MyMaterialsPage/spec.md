# SCR016_MyMaterialsPage — Screen Spec

**Screen**: SCR016: MyMaterialsPage
**Type**: composite
**Route**: `/k/my-materials`
**Generated**: 2026-06-06

## Purpose

Authenticated users browse the flashcard sets they have recently viewed or studied. They can pin decks for quick access, share decks with friends via URL or 6-digit access code, and navigate to the study interface. Each deck card shows study progress, card count, view count, and last-viewed time.

---

## Screen Layout

The page renders a full-width single-column layout with a sticky header and a 3-column responsive grid of material cards below. A share dialog floats as a modal overlay when triggered. The page uses the browser's default scroll behavior and does not use a shell layout. (source: `MyMaterialsPage.tsx:490`)

### Layout Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  R1: Page Header — "Tài liệu học tập" title + subtitle      │
├──────────────────────────────────────────────────────────────┤
│ R2: Content Area (max-w-7xl, centered)                      │
│   ┌──────────┬──────────┬──────────┐                        │
│   │ Card 1   │ Card 2   │ Card 3   │  (3-col grid on lg)     │
│   └──────────┴──────────┴──────────┘  (2-col on sm, 1-col)  │
│   ┌──────────┬──────────┬──────────┐                        │
│   │ Card 4   │ Card 5   │ Card 6   │                        │
│   └──────────┴──────────┴──────────┘                        │
│   R3: Pagination nav                                         │
├──────────────────────────────────────────────────────────────┤
│  [R4: ShareDialog — modal overlay, floating]                │
└──────────────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | no | Title + subtitle + total count | Always visible |
| R2 | Material Grid | static | yes | `MaterialCard` components (12 per page) | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` responsive |
| R3 | Pagination | static | no | Page number buttons + prev/next | Centered, hidden when `totalPages <= 1` |
| R4 | Share Dialog | absolute overlay | no | Share URL input, access code input, copy/save buttons | Dialog renders via `<Dialog>` component |

---

## User Flow

### Happy Path

1. User lands on `/k/my-materials`; `useEffect` calls `loadMaterials(currentPage)`; `fetchFlashcards(page, PAGE_SIZE)` from `useStudentMaterialsStore` returns paginated data; loading skeleton shown until resolved. R2
2. Material cards render in a 3-column grid; pinned decks appear first (sorted by `sortWithPinnedFirst`); each card shows title, card count, view count, time-ago, progress bar, creator name, and action buttons. R2
3. User clicks **Ôn tập** button on a card; `handleReview(setId)` navigates to `/study-flashcard/${setId}`. R2 → new screen
4. User clicks the **pin icon** on a card; `handleTogglePin(setId)` optimistically reorders the list (pinned first), calls `togglePinFlashcardApi(setId)` in background; on failure reverts with error toast. R2
5. User clicks the **share icon** on a card (owner only); `handleShare(setId)` checks `shareCache` ref for cached data; if cached, opens dialog immediately; otherwise calls `generateShareLinkApi(setId)`, caches result, and opens dialog. R4
6. In ShareDialog, user copies share URL or access code via clipboard; `handleCopy` sets `copiedUrl`/`copiedCode` state, auto-resets after 2 s. R4
7. User changes access code; "Lưu mã mới" button appears; on click `updateSharingSettings` saves; `onCodeChange` updates dialog state and invalidates cache. R4
8. User clicks a page number; `handlePageChange(page)` updates URL search params (`?page=N`) and scrolls to top. R3 → R2 re-renders with new page

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading === true` on mount | `fetchFlashcards` in-flight | Skeleton cards shown in grid (12 skeleton rows) | `MyMaterialsPage.tsx:471` |
| `materials.length === 0` after load | 0 results | Empty state illustration + "Chưa có tài liệu học tập nào" message | `MyMaterialsPage.tsx:506` |
| `fetchFlashcards` throws | API rejects | Error toast "Không thể tải tài liệu học tập"; skeleton hides | `MyMaterialsPage.tsx:404` |
| `material.creator.id !== user?.id` | ownership check | Share button hidden on card | `MyMaterialsPage.tsx:131` |
| Share URL already cached | `shareCache.current.has(setId)` | Dialog opens immediately without API call | `MyMaterialsPage.tsx:426` |
| `generateShareLinkApi` throws | API rejects | Error toast "Không thể tạo liên kết chia sẻ" | `MyMaterialsPage.tsx:444` |
| `togglePinFlashcardApi` throws | API rejects | List reverts to previous pinned state; error toast "Không thể ghim tài liệu" | `MyMaterialsPage.tsx:467` |
| Access code < 6 digits | `code.length < 6` | "Lưu mã mới" button disabled | `MyMaterialsPage.tsx:358` |
| `totalPages <= 1` | pagination state | Pagination nav not rendered | `MyMaterialsPage.tsx:180` |
| Code changed vs. `accessCode` | `code !== accessCode` | "Lưu mã mới" button visible | `MyMaterialsPage.tsx:297` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `material.title` | Tiêu đề | API field | raw string, max 2 lines `line-clamp-2` | — | MODEL-012.title |
| `material.flashcardCount` | Số thẻ | API field | integer + " thẻ" suffix | — | MODEL-012._count.detailsFlashCard |
| `material.viewCount` | Lượt xem | API field | integer | `0` | MODEL-012.viewCount |
| `material.lastViewedAt` | Lần xem cuối | API field | `formatTimeAgo()` relative string | — | MODEL-022.viewedAt |
| `material.description` | Mô tả | API field | raw string, max 2 lines `line-clamp-2` | hidden if empty | MODEL-012.description |
| `material.progress` | Tiến độ | API field | integer percentage | progress bar hidden if undefined | MODEL-023.studiedCardIds |
| `material.creator.name` | Người tạo | API field | `creator.name` or `creator.username` or "Ẩn danh" | "Ẩn danh" | MODEL-001.name |
| `material.isPinned` | Trạng thái ghim | API field + local state | boolean — shows Pin icon if true | — | MODEL-024 |
| `material.thumbnail` | Hình thu nhỏ | API field | URL | fallback BookOpen icon | MODEL-012.thumbnail |
| `shareUrl` | Liên kết chia sẻ | computed | `${window.location.origin}/study-flashcard/${setId}` | — | N/A |
| `accessCode` | Mã truy cập | API field | 6-digit string | empty input placeholder | MODEL-012.accessCode |
| `currentPage` | Trang hiện tại | URL search param | integer (1-indexed) | `1` | N/A |
| `total` | Tổng số bộ | API field | integer + " bộ" suffix | hidden when `total === 0` | N/A |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `fetchFlashcards` in-flight | 12 skeleton cards in grid | none | `MyMaterialsPage.tsx:471` |
| empty | `materials.length === 0` after load | Empty state illustration + text + no CTA button | none | `MyMaterialsPage.tsx:506` |
| error | `fetchFlashcards` throws | Error toast; skeleton hides | none | `MyMaterialsPage.tsx:404` |
| share-dialog-open | `shareDialog.open === true` | ShareDialog modal renders | copy URL, copy code, save code, close | `MyMaterialsPage.tsx:546` |
| share-url-copied | `handleCopy(shareUrl, "url")` | Button shows "Đã chép" with Check icon | none (auto-resets after 2 s) | `MyMaterialsPage.tsx:268` |
| share-code-copied | `handleCopy(accessCode, "code")` | Button shows "Đã chép" with Check icon | none (auto-resets after 2 s) | `MyMaterialsPage.tsx:272` |
| saving-code | `updateSharingSettings` in-flight | "Lưu mã mới" button shows spinner | none | `MyMaterialsPage.tsx:360` |
| pagination | `totalPages > 1` | Page number buttons + prev/next nav | click page number, prev, next | `MyMaterialsPage.tsx:538` |

---

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| accessCode | text | no | exactly 6 digits, `\D` stripped to digits only, maxLength 6 | none | — |

### B) Server-side

#### Load recent flashcard sets
- **Endpoint:** `GET /student/recent-flashcards?limit={PAGE_SIZE}&page={page}`
- **Request:** `{ limit: number, page: number }` via query params
- **Success:** `200` → `{ flashcardSets, total, totalPages }` → `setMaterials` + state
- **Errors:** `[UNVERIFIED]` — error toast only
- **Trigger:** Page mount and `currentPage` state change
- **Source:** `MyMaterialsPage.tsx:399`

#### Toggle pin
- **Endpoint:** `POST /flashcard-sets/{setId}/toggle-pin`
- **Request:** none (setId in URL)
- **Success:** `200` → local state updated optimistically
- **Errors:** `4xx/5xx` → local state reverts + error toast "Không thể ghim tài liệu"
- **Trigger:** Pin button click on card
- **Source:** `MyMaterialsPage.tsx:460`

#### Generate share link
- **Endpoint:** `POST /flashcard-sets/{setId}/share-link`
- **Request:** none (setId in URL)
- **Success:** `200` → `{ accessCode: string }` → dialog opens with code
- **Errors:** `[UNVERIFIED]` → error toast "Không thể tạo liên kết chia sẻ"
- **Trigger:** Share button click on card
- **Source:** `MyMaterialsPage.tsx:433`

#### Update sharing settings
- **Endpoint:** `PUT /flashcard-sets/{flashcardSetId}/sharing`
- **Request:** `{ isPublic: false, accessCode: string, whitelist: [] }`
- **Success:** `200` → dialog code updated + share cache invalidated
- **Errors:** `[UNVERIFIED]` — silent failure (no toast)
- **Trigger:** "Lưu mã mới" button click
- **Source:** `MyMaterialsPage.tsx:284`

---

## Interaction Patterns

- **Pinned-first sort** — `sortWithPinnedFirst` sorts materials array with pinned items first; CSS `order: 0` for pinned cards, `order: 1` for others — source: `MyMaterialsPage.tsx:26,525`
- **Optimistic pin toggle** — local state updates immediately on click; API fires in background; on failure reverts and shows toast — source: `MyMaterialsPage.tsx:448`
- **Share cache ref** — `shareCache.current` Map caches `{ shareUrl, accessCode }` per setId; avoids redundant API calls when re-opening dialog — source: `MyMaterialsPage.tsx:423`
- **Clipboard copy with auto-reset** — `navigator.clipboard.writeText` + `setTimeout(2000)` resets `copiedUrl`/`copiedCode` — source: `MyMaterialsPage.tsx:265`
- **URL-based pagination** — `setSearchParams({ page: String(page) })` updates URL without full navigation; enables deep-linking to specific pages — source: `MyMaterialsPage.tsx:415`
- **Smooth scroll on page change** — `window.scrollTo({ top: 0, behavior: "smooth" })` after page change — source: `MyMaterialsPage.tsx:416`
- **Numeric-only access code input** — `onChange` strips non-digits and caps at 6 chars — source: `MyMaterialsPage.tsx:328`
- **Access code generation** — `Math.floor(100000 + Math.random() * 900000)` produces random 6-digit code — source: `MyMaterialsPage.tsx:277`

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `<nav aria-label="Phân trang">` on pagination; `<article>` on material cards; share dialog lacks `aria-label`; pin/share buttons have `aria-label` |
| Keyboard navigation | supported | Standard tab order; Enter/Space activates buttons; `aria-current="page"` on active page button |
| Focus management | unmanaged | No focus management on dialog open/close or page change |
| Screen reader compatibility | unknown | `aria-live` not used for toast notifications; no `role="dialog"` on ShareDialog (uses `<Dialog>` which may handle this) |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading === true` | auth | Skeleton grid (12 rows) | material cards | |
| `materials.length === 0` | auth | Empty state | material grid + pagination | |
| `material.isPinned === true` | auth | Pin icon + `order: 0` CSS | — | |
| `material.creator.id === user?.id` | auth | Share button on card | share button hidden | |
| `material.progress !== undefined` | auth | Progress bar on card | progress bar hidden | |
| `material.thumbnail` is truthy | responsive | Thumbnail image | BookOpen icon fallback | |
| `totalPages <= 1` | responsive | Pagination nav hidden | — | |
| `total > 0` | auth | Total count "(N bộ)" in subtitle | count hidden | |
| `shareDialog.open === true` | auth | ShareDialog modal | — | |
| `code !== accessCode` | auth | "Lưu mã mới" button | — | |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` on `/k/my-materials` | auth | Redirect to `/login` if not authenticated |
| Share button only shown when `material.creator.id === user?.id` | permission | Non-owners cannot open share dialog; share API still requires ownership server-side [UNVERIFIED] |
| Server returns only own viewed materials | auth | Cannot access other users' materials — server-enforced [UNVERIFIED] |

---

## Source References

- Page/View: `kmaedu-fe/src/pages/k/MyMaterialsPage.tsx:1`
- Student materials store: `kmaedu-fe/src/stores/useStudentMaterialsStore.ts:1`
- Student materials API: `kmaedu-fe/src/apis/studentMaterialsApi.ts:1`
- Flashcard set API: `kmaedu-fe/src/apis/flashcardSetApi.ts:1` (referenced via `updateSharingSettings`)
- Auth store: `kmaedu-fe/src/stores/useAuthStore.ts:1`
