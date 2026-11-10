# API Map — examio

**Project**: examio
**Generated**: 2026-06-05
**Sources**: `route-list.md` (gateway routes, authoritative), `behavior-logic.md` (BL handlers). Gateway routing since 2026-10-20 is defined in `examio-be/apps/gateway-service/config/routes.yaml` (no proxy controllers; `BL` names such as `GatewayWebhookProxy` refer to the downstream handler behind the YAML entry)

Groups backend routes by domain. Each route maps to a BL handler (from `behavior-logic.md § Source Symbol`) or is marked `[UNMAPPED]`. Auth column uses `PERM###` where defined, otherwise `Bearer` / `public` / `ApiKey`.

---

## Auth

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/auth/login | BL003 | public | auth |
| POST | /api/v1/auth/register | BL003 | public | auth |
| POST | /api/v1/auth/send-code-reset-password | BL003 | public | auth |
| POST | /api/v1/auth/reset-password | BL003 | public | auth |
| POST | /api/v1/auth/refresh | BL003 | public | auth |
| POST | /api/v1/auth/logout | BL003 | Bearer | auth |
| GET | /api/v1/auth/google | BL003 | public | auth |
| GET | /api/v1/auth/google/callback | BL003 | public | auth |
| POST | /api/v1/auth/google/one-tap | BL003 | public | auth |
| POST | /api/v1/auth/sync-refresh-token | BL003 | Bearer | auth |
| GET | /api/v1/auth/me | BL003 | Bearer | auth |
| POST | /api/v1/auth/sendVerificationEmail | BL008 | Bearer | auth |
| POST | /api/v1/auth/verifyAccount | BL008 | Bearer | auth |
| POST | /api/v1/auth/send-code-change-password | BL008 | Bearer | auth |
| POST | /api/v1/auth/change-password | BL008 | Bearer | auth |
| POST | /api/v1/auth/exchange | BL003 | public | auth |

---

## Profile

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/profile | [UNMAPPED] | Bearer | auth |
| PUT | /api/v1/profile | [UNMAPPED] | Bearer | auth |
| POST | /api/v1/profile/upload-avatar | BL005 | Bearer | auth |
| POST | /api/v1/profile/upload-banner | BL005 | Bearer | auth |

---

## Devices

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/devices | [UNMAPPED] | Bearer | auth |
| DELETE | /api/v1/devices/:sessionId | [UNMAPPED] | Bearer | auth |
| POST | /api/v1/devices/logout-all-others | [UNMAPPED] | Bearer | auth |

---

## Quiz Sets

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/quizsets | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/stats | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/users/search | [UNMAPPED] | `user:search` | content |
| GET | /api/v1/quizsets/:id/sharing | [UNMAPPED] | `content:share` | content |
| PUT | /api/v1/quizsets/:id/sharing | [UNMAPPED] | `content:share` | content |
| POST | /api/v1/quizsets/:id/generate-code | [UNMAPPED] | `content:share` | content |
| GET | /api/v1/quizsets/list/all | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/:id | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/quizsets/:id | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/quizsets/:id | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/:id/questions | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets/save-history-to-quizset | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/questions | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | [UNMAPPED] | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer | content |

---

## Flashcard Sets

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/flashcardsets | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/stats | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/users/search | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/:id/flashcards | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/:id/labels | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/:id/share | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/:id/labels | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/flashcardsets/:id/labels/:labelId | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/:setId/flashcards | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/flashcardsets/:setId/flashcards/:cardId | [UNMAPPED] | Bearer | content |
| DELETE | /api/v1/flashcardsets/:setId/flashcards/:cardId | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/study/:id/access | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/study/:id/info | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/study/:id | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/verify-code | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/with-code | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcardsets/:id/sharing | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/flashcardsets/:id/sharing | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcardsets/:id/generate-code | [UNMAPPED] | Bearer | content |

---

## Exam Rooms

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/examrooms/list | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examrooms/list-all | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examrooms/detail/:id | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examrooms/get-public/:id | [UNMAPPED] | public | assessment |
| POST | /api/v1/examrooms | [UNMAPPED] | Bearer | assessment |
| PUT | /api/v1/examrooms/:id | [UNMAPPED] | Bearer | assessment |
| DELETE | /api/v1/examrooms/:id | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examrooms/:examRoomId/sessions | [UNMAPPED] | Bearer | assessment |

---

## Exam Sessions

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/examsessions/list | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/get-by-id/:id | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/get-public/:id | [UNMAPPED] | public | assessment |
| POST | /api/v1/examsessions | [UNMAPPED] | Bearer | assessment |
| PUT | /api/v1/examsessions/:id | [UNMAPPED] | Bearer | assessment |
| DELETE | /api/v1/examsessions/:id | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/users/search | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/access | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/info | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id | [UNMAPPED] | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/with-code | [UNMAPPED] | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/verify-code | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/stats | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/:id/sharing | [UNMAPPED] | Bearer | assessment |
| PUT | /api/v1/examsessions/:id/sharing | [UNMAPPED] | Bearer | assessment |
| POST | /api/v1/examsessions/:id/generate-code | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examsessions/room/:roomId/available-labels | [UNMAPPED] | Bearer | assessment |

