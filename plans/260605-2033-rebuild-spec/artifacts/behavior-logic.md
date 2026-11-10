# Behavior Logic

**Project**: kmaedu
**Generated**: 2026-06-05
**Analysis Scope**: All BL inventory entries from Wave 0 scout

---

## Behavior Logic Index

| Code | Name | Type | Trigger |
|------|------|------|---------|
| BL001 | SessionCleanupCron | scheduled-job | Cron (daily) |
| BL002 | UserEventHandler | event-listener | `auth.user.created` RabbitMQ event |
| BL003 | AuthService | integration | Login, OAuth, token validation |
| BL004 | FinanceClientService | integration | Credit deduction, wallet check |
| BL005 | R2ClientService | integration | File upload to R2 |
| BL006 | R2Service | integration | R2 storage operations |
| BL007 | OcrService | integration | Document OCR processing |
| BL008 | MailService | mail | Account verification, password reset |
| BL009 | SessionValidationMiddleware | middleware | Every non-public HTTP request |
| BL010 | SePayWebhook | webhook | SePay bank transfer callback |
| BL011 | GatewayWebhookProxy | webhook | Forwarded webhook to downstream |
| BL012 | AuthSyncBootstrap | integration | OAuth callback token sync |
| BL013 | CheatingDetectionHook | event-listener | Tab switch, window blur, devtools |
| BL014 | ExportPDFHook | integration | PDF generation and download |
| BL015 | GenerationGuardHook | scheduled-job | AI generation throttle |
| BL016 | ExamQuizPagePolling | scheduled-job | Auto-save progress every 30s |

---

## BL001: SessionCleanupCron

**Type**: scheduled-job
**Trigger**: Cron (daily, time-based)
**Source File**: `kmaedu-be/apps/auth-service/src/session-cleanup.cron.ts`
**Source Symbol**: `SessionCleanupCron` (class with `@Cron()` decorator)

### Description

Daily cron job that scans all `UserSession` records and deactivates expired sessions. Runs at a configured schedule (typically midnight). Uses Prisma to find sessions where `expiresAt < now` and `isActive === true`, then bulk-deactivates them in a transaction.

### Related Modules

- auth-service: AuthModule, SessionRepository

### Related Routes

- (internal cleanup, no client-facing route)

### Related Data Models

- MODEL-002: UserSession

---

## BL002: UserEventHandler

**Type**: event-listener
**Trigger**: RabbitMQ topic `auth.user.created` on `kmaedu.events` durable exchange
**Source File**: `kmaedu-be/apps/finance-service/src/user-event.handler.ts`
**Source Symbol**: `UserEventHandler` (class with `@EventHandler()` or equivalent)

### Description

Idempotent event listener that handles the `auth.user.created` RabbitMQ event. On user creation, it creates a Wallet record for the new user and optionally awards a welcome bonus (20 credits). Checks if wallet already exists before creation to ensure idempotency.

### Related Modules

- finance-service: FinanceModule, WalletModule
- auth-service: AuthModule (publishes event)

### Related Routes

- (event-driven, no HTTP route)

### Related Data Models

- MODEL-027: Wallet
- MODEL-001: User

---

## BL003: AuthService

**Type**: integration
**Trigger**: Login form submit, OAuth callback, token refresh
**Source File**: `kmaedu-be/apps/auth-service/src/auth.service.ts`
**Source Symbol**: `AuthService` (class)

### Description

Core authentication service. Handles email/password login, Google OAuth flow (initiation + callback), JWT token generation and refresh, session creation with device fingerprinting, and account verification. Integrates with the database (Prisma) and Google OAuth provider.

### Related Modules

- auth-service: AuthModule

### Related Routes

