# Phase 02 — SessionCard Component

**Priority:** P1 · **Status:** completed · BlockedBy: 01

## Goal
Replace `ExamCard` (per-attempt) with `SessionCard` (per-session). Reuse existing
visual tokens, `StatusBadge`, `getScoreColor`, `formatTimeAgo`.

## File
`src/pages/k/MyExamsPage.tsx`

## Signature

```ts
function SessionCard({
  session,
  onViewHistory,
  onTogglePin,
}: {
  session: SessionSummary
  onViewHistory: (s: SessionSummary) => void
  onTogglePin: (s: SessionSummary) => void
}) { ... }
```

## Layout (keep ExamCard shell, adjust content)
- Pin indicator (top-right) when `session.isPinned`.
- Header: Trophy icon + `session.title` (line-clamp-2) + last-attempt `formatTimeAgo(session.lastAttemptAt)` + violations if `totalViolations>0`.
- Badge: if `session.hasInProgress` → `<StatusBadge status={0} />` ("Đang làm"); else `<StatusBadge status={1} />`.
- Stats grid (3 cols):
  - Điểm cao nhất: `bestScore?.toFixed(1) ?? "—"` colored via `getScoreColor`.
  - Số lần thi: `attemptCount`.
  - Tỷ lệ tốt nhất: `bestPercentage%`.
- Progress bar: width = `bestPercentage%` (show when `attemptCount>0`).
- Footer actions:
  - Pin toggle button (left) → `onTogglePin(session)`.
  - If `hasInProgress`: primary "Tiếp tục" → `window.location.assign(/exam-session/${inProgressSessionId}/quiz)` (match existing nav style).
  - Always: outline "Lịch sử" (History icon) → `onViewHistory(session)`.
  - When both present, render "Tiếp tục" + "Lịch sử" side by side (gap-2).

## Notes
- Remove single-attempt-only "Chi tiết" button concept.
- Import `History` icon from lucide-react; drop now-unused icons (`Eye`, `PlayCircle` keep if reused).

## Todo
- [x] Implement `SessionCard`
- [x] Wire "Tiếp tục" + "Lịch sử" buttons
- [x] Verify tokens match design (bg-coral, text-success, surface-soft)

## Success Criteria
- Card renders session-level info; "Tiếp tục" only when in-progress; "Lịch sử" always.
