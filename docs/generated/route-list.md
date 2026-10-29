# Route List — examio

**Project**: examio
**Generated**: 2026-06-05
**Stack**: TypeScript (NestJS monorepo backend + React 19 SPA frontend)
**Gateway**: `http://localhost:3000` — single HTTP entry point; all backend routes live under `/api/v1`

---

## Backend Routes

### Gateway (`/api/v1/...`)

Gateway proxies all requests to downstream services. **Routing source of truth (2026-10-20): `examio-be/apps/gateway-service/config/routes.yaml`**; the per-domain proxy controllers this inventory was generated from no longer exist, so the tables below describe the downstream endpoints behind each YAML entry. Auth: `Authorization: Bearer` header or cookie `accessToken` (the legacy `token` cookie is no longer read); the gateway verifies the token and forwards it as `Authorization: Bearer`.

> **Owner column (phase 19)**: the last column is the service that serves the route, taken from the `upstream` of the matching entry in `routes.yaml` (a `match.path` regex wins over a `prefix`; env URL names `AUTH_SERVICE_URL`, `CONTENT_SERVICE_URL`, `ASSESSMENT_SERVICE_URL`, `STUDYROOM_SERVICE_URL`, `VOCABULARY_SERVICE_URL`, `DOCUMENT_SERVICE_URL`, `AICHAT_SERVICE_URL`, `FINANCE_SERVICE_URL`, `ADMIN_SERVICE_URL` map upstream to service). Paths did not change when exam-service was split. `/ai/tutor/*` (knowledge folders, files, dataset imports) was removed from the code and from this list. Study-room (`/studyrooms/*`, `/ws/study`) and word-family (`/word-family/*`) endpoints are not inventoried here; they are routed to study-room-service and vocabulary-service (`/word-family/:id/to-flashcard` to content-service).

> **Phase 06 (2026-10-20)**: every exam/finance/admin/r2 handler now declares a permission (`@RequirePermissions` / `@RequireOwnerOrPermission`; plain `@Authenticated()` only on an allowlist). The per-route permission is in `system/permissions.md` § Per-endpoint enforcement; "Bearer" below means a verified user holding that permission. Removed: `GET /api/v1/quizsets/public/:id` (404 `ROUTE_NOT_FOUND` at the gateway). The gateway lists `study/:id/(verify-code|with-code)` as `public` so anonymous callers reach the service, which still answers 401 without a token. Non-owned resources answer 404, not 403. Only rows whose guard changed were edited; full regeneration stays in plan phase 19.

> **Phase 07 (2026-10-20)**: new `/quiz-practice/*` student routes (replace `/quiz-practice-attempts*`), quiz-set sharing routes (`/quizsets/:id/sharing`, `generate-code`, `users/search`) and the delta body of `PUT /flashcardsets/:id/sharing`. Source: `quiz-practice.controller.ts`, `quizset-sharing.controller.ts`, `routes.yaml`.

#### Auth

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/auth/login | Login with email/password | public | auth |
| POST | /api/v1/auth/register | Register new account | public | auth |
| POST | /api/v1/auth/send-code-reset-password | Send reset password code | public | auth |
| POST | /api/v1/auth/reset-password | Reset password with code | public | auth |
| POST | /api/v1/auth/refresh | Refresh access token | public (cookie) | auth |
| POST | /api/v1/auth/logout | Logout and clear session | Bearer | auth |
| GET | /api/v1/auth/google | Initiate Google OAuth flow | public | auth |
| GET | /api/v1/auth/google/callback | Google OAuth callback | public | auth |
| POST | /api/v1/auth/google/one-tap | Google One Tap login | public | auth |
| POST | /api/v1/auth/sync-refresh-token | Sync refresh token from current session | Bearer | auth |
| GET | /api/v1/auth/me | Current user: `{ user, roles, permissions }` (no wallet/subscription; balance via `GET /wallet/info`) | Bearer | auth |
| POST | /api/v1/auth/sendVerificationEmail | Send account verification email | Bearer | auth |
| POST | /api/v1/auth/verifyAccount | Verify account with code | Bearer | auth |
| POST | /api/v1/auth/send-code-change-password | Send code to change password | Bearer | auth |
| POST | /api/v1/auth/change-password | Change password with code | Bearer | auth |
| POST | /api/v1/auth/exchange | Exchange OAuth code for tokens (mobile app) | public | auth |

#### Profile

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/profile | Get user profile | Bearer | auth |
| PUT | /api/v1/profile | Update user profile | Bearer | auth |
| POST | /api/v1/profile/upload-avatar | Upload profile avatar | Bearer | auth |
| POST | /api/v1/profile/upload-banner | Upload profile banner | Bearer | auth |

#### Devices

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/devices | List logged-in devices | Bearer | auth |
| DELETE | /api/v1/devices/:sessionId | Logout a specific device | Bearer | auth |
| POST | /api/v1/devices/logout-all-others | Logout all other devices | Bearer | auth |