---

## Exam Attempts

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/examattempts/start | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/list | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/history-stats | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-session/:sessionId | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/quiz | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/detail | [UNMAPPED] | Bearer | assessment |
| PUT | /api/v1/examattempts/:attemptId/progress | BL016 | Bearer | assessment |
| POST | /api/v1/examattempts/:attemptId/submit | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/secure-quiz | [UNMAPPED] | Bearer | assessment |
| POST | /api/v1/examattempts/:attemptId/secure-submit | [UNMAPPED] | Bearer | assessment |

---

## Subjects

> Owner: ai-chat-service since phase 13 (public routes, upstream `aichat`); previously exam-service.

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/subjects/categories | [UNMAPPED] | public | ai-chat |
| GET | /api/v1/subjects | [UNMAPPED] | public | ai-chat |
| GET | /api/v1/subjects/:id | [UNMAPPED] | public | ai-chat |
| GET | /api/v1/subjects/slug/:slug | [UNMAPPED] | public | ai-chat |

---

## Wallet

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/wallet/details | BL004 | Bearer | finance |

---

## Payment

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/payment/create | [UNMAPPED] | Bearer | finance |
| GET | /api/v1/payment/status/:paymentId | [UNMAPPED] | Bearer | finance |
| GET | /api/v1/payment/subscription | [UNMAPPED] | Bearer | finance |
| GET | /api/v1/payment/subscription/plans | [UNMAPPED] | Bearer | finance |
| DELETE | /api/v1/payment/cancel/:paymentId | [UNMAPPED] | Bearer | finance |

---

## Student

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/student/recent-flashcards | [UNMAPPED] | Bearer | content |
| GET | /api/v1/student/recent-exams | [UNMAPPED] | Bearer | assessment |
| POST | /api/v1/student/pin-flashcard/:id | [UNMAPPED] | Bearer | content |

---

## AI Study

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/ai/quick-upload | [UNMAPPED] | Bearer | document |
| POST | /api/v1/ai/upload | [UNMAPPED] | Bearer | document |
| POST | /api/v1/ai/generate-from-file | [UNMAPPED] | Bearer | content |
| GET | /api/v1/ai/recent-uploads | [UNMAPPED] | Bearer | content |
| GET | /api/v1/ai/models | [UNMAPPED] | Bearer | content |
| GET | /api/v1/ai/upload/:uploadId | [UNMAPPED] | Bearer | document |
| DELETE | /api/v1/ai/upload/:uploadId | [UNMAPPED] | Bearer | document |
| GET | /api/v1/ai/upload/:uploadId/history | [UNMAPPED] | Bearer | content |
| POST | /api/v1/ai/regenerate/:uploadId | [UNMAPPED] | Bearer | content |
| GET | /api/v1/ai/job/:jobId | BL015 | Bearer | content |
| DELETE | /api/v1/ai/job/:jobId | BL015 | Bearer | content |
| POST | /api/v1/ai/upload-image | [UNMAPPED] | Bearer | document |

---

## AI Chat

> Owner: ai-chat-service since phase 13 (gateway upstream `aichat`); previously exam-service.

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/ai-chat | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat | [UNMAPPED] | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/messages | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/message | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/stream | [UNMAPPED] | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/exists | [UNMAPPED] | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId | [UNMAPPED] | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/documents | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/documents | [UNMAPPED] | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | [UNMAPPED] | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/message/:messageId | [UNMAPPED] | Bearer | ai-chat |
| PATCH | /api/v1/ai-chat/message/:messageId | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | [UNMAPPED] | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | [UNMAPPED] | Bearer | ai-chat |

---

## Flashcard Study

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/flashcard-study/session | [UNMAPPED] | Bearer | content |
| PUT | /api/v1/flashcard-study/session/:sessionId | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcard-study/session/:sessionId/complete | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcard-study/session/:sessionId/review | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcard-study/cards/:flashCardSetId | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcard-study/history/:flashCardSetId | [UNMAPPED] | Bearer | content |
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | [UNMAPPED] | Bearer | content |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | [UNMAPPED] | Bearer | content |

---

## Quiz Practice

Phase 07 (2026-10-20). Detail: `route-list.md` § Quiz Practice.

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| GET | /api/v1/quiz-practice/sets | [UNMAPPED] | `quiz:practice` | content |
| GET | /api/v1/quiz-practice/sets/:id/access | [UNMAPPED] | Public (token optional) | content |
| POST | /api/v1/quiz-practice/sets/:id/unlock | [UNMAPPED] | `quiz:practice` | content |
| POST | /api/v1/quiz-practice/attempts | [UNMAPPED] | Owner or `quiz:practice` | content |
| GET | /api/v1/quiz-practice/attempts | [UNMAPPED] | Bearer (own) | content |
| GET | /api/v1/quiz-practice/attempts/:id | [UNMAPPED] | Bearer (own) | content |
| PUT | /api/v1/quiz-practice/attempts/:id | [UNMAPPED] | Bearer (own) | content |
| POST | /api/v1/quiz-practice/attempts/:id/submit | [UNMAPPED] | Bearer (own) | content |

