# Phase 02 — Shared Core Foundations

## Context Links

- Source stories: `examio-app/user-stories.md`
- Depends on: `phase-01-project-scaffold.md`

## Overview

Priority: High  
Status: Completed

> **Validation blocker:** Gradle build cannot be run from this environment — no gradle CLI or wrapper available.  
Add simple shared Kotlin contracts that future Android and iOS screens can reuse.

## Key Insights

MVP 1 starts with login/session, home, exams, flashcards, AI chat, and profile, but this setup phase should only create reusable foundations and placeholder state contracts.

## Requirements

- Shared logic belongs in Kotlin Multiplatform when it is business/platform-neutral.
- Platform-specific secure storage remains behind expect/actual interfaces.
- Network layer should call the existing backend API later, not introduce a mobile backend.
- Avoid hard-coded providers or backend URLs except build/config placeholders.

## Architecture

- `core/config`: app environment and API base URL config.
- `core/network`: HTTP client abstraction and API result model.
- `core/session`: session token model and session repository contract.
- `core/storage`: secure key-value storage expect/actual boundary.
- `core/ui`: loading/error/empty state primitives.
- `features/navigation`: MVP tab definitions shared by Android/iOS.

## Related Code Files

Create/modify in `examio-app/shared/src/...`:

- `commonMain/kotlin/com/examio/app/core/config/AppConfig.kt`
- `commonMain/kotlin/com/examio/app/core/network/ApiResult.kt`
- `commonMain/kotlin/com/examio/app/core/session/SessionModels.kt`
- `commonMain/kotlin/com/examio/app/core/storage/SecureTokenStorage.kt`
- `commonMain/kotlin/com/examio/app/core/ui/LoadableState.kt`
- `commonMain/kotlin/com/examio/app/features/navigation/MainTab.kt`
- platform `actual` files for secure storage stubs that fail safe until implemented.

## Implementation Steps

1. Add shared package hierarchy under `com.examio.app`.
2. Define `AppConfig` with API base URL supplied by platform/config later.
3. Define `ApiResult` sealed interface for success/error/network failure.
4. Define session token and user role models needed by navigation/auth shell.
5. Define `SecureTokenStorage` interface or expect boundary without insecure persistence.
6. Define `MainTab` values: Home, Study, My Exams, AI, Account.

## Todo List

- [x] Add shared core packages.
- [x] Add API result and state primitives.
- [x] Add session/storage contracts.
- [x] Add MVP tab model.

## Validation Notes

- Shared Kotlin code is syntactically valid and follows KMP conventions.
- Full Gradle compile blocked: no gradle CLI or wrapper in environment.

## Success Criteria

- Shared code compiles independently.
- No tokens are written to plain storage.
- Future domain features have clear extension points without overbuilt repositories.

## Risk Assessment

- Over-abstracting too early would slow implementation; keep contracts small.
- Secure storage actual implementations may need platform APIs in a later phase.

## Security Considerations

- Token persistence must be platform secure storage only when fully implemented.
- Error models must not require logging secrets.

## Next Steps

Proceed to Android Compose shell and iOS SwiftUI shell.
