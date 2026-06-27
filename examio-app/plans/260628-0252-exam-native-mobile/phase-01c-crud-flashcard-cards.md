# Phase 01C — Android + iOS: CRUD Flashcard Cards

**Priority:** High  
**Status:** pending  
**Blocks on:** Phase 00

## Overview

Màn hình quản lý flashcard trong một set: list cards, thêm mới, sửa, xóa. `FlashcardRepository` đã có đầy đủ CRUD.

## User Flow

```
StudyScreen (tab)
  └─ FlashcardSetItem → [icon chỉnh sửa / context menu]
       └─ FlashcardManageScreen
            ├─ Header: tên set + flashcardCount chip
            ├─ LazyColumn danh sách cards (FlashcardItem — question + answer preview)
            ├─ FAB "Thêm thẻ" → FlashcardEditSheet (bottom sheet)
            ├─ Swipe/long-press → Edit hoặc Delete với confirm dialog
            └─ Pull-to-refresh
```

## Architecture

**`FlashcardManageViewModel`:**
```kotlin
data class FlashcardManageState(
    val isLoading: Boolean = false,
    val setTitle: String = "",
    val cards: List<Flashcard> = emptyList(),
    val totalCount: Int = 0,
    val error: String? = null,
    val editingCard: Flashcard? = null,
    val showEditSheet: Boolean = false,
    val deletingId: String? = null,
    val isSaving: Boolean = false,
)
```

Actions: `load(setId)`, `showAdd()`, `showEdit(card)`, `save(req)`, `delete(cardId)`, `dismissSheet()`

Pagination: load page 1 on init, load more khi scroll gần đáy (`LazyColumn` `onScrolledToBottom`).

## Android Implementation

### `FlashcardManageScreen.kt`

- `LazyColumn` với `FlashcardItem` composable
- `FlashcardItem`: `ExamioCard` — question text (1 line ellipsis) + answer preview (1 line ellipsis, `onSurfaceVariant`)
- FAB Button "Thêm thẻ" anchored `BottomEnd`
- Swipe-to-reveal (trailing actions) hoặc `DropdownMenu` long-press: "Sửa" / "Xóa"
- Delete confirm: `AlertDialog`
- `PullRefreshIndicator` (Material3 `pullRefresh` modifier)

### `FlashcardEditSheet.kt` (ModalBottomSheet)

Fields:
- `OutlinedTextField` multiline — câu hỏi (front)
- `OutlinedTextField` multiline — đáp án (back)
- Button "Lưu" / "Hủy"

Validation: cả question và answer không được trống.

### Thêm entry point vào StudyScreen

`StudyScreen` hiện tại có `FlashcardSetItem` với bookmark icon. Thêm thêm `DropdownMenu` hoặc trailing icon "quản lý" → navigate tới `FlashcardManageScreen`.

Pattern navigation: tương tự Phase 1A/1B — thêm `managingSetId: String?` state vào StudyScreen hoặc dùng shared navigation state.

## iOS Implementation

### `FlashcardManageView.swift`

- `List` với `.swipeActions`: Edit / Delete
- `.sheet` cho `FlashcardEditView`
- `refreshable` modifier cho pull-to-refresh

### `FlashcardEditView.swift` (Sheet)

- `TextEditor` cho question + answer (multiline)
- Toolbar "Lưu" / "Hủy"

## Related Files

### Tạo mới (Android)
- `androidApp/.../features/study/FlashcardManageScreen.kt`
- `androidApp/.../features/study/FlashcardManageViewModel.kt`
- `androidApp/.../features/study/components/FlashcardEditSheet.kt`

### Tạo mới (iOS)
- `iosApp/ExamioApp/Features/Study/FlashcardManageView.swift`
- `iosApp/ExamioApp/Features/Study/FlashcardManageViewModel.swift`
- `iosApp/ExamioApp/Features/Study/FlashcardEditView.swift`

### Sửa (Android)
- `androidApp/.../features/study/StudyScreen.kt` — thêm manage entry point trên FlashcardSetItem

### Sửa (iOS)
- `iosApp/ExamioApp/Views/StudyView.swift` — thêm manage entry point

## Todo

- [ ] Tạo `FlashcardManageViewModel` (Android)
- [ ] Tạo `FlashcardManageScreen` + `FlashcardEditSheet` (Android)
- [ ] Thêm manage entry point vào StudyScreen (Android)
- [ ] Tạo `FlashcardManageViewModel.swift` (iOS)
- [ ] Tạo `FlashcardManageView` + `FlashcardEditView` (iOS)
- [ ] Thêm manage entry point vào StudyView (iOS)
- [ ] Build verify

## Success Criteria

- Từ StudyScreen vào manage screen → list cards từ API
- Thêm / sửa / xóa card → list cập nhật ngay
- Validation chặn save khi question hoặc answer trống
- Pagination load more khi scroll
