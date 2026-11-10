# SCR028: ExamQuizPage — Screen Spec

**Screen**: SCR028: ExamQuizPage
**Type**: atomic
**Route**: `/exam-session/:id/quiz`
**Generated**: 2026-06-06

## Purpose

A student actively takes an exam: reads questions, selects answers, navigates between questions, marks items for review, monitors time, and submits. The page also shows detailed post-submission results with per-question review. This is the core live-exam UI, entered from SCR027 (ExamSessionPage) or SCR029 (MyExamsPage).

## Screen Layout

The page renders a full-height flex column (`flex-col min-h-screen`). A sticky header at the top shows the current question number, answer progress, and countdown timer. Below the header is a `container max-w-7xl` with a 2/3 + 1/3 grid: left column shows the question card; right column shows the question navigator sidebar (sticky, `max-height: calc(100vh - 24rem)`) with a submit button at the bottom. A sticky footer has prev/next navigation. After submission, an overview card replaces the quiz layout. After viewing detailed results, a 3-column grid shows the question review (2/3) and a sidebar navigator (1/3). The page is entirely dark/light theme-aware with a toggle button.

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ R1: Quiz Header (sticky top-0, z-10)                 │
│  [←] "Bài thi" | Q N/M | [theme] | answered/N | timer│
├─────────────────────────────────────────────────────┤
│ R2: Progress Bar (2px coral line, sticky below R1) │
├─────────────────────────────┬───────────────────────┤
│ R3: Question Area (scroll) │ R4: Navigator Sidebar │
│                             │  (sticky, max-h)      │
│  [Q N / total] + markdown  │  5-col button grid   │
│  2-col option grid         │  Answered/Marked stats│
│  [Mark for Review]         │  Time warning (5min)  │
│                             │  [Nộp bài] button    │
├─────────────────────────────┴───────────────────────┤
│ R5: Footer Nav (sticky bottom-0)                    │
│  [← Câu trước]              [Câu sau / Nộp bài →] │
└─────────────────────────────────────────────────────┘

── Post-submission (R6) ───────────────────────────────
┌─────────────────────────────────────────────────────┐
│  [✓ Pass] or [✗ Fail] icon + score breakdown       │
│  5 metric tiles: Đúng, Sai, %, Thời gian, Vi phạm  │
│  [Xem chi tiết] [Làm lại] [Thoát]                  │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Quiz Header | sticky-top-0, z-10 | no | question counter, theme toggle, answer counter pill, timer pill | always visible |
| R2 | Progress Bar | static below R1 | no | `<Progress>` thin bar | full-width |
| R3 | Question Area | static, flex-1 | yes | question card, `QuizOptionRow` × 4, mark-for-review button | `lg:col-span-2` |
| R4 | Navigator Sidebar | sticky, max-h | yes (overflow-y) | question grid buttons, stat pills, time-warning alert, submit button | `lg:col-span-1`, collapses on mobile |
| R5 | Footer Nav | sticky-bottom-0, z-10 | no | prev/next buttons, conditional submit | always visible |
| R6 | Results Overview | static | no | score icon, 5 metric cards, action buttons | `max-w-4xl` centered |
| R7 | Detailed Results | full flex col | yes | question review card + question list sidebar | same structure as quiz mode |

## User Flow

### Happy Path

1. Student navigates to `/exam-session/{id}/quiz` (new attempt) or `/exam-session/{id}/quiz?attemptId=...` (resume/view result).
2. Auth guard at `ExamQuizPage.tsx:416` checks `isAuthenticated`; if not, redirects to login.
3. `initExam` effect (`ExamQuizPage.tsx:152`) runs:
   - **New attempt:** calls `startExamAttemptApi` → sets `attemptId` → calls `fetchAndDecryptSecureQuiz(attemptId)` → decrypts questions client-side with AES-256-CBC → renders quiz.
   - **Resume:** same flow but saved answers/index/markedQuestions are restored.
   - **View result:** calls `getExamAttemptDetailApi(attemptId)` → sets `resultData` + `isSubmitted=true` → shows results overview.
