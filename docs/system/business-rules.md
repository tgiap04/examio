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

### A new user is a STUDENT; an admin grants TEACHER

Registration (email or Google) creates the account with base role `STUDENT`. Nothing else is provisioned: there is no wallet, welcome bonus or subscription.

**Applies when:** A user registers.
**Says:** The account is a `STUDENT` until a SYSTEM_ADMIN grants `TEACHER` (see the next rule). Students keep the same permissions as before; AI generation stays TEACHER-only.

### Roles: STUDENT or TEACHER, plus the SYSTEM_ADMIN flag

An account has exactly one base role (`STUDENT` or `TEACHER`) and an independent `isSystemAdmin` flag. Only an active SYSTEM_ADMIN can grant TEACHER or the admin flag (admin UI through auth `SetUserRole` / `SetSystemAdmin`, or the auth CLI `yarn bootstrap:admin:grant <email> [--teacher]`).

**Applies when:** A role or admin flag is changed.
**Says:** A user cannot change their own role (`CANNOT_CHANGE_OWN_ROLE`); the last active SYSTEM_ADMIN cannot be demoted (`LAST_SYSTEM_ADMIN`). Each change is serialized by an advisory lock, bumps `authzVersion`, writes a `RoleChangeLog` row and emits `auth.user.authz_changed` in one transaction. The new role reaches the user's token on its next refresh (access tokens live 15 minutes). The role-to-permission table is in [permissions](permissions.md).

**Admin screen (phase 08):** `/admin/roles` (`role:assign`) sets the base role (`PUT roles/users/:id/role`) and the flag (`PUT roles/users/:id/system-admin`) with an optional reason (max 500). A no-op change answers 200 and writes no `AdminAudit` row (auth still logs a `reapply` row and re-emits the event). `GET roles/changes` shows the log with `source` `admin-ui`, `cli` or `bootstrap`.

### Banning a user

**Applies when:** An admin bans or unbans an account (`POST /admin/users/:id/ban|unban`, `user:manage`).
**Says:** Auth `SetUserStatus` does it: the admin cannot ban themselves (403 `CANNOT_CHANGE_OWN_STATUS`) and the last active SYSTEM_ADMIN cannot be banned (409 `LAST_SYSTEM_ADMIN`). A ban sets `isBanned` (not `deletedAt`), revokes every session and bumps `authzVersion`; unban bumps it too and also clears `deletedAt` for accounts banned before RBAC. Both publish `auth.user.authz_changed` (`reason` `ban` / `unban`), write a `RoleChangeLog` row and an `AdminAudit` row. `PATCH /admin/users/:id` never changes role, admin flag or ban state (400 `VALIDATION_ERROR`).

---

### Login requires valid credentials or a valid OAuth token

Users can sign in with an email/password combination or via Google OAuth. On success, the system issues a JWT access token (short-lived) and a refresh token (long-lived). A session record is created with the device fingerprint, browser, OS, and IP address.

**Applies when:** A user submits login credentials or completes a Google OAuth redirect.
**Says:** The tokens are set by auth-service as HttpOnly cookies (`accessToken`, `refreshToken`); the browser never stores them in `localStorage`. The session is associated with the device for multi-device tracking.

---

### Every route declares its access; undeclared routes are denied

Access tokens are RS256 JWTs signed by auth-service and verified by each service against auth's JWKS, with no database lookup per request. Every handler must declare `@Public`, `@Authenticated`, `@RequirePermissions(...)`, `@ServiceOnly(...)` or `@RequirePermissionsOrService(...)`; a handler with no declaration is refused with 403 `NO_AUTHZ_DECLARED`. Unverified emails get 403 except on the `@AllowUnverified` onboarding routes.

