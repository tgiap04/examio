# FLOW005 - Mobile Auth Flow

## Purpose
Document the mobile-specific authentication lifecycle across Android, iOS, shared KMP APIs, platform token storage, and OAuth deep links.

## Actors/systems
- Mobile user
- Android Compose app and shared KMP `AuthRepository`
- Android encrypted token storage
- iOS SwiftUI app, private `AuthApiClient`, and `KeychainTokenStore`
- Gateway auth API
- Auth service and `UserSession`
- Platform URL schemes for OAuth callback

## State transitions
- App launch -> token restore attempted -> unauthenticated auth screens or authenticated main tab shell.
- Unauthenticated -> login/register/reset/OAuth -> token persisted -> authenticated main tabs.
- OAuth: login screen -> system browser -> provider/backend callback -> `kmaedu://auth/callback` deep link -> token persistence -> authenticated shell.
- Authenticated -> logout/profile sheet action -> auth logout -> token cleared -> auth landing screen.
- Deep link: URL received -> parsed target -> auth callback handled or feature destination routed. Non-auth destination handling Needs verification.

## Trigger types
- App lifecycle: launch and session restore.
- User action: login, register, reset password, Google OAuth, logout.
- Deep link: `kmaedu://auth/callback` and possible exam/flashcard/chat/profile links.
- API response: auth success/failure, token refresh/restore result.
- Secure storage event: token read/write/delete per platform.

## Source artifact refs
- `feature-list.md` F001, F012
- `screen-flow.md` FLW101-FLW108, FLW201-FLW206
- `behavior-logic.md` BL001, BL005, BL009-BL011, BL070-BL074
- `data-model.md` MODEL001, MODEL002, MODEL048, MODEL049, MODEL058
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f012-cross-platform-mobile-companion/technical-spec.md`

## Edge cases / Needs verification
- iOS restore semantics and divergence from shared KMP secure token storage.
- Whether refresh-token rotation and session invalidation are handled identically on Android and iOS.
- Non-auth mobile deep link completion for exam, flashcard, chat, and profile targets.
- Device/session metadata parity with web `X-Device-ID` behavior.
- Most non-auth mobile feature screens use mock UI state and should not be treated as production API-backed.
