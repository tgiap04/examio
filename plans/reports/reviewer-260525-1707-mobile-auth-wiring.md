# Code Review — Mobile Backend Auth Wiring

**Date:** 2026-05-25  
**Reviewer:** reviewer agent  
**Commit:** eae9d49

---

## Scope

| File | LOC |
|------|-----|
| shared/core/network/ApiEndpoints.kt | 20 |
| shared/core/network/AuthInterceptor.kt | 21 |
| shared/core/session/SessionModels.kt | 22 |
| shared/features/auth/api/AuthApiService.kt | 40 |
| shared/features/auth/models/AuthModels.kt | 51 |
| shared/features/auth/repository/AuthRepository.kt | 65 |
| androidApp/backend/AndroidAppContainer.kt | 23 |
| androidApp/backend/AndroidSecureTokenStorage.kt | 90 |
| androidApp/features/auth/AuthNavGraph.kt | 156 |
| androidApp/ExamioApp.kt | 69 |
| iosApp/Features/Auth/AuthViewModel.swift | 199 |
| **Total** | **~756** |

---

## Overall Assessment

The core wiring is structurally sound: AES-GCM keystore on Android, Keychain on iOS, a clean `SecureTokenStorage` interface, and a reasonable token-refresh fallback in `AuthRepository`. The main risks are a hardcoded localhost URL shipping to production, a token-refresh loop that can silently clear a valid session, a race condition on concurrent requests after token expiry, iOS bypassing the shared KMP layer entirely, and several input-validation gaps that are UI-only.

---

## Critical Issues

### C1 — Hardcoded `http://10.0.2.2:3000` in `AndroidAppContainer` (security / correctness)

```kotlin
// AndroidAppContainer.kt:13
apiBaseUrl = "http://10.0.2.2:3000",
```

`10.0.2.2` is the Android emulator loopback alias. This will silently fail on a real device and will never reach production. There is no build-variant switching (`BuildConfig.API_BASE_URL` or similar). The iOS side has the same problem: `AuthApiClient.baseURL = URL(string: "http://localhost:3000")!` (AuthViewModel.swift:109).

**Fix:** inject the base URL from `BuildConfig` / `Info.plist` / environment at build time. Never hardcode a loopback address in a class that ships in release builds.

---

### C2 — iOS `AuthViewModel` is a completely separate networking stack (trust boundary / maintenance)

`AuthViewModel.swift` contains its own private `AuthApiClient`, its own `KeychainTokenStore`, its own `AuthResponse` model, and its own error types — none of which use the shared KMP `AuthRepository`, `SecureTokenStorage`, or `ApiEndpoints`. This means:

- Endpoint paths can silently diverge from `ApiEndpoints.kt` (already diverged: KMP uses `/auth/register`, iOS uses `/auth/register` — currently matching, but there is no compile-time guarantee).
- Token storage is duplicated: iOS writes to Keychain via `KeychainTokenStore` but there is no corresponding `readTokens()` — the iOS app has no way to attach the bearer token to subsequent API calls. The `AuthInterceptor` / `SecureTokenStorage` pattern exists in KMP but is unused on iOS.
- Any future token refresh, logout, or session invalidation logic added to `AuthRepository` will not apply to iOS.

**Fix:** expose `AuthRepository` to iOS via the KMP framework and delete the private iOS networking stack. If a full KMP migration is deferred, at minimum the iOS `KeychainTokenStore` must implement a `readTokens()` path and wire it into an iOS-side interceptor.

---

### C3 — No token refresh on 401 in `AuthInterceptor` — concurrent requests will all fail after expiry (race condition / auth bypass)

`AuthInterceptor.installOn` attaches the current access token but never handles a 401 response. When the access token expires:

1. All in-flight requests get 401.
2. `AuthRepository.restoreSession()` is only called at app startup, not on 401.
3. There is no mutex around the refresh call, so if multiple requests fire simultaneously after expiry, each will independently attempt a refresh (or fail), leading to multiple `clearTokens()` calls or multiple new tokens being written concurrently.

**Fix:** add a 401-intercept in `AuthInterceptor` that: (a) acquires a `Mutex`, (b) checks whether the token was already refreshed by another coroutine, (c) calls `api.refresh()` once, (d) retries the original request, (e) clears session and signals logout only if refresh also fails.

