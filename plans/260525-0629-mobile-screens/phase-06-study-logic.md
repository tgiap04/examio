---
title: "Phase 06: Study/Materials Repo + ViewModel Wiring (Track B)"
description: "ViewModels over FlashcardRepository + ExamRepository: materials, flashcard sets CRUD (thumbnail multipart), quiz-set & flashcard-set detail CRUD + labels"
status: pending
priority: P1
effort: 10h
track: B
---

# Phase 06: Study/Materials Repo + ViewModel Wiring (Track B)

> BlockedBy Phase 01 only. Parallel-runnable with Phase 05. NO A↔B block.

## Context Links
- DTO sources: `../../examio-fe/src/apis/studentMaterialsApi.ts`, `flashcardSetApi.ts`, `quizsetApi.ts`
- Shared: `FlashcardRepository.kt`, `ExamRepository.kt`, `StudentMaterialsApiService.kt`, `FlashcardApiService.kt`, `QuizSetApiService.kt`
- Multipart helper from Phase 01

## Overview
Build ViewModels over existing FlashcardRepository (flashcards/materials) and ExamRepository (quizset/questions). Includes thumbnail multipart for flashcard sets and quiz-set detail question CRUD + labels.

## Requirements

### Endpoints
- my-materials: GET /student/recent-flashcards, GET /student/recent-exams, pin toggles
- flash-card list: GET /flashcardsets (+ stats), CRUD flashcard set (thumbnail multipart)
- manage-quiz-set/:id: GET /quizsets/{id}, questions CRUD, labels
- manage-flashcard-set/:id: GET /flashcardsets/{id}, flashcards CRUD, labels

### DTOs to verify (cite before coding)
- `studentMaterialsApi`: **RecentFlashcardSet, RecentExamAttempt**
- `flashcardSetApi`: **FlashcardSet, Flashcard**
- `quizsetApi`: **Quizz, QuizSetLabel**

### Behavior
- Pagination on lists (cursor/skip-take per BE); pin toggle optimistic + rollback on error; CRUD with validation; thumbnail upload via MultipartUploadHelper; per-list loading/error/empty.

## Related Code Files

### Create
- Android: `androidApp/.../features/study/MyMaterialsViewModel.kt`, `FlashcardSetListViewModel.kt`, `QuizSetDetailViewModel.kt`, `FlashcardSetDetailViewModel.kt`
- iOS: matching `*ViewModel.swift` under `iosApp/ExamioApp/ViewModels/`

### Modify
- `shared/.../features/study/repository/FlashcardRepository.kt` (add thumbnail upload + detail/labels fns if missing)
- `shared/.../features/exams/repository/ExamRepository.kt` (questions CRUD + labels if missing)
- DTO patches in respective ApiServices if drift

## Implementation Steps
1. Verify DTOs vs the three FE api clients; patch shared DTOs on drift.
2. Add repo fns: flashcard-set thumbnail upload, set detail + flashcard CRUD + labels; quiz-set detail + question CRUD + labels.
3. Build 4 ViewModels per platform with paginated list state + CRUD actions.
4. Pin toggle: optimistic update + rollback.
5. Unit-test list pagination + CRUD state + pin rollback.

## Todo
- [ ] DTOs verified (RecentFlashcardSet, RecentExamAttempt, FlashcardSet, Flashcard, Quizz, QuizSetLabel)
- [ ] Repo fns: thumbnail multipart, set/flashcard CRUD, question CRUD, labels
- [ ] 4 VMs Android
- [ ] 4 VMs iOS
- [ ] Pagination + CRUD + pin-rollback tested

## Success Criteria
- VMs load real materials/sets; detail VMs load set + items; CRUD + thumbnail upload + labels work via repo.

## Risks
| Risk | Mitigation |
|------|-----------|
| Detail VM field drift (Quizz vs FlashcardSet shapes) | Verify both DTOs separately before coding |
| Pagination contract differs per list | Confirm cursor vs skip/take per endpoint |
