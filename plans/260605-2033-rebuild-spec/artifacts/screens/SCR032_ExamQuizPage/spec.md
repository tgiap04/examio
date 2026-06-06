# SCR032: ExamQuizPage — Screen Spec

**Screen**: SCR032: ExamQuizPage
**Type**: atomic
**Route**: `/exam-session/:id/quiz`
**Generated**: 2026-06-06

---

## Purpose

A student takes an active exam inside this page. The page fetches and decrypts questions client-side, renders a question navigator with a countdown timer, auto-saves progress every second (debounced), detects cheating behaviors, and submits answers securely on completion or timeout.

---

## Screen Layout

Three-region layout: a sticky header (R1) with question counter and timer, a scrollable main content area (R2) with the question card and side panel, and a sticky footer (R3) with prev/next navigation. After submission, the result view replaces the quiz layout with a centered score card and optional per-question review sheet. — source: `ExamQuizPage.tsx:716–900`

### Layout Sketch

```
┌─────────────────────────────────────────────────────────┐
│ R1: Quiz Header (sticky-top, z-10)                       │
│   R1a: Back + title | theme toggle | answered pill | timer│
├─────────────────────────────────┬───────────────────────┤
│ R2: Main Content (scrollable)   │ R3: Question Navigator│
│   R2a: Progress bar             │   (sticky, lg:col-1)   │
│   R2b: Question card            │   - question grid      │
│   R2c: Option rows              │   - answer stats       │
│                                │   - warning (≤5min)    │
│                                │   - submit button      │
├─────────────────────────────────┴───────────────────────┤
│ R4: Footer Nav (sticky-bottom, z-10)                     │
│   Prev button | Next / Submit button                    │
└─────────────────────────────────────────────────────────┘
```

**Result View (post-submit):**

