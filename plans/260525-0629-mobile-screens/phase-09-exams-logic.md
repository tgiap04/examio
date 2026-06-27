---
title: "Phase 09: Exams/ExamRoom Repo + ViewModel Wiring (Track B)"
description: "ViewModels over ExamRepository: my-exams, quizset mgmt CRUD, exam-room list+detail, sessions CRUD, attempts list"
status: pending
priority: P1
effort: 10h
track: B
---

# Phase 09: Exams/ExamRoom Repo + ViewModel Wiring (Track B)

> BlockedBy Phase 01 only. Parallel-runnable with Phase 08. NO A↔B block.

## Context Links
- DTO sources: `../../examio-fe/src/apis/studentMaterialsApi.ts` (recent-exams), `quizsetApi.ts`, `examRoomApi.ts`, `examSessionApi.ts`
- Shared: `ExamRepository.kt`, `QuizSetApiService.kt`, `ExamRoomApiService.kt`, `ExamAttemptApiService.kt`

## Overview
Build ViewModels over the existing ExamRepository for my-exams, quiz-set management, and exam-room list+detail (sessions + attempts). Repository + api services exist — verify DTOs, add missing repo fns, build VMs.

## Requirements

### Endpoints
- my-exams: GET /student/recent-exams
- manage-exam (quizset mgmt): GET /quizsets (+ stats), quizset CRUD
- exam-room list: GET /examrooms/list-all, CRUD, GET /examattempts/list-by-room/{roomId}
- exam-room detail: GET /examrooms/detail/{id}, GET /examrooms/{roomId}/sessions, examsessions CRUD

### DTOs to verify (cite before coding)
- `examRoomApi`: **ExamRoom**, attempts: **ExamAttemptListItem**
- `examSessionApi`: **ExamSession**
- `quizsetApi`: **Quizz, QuizSetLabel** (reuse from Study)
- recent-exams: **RecentExamAttempt**

### Behavior
- Pagination on lists; quizset + room + session CRUD with validation; attempts list read-only; per-list loading/error/empty; refresh-on-mutation.

## Related Code Files

### Create
- Android: `androidApp/.../features/exams/MyExamsViewModel.kt`, `QuizSetManageViewModel.kt`, `ExamRoomListViewModel.kt`, `ExamRoomDetailViewModel.kt`
- iOS: matching `*ViewModel.swift`

### Modify
- `shared/.../features/exams/repository/ExamRepository.kt` (add exam-room list/detail, sessions CRUD, attempts-by-room, quizset CRUD if missing)
- DTO patches in ExamRoom/ExamSession/QuizSet ApiServices on drift

## Implementation Steps
1. Verify DTOs vs examRoomApi/examSessionApi/quizsetApi; patch on drift.
2. Add repo fns: examrooms list-all + detail, sessions list + CRUD, attempts list-by-room, quizset list+CRUD.
3. Build 4 VMs per platform.
4. Wire room→sessions→attempts as nested detail VM state.
5. Unit-test pagination + CRUD + nested detail load.

## Todo
- [ ] DTOs verified (ExamRoom, ExamSession, ExamAttemptListItem, Quizz, RecentExamAttempt)
- [ ] Repo fns added (rooms, sessions CRUD, attempts, quizset CRUD)
- [ ] 4 VMs Android
- [ ] 4 VMs iOS
- [ ] Pagination + CRUD + nested detail tested

## Success Criteria
- VMs load real my-exams, quizsets, exam-rooms + detail (sessions + attempts); CRUD persists via repo.

## Risks
| Risk | Mitigation |
|------|-----------|
| Nested room→session→attempt state complexity | Single ExamRoomDetailViewModel owns sub-lists; clear on room change |
| quizset mgmt overlaps Study quiz-set detail | Reuse shared repo fns; do not duplicate |
