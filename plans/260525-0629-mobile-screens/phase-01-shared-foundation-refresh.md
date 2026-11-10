---
title: "Phase 01: Shared Foundation Refresh"
description: "Audit existing shared api/repo vs in-scope DTOs; add HistoryRepository, multipart helper, AI job-polling helper"
status: pending
priority: P1
effort: 8h
track: Prereq
---

# Phase 01: Shared Foundation Refresh

> ONLY true prerequisite. BLOCKS Track B wiring phases (03,06,09,12,15). Does NOT block Track A UI phases (02,05,08,11,14).

## Context Links

- Report: `../reports/brainstorm-260627-1527-kmaedu-app-k-screens-parity.md`
- FE api clients (DTO source of truth): `../../kmaedu-fe/src/apis/`
- Shared layer: `../../kmaedu-app/shared/src/commonMain/kotlin/com/kmaedu/app/`

## Overview

The shared layer already has api services + repositories for auth, account, study, exams, ai. This phase does NOT rebuild them — it audits them against in-scope FE DTOs, fills the gaps, and adds the three missing shared utilities the wiring phases depend on: `HistoryRepository`, a multipart upload helper, and an AI job-polling helper.

## Key Insights

- `HistoryApiService.kt` exists but has NO repository wrapper — wiring phases expect a repository.
- 4 multipart flows need one shared helper: profile avatar/banner, flashcard thumbnail, quizset thumbnail, ai generate-from-file.
- AI generation = async job polling (POST /ai/generate-from-file → {jobId} → poll GET /ai/job/{jobId}), needs a reusable poller (timeout + backoff + cancel).

## Requirements

### Functional
- `HistoryRepository` wrapping `HistoryApiService` (history-stats, examattempts list, ai recent-uploads for PDF tab).
- Shared multipart upload helper (Ktor `MultiPartFormDataContent`) + `expect/actual` file-picker bridge for platform file bytes.
- AI job-polling helper: `pollJob(jobId): Flow<JobStatus>` with backoff + max-timeout + cancellation.
- Audit + patch existing DTOs to match FE field shapes (see per-group phases for exact field lists).

### Non-Functional
- commonMain only (except `expect` for file bytes). Each file < 200 lines.

## Architecture

```
ViewModel -> Repository (shared) -> ApiService (shared) -> ApiCall/HttpClient -> gateway
multipart: ViewModel -> MultipartUploadHelper -> ApiService
ai job:    ViewModel -> AiJobPoller (Flow) -> AIGeneratorApiService.getJob(id)
```

## Related Code Files

### Create
- `shared/src/commonMain/.../features/history/repository/HistoryRepository.kt`
- `shared/src/commonMain/.../core/network/MultipartUploadHelper.kt`
- `shared/src/commonMain/.../core/network/PlatformFile.kt` (expect: bytes + filename + mime)
- `shared/src/androidMain/.../core/network/PlatformFile.android.kt`
- `shared/src/iosMain/.../core/network/PlatformFile.ios.kt`
- `shared/src/commonMain/.../features/ai/util/AiJobPoller.kt`

### Modify (audit + patch field shapes only if drift found)
- `shared/.../features/account/api/ProfileApiService.kt`, `WalletApiService.kt`
- `shared/.../features/study/api/FlashcardApiService.kt`, `StudentMaterialsApiService.kt`
- `shared/.../features/exams/api/QuizSetApiService.kt`, `ExamRoomApiService.kt`, `ExamAttemptApiService.kt`
- `shared/.../features/ai/api/AIGeneratorApiService.kt`
- `shared/.../features/history/api/HistoryApiService.kt`

## Implementation Steps

1. Diff each existing ApiService/DTO against the matching FE api client; record drift (do not over-fix — only in-scope fields).
2. Add `HistoryRepository` mirroring the other repositories' shape (ApiResult-returning suspend fns).
3. Implement `PlatformFile` expect + android/ios actuals (read bytes, filename, mime from platform picker output).
4. Implement `MultipartUploadHelper` building `MultiPartFormDataContent` from `PlatformFile` + form fields.
5. Implement `AiJobPoller.pollJob(jobId)` returning a `Flow<JobStatus>` (PENDING/RUNNING/DONE/FAILED) with exponential backoff, max timeout, cooperative cancellation.
6. Compile shared module (Android + iOS targets).

## Todo

- [ ] DTO audit recorded (drift list per group)
- [ ] HistoryRepository added + compiles
- [ ] PlatformFile expect/actual (android+ios) compiles
- [ ] MultipartUploadHelper compiles
- [ ] AiJobPoller compiles
- [ ] `./gradlew :shared:compileKotlinMetadata` (or equivalent) green

## Success Criteria

- Shared module compiles for both targets.
- HistoryRepository, MultipartUploadHelper, AiJobPoller present and unit-callable.
- DTO drift list handed to the Track B wiring phases.

## Risks

| Risk | Mitigation |
|------|-----------|
| iOS file bytes bridging (NSData↔ByteArray) | Use Kotlin/Native interop; small helper, unit-verify a round-trip |
| Job-poller leaks coroutine on screen-leave | Flow is cold + cancellable; cancel in ViewModel onCleared |
| DTO over-fixing scope creep | Only patch in-scope fields named by group phases |

## Rollback

All additive. Revert = delete new files; DTO patches are field-additive and backward-safe.
