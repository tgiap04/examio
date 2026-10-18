# Business Rules

**Project**: examio
**Generated**: 2026-06-05
**Analysis Scope**: All background logic from Wave 0 scout + client-side logic inventory

Plain-language rules enforced by the system. No codes — written for PM, BA, and client audiences.

---

## Authentication & Sessions

### Expired sessions are automatically deactivated

Every night, the system scans all active user sessions. Any session whose expiry time has passed is automatically marked as inactive. This cannot be undone by the user — they must log in again.

**Applies when:** A session's expiry time has passed and the session is still marked active.
**Says:** The session is deactivated silently. The user is rejected on their next request with a 401.

---

### A new user is a STUDENT; only a TEACHER gets a wallet and the welcome credits

Registration (email or Google) creates the account with base role `STUDENT`. Students have no wallet. The wallet and the 20-credit welcome bonus are provisioned when the account becomes a `TEACHER`. This is asynchronous — the wallet may not appear for a moment after the role change.

**Applies when:** Finance receives `auth.user.authz_changed` with `role = TEACHER` (published by auth through the outbox in the role-change transaction). A TEACHER who calls the wallet API before the event is processed gets the wallet created lazily (`ensureWallet`). The `reconcile-teachers` CLI re-ensures a wallet for every TEACHER.
**Says:** A wallet with 20 credits (one `Welcome bonus credits` transaction) and an inactive Free subscription row are created once. Replays and the lazy path never duplicate the wallet or the bonus. Demoting a TEACHER keeps the wallet but it is unreachable without `wallet:use`.

### Roles: STUDENT or TEACHER, plus the SYSTEM_ADMIN flag

An account has exactly one base role (`STUDENT` or `TEACHER`) and an independent `isSystemAdmin` flag. Only an active SYSTEM_ADMIN can grant TEACHER or the admin flag (admin UI through auth `SetUserRole` / `SetSystemAdmin`, or the auth CLI `yarn bootstrap:admin:grant <email> [--teacher]`).

**Applies when:** A role or admin flag is changed.
**Says:** A user cannot change their own role (`CANNOT_CHANGE_OWN_ROLE`); the last active SYSTEM_ADMIN cannot be demoted (`LAST_SYSTEM_ADMIN`). Each change is serialized by an advisory lock, bumps `authzVersion`, writes a `RoleChangeLog` row and emits `auth.user.authz_changed` in one transaction. The new role reaches the user's token on its next refresh (access tokens live 15 minutes). The role-to-permission table is in [permissions](permissions.md).

---

### Login requires valid credentials or a valid OAuth token

Users can sign in with an email/password combination or via Google OAuth. On success, the system issues a JWT access token (short-lived) and a refresh token (long-lived). A session record is created with the device fingerprint, browser, OS, and IP address.

**Applies when:** A user submits login credentials or completes a Google OAuth redirect.
**Says:** Tokens are stored in localStorage and an HTTP-only cookie. The session is associated with the device for multi-device tracking.

---

### Every route declares its access; undeclared routes are denied

Access tokens are RS256 JWTs signed by auth-service and verified by each service against auth's JWKS, with no database lookup per request. Every handler must declare `@Public`, `@Authenticated`, `@RequirePermissions(...)`, `@ServiceOnly(...)` or `@RequirePermissionsOrService(...)`; a handler with no declaration is refused with 403 `NO_AUTHZ_DECLARED`. Unverified emails get 403 except on the `@AllowUnverified` onboarding routes.

**Applies when:** Any HTTP or gRPC request reaches a service (the study-room WebSocket verifies its token in the socket middleware instead).
**Says:** A missing or invalid token is 401 on a protected route; a valid token without the needed permission is 403. Service-to-service calls carry a service token (`POST /internal/token`, client credentials, 5 minute TTL) in the `authorization` header / gRPC metadata. Session revocation and refresh still go through auth-service.

---

### OAuth login tokens are synced server-side on redirect

When a user completes Google OAuth, the auth code is exchanged server-side and tokens are stored in the database. The frontend receives tokens via URL query parameters, stores them in localStorage, and also calls a sync endpoint to persist the session server-side. A device fingerprint is assigned via `X-Device-ID` header.

