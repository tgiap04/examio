# Phase 06 — iOS: Review → Save-to-Set → View Seam

## Context Links
- Phase 05 wired AiView · Phase 02 save-history contract (Swift equivalent)

## Overview
- **Priority:** High
- **Status:** pending
- **Description:** Swift mirror of P04: review completed results, save into new/existing set via save-history, navigate to the set.

## Key Insights
- Swift API client needs its own `saveHistoryToQuizset`/`saveHistoryToFlashcardSet` methods (shared KMP methods from P02 do NOT reach iOS).
- Reuse existing Swift study/exam views to land on after save.

## Requirements
- Add Swift save-history calls to `KMAEduAPIClient` (mirror BE `{setIds[], historyId, label?}`).
- Result preview + set picker (existing set or create-new) in `AiView`.
- Post-save navigation + list refresh.

## Related Code Files
- Modify: `iosApp/KMAEduApp/KMAEduAPIClient.swift` (save-history methods)
- Modify: `iosApp/KMAEduApp/Views/AiView.swift`, `Features/AI/AIToolViewModel.swift` (review + save + nav)
- Reuse: `iosApp/KMAEduApp/Views/StudyView.swift`, `MyExamsView.swift` (target after save)

## Implementation Steps
1. Add `saveHistoryToQuizset`/`saveHistoryToFlashcardSet` to `KMAEduAPIClient` (Codable request bodies).
2. Result preview UI in `AiView`.
3. Set-picker (existing + create-new via existing create endpoints).
4. Save → navigate to target set view → refresh.
5. Error/empty/failed-job states.

## Todo List
- [ ] Swift save-history client methods
- [ ] Result preview UI
- [ ] Set picker + create-new
- [ ] Post-save navigation + refresh
- [ ] Error states

## Success Criteria
End-to-end on iOS: upload → generate → review → save → set visible and studyable. Feature-parity with Android P04.

## Next Steps
Feeds P07 integration.
