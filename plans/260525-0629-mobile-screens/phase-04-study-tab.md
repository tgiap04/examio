---
title: "Phase 4: Study Tab"
description: "MyMaterials list and FlashcardStudy screen for the Study tab"
status: pending
priority: P2
effort: 14h
---

# Phase 4: Study Tab

## Context

- [MyMaterialsPage](../../examio-fe/src/pages/k/MyMaterialsPage.tsx)
- [FlashcardStudyPage](../../examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx)
- [Flashcard set API](../../examio-fe/src/apis/flashcardSetApi.ts)
- [Student materials API](../../examio-fe/src/apis/studentMaterialsApi.ts)
- [Flashcard study API](../../examio-fe/src/apis/flashcardStudyApi.ts)
- Depends on: Phase 1 (shared), Phase 2 (auth)

## Overview

Study tab shows the student's flashcard sets (recently viewed, pinned). Tapping a set opens the flashcard study screen with flip-card interaction.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /student/recent-flashcards` | Paginated list of student's flashcard sets |
| `POST /student/pin-flashcard/:id` | Toggle pin |
| `POST /flashcardsets/:id/share` | Generate share link |
| `GET /flashcardsets/study/:id/access` | Check access before study |
| `GET /flashcardsets/study/:id` | Get flashcard set for study |
| `GET /flashcardsets/:id/flashcards` | Paginated flashcards |
| `GET /flashcardsets/:id/labels` | Labels for filtering |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Study/`)

| File | Purpose |
|------|---------|
| `StudyTabView.swift` | Tab root with navigation stack |
| `MyMaterialsView.swift` | Paginated flashcard set list |
| `MyMaterialsViewModel.swift` | List state, pagination, pin/share |
| `FlashcardSetRow.swift` | List row (thumbnail, title, count, pin icon) |
| `FlashcardStudyView.swift` | Flip-card study screen |
| `FlashcardStudyViewModel.swift` | Card navigation, flip state |
| `FlashcardCardView.swift` | Single flip card (question/answer) |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/study/`)

| File | Purpose |
|------|---------|
| `StudyNavGraph.kt` | Navigation graph for study tab |
| `MyMaterialsScreen.kt` | Paginated flashcard set list |
| `MyMaterialsViewModel.kt` | List state, pagination, pin/share |
| `FlashcardSetItem.kt` | List item composable |
| `FlashcardStudyScreen.kt` | Flip-card study screen |
| `FlashcardStudyViewModel.kt` | Card navigation, flip state |
| `FlashcardCard.kt` | Single flip card composable |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/Views/StudyView.swift` | Replace with StudyTabView |
| `androidApp/.../features/study/StudyScreen.kt` | Replace with StudyNavGraph entry |

## Implementation Steps

1. Create `MyMaterialsViewModel` with paginated loading from `StudentMaterialsRepository`
2. Build list UI with pull-to-refresh, infinite scroll pagination
3. Each row shows: thumbnail, title, card count, pin status, last viewed date
4. Pin toggle calls API and updates local state optimistically
5. Share action generates link and opens system share sheet
6. Tapping a set checks access -> navigates to `FlashcardStudyView/Screen`
7. `FlashcardStudyViewModel` loads flashcards (paginated), manages current index
8. Flip card: tap to flip between question/answer; swipe left/right to navigate
9. Progress indicator shows current card / total
10. Label filter: optional filter by label at top of study screen

## Data Flow

```
MyMaterialsView -> MyMaterialsViewModel.loadPage(n)
  -> StudentMaterialsRepository.getRecentFlashcards(page, limit)
  <- PaginatedResponse<RecentFlashcardSet>
  -> UI renders list

FlashcardStudyView -> FlashcardStudyViewModel.loadSet(id)
  -> FlashcardRepository.getFlashcardSetForStudy(id)
  -> FlashcardRepository.getFlashcards(id, page, limit, labelId?)
  <- Flashcard[] -> render flip cards
```

## Success Criteria

- [ ] Paginated list loads and scrolls infinitely
- [ ] Pin toggle works with optimistic UI update
- [ ] Share generates link and opens share sheet
- [ ] Flashcard study shows question, flips to answer on tap
- [ ] Swipe navigates between cards
- [ ] Progress bar shows position
- [ ] Label filter narrows displayed cards
- [ ] Access-code-protected sets prompt for code before study

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Flip animation performance | Use native animation APIs (withAnimation / AnimatedContent) |
| Large flashcard sets (1000+ cards) | Paginate; load 20 at a time, prefetch next page |

## Rollback

Revert StudyView/StudyScreen to placeholder. Study-specific files are additive.