**Applies when:** The Google OAuth redirect URL carries `token`, `refreshToken`, and `sessionId` in the query string.
**Says:** Tokens are persisted both client-side and server-side. The session is linked to the device for future management and revocation.

---

### Users can terminate any of their own other sessions

A user can view all active sessions across devices and browsers. They can terminate any session except the one they are currently using. This helps users log out remotely on devices they no longer control.

**Applies when:** A user requests the device list and chooses to delete a session.
**Says:** The specified session is marked inactive. The current session remains valid.

---

## Finance & Payments

### AI generation deducts credits before processing

Before generating quizzes or flashcards from a document, the system checks the user's wallet balance. If sufficient credits exist, the cost is deducted immediately. Processing then proceeds. If credits are insufficient, the request is rejected.

**Applies when:** A user initiates quiz or flashcard generation from the AI tool.
**Says:** Credits are deducted atomically. The generation job is queued. If FREE_MODE is enabled, this credit check is bypassed.

---

### Credits are bypassed in free mode

When the `FREE_MODE` environment flag is set to `true`, AI generation and document processing proceed without checking or deducting credits. This is a production deployment flag that overrides the credit economy entirely.

**Applies when:** FREE_MODE is true in the deployment environment.
**Says:** No credit check or deduction occurs. All users can generate content freely.

---

### Bank transfers top up wallet credits

When a user initiates a subscription purchase, the system creates a payment record with a SePay virtual account and displays a QR code. When the user transfers the correct amount to that virtual account, SePay sends a webhook notification. The system verifies the webhook signature, marks the payment as paid, and adds credits to the user's wallet or activates their subscription.

**Applies when:** A bank transfer is made to the virtual account and SePay delivers a signed webhook.
**Says:** Wallet is credited or subscription is activated. The payment record is updated from `unpaid` to `paid`. Duplicate webhook deliveries are handled idempotently.

---

### Wallet is provisioned from an authz event

Finance consumes `auth.user.authz_changed` from the `examio.events` exchange. Only `role = TEACHER` provisions a wallet; other roles are ignored. See "A new user is a STUDENT" above. `auth.user.registered` is still published by auth but finance no longer consumes it.

**Applies when:** `auth.user.authz_changed` (outbox, idempotent consumer) reaches finance.
**Says:** Wallet (20 credits, once) and Free subscription row exist for the TEACHER afterwards.

---

## File Storage

### Uploaded files are stored in R2 with user-scoped keys

User files (profile avatars, banners, PDF documents, knowledge base files) are uploaded to Cloudflare R2 via the r2-service. Files are stored under user-scoped keys so they are isolated per user. The service returns a CDN URL for immediate display or download.

**Applies when:** A user uploads a file via the API or profile form.
**Says:** The file is stored in R2. A URL is returned to the client. The URL is valid for CDN delivery.

---

### Files are deleted from R2 when records are deleted

When a user deletes a PDF, a knowledge file, or a profile asset, the system removes the record from the database and also deletes the file from R2. The file URL becomes invalid immediately after deletion.

**Applies when:** A delete operation targets a UserStorage record.
**Says:** The database record is removed and the R2 object is deleted. The operation is atomic — if R2 deletion fails, the DB deletion may still proceed, creating orphaned files that are cleaned up asynchronously.

---

### AI document processing uses OCR to extract text

When a PDF or image is uploaded for AI quiz or flashcard generation, the system first sends it through the OCR service to extract machine-readable text. This text is then passed to the AI generation pipeline. The processing is asynchronous and may take several minutes.

**Applies when:** A file is uploaded for generation with a detected PDF or image type.
**Says:** The file is queued for OCR. Once text is extracted, the generation pipeline proceeds automatically.

---

## Exam Integrity

### Tab switches, window blur, and devtools are logged as violations

While a student is taking an exam, the system monitors browser events: tab visibility changes, window blur, copy/paste attempts, right-click, fullscreen exit, and print screen. Each violation is logged to the database with a timestamp and event type. A warning modal is shown to the student on the first violation.

**Applies when:** An exam attempt is in progress (status = IN_PROGRESS).
**Says:** A cheating log entry is created. The warning modal appears. Repeated violations accumulate and are visible to the exam host in the analytics view.

---

### Exam answers are auto-saved every 30 seconds

