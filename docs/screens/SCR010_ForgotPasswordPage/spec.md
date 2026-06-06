# SCR010: ForgotPasswordPage — Screen Spec

**Screen**: SCR010: ForgotPasswordPage
**Type**: atomic
**Route**: `/forgot-password`
**Generated**: 2026-06-06

## Purpose

A user who has forgotten their password visits this page to request a reset code sent to their registered email. They enter their email, the backend sends a 6-digit OTP, and the page auto-navigates to `/reset-password?email=...` on success.

## Screen Layout

Full-viewport centered card on a dot-paper background. The card contains a brand icon (Mail icon), a title and description, and either the email input form or a success confirmation panel depending on state. A back-to-login link sits at the bottom. The layout root is `ForgotPasswordPage.tsx:30` (`.flex.min-h-screen`).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Full-viewport background (static)   │
│  ┌───────────────────────────────────┐  │
│  │ R2: Centered card (max-w-md)     │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │ R2a: Icon + title + desc    │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2b: Email form OR           │ │  │
│  │  │      success panel           │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2c: Back-to-login link      │ │  │
│  │  └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Page background | static | no | `landing-dot-paper` CSS class | always full-viewport |
| R2 | Auth card | fixed-center | no | card div with border, shadow, rounded corners | max-w-md, px-4 on mobile |
| R2a | Icon + heading | static | no | Mail icon + `h1` + `p` description | centered |
| R2b | Email form / success panel | static | no | Controlled by `sent` state: `form` or success `div` | full-width within card |
| R2c | Back-to-login link | static | no | `Link` to `/login` | centered |

## User Flow

### Happy Path

1. Page loads with `sent = false`; email input form is shown.
2. User types their email address into the `email` field.
3. User clicks **Submit** (enabled when `email` is non-empty and store `loading` is false).
4. `handleSubmit` at `ForgotPasswordPage.tsx:14` fires: calls `sendCodeResetPassword({ email })` from auth store.
5. On success: store calls `toast.success(response.message)`, component sets `sent = true`, shows success panel with green checkmark and "sent" message.
6. After 2 seconds (`setTimeout` at `ForgotPasswordPage.tsx:21`), `navigate(`/reset-password?email=...`)` redirects to ResetPasswordPage with email pre-filled via query param.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| API error | `sendCodeResetPassword` throws | `toast.error` fires; form remains filled; user retries | `ForgotPasswordPage.tsx:24` |
| Empty email | `!email.trim()` on submit | Early return; no API call; browser default "required" validation fires | `ForgotPasswordPage.tsx:16` |
| Already authenticated | `isAuthenticated === true` at mount | `PublicRoute` redirects to `/k` | `PublicRoute.tsx:16` |

## Data Inventory

N/A — screen displays no dynamic data. Email is a writable input (documented in Validation).

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `PublicRoute` checks `initializing === true` | Spinner placeholder via `Suspense` on `AuthLayout` | none | `AuthLayout` wrapping |
| submitting | `sendCodeResetPassword()` in-flight | Submit button shows `Loader2` spinner + `t("forgot.sending")`; button disabled | none | `ForgotPasswordPage.tsx:77` |
| sent | `sendCodeResetPassword` resolves | Form replaced by success panel: green checkmark + confirmation text | none (auto-redirects after 2s) | `ForgotPasswordPage.tsx:45` |
| error | `sendCodeResetPassword` rejects | `toast.error` fires; form retains email value | Retry with corrected email | `ForgotPasswordPage.tsx:24` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| email | email | yes | non-empty (HTML5 `required`) | none | browser default "Please fill out this field" |

### B) Server-side

#### Send reset code
- **Endpoint:** `POST /auth/send-code-reset-password`
- **Request:** `{ email }`
- **Success:** `200` → `toast.success(response.message)`, `sent = true`, 2s redirect to `/reset-password?email=...`
- **Errors:** `404` / `400` / etc. → `toast.error((error).message || "Có lỗi quên mật khẩu")`
- **Trigger:** Submit button click
- **Source:** `ForgotPasswordPage.tsx:19`, `useAuthStore.ts:175`

## Interaction Patterns

- **Back-to-login link** navigates to `/login` — source: `ForgotPasswordPage.tsx:90`
- **Auto-redirect on success** — 2-second `setTimeout` triggers `navigate` to ResetPasswordPage with email in query string — source: `ForgotPasswordPage.tsx:22`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `id="email"` on input; `htmlFor="email"` on label; no `role="form"` |
| Keyboard navigation | supported | Tab order: email → submit → back-to-login link |
| Focus management | unmanaged | No explicit `focus()` calls |
| Screen reader compatibility | supported | Label linked to input via `htmlFor`/`id` |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isAuthenticated === true` | auth | Redirect to `/k` via `PublicRoute` | Entire page | Consequence: authenticated users never see this page |
| `initializing === true` | auth | Loading spinner in `AuthLayout` | `ForgotPasswordPage` content | While auth store hydrates |
| `sent === true` | state | Success panel replaces email form | Email form | After successful API call |
| `loading === true` | state | Submit button shows spinner + "Sending..." text | none | While `sendCodeResetPassword` in-flight |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `PublicRoute` component | auth | Authenticated users are redirected to `/k` — they should not see the password reset request page |

## Source References

- Page/View: `examio-fe/src/pages/auth/ForgotPasswordPage.tsx:1`
- Auth store: `examio-fe/src/stores/useAuthStore.ts:172`
- API client: `examio-fe/src/apis/authApi.ts:71`
- Route guard: `examio-fe/src/routes/guards/PublicRoute.tsx:1`
- Router config: `examio-fe/src/routes/index.tsx:133`
