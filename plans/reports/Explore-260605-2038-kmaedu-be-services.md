# Survey of `kmaedu-be/apps/` Microservices

**Generated:** 2026-06-05
**Scope:** gateway, auth, exam, finance, r2, ocr
**Stack:** NestJS (TypeScript) + Prisma + PostgreSQL + Redis + RabbitMQ + gRPC + Cloudflare R2 + Python (OCR)
**Repo root:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be`
**Shared libs:** `libs/common` (guards, events, gRPC clients, services), `libs/database` (Prisma), `libs/redis`

---

## 0. Cross-cutting Architecture

### Service topology
| Service | HTTP port | gRPC port | DB | Notes |
|---|---|---|---|---|
| gateway-service | 3000 | — | — | Pure HTTP proxy + rate limit (100 req/min) + Swagger at `/api` |
| auth-service | 3001 | 50051 | Postgres | JWT issuer, sessions, OAuth, gRPC `AuthService` |
| exam-service | 3002 | — | Postgres | Quiz/Flashcard/ExamRoom/Session/Attempt, AI, OCR orchestration |
| finance-service | 3003 | 50053 | Postgres | Wallet, SePay payments, subscriptions; gRPC `WalletService` + `SubscriptionService` |
| r2-service | 3004 | 50054 | — | Cloudflare R2 storage; gRPC only + `/health` + internal HTTP upload |
| ocr-service | — | 50053 (default) | — | gRPC `OcrService`; HTTP shim to Python FastAPI |
| ai-service | — | — | — | Separate AI app; not surveyed in detail |

> Both `ocr-service` and `finance-service` default gRPC port 50053 is a known conflict risk (see "Unresolved").

### Service boundaries — three patterns
1. **HTTP reverse proxy (gateway → backend):** gateway forwards everything to `auth`/`exam`/`finance` URLs via `ProxyService` (`apps/gateway-service/src/services/proxy.service.ts`). `forward`, `forwardWithAuth` (adds `Authorization: Bearer`), `forwardWithRedirect` (OAuth, maxRedirects=0), `forwardWithAuthAndTimeout`, `forwardRaw` (multipart passthrough).
2. **gRPC microservices:** exam-service calls finance gRPC (`FINANCE_PACKAGE`, `WalletService`/`SubscriptionService`); auth-service exposes `AuthService` gRPC for ValidateToken/GetUserInfo/CheckPermission; r2-service exposes `R2Service`; ocr-service exposes `OcrService`. Protos in `libs/common/src/protos/`.
3. **RabbitMQ events (topic exchange `kmaedu.events`, durable):** routing keys `auth.<type>`, `finance.<type>`, `exam.<type>`. `EventPublisherService` publishes, `EventSubscriberService` consumes. Currently wired:
   - `auth-service` publishes `auth.user.created` on register (auth.service.ts:162, 562)
   - `finance-service` `UserEventHandler` subscribes to `auth.user.created` and auto-creates wallet (idempotent)

### Auth flow
- JWT in cookie `token`/`accessToken` + `refreshToken` + `session_id`. Cookie config via `libs/common/src/utils/cookie-config.ts` (`getCookieConfig`). Production uses `domain=.fayedark.com`, `sameSite=none`, `secure=true`.
- `libs/common/src/guard/auth.guard.ts` — verifies JWT, hydrates `req.user` from Prisma.
- `libs/common/src/guard/google-auth.guard.ts` — wraps Passport Google strategy, stashes `?redirect=` in `oauth_redirect` cookie.
- `libs/common/src/guard/optional-auth.guard.ts` — for endpoints that may be public (exam session "study" flows).

---

## 1. gateway-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/`
**Bootstrap:** `src/main.ts` — port 3000, prefix `api/v1`, CORS allows `kma.fayedark.com` and three localhost dev origins, cookie-parser enabled, Swagger at `/api` with bearer + Sepay ApiKey + cookie auth schemes.
**Module:** `src/gateway.module.ts` — imports `AuthModule` (shared), `ThrottlerModule` (100/min), `HttpModule` (30s timeout, 5 redirects). Global `ThrottlerGuard`. Applies `ProxyMiddleware` (request logger) on all routes.
**Proxy service:** `src/services/proxy.service.ts` — singleton with `serviceUrls` map, plus 5 `forward*` variants.

### 1.1 `GatewayController` (`@/`) — health/status
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness; returns uptime |
| GET | `/status` | echoes configured `AUTH_SERVICE_URL`/`EXAM_SERVICE_URL`/`FINANCE_SERVICE_URL` |

### 1.2 Proxy controllers (all under `/api/v1/`)
Each controller is a thin pass-through; default behavior = `forwardWithAuth` (adds `Bearer <token>`), and rewrites the upstream path. Some handle multipart via `forwardWithFile`/`forwardRaw` (form-data via axios + `form-data`).

