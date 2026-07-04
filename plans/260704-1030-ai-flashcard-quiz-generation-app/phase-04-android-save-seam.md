# Phase 04 — Android: Review → Save-to-Set → View Seam

## Context Links
- Phase 02 save-history API · Phase 03 wired AiScreen

## Overview
- **Priority:** High (the real net-new work)
- **Status:** pending
- **Description:** After a job completes (`historyId` + `type`), let the user review results and save into a new or existing set, then route into the existing study/quiz screen to view.

## Key Insights
- Job result carries `historyId`; persistence is by history (not by re-sending cards).
- App already has flashcard-study + quiz-manage screens to land on after save.
- MVP: optional label; new-set creation reuses existing `createQuizSet`/`createFlashcardSet`.

## Requirements
- Result preview (list quizzes/flashcards) in `AiScreen`.
- "Lưu" flow: pick existing set OR create new (title) → call save-history repo method with `historyId`.
- On success: navigate to the set in study (flashcard) / quiz-manage (quiz) screen; refresh its list cache.

## Related Code Files
- Modify: `androidApp/.../features/ai/AiScreen.kt`, `AIToolViewModel.kt` (review UI + save action + nav callback)
- Reuse: `androidApp/.../features/study/FlashcardManageScreen.kt` / `FlashcardStudyScreen.kt`, `androidApp/.../features/exams/QuizSetManageScreen.kt`
- Reuse repos from P02 (save-history) + existing set-create

## Implementation Steps
1. Render completed `result` (quiz options A–D w/ answer highlight; flashcard Q/A) in `AiScreen`.
2. Add set-picker sheet: list user's sets (existing API) + "Tạo mới" (title input).
3. On save → `saveHistoryToQuizset`/`saveHistoryToFlashcardSet(setIds, historyId, label?)`.
4. On success → invalidate set-list cache, navigate to the target set screen.
5. Handle errors (Vietnamese messages via `ApiResult`).

## Todo List
- [ ] Result preview UI
- [ ] Set picker + create-new
- [ ] Save-history call wired
- [ ] Post-save navigation + cache refresh
- [ ] Error/empty/failed-job states

## Success Criteria
End-to-end on Android: upload → generate → review → save → the new/updated set is visible and studyable.

## Next Steps
Mirrored by P06 on iOS; both feed P07.