4. Timer starts at 1s interval (`ExamQuizPage.tsx:276`). At 30s remaining, warning toast fires (`ExamQuizPage.tsx:294`). At 0s, `handleAutoSubmit` fires (`ExamQuizPage.tsx:118`).
5. Student selects an answer option → `handleAnswerSelect` updates `answers` state (`ExamQuizPage.tsx:365`). Debounced save (1s) triggers `saveProgress` → `updateExamAttemptProgressApi` (`ExamQuizPage.tsx:99`).
6. Student clicks **Đánh dấu** → `handleMarkForReview` toggles question ID in `markedForReview` Set.
7. Student navigates questions via prev/next footer buttons or by clicking question numbers in the sidebar navigator.
8. **Submit flow:** Student clicks **Nộp bài** → `ConfirmDialog` shows unanswered count → `doSubmit` → `saveProgress` → `submitSecureQuiz` → `resultData` set → `isSubmitted=true` → results overview shown.
9. If `resultData.showAnswers` is true, **Xem chi tiết** → detailed result review mode with per-question answer display.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Not authenticated | `initializing \|\| !isAuthenticated` | Spinner + "Đang kiểm tra đăng nhập..." | `ExamQuizPage.tsx:416` |
| Loading | `loading === true` | Full-screen spinner + "Đang tải bài thi..." | `ExamQuizPage.tsx:427` |
| Error loading | `error !== null` | Error card with message + back button | `ExamQuizPage.tsx:438` |
| No questions | `totalQuestions === 0` | "Không có câu hỏi" card + back button | `ExamQuizPage.tsx:451` |
| Tab/window blur | `useCheatingDetection` hook | `CheatingWarningModal` appears; violation logged | `ExamQuizPage.tsx:85` |
| Time ≤30s remaining | `remainingSeconds <= 30` | Toast warning fires once | `ExamQuizPage.tsx:294` |
| Time = 0 | `remainingSeconds <= 0` | `handleAutoSubmit` fires | `ExamQuizPage.tsx:301` |
| On last question | `currentQuestionIndex === totalQuestions-1` | Next button replaced by "Nộp bài" | `ExamQuizPage.tsx:886` |
| All answered on last question | `answeredCount === totalQuestions` | Next button auto-submits | `ExamQuizPage.tsx:887` |
| View=result param | `searchParams.get("view") === "result"` | Results overview shown immediately | `ExamQuizPage.tsx:172` |
| Pass | `passed === true` | CheckCircle2 icon + "Chúc mừng!" | `ExamQuizPage.tsx:641` |
| Fail | `passed === false` | XCircle icon + "Chưa đạt" | `ExamQuizPage.tsx:641` |
| `showAnswers=false` | `resultData.showAnswers === false` | "Xem chi tiết" button hidden | `ExamQuizPage.tsx:675` |
| On window close/refresh | `beforeunload` event | `sendBeacon` fires final progress save | `ExamQuizPage.tsx:315` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `currentQuestion.question` | Câu N | decrypted from `secure-quiz` endpoint | markdown rendered | n/a | MODEL-009.question |
| `currentQuestion.options` | Options A-D | decrypted array | markdown rendered in each `QuizOptionRow` | n/a | MODEL-009.options |
| `answers[questionId]` | Selected answer | local state `answers` | letter "A"–"D" | empty string (unanswered) | MODEL-019.answers |
| `currentQuestionIndex` | Question counter | local state | "Câu N / M" | n/a | MODEL-019.currentIndex |
| `answeredCount` | Answered counter | `Object.keys(answers).length` | "X/N" in header | n/a | MODEL-019.answers |
| `markedForReview.size` | Marked counter | local state `Set` size | count in sidebar | `0` → hidden | MODEL-019.markedQuestions |
| `remainingTime` | Timer display | computed `timeLimitMinutes*60 - timeSpentSeconds` | "HH:MM:SS" or "MM:SS" | null → shows elapsed time | MODEL-019.timeSpentSeconds |
| `timeSpentSeconds` | Elapsed time | `setInterval` increment | "HH:MM:SS" | n/a | MODEL-019.timeSpentSeconds |
| `progressPercentage` | Progress bar | `answeredCount / totalQuestions * 100` | `<Progress>` value | `0` | MODEL-019.answers |
| `resultData.score` | Score value | `submitSecureQuiz` result | `toFixed(0)` | n/a | MODEL-019.score |
| `resultData.percentage` | Percentage | computed correct/total | `X%` | n/a | MODEL-019.score |
| `resultData.correctAnswers` | Correct count | `submitSecureQuiz` result | integer | n/a | MODEL-019.correctAnswers |
| `resultData.violationCount` | Violations | `cheatingDetection.totalViolations` | integer | `0` | MODEL-020.count |
| `resultData.questions[n].userAnswer` | User's answer | from `getExamAttemptDetailApi` | letter "A"–"D" or null | null → "Chưa trả lời" | MODEL-019.answers |
| `resultData.questions[n].answer` | Correct answer | from `getExamAttemptDetailApi` | letter "A"–"D" | n/a | MODEL-009.answer |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| auth checking | `initializing \|\| !isAuthenticated` | Full-screen spinner | none | `ExamQuizPage.tsx:416` |
| loading | `loading === true` | Full-screen spinner + "Đang tải bài thi..." | none | `ExamQuizPage.tsx:427` |
| error | `error !== null` | Error card (XCircle) + message + back button | back button | `ExamQuizPage.tsx:438` |
| no questions | `totalQuestions === 0` | "Không có câu hỏi" card + back button | back button | `ExamQuizPage.tsx:451` |
| quiz active | `!loading && !isSubmitted && questions.length > 0` | Full quiz UI with header/question/footer | all interactions | `ExamQuizPage.tsx:697` |
| cheating warning | `cheatingDetection.isWarningVisible === true` | `CheatingWarningModal` overlay | dismiss warning | `ExamQuizPage.tsx:709` |
| submit confirm | `showSubmitConfirm === true` | `ConfirmDialog` with unanswered count | confirm or cancel | `ExamQuizPage.tsx:699` |
| submitted — overview | `isSubmitted && resultData && !showDetailedResults` | Results overview card with 5 metrics | view details, redo, exit | `ExamQuizPage.tsx:635` |
| submitted — detail review | `isSubmitted && showDetailedResults && resultData.showAnswers` | Per-question review layout | navigate questions, back to overview | `ExamQuizPage.tsx:469` |
| saving | `saveProgress` in-flight | No visual indicator (silent debounce) | user can continue answering | `ExamQuizPage.tsx:99` |
| auto-submitting | `handleAutoSubmit` fires | Results shown with info toast "Đã hết thời gian" | view results | `ExamQuizPage.tsx:118` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| answer selection | radio (implicit) | no | answer must be A-D | none | N/A — deselect by clicking same option |
| marked questions | toggle | no | any question can be marked | none | N/A |