---

## Cheating Logs

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/cheatinglogs | BL013 | Bearer | assessment |
| GET | /api/v1/cheatinglogs/attempt/:attemptId | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:sessionId/stats | [UNMAPPED] | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | [UNMAPPED] | Bearer | assessment |

---

## R2 Storage

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/r2/image | BL006 | Bearer | document |

---

## Webhook

| Method | Path | Handler BL### | Auth | Owner |
|--------|------|---------------|------|-------|
| POST | /api/v1/webhook/sepay | BL010, BL011 | ApiKey | finance |

---

## BL Handler Index

| BL### | Handler | Type | Mapped Routes |
|-------|---------|------|---------------|
| BL003 | AuthService | integration | Auth routes (login, register, OAuth, token, logout, me, exchange) |
| BL004 | FinanceClientService | integration | GET /api/v1/wallet/details |
| BL005 | R2ClientService | integration | POST /api/v1/profile/upload-avatar, POST /api/v1/profile/upload-banner |
| BL006 | R2Service | integration | POST /api/v1/r2/image |
| BL008 | MailService | mail | sendVerificationEmail, verifyAccount, send-code-reset-password, reset-password, send-code-change-password, change-password |
| BL009 | SessionValidationMiddleware | middleware | All Bearer-authenticated routes (global) |
| BL010 | SePayWebhook | webhook | POST /api/v1/webhook/sepay (finance-service) |
| BL011 | GatewayWebhookProxy | webhook | POST /api/v1/webhook/sepay (gateway proxy) |
| BL013 | CheatingDetectionHook | background | POST /api/v1/cheatinglogs |
| BL015 | GenerationGuardHook | background | GET /api/v1/ai/job/:jobId, DELETE /api/v1/ai/job/:jobId |
| BL016 | ExamQuizPagePolling | background | PUT /api/v1/examattempts/:attemptId/progress |

---

## Summary

| Domain | Total Routes | Mapped | [UNMAPPED] |
|--------|-------------|--------|------------|
| Auth | 16 | 16 | 0 |
| Profile | 4 | 2 | 2 |
| Devices | 3 | 0 | 3 |
| Quiz Sets | 24 | 0 | 24 |
| Flashcard Sets | 29 | 0 | 29 |
| Exam Rooms | 8 | 0 | 8 |
| Exam Sessions | 17 | 0 | 17 |
| Exam Attempts | 11 | 1 | 10 |
| Subjects | 4 | 0 | 4 |
| Wallet | 1 | 1 | 0 |
| Payment | 5 | 0 | 5 |
| Student | 3 | 0 | 3 |
| AI Study | 12 | 2 | 10 |
| AI Chat | 14 | 0 | 14 |
| Flashcard Study | 8 | 0 | 8 |
| Quiz Practice | 8 | 0 | 8 |
| Cheating Logs | 4 | 1 | 3 |
| R2 Storage | 1 | 1 | 0 |
| Webhook | 1 | 1 | 0 |
| **Total** | **173** | **25** | **148** |

Owner column (phase 19): the service behind each route, from the `upstream` of its `routes.yaml` entry. Rows by owner: content 79, assessment 41, auth 23, ai-chat 18, finance 7, document 5. Study-room, vocabulary and admin routes are not inventoried in this map.

## Unresolved

- `BL004` (named `FinanceClientService` in `behavior-logic.md`) maps only to `/wallet/details`. That class no longer exists: finance calls go through the shared `FinanceClient` in `libs/grpc` (`libs/grpc/src/clients/finance.client.ts`) and the `FREE_MODE = true` constant it described is replaced by the dev-only `AI_FREE_MODE` flag. Other finance/payment routes are unmapped.
- `BL005` (R2ClientService) covers avatar/banner upload but no other R2 operations (`BL005` names the pre-split exam-service client; the clients now live in auth, content and ai-chat `src/clients/r2.client.ts`).
- BL inventory covers 16 behavior logic items; 148 routes lack explicit BL mapping. These routes are handled by NestJS controllers/services scanned in Wave 0 but not yet attributed to a named BL entry.
- `BL001` (SessionCleanupCron) and `BL002` (UserRegisteredHandler) have no HTTP route — internal/scheduled/event-driven only.
- `BL007` (OcrService; OCR now runs in ai-service on `document.uploaded`), `BL012` (AuthSyncBootstrap), `BL014` (ExportPDFHook) — no HTTP route mapping.