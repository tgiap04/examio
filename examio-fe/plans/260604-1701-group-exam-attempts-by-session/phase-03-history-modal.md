# Phase 03 — Attempt-History Modal

**Priority:** P1 · **Status:** completed · BlockedBy: 01

## Goal
Replace `ExamAttemptDetails` (single attempt) with `SessionHistoryDialog` that
lazy-loads all attempts for a session and lists them (style ≈ ExamRoomDetailTemplate
attempt-history rows).

## File
`src/pages/k/MyExamsPage.tsx` · API: `getMyAttemptsBySessionApi` (examAttemptApi.ts)

## Component

```ts
function SessionHistoryDialog({
  session,           // SessionSummary | null
}: { session: SessionSummary | null }) { ... }
```

Internal state: `attempts: MyAttemptItem[]`, `loading: boolean`, `error: boolean`.

### Lazy fetch
- `useEffect` keyed on `session?.examSessionId`: when non-null, call
  `getMyAttemptsBySessionApi(sessionId, 1, 50)` → set attempts.
- Reset state when session becomes null (dialog closed).
- try/catch → `error=true` → show "Không thể tải lịch sử" + retry not required (KISS).

### Add helper `formatDuration(seconds)` 
Copy the h:mm:ss / m:ss formatter from ExamRoomDetailTemplate.tsx:80 (DRY: local
copy acceptable; no shared util exists). Handles null → "-".

### Row per attempt (most-recent first; reverse if API returns asc)
- "Lần thi #N" (N = total - index, or index+1 — pick descending by startedAt).
- Date: `new Date(startedAt).toLocaleString("vi-VN")`.
- score% = `round(correctAnswers/totalQuestions*100)` ; `correctAnswers/totalQuestions đúng`.
- `formatDuration(timeSpentSeconds)`.
- `violationCount` chip if > 0.
- `<StatusBadge status={attempt.status} />`.
- "Xem kết quả" button: show only when `status === 1 && session.showAnswersAfterSubmit`
  → navigate `/exam-session/${session.examSessionId}/quiz?attemptId=${attempt.id}&view=result`
  (use `useNavigate`; matches ExamSessionPage.tsx:357).

### States
- loading → 3 Skeleton rows.
- empty (attempts.length===0) → "Chưa có lần thi nào".
- error → error message.

## Todo
- [x] Implement `SessionHistoryDialog` with lazy fetch
- [x] Add local `formatDuration`
- [x] Render attempt rows + conditional "Xem kết quả"
- [x] loading / empty / error states

## Success Criteria
- Opening modal fetches once; lists all attempts; result button only when eligible.
- Fetch failure shows toast/error, no crash.
