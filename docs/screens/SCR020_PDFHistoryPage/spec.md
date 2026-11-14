# SCR020: PDFHistoryPage — Screen Spec

**Screen**: SCR020: PDFHistoryPage
**Type**: atomic
**Route**: `/k/history/pdf`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that displays the user's PDF upload history — files uploaded for AI generation (quiz/flashcard). The student uses this to re-run AI jobs, view generation results, or download generated artifacts.

## Screen Layout

KLayout-wrapped page containing a single main content area with the shared `HistoryTemplate` component. Top filter bar (date range, status), then a paginated list of uploaded PDFs with per-row action buttons (regenerate, view result, delete).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: HistoryTemplate Main Content       │
│  ┌─ FilterBar ───────────────────────┐  │
│  ├─ StatsGrid (4 cards)              │  │
│  ├─ PDFHistoryListSection            │  │
│  │   ┌─ row: filename + status ──┐  │  │
│  │   ├─ row: ...                │  │
│  └─ ExamTablePagination             │  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2 | HistoryTemplate | static | yes | HistoryTemplate, PDFHistoryListSection | fluid |

## User Flow

### Happy Path

1. Page mounts → fetches `GET /api/v1/ai/recent-uploads?userId=...&page=...`
2. User scrolls list of uploaded PDFs (default 20/page)
3. User clicks "View Result" on COMPLETED row → opens modal with generated quiz/flashcard
4. User clicks "Regenerate" → navigates to `/k/ai-tool?uploadId=...` with pre-filled state

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Empty history | `uploads.length === 0` | empty-state illustration + "Upload your first PDF" CTA | `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:38` |
| Filter applied | Date/status filter changed | Re-fetch with new params | `kmaedu-fe/src/components/organisms/k/ExamSearchFilterBar.tsx:18` |
| Job still running | `processingStatus === 'PROCESSING'` | disabled "Regenerate" + spinner on row | `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:62` |
| Job failed | `processingStatus === 'FAILED'` | red badge + "Retry" CTA | `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:71` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| filename | PDF filename | `userStorage.filename` | raw + truncation | hidden | MODEL-027 |
| status | "Completed" / "Processing" / "Failed" | `userStorage.processingStatus` | badge | — | DISC-013 |
| uploadedAt | "Jan 15, 2024" | `userStorage.createdAt` | date | dash | MODEL-027 |
| size | "2.3 MB" | `userStorage.size` | bytes→MB | dash | MODEL-027 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | API in-flight | skeleton row list | none | `kmaedu-fe/src/components/organisms/k/PDFHistoryListSection.tsx:31` |
| empty | 0 results | empty-state illustration + CTA | upload PDF | `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:38` |
| error | API error / network | error message + retry | retry | `kmaedu-fe/src/components/organisms/k/PDFHistoryListSection.tsx:78` |

## Validation & Error Feedback

`N/A — no client-side form validation detected.`

### B) Server-side

#### Get PDF history
- **Endpoint:** `GET /api/v1/ai/recent-uploads?userId=...&page=...`
- **Request:** `{ page, size, dateFrom?, dateTo? }`
- **Success:** `200` → renders list
- **Errors:** `401` (unauthenticated) | `500` (server error)
- **Trigger:** page mount / pagination / filter
- **Source:** `kmaedu-fe/src/apis/aiApi.ts:42`

## Interaction Patterns

- **Clicking "View Result" opens result modal** — source: `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:78`
- **Clicking "Regenerate" navigates to AI tool with pre-filled upload** — source: `kmaedu-fe/src/components/molecules/PDFHistoryListItem.tsx:92`
- **Filter changes debounce 500ms** — source: `kmaedu-fe/src/hooks/useDebounce.ts:12`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Action buttons have aria-label |
| Keyboard navigation | supported | Tab through rows, Enter to open |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | List announced as `list` role |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `processingStatus === 'COMPLETED'` | feature-flag | "View Result" button | "Regenerate" button | only show result action when ready |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| `userId` from JWT, not query | data-isolation | cross-user data leak |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |

## Source References

- Page/View: `kmaedu-fe/src/pages/k/PDFHistoryPage.tsx:1`
- Template: `kmaedu-fe/src/templates/HistoryTemplate.tsx:1`
- API: `kmaedu-fe/src/apis/aiApi.ts:42`
- Store: `kmaedu-fe/src/stores/useRecentUploadsStore.ts:1`
