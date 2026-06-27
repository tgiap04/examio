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
| 0 | [Shared: Fix schema + AES-CBC decrypt](phase-00-schema-and-crypto.md) | pending |
| 1A | [Android + iOS: Exam-taking screen](phase-01a-exam-taking-ui.md) | pending |
| 1B | [Android + iOS: CRUD quiz questions](phase-01b-crud-quiz-questions.md) | pending |
| 1C | [Android + iOS: CRUD flashcard cards](phase-01c-crud-flashcard-cards.md) | pending |
| 2A | [Android + iOS: Post-submit review screen](phase-02a-post-submit-review.md) | pending |
| 2B | [Android + iOS: Flashcard study modes](phase-02b-flashcard-study-modes.md) | pending |

## Dependencies

```
Phase 0 ──────► Phase 1A ──────► Phase 2A
                Phase 1B    (parallel)
                Phase 1C
Phase 0 ──────► Phase 2B
```

Phase 1A, 1B, 1C đều parallel-runnable sau khi Phase 0 complete.  
Phase 2A blocks on Phase 1A. Phase 2B blocks on Phase 0.

## Key decisions

- Shuffle chỉ options (không shuffle câu hỏi), seed = `question.index`
- Timer countdown từ `timeLimitMinutes + startedAt` server, ẩn nếu null
- AES key hardcode trong `MobileApiConfig` giống FE env
- Post-submit review nếu `showAnswers=true` từ server
- ExamRepository đã có trong `AndroidAppContainer` — cần wire vào `ExamioApp`

## Files sẽ tạo mới

### shared/
- `features/exams/crypto/QuizCryptoService.kt` — expect declaration
- `shared/src/androidMain/.../crypto/QuizCryptoService.android.kt` — AES impl Android
- `shared/src/iosMain/.../crypto/QuizCryptoService.ios.kt` — AES impl iOS

### androidApp/
- `features/exams/ExamTakingScreen.kt`
- `features/exams/ExamTakingViewModel.kt`
- `features/exams/ExamResultScreen.kt`
- `features/exams/QuizSetManageScreen.kt`
- `features/exams/QuizSetManageViewModel.kt`
- `features/study/FlashcardManageScreen.kt`
- `features/study/FlashcardManageViewModel.kt`

### iosApp/
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