- (POST) `/api/v1/auth/login`
- (POST) `/api/v1/auth/register`
- (GET) `/api/v1/auth/google`
- (GET) `/api/v1/auth/google/callback`
- (POST) `/api/v1/auth/google/one-tap`
- (POST) `/api/v1/auth/refresh`
- (POST) `/api/v1/auth/logout`
- (POST) `/api/v1/auth/sync-refresh-token`
- (GET) `/api/v1/auth/me`
- (POST) `/api/v1/auth/sendVerificationEmail`
- (POST) `/api/v1/auth/verifyAccount`
- (POST) `/api/v1/auth/send-code-reset-password`
- (POST) `/api/v1/auth/reset-password`
- (POST) `/api/v1/auth/send-code-change-password`
- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/exchange`

### Related Data Models

- MODEL-001: User
- MODEL-002: UserSession
- MODEL-003: VerifyAccountCode
- MODEL-004: ResetPasswordCode

---

## BL004: FinanceClientService

**Type**: integration
**Trigger**: Credit-deductor feature (AI generation, document processing)
**Source File**: `kmaedu-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts`
**Source Symbol**: `FinanceClientService` (class, gRPC client or HTTP client to finance-service)

### Description

Finance service client used by exam-service to check user wallet balance and deduct credits before allowing AI generation or document processing. Queries wallet info and emits debit transactions. Note: `FREE_MODE = true` shipped in production code path — credit gating is bypassed.

### Related Modules

- exam-service: ExamServiceModule, AIGenerationModule

### Related Routes

- (internal gRPC/HTTP) Wallet info and credit deduction

### Related Data Models

- MODEL-027: Wallet
- MODEL-028: WalletTransaction

---

## BL005: R2ClientService

**Type**: integration
**Trigger**: File upload in exam-service context (AI generation input files, avatar upload)
**Source File**: `kmaedu-be/apps/exam-service/src/modules/r2/r2-client.service.ts`
**Source Symbol**: `R2ClientService` (class, gRPC client to r2-service)

### Description

R2 storage client used by exam-service for uploading and retrieving user files. Used during AI generation (upload source documents) and profile operations (avatar/banner upload via proxy). Calls r2-service via gRPC.

### Related Modules

- exam-service: ExamServiceModule, R2Module

### Related Routes

- (internal gRPC) R2 storage operations

### Related Data Models

- MODEL-029: UserStorage

---

## BL006: R2Service

**Type**: integration
**Trigger**: Direct file storage operations via gateway proxy
**Source File**: `kmaedu-be/apps/r2-service/src/r2.service.ts`
**Source Symbol**: `R2Service` (class, Cloudflare R2 SDK client)

### Description

R2 storage service managing Cloudflare R2 bucket operations. Handles file upload (images up to 2MB via `/api/v1/r2/image`), file deletion, and URL generation. Stores files with user-scoped keys and returns CDN URLs.

### Related Modules

- r2-service: R2Module

### Related Routes

- (POST) `/api/v1/r2/image`

### Related Data Models

- MODEL-029: UserStorage

---

## BL007: OcrService

**Type**: integration
**Trigger**: Document upload for OCR processing
**Source File**: `kmaedu-be/apps/ocr-service/src/ocr.service.ts`
**Source Symbol**: `OcrService` (class, gRPC client or HTTP)

### Description

OCR service client used by exam-service for extracting text from uploaded documents (PDFs, images) before AI generation. Calls ocr-service via gRPC to process document images and return machine-readable text for quiz/flashcard generation.

### Related Modules

- exam-service: ExamServiceModule, AIGenerationModule

### Related Routes

- (internal gRPC) OCR document processing

### Related Data Models

- MODEL-029: UserStorage
- MODEL-030: Document

---

## BL008: MailService

**Type**: mail
**Trigger**: User actions requiring email notification
**Source File**: `kmaedu-be/libs/common/src/services/mail.service.ts`
**Source Symbol**: `MailService` (class with `send*` methods)

### Description

Email service for transactional emails. Sends account verification emails (6-digit OTP), password reset emails, and change-password confirmation emails. Uses a configured SMTP provider or transactional email service (e.g., Resend, SendGrid, AWS SES).

### Related Modules

- auth-service: AuthModule (calls MailService)
- common: CommonModule

### Related Routes

- (POST) `/api/v1/auth/sendVerificationEmail`
- (POST) `/api/v1/auth/verifyAccount`
- (POST) `/api/v1/auth/send-code-reset-password`
- (POST) `/api/v1/auth/reset-password`
- (POST) `/api/v1/auth/send-code-change-password`
- (POST) `/api/v1/auth/change-password`

### Related Data Models

- MODEL-003: VerifyAccountCode
- MODEL-004: ResetPasswordCode

---

## BL009: SessionValidationMiddleware

**Type**: middleware
**Trigger**: Every non-public HTTP request to backend services
**Source File**: `kmaedu-be/libs/common/src/middleware/session-validation.middleware.ts`
**Source Symbol**: `SessionValidationMiddleware` (class implementing `NestMiddleware`)

### Description

Request-level middleware that validates the user's session token on every protected route. Extracts bearer token from `Authorization` header or `token`/`accessToken` cookie. Queries `UserSession` in the database: rejects if `isActive === false` (SESSION_INVALIDATED) or `expiresAt < now` (SESSION_EXPIRED). Returns 401 with error code on failure. Applied globally via NestJS middleware registration.

### Related Modules

- common: CommonModule (re-exported in all service modules)

### Related Routes

- All routes protected by `AuthGuard` (Bearer auth routes)

### Related Data Models

- MODEL-002: UserSession

---

## BL010: SePayWebhook

**Type**: webhook
**Trigger**: Incoming bank transfer notification from SePay
**Source File**: `kmaedu-be/apps/finance-service/src/webhook.controller.ts`
**Source Symbol**: `WebhookController` (class with webhook route handler)

### Description

Incoming webhook controller receiving payment notifications from SePay virtual account provider. Verifies webhook signature (API key), parses payment confirmation (VA number, amount, transfer content), and updates Payment status from `unpaid` to `paid`. Triggers wallet credit top-up or subscription activation.

### Related Modules

- finance-service: FinanceModule, WalletModule

### Related Routes

- (POST) `/api/v1/webhook/sepay`

### Related Data Models

- MODEL-026: Payment
- MODEL-027: Wallet
- MODEL-028: WalletTransaction

---

## BL011: GatewayWebhookProxy

**Type**: webhook
**Trigger**: Incoming webhook forwarded through gateway to downstream service
**Source File**: `kmaedu-be/apps/gateway-service/src/controllers/webhook-proxy.controller.ts`
**Source Symbol**: `WebhookProxyController` (class)

### Description

Gateway-level webhook proxy that forwards incoming webhook requests to downstream services. The SePay payment webhook is received at the gateway and proxied to finance-service. Maintains webhook signature verification and request logging.

### Related Modules

- gateway-service: GatewayModule

### Related Routes

- (POST) `/api/v1/webhook/sepay` (gateway receives, proxies to finance-service)

### Related Data Models

- MODEL-026: Payment

---

## BL012: AuthSyncBootstrap

**Type**: integration
**Trigger**: OAuth redirect URL with token params (`?token=&refreshToken=&sessionId=`)
**Source File**: `kmaedu-fe/src/components/auth/AuthSyncBootstrap.tsx`
**Source Symbol**: `AuthSyncBootstrap` (React component)

### Description

Client-side OAuth callback handler. Reads `token`, `refreshToken`, and `sessionId` from URL query params on Google OAuth redirect. Stores tokens in localStorage and sets a cookie, then calls `syncRefreshTokenApi` to persist the session server-side. Also sets the `X-Device-ID` header via `getOrCreateDeviceId`.

### Related Modules

- kmaedu-fe: auth flow, API client

### Related Routes

- (GET) `/api/v1/auth/google/callback` (frontend-side handling)
- (POST) `/api/v1/auth/sync-refresh-token`

### Related Data Models

- MODEL-002: UserSession

---

## BL013: CheatingDetectionHook

**Type**: event-listener
**Trigger**: Browser events during active exam attempt
**Source File**: `kmaedu-fe/src/hooks/useCheatingDetection.ts`
**Source Symbol**: `useCheatingDetection` (React hook)

### Description

Client-side exam integrity hook. Registers listeners for tab visibility changes (`visibilitychange`), window blur (`blur`), copy/paste events, right-click (`contextmenu`), fullscreen exit (`fullscreenchange`), and print screen. On each violation, calls `POST /api/v1/cheatinglogs` to log the incident against the current attempt. Shows `CheatingWarningModal` to the student.

### Related Modules

- kmaedu-fe: ExamQuizPage, CheatingWarningModal

### Related Routes

- (POST) `/api/v1/cheatinglogs`

### Related Data Models

- MODEL-020: CheatingLog
- MODEL-019: ExamAttempt

---

## BL014: ExportPDFHook

**Type**: integration
**Trigger**: User clicks "Export PDF" on PDF history item
**Source File**: `kmaedu-fe/src/hooks/useExportPDF.ts`
**Source Symbol**: `useExportPDF` (React hook)

### Description

Client-side hook for generating and downloading PDF files from processed document history. Fetches document content, renders to PDF using browser APIs, and triggers browser download via blob URL.

### Related Modules

- kmaedu-fe: HistoryPage, PDFHistoryPage

### Related Routes

- (GET) `/api/v1/student/recent-flashcards` (PDF list)
- (GET) `/api/v1/student/recent-exams` (exam history)

### Related Data Models

- MODEL-029: UserStorage

---

## BL015: GenerationGuardHook

**Type**: scheduled-job
**Trigger**: AI generation page mount, tab visibility change
**Source File**: `kmaedu-fe/src/hooks/useGenerationGuard.ts`
**Source Symbol**: `useGenerationGuard` (React hook)

### Description

Client-side guard that manages AI generation state persistence and resume logic. Reads `pending_generation_job` key from localStorage on mount. If a job is pending, shows `PendingJobDialog` and polls `getJobStatus` every 10s (up to 360 attempts = 60 min). On tab visibility change, triggers visibility check for background polling.

### Related Modules

- kmaedu-fe: AIToolPage, PendingJobDialog

### Related Routes

- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

### Related Data Models

- MODEL-011: HistoryGeneratedQuizz
- MODEL-016: HistoryGeneratedFlashcard

---

## BL016: ExamQuizPagePolling

**Type**: scheduled-job
**Trigger**: Active exam attempt, time-based interval
**Source File**: `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx`
**Source Symbol**: `ExamQuizPage` (component with `setInterval` + `sendBeacon`)

### Description

Exam quiz page background auto-save mechanism. Uses `setInterval` to poll `updateExamAttemptProgressApi` every 30 seconds during an active exam attempt, persisting current answer state, question index, and time spent. On `beforeunload` event, calls `navigator.sendBeacon` to fire a final auto-save request, ensuring answers are not lost on accidental tab close.

### Related Modules

- kmaedu-fe: ExamQuizPage

### Related Routes

- (PUT) `/api/v1/examattempts/:attemptId/progress`

### Related Data Models

- MODEL-019: ExamAttempt

---

## Summary

- **Total Behavior Logic Items**: 16
- **By Type**:
  - scheduled-job: 3 (BL001, BL015, BL016)
  - event-listener: 2 (BL002, BL013)
  - integration: 7 (BL003–BL007, BL012, BL014)
  - mail: 1 (BL008)
  - middleware: 1 (BL009)
  - webhook: 2 (BL010–BL011)

---

## Cross-Reference Validation

- [x] All BL### codes are unique (BL001–BL016)
- [x] All BL### Source File paths match Wave 0 scout `## Background Logic Source Inventory` entries
- [x] All BL### Source Symbol fields are single-valued (Rule C2)
- [x] All sentinel entries (`_(none found)_`) from scout inventory are skipped (no BL items emitted)
- [x] `[SIGNAL_INFERRED]` entries from scout inventory are included with explicit `[SIGNAL_INFERRED]` tag (BL013, BL014, BL015, BL016)
- [x] Aggregation is avoided: each inventory entry → exactly one BL item
- [x] No BL items emit for Python FastAPI (sentinel only)
- [x] No orphaned behavior logic references