#### Quiz Sets

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/quizsets | List quiz sets (paginated, filterable) | Bearer | content |
| GET | /api/v1/quizsets/stats | Get quiz set statistics | Bearer | content |
| GET | /api/v1/quizsets/list/all | List all quiz sets (no pagination) | Bearer | content |
| GET | /api/v1/quizsets/:id | Get quiz set by ID | Bearer | content |
| POST | /api/v1/quizsets | Create new quiz set | Bearer | content |
| PUT | /api/v1/quizsets/:id | Update quiz set | Bearer | content |
| DELETE | /api/v1/quizsets/:id | Delete quiz set | Bearer | content |
| GET | /api/v1/quizsets/:id/questions | Get paginated questions for quiz set | Bearer | content |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | Assign quizzes to quiz set | Bearer | content |
| POST | /api/v1/quizsets/save-history-to-quizset | Save AI-generated quizzes to quiz set | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/questions | Add question to quiz set | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | Update question | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | Delete question | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels | Get labels for quiz set | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels | Create label | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | Update label | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | Delete label | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Assign questions to label | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Remove questions from label | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Get questions by label | Bearer | content |
| GET | /api/v1/quizsets/users/search | Search users for the whitelist picker (`q` >= 3 chars, max 10, no email; gateway limit 30 / 60 s) | `user:search` | content |
| GET | /api/v1/quizsets/:id/sharing | Sharing settings `{ isPublic, accessCode, whitelist, codeGranted }` (owner only, else 404) | `content:share` | content |
| PUT | /api/v1/quizsets/:id/sharing | Apply a sharing delta (see business rules); 409 `SHARE_LIST_FULL` | `content:share` | content |
| POST | /api/v1/quizsets/:id/generate-code | Rotate the 6-digit code; clears code-granted users | `content:share` | content |

#### Flashcard Sets

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/flashcardsets | List flashcard sets (paginated) | Bearer | content |
| GET | /api/v1/flashcardsets/stats | Get flashcard set statistics | Bearer | content |
| GET | /api/v1/flashcardsets/users/search | Search users for whitelist (`user:search`; `q` >= 3 chars, no email in result) | Bearer | content |
| GET | /api/v1/flashcardsets/public/:id | Get public flashcard set (anonymous; `routes.yaml` public entry, phase 06) | public | content |
| GET | /api/v1/flashcardsets/:id | Get flashcard set by ID | Bearer | content |
| GET | /api/v1/flashcardsets/:id/flashcards | Get paginated flashcards | Bearer | content |
| GET | /api/v1/flashcardsets/:id/labels | Get labels for flashcard set | Bearer | content |
| POST | /api/v1/flashcardsets | Create new flashcard set | Bearer | content |
| PUT | /api/v1/flashcardsets/:id | Update flashcard set | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id | Delete flashcard set | Bearer | content |
| POST | /api/v1/flashcardsets/:id/share | Generate share link and access code | Bearer | content |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | Assign flashcards to set | Bearer | content |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | Save AI-generated flashcards to set | Bearer | content |
| POST | /api/v1/flashcardsets/:id/labels | Create label for flashcard set | Bearer | content |
| PUT | /api/v1/flashcardsets/:id/labels/:labelId | Update label | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId | Delete label | Bearer | content |
| POST | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Assign flashcards to label | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Remove flashcards from label | Bearer | content |
| GET | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Get flashcards by label | Bearer | content |
| POST | /api/v1/flashcardsets/:setId/flashcards | Add flashcard to set | Bearer | content |
| PUT | /api/v1/flashcardsets/:setId/flashcards/:cardId | Update flashcard | Bearer | content |
| DELETE | /api/v1/flashcardsets/:setId/flashcards/:cardId | Delete flashcard | Bearer | content |
| GET | /api/v1/flashcardsets/study/:id/access | Check access to flashcard set | public | content |
| GET | /api/v1/flashcardsets/study/:id/info | Get public info for study | public | content |
| GET | /api/v1/flashcardsets/study/:id | Get flashcard set for study | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/verify-code | Verify access code | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/with-code | Get set with access code | Bearer | content |
| GET | /api/v1/flashcardsets/:id/sharing | Get sharing settings `{ isPublic, accessCode, whitelist, codeGranted }` | Bearer | content |
| PUT | /api/v1/flashcardsets/:id/sharing | Apply a sharing delta (`addUserIds`, `removeUserIds`, `removeCodeGrantedIds`, `isPublic`, `codeEnabled`; lists capped at 2000, 409 `SHARE_LIST_FULL`) | Bearer | content |
| POST | /api/v1/flashcardsets/:id/generate-code | Generate new access code (clears code-granted users) | Bearer | content |

#### Exam Rooms

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/examrooms/list | List exam rooms (paginated) | Bearer | assessment |
| GET | /api/v1/examrooms/list-all | List all exam rooms | Bearer | assessment |
| GET | /api/v1/examrooms/detail/:id | Get exam room by ID | Bearer | assessment |
| GET | /api/v1/examrooms/get-public/:id | Get public exam room (teaser, no email) | public | assessment |
| POST | /api/v1/examrooms | Create exam room | Bearer | assessment |
| PUT | /api/v1/examrooms/:id | Update exam room | Bearer | assessment |
| DELETE | /api/v1/examrooms/:id | Delete exam room | Bearer | assessment |
| GET | /api/v1/examrooms/:examRoomId/sessions | Get exam sessions for room | Bearer | assessment |

#### Exam Sessions

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/examsessions/list | List exam sessions (paginated) | Bearer | assessment |
| GET | /api/v1/examsessions/get-by-id/:id | Get exam session by ID | Bearer | assessment |
| GET | /api/v1/examsessions/get-public/:id | Get public exam session (trimmed) | public | assessment |
| POST | /api/v1/examsessions | Create exam session | Bearer | assessment |
| PUT | /api/v1/examsessions/:id | Update exam session | Bearer | assessment |
| DELETE | /api/v1/examsessions/:id | Delete exam session | Bearer | assessment |
| GET | /api/v1/examsessions/users/search | Search users for whitelist (`user:search`; `q` >= 3 chars, no email) | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/access | Check access to exam session | public | assessment |
| GET | /api/v1/examsessions/study/:id/info | Get public info | public | assessment |
| GET | /api/v1/examsessions/study/:id | Get exam session for study | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/with-code | Get session with access code | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/verify-code | Verify access code | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/stats | Get student-visible stats | Bearer | assessment |
| GET | /api/v1/examsessions/:id/sharing | Get sharing settings | Bearer | assessment |
| PUT | /api/v1/examsessions/:id/sharing | Update sharing settings | Bearer | assessment |
| POST | /api/v1/examsessions/:id/generate-code | Generate access code | Bearer | assessment |
| GET | /api/v1/examsessions/room/:roomId/available-labels | Get available labels for room | Bearer | assessment |

