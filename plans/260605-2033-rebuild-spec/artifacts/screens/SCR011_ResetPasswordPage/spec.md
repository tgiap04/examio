# SCR011: ResetPasswordPage — Screen Spec

**Screen**: SCR011: ResetPasswordPage
**Type**: atomic
**Route**: `/reset-password`
**Generated**: 2026-06-06

## Purpose

A user who already has a reset code (sent to their email via ForgotPasswordPage) lands here to set a new password. They enter the 6-digit OTP, a new password, and confirmation — the page validates both client-side and server-side before updating the account.

## Screen Layout

Full-viewport centered card on a dot-paper background. The card contains a Lock icon header, a title and description, the ResetPasswordForm (email pre-filled from query param, OTP input, new password + confirm), and a back-to-login link. The form occupies the main region; success state replaces it with a confirmation panel. The layout root is `ResetPasswordPage.tsx:156` (`.flex.min-h-screen`).

### Layout Sketch

```
┌─────────────────────────────────────────┐
│ R1: Full-viewport background (static)   │
│  ┌───────────────────────────────────┐  │
│  │ R2: Centered card (max-w-md)     │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │ R2a: Lock icon + title      │ │  │
│  │  ├─────────────────────────────┤ │  │
│  │  │ R2b: ResetPasswordForm OR    │ │  │
│  │  │      success confirmation    │ │  │
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
| R2a | Icon + heading | static | no | Lock icon + `h1` + `p` description | centered |
| R2b | ResetPasswordForm / success panel | static | no | Controlled by `success` state: `form` or success `div` | full-width within card |
| R2c | Back-to-login link | static | no | `Link` to `/login` | centered |

## User Flow

### Happy Path

1. Page loads; `useSearchParams` extracts `email` from query string and pre-fills the email field (read-only unless user clears it). OTP input shows 6 empty slots.
2. User reads the reset code from their email, enters it in the OTP slot group (3+3 layout).
3. User types a new password and confirms it.
4. User clicks **Submit** (enabled when `loading === false` and `newPassword === confirmPassword`).
5. `handleSubmit` at `ResetPasswordPage.tsx:26` fires: checks `newPassword === confirmPassword` client-side; if not, early return.
6. Calls `resetPassword({ email, code, newPassword })` from auth store.
7. On success: `toast.success(response.message)`, `success = true`; success panel shows checkmark + "redirecting" message.
8. After 2 seconds (`setTimeout`), `navigate("/login")` redirects back to login.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Password mismatch | `newPassword !== confirmPassword` | Early return on submit; inline error message below confirm field | `ResetPasswordPage.tsx:28`, `ResetPasswordPage.tsx:130` |
| Empty email | Submit with empty email | Browser default validation fires (HTML5 `required`) | `ResetPasswordPage.tsx:65` |
| Empty OTP | Submit with empty `code` | Browser default validation fires (HTML5 `required`) | `ResetPasswordPage.tsx:75` |
| API error | `resetPassword` throws | `toast.error` fires; form retains all values | `ResetPasswordPage.tsx:35` |
| Already authenticated | `isAuthenticated === true` at mount | `PublicRoute` redirects to `/k` | `PublicRoute.tsx:16` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| email | (label: email) | route query param (`useSearchParams`) | raw string | empty string (pre-fill) | N/A |

All other fields are writable inputs (documented in Validation).

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `PublicRoute` checks `initializing === true` | Spinner placeholder via `Suspense` on `AuthLayout` | none | `AuthLayout` wrapping |
| submitting | `resetPassword()` in-flight | Submit button shows `Loader2` spinner + `t("reset.processing")`; button disabled | none | `ResetPasswordPage.tsx:140` |
| success | `resetPasswordApi` resolves | Form replaced by success panel: green checkmark + "redirecting" text | none (auto-redirects after 2s) | `ResetPasswordPage.tsx:39` |
| error | `resetPasswordApi` rejects | `toast.error` fires; form retains all values | Retry | `ResetPasswordPage.tsx:35` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| email | email | yes | non-empty (HTML5 `required`) | none | browser default |
| code | OTP (6-char string) | yes | non-empty (HTML5 `required`) | none | browser default |
| newPassword | password | yes | `minLength=6` (HTML5 attribute) | none | browser default |
| confirmPassword | password | yes | must equal `newPassword`; inline `if` check at `ResetPasswordPage.tsx:28` | none | `t("reset.passwordMismatch")` via inline `<p>` below field |

### B) Server-side

#### Reset password
- **Endpoint:** `POST /auth/reset-password`
- **Request:** `{ email, code, newPassword }`
- **Success:** `200` → `toast.success(response.message)`, `success = true`, 2s redirect to `/login`
- **Errors:** `400` / `401` / etc. → `toast.error((error).message || "Đặt lại mật khẩu thất bại")`
- **Trigger:** Submit button click
- **Source:** `ResetPasswordPage.tsx:31`, `useAuthStore.ts:194`

## Interaction Patterns

- **Clicking the eye icon toggles password visibility** — toggles `showPassword` state; both `newPassword` and `confirmPassword` share the same toggle — source: `ResetPasswordPage.tsx:108`
- **Back-to-login link** navigates to `/login` — source: `ResetPasswordPage.tsx:182`
- **Auto-redirect on success** — 2-second `setTimeout` triggers `navigate("/login")` after success panel — source: `ResetPasswordPage.tsx:33`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `id`/`htmlFor` on all labels; `alt="Examio"` on logo; no `role="form"` |
| Keyboard navigation | supported | Tab order: email → OTP slots → newPassword → confirmPassword → toggle → submit → back-to-login |
| Focus management | unmanaged | No explicit `focus()` calls; OTP slots are custom components without native tab behavior |
| Screen reader compatibility | supported | Labels linked via `htmlFor`/`id`; OTP group uses `InputOTP` from Ant Design |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `isAuthenticated === true` | auth | Redirect to `/k` via `PublicRoute` | Entire page | Consequence: authenticated users never see this page |
| `initializing === true` | auth | Loading spinner in `AuthLayout` | `ResetPasswordPage` content | While auth store hydrates |
| `success === true` | state | Success panel replaces `ResetPasswordForm` | Form | After `resetPasswordApi` resolves |
| `loading === true` | state | Submit button shows spinner + "Processing..." text | none | While `resetPassword` in-flight |
| `confirmPassword && newPassword !== confirmPassword` | state | Inline error `<p>` below confirm field | none | Live check as user types |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `PublicRoute` component | auth | Authenticated users are redirected to `/k` — they should not access the reset flow |

## Source References

- Page/View: `examio-fe/src/pages/auth/ResetPasswordPage.tsx:1`
- Auth store: `examio-fe/src/stores/useAuthStore.ts:191`
- API client: `examio-fe/src/apis/authApi.ts:81`
- Route guard: `examio-fe/src/routes/guards/PublicRoute.tsx:1`
- Router config: `examio-fe/src/routes/index.tsx:143`