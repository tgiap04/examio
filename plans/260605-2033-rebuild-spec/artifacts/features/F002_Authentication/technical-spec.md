# F002_Authentication

**Priority**: P0
**Type**: ui
**Generated**: 2026-06-05

## Overview

Full authentication flow for the platform. Supports email/password login, Google OAuth (including One Tap), account registration with Turnstile bot protection, and session management with device tracking. Session tokens are stored in localStorage and cookies; device fingerprinting enables cross-device session visibility. All routes under this feature are public — no session token required.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities (User, UserSession, VerifyAccountCode, ResetPasswordCode have no DISC-### fields).

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Sign in with email and password | POST /api/v1/auth/login | yes |
| FR-002 | Sign in with Google OAuth | GET /api/v1/auth/google | yes |
| FR-003 | Register new account with Turnstile | POST /api/v1/auth/register | yes |
| FR-004 | Request password reset OTP | POST /api/v1/auth/send-code-reset-password | yes |
| FR-005 | Reset password with OTP | POST /api/v1/auth/reset-password | yes |
| FR-006 | Refresh session token | POST /api/v1/auth/refresh | yes |
| FR-007 | Log out and invalidate session | POST /api/v1/auth/logout | yes |
| FR-008 | Sync OAuth refresh token | POST /api/v1/auth/sync-refresh-token | yes |

### Business Rules


None.
### BR-001_LoginCredentials
**Linked FR:** FR-001
**Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `POST /api/v1/auth/login`
**Rule:** Email and password are validated. If credentials are invalid, a generic "invalid email or password" message is returned (do not reveal which field is wrong).

**Pseudocode:**
```text
if user not found → return 401 "Invalid email or password"
if password hash mismatch → return 401 "Invalid email or password"
create session with device fingerprint
return JWT access token and refresh token
```

### BR-002_TurnstileOnRegister
**Linked FR:** FR-003
**Source:** `kmaedu-be/apps/auth-service/src/auth.controller.ts`
**Applies to:** `POST /api/v1/auth/register`
**Rule:** Registration form must include a valid Turnstile token. Submission without a valid token is rejected with 400.

**Pseudocode:**
```text
if turnstile token invalid → return 400 "Bot protection failed"
create user with hashed password
send verification email with OTP
```

### BR-003_SessionDeviceFingerprint
**Linked FR:** FR-001, FR-002
**Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`
**Applies to:** login events
**Rule:** On successful login, a new UserSession record is created with device fingerprint (deviceId, deviceName, browser, OS, IP). Session token is opaque and stored in the database.

### BR-004_PasswordResetExpiry
**Linked FR:** FR-005
**Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `POST /api/v1/auth/reset-password`
**Rule:** Reset code expires after a configured window. Expired code returns 400.

### BR-005_AuthenticatedRedirect
**Linked FR:** FR-001, FR-002
**Source:** `kmaedu-fe/src/pages/LoginPage.tsx`
**Applies to:** LoginPage mount
**Rule:** Authenticated users are redirected away from login and register pages to `/k/my-materials`.

### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations


None.
### INT-001_GoogleOAuth
**Linked FR:** FR-002
**Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`
**Type:** api-call
**Target:** Google OAuth provider
**Trigger:** User clicks Google sign-in button or One Tap prompt
**Payload:** Google ID token, redirect URI
**Failure handling:** OAuth error shown to user; allows retry

### INT-002_MailService
**Linked FR:** FR-003, FR-004, FR-005
**Source:** `kmaedu-be/libs/common/src/services/mail.service.ts`
**Type:** notification
**Target:** User email inbox
**Trigger:** Account registration, password reset request
**Payload:** recipient email, template type, OTP code
**Failure handling:** Email delivery failure logged; user notified if critical

### Verification

- **SC-001** — Email/password login with valid credentials returns 200 and stores session (covers FR-001, BR-001, BR-003)
- **SC-002** — Email/password login with invalid credentials returns 401 (covers BR-001)
- **SC-003** — Registration without Turnstile token returns 400 (covers BR-002)
- **SC-004** — Authenticated user visiting login page is redirected to /k/my-materials (covers BR-005)
- **SC-005** — Password reset with expired OTP returns 400 (covers BR-004)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US003 — Sign In with Email (Priority: high)

**What happens:** A guest fills in their email and password on the login page and submits. The backend validates credentials, creates a session with device fingerprint, and returns JWT tokens. The frontend stores tokens in localStorage and a cookie, then redirects to `/k/my-materials`.

**Why this priority:** Core credential-based authentication path — required for all non-OAuth users.

**Independent Test:** Submit email/password on `/login` with valid credentials. Verify 200 response, tokens stored, and redirect to `/k/my-materials`.

**Acceptance Scenarios:**

1. **Given** valid email and password, **When** the user submits the login form, **Then** the session is created and the user is redirected to `/k/my-materials`.
2. **Given** invalid email or password, **When** the user submits, **Then** a generic error message is shown and the user stays on the login page.
3. **Given** an authenticated user visits `/login`, **When** the page loads, **Then** the user is redirected to `/k/my-materials`.

**Requirements fulfilled:**

- **FR-001** Sign in with email/password — `POST /api/v1/auth/login` via `AuthService.login`
  **Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`

**Rules enforced:** BR-001, BR-003, BR-005

---

### US004 — Sign In with Google OAuth (Priority: high)

**What happens:** A guest clicks the Google sign-in button or responds to the Google One Tap prompt. The platform initiates or completes the OAuth flow, creates or links the user account, and issues session tokens. Tokens are synced via `sync-refresh-token` and the user is redirected to `/k/my-materials`.

**Why this priority:** OAuth is a primary acquisition path alongside email/password.

**Independent Test:** Click Google sign-in button. Complete OAuth flow. Verify session created and redirect to `/k/my-materials`.

**Acceptance Scenarios:**

1. **Given** a valid Google account, **When** the OAuth flow completes, **Then** the user is created/linked and redirected to `/k/my-materials`.
2. **Given** an OAuth failure, **When** the callback returns, **Then** an error is shown and the user can retry.

**Requirements fulfilled:**

- **FR-002** Sign in with Google OAuth — `GET /api/v1/auth/google` via `AuthService.googleLogin`
  **Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`
- **FR-008** Sync OAuth refresh token — `POST /api/v1/auth/sync-refresh-token`
  **Source:** `kmaedu-fe/src/components/auth/AuthSyncBootstrap.tsx`

**Rules enforced:** BR-003

---

### US005 — Register Account (Priority: high)

**What happens:** A guest fills in email, password, and username on the registration page. Turnstile challenge is validated server-side. On success, a new User record is created (unverified), a 6-digit OTP is sent to the email, and the user is redirected to the verification page.

**Why this priority:** Registration is the entry point for all new users — must be reliable and protected against bots.

**Independent Test:** Submit registration form with valid Turnstile token. Verify user created, verification email sent, and redirect to `/k/verify`.

**Acceptance Scenarios:**

1. **Given** all required fields and a valid Turnstile token, **When** the user submits, **Then** the account is created, a verification email is sent, and the user is redirected to `/k/verify`.
2. **Given** a duplicate email, **When** the user submits, **Then** a validation error is shown.
3. **Given** no Turnstile token, **When** the user submits, **Then** a 400 error is returned.

**Requirements fulfilled:**

- **FR-003** Register account with Turnstile — `POST /api/v1/auth/register` via `AuthService.register`
  **Source:** `kmaedu-be/apps/auth-service/src/auth.controller.ts`

**Rules enforced:** BR-002

---

### US006 — Request Password Reset (Priority: medium)

**What happens:** A guest enters their registered email on the forgot-password page. The backend looks up the email, generates a 6-digit OTP, and sends it to the user's email. The user is redirected to the reset-password page.

**Why this priority:** Critical account recovery path; low frequency but high urgency.

**Independent Test:** Submit email on `/forgot-password`. Verify OTP email sent and redirect to `/reset-password`.

**Acceptance Scenarios:**

1. **Given** a registered email, **When** the user submits the forgot-password form, **Then** an OTP is sent to their email and the user is redirected to `/reset-password`.
2. **Given** an unregistered email, **When** the user submits, **Then** a generic message is shown without revealing whether the email exists.

**Requirements fulfilled:**

- **FR-004** Request password reset OTP — `POST /api/v1/auth/send-code-reset-password`
  **Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`

---

### US007 — Reset Password with OTP (Priority: medium)

**What happens:** A guest enters the 6-digit OTP from their email and a new password on the reset-password page. The backend validates the code, updates the password, deletes the code, and redirects to the login page.

**Why this priority:** Critical account recovery path; depends on a valid OTP within the expiry window.

**Independent Test:** Submit OTP and new password on `/reset-password` with a valid code. Verify password updated and redirect to `/login`.

**Acceptance Scenarios:**

1. **Given** a valid OTP and a new password meeting strength requirements, **When** the user submits, **Then** the password is updated, the code is deleted, and the user is redirected to `/login`.
2. **Given** an expired or invalid OTP, **When** the user submits, **Then** an error message is shown.
3. **Given** a new password that does not meet strength requirements, **When** the user submits, **Then** a validation error is shown.

**Requirements fulfilled:**

- **FR-005** Reset password with OTP — `POST /api/v1/auth/reset-password` via `AuthService.resetPassword`
  **Source:** `kmaedu-be/apps/auth-service/src/auth.service.ts`

**Rules enforced:** BR-004

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| User | `User` | id, email, username, password, isVerified | Read on login; created on register |
| UserSession | `UserSession` | id, userId, sessionId, refreshToken, deviceId, isActive, expiresAt | Created on login; validated on every protected request |
| VerifyAccountCode | `VerifyAccountCode` | id, userId, code, expiresAt | Created on register; consumed on US011 |
| ResetPasswordCode | `ResetPasswordCode` | id, userId, code, expiresAt | Created on US006; consumed on US007 |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F002 | [x] |
| API Map | [api-map.md](../../docs/generated/api-map.md) | — | [ ] |
| Entities | [entities.md](../../docs/generated/entities.md) | MODEL-001, MODEL-002, MODEL-003, MODEL-004 | [ ] |
| Screens | [screens.md](../../docs/features/F002_Authentication/screens.md) | SCR008–SCR011 | [ ] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL003, BL008, BL009, BL012 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM004, PERM005, PERM042 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US003, US004, US005, US006, US007 | [x] |

## Assumptions

- Turnstile token validation is performed server-side by the auth controller before any account creation logic runs.
- Password reset codes are single-use: consumed and deleted after successful reset.
- Google OAuth tokens are validated server-side; no token data is trusted from the client directly.
- JWT access tokens carry an expiry; refresh tokens are stored in the database and validated on each use.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| AuthService | `kmaedu-be/apps/auth-service/src/auth.service.ts` | Core auth logic: login, register, OAuth, token refresh |
| AuthController | `kmaedu-be/apps/auth-service/src/auth.controller.ts` | HTTP endpoints for all auth routes |
| MailService | `kmaedu-be/libs/common/src/services/mail.service.ts` | Email sending for OTP and password notifications |
| SessionValidationMiddleware | `kmaedu-be/libs/common/src/middleware/session-validation.middleware.ts` | Validates session token on every protected request |
| AuthSyncBootstrap | `kmaedu-fe/src/components/auth/AuthSyncBootstrap.tsx` | OAuth callback token sync on frontend |
| LoginPage | `kmaedu-fe/src/pages/LoginPage.tsx` | Login form UI |
| RegisterPage | `kmaedu-fe/src/pages/RegisterPage.tsx` | Registration form with Turnstile |

## Unresolved Questions

1. **{Turnstile}**: Whether Turnstile is enforced on login page (bot protection on repeated failed attempts) — not confirmed from source.
2. **{Session expiry}**: Default session TTL and refresh token rotation policy — not confirmed from source.
3. **{OAuth One Tap}**: Whether Google One Tap requires a specific domain/email allowlist configuration — not confirmed.