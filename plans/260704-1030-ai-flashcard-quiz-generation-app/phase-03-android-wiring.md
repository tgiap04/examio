# Phase 03 — Android: DI Wiring + Contextual Entry

## Context Links
- Phase 02 shared API · `AndroidAppContainer.kt`, `ExamioApp.kt`, `MainTab.kt`

## Overview
- **Priority:** High
- **Status:** pending
- **Description:** Make the existing `AiScreen`/`AIToolViewModel` reachable: construct the AI repo/services in DI, thread through `MainActivity`→`ExamioApp`, and add contextual "Tạo bằng AI" entry buttons in Flashcard + Đề thi screens.

## Key Insights
- `AiScreen.kt` + `AIToolViewModel.kt` already exist and are complete for upload/generate/poll.
- Blocker is purely wiring: DI never builds `AIChatRepository`/`AIGeneratorApiService`; nav never renders the screen.
- Contextual entry (not a 5th tab) → edit `StudyScreen`/`DeThiScreen`, no `MainTab`/`BottomTabBar` change.

## Requirements
- DI constructs `AIGeneratorApiService`, `SubjectApiService` (if AiScreen needs it), `AIChatRepository`, `SSEClient`.
- `AiScreen` rendered as an overlay/route from Study + DeThi entry buttons.
- Entry buttons visible to all users; hide/handle gracefully on `ai-tool` 404.

## Related Code Files
- Modify: `androidApp/.../backend/AndroidAppContainer.kt` (construct AI services/repo)
- Modify: `androidApp/.../MainActivity.kt`, `androidApp/.../ExamioApp.kt` (pass repo, add AI route/overlay)
- Modify: `androidApp/.../features/study/StudyScreen.kt`, `androidApp/.../features/exams/DeThiScreen.kt` (entry button/FAB)
- Read/verify: `androidApp/.../features/ai/AiScreen.kt`, `AIToolViewModel.kt`, `AiModels.kt`

## Implementation Steps
1. In `AndroidAppContainer`: build `AIGeneratorApiService(client)`, `AIChatRepository(...)`; expose via container.
2. Thread container→`ExamioApp` (constructor/param), add an `AiNavState`-style overlay like `ExamNavState`, or a nav route.
3. Add "Tạo bằng AI" button in `StudyScreen` (→ flashcard mode) and `DeThiScreen` (→ quiz mode); pass `typeResult` default accordingly.
4. `AiScreen` receives an `AIToolViewModel` built from the wired repo.
5. Build: `./gradlew :androidApp:assembleDebug`.

## Todo List
- [ ] DI constructs AI services/repo
- [ ] ExamioApp renders AiScreen (overlay/route)
- [ ] Entry buttons in Study + DeThi
- [ ] `ai-tool` 404 handled (hide/toast)
- [ ] androidApp assembles

## Success Criteria
Tapping "Tạo bằng AI" opens the generator; a PDF can be uploaded, generated, and results render — save seam handled in P04.

## Risk Assessment
Container threading may ripple through `MainActivity`/`ExamioApp` signatures. Keep changes additive.

## Next Steps
P04 adds save-to-set + view navigation.