---

## High Priority

### H1 — `restoreSession` clears tokens on any non-success from `currentUser`, even transient network errors

```kotlin
// AuthRepository.kt:19-30
val currentUser = api.currentUser()
if (currentUser is ApiResult.Success) return currentUser

val refreshed = api.refresh(tokens.refreshToken)
if (refreshed is ApiResult.Success && persistTokens(refreshed.data)) {
    return api.currentUser()
}

tokenStorage.clearTokens()   // <-- fires on NetworkError too
return currentUser
```

If the device is briefly offline when the app opens, `currentUser()` returns `NetworkError`, the refresh also returns `NetworkError`, and `clearTokens()` is called — logging the user out despite having valid stored tokens. The user is silently deauthenticated on a flaky connection.

**Fix:** only call `clearTokens()` when the failure is an `HttpError` with status 401/403, not on `NetworkError`.

```kotlin
tokenStorage.clearTokens()  // only if currentUser or refreshed is HttpError 401/403
```

---

### H2 — `persistTokens` is called via `.also()` on login/signup but its return value is ignored

```kotlin
// AuthRepository.kt:33-36
suspend fun login(...): ApiResult<AuthResponse> =
    api.login(LoginRequest(credential, password)).also(::persistTokens)

suspend fun signup(request: SignupRequest): ApiResult<AuthResponse> =
    api.signup(request).also(::persistTokens)
```

`persistTokens(ApiResult)` returns `Unit` (the overload at line 49). If token persistence fails (e.g., Keystore throws), the caller receives `ApiResult.Success` with no indication that the session was not actually saved. The user sees a successful login but subsequent authenticated requests will have no token.

**Fix:** check the `Boolean` return of `persistTokens(AuthResponse)` and return an error to the caller if it returns `false`.

---

### H3 — `AuthResponse.accessToken` default delegates to `token` at declaration time, not at deserialization time

```kotlin
// AuthModels.kt:22-23
val token: String? = null,
val accessToken: String? = token,
```

In a `@Serializable` data class, `val accessToken: String? = token` captures the value of `token` at the time the default is evaluated — which for kotlinx.serialization is the constructor default, not the deserialized value of `token`. If the backend sends `{"token": "abc"}` with no `accessToken` field, `accessToken` will be `null`, not `"abc"`. The fallback in `persistTokens` (`response.accessToken ?: response.token`) papers over this, but the model itself is misleading and fragile.

**Fix:** remove the default delegation in the model. Keep only the explicit fallback in `persistTokens` and `AuthViewModel.resolvedAccessToken`, which already handle it correctly.

---

### H4 — `safeApiCall` catches raw `Throwable` and maps it to `NetworkError`, swallowing `CancellationException`

```kotlin
// ApiCall.kt:18-19
} catch (error: Throwable) {
    ApiResult.NetworkError(error.message ?: "Unknown error")
}
```

`CancellationException` is a `Throwable`. Catching it here prevents coroutine cancellation from propagating, which breaks structured concurrency — cancelled scopes will not cancel in-flight requests cleanly. This is a well-known Kotlin coroutines pitfall.

**Fix:**
```kotlin
} catch (error: CancellationException) {
    throw error   // always rethrow
} catch (error: Throwable) {
    ApiResult.NetworkError(error.message ?: "Unknown error")
}
```

---

### H5 — `AndroidSecureTokenStorage.decrypt` silently returns `null` on any error

```kotlin
// AndroidSecureTokenStorage.kt:52-59
return runCatching { ... }.getOrNull()
```

A corrupted ciphertext, a Keystore key rotation after a device backup/restore, or an OS-level key invalidation (e.g., after biometric enrollment change) will silently return `null`. `readTokens()` then returns `null` (because `accessToken` is null), which triggers `restoreSession` to return `NetworkError("Chưa có phiên đăng nhập.")` — the user is silently logged out with no diagnostic path.

**Fix:** log the exception (non-PII, just the exception type/message) before returning `null`, and consider calling `clearTokens()` explicitly when decryption fails so stale encrypted blobs are not left in SharedPreferences.

---

## Medium Priority

### M1 — `ExamioApp.kt`: `onAuthenticated` called with nullable `User?`, fallback userId is `"local-session"` (data integrity)

