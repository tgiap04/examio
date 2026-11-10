# SCR031: ExamSessionPage — Screen Spec

**Screen**: SCR031: ExamSessionPage
**Type**: atomic
**Route**: `/exam-session/:id`
**Generated**: 2026-06-06

## Purpose

A student enters an exam session lobby, sees session metadata (title, duration, questions, passing score, attempt count), checks their past and in-progress attempts, and proceeds to the quiz or resumes an existing attempt. The page is accessed via a direct URL or from SCR029 (MyExamsPage).

## Screen Layout

The page uses a 3-column grid on desktop (`lg:grid-cols-3`) with a `max-w-7xl` container. The left column spans 2/3 and holds exam info, instructions, and system-check sections; the right column holds the countdown timer, progress, and attempt history. On mobile the grid collapses to a single column. Access code gate renders as a full-screen dialog overlay with `showCloseButton=false`, blocking all other content. The session not found and access denied states render centered error cards (full-width centered `Card`, `max-w-md`).

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ (conditional) AccessCodeDialog — fullscreen overlay │
│ (conditional) sessionNotFound Card                 │
│ (conditional) access denied Card                   │
│ (conditional) loading skeleton grid                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ R1: Main Grid Container (max-w-7xl, centered)      │
│  ┌──────────────────────────┐  ┌─────────────────┐ │
│  │ R2: Left Column (2/3)     │  │ R3: Right (1/3) │ │
│  │  ExamHeaderSection       │  │  CountdownTimer │ │
│  │  ExamInstructionsSection │  │  ExamProgress   │ │
│  │  SystemCheckSection      │  │  AttemptHistory │ │
│  │  TermsAgreement + Button │  │                 │ │
│  └──────────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Grid Container | static | yes | `ExamRoomDetailTemplate` + conditional overlays | `lg:grid-cols-3`, collapses to single column |
| R2 | Left Column | static | yes | `ExamHeaderSection`, `ExamInstructionsSection`, `SystemCheckSection`, terms card, start button | `lg:col-span-2` |
| R3 | Right Sidebar | static | yes (scrollable attempt list) | `CountdownTimer`, `ExamProgressSection`, attempt history list | `lg:col-span-1`, sticky timer card |
| R4 | AccessCodeDialog | fixed overlay | no | `InputOTP`, verify/cancel buttons | centered, `sm:max-w-md` |
| R5 | Session Not Found Card | static (centered) | no | `XCircle` icon + back button | `max-w-md` centered |
| R6 | Access Denied Card | static (centered) | no | `Lock` icon + back button | `max-w-md` centered |
| R7 | Loading Skeleton | static | no | 3 skeletons left + 2 skeletons right | same grid as main layout |

## User Flow

### Happy Path

