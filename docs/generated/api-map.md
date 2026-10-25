# API Map — examio

**Project**: examio
**Generated**: 2026-06-05
**Sources**: `route-list.md` (gateway routes, authoritative), `behavior-logic.md` (BL handlers). Gateway routing since 2026-10-20 is defined in `examio-be/apps/gateway-service/config/routes.yaml` (no proxy controllers; `BL` names such as `GatewayWebhookProxy` refer to the downstream handler behind the YAML entry)

Groups backend routes by domain. Each route maps to a BL handler (from `behavior-logic.md § Source Symbol`) or is marked `[UNMAPPED]`. Auth column uses `PERM###` where defined, otherwise `Bearer` / `public` / `ApiKey`.

---

## Auth

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/auth/login | BL003 | public |
| POST | /api/v1/auth/register | BL003 | public |
| POST | /api/v1/auth/send-code-reset-password | BL003 | public |
| POST | /api/v1/auth/reset-password | BL003 | public |
| POST | /api/v1/auth/refresh | BL003 | public |
| POST | /api/v1/auth/logout | BL003 | Bearer |
| GET | /api/v1/auth/google | BL003 | public |
| GET | /api/v1/auth/google/callback | BL003 | public |
| POST | /api/v1/auth/google/one-tap | BL003 | public |
| POST | /api/v1/auth/sync-refresh-token | BL003 | Bearer |
| GET | /api/v1/auth/me | BL003 | Bearer |
| POST | /api/v1/auth/sendVerificationEmail | BL008 | Bearer |
| POST | /api/v1/auth/verifyAccount | BL008 | Bearer |
| POST | /api/v1/auth/send-code-change-password | BL008 | Bearer |
| POST | /api/v1/auth/change-password | BL008 | Bearer |
| POST | /api/v1/auth/exchange | BL003 | public |

---

## Profile

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/profile | [UNMAPPED] | Bearer |
| PUT | /api/v1/profile | [UNMAPPED] | Bearer |
| POST | /api/v1/profile/upload-avatar | BL005 | Bearer |
| POST | /api/v1/profile/upload-banner | BL005 | Bearer |

---

## Devices

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/devices | [UNMAPPED] | Bearer |
| DELETE | /api/v1/devices/:sessionId | [UNMAPPED] | Bearer |
| POST | /api/v1/devices/logout-all-others | [UNMAPPED] | Bearer |

---

## Quiz Sets

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/quizsets | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/stats | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/users/search | [UNMAPPED] | `user:search` |
| GET | /api/v1/quizsets/:id/sharing | [UNMAPPED] | `content:share` |
| PUT | /api/v1/quizsets/:id/sharing | [UNMAPPED] | `content:share` |
| POST | /api/v1/quizsets/:id/generate-code | [UNMAPPED] | `content:share` |
| GET | /api/v1/quizsets/list/all | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/:id | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets | [UNMAPPED] | Bearer |
| PUT | /api/v1/quizsets/:id | [UNMAPPED] | Bearer |
| DELETE | /api/v1/quizsets/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/:id/questions | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets/save-history-to-quizset | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets/:quizSetId/questions | [UNMAPPED] | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels | [UNMAPPED] | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | [UNMAPPED] | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | [UNMAPPED] | Bearer |

---

## Flashcard Sets

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/flashcardsets | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/stats | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/users/search | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/:id/flashcards | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/:id/labels | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets | [UNMAPPED] | Bearer |
| PUT | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer |
| DELETE | /api/v1/flashcardsets/:id | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/:id/share | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/:id/labels | [UNMAPPED] | Bearer |
| PUT | /api/v1/flashcardsets/:id/labels/:labelId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/:setId/flashcards | [UNMAPPED] | Bearer |
| PUT | /api/v1/flashcardsets/:setId/flashcards/:cardId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/flashcardsets/:setId/flashcards/:cardId | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/study/:id/access | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/study/:id/info | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/study/:id | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/study/:id/verify-code | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/study/:id/with-code | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcardsets/:id/sharing | [UNMAPPED] | Bearer |
| PUT | /api/v1/flashcardsets/:id/sharing | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcardsets/:id/generate-code | [UNMAPPED] | Bearer |

---

## Exam Rooms

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/examrooms/list | [UNMAPPED] | Bearer |
| GET | /api/v1/examrooms/list-all | [UNMAPPED] | Bearer |
| GET | /api/v1/examrooms/detail/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/examrooms/get-public/:id | [UNMAPPED] | public |
| POST | /api/v1/examrooms | [UNMAPPED] | Bearer |
| PUT | /api/v1/examrooms/:id | [UNMAPPED] | Bearer |
| DELETE | /api/v1/examrooms/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/examrooms/:examRoomId/sessions | [UNMAPPED] | Bearer |

