# SCR008: LoginPage — Screen Spec

**Screen**: SCR008: LoginPage
**Type**: atomic
**Route**: `/login`
**Generated**: 2026-06-06

## Purpose

Unauthenticated users land on this page to sign in with email/password or Google OAuth. Upon success they are redirected to `/k` (or a `?from=` return URL). This is the primary gate for the entire authenticated experience.

## Screen Layout

The page fills the full viewport with a single centered card. The card contains a brand header (logo + title), the email/password form, a Google OAuth button, and a Turnstile bot-protection widget pinned to the bottom. The card is fixed-width (max-w-md) and centered with flexbox on a dot-paper background. No sidebar, no header nav — purely auth-focused. The layout root is `signin-form.tsx:50` (the outer `.min-h-screen.flex` div).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Full-viewport background (static)   │
│  ┌───────────────────────────────────┐  │
│  │ R2: Centered card (max-w-md)     │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │ R2a: Brand header (logo)    │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2b: Email/password form    │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2c: Google OAuth button     │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2d: Register link           │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2e: TurnstileGuard (fixed)  │ │  │
│  │  └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page background | static | no | dot-paper bg via CSS class `landing-dot-paper` | always full-viewport |
| R2 | Auth card | fixed-center | no | card div with gradient overlay | max-w-md, px-4 on mobile |
| R2a | Brand header | static | no | logo img + `h2` title + subtitle | centered |
| R2b | Sign-in form | static | no | `form`, credential input, password input + show/hide toggle | full-width within card |
| R2c | OAuth divider + Google button | static | no | `IconBrandGoogle` button | full-width |
| R2d | Register link | static | no | `Link` to `/register` | centered |
| R2e | TurnstileGuard | static | no | `TurnstileGuard` component | centered at bottom |

## User Flow

### Happy Path

1. Page loads; Turnstile challenge runs and fires `onTokenReady` with a `turnstileToken` string (enables submit/Google buttons).
2. User fills `credential` (email/username/phone) and `password` fields.
3. User clicks **Submit** button (enabled only when `turnstileToken` is non-empty).
4. `handleSubmit` at `signin-form.tsx:28` fires: calls `login({ credential, password, turnstileToken })` from auth store.
5. On success: store sets `isAuthenticated = true`, writes tokens to localStorage/cookies, calls `toast.success("Đăng nhập thành công")`, then `window.location.href` redirects to `redirectTo` or `from` param or `/k`.
6. On error: `toast.error(response.message || "...")` fires; form remains filled; user retries.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Turnstile challenge | `turnstileToken` is empty string | Submit and Google buttons disabled (`disabled={!turnstileToken}`) | `signin-form.tsx:117,134` |
| OAuth path | User clicks Google button | `loginWithGoogle()` → full-page redirect to `${API_URL}/auth/google?redirect=...` | `signin-form.tsx:137`, `useAuthStore.ts:327` |
| Already authenticated | `isAuthenticated === true` at mount | `PublicRoute` redirects to `/k` immediately | `PublicRoute.tsx:16` |
| `from` param present | URL has `?from=...` | On success redirect goes to that path instead of `/k` | `signin-form.tsx:39` |

## Data Inventory

N/A — screen displays no dynamic data. All fields are writable inputs (documented in Validation).

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `PublicRoute` checks `initializing === true` | Spinner placeholder in `LoginPage` via `Suspense` | none | `LoginPage.tsx:10` |
| Turnstile pending | Challenge not yet solved | Submit + Google buttons disabled | Wait for challenge | `signin-form.tsx:117,134` |
| submitting | `login()` in-flight from `useAuthStore` | Button shows default text (no spinner — store uses `loading` flag but buttons are not wired to it) | none | `useAuthStore.ts:81` |
| error | `loginApi` rejects | `toast.error` with server message; form retains values | Retry with corrected credentials | `signin-form.tsx:44` |
| success | `loginApi` resolves with `response.user` | Full-page redirect via `window.location.href` | none | `signin-form.tsx:40` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| credential | text | yes | non-empty (HTML5) | none | browser default "Please fill out this field" |
| password | password | yes | non-empty (HTML5) | none | browser default "Please fill out this field" |

### B) Server-side

#### Email/password login
- **Endpoint:** `POST /auth/login`
- **Request:** `{ credential, password, turnstileToken }`
- **Success:** `200` → store sets auth state, `window.location.href` redirect
- **Errors:** `401` or `400` → `toast.error(response.message || "Đăng nhập thất bại")`; network error → `toast.error((error).message)`
- **Trigger:** Submit button click
- **Source:** `signin-form.tsx:37`, `useAuthStore.ts:83`

#### Google OAuth
- **Endpoint:** `GET /auth/google?redirect=...` (full-page redirect, no fetch)
- **Source:** `useAuthStore.ts:330`

## Interaction Patterns

- **Clicking the eye icon toggles password visibility** — toggles `showPassword` state; input type switches between `text` and `password` — source: `signin-form.tsx:108`
- **Turnstile token expiry disables all submit actions** — `onExpire` callback clears `turnstileToken` → buttons become disabled — source: `signin-form.tsx:157`
- **Forgot password link** navigates to `/forgot-password` — source: `signin-form.tsx:92`
- **Register link** navigates to `/register` — source: `signin-form.tsx:149`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `alt="Examio"` on logo img; `htmlFor` on `<label>` elements; no `role="form"` |
| Keyboard navigation | supported | Tab order: credential → password → toggle → submit → Google → link; `type="button"` prevents form submission on Google OAuth |
| Focus management | unmanaged | No explicit `focus()` calls; `autofocus` not set |
| Screen reader compatibility | supported | Labels linked to inputs via `htmlFor`/`id`; `placeholder` as secondary cue |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isAuthenticated === true` | auth | Redirect to `/k` via `PublicRoute` | Entire page | Consequence: unauthenticated users never see this page |
| `initializing === true` | auth | Loading spinner in `LoginPage` | `SigninForm` | While auth store hydrates from localStorage |
| `!turnstileToken` | feature-flag | Submit + Google buttons disabled | none | Turnstile challenge must complete first |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `PublicRoute` component | auth | Authenticated users are redirected to `/k` — they should not see the login page |
| Turnstile bot protection | auth | Submit and Google buttons remain disabled until valid token; `[UNVERIFIED] server enforcement` — backend `turnstileToken` validation not confirmed by static analysis |

## Source References

- Page/View: `examio-fe/src/pages/auth/LoginPage.tsx:1`
- Form + layout: `examio-fe/src/components/organisms/auth/signin-form.tsx:1`
- Auth store: `examio-fe/src/stores/useAuthStore.ts:1`
- API client: `examio-fe/src/apis/authApi.ts:57`
- Route guard: `examio-fe/src/routes/guards/PublicRoute.tsx:1`
- Router config: `examio-fe/src/routes/index.tsx:113`