**Applies when:** Any HTTP or gRPC request reaches a service (the study-room WebSocket verifies its token in the socket middleware instead).
**Says:** A missing or invalid token is 401 on a protected route; a valid token without the needed permission is 403. Service-to-service calls carry a service token (`POST /internal/token`, client credentials, 5 minute TTL) in the `authorization` header / gRPC metadata. Session revocation and refresh still go through auth-service.

---

### OAuth login sets the session cookies on the callback

When a user completes Google OAuth, auth-service exchanges the code server-side, creates the session, sets the `accessToken` and `refreshToken` cookies and redirects to the frontend. A device fingerprint is assigned via the `X-Device-ID` header. The mobile app (an allowlisted app redirect) never gets tokens in a URL: it receives a one-time code (60 s, single use) and swaps it for the tokens at `POST /auth/exchange`.

**Applies when:** The Google OAuth callback (`/auth/google/callback`) succeeds.
**Says:** The session is linked to the device for later management and revocation. If the frontend still sees `token`, `refreshToken` or `sessionId` in the URL it removes them without reading them.

---

### Users can terminate any of their own other sessions

A user can view all active sessions across devices and browsers. They can terminate any session except the one they are currently using. This helps users log out remotely on devices they no longer control.

**Applies when:** A user requests the device list and chooses to delete a session.
**Says:** The specified session is marked inactive. The current session remains valid.

---

## AI Cost and Limits

### AI generation has no charge

Generating quizzes or flashcards from a document, regenerating, and uploading a file cost nothing and have no monthly quota. Examio no longer has wallets, credits, subscriptions or payments. The only things that bound AI use are the TEACHER-only permission (`ai:generate`), the gateway rate limits and the technical limits listed below.

**Applies when:** A teacher starts, regenerates or cancels a generation, or uploads a file.
**Says:** The job (`GenerationJob`) is created as `QUEUED` together with its outbox row in one transaction, then becomes `PROCESSING`, and `COMPLETED` or `FAILED`. Every state change is conditional on the previous state, so a late event or a double click never moves a job twice. A failed job (`ai.generation.failed`) or a failed OCR (`ai.document.failed`) only changes the status; there is nothing to refund, so retrying a failed document is free.

- The user cancels a job that has not finished (`DELETE /ai/job/:id`): it becomes `CANCELLED`; cancelling twice answers 200, cancelling a completed or failed job is refused (`JOB_NOT_CANCELLABLE`). Cancelling keeps the processed document, so it stays reusable.
- A queued or running job shows no progress for `GENERATION_JOB_TIMEOUT_MINUTES` (default 60, never below 10): a watchdog fails it with `GENERATION_TIMEOUT`; a late result is ignored.
- Generating from a file whose processing is still running returns the running job.

**Kept on purpose (technical limits, not plans):** credential routes allow 5 requests per minute; the gateway applies its per-route `rateLimits` and `maxBodySize`; an exam-session snapshot is at most 1 MB; word-family generation is 20 per day; access-code entry locks after 5 wrong tries. AI chat keeps ai-service `AI_BUSY`.

---

### Services read only the data they own

Each database model belongs to one service. Other services reach it through that service's RPCs, never by querying its tables. Content, assessment and study-room show another user's name and avatar from auth's public profile (never the email); a deleted user appears as "Người dùng đã xóa" in the UI.

**Applies when:** a service needs data owned by another service.
**Says:** The owner decides what is returned; CI (`yarn check:ownership`) rejects direct access.

---

### Role and ban changes reach other services through an authz event

Auth publishes `auth.user.authz_changed` through its outbox in the same transaction as every role, admin, ban or password change. The gateway raises the user's stored authz version (older tokens answer `TOKEN_STALE`) and study-room-service closes that user's stale sockets. `auth.user.registered` is still published but nothing consumes it.

