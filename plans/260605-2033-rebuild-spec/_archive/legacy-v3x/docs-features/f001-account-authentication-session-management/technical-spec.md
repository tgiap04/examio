# F001 - Account Authentication & Session Management Technical Spec

## Functional Requirements
- FR001: The system shall let anonymous visitors register with email/password through `/api/v1/auth/register` and web/mobile register screens.
- FR002: The system shall let anonymous users log in with credentials through `/api/v1/auth/login`, issue access/refresh credentials, create a user session, and persist client auth state.
- FR003: The system shall support Google OAuth and Google One Tap through `/api/v1/auth/google`, `/api/v1/auth/google/callback`, and `/api/v1/auth/google/one-tap`.
- FR004: The system shall refresh sessions through `/api/v1/auth/refresh` or `/api/v1/auth/sync-refresh-token` when a valid refresh token/session is present.
- FR005: The system shall log out the current session through `/api/v1/auth/logout` and deactivate/clear local client auth state.
- FR006: The system shall support password recovery through send reset code and reset password routes.
- FR007: The system shall support authenticated password change through send change code and change password routes.

## Business Rules
- BR001: Anonymous users can register, log in, request password reset, and start OAuth flows.
- BR002: Authenticated users are redirected away from public auth screens to `/k`.
- BR003: Unauthenticated users attempting `/k/*` are redirected to `/login` and the return path is stored.
- BR004: New user registration triggers backend wallet bootstrap via finance integration/event flow.
- BR005: Backend accepts cookie-first JWT auth with Bearer token fallback.
- BR006: iOS KMP secure token storage is incomplete; iOS auth currently relies on Swift Keychain storage.
- BR007: Registration supports `?from=` query parameter — signup success redirects to the specified return path when present, falling back to backend `redirectTo` then `/k`.
- BR008: Auth failure redirect loop is prevented — `handleAuthFailure` does not call `setRedirectBackTarget` when the current path is already `/login`. On 403 session invalidation, the same guard applies.

## State Machines
- SM001 Session state: anonymous -> authenticating -> authenticated -> refreshing -> authenticated, or refreshing -> expired -> anonymous.
- SM002 Password reset state: request code -> code sent -> submit code/new password -> reset complete -> login. Exact success redirect Needs verification.
- SM003 OAuth state: start provider redirect -> callback/deep link -> persist tokens -> strip URL params/open authenticated shell.

## Algorithms
- ALG001: Web Axios attaches `Authorization: Bearer {auth_token}` and `X-Device-ID` to requests.
- ALG002: On 401, web runs a single-flight refresh promise, retries the failed request once, then clears auth and redirects to `/login` if refresh fails. Redirect loop is prevented: `setRedirectBackTarget` is not called when the current path is `/login`.
- ALG003: OAuth callback parsing stores returned tokens and removes token query params from the URL.
- ALG004: On `403` session invalidation, the client clears auth state, shows `alert("Bạn đã bị đăng xuất từ thiết bị khác")`, and redirects to `/login`. Redirect back target is set only when the current path is not `/login` to prevent redirect loops.

## Integrations
- INT001: Gateway proxies `/api/v1/auth/*` to auth-service.
- INT002: Auth-service exposes gRPC token/user/permission validation for internal services.
- INT003: RabbitMQ `user.created` can initiate finance wallet creation.
- INT004: Web uses `src/apis/authApi.ts`, `src/stores/useAuthStore.ts`, `src/apis/api.ts`, `ProtectedRoute`, `PublicRoute`, and `useAuthSync`.
- INT005: Android uses shared KMP `AuthRepository`; iOS uses `AuthApiClient` plus `KeychainTokenStore`.

## Key Entities
- MODEL001 `User`
- MODEL002 `UserSession`
- MODEL004 `ResetPasswordCode`
- MODEL031 `auth.proto`
- MODEL036 user events

## Artifact References
- `feature-list.md` F001
- `user-stories.md` US001-US003
- `screen-list.md` SCR008-SCR011, SCR101-SCR105, SCR201-SCR205
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- `behavior-logic.md` BL001-BL011, BL020-BL024, BL060
- `api-map.md` API001, API018
- `permissions.md` PERM002-PERM008
- Source paths: `examio-fe/src/apis/authApi.ts`, `examio-fe/src/stores/useAuthStore.ts`, `examio-fe/src/apis/api.ts`; backend/mobile exact file paths Needs verification beyond artifact names.