#### `AuthProxyController` (`/auth`) — `controllers/auth-proxy.controller.ts`
| Method | Path | Upstream target | Notes |
|---|---|---|---|
| POST | `/auth/login` | auth `/api/v1/auth/login` | public; sets `token`/`accessToken`/`session_id`/`refreshToken` cookies via `setAuthCookies` |
| POST | `/auth/register` | auth `/api/v1/auth/register` | public; cookies |
| POST | `/auth/send-code-reset-password` | auth | public |
| POST | `/auth/reset-password` | auth | public |
| POST | `/auth/refresh` | auth | public; cookie-aware |
| GET | `/auth/google` | auth | uses `forwardWithRedirect` (maxRedirects=0) — redirects browser to Google |
| POST | `/auth/google/one-tap` | auth | public; cookies |
| GET | `/auth/google/callback` | auth | `forwardWithRedirect` → extracts `token`/`refreshToken`/`sessionId` from Set-Cookie + redirects with them in URL (web flow) or via mobile exchange code (mobile scheme detected) |
| GET | `/auth/me` | auth | Bearer |
| POST | `/auth/sync-refresh-token` | auth | Bearer |
| POST | `/auth/logout` | auth | Bearer; clears `accessToken`/`token`/`session_id`/`refreshToken` |
| POST | `/auth/sendVerificationEmail` | auth | Bearer |
| POST | `/auth/verifyAccount` | auth | Bearer |
| POST | `/auth/send-code-change-password` | auth | Bearer |
| POST | `/auth/change-password` | auth | Bearer |

Helper: `extractCookieValue(cookies[], name)` parses Set-Cookie strings from the upstream redirect.

#### `QuizsetProxyController` (`/quizsets`) — `controllers/quizset-proxy.controller.ts`
Forwards all → exam-service `/api/v1/quizsets*`. Supports `multipart/form-data` via `FileInterceptor('thumbnail')` → `forwardWithFile`.
GET list, stats, `list/all`, `/:id`, `/:id/questions`; POST, PUT (with thumb), DELETE `/:id`; `set-quizzes-to-quizset`, `save-history-to-quizset`; nested `/questions` CRUD and `/labels` CRUD + `/labels/:id/questions` assign/remove/list.

#### `FlashcardsetProxyController` (`/flashcardsets`) — `controllers/flashcardset-proxy.controller.ts`
Same pattern: GET list, stats, `users/search`, `/:id`, `/:id/flashcards`, `/:id/labels*`, `public/:id`; POST, PUT, DELETE; `set-flashcards-to-flashcardset`, `save-history-to-flashcardset`, `/:id/share`; nested flashcards + labels; study endpoints `study/:id/access|info|with-code|verify-code|stats`.

#### `ExamRoomProxyController` (`/examrooms`) — `controllers/examroom-proxy.controller.ts`
GET `list`, `list-all`, `detail/:id`, `get-public/:id`, `/:id/sessions`; POST/PUT/DELETE `/:id`.

#### `ExamSessionProxyController` (`/examsessions`) — `controllers/examsession-proxy.controller.ts`
GET `list`, `get-by-id/:id`, `get-public/:id`; POST, PUT, DELETE `/:id`; `users/search`; study endpoints (access, info, with-code, verify-code, stats); sharing `/:id/sharing` GET/PUT, `/:id/generate-code` POST, `room/:roomId/available-labels`.

#### `ExamAttemptProxyController` (`/examattempts`) — `controllers/examattempt-proxy.controller.ts`
GET `history-stats`, `list`, `list-by-room/:examRoomId`, `list-by-session/:sessionId`, `/:id/quiz`, `/:id/secure-quiz`, `/:id/detail`; POST `start`, `/:id/submit`, `/:id/secure-submit`; PUT `/:id/progress`.

#### `SubjectProxyController` (`/subjects`) — `controllers/subject-proxy.controller.ts`
GET `categories`, list, `/:id`, `slug/:slug`.

#### `WalletProxyController` (`/wallet`) + `PaymentProxyController` (`/payment`) — `controllers/wallet-profile-proxy.controller.ts`
Wallet: GET `/details`. Payment: POST `/create`, GET `/status/:paymentId`, `/subscription`, `/subscription/plans`, DELETE `/cancel/:paymentId`. (Note: there is also a `finance-proxy.controller.ts` with `wallet` + `wallet/transactions` + `payment/create` + `payment/status/:id` + `subscription` + `subscription/plans` — duplicates under `/finance` prefix.)

#### `ProfileProxyController` (`/profile`) — same file
GET, PUT; POST `/upload-avatar`, `/upload-banner` (multipart via `forwardWithFile` to auth).

#### `DevicesProxyController` (`/devices`) — same file
GET list, DELETE `/:sessionId` (logout one device), POST `/logout-all-others`.