**Applies when:** `auth.user.authz_changed` (outbox, idempotent consumers) reaches the gateway or study-room-service.
**Says:** The user's next request or socket message is re-evaluated against the new role.

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
**Says:** Since phase 11 the R2 keys are queued in an `r2_delete_tasks` row (schema `auth`, `content`, `vocabulary`, `document` or `aichat`) inside the same transaction as the row delete or image replace: the tasks exist if and only if that transaction commits. A background worker (`R2DeleteWorker`, `libs/messaging/src/r2-delete`) then calls r2-service `DeleteObjects` and removes the tasks; on failure it retries with exponential backoff (capped at 1 hour) and stops after 10 attempts, leaving the task row and logging a stuck metric. Deleting an upload (`DELETE /ai/upload/:id` or the ai-chat "delete files" option) is one document-service transaction: rows removed, R2 keys queued, `document.deleted` written; ai-service then deletes the vectors, entities and graph, and content (generation history) and ai-chat (chat links) drop their links. The object may therefore outlive the record for a short while, but a crash after commit no longer orphans it. A URL not on the configured `R2_PUBLIC_URL` host is never deleted (`r2KeyFromUrl` returns `null`). Not covered: deleting a `User` account (see roadmap, deferred) — no code path deletes `User` rows today.

---

### AI document processing uses OCR to extract text

When a PDF or image is uploaded for AI quiz or flashcard generation or for AI chat, document-service announces it (`document.uploaded`, with a one-hour download link) and ai-service extracts, chunks and embeds the text. The processing is asynchronous and may take several minutes; the document goes `PENDING` → `COMPLETED` or `FAILED`.

**Applies when:** A file is uploaded through `POST /ai/upload`, or a quick-upload is first used.
**Says:** The file is queued for OCR. A quick-upload is stored but not processed until it is first used (AI chat or generation call `EnsureProcessed`). A chat message with attachments waits for their OCR for at most `AI_CHAT_DOCUMENT_WAIT_MS` (default 2 minutes) and then answers without that context. Generation from a document that has no text yet processes it inline from the download link.

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

### An exam session holds its own copy of the quiz

Creating an exam session copies the quiz set into the session (`ExamSession.quizSnapshot`, with a content hash). From then on questions, answers and scoring come only from that copy: editing or deleting the quiz set afterwards changes nothing for a session that exists. Deleting the set marks its rooms `sourceDeleted`, so no new session can be created, while existing sessions keep working. A host can pull the changes in with "refresh snapshot" only while the session is still UPCOMING and nobody has an attempt; the host view shows `snapshotOutdated` and `canRefreshSnapshot`.

**Applies when:** A host creates a session, refreshes its snapshot, or edits or deletes the source quiz set.
**Says:** A refresh after the session started or after the first attempt answers 409 `SNAPSHOT_LOCKED` (starting an attempt and refreshing take the same row lock, so an attempt never sits next to a changed snapshot). A set over 1 MB of serialized content answers 422 `QUIZSET_TOO_LARGE`; a deleted set answers 422 `QUIZSET_DELETED`. Changing the question selection of a session is checked against its own snapshot. Students never see the key before submit and never cause a call to content-service.

---

### Exam attempts are submitted automatically when time expires

The exam page counts the time limit down and submits for the student when it reaches zero (`handleAutoSubmit` in `ExamQuizPage`); if that call fails the student is shown a retry. Manual submission is allowed at any time before expiry. The server has no timer of its own: it does not close an attempt on its own, and the sessions' start and end times only gate starting an attempt.

**Applies when:** The time limit runs out in the student's browser while the attempt is still in progress.
**Says:** The browser submits through `secure-submit`; the attempt becomes COMPLETED and scored on the server. A student whose browser is closed keeps an open IN_PROGRESS attempt (open question in the glossary).

---

### Correct answers are shown to the examinee only after the attempt is completed

A student sees the answer key of an exam only when the attempt is COMPLETED and the session has `showAnswersAfterSubmit` on. Study views of a session (`study/:id`, `with-code`, `get-public`) never carry `answer` / `isCorrect`; the room host sees answers on attempts of their own sessions.