```kotlin
// ExamioApp.kt:60-68
private fun User?.toSession(): UserSession =
    UserSession(
        userId = this?.id ?: "local-session",
        ...
    )
```

`AuthNavGraph` calls `onAuthenticated(result.data.user)` where `result.data.user` is `User?`. A backend that returns a successful auth response without a `user` body will produce a `UserSession` with `userId = "local-session"`. Any downstream feature that uses `userId` for API calls or analytics will silently use a fake ID.

**Fix:** treat a null `user` in a success response as an error. Either require `user` to be non-null in `AuthResponse`, or fail the login flow explicitly when it is absent.

---

### M2 — `AuthNavGraph`: reset password flow passes `email = null` — backend may reject it

```kotlin
// AuthNavGraph.kt:101
authRepository.resetPassword(email = null, code = code, password = password)
```

The `ResetPasswordRequest` serializes `email` as `null`. Whether the backend accepts a null email depends on its validation. The forgot-password screen collects an email but does not pass it through to the reset screen. If the backend requires email for reset, this will always return an error that is indistinguishable from a network failure at the UI layer.

**Fix:** thread the email from `ForgotPasswordScreen` through to `ResetPasswordScreen`, or confirm the backend accepts null email and document it.

---

### M3 — Input validation is UI-only, not enforced at repository boundary

All validation (`credential.isBlank()`, `password.length < 6`, `email.contains("@")`) lives in `AuthNavGraph.kt` and `AuthViewModel.swift`. `AuthRepository` accepts any string. If the repository is ever called from a different entry point (deep link, test, future screen), invalid data reaches the network layer unchecked.

**Fix:** add lightweight validation in `AuthRepository.login` / `signup` or in the request model constructors. The UI validation can remain for UX, but the repository should be the authoritative gate.

---

### M4 — `AuthInterceptor` reads tokens on every request with no caching (performance)

`tokenStorage.readTokens()` is called for every HTTP request. `AndroidSecureTokenStorage.readTokens()` decrypts from SharedPreferences + Android Keystore on each call — this involves JNI, crypto operations, and disk I/O. Under normal usage (multiple API calls per screen) this adds measurable latency.

**Fix:** cache the decrypted `SessionTokens` in memory after first read; invalidate the cache only on `saveTokens` / `clearTokens`.

---

### M5 — `HttpClientFactory` logs at `LogLevel.INFO` unconditionally — tokens may appear in logs

```kotlin
install(Logging) { level = LogLevel.INFO }
```

Ktor's `LogLevel.INFO` logs request URLs and response status codes. `LogLevel.HEADERS` or `LogLevel.BODY` would log the `Authorization` header. The current level is safe, but there is no build-variant guard — if someone bumps this to `HEADERS` or `BODY` for debugging and forgets to revert, bearer tokens will appear in logcat on production builds.

**Fix:** gate the log level on `BuildConfig.DEBUG`:
```kotlin
install(Logging) { level = if (config.environmentName == "local") LogLevel.INFO else LogLevel.NONE }
```

---

### M6 — `expect fun createSecureTokenStorage()` declared but never used in the reviewed wiring

`SecureTokenStorage.kt` declares `expect fun createSecureTokenStorage(): SecureTokenStorage`. `AndroidAppContainer` instantiates `AndroidSecureTokenStorage` directly, bypassing this expect/actual mechanism. If an iOS `actual` implementation exists, it is not wired into `AuthViewModel` (which uses its own private `KeychainTokenStore`). The expect/actual contract is dead code in the current wiring.

**Fix:** either use the expect/actual pattern consistently (wire it into `HttpClientFactory` and `AuthRepository`) or remove the `expect` declaration to avoid confusion.

---

## Low Priority

### L1 — `UserRole` defined in two places with identical values

`com.examio.app.core.session.UserRole` (SessionModels.kt) and `com.examio.app.features.navigation.UserRole` (AuthState.kt) are identical enums. `ExamioApp.kt` imports the navigation one and compares `.name` strings against the auth model one — a fragile string comparison that will silently break if either enum is renamed.

**Fix:** consolidate to one `UserRole` definition, or use the auth model's `UserRole` directly in navigation state.

---

### L2 — `RefreshTokenRequest(refreshToken: String? = null)` — nullable refresh token sent to backend

