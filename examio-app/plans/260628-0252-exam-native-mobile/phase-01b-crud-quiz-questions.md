# Phase 01B — Android + iOS: CRUD Quiz Questions

**Priority:** High  
**Status:** pending  
**Blocks on:** Phase 00

## Overview

Màn hình quản lý câu hỏi trong một quiz set: list câu hỏi, thêm mới, sửa, xóa. API đã sẵn qua `QuizSetApiService` + `ExamRepository`.

## User Flow

```
DeThiScreen (tab)
  └─ [Bộ đề] list → tap vào một quiz set
       └─ QuizSetManageScreen
            ├─ Header: tên set + questionCount chip
            ├─ LazyColumn danh sách câu hỏi (QuestionItem)
            ├─ FAB "Thêm câu" → QuestionEditSheet (bottom sheet)
            ├─ Swipe/long-press → Edit hoặc Delete với confirm dialog
            └─ Inline hiển thị correctAnswer sau khi save
```

## Architecture

### Data flow

`DeThiScreen` hiện mock data → cần wire `ExamRepository.quizSets()` để load real data.

**`QuizSetManageViewModel`:**
```kotlin
data class QuizSetManageState(
    val isLoading: Boolean = false,
    val setTitle: String = "",
    val questions: List<Question> = emptyList(),
    val error: String? = null,
    val editingQuestion: Question? = null, // null = adding new
    val showEditSheet: Boolean = false,
    val deletingId: String? = null,
)
```

Actions: `load(setId)`, `showAdd()`, `showEdit(question)`, `save(req)`, `delete(id)`, `dismissSheet()`

## Android Implementation

### `QuizSetManageScreen.kt`

- `LazyColumn` với `QuestionItem` composable
- `QuestionItem`: số thứ tự + text câu hỏi + số options + correctAnswer label chip
- FAB Button "Thêm câu" anchored `BottomEnd` (pattern giống `DeThiScreen`)
- Swipe-to-reveal hoặc `DropdownMenu` trên long-press: "Sửa" / "Xóa"
- Delete confirm: `AlertDialog`

### `QuestionEditSheet.kt` (ModalBottomSheet)

Fields:
- `OutlinedTextField` — nội dung câu hỏi
- 4x `OutlinedTextField` — options A / B / C / D
- `ExposedDropdownMenuBox` — chọn đáp án đúng (A/B/C/D)
- `OutlinedTextField` optional — giải thích
- Button "Lưu" / "Hủy"

Validation: câu hỏi + tối thiểu 2 options + đáp án đúng không được trống.

### Wire vào `DeThiScreen`

`DeThiScreen` hiện static. Thêm state: `selectedSetId: String?`. Khi != null → show `QuizSetManageScreen`. Load real quiz sets từ `ExamRepository.quizSets()`.

## iOS Implementation

### `QuizSetManageView.swift`

- `List` với swipe actions (`.swipeActions`): Edit / Delete
- `NavigationLink` hoặc `.sheet` cho `QuestionEditSheet`

### `QuestionEditView.swift` (Sheet)

Tương đương Android: form với TextField cho question, 4 options, Picker cho correct answer.

## Related Files

### Tạo mới (Android)
- `androidApp/.../features/exams/QuizSetManageScreen.kt`
- `androidApp/.../features/exams/QuizSetManageViewModel.kt`
- `androidApp/.../features/exams/components/QuestionEditSheet.kt`

### Tạo mới (iOS)
- `iosApp/ExamioApp/Features/Exams/QuizSetManageView.swift`
- `iosApp/ExamioApp/Features/Exams/QuizSetManageViewModel.swift`
- `iosApp/ExamioApp/Features/Exams/QuestionEditView.swift`

### Sửa (Android)
- `androidApp/.../features/exams/DeThiScreen.kt` — replace mock data với real API, thêm navigation vào QuizSetManageScreen
- `androidApp/ExamioApp.kt` — wire examRepository nếu chưa từ phase 1A
- `androidApp/backend/AndroidAppContainer.kt` — expose examRepository

### Sửa (iOS)
- `iosApp/ExamioApp/ContentView.swift` (DeThiView) — replace mock, wire navigation

## Todo

- [ ] Wire `ExamRepository.quizSets()` vào DeThiScreen (Android + iOS)
- [ ] Tạo `QuizSetManageViewModel` (Android)
- [ ] Tạo `QuizSetManageScreen` + `QuestionEditSheet` (Android)
- [ ] Tạo `QuizSetManageViewModel.swift` (iOS)
- [ ] Tạo `QuizSetManageView` + `QuestionEditView` (iOS)
- [ ] Wire navigation DeThiScreen → QuizSetManageScreen (cả 2 platform)
- [ ] Build verify

## Success Criteria

- DeThiScreen hiển thị real quiz sets từ API
- Tap vào set → vào màn quản lý câu hỏi
- Thêm / sửa / xóa câu hỏi → reflect ngay trong list
- Validation chặn save khi form chưa đủ
