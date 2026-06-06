# SCR014_VerifyPage — Screen Spec

**Screen**: SCR014: VerifyPage
**Type**: atomic
**Route**: `/k/verify`
**Generated**: 2026-06-06

## Purpose

Newly registered users enter the 6-digit OTP sent to their email to activate their account. Unverified users who log in are redirected here automatically; verified users see a success confirmation and can return to the home page.

---

## Screen Layout

The page renders a centered single-card layout inside a full-height flex container. The card is fixed-width on mobile (`w-full max-w-md`) and vertically centered. No persistent header or sidebar is present — the entire viewport is the centering wrapper. The card contains either the OTP form or a success state, with a back-link footer below the card. (source: `VerifyPage.tsx:77`)

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: Full-viewport centering wrapper     │
│      (min-h-[60vh] flex items-center)    │
│  ┌─────────────────────────────────────┐ │
│  │ R2: Card —  max-w-md, p-8, shadow-xl │ │
│  │   Header: ShieldCheck icon + title   │ │
│  │   Email hint: user.email            │ │
│  │   Auto-sent notice (if applicable)   │ │
│  │   [Form | Success state]             │ │
│  │   Resend link                        │ │
│  │   ──────────────────────────────    │ │
│  │   Back-link footer                   │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Viewport Wrapper | static | no | Card container | Always centered, no scroll |
| R2 | Card | static | no | Header, auto-sent notice, form/success, resend link, back-link | `max-w-md` fixed; padding scales from `p-4` (mobile) to `p-8` (desktop) |

---

## User Flow

### Happy Path

1. User lands on `/k/verify`; `useEffect` checks `user && !user.isVerified`; if true, `sendVerificationEmail()` fires automatically and `autoSentEmail` state becomes `true`. R2: auto-sent notice
2. User opens email, reads 6-digit OTP; enters digits into `InputOTP` component. R2: form
3. User clicks "Xác minh" button (enabled when `code.length === 6`); `verifyAccount(code)` API call fires; on success `setSuccess(true)`. R2: success state
4. 2-second countdown fires; `navigate("/k", { replace: true })` redirects to dashboard. R2 → new screen

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `user.isVerified === true` on mount | profile check | Full-page "Tài khoản đã được xác minh!" success card with green icon + back-to-home CTA | `VerifyPage.tsx:54` |
| `user` is null on mount | auth state | `sendVerificationEmail` not called; form shown without auto-sent notice | `VerifyPage.tsx:21` |
| `user.isVerified === false` but `user` is null | edge case | `sendVerificationEmail` not called | `VerifyPage.tsx:21` |
| OTP length < 6 | `code.length < 6` | Submit button disabled | `VerifyPage.tsx:132` |
| `autoSentEmail` throws | `sendVerificationEmail` rejects | `console.error`; no UI change (silent failure) | `VerifyPage.tsx:25` |
| `verifyAccount` throws | API rejects | `console.error`; no user-visible error shown (silent failure) | `VerifyPage.tsx:42` |
| User clicks "Gửi lại mã xác minh" | resend button click | `sendVerificationEmail` fires again; [UNVERIFIED] no confirmation UI | `VerifyPage.tsx:148` |
| User clicks "Quay lại trang chủ" | back-link click | Navigate to `/k` | `VerifyPage.tsx:157` |

---

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `user.email` | Email hint | store state | raw string shown in parentheses | not rendered if user is null | MODEL-001.email |
| `code` | Mã xác minh | local state | 6-digit string | empty input shown | MODEL-003.code |
| `autoSentEmail` | Auto-sent notice | local state | boolean — renders notice banner | not shown | N/A |
| `success` | Success state | local state | boolean — renders success block | not shown | N/A |

