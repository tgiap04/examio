# Phase 01 — Project Scaffold

## Context Links

- Source stories: `examio-app/user-stories.md`
- Target directory: `examio-app/`
- Project instructions: `CLAUDE.md`

## Overview

Priority: High  
Status: Completed

> **Validation blocker:** Android/Gradle build cannot be run from this environment — no gradle CLI or wrapper available. Static checks pass; runtime validation deferred.  
Create the minimal Kotlin Multiplatform project structure for Android and iOS without implementing domain flows.

## Requirements

- Use `com.examio.app` for Android namespace/application id.
- Use Android minSdk 26.
- Prepare iOS bundle/deployment baseline for iOS 16.0.
- Keep existing docs/mockups in place.
- Do not add a separate backend or direct AI provider integration.

## Architecture

- `shared/`: Kotlin Multiplatform shared business/core module.
- `androidApp/`: Android Jetpack Compose host app.
- `iosApp/`: SwiftUI host app and Xcode project files.
- Root Gradle files define plugin/dependency versions centrally.

## Related Code Files

Create/modify in `examio-app/`:

- `settings.gradle.kts`
- `build.gradle.kts`
- `gradle.properties`
- `androidApp/build.gradle.kts`
- `androidApp/src/main/AndroidManifest.xml`
- `shared/build.gradle.kts`
- `shared/src/commonMain/kotlin/...`
- `shared/src/androidMain/kotlin/...`
- `shared/src/iosMain/kotlin/...`
- `iosApp/...`
- `README.md`

## Implementation Steps

1. Create Gradle root with `androidApp` and `shared` modules.
2. Configure Kotlin Multiplatform targets: Android, iOS x64, iOS arm64, iOS simulator arm64.
3. Configure shared framework output for iOS.
4. Configure Android application plugin, Compose, app id, minSdk 26.
5. Add minimal Android manifest and main activity placeholders.
6. Add minimal SwiftUI app structure ready to import shared framework.

## Todo List

- [x] Create Gradle root files.
- [x] Create shared module source sets.
- [x] Create Android module skeleton.
- [x] Create iOS app skeleton.
- [x] Preserve existing docs/mockups.

## Validation Notes

- Gradle build blocked: no gradle CLI or wrapper in environment.
- Static checks pass on file structure and configuration.
- Full Android build requires local environment with Gradle and Android SDK.

## Success Criteria

- Gradle project can be discovered from `examio-app/`.
- Module names are clear and conventional.
- No feature-specific implementation is added beyond app shell requirements.

## Risk Assessment

- Local machine may lack Android SDK/Xcode pieces; document validation fallback if build cannot run.
- KMP/iOS project wiring can be sensitive to plugin versions; prefer stable Kotlin/AGP versions.

## Security Considerations

- Do not add hardcoded API secrets.
- Do not store tokens in plain preferences in scaffold.

## Next Steps

Proceed to shared core foundations.
