---
title: "Phase 05: Study/Materials UI (Track A)"
description: "Native-mobile UI: my-materials, flash-card list, + 2 MISSING detail screens (quiz-set/:id, flashcard-set/:id)"
status: pending
priority: P1
effort: 10h
track: A
---

# Phase 05: Study/Materials UI (Track A)

> Parallel-runnable with Phase 06 (Track B). NO A↔B block. Presentational only.

## Screen refs (/k)
- my-materials, flash-card (list), **manage-quiz-set/:id (MISSING)**, **manage-flashcard-set/:id (MISSING)**

## Goal
Native-mobile UI for the materials list/dashboard and flashcard-set list, PLUS build the two missing detail screens. Keep state-based nav: detail screens render via a `selectedSetId` state flag within the Study tab (back-handler resets). Use design content as placeholder props.

## Files to modify
- Android: `androidApp/.../features/study/StudyScreen.kt` (split: `MyMaterialsSection.kt`, `FlashcardSetListSection.kt`)
- iOS: `iosApp/KMAEduApp/Views/StudyView.swift` (split subviews)

## Files to create (MISSING detail screens)
- Android: `androidApp/.../features/study/QuizSetDetailScreen.kt`, `FlashcardSetDetailScreen.kt`
- iOS: `iosApp/KMAEduApp/Views/QuizSetDetailView.swift`, `FlashcardSetDetailView.swift`

## Out of scope
- API calls / ViewModels / CRUD logic (Phase 06/07). Word-family (deferred).

## Integration contract (props)
- my-materials: recent flashcards + recent exams lists, pin toggle callback
- flashcard list: sets (title, count, thumbnailUrl, stats), create/edit/delete callbacks
- quiz-set detail: set header + questions list + question CRUD callbacks + labels
- flashcard-set detail: set header + flashcards list + flashcard CRUD callbacks + labels

## Risk note (state-based nav)
Detail screens are new and have NO existing file. Implement as detail-state within the Study tab + system back handler. If state-flag hosting proves unworkable for nested detail, escalate to a minimal nav stack scoped to Study only (flagged in plan risk table).

## Todo
- [ ] Android: my-materials + flashcard list polished; 2 detail screens created
- [ ] iOS: same parity
- [ ] Detail screens reachable via state flag + back handler
- [ ] Files < 200 lines each