---

## Exam Sessions

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/examsessions/list | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/get-by-id/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/get-public/:id | [UNMAPPED] | public |
| POST | /api/v1/examsessions | [UNMAPPED] | Bearer |
| PUT | /api/v1/examsessions/:id | [UNMAPPED] | Bearer |
| DELETE | /api/v1/examsessions/:id | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/users/search | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/study/:id/access | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/study/:id/info | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/study/:id | [UNMAPPED] | Bearer |
| POST | /api/v1/examsessions/study/:id/with-code | [UNMAPPED] | Bearer |
| POST | /api/v1/examsessions/study/:id/verify-code | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/study/:id/stats | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/:id/sharing | [UNMAPPED] | Bearer |
| PUT | /api/v1/examsessions/:id/sharing | [UNMAPPED] | Bearer |
| POST | /api/v1/examsessions/:id/generate-code | [UNMAPPED] | Bearer |
| GET | /api/v1/examsessions/room/:roomId/available-labels | [UNMAPPED] | Bearer |

---

## Exam Attempts

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/examattempts/start | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/list | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/history-stats | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/list-by-session/:sessionId | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/:attemptId/quiz | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/:attemptId/detail | [UNMAPPED] | Bearer |
| PUT | /api/v1/examattempts/:attemptId/progress | BL016 | Bearer |
| POST | /api/v1/examattempts/:attemptId/submit | [UNMAPPED] | Bearer |
| GET | /api/v1/examattempts/:attemptId/secure-quiz | [UNMAPPED] | Bearer |
| POST | /api/v1/examattempts/:attemptId/secure-submit | [UNMAPPED] | Bearer |

---

## Subjects

> Owner: ai-chat-service since phase 13 (public routes, upstream `aichat`); previously exam-service.

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/subjects/categories | [UNMAPPED] | public |
| GET | /api/v1/subjects | [UNMAPPED] | public |
| GET | /api/v1/subjects/:id | [UNMAPPED] | public |
| GET | /api/v1/subjects/slug/:slug | [UNMAPPED] | public |

---

## Wallet

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/wallet/details | BL004 | Bearer |

---

## Payment

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/payment/create | [UNMAPPED] | Bearer |
| GET | /api/v1/payment/status/:paymentId | [UNMAPPED] | Bearer |
| GET | /api/v1/payment/subscription | [UNMAPPED] | Bearer |
| GET | /api/v1/payment/subscription/plans | [UNMAPPED] | Bearer |
| DELETE | /api/v1/payment/cancel/:paymentId | [UNMAPPED] | Bearer |

---

## Student

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/student/recent-flashcards | [UNMAPPED] | Bearer |
| GET | /api/v1/student/recent-exams | [UNMAPPED] | Bearer |
| POST | /api/v1/student/pin-flashcard/:id | [UNMAPPED] | Bearer |

---

## AI Study

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/ai/quick-upload | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/generate-from-file | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/recent-uploads | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/models | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/upload/:uploadId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai/upload/:uploadId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/upload/:uploadId/history | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/regenerate/:uploadId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/job/:jobId | BL015 | Bearer |
| DELETE | /api/v1/ai/job/:jobId | BL015 | Bearer |
| POST | /api/v1/ai/upload-image | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/ingest | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/ingest | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/ingest/:jobId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/graph/job/:jobId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/graph/document/:documentId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-stats | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/knowledge-folders | [UNMAPPED] | Bearer |
| PUT | /api/v1/ai/tutor/knowledge-folders/:folderId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-folders/:folderId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders/:folderId/contents | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/search | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-files/:fileId | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/:fileId/reprocess | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId/graph | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-delete | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-reprocess | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/catalog | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/states | [UNMAPPED] | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/:jobId | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:jobId/cancel | [UNMAPPED] | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:datasetKey/clear | [UNMAPPED] | Bearer |

---

## AI Chat

> Owner: ai-chat-service since phase 13 (gateway upstream `aichat`); previously exam-service.

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/ai-chat | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat | [UNMAPPED] | Bearer |
| GET | /api/v1/ai-chat/:chatId/messages | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat/:chatId/message | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat/:chatId/stream | [UNMAPPED] | Bearer |
| GET | /api/v1/ai-chat/:chatId/exists | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai-chat/:chatId | [UNMAPPED] | Bearer |
| GET | /api/v1/ai-chat/:chatId/documents | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat/:chatId/documents | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | [UNMAPPED] | Bearer |
| DELETE | /api/v1/ai-chat/message/:messageId | [UNMAPPED] | Bearer |
| PATCH | /api/v1/ai-chat/message/:messageId | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | [UNMAPPED] | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | [UNMAPPED] | Bearer |

