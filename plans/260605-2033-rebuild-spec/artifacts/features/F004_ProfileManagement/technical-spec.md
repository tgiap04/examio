# F004_ProfileManagement

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

Profile management for authenticated users. Allows editing of display name, username, bio, avatar, and banner image. Avatar and banner images are uploaded to R2 object storage via a proxy endpoint, and the returned CDN URL is saved to the User record. Session management enables viewing all active device sessions and terminating remote sessions. Password change requires the current password and sends a confirmation email.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities (User, UserSession have no DISC-### fields).

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Get current user profile | GET /api/v1/profile | yes |
| FR-002 | Update profile information | PUT /api/v1/profile | yes |
| FR-003 | Upload avatar or banner image | POST /api/v1/r2/image | yes |
| FR-004 | List active sessions/devices | GET /api/v1/devices | yes |
| FR-005 | Terminate a remote session | DELETE /api/v1/devices/:deviceId | yes |
| FR-006 | Change account password | POST /api/v1/auth/change-password | yes |
| FR-007 | Send password change OTP | POST /api/v1/auth/send-code-change-password | yes |

### Business Rules


None.
### BR-001_ProfileOwnership
**Linked FR:** FR-001, FR-002
**Source:** `examio-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `GET /api/v1/profile`, `PUT /api/v1/profile`
**Rule:** Users can only read and update their own profile. The profile endpoint reads the user ID from the session token — cross-user access is not possible.

### BR-002_AvatarUploadSizeLimit
**Linked FR:** FR-003
**Source:** `examio-be/apps/r2-service/src/r2.service.ts`
**Applies to:** `POST /api/v1/r2/image`
**Rule:** Uploaded images must not exceed 2MB. Files exceeding this limit return 400.

### BR-003_DeviceOwnership
**Linked FR:** FR-004, FR-005
**Source:** `examio-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `GET /api/v1/devices`, `DELETE /api/v1/devices/:deviceId`
**Rule:** Sessions are scoped to the owning user. A user can view and delete only their own sessions. The current session cannot be deleted via this endpoint.

### BR-004_PasswordChangeRequiresCurrent
**Linked FR:** FR-006
**Source:** `examio-be/apps/auth-service/src/auth.service.ts`
**Applies to:** `POST /api/v1/auth/change-password`
**Rule:** Password change requires the current password as confirmation. Incorrect current password returns 400.

### BR-005_PasswordChangeEmailNotification
**Linked FR:** FR-006
**Source:** `examio-be/libs/common/src/services/mail.service.ts`
**Applies to:** password change success
**Rule:** Upon successful password change, a confirmation email is sent to the user's registered email address to alert them of the change.

### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations


None.
### INT-001_R2Storage
**Linked FR:** FR-003
**Source:** `examio-be/apps/r2-service/src/r2.service.ts`
**Type:** api-call
**Target:** Cloudflare R2 object storage
**Trigger:** User uploads avatar or banner image
**Payload:** file binary, user-scoped key, MIME type
**Failure handling:** File size/type validation; 400 returned on failure

### INT-002_MailService
**Linked FR:** FR-006
**Source:** `examio-be/libs/common/src/services/mail.service.ts`
**Type:** notification
**Target:** User email inbox
**Trigger:** Successful password change
**Payload:** recipient email, template type
**Failure handling:** Email failure logged; does not block password update

### Verification

- **SC-001** — Profile form pre-fills with current user data from GET /api/v1/profile (covers FR-001)
- **SC-002** — Saving profile updates User record and reflects changes on next page load (covers FR-002, BR-001)
- **SC-003** — Avatar upload exceeding 2MB returns 400 (covers BR-002)
- **SC-004** — DeviceList shows all sessions for the current user only (covers FR-004, BR-003)
- **SC-005** — Terminating a remote session invalidates that session's token (covers FR-005, BR-003)
- **SC-006** — Password change with incorrect current password returns 400 (covers BR-004)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US008 — Update Profile (Priority: high)

**What happens:** A student navigates to their profile page, updates their name, username, bio, avatar, or banner image, and saves. Avatar and banner uploads go through R2 storage first and return a CDN URL that is then saved to the profile.

**Why this priority:** Profile is the user's identity on the platform — required for community features and personal branding.

**Independent Test:** Update profile fields and save. Verify User record updated in database.

**Acceptance Scenarios:**

1. **Given** all profile fields are valid, **When** the user clicks Save, **Then** the profile is updated and a success message is shown.
2. **Given** the username is already taken, **When** the user saves, **Then** a validation error is shown.
3. **Given** the avatar image is larger than 2MB, **When** the user uploads it, **Then** an error message is shown and the upload is rejected.

**Requirements fulfilled:**

- **FR-001** Get profile — `GET /api/v1/profile` via `ProfileController.getProfile`
  **Source:** `examio-be/apps/auth-service/src/profile.controller.ts`
- **FR-002** Update profile — `PUT /api/v1/profile` via `ProfileController.updateProfile`
  **Source:** `examio-be/apps/auth-service/src/profile.controller.ts`
- **FR-003** Upload image — `POST /api/v1/r2/image` via `R2Service.uploadImage`
  **Source:** `examio-be/apps/r2-service/src/r2.service.ts`

**Rules enforced:** BR-001, BR-002

---

### US009 — Change Account Password (Priority: medium)

**What happens:** A student enters their current password and a new password in the change-password section of the profile page. The backend validates the current password, updates it, and sends a confirmation email to the user.

**Why this priority:** Security-critical feature; allows users to regain control after a suspected compromise.

**Independent Test:** Enter current password and new password. Verify password updated and confirmation email sent.

**Acceptance Scenarios:**

1. **Given** the current password is correct and the new password meets strength requirements, **When** the user clicks Save, **Then** the password is updated and a confirmation email is sent.
2. **Given** the current password is incorrect, **When** the user clicks Save, **Then** an error message is shown and the password is not changed.
3. **Given** the new password does not meet strength requirements, **When** the user clicks Save, **Then** a validation error is shown.

**Requirements fulfilled:**

- **FR-006** Change password — `POST /api/v1/auth/change-password` via `AuthService.changePassword`
  **Source:** `examio-be/apps/auth-service/src/auth.service.ts`
- **FR-007** Send change-password OTP — `POST /api/v1/auth/send-code-change-password` via `AuthService.sendCodeChangePassword`
  **Source:** `examio-be/apps/auth-service/src/auth.service.ts`

**Rules enforced:** BR-004, BR-005

---

### US010 — Terminate Session (Priority: medium)

**What happens:** A student views the list of their active sessions on the profile page. Each session shows browser, OS, IP address, and last active time. The student clicks Delete on a session belonging to a device they no longer use. The session is invalidated and that device can no longer make API requests.

**Why this priority:** Security feature; allows users to log out remotely without needing physical access to the device.

**Independent Test:** View device list and delete a remote session. Verify the deleted session returns 401 on next API call.

**Acceptance Scenarios:**

1. **Given** a remote session exists, **When** the user clicks Delete on it, **Then** the session is invalidated and removed from the list.
2. **Given** the user tries to delete their current session, **When** the user clicks Delete, **Then** the button is not available or the action is rejected.
3. **Given** no active sessions exist other than the current one, **When** the user views the device list, **Then** an empty state is shown.

**Requirements fulfilled:**

- **FR-004** List sessions — `GET /api/v1/devices` via `AuthController.getDevices`
  **Source:** `examio-be/apps/auth-service/src/auth.controller.ts`
- **FR-005** Delete session — `DELETE /api/v1/devices/:deviceId` via `AuthController.deleteDevice`
  **Source:** `examio-be/apps/auth-service/src/auth.controller.ts`

**Rules enforced:** BR-003

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| User | `User` | id, email, username, name, avatar, banner, bio | Read and updated on profile save |
| UserSession | `UserSession` | id, userId, deviceId, deviceName, browser, os, ipAddress, isActive, lastActivity, createdAt, expiresAt | Read in DeviceList; isActive toggled to false on session termination |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F004 | [x] |
| API Map | [api-map.md](../../docs/generated/api-map.md) | — | [ ] |
| Entities | [entities.md](../../docs/generated/entities.md) | MODEL-001, MODEL-002 | [ ] |
| Screens | [screens.md](../../docs/features/F004_ProfileManagement/screens.md) | SCR013/REG001, SCR013/REG002 | [ ] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL003, BL006, BL008 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM006, PERM007, PERM008, PERM009, PERM010 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US008, US009, US010 | [x] |

## Assumptions

- Avatar and banner images are uploaded via the R2 service proxy, which returns a CDN URL stored in the User record.
- Session termination sets `isActive = false` on the UserSession record; the session token is immediately rejected by the session validation middleware on the next request.
- Password change requires the current password to be entered as a second factor; this prevents session hijacking from being used to change a password.
- Confirmation email on password change is sent asynchronously and does not block the response.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| AuthService | `examio-be/apps/auth-service/src/auth.service.ts` | Password change, session termination logic |
| ProfileController | `examio-be/apps/auth-service/src/profile.controller.ts` | Profile GET/PUT endpoints |
| R2Service | `examio-be/apps/r2-service/src/r2.service.ts` | Image upload to R2 object storage |
| MailService | `examio-be/libs/common/src/services/mail.service.ts` | Password change confirmation email |
| ProfilePage | `examio-fe/src/pages/k/ProfilePage.tsx` | Profile form and device list UI |
| ProfileForm | `examio-fe/src/components/k/ProfileForm.tsx` | Profile edit form component |

## Unresolved Questions

1. **{Image dimensions}**: Whether there is a minimum or maximum image dimension requirement for avatar/banner uploads — not confirmed.
2. **{Concurrent profile edits}**: Whether concurrent profile edits from two sessions are handled gracefully or can overwrite each other — not confirmed.
3. **{Session cleanup on delete}**: Whether terminating a session also clears the refresh token from the database — not confirmed from source.