**Applies when:** An examinee loads an attempt (`:id/quiz`, `:id/detail`, `get-by-id`) or opens a session for study.
**Says:** In progress, or `showAnswersAfterSubmit` off: question text and options only. Completed with the setting on: answers and the examinee's own result. Another user's attempt is "not found" (404), not forbidden.

---

### Entering an access code is limited to 5 wrong tries per 15 minutes

Flashcard-set and exam-session codes (6 digits) can only be entered by a signed-in user holding the study permission. Five wrong codes for the same resource lock that user out of it for the rest of the 15-minute window; a correct code is refused too while locked. The lock is per user and resource, so one person's guesses never block someone else.

**Applies when:** A student submits a code to `verify-code`, `with-code` or starts an exam attempt with a code.
**Says:** Wrong code: error `INVALID_CODE`. Malformed code (not 6 digits): `INVALID_CODE_FORMAT` (not counted). Locked: `CODE_LOCKED` with the seconds to wait. If the counter store (Redis) is down the check is refused (`CODE_CHECK_UNAVAILABLE`) rather than skipped. After a correct code the counter resets. Teachers generating a new code keep the existing whitelist and visibility.

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

### Word-family generation is for teachers, 20 per day

Generating word families with AI (`generate`, `generate-root`) is a TEACHER permission, is not charged, and is capped at 20 generations per user per UTC day. Students can read and save word families but not generate them.

**Applies when:** A teacher triggers word-family generation.
**Says:** The 21st attempt of the day is refused with `WORD_FAMILY_DAILY_LIMIT`. If the daily counter (Redis) is down the request is refused (`GENERATION_LIMIT_UNAVAILABLE`). The gateway also rate-limits the route per IP.

---

### AI chat has no per-user message limit

There is no 5-messages-per-minute cap and no 30-messages-per-chat cap any more (the former `RATE_LIMITED` and `CHAT_LIMIT_REACHED` answers are gone), and ai-chat-service no longer reads benefits from anywhere. A regenerate that is refused (404) deletes nothing.

**Applies when:** A user sends or regenerates an AI chat message.
**Says:** The gateway still rate-limits the stream routes per client (10 per minute) and ai-service may answer `AI_BUSY`. Chats and documents of another user answer 404.

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

## Admin Screens

### The admin user detail has no deletion date, and the audit log names the actor

`GET /admin/users/:id` keeps the `deletedAt` field for compatibility but it is always `null`: auth serves only live accounts and its user message carries no such field (an account soft-deleted before RBAC is cleared when it is unbanned). The audit log shows each actor as the display name, and if the name is empty the username (`name || username`, the same rule as the admin user dropdown), resolved from auth in one batch; if auth does not answer, the row shows `#<adminId>` and the log stays readable.

**Applies when:** An admin opens a user or the audit log.
**Says:** `deletedAt` is not a signal of anything; ban state is `isBanned`. Role-change history instead shows the actor's email (or "CLI" for bootstrap changes).

---

## Data Retention

### User data is retained while account is active

User data (quiz sets, flashcard sets, exam rooms, history) is retained indefinitely as long as the account exists. Deleted content is removed immediately from the database; its R2 objects are queued in the same transaction and deleted by a worker shortly after (auth, content, vocabulary, document and ai-chat each have their own `r2_delete_tasks`). There is no automatic purge of inactive accounts in the current implementation.

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

A flashcard set can be protected by an access code. Students must enter the correct code before the study interface is unlocked (limited to 5 wrong tries per 15 minutes, see Exam Integrity). The owner of the set bypasses the code requirement. A correct code is remembered for that user until the owner changes the code (see "A correct code is remembered" below). A set the user has no grant for (not public, not owner, not whitelisted) answers "not found", never "forbidden". The study page `/study-flashcard/:id` itself now requires a signed-in user holding `flashcard:study` or `flashcardset:manage` (decision D13: it used to open without login); an anonymous visitor is sent to `/login`, and the backend still decides whether the set may be opened. Access depends only on the set's own sharing settings, so a demoted teacher's shared set stays studyable.