#### Exam Attempts

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/examattempts/start | Start or resume exam attempt | Bearer | assessment |
| GET | /api/v1/examattempts/list | List exam attempts (paginated) | Bearer | assessment |
| GET | /api/v1/examattempts/history-stats | Get aggregated history statistics | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | List attempts by room (owner) | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-session/:sessionId | List attempts by session (owner) | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/quiz | Get attempt with questions | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/detail | Get attempt detail (owner) | Bearer | assessment |
| PUT | /api/v1/examattempts/:attemptId/progress | Update progress (auto-save) | Bearer | assessment |
| POST | /api/v1/examattempts/:attemptId/submit | Submit exam (legacy) | Bearer | assessment |
| GET | /api/v1/examattempts/:attemptId/secure-quiz | Get encrypted quiz with JWT tokens | Bearer | assessment |
| POST | /api/v1/examattempts/:attemptId/secure-submit | Submit with JWT verification | Bearer | assessment |

#### Subjects

> Owner: ai-chat-service since phase 13 (public routes, upstream `aichat`); previously exam-service.

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/subjects/categories | Get subject categories with subjects | Bearer | ai-chat |
| GET | /api/v1/subjects | List all subjects | Bearer | ai-chat |
| GET | /api/v1/subjects/:id | Get subject by ID | Bearer | ai-chat |
| GET | /api/v1/subjects/slug/:slug | Get subject by slug | Bearer | ai-chat |

#### Wallet

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/wallet/details | Get wallet with transaction history | Bearer | finance |

#### Payment

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/payment/create | Create payment (credits/subscription) | Bearer | finance |
| GET | /api/v1/payment/status/:paymentId | Check payment status | Bearer | finance |
| GET | /api/v1/payment/subscription | Get current subscription | Bearer | finance |
| GET | /api/v1/payment/subscription/plans | List subscription plans | Bearer | finance |
| DELETE | /api/v1/payment/cancel/:paymentId | Cancel pending payment | Bearer | finance |

#### Student

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/student/recent-flashcards | Get recent viewed flashcard sets | Bearer | content |
| GET | /api/v1/student/recent-exams | Get recent exam attempts | Bearer | assessment |
| POST | /api/v1/student/pin-flashcard/:id | Toggle pin/unpin flashcard set | Bearer | content |

#### AI Study

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/ai/quick-upload | Quick upload file for AI Teacher | Bearer | document |
| POST | /api/v1/ai/upload | Register an uploaded file (JSON, object already in R2); charges `doc:<id>` and publishes `document.uploaded` | Bearer | document |
| POST | /api/v1/ai/generate-from-file | Upload file and generate quiz/flashcard | Bearer | content |
| GET | /api/v1/ai/recent-uploads | List recently uploaded files | Bearer | content |
| GET | /api/v1/ai/models | Get AI model catalog | Bearer | content |
| GET | /api/v1/ai/upload/:uploadId | Get upload detail | Bearer | document |
| DELETE | /api/v1/ai/upload/:uploadId | Delete upload | Bearer | document |
| GET | /api/v1/ai/upload/:uploadId/history | Get quiz/flashcard history for upload | Bearer | content |
| POST | /api/v1/ai/regenerate/:uploadId | Regenerate quiz/flashcard from file | Bearer | content |
| GET | /api/v1/ai/job/:jobId | Get job status | Bearer | content |
| DELETE | /api/v1/ai/job/:jobId | Cancel job | Bearer | content |
| POST | /api/v1/ai/upload-image | Upload image for AI chat | Bearer | document |

#### AI Chat

> Owner: ai-chat-service since phase 13 (gateway upstream `aichat`); previously exam-service.

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/ai-chat | List all chats | Bearer | ai-chat |
| POST | /api/v1/ai-chat | Create new chat | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/messages | Get chat messages | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/message | Send message | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/stream | Send message with SSE streaming | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/exists | Check chat exists | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId | Delete chat | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/documents | Get chat documents | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/documents | Add document to chat | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | Remove document from chat | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/message/:messageId | Delete message | Bearer | ai-chat |
| PATCH | /api/v1/ai-chat/message/:messageId | Update message | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | Regenerate AI response | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | Regenerate with SSE streaming | Bearer | ai-chat |

#### Flashcard Study

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/flashcard-study/session | Get or create study session | Bearer | content |
| PUT | /api/v1/flashcard-study/session/:sessionId | Update study session | Bearer | content |
| POST | /api/v1/flashcard-study/session/:sessionId/complete | Complete study session | Bearer | content |
| POST | /api/v1/flashcard-study/session/:sessionId/review | Review flashcard | Bearer | content |
| GET | /api/v1/flashcard-study/cards/:flashCardSetId | Get cards for study | Bearer | content |
| GET | /api/v1/flashcard-study/history/:flashCardSetId | Get study history | Bearer | content |
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | Get study progress | Bearer | content |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | Save study progress | Bearer | content |

#### Quiz Practice

