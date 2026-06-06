# SCR016: HistoryPage — Screen Spec

**Screen**: SCR016: HistoryPage
**Type**: composite
**Route**: `/k/history`
**Generated**: 2026-06-06

## Purpose

A student views their study history hub — recent PDF uploads, past exam attempts, and aggregated stats — accessed from the dashboard sidebar.

## Screen Layout

The page renders `HistoryTemplate` as a full-height container with a centered content column (`max-w-7xl mx-auto`). The layout splits into three horizontal sections stacked vertically: a stats summary bar at the top, a two-column middle region (PDF history left, exam history right), and a recent activity feed at the bottom. All regions scroll independently within the page. The component is responsive: stacks to single-column on mobile. (source: `examio-fe/src/pages/k/HistoryPage.tsx`:252)

### Layout Sketch

```
┌────────────────────────────────────────────────────┐
│ R1: Stats Summary Bar (static)                    │
├───────────────────────────┬────────────────────────┤
│ R2: PDF History Panel    │ R3: Exam History Panel │
│ (scrollable)             │ (scrollable)           │
├───────────────────────────┴────────────────────────┤
│ R4: Recent Activity Feed (static/expandable)      │
└────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|-----------|----------------|---------------------|
| R1 | Stats Summary | static | no | `HistoryTemplate` (internal) | hidden-sm on small screens |
| R2 | PDF History | static | yes | `PDFHistoryListItem` via template | stacked on mobile |
| R3 | Exam History | static | yes | `ExamHistoryListItem` via template | stacked on mobile |
| R4 | Activity Feed | static | no | `RecentActivityItem` via template | collapsed-sm on small |

## User Flow

### Happy Path

1. User lands on `/k/history`; `fetchData()` fires `Promise.all` for stats, PDF list, and exam history simultaneously (all cached 5 min via `storeCache`)
2. Loading spinner renders while any of the three requests is in-flight (`isLoading: true`)
3. On resolve, `HistoryTemplate` receives `stats`, `pdfItems`, `examItems`, and `activities` props; template renders all three panels
4. User clicks a PDF history row → `handlePdfDownload(id)` triggers native browser download via `fetch` → blob → anchor click
5. User clicks an exam history row → `handleExamClick(id)` logs to console (not yet wired to navigation)
6. User can pull-to-refresh; `fetchData()` re-runs, cache is refreshed after TTL

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| fetchData error | `catch` block fires | `isLoading` stays false; no toast/empty state shown (silent fail) | `HistoryPage.tsx:204` |
| PDF download missing item | `pdfDataMapRef.current.get(id)` returns undefined | toast error "Không tìm thấy file PDF" | `HistoryPage.tsx:219` |
| PDF download network fail | `fetch` throws | toast error "Không thể tải file. Vui lòng thử lại." | `HistoryPage.tsx:229` |
| Empty PDF list | `pdfItems.length === 0` | rendered by template as empty state | `HistoryPage.tsx:189` |
| Empty exam list | `examItems.length === 0` | rendered by template as empty state | `HistoryPage.tsx:198` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| stats.totalPDFs | Tổng số PDF | `getHistoryStatsApi()` | integer | `0` | `MODEL-029.id` |
| stats.examsCreated | Bài thi đã tạo | `getHistoryStatsApi()` | integer | `0` | `MODEL-019.id` |
| stats.flashcardSets | Bộ flashcard | `getHistoryStatsApi()` | integer | `0` | `MODEL-012.id` |
| stats.totalStudyHours | Giờ học | `getHistoryStatsApi()` | integer (hours) | `0` | `N/A` |
| pdfItem.fileName | Tên file | `getPDFHistoryApi()` → `filename` | string | hidden row | `MODEL-029.filename` |
| pdfItem.description | Trạng thái | computed from `processingStatus` + counts | localized string | `—` | `MODEL-029.processingStatus` |
| pdfItem.status | Trạng thái xử lý | derived from `processingStatus` | completed/processing/failed | `—` | `MODEL-029.processingStatus` |
| pdfItem.createdAt | Ngày tải lên | `createdAt` | `formatTimeAgo` relative | `—` | `MODEL-029.createdAt` |
| examItem.examTitle | Tên bài thi | `examSession.examRoom.title` | string | `—` | `MODEL-017.title` |
| examItem.score | Điểm số | `score` | percentage | `—` | `MODEL-019.score` |
| examItem.correctAnswers | Câu đúng | computed | integer | `—` | `MODEL-019.correctAnswers` |
| examItem.totalQuestions | Tổng câu | `totalQuestions` | integer | `—` | `MODEL-019.totalQuestions` |
| examItem.completedAt | Thời gian | `finishedAt \|\| startedAt` | `formatTimeAgo` relative | `—` | `MODEL-019.finishedAt` |
| examItem.passed | Kết quả | computed `score >= 50` | boolean | `—` | `MODEL-019.score` |
| activity.title | Tiêu đề hoạt động | computed from exam/pdf events | localized string | hidden | `N/A` |
| activity.description | Mô tả | computed from exam/pdf events | localized string | hidden | `N/A` |
| activity.timestamp | Thời điểm | `finishedAt \|\| createdAt` | `formatTimeAgo` relative | `—` | `N/A` |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `isLoading === true` | centered spinner | none | `HistoryPage.tsx:244` |
| empty | all 3 lists return 0 items | empty states per panel (template-controlled) | N/A | `HistoryPage.tsx:189,198` |
| error | `catch` in `fetchData` | silent (no visible error state) | none | `HistoryPage.tsx:204` |
| success | all three `Promise.all` resolve | template renders with data | browse, click download | `HistoryPage.tsx:181` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| N/A — no client-side form validation detected. |

### B) Server-side

#### PDF download
- **Endpoint:** `GET {item.url}` (direct R2/CDN URL, not via API)
- **Request:** none (URL from API response)
- **Success:** HTTP 200 → browser download triggers; toast "Tải file thành công!"
- **Errors:** network error → toast "Không thể tải file. Vui lòng thử lại."
- **Trigger:** click PDF history row download button
- **Source:** `HistoryPage.tsx:215–233`

#### Exam history fetch
- **Endpoint:** `GET /api/v1/student/recent-exams` → via `getExamHistoryApi`
- **Request:** `{ page: 1, limit: 10 }`
- **Success:** HTTP 200 → `examAttempts` list populated
- **Errors:** silent catch (no user-visible error) — `HistoryPage.tsx:204`
- **Trigger:** `fetchData()` on mount
- **Source:** `HistoryPage.tsx:175`

#### PDF history fetch
- **Endpoint:** `GET /api/v1/student/recent-flashcards` → via `getPDFHistoryApi`
- **Request:** `{ limit: 10 }`
- **Success:** HTTP 200 → `pdfItems` populated
- **Errors:** silent catch — `HistoryPage.tsx:204`
- **Trigger:** `fetchData()` on mount
- **Source:** `HistoryPage.tsx:169`

#### Stats fetch
- **Endpoint:** `GET /api/v1/quizsets/stats` → via `getHistoryStatsApi`
- **Request:** none
- **Success:** HTTP 200 → `stats` state updated
- **Errors:** silent catch — `HistoryPage.tsx:204`
- **Trigger:** `fetchData()` on mount
- **Source:** `HistoryPage.tsx:163`

## Interaction Patterns

- **Clicking a PDF history row's download button triggers browser file download** — source: `HistoryPage.tsx:215`
- **Data is fetched in parallel via `Promise.all`** — source: `HistoryPage.tsx:181`
- **Each API result is cached independently via `storeCache.fetchWithCache` with 5-minute TTL** — source: `HistoryPage.tsx:163,169,175`
- **PDF description and status are computed client-side from `processingStatus` and generation counts** — source: `HistoryPage.tsx:22–61`
- **Exam pass/fail threshold is hardcoded at 50%** — source: `HistoryPage.tsx:71`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `HistoryTemplate` may have `role`/`aria-label`; not confirmed from static analysis |
| Keyboard navigation | unknown | tab order depends on template implementation |
| Focus management | unknown | no explicit focus management in page |
| Screen reader compatibility | unknown | no semantic landmarks confirmed in page |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isLoading === true` | feature-flag | centered spinner | all panels | `HistoryPage.tsx:243` |
| `pdfItems.length === 0` (after load) | data-driven | empty state per template panel | populated list | `HistoryPage.tsx:189` |
| `examItems.length === 0` (after load) | data-driven | empty state per template panel | populated list | `HistoryPage.tsx:198` |

## Component Variants

Omit — no shared polymorphic component rendered on this page.

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| Route guard on `/k/history` | auth | Redirect to `/login` if unauthenticated (handled by parent K layout) |

`TeacherRoute` is NOT used on this page. Route-level auth is managed by the K layout shell (protected `/k/` route group). Source: `HistoryPage.tsx` (no auth guard present in the page itself).

## Source References

- Page: `examio-fe/src/pages/k/HistoryPage.tsx`
- History API: `examio-fe/src/apis/historyApi.ts`
- Store cache: `examio-fe/src/lib/storeCache.ts`
- HistoryTemplate: `examio-fe/src/templates/HistoryTemplate.tsx` (referenced, not read)
