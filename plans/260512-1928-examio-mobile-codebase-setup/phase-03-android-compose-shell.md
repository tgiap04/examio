# Phase 03 — Android Compose Shell

## Context Links

- Source stories: `examio-app/user-stories.md`
- Depends on: `phase-01-project-scaffold.md`
- Integrates: `phase-02-shared-core-foundations.md`

## Overview

Priority: High  
Status: Completed

> **Validation blocker:** Android/Gradle build cannot be run — no gradle CLI or wrapper available. Static checks pass.  
Create Android native shell with Jetpack Compose, Material navigation, and MVP placeholder screens.

## Requirements

- Use Android Jetpack Compose.
- Navigation follows five bottom tabs from user stories: Home, Study, My Exams, AI, Account.
- Each async-ready screen placeholder should expose loading/error/empty affordance areas, but not fake backend data.
- Keep Android UI native and small-screen first.

## Architecture

- `MainActivity` hosts Compose.
- `ExamioTheme` defines app-level Material styling.
- `ExamioApp` contains scaffold and bottom navigation.
- Placeholder screen composables live under feature packages.
- Android reads tab metadata from shared `MainTab` where practical.

## Related Code Files

Create/modify in `examio-app/androidApp/src/main/kotlin/com/examio/app/`:

- `MainActivity.kt`
- `ExamioApp.kt`
- `design/ExamioTheme.kt`
- `navigation/BottomTabBar.kt`
- `features/home/HomeScreen.kt`
- `features/study/StudyScreen.kt`
- `features/exams/MyExamsScreen.kt`
- `features/ai/AiScreen.kt`
- `features/account/AccountScreen.kt`

## Implementation Steps

1. Add Compose activity setup.
2. Add Material theme with simple Examio brand colors.
3. Add bottom navigation scaffold with five tabs.
4. Add focused placeholder screens describing future MVP responsibilities.
5. Wire navigation state locally without introducing complex router.
6. Add Android resource strings/icons only if needed for compile.

## Todo List

- [x] Implement `MainActivity`.
- [x] Implement Compose theme.
- [x] Implement bottom tab shell.
- [x] Implement five placeholder screens.
- [ ] Compile Android app. <!-- blocked: no gradle CLI/wrapper -->

## Success Criteria

- Android app launches to Home tab.
- Users can switch all five tabs.
- UI is native Compose and does not clone desktop layouts.
- No backend calls are made in setup shell.

## Risk Assessment

- Compose/AGP version mismatch can block build; pin compatible versions.
- Vector icons may add unnecessary dependencies; keep UI text-first if needed.

## Security Considerations

- Do not display or store personal data in placeholders.
- Do not include real credentials or API keys.

## Next Steps

Proceed to iOS SwiftUI shell and validation.