---

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `verifyAccount` in-flight | Button shows `<Loader2>` + "Đang xác minh..."; form inputs disabled | none | `VerifyPage.tsx:136` |
| success | `verifyAccount` resolves | Green check icon + "Xác minh thành công!" + "Đang chuyển hướng..." text | none (auto-redirects after 2 s) | `VerifyPage.tsx:98` |
| auto-sent | `sendVerificationEmail` on mount resolves | Red banner: "Email xác minh đã được gửi tự động..." | none | `VerifyPage.tsx:89` |
| already-verified | `user.isVerified === true` | Full-page success card (separate layout, not inside main card) | "Quay lại trang chủ" CTA | `VerifyPage.tsx:56` |
| submitting | `sendVerificationEmail` (resend) in-flight | Resend button disabled + spinner | none | `VerifyPage.tsx:148` |

---

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| code | OTP | yes | exact 6 digits, `code.length === 6` | none | implicit — button disabled until length met |

### B) Server-side

#### Verify account
- **Endpoint:** `POST [authApi verifyAccountApi]` (via `useAuthStore.verifyAccount`)
- **Request:** `{ code: string }` (6-digit OTP)
- **Success:** `200` → `setSuccess(true)` → redirect to `/k` after 2 s
- **Errors:** `[UNVERIFIED]` — no user-visible error message shown; `console.error` only
- **Trigger:** "Xác minh" button click (form submit)
- **Source:** `VerifyPage.tsx:36`

#### Send verification email (auto on mount)
- **Endpoint:** `POST [authApi sendVerificationEmailApi]` (via `useAuthStore.sendVerificationEmail`)
- **Request:** none (auth token identifies user)
- **Success:** `200` → `setAutoSentEmail(true)`; auto-sent banner shown
- **Errors:** silent — `console.error` only; no user feedback
- **Trigger:** `useEffect` on mount when `user && !user.isVerified`
- **Source:** `VerifyPage.tsx:23`

#### Resend verification email
- **Endpoint:** `POST [authApi sendVerificationEmailApi]`
- **Request:** none
- **Success:** `[UNVERIFIED]` — no UI confirmation
- **Errors:** silent — `console.error` only
- **Trigger:** "Gửi lại mã xác minh" button click
- **Source:** `VerifyPage.tsx:48`

---

## Interaction Patterns

- **Auto-send on mount** — `useEffect` with `hasSentEmailRef` guard prevents double-send; `sendVerificationEmail()` called once when unverified user lands on page — source: `VerifyPage.tsx:20`
- **Submit disabled until 6 digits** — `disabled={loading || code.length < 6}` on submit button — source: `VerifyPage.tsx:132`
- **Auto-redirect on success** — `setTimeout(() => navigate("/k", { replace: true }), 2000)` fires after successful verification — source: `VerifyPage.tsx:38`
- **Ref-based guard** — `hasSentEmailRef.current` boolean prevents `useEffect` re-triggering on `user` object changes — source: `VerifyPage.tsx:16`

---

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `InputOTPSlot` components have `aria-hidden="true"` (optical-only); no `aria-describedby` linking OTP input to label; resend button lacks `aria-live` |
| Keyboard navigation | supported | Standard `<form>` tab order; `InputOTPSlot` supports keyboard navigation between digits |
| Focus management | unmanaged | No `autofocus` on mount; no focus management on success state or redirect |
| Screen reader compatibility | unknown | OTP input is a custom compound component — ARIA semantics unclear from static analysis |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

---

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `user?.isVerified === true` | auth | Full-page already-verified success card | OTP form + resend link | Redirects user away from verification flow |
| `user?.email` is truthy | auth | Email hint in parentheses below subtitle | email hint not shown | |
| `autoSentEmail && !success` | auth | Auto-sent notice banner (red) | banner hidden | |
| `success === true` | auth | Success state block | OTP form + resend link | |
| `code.length < 6` | responsive | Submit button disabled | — | |

---

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` on `/k/verify` | auth | Redirect to `/login` if not authenticated |
| Server validates OTP against `VerifyAccountCode.code` | auth | Invalid code returns error — user must request new code [UNVERIFIED] |
| OTP expires server-side | auth | Expired code rejected — user must request new code [UNVERIFIED] |

---

## Source References

- Page/View: `examio-fe/src/pages/k/VerifyPage.tsx:1`
- Auth store: `examio-fe/src/stores/useAuthStore.ts:1`