If `tokens.refreshToken` is null (e.g., backend did not return one at login), `api.refresh(null)` sends `{"refreshToken": null}`. The backend will likely reject this, but the error path in `restoreSession` then clears tokens (see H1). Defensive check before calling refresh would make the intent explicit.

---

### L3 — `AndroidAppContainer` uses `context.applicationContext` correctly, but `HttpClient` is never closed

`HttpClient` holds a connection pool. `AndroidAppContainer` is instantiated in `Application.onCreate` (presumably) and lives for the app lifetime — acceptable. But if the container is ever recreated (e.g., in tests), the old client leaks. No `Closeable` / `AutoCloseable` implementation.

---

## Edge Cases Found

- **Keystore key invalidation after biometric change:** Android Keystore keys created without `setUserAuthenticationRequired(true)` survive biometric enrollment changes, so this is not a current issue — but worth documenting since adding biometric auth later would require `setUserAuthenticationRequired` and would invalidate existing keys, silently logging out all users on upgrade.
- **Concurrent login attempts:** `AuthNavGraph` disables the button via `isLoading` state, but two rapid taps before the first recompose could launch two coroutines. Both would call `persistTokens`, writing tokens twice — harmless but wasteful. A `Mutex` in the repository would be cleaner.
- **Reset password without prior forgot-password:** `AuthNavGraph` allows navigating directly to `ResetPasswordScreen` via `onResetPassword` callback without having gone through `ForgotPasswordScreen`. The user would have no code to enter.
- **iOS app cold-start auth state:** `ContentView` checks `authViewModel.isAuthenticated` which starts as `false`. There is no `restoreSession()` call on iOS — every cold start shows the login screen even if a valid Keychain token exists.

---

## Positive Observations

- AES-256-GCM with Android Keystore, randomized IV per encryption, correct GCM tag size (128 bits) — solid crypto choices.
- `safeApiCall` wrapper cleanly centralizes error mapping; the `sealed interface ApiResult` is expressive and exhaustive.
- `AuthRepository` correctly clears tokens on logout regardless of API result.
- `expectSuccess = true` on the Ktor client means 4xx/5xx always throw, preventing silent success on error responses.
- `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` on iOS Keychain items is the correct accessibility level for session tokens.
- `ignoreUnknownKeys = true` on the JSON deserializer prevents crashes on backend schema additions.

---

## Recommended Actions (priority order)

1. **(C1)** Replace hardcoded loopback URLs with build-config-injected values on both Android and iOS.
2. **(C2)** Wire iOS through the KMP `AuthRepository` / `SecureTokenStorage`, or add a `readTokens()` path and bearer-token interceptor to the iOS-native stack. Add a cold-start `restoreSession()` call in `ContentView`.
3. **(C3)** Add 401-intercept with mutex-guarded refresh in `AuthInterceptor`.
4. **(H1)** Guard `clearTokens()` in `restoreSession` — only clear on 401/403, not on `NetworkError`.
5. **(H2)** Surface token-persistence failure as an error result from `login`/`signup`.
6. **(H4)** Rethrow `CancellationException` in `safeApiCall`.
7. **(H3)** Remove the `accessToken = token` default delegation in `AuthResponse`.
8. **(M1)** Treat null `user` in a success auth response as a login failure.
9. **(M2)** Thread email through to the reset-password screen or confirm backend accepts null.
10. **(M4)** Cache decrypted tokens in memory in `AuthInterceptor` / `AndroidSecureTokenStorage`.

---

## Metrics

- Type coverage: strong on KMP (sealed types, no `Any`); iOS uses private structs with optional fields — adequate
- Test coverage: 0 tests observed for any auth path (no test files found under `examio-app/`)
- Linting issues: not run (no lint config found in scope)

---

## Unresolved Questions

1. Does the backend's `/auth/reset-password` require `email` in the request body, or is `code` alone sufficient?
2. Is there an iOS `actual` implementation of `createSecureTokenStorage()`? If so, where, and why is it not wired?
3. What is the intended app-startup flow for session restore on Android? `restoreSession()` exists but no call site was found in the reviewed files — is it called from an `Application` subclass or a splash screen not in scope?
4. Are there plans to add biometric unlock? If so, the Keystore key spec will need `setUserAuthenticationRequired(true)`, which will invalidate all existing encrypted tokens on upgrade.
