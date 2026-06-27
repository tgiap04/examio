# Phase 02B — Android + iOS: Flashcard Study Modes

**Priority:** Medium  
**Status:** pending  
**Blocks on:** Phase 00

## Overview

Bổ sung mode học cho flashcard native đã có: shuffle thứ tự, học chỉ các thẻ chưa thuộc, track "đã thuộc" per-session.

## Current State

`StudyScreen.kt` + `FlashcardSetDetailViewModel` đã có:
- Flip card (question/answer)
- Navigate Trước/Tiếp
- `FlashcardStudyState(setId, currentIndex, isAnswerVisible, masteredCardIds)`

Thiếu:
- Shuffle thứ tự cards
- Filter "chỉ chưa thuộc"
- Mark "đã thuộc" và skip
- Progress summary khi xong

## User Flow

```
StudyScreen → FlashcardSetDetailScreen
  └─ Mode selector (chip row):
       ├─ "Tuần tự" — thứ tự gốc (hiện tại)
       ├─ "Ngẫu nhiên" — shuffle seed mỗi session
       └─ "Ôn sai" — chỉ cards chưa mark "đã thuộc"
  └─ Trong card: button "Đã thuộc ✓" / "Chưa thuộc"
  └─ Khi hết cards → CompletionCard
       ├─ "X/N đã thuộc"
       ├─ Button "Học lại từ đầu"
       └─ Button "Chỉ ôn chưa thuộc" (nếu có unmastered)
```

## Architecture

### Thêm vào `FlashcardStudyState`

```kotlin
enum class StudyMode { Sequential, Shuffle, ReviewUnmastered }

data class FlashcardStudyState(
    val setId: String,
    val currentIndex: Int = 0,
    val isAnswerVisible: Boolean = false,
    val masteredCardIds: Set<String> = emptySet(),
    val mode: StudyMode = StudyMode.Sequential,
    val shuffledOrder: List<Int> = emptyList(), // indices vào cards list gốc
    val isComplete: Boolean = false,
)
```

### Logic trong ViewModel

```kotlin
fun setMode(mode: StudyMode) {
    // Sequential: dùng cards gốc
    // Shuffle: tạo shuffledOrder = cards.indices.shuffled() (seed ngẫu nhiên, giữ trong state)
    // ReviewUnmastered: filter cards không có id trong masteredCardIds
    _state.update { it.copy(mode = mode, currentIndex = 0, isAnswerVisible = false) }
}

fun markMastered(cardId: String) {
    _state.update { s ->
        val newMastered = s.masteredCardIds + cardId
        val activeCards = activeCards(s) // theo mode
        val nextIndex = s.currentIndex + 1
        s.copy(
            masteredCardIds = newMastered,
            currentIndex = nextIndex,
            isAnswerVisible = false,
            isComplete = nextIndex >= activeCards.size,
        )
    }
}

private fun activeCards(state: FlashcardStudyState): List<Flashcard> = when (state.mode) {
    StudyMode.Sequential -> cards
    StudyMode.Shuffle -> state.shuffledOrder.map { cards[it] }
    StudyMode.ReviewUnmastered -> cards.filter { it.id !in state.masteredCardIds }
}
```

## Android Implementation

### Thay đổi `StudyScreen.kt` / `FlashcardSetDetailScreen`

**Mode selector** (trên card, dưới title):
```kotlin
Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    StudyMode.entries.forEach { mode ->
        FilterChip(
            selected = currentMode == mode,
            onClick = { vm.setMode(mode) },
            label = { Text(mode.label) },
        )
    }
}
```

**"Đã thuộc" button** (dưới navigation buttons, chỉ hiện khi `isAnswerVisible`):
```kotlin
OutlinedButton(
    onClick = { vm.markMastered(currentCard.id) },
    colors = OutlinedButtonDefaults.outlinedButtonColors(contentColor = primary),
) {
    Icon(Icons.Outlined.CheckCircle, ..., modifier = Modifier.size(16.dp))
    Spacer(Modifier.width(6.dp))
    Text("Đã thuộc")
}
```

**`CompletionCard`** (khi `isComplete`):
```kotlin
ExamioCard {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Outlined.EmojiEvents, ..., tint = primary, modifier = Modifier.size(48.dp))
        Text("Hoàn thành!", style = headlineMedium, fontWeight = SemiBold)
        Text("${masteredCount}/${total} đã thuộc", style = bodyMedium, color = onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Button(onClick = { vm.restart() }) { Text("Học lại từ đầu") }
        if (unmasteredCount > 0) {
            OutlinedButton(onClick = { vm.setMode(ReviewUnmastered) }) {
                Text("Ôn ${unmasteredCount} chưa thuộc")
            }
        }
    }
}
```

### File constraints

`StudyScreen.kt` hiện tại ~200 lines — tách:
- `FlashcardModeSelector.kt` — chip row
- `FlashcardCompletionCard.kt` — completion UI

## iOS Implementation

### `StudyView.swift` / `FlashcardSetDetailView.swift`

- `Picker` hoặc `HStack` của `Button` styled như chip cho mode selector
- "Đã thuộc" button trong card view (chỉ show khi answer visible)
- Completion overlay với `VStack` centered

### `FlashcardSetDetailViewModel.swift`

Thêm `studyMode: StudyMode`, `masteredIds: Set<String>`, `isComplete: Bool`, `shuffledOrder: [Int]`.
Methods: `setMode(_:)`, `markMastered(cardId:)`, `restart()`.

## Related Files

### Sửa (shared)
- `shared/.../study/models/FlashcardStudyModels.kt` — thêm `StudyMode` enum, update `FlashcardStudyState`

### Sửa (Android)
- `androidApp/.../features/study/StudyScreen.kt` — thêm mode selector, mastered button, completion card
- `androidApp/.../features/study/FlashcardSetDetailViewModel.kt` — thêm mode logic

### Tạo mới (Android)
- `androidApp/.../features/study/components/FlashcardModeSelector.kt`
- `androidApp/.../features/study/components/FlashcardCompletionCard.kt`

### Sửa (iOS)
- `iosApp/ExamioApp/Views/StudyView.swift` — thêm mode selector + mastered button + completion
- `iosApp/ExamioApp/Features/Study/FlashcardSetDetailViewModel.swift` — thêm mode logic

## Todo

- [ ] Thêm `StudyMode` enum + update `FlashcardStudyState` (shared models)
- [ ] Update `FlashcardSetDetailViewModel` logic: `setMode`, `markMastered`, `activeCards`, `restart` (Android)
- [ ] Tạo `FlashcardModeSelector` + `FlashcardCompletionCard` components (Android)
- [ ] Integrate vào `StudyScreen` / `FlashcardSetDetailScreen` (Android)
- [ ] Update `FlashcardSetDetailViewModel.swift` (iOS)
- [ ] Integrate mode selector + completion vào `StudyView.swift` (iOS)
- [ ] Build verify

## Success Criteria

- Chọn "Ngẫu nhiên" → thứ tự cards xáo, giữ nguyên khi navigate back/forward trong session
- Chọn "Ôn sai" → chỉ hiện cards chưa mark thuộc
- Bấm "Đã thuộc" → card biến khỏi "Ôn sai" mode, counter tăng
- Khi hết cards → CompletionCard với stats đúng