Student practice on shared quiz sets (phase 07; routes.yaml entry `quiz-practice`, `auth: required`, `GET sets/:id/access` public). Practice questions never carry the answer key before submit; a submitted attempt returns the `resultSnapshot` frozen at submit. The old `/quiz-practice-attempts*` routes no longer exist.

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/quiz-practice/sets | Sets shared with me (whitelist, code-unlocked, or public with an attempt), paginated (`page`, `limit` 1-50) | `quiz:practice` | content |
| GET | /api/v1/quiz-practice/sets/:id/access | `{ canAccess, requiresCode, reason }`; anonymous on a code-protected set gets only `canAccess:false, requiresCode:true`; private set without grant: 404 | Public (token optional) | content |
| POST | /api/v1/quiz-practice/sets/:id/unlock | Unlock with the 6-digit code (`{ code }`); `INVALID_CODE`, `CODE_LOCKED`, `SHARING_CHANGED`; gateway limit 5 / 60 s | `quiz:practice` | content |
| POST | /api/v1/quiz-practice/attempts | Start or resume the open attempt (`{ quizSetId }`); questions without answers | Owner or `quiz:practice` | content |
| GET | /api/v1/quiz-practice/attempts | My submitted attempts, newest first (`quizSetId`, `page`, `limit`) | Bearer (own data) | content |
| GET | /api/v1/quiz-practice/attempts/:id | Open attempt (404 if the set is no longer accessible) or submitted result snapshot | Bearer (own, else 404) | content |
| PUT | /api/v1/quiz-practice/attempts/:id | Autosave answers / index / marks / time; 409 `ALREADY_SUBMITTED` | Bearer (own) | content |
| POST | /api/v1/quiz-practice/attempts/:id/submit | Server-side scoring (0-10, 2 decimals); 409 `ALREADY_SUBMITTED` | Bearer (own) | content |

#### Cheating Logs

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/cheatinglogs | Log cheating violation | Bearer | assessment |
| GET | /api/v1/cheatinglogs/attempt/:attemptId | Get cheating logs for attempt (host) | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:sessionId/stats | Get cheating stats for session (host) | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | Get user attempts with logs (host) | Bearer | assessment |

#### R2 Storage

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/r2/image | Upload image to R2 storage (max 2MB) | Bearer | document |

#### Webhook

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/webhook/sepay | SePay payment webhook callback | ApiKey | finance |

---

### Auth Service (`localhost:3001`, `/api/v1/...`)

Internal service routes — not directly exposed to clients (gateway proxies to these).

#### Auth

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/auth/register | Register user | public | auth |
| POST | /api/v1/auth/login | Login | public | auth |
| POST | /api/v1/auth/logout | Logout | Bearer | auth |
| POST | /api/v1/auth/refresh | Refresh token | public (cookie) | auth |
| POST | /api/v1/auth/sendVerificationEmail | Send verification email | Bearer | auth |
| POST | /api/v1/auth/verifyAccount | Verify account | Bearer | auth |
| POST | /api/v1/auth/send-code-reset-password | Send reset code | public | auth |
| POST | /api/v1/auth/reset-password | Reset password | public | auth |
| POST | /api/v1/auth/send-code-change-password | Send change password code | Bearer | auth |
| POST | /api/v1/auth/change-password | Change password | Bearer | auth |
| GET | /api/v1/auth/google | Initiate Google OAuth | public | auth |
| POST | /api/v1/auth/google/one-tap | Google One Tap | public | auth |
| GET | /api/v1/auth/google/callback | Google OAuth callback | public | auth |
| GET | /api/v1/auth/me | Get current user | Bearer | auth |
| POST | /api/v1/auth/sync-refresh-token | Sync refresh token | Bearer | auth |
| POST | /api/v1/auth/exchange | Exchange OAuth code for tokens | public | auth |

#### Profile

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/profile | Get profile | Bearer | auth |
| PUT | /api/v1/profile | Update profile | Bearer | auth |
| POST | /api/v1/profile/upload-avatar | Upload avatar | Bearer | auth |
| POST | /api/v1/profile/upload-banner | Upload banner | Bearer | auth |

#### Devices

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/devices | List devices | Bearer | auth |
| DELETE | /api/v1/devices/:sessionId | Logout device | Bearer | auth |
| POST | /api/v1/devices/logout-all-others | Logout all other devices | Bearer | auth |

---

### Content, Assessment, ai-chat and Document routes (formerly Exam Service)

exam-service was split in phases 12-15; the Owner column says which service serves each row.

#### Quiz Sets

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/quizsets | List quiz sets | Bearer | content |
| GET | /api/v1/quizsets/stats | Quiz set statistics | Bearer | content |
| GET | /api/v1/quizsets/:id | Get quiz set by ID | Bearer | content |
| GET | /api/v1/quizsets/:id/questions | Get paginated questions | Bearer | content |
| GET | /api/v1/quizsets/list/all | List all (no pagination) | Bearer | content |
| POST | /api/v1/quizsets | Create quiz set | Bearer | content |
| PUT | /api/v1/quizsets/:id | Update quiz set | Bearer | content |
| DELETE | /api/v1/quizsets/:id | Delete quiz set | Bearer | content |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | Assign quizzes to set | Bearer | content |
| POST | /api/v1/quizsets/save-history-to-quizset | Save AI-generated quizzes | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/questions | Add question | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | Update question | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | Delete question | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels | Get labels | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels | Create label | Bearer | content |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | Update label | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | Delete label | Bearer | content |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Assign questions to label | Bearer | content |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Remove questions from label | Bearer | content |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Get questions by label | Bearer | content |
| GET | /api/v1/quizsets/users/search | Search users for the whitelist picker (`q` >= 3 chars, max 10, no email; gateway limit 30 / 60 s) | `user:search` | content |
| GET | /api/v1/quizsets/:id/sharing | Sharing settings `{ isPublic, accessCode, whitelist, codeGranted }` (owner only, else 404) | `content:share` | content |
| PUT | /api/v1/quizsets/:id/sharing | Apply a sharing delta (see business rules); 409 `SHARE_LIST_FULL` | `content:share` | content |
| POST | /api/v1/quizsets/:id/generate-code | Rotate the 6-digit code; clears code-granted users | `content:share` | content |