**Applies when:** A student navigates to a flashcard set that has access code protection enabled.
**Says:** The study interface is locked behind an access dialog. The code must match the host-configured value.

---

### A shared quiz set, flashcard set or exam session opens through one of four grants

Access to a shared resource depends only on its own sharing settings: the owner; `isPublic` (public sets and sessions); the whitelist (user ids the owner added); or the code-granted list (users who entered the current 6-digit code). Anyone else gets "not found", never "forbidden". The role of the owner is not read, so a demoted teacher's shared set stays open. Code attempts are limited to 5 wrong tries per 15 minutes per user and resource (see Exam Integrity); whitelist and code-granted lists each hold at most 2000 users; rotating or switching off the code empties the code-granted list but not the whitelist.

**Applies when:** A user lists, opens, studies, practises or starts an attempt on a shared resource.
**Says:** The check never reveals the code or the lists. The details are in the three rules below.

---

### A correct code is remembered until the owner changes the code

Unlocking a flashcard set, exam session or quiz set with a correct code adds the user to that resource's code-granted list (cap 2000), so later visits need no code. The owner rotating the code (`generate-code`, or a new/cleared `accessCode`) or switching the code off clears the whole list: everyone must enter the new code. Whitelist grants are separate and survive rotation. A quiz-set caller who is already owner, public or whitelisted is checked against the code but is not added to the list.

**Applies when:** A user enters a correct code, or the owner changes the code.
**Says:** After a correct code the next open of the resource succeeds without a code. After rotation or disabling the code, `CODE_REQUIRED` / `requiresCode` applies again. A code rotated while a user unlocks answers 409 `SHARING_CHANGED`.

---

### Sharing lists change by delta and hold at most 2000 users

Quiz-set and flashcard-set owners change sharing with a delta (`addUserIds`, `removeUserIds`, `removeCodeGrantedIds`, `isPublic`, `codeEnabled`), applied in one atomic step; a field not sent is left unchanged, so toggling visibility never wipes the whitelist or code. `removeUserIds` removes a person from the whitelist and the code-granted list; `removeCodeGrantedIds` removes them from the code-granted list only. Ids that are not live accounts are ignored. Exam-session sharing still replaces the whole whitelist but obeys the same cap.

**Applies when:** An owner edits who can open a set or session.
**Says:** A list that would pass 2000 users is refused with 409 `SHARE_LIST_FULL`. A non-owner gets 404.

---

## Quiz Practice

### Students practise only quiz sets they were granted

A student sees a quiz set in "shared with me" when they are on its whitelist, unlocked it with the code, or the set is public and they already have an attempt. A private set with no grant answers "not found". Teachers cannot practise sets they do not own.

**Applies when:** A student lists, opens or starts practice on a quiz set.
**Says:** The access check never reveals the code or the lists. Anonymous callers on a code-protected set learn only that a code is required.

---

### Practice questions carry no answers until submit

Opening or resuming an attempt returns question text and options only. The student's choices are autosaved; on submit the server scores from the stored answers (0-10, two decimals) and ignores any client score. The result (questions, key, verdicts) is frozen in the attempt, so later edits to the set do not change a submitted result.

**Applies when:** A student starts, saves or submits a practice attempt.
**Says:** Saving or submitting an attempt that is already submitted answers 409 `ALREADY_SUBMITTED`. A student keeps their history of submitted attempts per set.

---

### Losing access closes open attempts

An open attempt can be read or saved only while its owner still has access (owner, public, current whitelist or current code). After the whitelist entry is removed or the code rotates, the open attempt answers 404. A submitted attempt stays readable.

**Applies when:** An owner revokes access while a student has an unfinished attempt.
**Says:** The student must unlock again to continue; progress is kept.