1. Student navigates to `/exam-session/{id}`.
2. `useEffect` at `ExamSessionPage.tsx:53` checks `isAuthenticated`; if not authenticated, redirects to `/login?from=...` with `setRedirectBackTarget`.
3. `checkExamSessionAccessApi(id)` is called to determine access level (`ExamSessionPage.tsx:68`).
4. If `hasAccess === true`: stats are loaded via `getExamSessionStatsApi` + attempt history via `getMyAttemptsBySessionApi`. `ExamRoomDetailTemplate` renders with `examInfo`, `progress`, `timeRemaining`, and attempt history.
5. Student reads instructions and system check, then checks the terms agreement checkbox.
6. Student clicks **Bắt đầu làm bài** (disabled until checkbox is checked, line `ExamRoomDetailTemplate.tsx:179`). `handleStartExam` validates that `startTime <= now` and `endTime > now`, then navigates to `/exam-session/{id}/quiz` (`ExamSessionPage.tsx:353`).
7. If session has an in-progress attempt, the right sidebar shows a **Tiếp tục làm bài** button per attempt (line `ExamRoomDetailTemplate.tsx:282`).
8. For completed attempts, **Xem chi tiết** navigates to `/exam-session/{id}/quiz?attemptId=...&view=result`.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| User not authenticated | `isAuthenticated === false` | Redirect to `/login?from=...` | `ExamSessionPage.tsx:59` |
| Session not found (404) | `error.response.status === 404` | "Không tìm thấy phiên thi" Card + "Về trang chủ" button | `ExamSessionPage.tsx:90` |
| Access type = `code_required` | `access.accessType === "code_required"` | AccessCodeDialog shown (InputOTP) | `ExamSessionPage.tsx:85` |
| Access type = `denied` | `access.accessType === "denied"` | "Phiên thi riêng tư" Card + back button | `ExamSessionPage.tsx:245` |
| Access code wrong | 6-digit code mismatch | Inline error "Mã truy cập không đúng" under OTP | `ExamSessionPage.tsx:126` |
| Session not started yet | `startTime > now` | Countdown timer shows time-to-start (upcoming status) | `ExamSessionPage.tsx:306` |
| Session ended | `endTime < now` | "Phiên thi đã kết thúc" toast + button disabled | `ExamSessionPage.tsx:348` |
| `stats === null` after access granted | no stats returned | Centered `Loader2` spinner | `ExamSessionPage.tsx:260` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `stats.title` | Exam title | `getExamSessionStatsApi` → `title` | raw string | n/a | MODEL-018.title |
| `stats.description` | Subtitle | `stats.description \|\| "Thi trực tuyến"` | raw string | "Thi trực tuyến" | MODEL-018.description |
| `stats.durationMinutes` | Duration | computed `formatDuration()` | minutes or "Không giới hạn" | "Không giới hạn" | MODEL-018.timeLimitMinutes |
| `stats.totalQuestions` | Total questions | `getExamSessionStatsApi` → `totalQuestions` | integer | n/a | MODEL-018.questionCount |
| `stats.passingScore` | Passing score | `getExamSessionStatsApi` → `passingScore` | number or "Không có" | "Không có" | MODEL-018.passingScore |
| `stats.maxAttempts` | Attempt limit | `getExamSessionStatsApi` → `maxAttempts` | `"Lần N"` or `"N/M"` | "Lần đầu" | MODEL-018.maxAttempts |
| `stats.startTime` | Exam start time | `getExamSessionStatsApi` → `startTime` | `toLocaleDateString('vi-VN')` | n/a | MODEL-018.startTime |
| `stats.endTime` | Exam end time | `getExamSessionStatsApi` → `endTime` | used for countdown | n/a | MODEL-018.endTime |
| `stats.status` | Session status | `getExamSessionStatsApi` → `status` | 0=UPCOMING, 1=ONGOING, 2=ENDED | n/a | DISC-001 |
| `stats.progress.answered` | Answered count | `getExamSessionStatsApi` → `progress.answered` | integer | n/a | MODEL-019.answers |
| `stats.progress.total` | Total questions | `getExamSessionStatsApi` → `progress.total` | integer | n/a | MODEL-019.totalQuestions |
| `timeRemaining` | Countdown | computed `calculateTimeRemaining()` | `{hours, minutes, seconds}` | null (no timer shown) | MODEL-018.endTime |
| `examStartTime` | Start time formatted | `new Date(stats.startTime).toLocaleDateString()` | Vietnamese date string | n/a | MODEL-018.startTime |
| `myAttempts[].status` | Attempt status | `getMyAttemptsBySessionApi` → `MyAttemptItem.status` | 0=Đang thi, 1=Hoàn thành | n/a | DISC-008 |
| `myAttempts[].percentage` | Score % | computed `correctAnswers/totalQuestions*100` | `XX%` | n/a | MODEL-019.correctAnswers |
| `myAttempts[].timeSpentSeconds` | Duration | `MyAttemptItem.timeSpentSeconds` | `formatDuration()` | null → hidden | MODEL-019.timeSpentSeconds |
| `myAttempts[].violationCount` | Violations | `MyAttemptItem.violationCount` | integer + "VP" label | 0 → hidden | MODEL-020.count |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `checkExamSessionAccessApi` in-flight | Skeleton grid (3 left + 2 right) | none | `ExamSessionPage.tsx:136` |
| session not found | `error.response.status === 404` | Centered error card with XCircle icon + back button | "Về trang chủ" | `ExamSessionPage.tsx:156` |
| access denied | `accessType === "denied"` | "Phiên thi riêng tư" card + back button | "Về trang chủ" | `ExamSessionPage.tsx:245` |
| access code gate | `accessType === "code_required"` | Full-screen InputOTP dialog, no close button | enter 6 digits + verify | `ExamSessionPage.tsx:175` |
| verifying code | `verifying === true` | Verify button shows Loader2 + "Đang xác thực..."; slots disabled | none | `ExamSessionPage.tsx:227` |
| code error | `codeError !== ""` | Red border on all slots + error message | re-enter code | `ExamSessionPage.tsx:126` |
| stats null | `stats === null` after access granted | Centered `Loader2` spinner | none | `ExamSessionPage.tsx:260` |
| attempt history loading | `myAttemptsLoading === true` | Skeleton attempt rows | none | `ExamRoomDetailTemplate.tsx:214` |
| attempt history empty | `myAttempts.length === 0` | "Chưa có lượt thi nào" empty state | none | `ExamRoomDetailTemplate.tsx:220` |
| start button disabled | `agreedToTerms === false` | Button disabled with reduced opacity | check terms checkbox | `ExamRoomDetailTemplate.tsx:179` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| access code | OTP | yes | exactly 6 characters, digits only | none | "Mã truy cập phải có 6 chữ số" |
| access code (submitted) | OTP | yes | must match server code | `verifyExamSessionAccessCodeApi` | "Mã truy cập không đúng" |

