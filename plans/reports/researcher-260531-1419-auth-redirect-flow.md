# Auth Redirect Flow Research Report

**Date:** 2026-05-31
**Scope:** kmaedu-fe auth redirect mechanisms (localStorage vs URL params)

---

## 1. `setRedirectBackTarget` — All Call Sites

**Two call sites found:**

### a) `ProtectedRoute.tsx:19-21`
```ts
const returnTo = `${location.pathname}${location.search}${location.hash}`;
setRedirectBackTarget(returnTo); // writes to localStorage
return <Navigate to={`/login?from=${encodeURIComponent(returnTo)}`} replace />;
```
Stores `returnTo` in localStorage (`auth_return_to` key), THEN writes the same value as `?from=` URL param. Redundant but harmless.

### b) `api.ts:39-43` (inside `handleAuthFailure`)
```ts
if (window.location.pathname !== "/login") {
  setRedirectBackTarget(getCurrentReturnPath()); // writes localStorage
  clearRedirectBackTarget();                     // BUG: immediately clears it!
  navigateTo("/login", true);
}
```
**BUG:** `setRedirectBackTarget` is called then immediately `clearRedirectBackTarget()` — localStorage is cleared, so the redirect target is lost. This is a no-op for localStorage.

---

## 2. `getRedirectBackTarget()` vs `searchParams.get("from")` in SigninForm

**`SigninForm` (`signin-form.tsx:30-39`):**
```ts
const [searchParams] = useSearchParams();
// ...
const from = searchParams.get("from");
const response = await login({ credential, password });
if (response?.user) {
  const targetPath = response.redirectTo || from || "/k";
  window.location.href = targetPath;
}
```
Priority: `response.redirectTo` (from store → from localStorage) **>** `?from=` URL param **>** fallback `/k`.

**`useAuthStore.login` / `signup`:** Both call `getRedirectBackTarget()` from localStorage (lines 102, 147) and `clearRedirectBackTarget()`. So credentials-based login respects localStorage. The `?from=` in SigninForm is the **fallback** if localStorage is empty.

---

## 3. `loginWithGoogle()` Respects `?from=` URL Param

**`useAuthStore.ts:327-331`:**
```ts
loginWithGoogle: async () => {
  const redirectPath = getOAuthRedirectPath(); // reads ?from= param
  const redirect = encodeURIComponent(redirectPath);
  window.location.href = `${env.apiUrl}/auth/google?redirect=${redirect}`;
},
```

`getOAuthRedirectPath()` (lines 52–72): checks `?from=` first, falls back to current path (unless on an auth path → defaults to `/k`). So Google OAuth **does** forward `?from=`.

---

## 4. SignupForm Reads `?from=` URL Param?

**No.** `SignupForm` does not call `useSearchParams` or read `?from=`. Post-registration redirect is:
```ts
window.location.href = response.redirectTo || "/k";
```
`response.redirectTo` comes from `getRedirectBackTarget()` in the store. Since `ProtectedRoute` stores localStorage AND passes `?from=`, a user arriving at `/register?from=/k/manage-exam` will have their return path in localStorage (set by ProtectedRoute before redirecting to `/register`). **This works correctly**, but the URL param is never read by SignupForm directly.

---

## 5. OAuth Redirect Path Logic (`getOAuthRedirectPath`)

```ts
function getOAuthRedirectPath() {
  const currentPath = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get("from");

  if (fromParam) return fromParam;              // ?from= wins
  const authPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
  if (authPaths.some((path) => currentPath.startsWith(path))) return "/k";
  return currentPath;                          // stay on current page
}
```

Correctly prioritizes `?from=` over current path. However, the backend OAuth handler is responsible for actually performing this redirect after the OAuth callback — worth verifying the backend decodes and uses the `redirect` query param correctly.

---

## 6. `useAuthSync` Hook

**`useAuthSync.ts:50-112`**

Init flow on every mount:
1. Reads `token`, `refreshToken`, `sessionId` from URL search params (OAuth callback tokens embedded in URL) → strips them from URL via `replaceState`
2. Syncs token to cookie (`AUTH_COOKIE_NAME`) for server-side/browser compatibility
3. Calls `getUser()` to validate token with backend
4. If no token but `sessionId` exists without `refreshToken` → calls `syncRefreshTokenApi(sessionId)` to recover refresh token silently

No redirect logic. Purely token hydration from URL + localStorage to cookie + user validation.

---

## 7. Axios 401 Interceptor

**`api.ts:105-155`**

- **401 on a tracked request:** attempts token refresh via `refreshAccessToken()` (singleton promise). On success, retries original request. On failure → `handleAuthFailure()`.
- **`SESSION_INVALIDATED` (401 + code):** clears all tokens, `clearRedirectBackTarget()`, `setRedirectBackTarget(getCurrentReturnPath())` (correctly preserves return path), then `navigateTo("/login", true)`.
- **`SESSION_EXPIRED` (401 + code):** calls `handleAuthFailure()` — which has the bug (sets then clears localStorage immediately).

**Bug summary for `handleAuthFailure()` (`api.ts:30-44`):**
```ts
function handleAuthFailure() {
  clearAuthToken();
  clearStoredRefreshToken();
  clearStoredSessionId();
  if (window.location.pathname !== "/login") {
    setRedirectBackTarget(getCurrentReturnPath()); // writes
    clearRedirectBackTarget();                     // immediately wipes — NO-OP
    navigateTo("/login", true);
  }
}
```

---

## Summary Table

| Flow | localStorage (`auth_return_to`) | `?from=` URL param |
|---|---|---|
| ProtectedRoute → Login | Writes (line 20) | Writes (line 21) |
| SigninForm credentials | Reads via store `getRedirectBackTarget()` | Reads as fallback (line 35) |
| SignupForm | Reads via store (set by ProtectedRoute) | **Not read** |
| loginWithGoogle | N/A | Reads via `getOAuthRedirectPath()` → passes to backend |
| api.ts `handleAuthFailure` | **BUG: set then clear, no-op** | Not set |

---

## Bugs Found

1. **`api.ts:41` — `handleAuthFailure` clears localStorage immediately after setting it.** The intended redirect-back target is lost. Affects all 401 refresh failures with code `SESSION_EXPIRED`.

2. **`SESSION_INVALIDATED` path (api.ts:140-148)** correctly sets `setRedirectBackTarget` but **does not** also write `?from=` to the navigate URL. The localStorage value will be cleared by ProtectedRoute if the user hits `/login` while already authenticated — race condition risk.

3. **`PublicRoute.tsx`** hardcodes redirect to `/k` on authenticated access, ignoring any `?from=` param that may have been in the URL. Low risk but inconsistent.

---

## Unresolved Questions

1. Does the backend OAuth handler (`/auth/google`) actually use the `redirect` query param to send the user back to the intended page after the OAuth callback, or does it ignore it and use its own post-login redirect?
2. Does the OAuth callback URL (`/login/google/callback` or similar) also preserve `?from=` for the Google OAuth credential flow, or only `loginWithGoogle()` from the frontend?
3. The `/study-flashcard/:id` and `/exam-session/:id` routes are **not wrapped in `ProtectedRoute`** — are they public routes that gate access server-side, or is there a security gap?
