# Phase 01A — Exam-taking Screen

**Priority:** High  
**Status:** Android done / iOS deferred  
**Blocks on:** Phase 00

## Overview

Implement màn hình làm bài thi native: chọn session → start attempt → làm từng câu (MCQ) với timer → submit → kết quả điểm.

## User Flow

```
MyExamsScreen
  └─ [Vào phòng thi] button trên ExamAttemptDetailScreen
       └─ ExamTakingScreen
            ├─ Load: startAttempt(sessionId) + secureQuiz(attemptId) + decrypt
            ├─ Hiển thị câu hỏi MCQ + options (A/B/C/D, shuffled)
            ├─ Timer countdown (nếu timeLimitMinutes != null)
            ├─ Navigation: Trước / Tiếp, jump to question
            ├─ Mark question để xem lại
            └─ Submit → ExamResultScreen
```

## Architecture

### ViewModel (shared logic trong androidApp + iosApp riêng)

**`ExamTakingViewModel`** manages:
```kotlin
data class ExamTakingState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val attemptId: String = "",
    val questions: List<DecryptedQuestion> = emptyList(),
    val currentIndex: Int = 0,
    val answers: Map<Int, String> = emptyMap(), // index -> "A"/"B"/"C"/"D"
    val markedIndices: Set<Int> = emptySet(),
    val totalQuestions: Int = 0,
    val timeLimitMinutes: Int? = null,
    val startedAt: String = "",
    val isSubmitting: Boolean = false,
    val submitResult: SubmitResult? = null,
)

data class SubmitResult(
    val score: Double,
    val totalQuestions: Int,
    val correctAnswers: Int,
    val percentage: Double,
    val passed: Boolean,
    val showAnswers: Boolean,
    val reviewQuestions: List<ReviewQuestion>? = null,
)
```

Actions: `loadQuiz(attemptId)`, `selectAnswer(index, option)`, `toggleMark(index)`, `navigate(index)`, `submit()`

### Timer logic
- Compute `remainingSeconds = timeLimitMinutes * 60 - elapsedSeconds`
- `elapsedSeconds` tính từ `startedAt` (ISO string từ server) + local tick mỗi giây
- Auto-submit khi `remainingSeconds <= 0`

## Android Implementation

### File: `ExamTakingScreen.kt`

Layout sections:
1. **TopBar:** tên phòng thi + timer chip (coral background nếu < 60s còn lại)
2. **Question progress bar:** LinearProgressIndicator + "Câu X / N"
3. **Question card:** `ExamioCard` — text câu hỏi `titleLarge`
4. **Options:** 4 `OutlinedButton` / `Button` — label "A. ...", "B. ...", selected = filled coral
5. **Bottom nav:** "← Trước" / "Tiếp →" OutlinedButton + filled Button
6. **Mark button:** `IconButton` với `BookmarkBorder`/`BookmarkAdded`
7. **Question grid dialog:** tap icon grid → hiện 5-column grid các số câu, màu theo trạng thái (chưa làm / đã làm / đánh dấu)

Constraints: < 200 lines → tách `QuestionOptionRow.kt`, `ExamTimerChip.kt`, `QuestionGridDialog.kt`

### File: `ExamTakingViewModel.kt`

- `init { loadQuiz(examSessionId) }` — gọi `examRepository.startAttempt()` rồi `secureQuiz()` rồi `decryptQuiz()`
- Timer: `viewModelScope.launch { while(active) { delay(1000); tick() } }`
- Auto-save progress: debounce 3s sau mỗi `selectAnswer` → call `PUT /examattempts/{id}/progress` (cần thêm endpoint vào `ExamAttemptApiService`)

### Wiring vào ExamioApp

`ExamioApp` hiện dùng tab-based navigation. Exam-taking là full-screen overlay (không có bottom bar).

Pattern: thêm `var examSessionId: String? by remember` — khi != null render `ExamTakingScreen` thay vì Scaffold. Hoặc dùng `NavHost` nếu codebase cần navigation stack.

**Đề xuất:** thêm lightweight `ExamNavState` sealed class — `Idle`, `TakingExam(sessionId, attemptId?)` — vào `ExamioApp` state. Khi TakingExam → hide Scaffold, show `ExamTakingScreen`.

## iOS Implementation

### File: `ExamTakingView.swift`

SwiftUI tương đương:
- `NavigationStack` với custom toolbar (timer + title)
- `ExamQuestionCard`: `RoundedRectangle` + Text câu hỏi
- `ExamOptionButton`: full-width, selected state với `Color.examinoCoral` background
- `HStack` bottom: Trước/Tiếp buttons
- `ExamTimerView`: countdown `Text` với `Timer.publish`
- `.sheet(isPresented:)` cho question grid

### File: `ExamTakingViewModel.swift` (ObservableObject)

Tương đương Android ViewModel, dùng `@Published` properties.

## Related Files

### Tạo mới (Android)
- `androidApp/.../features/exams/ExamTakingScreen.kt`
- `androidApp/.../features/exams/ExamTakingViewModel.kt`
- `androidApp/.../features/exams/components/QuestionOptionRow.kt`
- `androidApp/.../features/exams/components/ExamTimerChip.kt`
- `androidApp/.../features/exams/components/QuestionGridDialog.kt`

### Tạo mới (iOS)
- `iosApp/ExamioApp/Features/Exams/ExamTakingView.swift`
- `iosApp/ExamioApp/Features/Exams/ExamTakingViewModel.swift`

### Sửa (Android)
- `androidApp/ExamioApp.kt` — thêm `ExamNavState`, wire `examRepository`
- `androidApp/backend/AndroidAppContainer.kt` — expose `examRepository`
- `androidApp/.../features/exams/MyExamsScreen.kt` — thêm "Vào phòng thi" button → trigger ExamNavState

### Sửa (iOS)
- `iosApp/ExamioApp/ContentView.swift` — wire exam-taking navigation
- `iosApp/ExamioApp/Views/MyExamsView.swift` — thêm "Vào phòng thi" button

### Sửa (shared)
- `shared/.../exams/api/ExamAttemptApiService.kt` — thêm `updateProgress()`
- `shared/.../exams/repository/ExamRepository.kt` — thêm `updateProgress()`

## Todo

- [ ] Thêm `updateProgress()` vào ExamAttemptApiService + ExamRepository
- [ ] Tạo `ExamTakingViewModel` (Android)
- [ ] Tạo `ExamTakingScreen` + sub-components (Android)
- [ ] Wire ExamNavState vào ExamioApp + expose examRepository từ AppContainer
- [ ] Thêm "Vào phòng thi" button vào MyExamsScreen → ExamAttemptDetailScreen
- [ ] Tạo `ExamTakingViewModel.swift` (iOS)
- [ ] Tạo `ExamTakingView.swift` (iOS)
- [ ] Wire iOS navigation (ContentView / MyExamsView)
- [ ] Build verify cả 2 platform

## Success Criteria

- Bấm "Vào phòng thi" → app load câu hỏi native, không mở browser
- Timer hiển thị và countdown realtime
- Chọn đáp án → highlight, navigate Trước/Tiếp
- Submit → nhận điểm từ server
- File count: mỗi file < 200 lines (tách component nếu cần)