---

## Flashcard Study

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/flashcard-study/session | [UNMAPPED] | Bearer |
| PUT | /api/v1/flashcard-study/session/:sessionId | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcard-study/session/:sessionId/complete | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcard-study/session/:sessionId/review | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcard-study/cards/:flashCardSetId | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcard-study/history/:flashCardSetId | [UNMAPPED] | Bearer |
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | [UNMAPPED] | Bearer |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | [UNMAPPED] | Bearer |

---

## Quiz Practice

Phase 07 (2026-10-20). Detail: `route-list.md` § Quiz Practice.

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| GET | /api/v1/quiz-practice/sets | [UNMAPPED] | `quiz:practice` |
| GET | /api/v1/quiz-practice/sets/:id/access | [UNMAPPED] | Public (token optional) |
| POST | /api/v1/quiz-practice/sets/:id/unlock | [UNMAPPED] | `quiz:practice` |
| POST | /api/v1/quiz-practice/attempts | [UNMAPPED] | Owner or `quiz:practice` |
| GET | /api/v1/quiz-practice/attempts | [UNMAPPED] | Bearer (own) |
| GET | /api/v1/quiz-practice/attempts/:id | [UNMAPPED] | Bearer (own) |
| PUT | /api/v1/quiz-practice/attempts/:id | [UNMAPPED] | Bearer (own) |
| POST | /api/v1/quiz-practice/attempts/:id/submit | [UNMAPPED] | Bearer (own) |

--------|------|---------------|------|
| POST | /api/v1/quiz-practice-attempts | [UNMAPPED] | Bearer |
| GET | /api/v1/quiz-practice-attempts/by-quizset/:quizSetId | [UNMAPPED] | Bearer |
| GET | /api/v1/quiz-practice-attempts/stats/completion-rate | [UNMAPPED] | Bearer |
| GET | /api/v1/quiz-practice-attempts/:attemptId | [UNMAPPED] | Bearer |
| PUT | /api/v1/quiz-practice-attempts/:attemptId | [UNMAPPED] | Bearer |
| POST | /api/v1/quiz-practice-attempts/:attemptId/submit | [UNMAPPED] | Bearer |
| POST | /api/v1/quiz-practice-attempts/:attemptId/reset | [UNMAPPED] | Bearer |

---

## Cheating Logs

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/cheatinglogs | BL013 | Bearer |
| GET | /api/v1/cheatinglogs/attempt/:attemptId | [UNMAPPED] | Bearer |
| GET | /api/v1/cheatinglogs/session/:sessionId/stats | [UNMAPPED] | Bearer |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | [UNMAPPED] | Bearer |

---

## R2 Storage

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/r2/image | BL006 | Bearer |

---

## Webhook

| Method | Path | Handler BL### | Auth |
|--------|------|---------------|------|
| POST | /api/v1/webhook/sepay | BL010, BL011 | ApiKey |

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
| Quiz Sets | 20 | 0 | 20 |
| Flashcard Sets | 28 | 0 | 28 |
| Exam Rooms | 8 | 0 | 8 |
| Exam Sessions | 17 | 0 | 17 |
| Exam Attempts | 10 | 1 | 9 |
| Subjects | 4 | 0 | 4 |
| Wallet | 1 | 1 | 0 |
| Payment | 5 | 0 | 5 |
| Student | 3 | 0 | 3 |
| AI Study | 35 | 2 | 33 |
| AI Chat | 15 | 0 | 15 |
| Flashcard Study | 8 | 0 | 8 |
| Quiz Practice | 7 | 0 | 7 |
| Cheating Logs | 4 | 1 | 3 |
| R2 Storage | 1 | 1 | 0 |
| Webhook | 1 | 1 | 0 |
| **Total** | **190** | **25** | **165** |

## Unresolved

- `BL004` (FinanceClientService) maps only to `/wallet/details` — other finance/payment routes are unmapped. Likely handled by finance-service controllers not yet covered by BL inventory.
- `BL005` (R2ClientService) covers avatar/banner upload but no other R2 operations in exam-service.
- BL inventory covers 16 behavior logic items; ~165 routes lack explicit BL mapping. These routes are handled by NestJS controllers/services scanned in Wave 0 but not yet attributed to a named BL entry.
- `BL001` (SessionCleanupCron) and `BL002` (UserRegisteredHandler) have no HTTP route — internal/scheduled/event-driven only.
- `BL007` (OcrService), `BL012` (AuthSyncBootstrap), `BL014` (ExportPDFHook) — no HTTP route mapping.