### B) Server-side

#### Check session access
- **Endpoint:** `GET /api/v1/examsessions/{id}/access-check`
- **Request:** `{id}` from URL param
- **Success:** `200` → `{ hasAccess, accessType }`
- **Errors:** `404` → session not found card; `403` → access denied card
- **Trigger:** `useEffect` on mount / `id` change
- **Source:** `ExamSessionPage.tsx:68`

#### Verify access code
- **Endpoint:** `POST /api/v1/examsessions/{id}/verify-code`
- **Request:** `{ code: accessCode }` (6-digit string)
- **Success:** `200` → dialog closes, stats loaded, template shown
- **Errors:** `400` → inline error "Mã truy cập không đúng"
- **Trigger:** Click "Xác nhận" button in AccessCodeDialog
- **Source:** `ExamSessionPage.tsx:119`

#### Get session stats
- **Endpoint:** `GET /api/v1/examsessions/{id}/stats`
- **Request:** `{id}` from URL param
- **Success:** `200` → `setStats(sessionStats)`; template renders
- **Errors:** `4xx/5xx` → toast "Không thể tải thông tin phiên thi"
- **Trigger:** after access check (line 72) or after code verification (line 120)
- **Source:** `ExamSessionPage.tsx:72`

#### Start exam attempt
- **Endpoint:** implicit via `startExamAttemptApi` call from quiz page
- **Request:** `{id}` from URL param
- **Success:** navigates to `/exam-session/{id}/quiz`
- **Errors:** `startTime > now` → info toast "Phiên thi chưa bắt đầu"; `endTime < now` → info toast "Phiên thi đã kết thúc"
- **Trigger:** Click "Bắt đầu làm bài" button
- **Source:** `ExamSessionPage.tsx:342`

#### Get attempts by session
- **Endpoint:** `GET /api/v1/examattempts/my?sessionId={id}&page=1&limit=10`
- **Request:** `{ sessionId, page, limit }`
- **Success:** `200` → `setMyAttempts(examAttempts)`; silently ignored on error
- **Errors:** silently caught; no user-visible error
- **Trigger:** after access check when `hasAccess === true`
- **Source:** `ExamSessionPage.tsx:78`

## Interaction Patterns