While an exam attempt is active, the system saves the current answer state (selected options, current question index, marked questions, time spent) to the server every 30 seconds. This ensures that accidental tab closes or browser crashes do not lose progress.

**Applies when:** An exam attempt is in progress.
**Says:** Progress is persisted every 30 seconds. On tab close (`beforeunload`), a final save is fired via `sendBeacon` to ensure the last state is captured.

---

### Exam attempts are decrypted client-side

Questions are fetched from the server encrypted (via a secure-quiz endpoint) and decrypted in the browser using AES-256-CBC. Answers are then encrypted with a per-attempt JWT and submitted via a secure-submit endpoint. This prevents intermediate proxies or network observers from reading question content.

**Applies when:** An exam attempt is started or resumed.
**Says:** Questions are decrypted in the browser. Answer submission is wrapped in a per-attempt JWT.

---

### Exam attempts are submitted automatically when time expires

The system enforces the session time limit. If a student does not manually submit before the deadline, the attempt is closed automatically and answers are scored. Manual submission is allowed at any time before expiry.

**Applies when:** The session's end time is reached while an attempt is still in progress.
**Says:** The attempt status changes to COMPLETED. Scoring runs. The student is redirected to the results view.

---

## AI Generation

### Pending AI jobs are resumed on page revisit

If a user navigates away from the AI tool page while a generation job is still in progress, the system persists the job state in localStorage. When the user returns to the page, a dialog appears offering to resume monitoring the job. The system polls job status every 10 seconds, up to 360 attempts (60 minutes), then marks the job as failed.

**Applies when:** The AI tool page mounts and a `pending_generation_job` key exists in localStorage.
**Says:** The job status is polled. The user is notified when the job completes or fails. If polling exhausts 360 attempts, the job is marked failed.

---

### PDF export is generated client-side

Users can export their flashcard study history or exam history as a PDF. The browser renders the content to PDF using browser APIs and triggers a download. This happens entirely on the client — no server-side PDF rendering is involved.

**Applies when:** A user clicks "Export PDF" on a history item.
**Says:** The PDF is generated in the browser and a download is triggered.

---

## Email & Notifications

### Account verification requires a 6-digit OTP

When a user registers, they receive a 6-digit one-time password by email. The code expires after 15 minutes and can only be used once. Entering the correct code activates the account and grants access to protected pages.

**Applies when:** A user submits the verification form on the `/k/verify` page.
**Says:** The account status changes to verified. The code is invalidated immediately after use.

---

### Password reset requires a valid OTP

A user who requests a password reset receives a 6-digit OTP by email. The code is valid for 15 minutes. Submitting the correct code plus a new password resets the account password. The old password is invalidated immediately.

**Applies when:** A user submits the reset-password form.
**Says:** The password is updated. The OTP is invalidated. All existing sessions remain active (no forced logout unless explicitly designed).

---

### Password change sends an email notification

When a user successfully changes their password via the profile page, a confirmation email is sent to their registered address. This helps users detect unauthorized password changes.

**Applies when:** A user submits the change-password form with the correct current password.
**Says:** The password is updated. A confirmation email is sent to the registered address.

---

## Data Retention

### User data is retained while account is active

User data (quiz sets, flashcard sets, exam rooms, history, wallet) is retained indefinitely as long as the account exists. Deleted content is removed immediately from the database and R2. There is no automatic purge of inactive accounts in the current implementation.

**Applies when:** A user deletes content or an account.
**Says:** The relevant records and files are permanently removed. This cannot be undone.

---

## Flashcard Study

### Study progress is tracked per user per flashcard set

Each time a student moves to the next card in a study session, the card ID is recorded as "studied" for that user and flashcard set. Progress is used to show the progress bar and prevent re-studying the same card in the same session.

**Applies when:** A student navigates to the next card in a study session.
**Says:** The card is marked as studied. The API call is fire-and-forget — if it fails, the progress is not retried.

---

### Flashcard study requires passing an access gate

A flashcard set can be protected by an access code. Students must enter the correct code before the study interface is unlocked. The host of the set bypasses the code requirement.

**Applies when:** A student navigates to a flashcard set that has access code protection enabled.
**Says:** The study interface is locked behind an access dialog. The code must match the host-configured value.