### B) Server-side

#### Start exam attempt
- **Endpoint:** `POST /api/v1/examattempts/start/{examSessionId}`
- **Request:** `{ examSessionId }` from URL param
- **Success:** `200` → `{ examAttempt: { id, ... }, isResume }`; attemptId set, then `fetchAndDecryptSecureQuiz` called
- **Errors:** `4xx/5xx` → `error` state + toast
- **Trigger:** `initExam` on mount
- **Source:** `ExamQuizPage.tsx:221`

#### Fetch and decrypt quiz (secure endpoint)
- **Endpoint:** `GET /api/v1/examattempts/{attemptId}/secure-quiz`
- **Request:** `{ attemptId }` from `startResult.examAttempt.id`
- **Success:** `200` → AES-256-CBC encrypted blob; client decrypts with session-derived key
- **Errors:** `4xx/5xx` → error state
- **Trigger:** after `startExamAttemptApi` succeeds
- **Source:** `ExamQuizPage.tsx:224`

#### Save progress (auto-save)
- **Endpoint:** `PATCH /api/v1/examattempts/{attemptId}/progress`
- **Request:** `{ answers, currentIndex, markedQuestions }` (debounced 1s)
- **Success:** `200` → silently saved
- **Errors:** silently caught; no user-visible error (best-effort save)
- **Trigger:** `useEffect` on `debouncedAnswers` / `debouncedCurrentIndex` change
- **Source:** `ExamQuizPage.tsx:99`

