# SCR026: MyExamsPage — Screen Spec

**Screen**: SCR026: MyExamsPage
**Type**: atomic
**Route**: `/k/my-exams`
**Generated**: 2026-06-06

## Purpose

A student browses the exam sessions they have attempted, sees their best scores and attempt counts, resumes in-progress attempts, and reviews past attempt history via a dialog. The page is entered from the sidebar nav or workspace dashboard.

## Screen Layout

The page renders a single-column responsive layout with a sticky header section, a grid of session cards in the main content area, and a paginated navigation footer. On mobile the grid collapses from 3 columns to 1; on tablet it shows 2 columns. The history dialog is a full-screen sheet that overlays the grid. The page uses a `max-w-7xl` container centered with `px-4` gutters (`kmaedu-fe/src/pages/k/MyExamsPage.tsx:231`).

### Layout Sketch

```
┌─────────────────────────────────────────────────┐
│ R1: Page Header (static)                        │
│   h1: "Bài thi của tôi" + subtitle count        │
├─────────────────────────────────────────────────┤
│ R2: Main Content (scrollable)                  │
│   ┌─────┐  ┌─────┐  ┌─────┐                     │
│   │Card │  │Card │  │Card │  (3-col grid)       │
│   └─────┘  └─────┘  └─────┘                     │
│   - - - - - - - - - - - - - - - - - - - - - -  │
│   │ History Dialog (overlay, conditional)      │ │
│   └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ R3: Pagination Nav (static, bottom)             │
└─────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page Header | static | no | `<h1>`, subtitle `<p>` | full-width, always visible |
| R2 | Session Grid | static | yes | `SessionCard` × N, `SessionHistoryDialog`, `Pagination` | `grid-cols-3` → `grid-cols-2` → `grid-cols-1` |
| R3 | Pagination | static | no | `<nav>` with `<button>` per page | hidden when ≤1 page |

## User Flow

### Happy Path

1. Student lands on `/k/my-exams`. Page fetches exam attempts from store (`fetchExamsFromStore`) at line `MyExamsPage.tsx:170`.
2. `groupBySession` groups attempts by `examSessionId`; `sortWithPinnedFirst` places pinned rooms first.
3. `SessionCard` renders per group: title, best score, attempt count, best percentage, violation count, pin state, in-progress badge.
4. Student clicks **Tiếp tục** on a card with `hasInProgress=true` → navigates to `/exam-session/{sessionId}/quiz?attemptId={inProgressAttemptId}` (`session-card.tsx:127`).
5. Student clicks **Lịch sử** on any card → `SessionHistoryDialog` opens, fetches all attempts for that session via `getMyAttemptsBySessionApi` (`session-history-dialog.tsx:61`), sorted most-recent-first.
6. In dialog, student clicks **Xem kết quả** → navigates to `/exam-session/{sessionId}/quiz?attemptId={attemptId}&view=result`.
7. Student clicks **Ghim/Bỏ ghim** pin button → optimistic UI update + `togglePinExamRoomApi` call (`MyExamsPage.tsx:199`); on failure, reverts and shows toast error.
8. Student navigates pages via `<nav>` pagination controls → `setSearchParams({ page })` + `window.scrollTo(0, 0)`.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| No attempts loaded yet | `loading === true` | Skeleton grid (6 cards) renders | `MyExamsPage.tsx:212` |
| Zero sessions after load | `sessions.length === 0` | Empty state illustration + "Chưa có bài thi nào" + CTA link | `MyExamsPage.tsx:243` |
| API fetch fails | `catch` block | Toast error "Không thể tải lịch sử thi" | `MyExamsPage.tsx:174` |
| Pin toggle fails | API 4xx/5xx | Revert optimistic state + toast error "Không thể ghim phòng thi" | `MyExamsPage.tsx:206` |
| Session has no in-progress | `hasInProgress === false` | No Tiếp tục button shown on card | `session-card.tsx:123` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `session.title` | Session name | computed from `groupBySession.first.examSession.examRoom.title` | raw string | hidden (always has title) | MODEL-017.title |
| `session.bestScore` | Điểm cao | computed max of `attempt.score` | `toFixed(1)` | dash `—` | MODEL-019.score |
| `session.bestPercentage` | Tỷ lệ tốt | computed `Math.round(correctAnswers/totalQuestions*100)` | `X%` | `0%` | MODEL-019.correctAnswers |
| `session.attemptCount` | Số lần thi | `group.length` | integer | `0` | MODEL-019.id |
| `session.totalViolations` | violations | sum of `violationCount` | integer | `0` | MODEL-020.count |
| `session.lastAttemptAt` | Attempt date | `reduce` max of `startedAt` | `formatTimeAgo()` | never empty | MODEL-019.startedAt |
| `session.hasInProgress` | In-progress badge | `group.some(status===0)` | boolean | `false` | MODEL-019.status |
| `session.inProgressAttemptId` | Resume link | `find(status===0).id` | string | `null` | MODEL-019.id |
| `session.isPinned` | Pin state | from `RecentExamAttempt.isPinned` | boolean | `false` | MODEL-025.pinnedAt |
| `attempt.percentage` (dialog) | % score | computed per attempt | `Math.round(correctAnswers/totalQuestions*100)` | `0%` | MODEL-019.correctAnswers |
| `attempt.timeSpentSeconds` (dialog) | Duration | `MyAttemptItem.timeSpentSeconds` | `formatDuration` `H:MM:SS` | `—` | MODEL-019.timeSpentSeconds |
| `attempt.startedAt` (dialog) | Date/time | `MyAttemptItem.startedAt` | `toLocaleString('vi-VN')` | never empty | MODEL-019.startedAt |
| `attempt.status` (dialog) | Status badge | `MyAttemptItem.status` | 0=Đang làm, 1=Hoàn thành, 2=Đã hủy | n/a | MODEL-019.status |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `fetchExamsFromStore` in-flight | 6 skeleton cards in 3-col grid | none | `MyExamsPage.tsx:212` |
| empty | `sessions.length === 0` after load | Empty state icon + text + CTA button | "Tham gia phòng thi" navigates home | `MyExamsPage.tsx:243` |
| error | `catch` in `fetchExams` | Toast "Không thể tải lịch sử thi" | retry by navigating away and back | `MyExamsPage.tsx:174` |
| dialog loading | `getMyAttemptsBySessionApi` in-flight | Skeleton rows in dialog | none | `session-history-dialog.tsx:80` |
| dialog error | `catch` in dialog `useEffect` | "Không thể tải lịch sử bài thi" text | none | `session-history-dialog.tsx:92` |
| dialog empty | 0 attempts returned | "Chưa có lần thi nào." text | none | `session-history-dialog.tsx:100` |
| saving (pin) | `togglePinExamRoomApi` in-flight | Optimistic UI update; no spinner | revert on error | `MyExamsPage.tsx:191` |

## Validation & Error Feedback

### A) Client-side

N/A — no client-side form validation detected.

### B) Server-side

#### Toggle pin exam room
- **Endpoint:** `POST /api/v1/examrooms/{examRoomId}/pin`
- **Request:** `{examRoomId}` (from `session.examRoomId`)
- **Success:** `200` → optimistic UI update persists, toast shown
- **Errors:** `4xx/5xx` → revert state, toast "Không thể ghim phòng thi"
- **Trigger:** Click pin button on `SessionCard`
- **Source:** `MyExamsPage.tsx:199`

#### Fetch exam attempts
- **Endpoint:** `GET /api/v1/student/recent-exams?page={page}&limit={PAGE_SIZE}` via `useStudentMaterialsStore`
- **Request:** page number
- **Success:** `200` → `setExamAttempts`, `setTotal`
- **Errors:** `4xx/5xx` → toast "Không thể tải lịch sử thi"
- **Trigger:** `useEffect` on `currentPage` change
- **Source:** `MyExamsPage.tsx:170`

## Interaction Patterns

- **Clicking "Tiếp tục" resumes an in-progress exam attempt** — navigates to quiz page with `attemptId` param, source: `session-card.tsx:125`
- **Clicking "Lịch sử" opens attempt history dialog** — fetches all attempts for that session, source: `session-card.tsx:139`
- **Clicking "Xem kết quả" in dialog opens result view** — navigates to quiz with `view=result` param, source: `session-history-dialog.tsx:147`
- **Clicking pin icon toggles pin state optimistically** — revert on API error, source: `MyExamsPage.tsx:191`
- **Pagination clicks update URL search param** — `setSearchParams({ page })` + smooth scroll to top, source: `MyExamsPage.tsx:187`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | present | `aria-label="Phân trang"` on nav; `aria-label` on pagination buttons; `aria-current="page"` on active page |
| Keyboard navigation | supported | Tab through cards and buttons; Enter activates actions |
| Focus management | unmanaged | No explicit focus trap or autofocus; dialog uses native `<Dialog>` from antd |
| Screen reader compatibility | unknown | Semantic `<article>` on SessionCard; `<nav>` for pagination; dialog uses antd Dialog |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading === true` | async | Skeleton grid | actual cards | `MyExamsPage.tsx:212` |
| `sessions.length === 0` | data | Empty state panel | session grid + pagination | `MyExamsPage.tsx:243` |
| `session.hasInProgress === true` | data | "Đang làm" badge + Tiếp tục button | completed-only card | `session-card.tsx:67` |
| `session.isPinned === true` | data | Pin icon + pin-first sort order | non-pinned card ordering | `MyExamsPage.tsx:69` |
| `session.totalViolations > 0` | data | AlertCircle + violation count | hidden when 0 | `session-card.tsx:58` |
| `attempt.status === 1 && showAnswers` | data | "Xem kết quả" button in dialog | in-progress or denied attempts | `session-history-dialog.tsx:141` |
| `totalPages <= 1` | data | Pagination hidden | pagination controls | `Pagination.tsx:86` |

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| SessionCard | `hasInProgress` | in-progress / completed | `session`, `onViewHistory`, `onTogglePin` | SCR029 default state |
| SessionCard | `bestScore !== null` | with score / dash | `bestScore.toFixed(1)` or `—` | SCR029 |
| SessionHistoryDialog | `attempt.status` | Đang làm / Hoàn thành / Đã hủy badge | `AttemptStatusBadge` component | MODEL-019.status |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| Auth guard on `/k/*` routes | auth | Redirect to `/login` — unauthenticated users cannot view this page |
| `isAuthenticated` check at page init | auth | `setRedirectBackTarget` + navigate to login with return URL |
| `isPinned` on ExamRoom — user can only pin rooms they have attempted | permission | API returns 403 if user has no attempts for that room |

## Source References

- Page/View: `kmaedu-fe/src/pages/k/MyExamsPage.tsx:1`
- Types: `kmaedu-fe/src/pages/k/my-exams-types.ts:1`
- SessionCard component: `kmaedu-fe/src/pages/k/components/session-card.tsx:1`
- SessionHistoryDialog component: `kmaedu-fe/src/pages/k/components/session-history-dialog.tsx:1`
- Store: `kmaedu-fe/src/stores/useStudentMaterialsStore.ts`
- API: `kmaedu-fe/src/apis/studentMaterialsApi.ts`
- Attempt API: `kmaedu-fe/src/apis/examAttemptApi.ts`