#### Flashcard Sets

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/flashcardsets | List flashcard sets | Bearer | content |
| GET | /api/v1/flashcardsets/stats | Flashcard set statistics | Bearer | content |
| GET | /api/v1/flashcardsets/users/search | Search users for whitelist (`user:search`; `q` >= 3 chars) | Bearer | content |
| GET | /api/v1/flashcardsets/:id | Get flashcard set by ID | Bearer | content |
| GET | /api/v1/flashcardsets/:id/flashcards | Get paginated flashcards | Bearer | content |
| GET | /api/v1/flashcardsets/:id/labels | Get labels | Bearer | content |
| POST | /api/v1/flashcardsets | Create flashcard set | Bearer | content |
| PUT | /api/v1/flashcardsets/:id | Update flashcard set | Bearer | content |
| DELETE | /api/v1/flashcardsets/:id | Delete flashcard set | Bearer | content |
| GET | /api/v1/flashcardsets/public/:id | Get public flashcard set (`@Public()`, trimmed view; also exposed anonymously via the gateway) | public | content |
| POST | /api/v1/flashcardsets/:id/share | Generate share link (`content:share`, owner only) | Bearer | content |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | Assign flashcards | Bearer | content |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | Save AI-generated flashcards | Bearer | content |
| POST | /api/v1/flashcardsets/:flashcardSetId/labels | Create label | Bearer | content |
| PUT | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId | Update label | Bearer | content |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId | Delete label | Bearer | content |
| POST | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Assign flashcards | Bearer | content |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Remove flashcards | Bearer | content |
| GET | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Get flashcards by label | Bearer | content |
| POST | /api/v1/flashcardsets/:flashcardSetId/flashcards | Add flashcard | Bearer | content |
| PUT | /api/v1/flashcardsets/:flashcardSetId/flashcards/:flashcardId | Update flashcard | Bearer | content |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/flashcards/:flashcardId | Delete flashcard | Bearer | content |
| GET | /api/v1/flashcardsets/study/:id/access | Check access | public | content |
| GET | /api/v1/flashcardsets/study/:id/info | Get public info | public | content |
| GET | /api/v1/flashcardsets/study/:id | Get set for study (owner, or `flashcard:study` + public/whitelist; else 404) | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/verify-code | Verify access code (`flashcard:study`; lockout, see permissions.md) | Bearer | content |
| POST | /api/v1/flashcardsets/study/:id/with-code | Get set with access code (`flashcard:study`; lockout) | Bearer | content |
| GET | /api/v1/flashcardsets/:id/sharing | Get sharing settings `{ isPublic, accessCode, whitelist, codeGranted }` | Bearer | content |
| PUT | /api/v1/flashcardsets/:id/sharing | Apply a sharing delta (`addUserIds`, `removeUserIds`, `removeCodeGrantedIds`, `isPublic`, `codeEnabled`; lists capped at 2000, 409 `SHARE_LIST_FULL`) | Bearer | content |
| POST | /api/v1/flashcardsets/:id/generate-code | Generate access code | Bearer | content |

#### Exam Rooms

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/examrooms | Create exam room | Bearer | assessment |
| GET | /api/v1/examrooms/detail/:id | Get exam room by ID | Bearer | assessment |
| PUT | /api/v1/examrooms/:id | Update exam room | Bearer | assessment |
| GET | /api/v1/examrooms/list | List exam rooms | Bearer | assessment |
| GET | /api/v1/examrooms/list-all | List all exam rooms | Bearer | assessment |
| DELETE | /api/v1/examrooms/:id | Delete exam room | Bearer | assessment |
| GET | /api/v1/examrooms/get-public/:id | Teaser `{id,title,description,host:{name,avatar}}`, only for a room with a PUBLIC session | public | assessment |
| GET | /api/v1/examrooms/:id/sessions | Get exam sessions for room | Bearer | assessment |

#### Exam Sessions

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/examsessions | Create exam session | Bearer | assessment |
| GET | /api/v1/examsessions/get-by-id/:id | Get exam session by ID | Bearer | assessment |
| PUT | /api/v1/examsessions/:id | Update exam session | Bearer | assessment |
| GET | /api/v1/examsessions/list | List exam sessions | Bearer | assessment |
| DELETE | /api/v1/examsessions/:id | Delete exam session | Bearer | assessment |
| GET | /api/v1/examsessions/get-public/:id | Get public exam session (trimmed view, no answers/email) | public | assessment |
| GET | /api/v1/examsessions/study/:id/access | Check access | public | assessment |
| GET | /api/v1/examsessions/study/:id/info | Get public info | public | assessment |
| GET | /api/v1/examsessions/study/:id | Get session for study (`exam:take`; answer-free view; no grant = 404) | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/verify-code | Verify access code (`exam:take`; lockout) | Bearer | assessment |
| POST | /api/v1/examsessions/study/:id/with-code | Get session with code (`exam:take`; lockout) | Bearer | assessment |
| GET | /api/v1/examsessions/study/:id/stats | Get student stats | Bearer | assessment |
| GET | /api/v1/examsessions/:id/sharing | Get sharing settings | Bearer | assessment |
| PUT | /api/v1/examsessions/:id/sharing | Update sharing settings | Bearer | assessment |
| POST | /api/v1/examsessions/:id/generate-code | Generate access code | Bearer | assessment |
| GET | /api/v1/examsessions/users/search | Search users for whitelist (`user:search`; `q` >= 3 chars, no email) | Bearer | assessment |
| GET | /api/v1/examsessions/room/:roomId/available-labels | Get available labels | Bearer | assessment |

