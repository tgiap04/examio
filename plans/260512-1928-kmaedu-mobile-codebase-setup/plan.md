# KMAEdu Mobile Codebase Setup Plan

## Context

- Target app: `/Users/tgiap.dev/devs/kma-edu/kmaedu-app`
- Source stories: `kmaedu-app/user-stories.md`
- Scope approved by user: MVP shell only
- App id / namespace: `com.kmaedu.app`
- Platform baseline: Android minSdk 26, iOS deployment target 16.0
- Technical direction: Kotlin Multiplatform shared logic, Android Jetpack Compose, iOS SwiftUI

## Goal

Set up a compilable mobile codebase skeleton that supports future KMAEdu MVP 1 implementation without adding backend/domain features prematurely.

## Phases

1. [Phase 01 — Project scaffold](phase-01-project-scaffold.md)
   - Create Gradle/KMP root, Android app module, shared KMP module, iOS app shell.
   - Status: Completed

2. [Phase 02 — Shared core foundations](phase-02-shared-core-foundations.md)
   - Add shared app config, API/session/storage interfaces, UI state primitives, validation basics.
   - Status: Completed

3. [Phase 03 — Android Compose shell](phase-03-android-compose-shell.md)
   - Add Android Compose app entry, theme, bottom tabs, placeholder MVP screens.
   - Status: Completed

4. [Phase 04 — iOS SwiftUI shell and validation](phase-04-ios-swiftui-shell-and-validation.md)
   - Add SwiftUI app shell consuming shared module, tab navigation, README commands, compile validation.
   - Status: Completed (iOS validated; Android/Gradle blocked — no gradle CLI or wrapper)

## Key Dependencies

- Phase 02 depends on Phase 01.
- Phase 03 depends on Phase 01 and can integrate shared contracts from Phase 02.
- Phase 04 depends on Phase 01 and can integrate shared contracts from Phase 02.

## Success Criteria

- `kmaedu-app` contains a clear KMP mobile structure, not just mockups/docs.
- Android app compiles with Compose shell and five MVP bottom tabs.
- iOS app has SwiftUI shell with matching tabs and KMP framework wiring prepared.
- Shared module contains real interfaces/models for future auth/API/session work, not fake feature implementations.
- README documents local build commands and scope.
- No commits are made.