#### Save progress via sendBeacon
- **Endpoint:** `PATCH /api/v1/examattempts/{attemptId}/progress` (via `sendBeacon`)
- **Request:** same as above
- **Success:** best-effort; fires on tab close/refresh
- **Trigger:** `beforeunload` event
- **Source:** `ExamQuizPage.tsx:315`

#### Submit exam
- **Endpoint:** `POST /api/v1/examattempts/{attemptId}/submit` (wrapped in `submitSecureQuiz`)
- **Request:** `{ answers: Record<questionId, token> }` — answer tokens (not plaintext)
- **Success:** `200` → `resultData` set, `isSubmitted=true`, toast "Nộp bài thành công!"
- **Errors:** `4xx/5xx` → toast error
- **Trigger:** `doSubmit` after ConfirmDialog confirmation
- **Source:** `ExamQuizPage.tsx:386`

#### Auto-submit on timeout
- **Endpoint:** same as submit
- **Request:** current answers at timeout
- **Success:** results shown with info toast "Đã hết thời gian, Bài thi đã được tự động nộp"
- **Trigger:** `remainingSeconds <= 0`
- **Source:** `ExamQuizPage.tsx:301`

#### Get attempt detail (view result)
- **Endpoint:** `GET /api/v1/examattempts/{attemptId}/detail`
- **Request:** `{ attemptId }` from URL param
- **Success:** `200` → `{ examAttempt, questions, passingScore, violationCount }`
- **Errors:** `4xx/5xx` → error state
- **Trigger:** `initExam` when `view=result` param is set
- **Source:** `ExamQuizPage.tsx:177`

## Interaction Patterns