#### Exam Attempts

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/examattempts/history-stats | Aggregated history statistics | Bearer | assessment |
| POST | /api/v1/examattempts/start | Start or resume exam attempt | Bearer | assessment |
| PUT | /api/v1/examattempts/:id/progress | Update progress (auto-save) | Bearer | assessment |
| POST | /api/v1/examattempts/:id/submit | Submit exam (legacy) | Bearer | assessment |
| GET | /api/v1/examattempts/:id/quiz | Get attempt with questions | Bearer | assessment |
| GET | /api/v1/examattempts/:id/secure-quiz | Get encrypted quiz with JWT | Bearer | assessment |
| POST | /api/v1/examattempts/:id/secure-submit | Submit with JWT verification | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | List attempts by room (owner) | Bearer | assessment |
| GET | /api/v1/examattempts/list-by-session/:sessionId | List attempts by session (owner) | Bearer | assessment |
| GET | /api/v1/examattempts/:id/detail | Get attempt detail (owner) | Bearer | assessment |
| POST | /api/v1/examattempts | Create exam attempt | Bearer | assessment |
| GET | /api/v1/examattempts/get-by-id/:id | Get attempt by ID | Bearer | assessment |
| PUT | /api/v1/examattempts/:id | Update attempt | Bearer | assessment |
| GET | /api/v1/examattempts/list | List attempts | Bearer | assessment |
| DELETE | /api/v1/examattempts/:id | Delete attempt | Bearer | assessment |

#### Subjects

> Owner: ai-chat-service since phase 13 (public routes, upstream `aichat`); previously exam-service.

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/subjects/categories | Get subject categories | public | ai-chat |
| GET | /api/v1/subjects | List all subjects | public | ai-chat |
| GET | /api/v1/subjects/:id | Get subject by ID | public | ai-chat |
| GET | /api/v1/subjects/slug/:slug | Get subject by slug | public | ai-chat |

#### AI

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/ai/quick-upload | Quick upload for AI Teacher | Bearer | document |
| POST | /api/v1/ai/generate-from-file | Upload and generate quiz/flashcard | Bearer | content |
| GET | /api/v1/ai/recent-uploads | List recent uploads | Bearer | content |
| GET | /api/v1/ai/models | Get AI model catalog | Bearer | content |
| POST | /api/v1/ai/upload | Create upload + trigger OCR | Bearer | document |
| GET | /api/v1/ai/upload/:uploadId | Get upload detail | Bearer | document |
| DELETE | /api/v1/ai/upload/:uploadId | Delete upload | Bearer | document |
| GET | /api/v1/ai/upload/:uploadId/history | Get quiz/flashcard history | Bearer | content |
| POST | /api/v1/ai/regenerate/:uploadId | Regenerate quiz/flashcard | Bearer | content |
| GET | /api/v1/ai/job/:jobId | Get job status | Bearer | content |
| DELETE | /api/v1/ai/job/:jobId | Cancel job | Bearer | content |
| POST | /api/v1/ai/upload-image | Upload image for AI chat | Bearer | document |

#### AI Chat

> Owner: ai-chat-service since phase 13 (gateway upstream `aichat`); previously exam-service.

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/ai-chat | List chats | Bearer | ai-chat |
| POST | /api/v1/ai-chat | Create chat | Bearer | ai-chat |
| PATCH | /api/v1/ai-chat/:chatId | Update chat title | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId | Delete chat | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/clear | Clear chat content | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/exists | Check chat exists | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/messages | Get messages | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/message | Send message | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/stream | Send message with SSE streaming | Bearer | ai-chat |
| PATCH | /api/v1/ai-chat/message/:messageId | Update message | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/message/:messageId | Delete message | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | Regenerate AI response | Bearer | ai-chat |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | Regenerate with SSE | Bearer | ai-chat |
| GET | /api/v1/ai-chat/:chatId/documents | Get chat documents | Bearer | ai-chat |
| POST | /api/v1/ai-chat/:chatId/documents | Add document to chat | Bearer | ai-chat |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | Remove document | Bearer | ai-chat |

#### Flashcard Study

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | Get study progress | Bearer | content |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | Save study progress | Bearer | content |

#### Student

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/student/recent-flashcards | Get recent flashcard sets | Bearer | content |
| GET | /api/v1/student/recent-exams | Get recent exam attempts | Bearer | assessment |
| POST | /api/v1/student/pin-flashcard/:id | Toggle pin flashcard set | Bearer | content |
| POST | /api/v1/student/pin-exam-room/:id | Toggle pin exam room | Bearer | assessment |

#### R2

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/r2/image | Upload image to R2 storage | Bearer | document |

#### Cheating Logs

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/cheatinglogs | Log cheating violation | Bearer | assessment |
| GET | /api/v1/cheatinglogs/attempt/:id | Get logs for attempt (host) | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:id/stats | Get session stats (host) | Bearer | assessment |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | Get user attempts with logs (host) | Bearer | assessment |

---

### Finance and Admin Services (finance `localhost:3003`, admin `localhost:7006`, `/api/v1/...`)

#### Wallet

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/wallet/info | Get wallet info | Bearer | finance |
| GET | /api/v1/wallet/details | Get wallet with transaction history | Bearer | finance |

#### Payment

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/payment/create | Create payment and get QR code | Bearer | finance |
| GET | /api/v1/payment/status/:paymentId | Check payment status | Bearer | finance |
| GET | /api/v1/payment/history | Get payment history | Bearer | finance |
| DELETE | /api/v1/payment/cancel/:paymentId | Cancel pending payment | Bearer | finance |
| GET | /api/v1/payment/subscription | Get current subscription | Bearer | finance |
| GET | /api/v1/payment/subscription/plans | Get subscription plans | Bearer | finance |

#### Webhook

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| POST | /api/v1/webhook | SePay payment webhook (apikey auth) | ApiKey | finance |

#### Admin

