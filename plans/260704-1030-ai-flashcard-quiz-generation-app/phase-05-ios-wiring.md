# Phase 05 — iOS: Entry + Wiring

## Context Links
- Phase 02 (contract) · `ContentView.swift`, `AppRouter.swift`, `AiView.swift`

## Overview
- **Priority:** High (parity mandate — CLAUDE.md)
- **Status:** pending
- **Description:** iOS `AiView.swift` + `AIToolViewModel.swift` exist but are unreached. Add contextual entry from Study + DeThi views and render the generator. iOS is a pure-Swift stack (no shared framework).

## Key Insights
- `ExamioAPIClient.shared` singleton already handles multipart upload + bearer/`X-Device-ID`.
- Apply the same P01 status-enum fix in the Swift `AIToolViewModel` (Swift models are separate).
- No 5th tab — add entry buttons in `StudyView`/`MyExamsView`(DeThi), open `AiView` via sheet/`NavigationLink`.

## Requirements
- "Tạo bằng AI" entry in Study + DeThi views → present `AiView` (flashcard/quiz mode).
- Correct job-status parsing (from P01).
- Graceful handling if `ai-tool` returns 404.

## Related Code Files
- Modify: `iosApp/ExamioApp/Views/StudyView.swift`, `iosApp/ExamioApp/Views/MyExamsView.swift` (+ DeThiView) — entry buttons
- Modify: `iosApp/ExamioApp/Features/AI/AIToolViewModel.swift` (status enum fix)
- Verify: `iosApp/ExamioApp/Views/AiView.swift`, `ExamioAPIClient.swift`

## Implementation Steps
1. Apply P01 status/field fixes to Swift models/VM.
2. Add entry buttons; present `AiView(mode:)` via `.sheet`/`NavigationLink`.
3. Ensure `AIToolViewModel` gets the API client + starts polling correctly.
4. Confirm token attach on multipart + poll requests (no auto-refresh — see risk).
5. Build: `xcodebuild`/Xcode scheme for `iosApp` (or note manual verification if CI absent).

## Todo List
- [ ] Swift status-enum/field fixes
- [ ] Entry buttons in Study + DeThi
- [ ] AiView presented + VM wired
- [ ] iOS builds

## Success Criteria
Tapping entry opens the generator; PDF upload → generate → results render on iOS. Save seam in P06.

## Risk Assessment
iOS has **no auto token-refresh**; a job polled past token expiry 401s. Mitigation: detect 401 during poll, surface a re-auth prompt or trigger manual refresh.

## Next Steps
P06 adds the save seam.