```
┌─────────────────────────────────────────────────────────┐
│ R1: Result Header (sticky-top)                           │
├─────────────────────────────────────────────────────────┤
│ R2: Score Card (centered, max-w-4xl)                     │
│   icon + title + 5-stat grid + action buttons           │
├─────────────────────────────────────────────────────────┤
│ R5: Review Sheet (grid, shown when "Xem chi tiết" taken) │
│   question card + per-option state rows + question grid │
└─────────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|----------|------|----------|-----------|----------------|---------------------|
| R1 | Quiz Header | sticky-top | no | back button, theme toggle, answered pill, timer display | always visible |
| R2 | Main Content | static | yes | Progress bar, question card, QuizOptionRow options | fluid, col-span-2 on lg |
| R3 | Question Navigator | static | yes (overflow-y-auto) | question grid buttons, stats summary, warning badge, submit button | col-span-1 on lg, collapses to hidden-xs |
| R4 | Footer Nav | sticky-bottom | no | prev/next buttons | always visible |
| R5 | Result Score Card | static | yes | icon, title, 5-stat grid, action buttons | centered, max-w-4xl |
| R6 | Review Sheet | static | yes | question card, option rows, question grid, prev/next footer | shown only in review mode |

---

## User Flow

### Happy Path (new attempt)

1. User lands on `/exam-session/:id/quiz` — auth check runs first
2. Page shows centered Loader2 ("Đang tải bài thi...")
3. `startExamAttemptApi` creates a new attempt; `fetchAndDecryptSecureQuiz` decrypts questions client-side
4. Timer starts, question 1 renders with 4 option rows
5. User clicks an option → `handleAnswerSelect` updates `answers` state, option turns coral (selected state)
6. User clicks "Đánh dấu" flag → `handleMarkForReview` toggles the flag, button turns filled
7. User clicks "Câu sau" or navigates question grid → `currentQuestionIndex` increments, next question renders
8. User reaches last question → footer "Câu sau" button changes to "Nộp bài" (or "Nộp bài" directly if answered count < total)
9. User clicks "Nộp bài" → `ConfirmDialog` appears: "Bạn mới trả lời N/M câu hỏi..."
10. User confirms → `doSubmit` calls `saveProgress` then `submitSecureQuiz`, result card renders
11. User clicks "Xem chi tiết" → `showDetailedResults=true`, review sheet renders with question 1

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|---------------|-----------|------------------------|--------|
| `view=result` in URL | `searchParams.get("view") === "result"` | Load-only mode: `getExamAttemptDetailApi`, answers locked, no timer, submit panel hidden | `ExamQuizPage.tsx:173` |
| resume attempt | `startResult.isResume && savedAnswers.length > 0` | Toast "Tiếp tục làm bài" + answers restored | `ExamQuizPage.tsx:241` |
| already submitted | `secureQuizData.status === 1` | Auto-submit on load, result card renders | `ExamQuizPage.tsx:249` |
| time ≤ 30s remaining | `remainingSeconds <= 30 && remainingSeconds > 0` | Toast warning + timer turns red+pulse | `ExamQuizPage.tsx:294` |
| time = 0 | `remainingSeconds <= 0` | `handleAutoSubmit` fires, auto-submit without confirm dialog | `ExamQuizPage.tsx:301` |
| tab switch detected | `visibilitychange` → `document.hidden` | `CheatingWarningModal` appears, violation logged | `useCheatingDetection.ts:88` |
| first question | `currentQuestionIndex === 0` | "Câu trước" button disabled | `ExamQuizPage.tsx:880` |
| last question | `currentQuestionIndex === totalQuestions - 1` | "Câu sau" button replaced by "Nộp bài" | `ExamQuizPage.tsx:886` |
| unanswered last question | last question + `answeredCount < totalQuestions` | "Nộp bài" still shown (with confirm dialog warning) | `ExamQuizPage.tsx:887` |
| no questions | `totalQuestions === 0` | Empty state: "Không có câu hỏi" + exit button | `ExamQuizPage.tsx:451` |
| API error | `startExamAttemptApi` throws | Error state: "Không thể tải bài thi" + exit button | `ExamQuizPage.tsx:438` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `currentQuestion.question` | Câu hỏi | API field (decrypted) | StandardMarkdownRenderer | — | MODEL-009.question |
| `currentQuestion.options[]` | Các lựa chọn | API field (decrypted) | rendered as QuizOptionRow list | — | MODEL-009.options |
| `answers[currentQuestion.id]` | Đáp án đã chọn | client state | option letter "A"–"Z" | "" (unanswered) | MODEL-019.answers |
| `markedForReview` | Câu đánh dấu | client state | Set of question IDs | empty Set | N/A |
| `currentQuestionIndex` | Số thứ tự | client state | "Câu N / M" | 0-indexed | N/A |
| `progressPercentage` | Tiến độ | computed | `answeredCount/totalQuestions * 100` | 0 | N/A |
| `answeredCount` | Đã trả lời | computed | integer | 0 | N/A |
| `timeSpentSeconds` | Thời gian đã làm | client state (timer tick) | `H:MM:SS` | 0 | MODEL-019.timeSpentSeconds |
| `remainingTime` | Thời gian còn lại | computed | `timeLimitMinutes*60 - timeSpentSeconds` | null (no limit) | MODEL-018.durationMinutes |
| `resultData.score` | Điểm | API field | raw number | 0 | MODEL-019.score |
| `resultData.correctAnswers` | Số câu đúng | computed | integer | 0 | MODEL-019.correctAnswers |
| `resultData.percentage` | Tỷ lệ % | computed | `correctAnswers/totalQuestions * 100` | 0 | MODEL-019.score |
| `resultData.passed` | Kết quả | computed | boolean | false | MODEL-019.score |
| `resultData.passingScore` | Điểm đạt | API field | integer | 0 | MODEL-018.passingScore |
| `resultData.violationCount` | Số vi phạm | computed | integer | 0 | MODEL-019.violationCount |
| `resultData.questions` | Chi tiết câu hỏi | API field | Question[] for review | undefined | MODEL-009 |
| `reviewQuestion.userAnswer` | Đáp án của bạn | API field | option letter | null (skipped) | MODEL-019.answers |
| `reviewQuestion.answer` | Đáp án đúng | API field | option letter | — | MODEL-009.answer |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| authChecking | `initializing || !isAuthenticated` | Centered Loader2 spinner | none | `ExamQuizPage.tsx:416` |
| loading | `startExamAttemptApi` / `fetchAndDecryptSecureQuiz` in-flight | Centered Loader2 "Đang tải bài thi..." | none | `ExamQuizPage.tsx:427` |
| error | API throws during init | Centered error card: XCircle icon + message + exit button | "Quay lại" exits to session page | `ExamQuizPage.tsx:438` |
| noQuestions | `totalQuestions === 0` after load | Centered empty state: "Không có câu hỏi" + exit button | "Quay lại" | `ExamQuizPage.tsx:451` |
| quiz | normal quiz mode | header + content + navigator + footer | all interactions | `ExamQuizPage.tsx:695` |
| cheatingWarning | `useCheatingDetection` detects violation | `CheatingWarningModal` overlay | "Đã hiểu" dismisses | `ExamQuizPage.tsx:709` |
| submitConfirm | user clicks "Nộp bài" | `ConfirmDialog` with answer count warning | confirm / cancel | `ExamQuizPage.tsx:699` |
| submitting | `doSubmit` in-flight | spinner + disabled buttons | none | `ExamQuizPage.tsx:405` |
| result | submission complete | score card (CheckCircle2 or XCircle) | "Xem chi tiết" / "Làm lại" / "Thoát" | `ExamQuizPage.tsx:464` |
| reviewMode | user clicks "Xem chi tiết" | full review sheet with per-question state | prev/next question, grid navigation | `ExamQuizPage.tsx:469` |

---

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| accessCode (SCR031) | OTP | yes | exactly 6 digits | N/A (handled on SCR031) | N/A |
| N/A | — | — | — | — | No client-side form validation on this screen |

### B) Server-side

#### Start exam attempt
- **Endpoint:** `POST /api/v1/examattempts`
- **Request:** `{ examSessionId: string }`
- **Success:** `201` → attempt created, navigate to quiz
- **Errors:** `403` → toast error "Không thể bắt đầu bài thi" | `400` → toast error
- **Trigger:** page load `useEffect`
- **Source:** `ExamQuizPage.tsx:221`

#### Fetch secure quiz
- **Endpoint:** `GET /api/v1/examattempts/:id/secure-quiz`
- **Request:** attempt ID from route (AES-256-CBC encrypted payload)
- **Success:** `200` → encrypted questions decrypted client-side
- **Errors:** `403` → error state
- **Trigger:** page load after `startExamAttemptApi`
- **Source:** `ExamQuizPage.tsx:224` via `fetchAndDecryptSecureQuiz`

#### Save progress (auto-save)
- **Endpoint:** `PATCH /api/v1/examattempts/:id/progress`
- **Request:** `{ answers: Record<string,string>, currentIndex: number, markedQuestions: string[] }`
- **Success:** `200` → silently saved
- **Errors:** silently caught, no user-visible error
- **Trigger:** debounced (1s) after answer change or question navigation
- **Source:** `ExamQuizPage.tsx:99`

#### Submit quiz
- **Endpoint:** `POST /api/v1/examattempts/:id/secure-submit`
- **Request:** `{ answers: SecureAnswer[] }` (JWT token-wrapped answers)
- **Success:** `200` → result card renders with score, percentage, pass/fail
- **Errors:** `400`/`403` → toast error "Nộp bài thất bại"
- **Trigger:** "Nộp bài" confirm or auto-submit on timeout
- **Source:** `ExamQuizPage.tsx:391`

#### Log cheating violation
- **Endpoint:** `POST /api/v1/cheating-logs`
- **Request:** `{ examAttemptId: string, type: CHEATING_TYPE }`
- **Success:** `201` → warning modal shown
- **Errors:** silently caught
- **Trigger:** browser event (tab switch, blur, devtools, copy/paste, right-click, fullscreen exit, print screen)
- **Source:** `useCheatingDetection.ts:47`

---

## Interaction Patterns

- **Clicking an option row selects/deselects it** — source: `ExamQuizPage.tsx:797` (`onClick={() => handleAnswerSelect(isSelected ? "" : optionLetter)}`)
- **Progress auto-saves 1 second after last answer change** — source: `ExamQuizPage.tsx:82` (`useDebounce(answers, 1000)`) + `ExamQuizPage.tsx:308`
- **Timer ticks every second** — source: `ExamQuizPage.tsx:277` (`setInterval` in `useEffect`)
- **sendBeacon fires on tab close** — source: `ExamQuizPage.tsx:315` (`window.addEventListener("beforeunload", ...)`)
- **Keyboard: Enter/Space on option row** — source: `QuizOptionRow.tsx:51` (`onKeyDown`)
- **Keyboard: ArrowLeft/Right for prev/next navigation** — source: standard button click (no explicit keyboard handler)
- **Cheating detection: tab switch → warning modal** — source: `useCheatingDetection.ts:88`
- **Cheating detection: copy/paste blocked** — source: `useCheatingDetection.ts:116`
- **Theme toggle: light/dark** — source: `ExamQuizPage.tsx:48` (`toggleTheme`)
- **Clicking question number in grid jumps to that question** — source: `ExamQuizPage.tsx:825`
- **30-second warning toast + red pulsing timer** — source: `ExamQuizPage.tsx:294` + `ExamQuizPage.tsx:741`

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `role="button"` on option rows (`QuizOptionRow.tsx:49`), `aria-label` on theme toggle, no `aria-live` for timer/toast |
| Keyboard navigation | supported | Tab through options, Enter/Space to select; prev/next footer buttons; question grid buttons |
| Focus management | unmanaged | No explicit focus trap; ConfirmDialog uses native dialog |
| Screen reader compatibility | unknown | Option rows use semantic div+role=button; dialog uses AlertDialog primitive |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading === true` | state | centered spinner | quiz layout | `ExamQuizPage.tsx:427` |
| `error !== null` | state | error card | quiz layout | `ExamQuizPage.tsx:438` |
| `totalQuestions === 0` | state | empty state card | quiz layout | `ExamQuizPage.tsx:451` |
| `isSubmitted === true` | state | result score card | quiz layout | `ExamQuizPage.tsx:464` |
| `showDetailedResults === true` | state | review sheet | result summary card | `ExamQuizPage.tsx:469` |
| `isViewOnly === true` | auth | read-only quiz mode | submit button, mark-for-review | `ExamQuizPage.tsx:333` |
| `remainingTime !== null && remainingTime <= 60` | state | red+pulse timer class | normal timer class | `ExamQuizPage.tsx:741` |
| `remainingTime !== null && remainingTime <= 300 && remainingTime > 0` | state | warning badge in navigator | hidden | `ExamQuizPage.tsx:858` |
| `currentQuestionIndex === 0` | state | "Câu trước" disabled | enabled prev button | `ExamQuizPage.tsx:880` |
| `currentQuestionIndex === totalQuestions - 1` | state | "Nộp bài" replaces "Câu sau" | next button | `ExamQuizPage.tsx:886` |
| `!answers[q.id]` | data | muted question grid button | primary button | `ExamQuizPage.tsx:819` |
| `markedForReview.has(q.id)` | data | Flag icon on question grid button | no flag | `ExamQuizPage.tsx:834` |
| `resultData.violationCount > 0` | data | orange text on violation count | green text | `ExamQuizPage.tsx:667` |
| `!userAnswer` (review) | data | skipped state + warning banner | correct/wrong row | `ExamQuizPage.tsx:543` |

