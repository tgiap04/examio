---
title: "Phase 1: Shared KMP Foundation"
description: "Data models, HTTP client, API interfaces, repositories, and session management in shared KMP module"
status: pending
priority: P1
effort: 20h
---

# Phase 1: Shared KMP Foundation

## Context

- [Frontend API contracts](../../examio-fe/src/apis/)
- [Existing shared code](../../examio-app/shared/src/commonMain/kotlin/com/examio/app/)

## Overview

Build the shared Kotlin Multiplatform layer that all platform screens depend on. This includes data models mirroring backend responses, Ktor HTTP client with auth interceptor, API service interfaces, and repository pattern for data access.

## Key Insights

- Backend API is REST with JSON responses; Ktor + kotlinx.serialization is the natural fit
- Token refresh logic must be shared; platform-specific secure storage already exists via `expect/actual`
- SSE streaming needs platform-specific implementation (URLSession on iOS, OkHttp on Android)
- All paginated responses follow `{ data[], total, page, limit, totalPages }` pattern

## Requirements

### Functional
- HTTP client with bearer token injection, 401 handling, token refresh
- All data models matching frontend TypeScript types
- Repository interfaces for each feature domain
- Pagination helper (generic `PaginatedResponse<T>`)

### Non-Functional
- No platform-specific code in `commonMain` except `expect` declarations
- Models use `@Serializable` for zero-reflection parsing
- Error handling via sealed `ApiResult<T>`

## Files to Create

### Core Network (`shared/src/commonMain/.../core/network/`)

| File | Purpose |
|------|---------|
| `HttpClientFactory.kt` | Ktor HttpClient config with JSON, auth, logging |
| `AuthInterceptor.kt` | Token injection + 401 refresh logic |
| `PaginatedResponse.kt` | Generic paginated response wrapper |
| `ApiEndpoints.kt` | URL constants matching gateway routes |

### Models (`shared/src/commonMain/.../features/`)

| File | Purpose |
|------|---------|
| `auth/models/AuthModels.kt` | LoginRequest/Response, SignupRequest/Response, ResetPassword |
| `auth/models/UserModels.kt` | User, UserProfile, UserRole |
| `study/models/FlashcardModels.kt` | FlashcardSet, Flashcard, FlashcardLabel, pagination |
| `study/models/FlashcardStudyModels.kt` | Study session state |
| `exams/models/QuizSetModels.kt` | QuizSet, Question, QuizSetLabel |
| `exams/models/ExamRoomModels.kt` | ExamRoom, ExamSession, ExamSessionStatus |
| `exams/models/ExamAttemptModels.kt` | ExamAttempt, SecureQuestion, SecureAnswer |
| `ai/models/AIChatModels.kt` | AIChat, AIChatMessage, SendMessageRequest |
| `ai/models/AIGeneratorModels.kt` | GenerateExamRequest/Response |
| `ai/models/SubjectModels.kt` | Subject, SubjectCategory |
| `account/models/ProfileModels.kt` | UserProfile, UpdateProfileData |
| `account/models/WalletModels.kt` | WalletDetails, Transaction, SubscriptionPlan |
| `history/models/HistoryModels.kt` | PDFHistoryItem, ExamHistoryItem, HistoryStats |

### API Services (`shared/src/commonMain/.../features/`)

| File | Purpose |
|------|---------|
| `auth/api/AuthApiService.kt` | login, signup, logout, refresh, resetPassword |
| `study/api/FlashcardApiService.kt` | CRUD flashcard sets, flashcards, labels |
| `study/api/StudentMaterialsApiService.kt` | recent flashcards, pin/share |
| `exams/api/QuizSetApiService.kt` | CRUD quiz sets, questions, labels |
| `exams/api/ExamRoomApiService.kt` | CRUD exam rooms, sessions |
| `exams/api/ExamAttemptApiService.kt` | start, progress, submit, secure quiz |
| `ai/api/AIChatApiService.kt` | CRUD chats, messages, documents |
| `ai/api/AIGeneratorApiService.kt` | generate from file |
| `account/api/ProfileApiService.kt` | get/update profile, upload avatar |
| `account/api/WalletApiService.kt` | wallet details, payments, subscription |
| `history/api/HistoryApiService.kt` | stats, PDF history, exam history |

### Repositories (`shared/src/commonMain/.../features/`)

| File | Purpose |
|------|---------|
| `auth/repository/AuthRepository.kt` | Auth state management, token lifecycle |
| `study/repository/FlashcardRepository.kt` | Flashcard data access + caching |
| `exams/repository/ExamRepository.kt` | Exam data access |
| `ai/repository/AIChatRepository.kt` | Chat state + message management |
| `account/repository/AccountRepository.kt` | Profile + wallet data |

### Platform-Specific (`shared/src/{ios,android}Main/`)

| File | Purpose |
|------|---------|
| `core/network/SSEClient.ios.kt` | URLSession-based SSE streaming |
| `core/network/SSEClient.android.kt` | OkHttp-based SSE streaming |
| `core/network/SSEClient.kt` (common) | `expect` interface for SSE |

## Implementation Steps

1. Add Ktor dependencies to `shared/build.gradle.kts` (ktor-client-core, content-negotiation, serialization, logging)
2. Implement `HttpClientFactory` with JSON serialization config
3. Implement `AuthInterceptor` using existing `SecureTokenStorage`
4. Define `PaginatedResponse<T>` generic wrapper
5. Create all data model files with `@Serializable` annotations
6. Implement API service classes using Ktor client
7. Create repository interfaces and implementations
8. Define `expect fun createSSEClient()` with platform actuals
9. Write unit tests for model serialization (JSON round-trip)

## Data Flow

```
UI (platform) -> ViewModel (platform) -> Repository (shared)
    -> ApiService (shared) -> HttpClient (shared) -> Backend API
                                  ^
                          AuthInterceptor injects token
                          handles 401 -> refresh -> retry
```

## Success Criteria

- [ ] All models compile and serialize/deserialize correctly
- [ ] HTTP client authenticates and refreshes tokens
- [ ] API services cover all endpoints used by frontend
- [ ] Repository layer provides clean data access interface
- [ ] SSE expect/actual compiles on both platforms

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Ktor version incompatibility with KMP | Pin to stable 2.x release |
| Model drift from backend | Generate models from OpenAPI spec if available; otherwise manual sync |
| Token refresh race condition | Use mutex/atomic in shared refresh logic |

## Rollback

Shared module is additive. Existing placeholder screens remain functional. Revert = delete new files from shared module.
