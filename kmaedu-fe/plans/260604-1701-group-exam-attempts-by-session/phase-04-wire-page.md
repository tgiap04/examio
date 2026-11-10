# Phase 04 — Wire MyExamsPage + Cleanup

**Priority:** P1 · **Status:** completed · BlockedBy: 02, 03

## Goal
Connect grouping → SessionCard grid → history modal. Remove dead code. Verify build.

## File
`src/pages/k/MyExamsPage.tsx`

## Changes
1. `const PAGE_SIZE = 50` (was 12).
2. State:
   - keep raw `examAttempts: RecentExamAttempt[]` (needed for pin re-group).
   - derive `const sessions = useMemo(() => sortWithPinnedFirst(groupBySession(examAttempts)), [examAttempts])`.
   - replace `detailDialog` with `historyDialog: { open: boolean; session: SessionSummary | null }`.
3. `handleTogglePin(session)`: toggle on raw attempts where
   `examSession.examRoom.id === session.examRoomId` (optimistic), call
   `togglePinExamRoomApi(session.examRoomId)`, revert on error. Re-group is automatic via useMemo.
4. Grid: map `sessions` → `<SessionCard session onViewHistory onTogglePin />`.
   `key={session.examSessionId}`. Keep `order` pinned styling.
5. Empty check: `sessions.length === 0`.
6. Header count: show `sessions.length` (sessions on page), keep API `total`-based
   pagination unchanged.
7. Dialog: render `<SessionHistoryDialog session={historyDialog.session} />`;
   title "Lịch sử bài thi". `onViewHistory` sets `{ open:true, session }`.
8. Remove `ExamCard`, `ExamAttemptDetails`, unused imports (`Eye`, `TrendingUp`,
   `PlayCircle` if unused, etc.). Run `yarn lint:fix`.

## File size check
If file > 200 lines after changes, extract `SessionCard` and `SessionHistoryDialog`
into `src/pages/k/components/session-card.tsx` and `session-history-dialog.tsx`
(kebab-case). Move shared `StatusBadge`/`getScoreColor`/`formatTimeAgo` only if both
need them; otherwise keep in page. Prefer extraction over a 300-line file.

## Validation
- [x] `yarn lint` clean
- [x] `yarn build` passes (strict TS)
- [x] Manual: card per session, "Tiếp tục" gating, modal list, "Xem kết quả" gating, pin toggle persists
- [x] No unused imports / dead components

## Success Criteria
All plan-level success criteria met; single-file (or page+components dir) diff;
no API/store edits.