---

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| QuizOptionRow | `state` prop | `"selected"`, `"default"` (quiz mode); `"correct"`, `"wrong"`, `"skipped"` (review mode) | quiz mode: `onClick` handler; review mode: no onClick | DISC-001 |
| ConfirmDialog | `open` prop | submit confirmation only | title="Xác nhận nộp bài", description with answer count | N/A |
| CheatingWarningModal | `open` prop | violation warning | `violationType`, `totalViolations` from `useCheatingDetection` | N/A |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `isAuthenticated` check in `useEffect` | auth | Redirect to `/login?from=...` |
| `enabled: !!attemptId && !isSubmitted && !loading` passed to `useCheatingDetection` | auth | Cheating detection inactive during loading/submitted states |
| AES-256-CBC client-side decryption of questions | security | Raw questions never transmitted over wire; server stores encrypted blob |
| JWT token per question for submit verification | security | Replay attacks prevented; each question token valid for one submit |
| `sendBeacon` on `beforeunload` | security | Progress auto-saved even if user closes tab accidentally |

[UNVERIFIED] server enforcement — static analysis cannot confirm API middleware for access check endpoint.

---

## Source References

- Page/View: `examio-fe/src/pages/exam-session/ExamQuizPage.tsx:1`
- Shared component: `examio-fe/src/components/molecules/QuizOptionRow.tsx:1`
- Shared component: `examio-fe/src/components/molecules/CheatingWarningModal.tsx:1`
- Hook: `examio-fe/src/hooks/useCheatingDetection.ts:1`
- Utils: `examio-fe/src/lib/secureQuizHelpers.ts:1`
- API (attempt): `examio-fe/src/apis/examAttemptApi.ts:86` (`startExamAttemptApi`), `examio-fe/src/apis/examAttemptApi.ts:100` (`updateExamAttemptProgressApi`), `examio-fe/src/apis/examAttemptApi.ts:211` (`getExamAttemptDetailApi`), `examio-fe/src/apis/examAttemptApi.ts:333` (`getSecureQuizApi`), `examio-fe/src/apis/examAttemptApi.ts:344` (`submitSecureQuizApi`)
- Route config: `examio-fe/src/routes/index.tsx:255`
