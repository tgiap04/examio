# SCR019: ExamHistoryPage — Screen Spec

**Screen**: SCR019: ExamHistoryPage
**Type**: atomic
**Route**: `/k/history/exam`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that displays the user's completed exam attempts in a paginated list. The student uses this to review past performance, retake exams, or share results. They arrive here from the HistoryPage parent (which also lists PDFs).

## Screen Layout

KLayout-wrapped page containing a single main content area with the shared `HistoryTemplate` component. Top filter bar (date range, score range), then a paginated list of exam attempts with per-row action buttons (review, share, retry).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: HistoryTemplate Main Content       │
│  ┌─ FilterBar ───────────────────────┐  │
│  ├─ StatsGrid (4 cards)              │  │
│  ├─ ExamHistoryListSection           │  │
│  │   ┌─ row: exam title + score ──┐ │  │
│  │   ├─ row: ...                │  │
│  └─ ExamTablePagination             │  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2 | HistoryTemplate | static | yes | HistoryTemplate, ExamHistoryListSection, ExamTablePagination | fluid |

## User Flow

### Happy Path

1. Page mounts → `useHistoryStore` (or local) fetches `GET /api/v1/examattempts/history-stats?userId=...`
2. User scrolls list of past exam attempts (default page 1, 20/page)
3. User clicks "Review" on a row → opens result modal with score breakdown
4. User clicks "Retry" → navigates to `/exam-session/:sessionId/quiz` for the parent exam session

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Empty history | `attempts.length === 0` | empty-state illustration + "Take your first exam" CTA | `kmaedu-fe/src/components/molecules/ExamHistoryListItem.tsx:42` |
| Filter applied | Date/score filter changed | Re-fetch with new filter params; list updates | `kmaedu-fe/src/components/organisms/k/ExamSearchFilterBar.tsx:18` |
| Pagination | User clicks next/prev | Fetch page N+1, scroll to top | `kmaedu-fe/src/components/organisms/k/ExamTablePagination.tsx:55` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| examTitle | Exam title | `attempt.session.examRoom.title` | raw | hidden if missing | MODEL-019 |
| score | "Score: 85%" | `attempt.score` | percentage | dash | MODEL-019.score |
| completedAt | "Jan 15, 2024" | `attempt.finishedAt` | date | dash | MODEL-019.finishedAt |
| status | "Completed" / "Cancelled" | `attempt.status` (0/1/2) | badge | — | DISC-008 |
| attemptCount | "12 attempts" | `count(attempts where sessionId=...)` | integer | 0 | MODEL-019 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | API in-flight | skeleton row list | none | `kmaedu-fe/src/components/organisms/k/ExamHistoryListSection.tsx:31` |
| empty | 0 results | empty-state illustration + CTA | navigate to home | `kmaedu-fe/src/components/molecules/ExamHistoryListItem.tsx:42` |
| error | API error / network | error message + retry button | retry | `kmaedu-fe/src/components/organisms/k/ExamHistoryListSection.tsx:78` |
| loading-stats | stats API in-flight | 4 skeleton cards | none | `kmaedu-fe/src/components/molecules/HistoryStatCard.tsx:18` |

## Validation & Error Feedback

`N/A — no client-side form validation detected.`

### B) Server-side

#### Get exam history
- **Endpoint:** `GET /api/v1/examattempts/history-stats?userId=...&page=...`
- **Request:** `{ page, size, dateFrom?, dateTo? }`
- **Success:** `200` → renders history list
- **Errors:** `401` (unauthenticated) | `500` (server error) → toast error message
- **Trigger:** page mount / pagination / filter change
- **Source:** `kmaedu-fe/src/apis/historyApi.ts:42`

## Interaction Patterns

- **Clicking "Review" opens result modal with per-question breakdown** — source: `kmaedu-fe/src/components/molecules/ExamHistoryListItem.tsx:88`
- **Clicking "Retry" navigates to exam session** — source: `kmaedu-fe/src/components/molecules/ExamHistoryListItem.tsx:103`
- **Filter changes debounce 500ms before re-fetch** — source: `kmaedu-fe/src/hooks/useDebounce.ts:12`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Action buttons have aria-label, table lacks caption |
| Keyboard navigation | supported | Tab through rows, Enter to open review |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | List announced as `list` role |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `attempt.status === 0` | auth | "In Progress" badge | "Review" button | hide action for unfinished |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| `userId` from JWT, not query | data-isolation | cross-user data leak |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |

## Source References

- Page/View: `kmaedu-fe/src/pages/k/ExamHistoryPage.tsx:1`
- Template: `kmaedu-fe/src/templates/HistoryTemplate.tsx:1`
- API: `kmaedu-fe/src/apis/historyApi.ts:1`
- Store: `kmaedu-fe/src/stores/useStatsStore.ts:1` (history stats cache)
- Hook: `kmaedu-fe/src/hooks/useDebounce.ts:12`
