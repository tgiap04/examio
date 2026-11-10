---
title: "Phase 12: AI Tool Repo + ViewModel (Job Polling, Track B)"
description: "AiToolViewModel over AIChatRepository/AIGenerator: generate-from-file multipart -> job polling, recent uploads, delete, regenerate"
status: pending
priority: P1
effort: 6h
track: B
---

# Phase 12: AI Tool Repo + ViewModel (Track B)

> BlockedBy Phase 01 only. Parallel-runnable with Phase 11. NO A↔B block.

## Context Links
- DTO source: `../../kmaedu-fe/src/apis/aiApi.ts`
- Shared: `AIChatRepository.kt`, `AIGeneratorApiService.kt`
- Multipart helper + `AiJobPoller` from Phase 01

## Overview
Build the AI tool ViewModel over the existing AIGenerator api + AIChatRepository. Core flow is ASYNC JOB POLLING, NOT SSE: POST /ai/generate-from-file (multipart) → {jobId} → poll GET /ai/job/{jobId} until DONE/FAILED.

## Requirements

### Endpoints
- POST /ai/generate-from-file (multipart) → {jobId}
- GET /ai/job/{jobId} (poll status + result)
- GET /ai/recent-uploads
- GET /ai/upload/{id}, DELETE /ai/upload/{id}
- POST /ai/regenerate/{id}

### DTOs to verify (cite before coding)
- `aiApi`: **job pattern** (jobId, status enum, result/questions payload), recent-upload item shape

### Behavior
- Multipart file upload via Phase 01 helper.
- Poll via `AiJobPoller` (backoff + max timeout); expose state PENDING→RUNNING→DONE(questions)/FAILED.
- Cancel polling on screen-leave (VM onCleared / deinit).
- recent-uploads list with delete + regenerate (regenerate re-enters polling).

## Related Code Files

### Create
- Android: `androidApp/.../features/ai/AiToolViewModel.kt`
- iOS: `iosApp/KMAEduApp/ViewModels/AiToolViewModel.swift`

### Modify
- `shared/.../features/ai/repository/AIChatRepository.kt` (add generate/job/recent/delete/regenerate fns if missing) OR add a focused `AIGeneratorRepository.kt` if AIChatRepository scope is chat-only
- DTO patch in `AIGeneratorApiService.kt` on drift

## Implementation Steps
1. Verify job DTO + recent-upload shapes vs aiApi.
2. Add repo fns: generateFromFile(file)→jobId, getJob(id), recentUploads, deleteUpload, regenerate.
3. AiToolViewModel: orchestrate upload → poll (AiJobPoller) → state; handle cancel.
4. recent-uploads list state + delete + regenerate actions.
5. Unit-test poll state machine (running→done, running→failed, cancel) + delete/regenerate.

## Todo
- [ ] Job + recent-upload DTOs verified vs aiApi
- [ ] Repo fns: generate, getJob, recent, delete, regenerate
- [ ] AiToolViewModel Android (poll + cancel)
- [ ] AiToolViewModel iOS (poll + cancel)
- [ ] Poll state machine tested

## Success Criteria
- VM uploads file, polls job to completion, surfaces questions; recent uploads + delete + regenerate work; polling cancels cleanly.

## Risks
| Risk | Mitigation |
|------|-----------|
| Poll loops forever / leaks | AiJobPoller max-timeout + cancel on screen-leave |
| Job status enum mismatch | Verify exact status strings from aiApi |
