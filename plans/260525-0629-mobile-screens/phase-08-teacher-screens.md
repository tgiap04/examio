---
title: "Phase 8: Teacher Screens"
description: "FlashcardSet management, QuizSet management, and ExamRoom management (role-gated)"
status: pending
priority: P3
effort: 14h
---

# Phase 8: Teacher Screens

## Context

- [FlashcardsPage](../../examio-fe/src/pages/k/FlashcardsPage.tsx)
- [ManageExamPage](../../examio-fe/src/pages/k/ManageExamPage.tsx)
- [ManageExamRoomPage](../../examio-fe/src/pages/k/ManageExamRoomPage.tsx)
- [ManageExamRoomDetailPage](../../examio-fe/src/pages/k/ManageExamRoomDetailPage.tsx)
- [Flashcard set API](../../examio-fe/src/apis/flashcardSetApi.ts)
- [Quiz set API](../../examio-fe/src/apis/quizsetApi.ts)
- [Exam room API](../../examio-fe/src/apis/examRoomApi.ts)
- Depends on: Phase 1 (shared), Phase 2 (auth)

## Overview

Teacher-only screens for managing content: flashcard sets (CRUD, add/edit/delete cards, labels), quiz sets (CRUD, add/edit/delete questions, labels), and exam rooms (CRUD, create sessions, view attempts). These screens are only accessible when `UserRole == Teacher`.

## API Endpoints Used

### Flashcard Management
| Endpoint | Purpose |
|----------|---------|
| `GET /flashcardsets/?page&limit&search` | List teacher's flashcard sets |
| `POST /flashcardsets` | Create flashcard set |
| `PUT /flashcardsets/:id` | Update flashcard set |
| `DELETE /flashcardsets/:id` | Delete flashcard set |
| `GET /flashcardsets/:id/flashcards` | Get cards (paginated) |
| `POST /flashcardsets/:id/flashcards` | Add card |
| `PUT /flashcardsets/:id/flashcards/:cardId` | Update card |
| `DELETE /flashcardsets/:id/flashcards/:cardId` | Delete card |
| `GET /flashcardsets/:id/labels` | Get labels |
| `POST /flashcardsets/:id/labels` | Create label |

### Quiz Set Management
| Endpoint | Purpose |
|----------|---------|
| `GET /quizsets?page&limit&search` | List teacher's quiz sets |
| `POST /quizsets` | Create quiz set |
| `PUT /quizsets/:id` | Update quiz set |
| `DELETE /quizsets/:id` | Delete quiz set |
| `GET /quizsets/:id/questions` | Get questions (paginated) |
| `POST /quizsets/:id/questions` | Add question |
| `PUT /quizsets/:id/questions/:qId` | Update question |
| `DELETE /quizsets/:id/questions/:qId` | Delete question |
| `GET /quizsets/:id/labels` | Get labels |
| `POST /quizsets/:id/labels` | Create label |

### Exam Room Management
| Endpoint | Purpose |
|----------|---------|
| `GET /examrooms/list?page&limit&search` | List exam rooms |
| `POST /examrooms` | Create exam room |
| `PUT /examrooms/:id` | Update exam room |
| `DELETE /examrooms/:id` | Delete exam room |
| `GET /examrooms/:id/sessions` | List sessions |
| `POST /examsessions` | Create session |
| `PUT /examsessions/:id` | Update session |
| `DELETE /examsessions/:id` | Delete session |
| `GET /examattempts/list-by-room/:id` | View attempts |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/Teacher/`)

| File | Purpose |
|------|---------|
| `TeacherFlashcardsView.swift` | Flashcard set list + CRUD |
| `TeacherFlashcardsViewModel.swift` | List state, CRUD actions |
| `FlashcardSetDetailView.swift` | Set detail: cards list + add/edit |
| `FlashcardSetDetailViewModel.swift` | Cards CRUD, labels |
| `FlashcardEditSheet.swift` | Add/edit card form |
| `TeacherQuizSetsView.swift` | Quiz set list + CRUD |
| `TeacherQuizSetsViewModel.swift` | List state, CRUD actions |
| `QuizSetDetailView.swift` | Set detail: questions list + add/edit |
| `QuizSetDetailViewModel.swift` | Questions CRUD, labels |
| `QuestionEditSheet.swift` | Add/edit question form |
| `ExamRoomsView.swift` | Exam room list + CRUD |
| `ExamRoomsViewModel.swift` | List state, CRUD |
| `ExamRoomDetailView.swift` | Room detail: sessions + attempts |
| `ExamRoomDetailViewModel.swift` | Sessions CRUD, attempts list |
| `ExamSessionEditSheet.swift` | Create/edit session form |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/teacher/`)

