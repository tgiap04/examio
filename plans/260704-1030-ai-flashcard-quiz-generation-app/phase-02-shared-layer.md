# Phase 02 — Shared Layer: Save-History + Poller Finalize

## Context Links
- Phase 01 drift table

## Overview
- **Priority:** High (foundation for both platforms)
- **Status:** pending
- **Description:** Ensure the shared KMP layer exposes everything both UIs need: correct generate/poll, plus the **save-history-to-set** methods (the missing seam). No UI here.

## Key Insights
- `AIGeneratorApiService`/`AiJobPoller`/`AIChatRepository` exist; likely need only enum fixes from P01.
- Save-history is the net-new API surface. FE persists via `/quizsets/save-history-to-quizset` and `/flashcardsets/save-history-to-flashcardset` — check if `QuizSetApiService`/`FlashcardApiService` already have equivalents; add if not.

## Requirements
- `saveHistoryToQuizset(quizsetIds, historyId, label?)` and `saveHistoryToFlashcardSet(flashcardsetIds, historyId, label?)` in the appropriate API service + repository.
- Reuse existing set-create (`createQuizSet`/`createFlashcardSet`) so "save to new set" works.
- `ApiEndpoints.kt` path constants for the two save-history routes.

## Related Code Files
- Modify: `shared/.../features/exams/api/QuizSetApiService.kt`, `shared/.../features/study/api/FlashcardApiService.kt`, `shared/.../core/network/ApiEndpoints.kt`
- Modify (repos): `shared/.../features/exams/repository/ExamRepository.kt`, `shared/.../features/study/repository/FlashcardRepository.kt`
- Modify (from P01): `shared/.../features/ai/models/AIGeneratorModels.kt`, `util/AiJobPoller.kt`
- Add DTOs: `SaveHistoryToQuizsetRequest`, `SaveHistoryToFlashcardSetRequest` (+ label fields)

## Implementation Steps
1. Apply P01 enum/field fixes to shared models + poller.
2. Add save-history request DTOs (mirror BE `{setIds[], historyId, labelId|labelName+labelColor}`).
3. Add API service methods (multipart not needed — JSON) via `safeApiCall`.
4. Expose through repositories; return `ApiResult<{createdCount,...}>`.
5. `./gradlew :shared:compileKotlinMetadata` (or platform compile) to confirm shared compiles.

## Todo List
- [ ] P01 fixes applied to shared
- [ ] Save-history DTOs + endpoint constants
- [ ] API service + repository methods (quiz + flashcard)
- [ ] Shared module compiles

## Success Criteria
Shared module compiles; generate/poll/save-history callable from a platform layer with correct types.

## Security Considerations
Bearer + `X-Device-ID` already injected by `AuthInterceptor`. No new secrets.

## Next Steps
Unblocks P03 (Android) and P05 (iOS) — parallel.