All admin routes are proxied from gateway via `/api/v1/admin/*` to `admin-service` (HTTP 3000 in containers). Auth: per-controller `@RequirePermissions(...)` (stateless JWT; the permission is named in the table, `SYSTEM_ADMIN` holds all). `grant-admin` / `revoke-admin` were removed in phase 08 (use `PUT /admin/roles/users/:id/system-admin`); `DELETE /admin/users/:id` does not exist in `AdminUsersController`. `/admin/users*` and `/admin/roles*` answer `{ statusCode, code, message, requestId }`; a bad body or query is 400 `VALIDATION_ERROR`. Details: [permissions](../system/permissions.md).

| Method | Path | Description | Auth | Owner |
|--------|------|-------------|------|-------|
| GET | /api/v1/admin/bootstrap | Application bootstrap + health | Admin | admin |
| GET | /api/v1/admin/stats | KPI overview + time-series data | Admin | admin |
| GET | /api/v1/admin/stats/sources | Signup breakdown by `utm_source` (null → "direct"), top 20 desc | Admin | admin |
| GET | /api/v1/admin/sources | Alias of `/admin/stats/sources` for FE dashboard | Admin | admin |
| GET | /api/v1/admin/users | User list with pagination + filters | Admin | admin |
| GET | /api/v1/admin/users/:id | User detail | Admin (`user:manage`) | admin |
| PATCH | /api/v1/admin/users/:id | Edit profile fields; `role`, `isSystemAdmin`, `isBanned`, `isAdmin` are rejected (400 `VALIDATION_ERROR`) | Admin (`user:manage`) | admin |
| POST | /api/v1/admin/users/:id/ban | Ban via auth `SetUserStatus`: revokes sessions, bumps `authzVersion`; self 403 `CANNOT_CHANGE_OWN_STATUS`, last admin 409 `LAST_SYSTEM_ADMIN` | Admin (`user:manage`) | admin |
| POST | /api/v1/admin/users/:id/unban | Unban via auth `SetUserStatus` (also clears a legacy `deletedAt`) | Admin (`user:manage`) | admin |
| GET | /api/v1/admin/roles | Read-only role to permission matrix `{ roles, permissions }` | Admin (`role:assign`) | admin |
| GET | /api/v1/admin/roles/users | Users with `role` / `isSystemAdmin`; filters `q`, `role`, `isSystemAdmin`, `page`, `limit` (max 100); returns `systemAdminCount` | Admin (`role:assign`) | admin |
| GET | /api/v1/admin/roles/changes | Role change history (`userId`, `page`, `limit`), newest first | Admin (`role:assign`) | admin |
| PUT | /api/v1/admin/roles/users/:id/role | Set base role `STUDENT` / `TEACHER` (`reason` optional); 403 `CANNOT_CHANGE_OWN_ROLE`, 404 `USER_NOT_FOUND`, 409 `ROLE_CHANGE_CONFLICT` | Admin (`role:assign`) | admin |
| PUT | /api/v1/admin/roles/users/:id/system-admin | Grant / revoke SYSTEM_ADMIN (`{ isSystemAdmin, reason? }`); also 409 `LAST_SYSTEM_ADMIN` | Admin (`role:assign`) | admin |
| POST | /api/v1/admin/finance/refund | Refund a payment (finance `RefundPayment`); optional `Idempotency-Key` header (1-200 chars, else a fresh key per request), response carries `alreadyApplied` | Admin (`finance:admin`) | admin |
| POST | /api/v1/admin/finance/credit | Manual credit adjustment (finance `AdjustBalance`); `Idempotency-Key`, `alreadyApplied` | Admin (`finance:admin`) | admin |
| POST | /api/v1/admin/finance/set-tier | Change user subscription tier (finance `ChangeTier`); `Idempotency-Key`, `alreadyApplied` | Admin (`finance:admin`) | admin |
| POST | /api/v1/admin/finance/tier | Alias of `set-tier` (used by the FE) | Admin (`finance:admin`) | admin |
| GET | /api/v1/admin/audit | Query audit log (paginated, date-filtered) | Admin | admin |
| GET | /api/v1/admin/logs | Fetch server-side logs (polling fallback) | Admin | admin |
| GET | /api/v1/admin/logs/stream | SSE stream for real-time logs (ticket exchange) | Admin | admin |

---

## Frontend Routes

### File: `examio-fe/src/routes/index.tsx`

React Router v6 `createBrowserRouter` — all routes use layout wrappers.

#### Public Routes (no auth required)

| Path | Component | Layout | Guard |
|------|-----------|--------|-------|
| / | HomePage | PublicLayout | PublicRoute |
| /about | AboutPage | PublicLayout | PublicRoute |
| /contact | ContactPage | PublicLayout | PublicRoute |
| /terms | TermsPage | PublicLayout | PublicRoute |
| /privacy | PrivacyPage | PublicLayout | PublicRoute |
| /cookies | CookiesPage | PublicLayout | PublicRoute |
| /security | SecurityPage | PublicLayout | PublicRoute |
| /login | LoginPage | AuthLayout | PublicRoute |
| /register | RegisterPage | AuthLayout | PublicRoute |
| /forgot-password | ForgotPasswordPage | AuthLayout | PublicRoute |
| /reset-password | ResetPasswordPage | AuthLayout | PublicRoute |

#### Protected Routes (auth + permission)

Updated 2026-10-22 (phase 09): every non-public route is wrapped by `guarded()` → `RequirePermission` (login, then permission, else `/403`). Per-route permissions and page flags: [permissions](../system/permissions.md) § Frontend route guards. `/403` (`ForbiddenPage`) only needs a login (`ProtectedRoute`). `TeacherRoute` no longer exists.