---

## Client-Side Logic

### Debounce / Throttle

N/A — no debounce or throttle patterns detected in the current scan.

### Optimistic UI

**BL-C01 — Session card pin toggle**
pattern: optimistic-ui
source: `kmaedu-fe/src/pages/k/MyExamsPage.tsx:191` (inline handler)
trigger: user clicks pin/unpin on exam session card
optimistic-action: immediately updates `examAttempts` state with toggled `isPinned` flag
rollback: reverts `isPinned` on API error + shows error toast

**BL-C02 — Flashcard study progress**
pattern: optimistic-ui
source: `kmaedu-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx:221`
trigger: user navigates to next card
optimistic-action: immediately adds current card ID to `studiedCards` Set
rollback: silent (fire-and-forget API call `addStudiedCardApi`)

### Polling

**BL-C03 — AI job status polling**
pattern: polling
source: `kmaedu-fe/src/hooks/useGenerationGuard.ts`
trigger: `pending_generation_job` key exists in localStorage on mount
interval: 10000ms (10s)
stops-when: job status changes to "completed" or "failed", or user cancels
max-attempts: 360 (60 minutes)

**BL-C04 — Exam attempt auto-save**
pattern: polling
source: `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx` (setInterval)
trigger: active exam attempt (status = IN_PROGRESS)
interval: 30000ms (30s)
stops-when: attempt status changes to COMPLETED/CANCELLED, or tab closes

### Upload Progress

N/A — no explicit upload progress tracking detected (XHR upload progress, FormData onUploadProgress, or similar).

### Realtime (WebSocket / SSE / EventSource)

N/A — no WebSocket or SSE patterns detected in the current scan. AI chat uses SSE streaming at the API level (`/api/v1/ai-chat/:chatId/stream`) but the client-side SSE consumption is handled by the API layer, not a standalone WebSocket/SSE hook.