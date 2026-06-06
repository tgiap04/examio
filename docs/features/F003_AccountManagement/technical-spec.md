# F003_AccountManagement

**Priority**: P0
**Type**: ui
**Generated**: 2026-06-05

## Overview

Account lifecycle management for registered users. Handles email verification (6-digit OTP) to activate accounts, gates unverified users from all protected routes, and provides a root redirect for the `/k/` protected section. New users must verify their email before accessing any study materials, exam sessions, or AI tools.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities (User, VerifyAccountCode have no DISC-### fields).

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Verify account with OTP | POST /api/v1/auth/verifyAccount | yes |
| FR-002 | Resend verification email | POST /api/v1/auth/sendVerificationEmail | yes |
| FR-003 | Get current user profile | GET /api/v1/auth/me | yes |
| FR-004 | Root redirect for /k/ section | GET /k | yes |

### Business Rules


None.
### BR-001_UnverifiedAccountGate
**Linked FR:** FR-003
**Source:** `examio-be/apps/auth-service/src/auth.controller.ts`
**Applies to:** `GET /api/v1/auth/me`
**Rule:** Unverified accounts (isVerified = false) are identified via `GET /api/v1/auth/me`. The frontend `ProtectedRoute` uses this flag to redirect unverified users to `/k/verify`. Backend does not block unverified users from calling `/api/v1/auth/me` — gating is enforced at the frontend route level.

**Pseudocode:**
```text
if user.isVerified === false → frontend redirects to /k/verify
else → proceed to requested protected page
```

### BR-002_VerifyAccountCodeExpiry
**Linked FR:** FR-001
**Source:** `examio-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `POST /api/v1/auth/verifyAccount`
**Rule:** Verification code expires after a configured window (e.g., 15 minutes). Expired code returns 400.

**Pseudocode:**
```text
if code expired → return 400 "Verification code has expired"
if code not found → return 400 "Invalid verification code"
update user.isVerified = true
delete verify account code
```

### BR-003_KRootRedirect
**Linked FR:** FR-004
**Source:** `examio-fe/src/pages/k/KRootRedirect.tsx`
**Applies to:** `GET /k`
**Rule:** Authenticated users visiting `/k` are redirected to `/k/my-materials`. Unauthenticated users are redirected to `/login`.

### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations


None.
### INT-001_MailService
**Linked FR:** FR-002
**Source:** `examio-be/libs/common/src/services/mail.service.ts`
**Type:** notification
**Target:** User email inbox
**Trigger:** User requests a new verification email
**Payload:** recipient email, template type, OTP code
**Failure handling:** Email delivery failure logged; user notified if critical

### Verification

- **SC-001** — Valid OTP submitted on `/k/verify` activates the account and redirects to `/k/my-materials` (covers FR-001, BR-002)
- **SC-002** — Invalid or expired OTP submitted returns 400 (covers BR-002)
- **SC-003** — Unverified user attempting any protected route is redirected to `/k/verify` (covers BR-001)
- **SC-004** — Authenticated user visiting `/k` is redirected to `/k/my-materials` (covers BR-003)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US011 — Verify Account (Priority: high)

**What happens:** A newly registered user arrives at the verification page and enters the 6-digit OTP from their email. The backend validates the code, sets `isVerified = true` on the User record, deletes the code, and redirects the user to `/k/my-materials`. The user can now access all protected features.

**Why this priority:** P0 — unverified accounts are gated from all protected features; this is the key that unlocks the platform.

**Independent Test:** Submit a valid 6-digit OTP on `/k/verify`. Verify user.isVerified = true in the database and redirect to `/k/my-materials`.

**Acceptance Scenarios:**

1. **Given** a valid OTP, **When** the user submits, **Then** the account is activated, `isVerified` is set to true, and the user is redirected to `/k/my-materials`.
2. **Given** an invalid OTP, **When** the user submits, **Then** an error message is shown and the user stays on the verification page.
3. **Given** an expired OTP, **When** the user submits, **Then** an error message is shown and the user can request a new code.
4. **Given** an unverified user, **When** they attempt to visit any protected page, **Then** they are redirected to `/k/verify`.

**Requirements fulfilled:**

- **FR-001** Verify account with OTP — `POST /api/v1/auth/verifyAccount` via `AuthService.verifyAccount`
  **Source:** `examio-be/apps/auth-service/src/auth.service.ts`
- **FR-002** Resend verification email — `POST /api/v1/auth/sendVerificationEmail` via `AuthService.sendVerificationEmail`
  **Source:** `examio-be/apps/auth-service/src/auth.service.ts`

**Rules enforced:** BR-001, BR-002

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| User | `User` | id, email, isVerified | Read on verification; isVerified toggled on success |
| VerifyAccountCode | `VerifyAccountCode` | id, userId, code, expiresAt | Consumed on US011; created on US005 (register) |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F003 | [x] |
| API Map | [api-map.md](../../docs/generated/api-map.md) | — | [ ] |
| Entities | [entities.md](../../docs/generated/entities.md) | MODEL-001, MODEL-003 | [ ] |
| Screens | [screens.md](../../docs/features/F003_AccountManagement/screens.md) | SCR012, SCR014 | [ ] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL003, BL008 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM002, PERM003 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US011 | [x] |

## Assumptions

- Verification codes are single-use: consumed and deleted after successful verification.
- Resending the verification email creates a new code and invalidates the previous one.
- Backend `/api/v1/auth/me` does not enforce verification status — frontend `ProtectedRoute` is the gatekeeper.
- The `/k` root path always redirects; it never renders a page of its own.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| AuthService | `examio-be/apps/auth-service/src/auth.service.ts` | verifyAccount, sendVerificationEmail logic |
| AuthController | `examio-be/apps/auth-service/src/auth.controller.ts` | HTTP endpoints for verification routes |
| MailService | `examio-be/libs/common/src/services/mail.service.ts` | Email sending for verification codes |
| KRootRedirect | `examio-fe/src/pages/k/KRootRedirect.tsx` | Root redirect for /k/ section |
| VerifyPage | `examio-fe/src/pages/k/VerifyPage.tsx` | Account verification page with OTP form |
| ProtectedRoute | `examio-fe/src/routes/ProtectedRoute.tsx` | Frontend route guard for unverified accounts |

## Unresolved Questions

1. **{Code expiry}**: Default verification code TTL — not confirmed from source.
2. **{Resend rate limit}**: Whether there is a cooldown on resending verification emails — not confirmed.
3. **{OAuth accounts}**: Whether accounts created via Google OAuth are automatically marked as verified — not confirmed.
