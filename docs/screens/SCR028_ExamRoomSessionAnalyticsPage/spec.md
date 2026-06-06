# SCR028: ExamRoomSessionAnalyticsPage — Screen Spec

**Screen**: SCR028: ExamRoomSessionAnalyticsPage
**Type**: atomic
**Route**: `/k/manage-exam-room/:id/session/:sessionId`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that shows per-session analytics for a single exam session: participant leaderboard, score distribution chart, cheating statistics, and per-attempt detail. The host uses this to monitor exam integrity and identify students who may need intervention.

## Screen Layout

KLayout-wrapped page with the shared analytics layout. Top: session metadata + stats. Middle: charts (recharts). Bottom: per-attempt leaderboard table.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: AnalyticsPage Main                 │
│  ┌─ R2a: SessionHeader ──────────────┐  │
│  │   title, status, dates           │   │
│  ├─ R2b: StatsCards (4) ────────────┐  │ │
│  │   attempts, avg, pass rate, etc │  │ │
│  ├─ R2c: ChartsRow (recharts) ──────┐  │ │ │
│  │   ┌─ score dist ─┐ ┌─ cheating ┐ │  │ │ │
│  │   └─ bar chart  ─┘ └─ line      ┘ │  │ │ │
│  └─ R2d: AttemptLeaderboard ────────┘  │  │ │
│      ┌─ table: student, score, time ┐  │  │ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2a | SessionHeader | static | no | session title, status badge | fluid |
| R2b | StatsCards | static | no | 4× StatCard | 2x2-sm, 4-col-md+ |
| R2c | ChartsRow | static | yes (own) | Recharts BarChart, LineChart | 1-col-sm, 2-col-md+ |
| R2d | AttemptLeaderboard | static | yes (own) | ExamTable, Pagination | full-width |

## User Flow

### Happy Path

1. User navigates from ManageExamRoomDetailPage → click "View Analytics" on session row
2. Page mounts → fetches in parallel: session metadata, attempt leaderboard, score distribution, cheating stats
3. User reviews charts (score histogram, cheating events over time)
4. User scrolls leaderboard → clicks on a row → opens per-attempt detail modal with cheating log

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Empty attempts | `attempts.length === 0` | empty-state + "No attempts yet" | `examio-fe/src/components/organisms/k/ExamTable.tsx:88` |
| Filter by cheating | User toggles "Suspicious only" | Table re-fetches with filter | `examio-fe/src/components/molecules/NotificationFilterButton.tsx:18` |
| Export PDF | User clicks "Export" | `useExportPDF` generates PDF | `examio-fe/src/hooks/useExportPDF.ts:31` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| sessionTitle | Session title | `session.title` | raw | — | MODEL-018 |
| avgScore | "85%" | `avg(attempts.score)` | percentage | dash | MODEL-019 |
| passRate | "73% passed" | `count(attempts.score >= passingScore) / count(attempts)` | percentage | dash | MODEL-019 |
| totalViolations | "12 violations" | `sum(attempts.violationCount)` | integer | 0 | MODEL-019 |
| scoreDistribution | bin counts | `groupBy(attempts.score, bin)` | chart data | empty | MODEL-019 |
| cheatingTimeline | events over time | `cheatingLogs.groupBy(time)` | chart data | empty | MODEL-020 |
| studentName | student name | `attempt.user.username` | raw | dash | MODEL-001 |
| attemptScore | score | `attempt.score` | percentage | dash | MODEL-019 |
| timeSpent | "25m 30s" | `attempt.timeSpentSeconds` | duration | dash | MODEL-022 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | API in-flight | skeleton cards + chart placeholders | none | varies |
| empty | 0 attempts | empty-state illustration | none | `examio-fe/src/components/organisms/k/ExamTable.tsx:88` |
| error | API error | error message + retry | retry | varies |
| exporting | PDF generation in-flight | progress toast | none | `examio-fe/src/hooks/useExportPDF.ts:31` |

## Validation & Error Feedback

`N/A — no client-side form validation detected.`

### B) Server-side

#### Get session analytics
- **Endpoint:** `GET /api/v1/examsessions/:id/analytics`
- **Success:** `200` → `{ session, stats, charts, attempts }`
- **Errors:** `403` (not host) | `404` (session not found)
- **Source:** `examio-fe/src/apis/examSessionApi.ts:142`

#### Get cheating stats
- **Endpoint:** `GET /api/v1/cheatinglogs/session/:id/stats`
- **Success:** `200` → `{ totalViolations, byType, timeline }`
- **Source:** `examio-fe/src/apis/cheatingLogApi.ts:42`

## Interaction Patterns

- **Recharts BarChart for score distribution** — source: `examio-fe/src/components/molecules/HistoryStatCard.tsx:18`
- **Recharts LineChart for cheating events** — source: `examio-fe/src/components/molecules/ExamMetricCard.tsx:31`
- **Sort by score desc, then by time asc** — source: `examio-fe/src/components/organisms/k/ExamTable.tsx:188`
- **Export PDF with charts embedded** — source: `examio-fe/src/hooks/useExportPDF.ts:42`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Charts have role=img, no detailed labels |
| Keyboard navigation | supported | Tab through table rows |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | Charts not announced with data summary |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `user.isHost === true` | permission | "Export PDF" button | — | host-only action |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| Host ownership check (server) | permission | cross-session data leak |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |

## Source References

- Page/View: `examio-fe/src/pages/k/ExamRoomSessionAnalyticsPage.tsx:1`
- Charts: `examio-fe/src/components/molecules/HistoryStatCard.tsx:1` + `examio-fe/src/components/molecules/ExamMetricCard.tsx:1`
- API: `examio-fe/src/apis/examSessionApi.ts:142` + `examio-fe/src/apis/cheatingLogApi.ts:42`
- Export: `examio-fe/src/hooks/useExportPDF.ts:1`