| Path | Component | Layout | Required permission |
|------|-----------|--------|---------------------|
| /403 | ForbiddenPage | none | login only |
| /k | KRootRedirect | KLayout | login only |
| /k/profile | ProfilePage | KLayout | login only |
| /k/verify | VerifyPage | KLayout | login only |
| /k/subscription | SubscriptionPage | KLayout | `subscription:manage` |
| /k/my-materials | MyMaterialsPage | KLayout | `flashcard:study` |
| /k/flash-card | FlashcardsPage | KLayout | `flashcardset:manage` |
| /k/history | HistoryPage | KLayout | `ai:generate` or `exam:take` |
| /k/history/exam | ExamHistoryPage | KLayout | `exam:take` |
| /k/history/pdf | PDFHistoryPage | KLayout | `ai:generate` |
| /k/manage-exam | ManageExamPage | KLayout | `quizset:manage` |
| /k/manage-quiz-set/:id | ManageQuizSetDetailPage | KLayout | `quizset:manage` |
| /k/manage-flashcard-set/:id | ManageFlashcardSetDetailPage | KLayout | `flashcardset:manage` |
| /k/practice-quiz/:id | QuizPracticePage | KLayout | `quiz:practice` or `quizset:manage` |
| /k/ai-tool | AIToolPage | KLayout | `ai:generate` |
| /k/manage-exam-room | ManageExamRoomPage | KLayout | `exam_room:manage` |
| /k/manage-exam-room/:id | ManageExamRoomDetailPage | KLayout | `exam_room:manage` |
| /k/manage-exam-room/:id/session/:sessionId | ExamRoomSessionAnalyticsPage | KLayout | `exam_result:view` |
| /k/my-exams | MyExamsPage | KLayout | `exam:take` |
| /k/study-room | StudyRoomListPage | KLayout | `study_room:join` |
| /k/study-room/:id | StudyRoomPage | none | `study_room:join` |
| /k/word-family | WordFamilyPage | KLayout | `word_family:read` |
| /k/word-family/:slug | WordFamilyCategoryPage | KLayout | `word_family:read` |
| /k/word-family/:slug/:rootWord | WordFamilyDetailPage | KLayout | `word_family:read` |

#### Admin Routes

Shell `/admin` (`AdminRoute` = `RequirePermission admin:access`, `AdminLayout`); each child adds its own permission.

| Path | Component | Required permission |
|------|-----------|---------------------|
| /admin | AdminOverviewPage | `stats:read` |
| /admin/stats | AdminStatsPage | `stats:read` |
| /admin/users | AdminUsersPage | `user:manage` |
| /admin/roles | AdminRolesPage | `role:assign` |
| /admin/finance | AdminFinancePage | `finance:admin` |
| /admin/logs | AdminLogsPage | `logs:read` |
| /admin/audit | AdminAuditPage | `audit:read` |
| /admin/word-family | AdminWordFamilyPage | `word_family:admin` |
| /admin/page-config | AdminPageConfigPage | `page_config:manage` |

#### Exam Session Routes (special layout)

| Path | Component | Layout | Required permission |
|------|-----------|--------|---------------------|
| /study-flashcard/:id | FlashcardStudyPage | none | `flashcard:study` or `flashcardset:manage` (login now required; was open) |
| /exam-session/:id | ExamSessionPage | ExamSessionLayout | none in the router |
| /exam-session/:id/quiz | ExamQuizPage | none | `exam:take` |

#### Catch-all

| Path | Component |
|------|-----------|
| * | NotFoundPage |

---

## Summary

| Category | Count |
|----------|-------|
| Gateway section rows (public, optional and authenticated) | 174 |
| of which owned by content | 79 |
| of which owned by assessment | 41 |
| of which owned by auth | 23 |
| of which owned by ai-chat | 18 |
| of which owned by finance | 7 |
| of which owned by document | 6 |
| Service-section rows (auth 23, content/assessment/ai-chat/document 137, finance 9, admin 21) | 190 |
| Frontend routes (router entries incl. `/admin` shell, 9 admin children, `/403`, catch-all) | 48 |
| **Total frontend routes** | **48** |

## Notes

1. **Finance routes** (updated 2026-10-20): the duplicate gateway proxy controllers are gone. `routes.yaml` has one `wallet` entry (`/api/v1/wallet`) and one `payment` entry (`/api/v1/payment`, public `GET /payment/subscription/plans`), both `permissions: [wallet:use]`; `/api/v1/profile` routes to auth-service. SePay `POST /api/v1/webhook/sepay` is rewritten to `/api/v1/webhook` on finance.

2. **Public vs optional vs authenticated** (updated 2026-10-20): each `routes.yaml` entry sets `auth: none | optional | required` (plus `public` method/path exceptions). Public: auth endpoints (login, register, reset, OAuth), `GET /status`, SePay webhook, admin log stream (ticket), public exam room/session/flashcard set access. `optional`: `/config/pages`, `/subjects`. Unmatched paths return 404 `ROUTE_NOT_FOUND`. Services still re-verify the token with `@examio/auth-jwt`.

3. **Quiz encryption** (assessment-service): Exam attempts have two submission paths — legacy `submit` (plain answers) and secure `secure-submit` (answers wrapped in JWT tokens from encrypted quiz). The `secure-quiz` endpoint returns AES-256-CBC encrypted questions with server-signed JWT tokens.

4. **Gateway is the only public entry**: All clients go through `gateway-service` on port 3000. No backend container publishes a host port; only the FE nginx is reachable from outside and it forwards to the gateway.

5. **AI service** (Python FastAPI) runs as a separate process; not part of the NestJS scan. Since phases 13-15 it is called over gRPC (`AiService`, caller `svc:content`, `svc:ai-chat` or `svc:vocabulary`) and by events; its HTTP surface is only `/` and `/health`.

## Unresolved

- `PendingJobDialog` rendered unconditionally in `KLayout` — unclear if intentional.
- `ProfilePage` uses both `getProfileApi` and `useAuthStore.user` — possible state drift.
- `SubscriptionPage` vs `SubscriptionTemplate` — two subscription UIs, unclear canonical.