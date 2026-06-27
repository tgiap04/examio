# Phase 02A — Android + iOS: Post-submit Review Screen

**Priority:** Medium  
**Status:** pending  
**Blocks on:** Phase 01A

## Overview

Màn hình kết quả sau khi nộp bài: hiển thị điểm, tỉ lệ đúng, và (nếu `showAnswers=true`) review từng câu với đáp án đúng/sai.

## User Flow

```
ExamTakingScreen
  └─ submit() → nhận SubmitResult từ server
       └─ ExamResultScreen
            ├─ Score card: điểm / tổng, passed/failed chip
            ├─ Stats row: % đúng, số câu đúng/sai, thời gian
            ├─ [nếu showAnswers=true] LazyColumn review câu hỏi
            │    └─ ReviewQuestionItem: câu hỏi + options (correct=green, wrong=red)
            └─ Buttons: "Làm lại" / "Về trang chủ"
```

## Data Shape

Server trả khi submit (từ `SecureSubmitResponse` đã có trong FE):
```kotlin
data class SecureSubmitResponse(
    val message: String,
    val score: Double,
    val totalQuestions: Int,
    val correctAnswers: Int,
    val percentage: Double,
    val showAnswers: Boolean,
    val passed: Boolean,
    val passingScore: Double,
    val questions: List<ReviewQuestion>? = null, // chỉ có khi showAnswers=true
)

data class ReviewQuestion(
    val id: String,
    val question: String,
    val options: List<String>,
    val answer: String,       // đáp án đúng
    val userAnswer: String?,  // đáp án user chọn
)
```

Cần thêm `SecureSubmitResponse` + `ReviewQuestion` vào `ExamAttemptModels.kt`.

## Android Implementation

### `ExamResultScreen.kt`

**Score card** (`ExamioCard`, coral tint nếu passed):
- Điểm lớn: `headlineLarge + FontWeight.Bold`
- Chip "Đạt" (primary) / "Chưa đạt" (error)
- Sub-text: điểm qua môn

**Stats row** (3 `IconStatCard`):
- `CheckCircle`: X/N câu đúng
- `Percent`: % đúng
- `Schedule`: thời gian làm bài

**Review section** (chỉ hiện khi `showAnswers=true`):
- Section header "Xem đáp án"
- `LazyColumn` của `ReviewQuestionItem`

**`ReviewQuestionItem`** composable:
- Câu hỏi text
- 4 options với màu:
  - Đáp án đúng: `primary.copy(0.12f)` background + `CheckCircle` icon
  - User chọn sai: `error.copy(0.10f)` background + `Cancel` icon
  - Còn lại: `surfaceVariant` background

**Bottom buttons:**
- `OutlinedButton` "Về trang chủ" → pop về tab BaiThi
- `Button` "Làm lại" → trigger start mới với cùng sessionId (chỉ hiện nếu allowRetake)

### Constraints

- `ExamResultScreen.kt` < 200 lines → tách `ReviewQuestionItem.kt`
- Không có network call mới — data đến từ `SubmitResult` pass qua navigation

## iOS Implementation

### `ExamResultView.swift`

Tương đương Android:
- `VStack` với score card (`.background(Color.examioCanvas)`, `.overlay` border)
- `HStack` stats (3 stat items)
- `List` review questions (nếu showAnswers)
- `ReviewQuestionRow`: options với màu theo đúng/sai

## Related Files

### Sửa (shared)
- `shared/.../exams/models/ExamAttemptModels.kt` — thêm `SecureSubmitResponse`, `ReviewQuestion`
- `shared/.../exams/api/ExamAttemptApiService.kt` — update `submit()` return type → `SecureSubmitResponse`
- `shared/.../exams/repository/ExamRepository.kt` — update `submit()` return type

### Tạo mới (Android)
- `androidApp/.../features/exams/ExamResultScreen.kt`
- `androidApp/.../features/exams/components/ReviewQuestionItem.kt`

### Tạo mới (iOS)
- `iosApp/ExamioApp/Features/Exams/ExamResultView.swift`

### Sửa (Android)
- `androidApp/.../features/exams/ExamTakingViewModel.kt` — sau submit → set `submitResult`, screen navigate sang ExamResultScreen
- `androidApp/ExamioApp.kt` — handle ExamNavState: `ShowResult(result)` → render ExamResultScreen

### Sửa (iOS)
- `iosApp/.../Features/Exams/ExamTakingViewModel.swift` — sau submit navigate sang ExamResultView

## Todo

- [ ] Thêm `SecureSubmitResponse` + `ReviewQuestion` vào `ExamAttemptModels.kt`
- [ ] Update `submit()` return type trong ApiService + Repository
- [ ] Tạo `ExamResultScreen` + `ReviewQuestionItem` (Android)
- [ ] Wire ExamNavState `ShowResult` vào ExamioApp (Android)
- [ ] Tạo `ExamResultView.swift` (iOS)
- [ ] Wire navigation sau submit (iOS)
- [ ] Build verify

## Success Criteria

- Submit bài → chuyển sang màn kết quả với điểm thật từ server
- Khi `showAnswers=true`: hiện list câu hỏi, đáp án đúng xanh, sai đỏ
- "Về trang chủ" quay về tab BaiThi bình thường
