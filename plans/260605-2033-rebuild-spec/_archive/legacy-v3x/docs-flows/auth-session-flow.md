# FLOW001 - Auth Session Flow

## Purpose
Document the cross-client account authentication and session lifecycle for web, backend, and mobile clients.

## Actors/systems
- Anonymous user / authenticated user
- Web app auth store, Axios client, `ProtectedRoute`, `PublicRoute`, `useAuthSync`
- Mobile Android shared KMP `AuthRepository`
- Mobile iOS Swift `AuthApiClient` and `KeychainTokenStore`
- Gateway `/api/v1/auth/*`
- Auth service, `User`, `UserSession`, reset code storage
- Finance workflow for wallet bootstrap after registration

## State transitions
- Anonymous -> authenticating -> authenticated when credential login or registration succeeds.
- Anonymous -> OAuth redirect/browser -> callback/deep link -> tokens persisted -> authenticated shell.
- Authenticated -> refreshing -> authenticated when access token expires and refresh succeeds.
- Authenticated -> refreshing -> expired -> anonymous when refresh fails or session is invalid.
- Authenticated -> logout requested -> session deactivated -> local auth state cleared -> anonymous.
- Password reset: request code -> code sent -> submit code/new password -> reset complete -> login. Exact redirect Needs verification.
- Registration side effect: new user -> `user.created` event/integration -> wallet creation. Exact ordering between auth response and wallet availability Needs verification.

## Trigger types
- User action: register, login, logout, reset password, change password, Google OAuth / One Tap.
- Route guard: accessing `/k/*` unauthenticated or auth pages authenticated.
- HTTP response: 401 triggers web single-flight refresh and retry.
- App lifecycle: mobile launch token restore.
- Backend event/integration: `user.created` triggers finance wallet bootstrap.

## Source artifact refs
- `feature-list.md` F001, F010
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- `behavior-logic.md` BL001-BL011, BL020-BL024, BL060
- `data-model.md` MODEL001, MODEL002, MODEL004, MODEL031, MODEL036
- `features/f001-account-authentication-session-management/technical-spec.md`
- `features/f010-wallet-payments-subscription-benefits/technical-spec.md`

## Edge cases / Needs verification
- Exact post-password-reset success redirect.
- Exact `/k` root destination after authenticated redirect.
- iOS launch restore semantics and relationship to stubbed KMP secure storage.
- Exact wallet creation failure/retry behavior after registration.
- Whether route-level role checks exist beyond authentication for teacher/admin screens.
