---
status: pending
work_type: feature
---

# Plan: Native Exam-taking + CRUD Questions/Flashcards trên Mobile

**Mục tiêu:** Người dùng có thể thi, học, sửa câu hỏi và flashcard hoàn toàn native trong app, không cần mở browser.

**Consultation report:** `plans/reports/brainstorm-260628-0252-exam-native-mobile.md`

## Phases

| Phase | Tên | Status |
|---|---|---|
| 0 | [Shared: Fix schema + AES-CBC decrypt](phase-00-schema-and-crypto.md) | done |
| 1A | [Android + iOS: Exam-taking screen](phase-01a-exam-taking-ui.md) | Android done / iOS deferred |
| 1B | [Android + iOS: CRUD quiz questions](phase-01b-crud-quiz-questions.md) | Android done / iOS deferred |
| 1C | [Android + iOS: CRUD flashcard cards](phase-01c-crud-flashcard-cards.md) | Android done / iOS deferred |
| 2A | [Android + iOS: Post-submit review screen](phase-02a-post-submit-review.md) | Android done / iOS deferred |
| 2B | [Android + iOS: Flashcard study modes](phase-02b-flashcard-study-modes.md) | Android done / iOS deferred |

## Dependencies

```
Phase 0 ──────► Phase 1A ──────► Phase 2A
                Phase 1B    (parallel)
                Phase 1C
Phase 0 ──────► Phase 2B
```

Phase 1A, 1B, 1C đều parallel-runnable sau khi Phase 0 complete.  
Phase 2A blocks on Phase 1A. Phase 2B blocks on Phase 0.

## Key architectural finding

iOS uses an independent pure-Swift stack (`ExamioAPIClient` + Swift `Codable` + `ObservableObject` VMs), **NOT** the shared KMP module. This means:

- iOS phases require full Swift re-implementation, not thin SwiftUI wrappers over shared KMP logic.
- KMP `expect/actual` for crypto (`QuizCryptoService`) is unused on iOS — iOS instead has a standalone CoreCrypto `QuizCrypto.swift` built in Phase 00.
- State management, API calls, and navigation on iOS are independent Swift constructs, not ports of the Android ViewModel/NavState patterns.

**Consequence:** Phases 1A/1B/1C/2A/2B for iOS are complete Swift re-implementations, not shareable with Android. They were explicitly **DEFERRED** by user decision mid-session.

## Key decisions

- Shuffle chỉ options (không shuffle câu hỏi), seed = `question.index`
- Timer countdown từ `timeLimitMinutes + startedAt` server, ẩn nếu null
- AES key hardcode trong `MobileApiConfig` giống FE env
- Post-submit review nếu `showAnswers=true` từ server
- ExamRepository đã có trong `AndroidAppContainer` — cần wire vào `ExamioApp`

## Files sẽ tạo mới

### shared/
- `features/exams/crypto/QuizCryptoService.kt` — expect declaration (created)
- `shared/src/androidMain/.../crypto/QuizCryptoService.android.kt` — AES impl Android (created)
- `shared/src/iosMain/.../crypto/QuizCryptoService.ios.kt` — AES impl iOS (created)
- iOS also received standalone `QuizCrypto.swift` (CoreCrypto-based) — independent Swift stack

### androidApp/ (all created)
- `features/exams/ExamTakingScreen.kt`
- `features/exams/ExamTakingViewModel.kt`
- `features/exams/ExamResultScreen.kt`
- `features/exams/QuizSetManageScreen.kt`
- `features/exams/QuizSetManageViewModel.kt`
- `features/study/FlashcardManageScreen.kt`
- `features/study/FlashcardManageViewModel.kt`
- `features/exams/components/QuestionOptionRow.kt`
- `features/exams/components/ExamTimerChip.kt`
- `features/exams/components/QuestionGridDialog.kt`
- `features/exams/components/ReviewQuestionItem.kt`
- `features/study/components/FlashcardModeSelector.kt`
- `features/study/components/FlashcardCompletionCard.kt`

### iosApp/ (DEFERRED — not created)
- `Features/Exams/ExamTakingView.swift`
- `Features/Exams/ExamTakingViewModel.swift`
- `Features/Exams/ExamResultView.swift`
- `Features/Exams/QuizSetManageView.swift`
- `Features/Study/FlashcardManageView.swift`


## Files sẽ sửa

- `shared/.../exams/models/ExamAttemptModels.kt` — fix SecureQuestion schema
- `shared/.../exams/repository/ExamRepository.kt` — thêm crypto dependency
- `androidApp/core/config/MobileApiConfig.kt` — thêm QUIZ_AES_KEY constant
- `androidApp/backend/AndroidAppContainer.kt` — wire ExamRepository → ExamioApp
- `androidApp/ExamioApp.kt` — wire examRepository, thêm navigation to exam-taking
- `iosApp/.../AppConfig.swift` — thêm quizAesKey
