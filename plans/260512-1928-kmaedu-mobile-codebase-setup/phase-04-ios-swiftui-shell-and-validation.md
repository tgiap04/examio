# Phase 04 — iOS SwiftUI Shell and Validation

## Context Links

- Source stories: `kmaedu-app/user-stories.md`
- Depends on: `phase-01-project-scaffold.md`
- Integrates: `phase-02-shared-core-foundations.md`

## Overview

Priority: High  
Status: Completed

> **Validation:** iOS `xcodebuild` passed. Android/Gradle blocked — no gradle CLI or wrapper available.  
Create SwiftUI shell with matching navigation and document validation commands.

## Requirements

- Use SwiftUI for iOS UI.
- iOS deployment baseline is 16.0.
- Prepare shared framework integration from KMP.
- Match the same five-tab IA as Android.
- Update `README.md` with practical local commands.

## Architecture

- `KMAEduApp.swift` launches SwiftUI app.
- `ContentView.swift` hosts `TabView`.
- One SwiftUI view per MVP tab.
- KMP shared framework is imported where available; shell should remain simple.

## Related Code Files

Create/modify in `kmaedu-app/iosApp/`:

- `iosApp.swift` or `KMAEduApp.swift`
- `ContentView.swift`
- `Views/HomeView.swift`
- `Views/StudyView.swift`
- `Views/MyExamsView.swift`
- `Views/AiView.swift`
- `Views/AccountView.swift`
- Xcode project/workspace files as required by the scaffold.
- `README.md`

## Implementation Steps

1. Add SwiftUI app shell and five-tab `TabView`.
2. Prepare iOS project settings for bundle id `com.kmaedu.app` and iOS 16.0.
3. Wire KMP shared framework integration minimally.
4. Update README with Android/iOS setup, build, and validation commands.
5. Run available compile/sync commands from `kmaedu-app/`.
6. If local SDK tooling is missing, record exact blocker and still run static file checks.

## Todo List

- [x] Implement SwiftUI shell.
- [x] Configure iOS app baseline.
- [x] Update README.
- [ ] Run Gradle validation. <!-- blocked: no gradle CLI/wrapper -->
- [x] Run iOS validation if Xcode tooling is available. <!-- passed -->

## Success Criteria

- [x] iOS shell has five tabs matching user stories.
- [x] README explains current MVP shell scope and commands.
- [x] Android/shared Gradle build is validated, or blockers are reported precisely. <!-- blocked, reason documented -->
- [x] No markdown plan/docs are written outside allowed directories except explicitly updated app README.

## Risk Assessment

- Xcode project generation by hand can be verbose; keep minimal and compatible.
- KMP framework linking may require local Xcode/Gradle setup; document exact commands.

## Security Considerations

- Do not add API keys, signing credentials, provisioning profiles, or secrets.
- Do not persist session tokens in UserDefaults.

## Next Steps

After validation and review, ask user whether to commit; do not commit without explicit approval.