| File | Purpose |
|------|---------|
| `TeacherNavGraph.kt` | Navigation graph for teacher screens |
| `TeacherFlashcardsScreen.kt` | Flashcard set list + CRUD |
| `TeacherFlashcardsViewModel.kt` | List state, CRUD |
| `FlashcardSetDetailScreen.kt` | Cards list + add/edit |
| `FlashcardSetDetailViewModel.kt` | Cards CRUD, labels |
| `FlashcardEditDialog.kt` | Add/edit card dialog |
| `TeacherQuizSetsScreen.kt` | Quiz set list + CRUD |
| `TeacherQuizSetsViewModel.kt` | List state, CRUD |
| `QuizSetDetailScreen.kt` | Questions list + add/edit |
| `QuizSetDetailViewModel.kt` | Questions CRUD, labels |
| `QuestionEditDialog.kt` | Add/edit question dialog |
| `ExamRoomsScreen.kt` | Exam room list + CRUD |
| `ExamRoomsViewModel.kt` | List state, CRUD |
| `ExamRoomDetailScreen.kt` | Sessions + attempts |
| `ExamRoomDetailViewModel.kt` | Sessions CRUD, attempts |
| `ExamSessionEditDialog.kt` | Create/edit session dialog |

## Implementation Steps

### Flashcard Set Management
1. List with search, pagination, stats (total groups, cards, views)
2. Create: title + description + public toggle + thumbnail upload
3. Edit: same fields, inline or sheet
4. Delete: confirm dialog
5. Detail view: paginated cards list, filter by label
6. Add/edit card: question + answer fields
7. Delete card: swipe-to-delete or long-press menu
8. Label management: create, assign cards to labels

### Quiz Set Management
9. List with search, pagination, stats (total exams, questions)
10. Create/edit/delete quiz set (same pattern as flashcard sets)
11. Detail view: paginated questions, filter by label
12. Add/edit question: question text + 4 options + correct answer + label
13. Delete question

### Exam Room Management
14. List with search, pagination
15. Create room: title + description + select quiz set
16. Room detail: list sessions, create new session
17. Session config: start/end time, time limit, retake settings, question selection mode
18. View attempts per session: student list with scores

## Role Gating

```
// In navigation, check user role before showing teacher screens
if (userSession.roles.contains(UserRole.Teacher)) {
    // Show teacher menu item / navigation entry
}
```

Teacher screens accessible via:
- Account tab -> "Manage Content" section (if teacher)
- Or dedicated navigation entry visible only to teachers

## Success Criteria

- [ ] Only visible to users with Teacher role
- [ ] Flashcard set CRUD works (create, edit, delete)
- [ ] Cards within a set: add, edit, delete, label
- [ ] Quiz set CRUD works
- [ ] Questions within a set: add, edit, delete with options
- [ ] Exam room CRUD works
- [ ] Session creation with all config options
- [ ] Attempts list shows student scores
- [ ] Search and pagination work on all lists
- [ ] Thumbnail upload works for sets

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Complex forms (session config) on mobile | Use step-by-step wizard or collapsible sections |
| Many CRUD screens = repetitive code | Extract reusable list/form patterns |
| Delete cascading (room -> sessions -> attempts) | Confirm dialog with clear warning |

## Rollback

Teacher screens are entirely additive. Remove navigation entries to hide them.