- **Clicking "Xác nhận" in AccessCodeDialog verifies the 6-digit OTP** — on success, dialog closes and session stats load; on failure, red border on all slots + error message, source: `ExamSessionPage.tsx:109`
- **Checking the terms checkbox enables the start button** — `agreedToTerms` state gates the `disabled` prop on the start button, source: `ExamRoomDetailTemplate.tsx:179`
- **Clicking "Bắt đầu làm bài" navigates to quiz page** — validates time bounds first, then `invalidateExams()` + `navigate(...)`, source: `ExamSessionPage.tsx:342`
- **Clicking "Tiếp tục làm bài" resumes an in-progress attempt** — navigates with `attemptId` param, source: `ExamRoomDetailTemplate.tsx:287`
- **Clicking "Xem chi tiết" on a completed attempt** — navigates with `attemptId` and `view=result` params, source: `ExamRoomDetailTemplate.tsx:299`
- **CountdownTimer updates every second** — computed from `endTime - now` when `status === ONGOING`; shows time-to-start when `status === UPCOMING`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | present | `role="dialog"` on AccessCodeDialog; `aria-label` on OTP slots; `aria-label` on back/verify buttons |
| Keyboard navigation | supported | Tab through OTP slots and buttons; OTP auto-advances focus |
| Focus management | managed | Dialog prevents outside interaction; `onPointerDownOutside` + `onEscapeKeyDown` blocked on OTP dialog |
| Screen reader compatibility | unknown | Dialog uses antd Dialog; OTP slots have `index` props |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading === true` | async | Skeleton grid | all other content | `ExamSessionPage.tsx:136` |
| `sessionNotFound === true` | data | Error card with XCircle | all other content | `ExamSessionPage.tsx:156` |
| `showCodeDialog === true` | data | AccessCodeDialog overlay | all other content | `ExamSessionPage.tsx:175` |
| `accessType === "denied"` | auth | Access denied card | all other content | `ExamSessionPage.tsx:245` |
| `stats === null` (post-access) | data | Loader2 spinner | template content | `ExamSessionPage.tsx:260` |
| `timeRemaining !== null` | data | CountdownTimer card | (no card rendered) | `ExamRoomDetailTemplate.tsx:191` |
| `agreedToTerms === false` | form | Start button disabled | enabled button | `ExamRoomDetailTemplate.tsx:179` |
| `myAttemptsLoading === true` | async | Skeleton rows in sidebar | attempt list | `ExamRoomDetailTemplate.tsx:214` |
| `myAttempts.length === 0` | data | Empty state "Chưa có lượt thi nào" | attempt list | `ExamRoomDetailTemplate.tsx:220` |
| `attempt.status === 0` | data | "Tiếp tục làm bài" button | "Xem chi tiết" button | `ExamRoomDetailTemplate.tsx:282` |

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| CountdownTimer | `timeRemaining` presence | present (ONGOING/UPCOMING) / absent (ENDED or no time limit) | `hours`, `minutes`, `seconds`, `label`, `description` | MODEL-018.endTime |
| AttemptItem | `attempt.status` | in-progress (Loader2 icon) / completed-passed (CheckCircle2) / completed-failed (XCircle) | percentage, duration, violation count, action button | DISC-008 |
| AccessCodeDialog | `verifying` state | idle / verifying (disabled + spinner) | 6 InputOTPSlot elements + error message | N/A |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `isAuthenticated` check at mount | auth | Redirect to `/login?from=...` with return URL preserved |
| `checkExamSessionAccessApi` — whitelist/code check | auth | Students without access see denied card or code gate; server enforces 403 |
| `accessType === "denied"` renders access denied UI | auth | Students not in whitelist see "Phiên thi riêng tư" card |
| `accessType === "code_required"` renders OTP dialog | auth | Students must provide correct 6-digit code to proceed |
| Terms agreement checkbox before start | policy | Student must acknowledge academic integrity before starting |
| `startTime > now` prevents early start | time | Students see info toast; attempt not created |
| `endTime < now` prevents late submission | time | Students see info toast; attempt not created |

## Source References

- Page/View: `kmaedu-fe/src/pages/exam-session/ExamSessionPage.tsx:35`
- Template: `kmaedu-fe/src/templates/ExamRoomDetailTemplate.tsx:67`
- ExamHeaderSection: `kmaedu-fe/src/components/organisms/k/ExamHeaderSection.tsx`
- ExamInstructionsSection: `kmaedu-fe/src/components/organisms/k/ExamInstructionsSection.tsx`
- SystemCheckSection: `kmaedu-fe/src/components/molecules/SystemCheckSection.tsx`
- CountdownTimer: `kmaedu-fe/src/components/atoms/k/CountdownTimer.tsx`
- ExamProgressSection: `kmaedu-fe/src/components/organisms/k/ExamProgressSection.tsx`
- API: `kmaedu-fe/src/apis/examSessionApi.ts`
- Auth store: `kmaedu-fe/src/stores/useAuthStore.ts`
- Student materials store: `kmaedu-fe/src/stores/useStudentMaterialsStore.ts`