- **Clicking an option selects it** — `QuizOptionRow` state changes to "selected"; clicking again deselects, source: `ExamQuizPage.tsx:797`
- **Clicking "Đánh dấu" toggles flag** — question ID added/removed from `markedForReview` Set; button style changes to "default" when active, source: `ExamQuizPage.tsx:774`
- **Clicking a question number in the sidebar navigates directly** — `setCurrentQuestionIndex(index)`, source: `ExamQuizPage.tsx:825`
- **Theme toggle cycles light↔dark** — `setTheme(isDarkMode ? "light" : "dark")`, source: `ExamQuizPage.tsx:48`
- **Debounced auto-save fires 1s after last answer change** — `useDebounce(answers, 1000)` + `useEffect` on `debouncedAnswers`, source: `ExamQuizPage.tsx:82`
- **Window close triggers sendBeacon progress save** — `navigator.sendBeacon(...)` with progress payload, source: `ExamQuizPage.tsx:315`
- **Timer counts up every second** — `setInterval` in `useEffect`, source: `ExamQuizPage.tsx:276`
- **30-second warning toast fires once** — `hasWarned30s` flag prevents repeat, source: `ExamQuizPage.tsx:294`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | present | `role="dialog"` on CheatingWarningModal and ConfirmDialog; `aria-label` on theme toggle, prev/next buttons |
| Keyboard navigation | supported | Tab through options; Enter/Space activates buttons; ArrowLeft/Right not bound (future) |
| Focus management | partial | `ring-2 ring-primary ring-offset-2` on current question button in sidebar; no modal focus trap on result views |
| Screen reader compatibility | unknown | `aria-live` not explicitly used; question counter updates not announced |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `initializing \|\| !isAuthenticated` | auth | Auth spinner | quiz UI | `ExamQuizPage.tsx:416` |
| `loading === true` | async | Loading spinner | quiz UI | `ExamQuizPage.tsx:427` |
| `error !== null` | error | Error card | quiz UI | `ExamQuizPage.tsx:438` |
| `totalQuestions === 0` | data | No questions card | quiz UI | `ExamQuizPage.tsx:451` |
| `!isSubmitted && resultData` | state | Auto-submit results (status=1) | normal quiz | `ExamQuizPage.tsx:249` |
| `isSubmitted && !showDetailedResults` | state | Results overview card | quiz UI + detail view | `ExamQuizPage.tsx:635` |
| `isSubmitted && showDetailedResults` | state | Detailed result review | overview card | `ExamQuizPage.tsx:469` |
| `resultData.showAnswers === false` | data | "Xem chi tiết" button hidden | button | `ExamQuizPage.tsx:675` |
| `remainingTime !== null && remainingTime <= 60` | time | Red pulsing timer pill | normal timer | `ExamQuizPage.tsx:738` |
| `markedForReview.has(currentQuestion.id)` | data | "Đã đánh dấu" button variant | "Đánh dấu" outline button | `ExamQuizPage.tsx:774` |
| `remainingTime !== null && remainingTime <= 300 && remainingTime > 0` | time | 5-minute warning alert in sidebar | warning alert | `ExamQuizPage.tsx:858` |
| `isAnswered && !isCurrent` | data | bg-primary on question button | gray button | `ExamQuizPage.tsx:829` |
| `resultData.passed === true` | data | CheckCircle2 green icon | XCircle red icon | `ExamQuizPage.tsx:641` |

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| QuizOptionRow | `state` prop | "selected" / "default" (taking) ; "correct" / "wrong" / "skipped" (review) | `optionLetter`, `state`, `onClick`, `content` | DISC-### |
| Question button | `isAnswered`, `isMarked`, `isCurrent` | answered+current / answered-only / marked / unanswered | 5-col grid with Flag icon overlay | N/A |
| Timer pill | `remainingTime <= 60` | normal (bg-muted) / pulsing red (≤60s) | font-mono, animated-pulse class | N/A |
| Submit button | last question + all answered | "Câu sau" / auto-submit "Nộp bài" | conditional rendering | N/A |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `isAuthenticated` check on mount | auth | Redirect to `/login` with return URL |
| `useCheatingDetection` hook | anti-cheat | Tab switches, window blur, devtools open are logged as `CheatingLog` entries |
| `sendBeacon` on `beforeunload` | data-integrity | Progress may be lost on abrupt close; attempt left in IN_PROGRESS |
| Questions fetched via `secure-quiz` endpoint | encryption | AES-256-CBC encrypted; plaintext never transmitted; tokens mapped client-side |
| Submit via `submitSecureQuiz` (token-based) | anti-cheat | Plaintext answers never sent; only token map submitted |
| `handleAutoSubmit` on timeout | anti-cheat | Attempt auto-submitted when `remainingSeconds <= 0` |

## Source References

- Page/View: `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx:42`
- QuizOptionRow: `kmaedu-fe/src/components/molecules/QuizOptionRow.tsx`
- CheatingWarningModal: `kmaedu-fe/src/components/molecules/CheatingWarningModal.tsx`
- ConfirmDialog: `kmaedu-fe/src/components/organisms/ConfirmDialog.tsx`
- StandardMarkdownRenderer: `kmaedu-fe/src/components/molecules/StandardMarkdownRenderer.tsx`
- useCheatingDetection: `kmaedu-fe/src/hooks/useCheatingDetection.ts`
- secureQuizHelpers: `kmaedu-fe/src/lib/secureQuizHelpers.ts`
- useDebounce: `kmaedu-fe/src/hooks/useDebounce.ts`
- ExamAttemptApi: `kmaedu-fe/src/apis/examAttemptApi.ts`
- AuthStore: `kmaedu-fe/src/stores/useAuthStore.ts`
- ThemeProvider: `kmaedu-fe/src/provider/ThemeProvider.tsx`
- quizAnswerUtils: `kmaedu-fe/src/lib/quizAnswerUtils.ts`