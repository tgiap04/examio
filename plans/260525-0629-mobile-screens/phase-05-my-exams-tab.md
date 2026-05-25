---
title: "Phase 5: My Exams Tab"
description: "MyExams list, ExamSession lobby, and ExamQuiz taking screens"
status: pending
priority: P2
effort: 16h
---

# Phase 5: My Exams Tab

## Context

- [MyExamsPage](../../examio-fe/src/pages/k/MyExamsPage.tsx)
- [ExamSessionPage](../../examio-fe/src/pages/exam-session/ExamSessionPage.tsx)
- [ExamQuizPage](../../examio-fe/src/pages/exam-session/ExamQuizPage.tsx)
- [Exam attempt API](../../examio-fe/src/apis/examAttemptApi.ts)
- [Exam session API](../../examio-fe/src/apis/examSessionApi.ts)
- [Student materials API](../../examio-fe/src/apis/studentMaterialsApi.ts)
- Depends on: Phase 1 (shared), Phase 2 (auth)

## Overview

My Exams tab shows the student's exam attempts (recent, pinned). Tapping an exam navigates to the session lobby (info, start/resume). Starting an exam opens the quiz-taking screen with secure questions, timer, and submission.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /student/recent-exams` | Paginated recent exam attempts |
| `POST /student/pin-exam-room/:id` | Toggle pin |
| `GET /examsessions/study/:id/access` | Check session access |
| `GET /examsessions/study/:id/info` | Public session info |
| `GET /examsessions/study/:id` | Full session for study |
| `GET /examsessions/study/:id/stats` | Session stats/progress |
| `POST /examattempts/start` | Start or resume attempt |
| `GET /examattempts/:id/secure-quiz` | Get encrypted questions |
| `PUT /examattempts/:id/progress` | Auto-save progress |
| `POST /examattempts/:id/secure-submit` | Submit with JWT answers |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Exams/`)

| File | Purpose |
|------|---------|
| `ExamsTabView.swift` | Tab root with navigation stack |
| `MyExamsView.swift` | Paginated exam attempts list |
| `MyExamsViewModel.swift` | List state, pagination, pin |
| `ExamAttemptRow.swift` | Row (title, score, status badge, date) |
| `ExamSessionView.swift` | Session lobby (info + start button) |
| `ExamSessionViewModel.swift` | Session info, access check, start attempt |
| `ExamQuizView.swift` | Quiz taking screen |
| `ExamQuizViewModel.swift` | Question navigation, answers, timer, submit |
| `QuestionView.swift` | Single question with options |
| `ExamResultView.swift` | Score result after submission |
| `QuizTimerView.swift` | Countdown timer component |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/exams/`)

| File | Purpose |
|------|---------|
| `ExamsNavGraph.kt` | Navigation graph for exams tab |
| `MyExamsScreen.kt` | Paginated exam attempts list |
| `MyExamsViewModel.kt` | List state, pagination, pin |
| `ExamAttemptItem.kt` | List item composable |
| `ExamSessionScreen.kt` | Session lobby |
| `ExamSessionViewModel.kt` | Session info, access check, start |
| `ExamQuizScreen.kt` | Quiz taking screen |
| `ExamQuizViewModel.kt` | Question nav, answers, timer, submit |
| `QuestionCard.kt` | Single question composable |
| `ExamResultScreen.kt` | Score result |
| `QuizTimer.kt` | Countdown timer composable |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/Views/MyExamsView.swift` | Replace with ExamsTabView |
| `androidApp/.../features/exams/MyExamsScreen.kt` | Replace with ExamsNavGraph entry |

## Implementation Steps

1. Create `MyExamsViewModel` with paginated loading from `StudentMaterialsRepository`
2. Build list: each row shows exam room title, score (if completed), status badge, date
3. Pin toggle with optimistic update
4. Tapping an attempt -> check access -> navigate to `ExamSessionView/Screen`
5. Session lobby shows: title, description, time limit, question count, attempts remaining
6. "Start Exam" button calls `POST /examattempts/start`
7. On start response, navigate to `ExamQuizView/Screen`
8. Quiz screen: fetch secure questions, decrypt on client
9. Display one question at a time with radio-button options
10. Navigation: prev/next buttons, question grid for jumping
11. Mark question feature (flag for review)
12. Auto-save progress every 30 seconds via `PUT /examattempts/:id/progress`
13. Timer countdown (if time-limited); auto-submit on expiry
14. Submit button -> confirm dialog -> `POST /examattempts/:id/secure-submit`
15. Result screen shows score, percentage, pass/fail, optionally correct answers

## Data Flow

```
ExamQuizView -> ExamQuizViewModel
  .startAttempt(sessionId) -> ExamAttemptRepository.start()
    <- { attemptId, isResume }
  .loadQuestions(attemptId) -> ExamAttemptRepository.getSecureQuiz()
    <- SecureQuizResponse { questions[], timer, answers }
  .selectAnswer(questionIndex, option) -> local state update
  .autoSave() -> ExamAttemptRepository.updateProgress() [every 30s]
  .submit() -> ExamAttemptRepository.secureSubmit(answers[])
    <- SecureSubmitResponse { score, passed, questions? }
  -> navigate to ExamResultView
```

## Secure Quiz Handling

- Questions arrive with JWT tokens and encrypted content
- Client decrypts using platform crypto (CryptoKit iOS / javax.crypto Android)
- On submit, each answer includes its question's JWT token for server verification
- Decryption key derived from attempt context (implementation detail from backend)

## Success Criteria

- [ ] Paginated exam list with status badges (in-progress, completed, cancelled)
- [ ] Pin toggle works
- [ ] Session lobby shows correct info and attempt count
- [ ] Access-code-protected sessions prompt for code
- [ ] Quiz displays questions one at a time with selectable options
- [ ] Question navigation (prev/next/jump) works
- [ ] Mark/flag questions for review
- [ ] Timer counts down and auto-submits
- [ ] Auto-save fires every 30s
- [ ] Submit shows confirmation then result
- [ ] Result screen shows score and pass/fail

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Secure quiz decryption complexity | Study backend encryption impl; may need shared decrypt logic |
| Timer drift on background/foreground | Use server startedAt + timeLimit; recalculate on foreground |
| Network loss during exam | Queue progress updates; retry on reconnect; warn user |

## Rollback

Revert MyExamsView/MyExamsScreen to placeholder. Exam-specific files are additive.