#### `R2ProxyController` (`/r2`) — `controllers/r2-proxy.controller.ts`
POST `/image` — multipart → forwards to `exam-service /api/v1/r2/image` (note: gateway goes through exam, not r2 directly). 2MB cap, image/* mime only.

#### `WebhookProxyController` (`/webhook`) — `controllers/webhook-proxy.controller.ts`
POST `/sepay` — public; forwards the original `Authorization: Apikey <key>` header to `finance /api/v1/webhook`.

#### `StudentProxyController` (`/student`) — `controllers/student-proxy.controller.ts`
GET `recent-flashcards`, `recent-exams`; POST `pin-flashcard/:id`, `pin-exam-room/:id`.

#### `AIProxyController`, `AIChatProxyController`, `FlashcardStudyProxyController`, `QuizPracticeProxyController`, `CheatingLogProxyController` — `controllers/ai-study-proxy.controller.ts`
All proxy to exam-service with `/ai`, `/ai-chat`, `/flashcard-study`, `/quiz-practice`, `/cheatinglogs` prefixes. Key endpoints:
- AI: `quick-upload`, `generate-from-file`, `recent-uploads`, `models`, `tutor/*` (ingest, knowledge-files, knowledge-folders, dataset-imports, graph/*)
- AI Chat: `GET/POST` chats; `:chatId/messages`; `:chatId/message`; `:chatId/stream` (SSE); `:chatId/documents`; `message/:messageId/regenerate(-stream)`; PATCH `message/:messageId`
- FlashcardStudy: `/session`, `/session/:id/complete|review`, `/cards/:setId`, `/history/:setId`, `/progress/:setId` (GET/POST)
- QuizPractice: `POST`, `GET by-quizset/:id`, `GET stats/completion-rate`, GET/PUT `/:id`, POST `/:id/submit|reset`
- CheatingLogs: `POST`, `GET attempt/:id`, `GET session/:id/stats`, `GET session/:sessionId/user/:userId`

### Notes
- `forwardWithAuth` and friends all read token from `Authorization: Bearer …` first, then `cookies.token`/`accessToken`. The `h()` helpers in each controller only forward `user-agent` (sometimes `x-device-id`, `x-forwarded-for`).
- Global throttling 100 req/min per IP is set on the gateway only.
- `wallet-profile-proxy.controller.ts` exposes both `/wallet` and `/payment` and there is a redundant `finance-proxy.controller.ts` exposing `/finance` aliases. Two ways to reach the same upstream.

---

## 2. auth-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/`
**Bootstrap:** `src/main.ts` — HTTP on 3001 with prefix `api/v1`; gRPC on 50051 serving `auth` package from `libs/common/src/protos/auth.proto`.
**Module roots:** `AuthServiceModule` (top-level — has `AuthServiceController`/`AuthGrpcController` + `AuthServiceService`) and `AuthModule` (functional auth: `AuthController`, `AuthService`, `GoogleStrategy`, `UserRepository`, JWT/Redis wiring).

### 2.1 `AuthServiceController` (`@/`) — `src/auth-service.controller.ts`
GET `/health`, GET `/` (returns hello string).

### 2.2 `AuthController` (`/auth`) — `src/auth.controller.ts`
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | register new user; sets cookies; supports `turnstileToken` |
| POST | `/auth/login` | — | credentials login; sets cookies; Turnstile |
| POST | `/auth/logout` | AuthGuard | deactivates session by `session_id` cookie; clears cookies |
| POST | `/auth/refresh` | — | rotates access token from `refreshToken` cookie/body |
| POST | `/auth/sendVerificationEmail` | AuthGuard | generates verify code, sends mail |
| POST | `/auth/verifyAccount` | AuthGuard | verifies email code |
| POST | `/auth/send-code-reset-password` | — | public; sends code by email |
| POST | `/auth/reset-password` | — | public; verifies code + new password |
| POST | `/auth/send-code-change-password` | AuthGuard | code for change-password flow |
| POST | `/auth/change-password` | AuthGuard | current + code + new |
| GET | `/auth/google` | GoogleAuthGuard | kicks off OAuth |
| POST | `/auth/google/one-tap` | — | Google One Tap ID token login |
| GET | `/auth/google/callback` | GoogleAuthGuard | OAuth callback — handles web (redirect with token query) and mobile custom-scheme (Redis one-time exchange code 60s TTL at `oauth:exchange:<code>`) |
| GET | `/auth/me` | AuthGuard | returns current user |
| POST | `/auth/sync-refresh-token` | AuthGuard | re-issues refresh token from session |
| POST | `/auth/exchange` | — | mobile exchanges Redis one-time code for tokens (60s TTL) |

`AuthService` (`src/auth.service.ts`) handles `register`, `login`, `logout`, `refreshAccessToken`, `sendVerificationEmail`, `verifyAccount`, `sendCodeToResetPassword`, `resetPassword`, `sendCodeToChangePassword`, `changePassword`, `googleLogin`, `googleOneTapLogin`, `createSession`, `syncRefreshTokenBySession`. Publishes `auth.user.created` to RabbitMQ on register (lines 162, 562) so finance can auto-create wallet.

DTOs (Zod + `createZodDto` + Swagger): `RegisterDto` (username 3-20, email valid ≤50, password 6-100, optional turnstile), `LoginDto` (credential, password, optional turnstile), `LoginResponse` (user, success, token, refreshToken, sessionId, deviceId). `request-with-auth.dto.ts` defines `AuthenticatedRequest` and `AuthenticatedOauthRequest`.

### 2.3 `ProfileController` (`/profile`) — `src/profile/profile.controller.ts`
All `@UseGuards(AuthGuard)`:
- GET `/profile` — read own profile
- PUT `/profile` — update `UpdateProfileDto`
- POST `/profile/upload-avatar` — multipart `file` (max 2MB)
- POST `/profile/upload-banner` — multipart `file` (max 5MB)

`ProfileService` uses gRPC R2 client to upload (`GrpcClientsModule.registerR2Client`).

### 2.4 `DevicesController` (`/devices`) — `src/devices/devices.controller.ts`
`@UseGuards(AuthGuard)` on the controller:
- GET `/devices` — list logged-in devices
- DELETE `/devices/:sessionId` — log out one
- POST `/devices/logout-all-others`

`DevicesService` (also `session-cleanup.cron.ts` for expired sessions). `UserSessionRepository` (Prisma). Cookie parsing via `cookie` lib.

### 2.5 `AuthGrpcController` — `src/grpc/auth.grpc.controller.ts` (gRPC `AuthService`)
| RPC | Behavior |
|---|---|
| `ValidateToken(ValidateTokenRequest)` | Verifies JWT, returns `{valid, userId, email, username, role (0|1), message}`. Used by exam/finance when validating downstream. |
| `GetUserInfo(GetUserInfoRequest)` | Fetches user by ID with select fields |
| `CheckPermission(CheckPermissionRequest)` | `isAdmin → true`; non-admin read/write/delete → true (ownership is service-level) |

### 2.6 `GoogleStrategy` — `src/strategies/google.strategy.ts`
Passport Google OAuth2 with `passReqToCallback`. Returns the user record from `authService.googleLogin` to Passport. `GoogleAuthGuard` stashes the `?redirect=` query in a 10-min `oauth_redirect` cookie.

### 2.7 Auth service DTOs / models
- All request/response DTOs in `src/dto/` (login, register, auth-response, request-with-auth).
- Prisma user model: `User { id (unique), email (unique), username (unique), name, avatar, banner, bio, isAdmin, isVerified, password, createdAt, updatedAt, … }`. Relations: `verifyAccountCode`, `resetPasswordCode`, `userStorage`, `wallet`, `payments`, `quizSets`, `flashCardSets`, `examRooms`, `examAttempts`, `historyGeneratedQuizz/Flashcard`, `quizPracticeAttempts`, `aiChats`, `subscription`, `sessions`, `monthlyFileUploads`, `flashCardViewHistories`, `pinnedFlashcards`, `pinnedExamRooms`, `flashcardStudyProgress`.
- Session model: `UserSession` (sessionId unique, refreshToken unique, deviceId, browser/os/ip/country/city, isActive, lastActivity, expiresAt).

### 2.8 Cross-service
- gRPC server: validates tokens for other services.
- RabbitMQ publisher: emits `auth.user.created` (the only event currently emitted).

---

## 3. exam-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/`
**Bootstrap:** `src/main.ts` — HTTP on 3002, prefix `api/v1`, CORS, no gRPC. **All controllers are wired in submodules**; only `ExamServiceController` (`/health` + `/`) is at the root.
**Module roots:** `ExamServiceModule` imports 13 submodules (see below); `ExamModule` (under it) is currently empty of providers — the actual wiring lives in the per-feature modules.

**Submodules (in `src/modules/…`):** `quizset`, `examroom`, `examsession`, `examattempt`, `cheatinglog`, `flashcardset`, `subject`, `ai`, `ai-chat`, `finance-client` (global, registers `FINANCE_PACKAGE` gRPC), `r2`, `student`, `flashcard-study`.

### 3.1 `ExamServiceController` — `src/exam-service.controller.ts`
GET `/health`, GET `/`.

### 3.2 `QuizsetController` (`/quizsets`) — `src/modules/quizset/quizset.controller.ts`
All `@UseGuards(AuthGuard)` unless noted. Routes:
- POST `/` (multipart `thumbnail`) — create
- GET `/stats` — user's stats
- GET `/:id` — detail
- GET `/:id/questions` — paginated
- PUT `/:id` (multipart `thumbnail`) — update
- GET `/` — list with `GetQuizsetsDto`
- GET `/list/all` — no pagination
- DELETE `/:id`
- GET `/public/:id` — **public**
- POST `/set-quizzes-to-quizset`
- POST `/save-history-to-quizset`
- Question CRUD: POST `/:quizSetId/questions`, PUT `/:quizSetId/questions/:questionId`, DELETE `/:quizSetId/questions/:questionId`
- Label CRUD: GET/POST `/:quizSetId/labels`, PUT/DELETE `/:quizSetId/labels/:labelId`
- Label-question: POST `/:quizSetId/labels/:labelId/questions`, DELETE same, GET same

DTOs: `CreateQuizsetDto`, `UpdateQuizSetDto`, `GetQuizsetsDto`, `SetQuizzToQuizsetDto`, `SaveHistoryToQuizsetDto`, `CreateQuestionDto`, `UpdateQuestionDto`, `GetQuestionsDto`, `CreateLabelDto`, `UpdateLabelDto`, `AssignQuestionsToLabelDto`. Service: `QuizsetService` (+ repo). `response` DTOs in `dto/quizset-response.dto.ts`.

### 3.3 `ExamRoomController` (`/examrooms`) — `src/modules/examroom/examroom.controller.ts`
All `@UseGuards(AuthGuard)`:
- POST `/` — create
- GET `/detail/:id` — get
- PUT `/:id` — update
- GET `/list` — list (paged)
- GET `/list-all` — unpaged
- DELETE `/:id`
- GET `/get-public/:id` — **public**
- GET `/:examRoomId/sessions` — sessions list

### 3.4 `ExamSessionController` (`/examsessions`) — `src/modules/examsession/examsession.controller.ts`
- POST `/` — create
- GET `/get-by-id/:id` — detail (AuthGuard)
- PUT `/:id` — update
- GET `/list` — list
- DELETE `/:id`
- GET `/get-public/:id` — **public**
- GET `/users/search` — search users
- Study (mixed auth — `OptionalAuthGuard` for some): GET `/study/:id/access`, `/study/:id/info`, `/study/:id`; POST `/study/:id/with-code`, `/study/:id/verify-code`
- GET `/study/:id/stats`
- Sharing: GET/PUT `/:id/sharing`, POST `/:id/generate-code`
- GET `/room/:roomId/available-labels`

### 3.5 `ExamAttemptController` (`/examattempts`) — `src/modules/examattempt/examattempt.controller.ts`
All `@UseGuards(AuthGuard)`:
- GET `/history-stats`
- POST `/start` — start or resume (retry-limit aware)
- PUT `/:id/progress` — auto-save
- POST `/:id/submit` — score and finalize
- GET `/:id/quiz` — load questions
- GET `/:id/secure-quiz` — secure variant
- POST `/:id/secure-submit`
- GET `/list-by-room/:examRoomId`, `/list-by-session/:sessionId`
- GET `/:id/detail`
- Standard CRUD: POST, GET `/get-by-id/:id`, PUT `/:id`, GET `/list`, DELETE `/:id`

### 3.6 `CheatingLogController` (`/cheatinglogs`) — `src/modules/cheatinglog/cheatinglog.controller.ts`
POST `/` (record violation — upserts by `(examAttemptId, type)`), GET `/attempt/:id`, GET `/session/:id/stats`, GET `/session/:sessionId/user/:userId`.

### 3.7 `FlashcardSetController` (`/flashcardsets`) — `src/modules/flashcardset/flashcardset.controller.ts`
Same pattern as quizset: full CRUD on sets, flashcards, labels, label-flashcard mappings, study access/info/with-code/verify-code, sharing/generate-code, public access.

### 3.8 `SubjectController` (`/subjects`) — `src/modules/subject/subject.controller.ts`
GET `/categories`, GET `/`, GET `/:id`, GET `/slug/:slug` — read-only.

### 3.9 `AIController` (`/ai`) — `src/modules/ai/ai.controller.ts`
`@UseGuards(AuthGuard)`; key endpoints:
- POST `/quick-upload` — multipart `file` (OCR + R2)
- POST `/generate-from-file` — generate quiz/flashcard from existing file
- GET `/recent-uploads`, GET `/models`
- Tutor: POST `/tutor/ingest`; POST `/tutor/knowledge-files`; GET `/tutor/knowledge-files`, `/tutor/knowledge-files/:fileId`, `/tutor/knowledge-files/search`, DELETE `/tutor/knowledge-files/:fileId`, POST `/tutor/knowledge-files/:fileId/reprocess`, `/tutor/knowledge-files/bulk-delete|reprocess`
- Folders: POST `/tutor/knowledge-folders`, PUT/DELETE `/tutor/knowledge-folders/:folderId`, GET `/tutor/knowledge-folders`, `/tutor/knowledge-folders/:folderId/contents`
- Dataset imports: GET `/tutor/dataset-imports/catalog`; POST `/tutor/dataset-imports`; GET `/tutor/dataset-imports`, `/tutor/dataset-imports/states`, `/tutor/dataset-imports/:jobId`; POST `/tutor/dataset-imports/:jobId/cancel`, `/tutor/dataset-imports/:datasetKey/clear`
- Graph: GET `/tutor/graph/job/:jobId`, `/tutor/graph/document/:documentId`, `/tutor/knowledge-files/:fileId/graph`
- Ingest job: GET `/tutor/ingest`, `/tutor/ingest/:jobId`
- Upload job: GET/DELETE `/upload/:uploadId`, GET `/upload/:uploadId/history`, POST `/regenerate/:uploadId`, GET `/job/:jobId`, DELETE `/job/:jobId`, POST `/upload-image`

### 3.10 `AIChatController` (`/ai-chat`) — `src/modules/ai-chat/ai-chat.controller.ts`
All `@UseGuards(AuthGuard)`:
- GET `/`, POST `/` (create), PATCH `/:chatId`, DELETE `/:chatId`, POST `/:chatId/clear`, GET `/:chatId/exists`
- GET `/:chatId/messages`, POST `/:chatId/message`, POST `/:chatId/stream` (SSE)
- PATCH `/message/:messageId`, DELETE `/message/:messageId`, POST `/message/:messageId/regenerate`, POST `/message/:messageId/regenerate-stream`
- GET `/:chatId/documents`, POST `/:chatId/documents`, DELETE `/:chatId/documents/:documentId`

### 3.11 `FlashcardStudyController` (`/flashcard-study`) — `src/modules/flashcard-study/flashcard-study.controller.ts`
- POST `/progress/:flashCardSetId`, GET `/progress/:flashCardSetId`

### 3.12 `StudentController` (`/student`) — `src/modules/student/student.controller.ts`
- GET `/recent-flashcards`, GET `/recent-exams`, POST `/pin-flashcard/:id`, POST `/pin-exam-room/:id`

### 3.13 `R2Controller` (`/r2`) — `src/modules/r2/r2.controller.ts`
- POST `/image` — multipart upload, calls gRPC R2 client

### 3.14 `FinanceClientService` — `src/modules/finance-client/finance-client.service.ts`
Global gRPC client `FINANCE_PACKAGE` (packages `wallet`, `subscription` from `wallet.proto`+`subscription.proto`, default URL `0.0.0.0:50053`). Exposes `deductCredits(userId, amount, description)` and similar — gated by `FREE_MODE = true` (no charge in dev). Used by AI/OCR flows.

### 3.15 Exam models
Prisma models: `QuizSet`, `QuizQuestion`, `DetailsQuizQuestion`, `QuizSetLabel`, `FlashCard`, `FlashCardSet`, `DetailsFlashCard`, `FlashCardSetLabel`, `ExamRoom`, `ExamSession` (status 0=upcoming,1=ongoing,2=ended; accessCode 6-digit; questionSelectionMode 0/1/2; labelQuestionConfig JSON; shuffleQuestions; passingScore), `ExamAttempt` (status 0=in-progress,1=completed,2=cancelled; answers JSON; selectedQuestionIds; correctAnswers; violationCount; cheatingLogs), `CheatingLog` (type TAB_SWITCH/WINDOW_BLUR/DEVTOOLS_OPEN/COPY_PASTE/RIGHT_CLICK/FULLSCREEN_EXIT/PRINT_SCREEN, upsert by `(examAttemptId, type)`), `HistoryGeneratedQuizz/Flashcard`, `QuizPracticeAttempt` (type 0=PRACTICE/1=REAL; unique `(quizSetId, userId, type)`), `FlashCardViewHistory`, `UserPinnedFlashcard`, `UserPinnedExamRoom`, `FlashcardStudyProgress`, `AIChat`, `AIChatMessage`, `AIChatDocument` (unique `(chatId, documentId)`), `Document` (with `vector` embeddings), `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`, `UserStorage`, `Subject`, `SubjectCategory`.

### 3.16 Cross-service calls
- gRPC: calls `R2Service` (via `GrpcClientsModule.registerR2Client`) for file storage, and `WalletService`/`SubscriptionService` (via `FinanceClientModule`) for credit deduction. Calls `AuthService` indirectly via shared `AuthGuard` (which uses Prisma directly, not gRPC).
- Events: no exam→Rabbit publishers observed in this survey; exam doesn't currently consume events.

---

## 4. finance-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/`
**Bootstrap:** `src/main.ts` — HTTP on 3003 with prefix `api/v1`; gRPC on 50053 serving `wallet`+`subscription` packages.
**Module roots:** `FinanceServiceModule` (root — wires `FinanceServiceController` + `WalletGrpcController` + `UserEventHandler`), `FinanceModule` (sub-module re-exporting `WalletModule` and `SePayModule`).

### 4.1 `FinanceServiceController` — `src/finance-service.controller.ts`
GET `/health`, GET `/` (scaffold).

### 4.2 `WalletController` (`/wallet`) — `src/modules/wallet/wallet.controller.ts`
All `@UseGuards(AuthGuard)`:
- GET `/wallet/info` — current balance
- GET `/wallet/details` — paginated transactions (`page`, `size`)

DTOs: `WalletDto`, `WalletDetailsDto`, `GetTransactionsDto` (page/size), `DepositDto`, `wallet-response.dto.ts`.

### 4.3 `PaymentController` (`/payment`) — `src/modules/sepay/payment.controller.ts`
All `@UseGuards(AuthGuard)` except `/subscription/plans`:
- POST `/payment/create` — create SePay payment (returns QR)
- GET `/payment/status/:paymentId` — check status
- GET `/payment/history` — paged history (`page`, `size`)
- DELETE `/payment/cancel/:paymentId` — cancel pending
- GET `/payment/subscription` — current user subscription
- GET `/payment/subscription/plans` — plan catalog (public)

`SubscriptionService` (in same module): `getUserSubscriptionBenefits` exposes a tier map (Basic/Advanced/VIP → 1/2/3) plus `filesPerMonth`, `messagesPerMinute`, `chatMessagesLimit`.

### 4.4 `WebhookController` (`/webhook`) — `src/modules/sepay/webhook.controller.ts`
- POST `/webhook` — **no auth**; reads `Authorization: Apikey <key>` header; hands off to `WebhookService.processWebhook` which validates key, processes the SePay event, updates payment, credits wallet, and creates wallet transactions. Logs full body on receive.

### 4.5 `WalletGrpcController` (gRPC `WalletService`) — `src/modules/wallet/wallet.grpc.controller.ts`
| RPC | Behavior |
|---|---|
| `CreateWallet({userId, initialBalance})` | Creates wallet, default initial balance 20 if unspecified |
| `GetWallet({userId})` | Returns `{wallet_id, user_id, balance}` (zero if not found) |
| `UpdateBalance({userId, amount, transactionType, description})` | ADD/SUBTRACT, also creates a `WalletTransaction` (`type` 0 for ADD/buy-credits, 4 for SUBTRACT/use-services) |

### 4.6 `SubscriptionGrpcController` (gRPC `SubscriptionService`) — `src/modules/sepay/subscription.grpc.controller.ts`
- `GetUserBenefits({userId})` → `{tier, tier_name, files_per_month, messages_per_minute, chat_messages_limit}`

### 4.7 `UserEventHandler` — `src/events/user-event.handler.ts`
`@OnModuleInit`: subscribes to `auth` events channel; on `EventType.USER_CREATED` creates wallet (idempotency check) with welcome bonus of 20 credits and a `WalletTransaction` (type 1 INITIAL_CREDIT, direction ADD, "Welcome bonus credits").

### 4.8 Types / models
- Prisma models: `Wallet` (unique id, unique userId, balance Float), `WalletTransaction` (type 0=buy-credits, 1=buy-subscription, 2=refund, 3=admin-adjustment, 4=use-services; direction ADD/SUBTRACT), `Payment` (status 0=unpaid, 1=paid, 2=overdue, 3=cancelled; paymentType credits|subscription; expiresAt 10 min TTL; orderId/vaNumber for SePay), `UserSubscription` (tier 0/1/2/3; monthly|yearly; isActive; lastPaymentDate/nextPaymentDate), `UserMonthlyFileUpload` (unique `(userId, yearMonth)`).
- DTOs: `WalletDetailsResponseDto`, `WalletResponseDto`, `DepositDto`, `GetTransactionsDto`, `WalletDetailsDto`. Types: `wallet.ts`, `payment.ts`, `webhook.ts`, `subscription.ts`.

### 4.9 Cross-service
- gRPC server: provides `WalletService` + `SubscriptionService` to exam-service.
- RabbitMQ subscriber: `UserEventHandler` reacts to `auth.user.created` and provisions wallets.
- RabbitMQ publisher: no events emitted from this service in current code.

---

## 5. r2-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/r2-service/`
**Bootstrap:** `src/main.ts` — gRPC-only on 50054 with `maxReceiveMessageLength = maxSendMessageLength = 50MB`; also starts an HTTP server (default 3004) just for `/health` and `/internal/upload`.
**Module:** `src/r2-service.module.ts` — `R2ServiceController` + `R2ServiceService`.
**Config:** `src/config/r2.config.ts` (env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`).

### 5.1 `R2ServiceController` — `src/r2-service.controller.ts`
- GET `/health` — `{status: ok, service: r2-service}`
- POST `/internal/upload` — `FileInterceptor('file')` multipart; returns `{success, file_id, url, key_r2}` for image
- gRPC `R2Service.UploadFile({user_id, filename, mimetype, content, folder?})` → `{success, file_id, url, key_r2, message}` (50MB cap)
- gRPC `R2Service.GetFileUrl({key_r2, expires_in_seconds?})` → `{url, expires_at}` (default 1h)
- gRPC `R2Service.DeleteFile({key_r2})` → `{success, message}`

The gRPC service is consumed by exam-service (`R2Module`), ai-service, and auth-service (`ProfileModule`).

---

## 6. ocr-service

**Path:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/ocr-service/`
**Stack:** NestJS gRPC front + Python FastAPI worker.
**Bootstrap:** `src/main.ts` — `createMicroservice` (gRPC only) on default port 50053 serving `ocr` package from `libs/common/src/protos/ocr.proto`. The Python FastAPI lives in `src/backend/main.py` and is expected on `OCR_PYTHON_SERVICE_URL` (default `http://127.0.0.1:8003`).
**Module:** `src/ocr-service.module.ts` (gRPC `OcrGrpcController` + `OcrService`).

### 6.1 `OcrGrpcController` (gRPC `OcrService`) — `src/api/ocr.grpc.controller.ts`
- `ProcessPdf({pdfData, filename, userId?})` → `{success, jobId, content, errorMessage, pageCount}`. Validates `.pdf` extension and non-empty buffer; calls `OcrService.processPdf` which POSTs multipart to `${pythonServiceUrl}/process` (5-minute timeout, unlimited body).
- `HealthCheck({})` → `{healthy, message, version: "1.0.0"}` (polls `${pythonServiceUrl}` root `/health`).

### 6.2 `OcrService` — `src/services/ocr.service.ts`
- `processPdf(pdfData, filename, userId?)` — builds FormData (`file`, optional `user_id`), POSTs to Python, returns `{jobId, content, pageCount}`.
- `checkHealth()` — GET to `${pythonServiceUrl.replace('/api/ocr','')}/health`, 5s timeout.

### 6.3 Python worker — `src/backend/main.py` + `requirements.txt`
FastAPI app providing `/api/ocr/process` and `/health`. Accepts `multipart/form-data` (file + optional `user_id`). Returns `{success, job_id, content, page_count, error_message}`.

> **Port conflict risk:** default `GRPC_PORT` for both `ocr-service` and `finance-service` is 50053. Must be overridden in env (e.g., ocr to 50055) when running both — see Unresolved.

---

## 7. Data model summary (Prisma)

Full schema: `libs/database/src/schema.prisma` (also mirrored under `libs/database/prisma/`).
Highlights:
- **User & sessions:** `User`, `UserSession` (multi-device sessions; refresh token; deviceId/os/browser/ip/country/city; lastActivity, expiresAt), `VerifyAccountCode`, `ResetPasswordCode`, `UserMonthlyFileUpload` (idempotent per `(userId, yearMonth)`).
- **Storage:** `UserStorage` (mimetype/size/keyR2; processingStatus PENDING/PROCESSING/COMPLETED/FAILED; creditCharged), `Document` (with `vector` embeddings), `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`.
- **Quizzes:** `QuizSet`, `QuizQuestion`, `DetailsQuizQuestion` (unique `(quizSetId, quizQuestionId)`), `QuizSetLabel`, `QuizPracticeAttempt` (type 0/1, unique `(quizSetId, userId, type)`).
- **Flashcards:** `FlashCardSet` (6-digit `accessCode`, `whitelist[]`, `viewCount`, `isPinned`), `FlashCard`, `DetailsFlashCard`, `FlashCardSetLabel`, `FlashCardViewHistory`, `UserPinnedFlashcard`, `FlashcardStudyProgress`.
- **Exams:** `ExamRoom` (host, quizSet), `ExamSession` (status, assessType, allowRetake, maxAttempts, accessCode, whitelist, showAnswersAfterSubmit, passingScore, questionCount, questionSelectionMode, labelQuestionConfig JSON, shuffleQuestions), `ExamAttempt` (answers JSON, currentIndex, markedQuestions, selectedQuestionIds, score, violationCount, correctAnswers, status), `CheatingLog` (TAB_SWITCH/WINDOW_BLUR/DEVTOOLS_OPEN/COPY_PASTE/RIGHT_CLICK/FULLSCREEN_EXIT/PRINT_SCREEN, unique `(examAttemptId, type)`).
- **AI:** `AIChat` (userId, optional subjectId, title), `AIChatMessage` (role user|assistant, imageUrl, documentId/Name), `AIChatDocument` (unique `(chatId, documentId)`).
- **Finance:** `Wallet` (unique id, unique userId), `WalletTransaction` (type, direction, amount, description), `Payment` (status 0/1/2/3, paymentType credits|subscription, expiresAt 10min, orderId, vaNumber), `UserSubscription` (tier 0/1/2/3, monthly|yearly, isActive), `UserMonthlyFileUpload`.
- **Subjects:** `SubjectCategory`, `Subject` (systemPrompt @db.Text).

DTO style throughout services: `zod` schema + `nestjs-zod` `createZodDto` + Swagger `@ApiProperty` overrides.

---

## 8. Auth / permission model

- **Guards** (in `libs/common/src/guard/`): `AuthGuard` (JWT verify + Prisma user hydration; reads cookie first, then `Authorization: Bearer`), `GoogleAuthGuard` (Passport Google + redirect cookie stash), `OptionalAuthGuard` (no throw on missing).
- **gRPC auth:** `AuthService.ValidateToken` (called by exam/finance when needed) — but in practice the upstream services use HTTP + `AuthGuard` (which reads Prisma directly). gRPC is wired but currently the primary auth path is shared-DB.
- **Permission checks:** `AuthGrpcController.checkPermission` does role-based: `isAdmin → allow all`; non-admin `read|write|delete → allow` (ownership enforced at service layer, not guard). No decorator-based permission system — controllers rely on `req.user.id` checks inside services.
- **gRPC constants:** `WALLET_SERVICE`, `R2_SERVICE`, `AUTH_SERVICE` exported by `libs/common/src/grpc/grpc-clients.module.ts`. Exam uses `FINANCE_PACKAGE` (custom name) registered in its `FinanceClientModule`.

---

## 9. Module dependency map (text)

```
gateway-service
  └── imports AuthModule (shared)
      └── uses ProxyService (axios + cookie + JWT)
          ├── → auth-service  (HTTP, port 3001)
          ├── → exam-service  (HTTP, port 3002)
          ├── → finance-service (HTTP, port 3003)
          └── → exam-service  (HTTP, multipart, for /r2/image)

auth-service
  ├── HTTP controllers: AuthController, ProfileController, DevicesController
  ├── gRPC server: AuthService (ValidateToken, GetUserInfo, CheckPermission)
  ├── GoogleStrategy + GoogleAuthGuard
  ├── publishes RabbitMQ auth.user.created
  └── gRPC client → R2Service (for profile uploads)

exam-service
  ├── submodules: quizset, examroom, examsession, examattempt,
  │               cheatinglog, flashcardset, subject, ai, ai-chat,
  │               finance-client, r2, student, flashcard-study
  ├── gRPC clients: R2Service, WalletService, SubscriptionService
  └── consumes no RabbitMQ events (no @EventType handlers found)

finance-service
  ├── HTTP: WalletController, PaymentController, WebhookController
  ├── gRPC server: WalletService, SubscriptionService
  ├── subscribes RabbitMQ auth.user.created → creates wallet
  └── publishes no events

r2-service
  ├── gRPC server: R2Service (UploadFile/GetFileUrl/DeleteFile)
  ├── HTTP: /health, /internal/upload
  └── consumed by exam/auth/ai via gRPC

ocr-service
  ├── gRPC server: OcrService (ProcessPdf/HealthCheck)
  └── HTTP (Python FastAPI worker in src/backend/main.py) for actual OCR
```

---

## 10. Unresolved / open questions

1. **gRPC port conflict:** `ocr-service` defaults `GRPC_PORT=50053` which is the same as `finance-service`. Need to confirm production env values (likely ocr runs on a different port) — or this is an unresolved bug.
2. **Dual finance routes in gateway:** `finance-proxy.controller.ts` (`/finance/*`) and `wallet-profile-proxy.controller.ts` (`/wallet/*`, `/payment/*`) both forward to finance; they overlap (`/payment/create`, `/payment/status/:id`, `/subscription`, `/subscription/plans`). Which is canonical? Pick one.
3. **gRPC auth path unused in practice:** exam/finance use the shared `AuthGuard` (Prisma-direct) rather than `AuthService.ValidateToken` gRPC. ValidateToken gRPC code exists but is currently dead — confirm intent.
4. **Gateway /r2/image path:** forwards to exam-service `/api/v1/r2/image` rather than r2-service directly. Functional but indirect — verify if a direct path is desired.
5. **FREE_MODE = true** in `exam-service/src/modules/finance-client/finance-client.service.ts` — credit deduction is bypassed. Confirm before production.
6. **Event payloads partially unused:** `EventType` enum defines `payment.success`, `wallet.created`, `subscription.activated`, `exam.*`, `ocr.*` but only `auth.user.created` is currently published and only `UserEventHandler` subscribes. Either dead code or unfinished wiring.
7. **`finance-service` HTTP server has no top-level controller other than `/health` + `/`.** All finance HTTP routes live in `WalletController` (`/wallet`), `PaymentController` (`/payment`), and `WebhookController` (`/webhook`). Confirm no other routes expected.
8. **Schema duplication:** both `libs/database/src/schema.prisma` and `libs/database/prisma/schema.prisma` exist (and so do per-model files in `src/models/` and `prisma/models/`). One is auto-generated. Worth verifying the build consumes the intended one.

