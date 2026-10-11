# SCR009: RegisterPage — Screen Spec

**Screen**: SCR009: RegisterPage
**Type**: atomic
**Route**: `/register`
**Generated**: 2026-06-06

## Purpose

New visitors create an account on this page by providing a username, email, and password. On success the user is automatically signed in and redirected to `/k`.

## Screen Layout

Full-viewport centered layout with a single card. The card contains a brand header (logo + welcome title), the registration form (username, email, password, confirm password), and a Google OAuth button. A divider separates the OAuth section from the form. A link to login is at the bottom. The layout root is `signup-form.tsx:76` (`.min-h-screen.flex`).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Full-viewport background (static)   │
│  ┌───────────────────────────────────┐  │
│  │ R2: Centered card (max-w-md)     │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │ R2a: Brand header (logo)    │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2b: Registration form       │ │  │
│  │  │   username / email / pwd /   │ │  │
│  │  │   confirmPassword fields     │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2c: Submit button           │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2d: OAuth divider + Google   │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2e: Login link               │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page background | static | no | `landing-dot-paper` CSS class | always full-viewport |
| R2 | Auth card | fixed-center | no | card div with gradient overlay, blur effect | max-w-md, px-4 on mobile |
| R2a | Brand header | static | no | logo img + `h2` + `h1` title | centered |
| R2b | Registration form | static | no | 4 `LabelInputContainer` wrappers with `Input` components | full-width within card |
| R2c | Submit button | static | no | `type="submit"` button | full-width |
| R2d | OAuth divider + Google button | static | no | `hr` dividers + `IconBrandGoogle` button | full-width |
| R2e | Login link | static | no | `Link` to `/login` | centered |

## User Flow

### Happy Path

1. User fills `username`, `email`, `password`, and `confirmPassword` fields.
2. User clicks **Submit**.
3. `handleSubmit` at `signup-form.tsx:44` fires: extracts form fields via `FormData`, checks `password === confirmPassword` client-side; if mismatch shows `toast.warning(t("signup.passwordMismatch"))` and returns early.
4. Calls `signup({ username, email, password })` from auth store.
5. On success: store sets auth state, writes tokens, calls `toast.success(response.message)`, then `window.location.href` redirects to `from` param or `response.redirectTo` or `/k`.
6. On error: `toast.error(...)` fires; form remains filled; user retries.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Password mismatch | `password !== confirmPassword` | `toast.warning` fires; no API call; form retains values | `signup-form.tsx:52` |
| OAuth path | User clicks Google button | `loginWithGoogle()` → full-page redirect to Google OAuth | `signup-form.tsx:173` |
| Already authenticated | `isAuthenticated === true` at mount | `PublicRoute` redirects to `/k` | `PublicRoute.tsx:16` |

## Data Inventory

N/A — screen displays no dynamic data. All fields are writable inputs (documented in Validation).

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `PublicRoute` checks `initializing === true` | Spinner placeholder in `RegisterPage` via `Suspense` | none | `RegisterPage.tsx` (Suspense wraps SignupForm) |
| submitting | `signup()` in-flight | Button shows default text (no spinner wired to store `loading`) | none | `useAuthStore.ts:125` |
| password mismatch | client-side check fires | `toast.warning` inline, no API call | Correct password | `signup-form.tsx:52` |
| error | `signupApi` rejects | `toast.error` with server message; form retains values | Retry | `signup-form.tsx:70` |
| success | `signupApi` resolves with `response.user` | Full-page redirect via `window.location.href` | none | `signup-form.tsx:66` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| username | text | yes | non-empty (HTML5) | none | browser default "Please fill out this field" |
| email | email | yes | valid email format (HTML5 `type="email"`) | none | browser default |
| password | password | yes | non-empty (HTML5) | none | browser default |
| confirmPassword | password | yes | must equal `password` value | none | `t("signup.passwordMismatch")` via toast |

### B) Server-side

#### Account registration
- **Endpoint:** `POST /auth/register`
- **Request:** `{ username, email, password }`
- **Success:** `200` → store sets auth state, `window.location.href` redirect
- **Errors:** `400` / `409` / etc. → `toast.error(response.message || "Đăng ký tài khoản thất bại")`; network error → `toast.error((error).message)`
- **Trigger:** Submit button click
- **Source:** `signup-form.tsx:58`, `useAuthStore.ts:128`

#### Google OAuth
- **Endpoint:** `GET /auth/google?redirect=...` (full-page redirect, no fetch)
- **Source:** `useAuthStore.ts:330`

## Interaction Patterns

- **Login link** navigates to `/login` — source: `signup-form.tsx:183`
- **Google button click** triggers OAuth redirect — source: `signup-form.tsx:173`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `alt="KMAEdu"` on logo; `htmlFor` on `<Label>` elements; no `role="form"` |
| Keyboard navigation | supported | Tab order: username → email → password → confirmPassword → toggle → submit → Google → link |
| Focus management | unmanaged | No explicit `focus()` calls; `autofocus` not set |
| Screen reader compatibility | supported | Labels linked via `htmlFor`/`id`; `placeholder` as secondary cue |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isAuthenticated === true` | auth | Redirect to `/k` via `PublicRoute` | Entire page | Consequence: authenticated users never see this page |
| `initializing === true` | auth | Loading spinner in `RegisterPage` | `SignupForm` | While auth store hydrates |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `PublicRoute` component | auth | Authenticated users are redirected to `/k` — they should not see the registration page |

## Source References

- Page/View: `kmaedu-fe/src/pages/auth/RegisterPage.tsx:1`
- Form + layout: `kmaedu-fe/src/components/organisms/auth/signup-form.tsx:1`
- Auth store: `kmaedu-fe/src/stores/useAuthStore.ts:1`
- API client: `kmaedu-fe/src/apis/authApi.ts:64`
- Route guard: `kmaedu-fe/src/routes/guards/PublicRoute.tsx:1`
- Router config: `kmaedu-fe/src/routes/index.tsx:123`
