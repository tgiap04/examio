# Route List — examio

**Project**: examio
**Generated**: 2026-06-05
**Stack**: TypeScript (NestJS monorepo backend + React 19 SPA frontend)
**Gateway**: `http://localhost:3000` — single HTTP entry point; all backend routes live under `/api/v1`

---

## Backend Routes

### Gateway (`/api/v1/...`)

Gateway proxies all requests to downstream services. Auth: Bearer token (forwarded as `Authorization: Bearer ...` header) or cookie `token`/`accessToken`.

#### Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/auth/login | Login with email/password | public |
| POST | /api/v1/auth/register | Register new account | public |
| POST | /api/v1/auth/send-code-reset-password | Send reset password code | public |
| POST | /api/v1/auth/reset-password | Reset password with code | public |
| POST | /api/v1/auth/refresh | Refresh access token | public (cookie) |
| POST | /api/v1/auth/logout | Logout and clear session | Bearer |
| GET | /api/v1/auth/google | Initiate Google OAuth flow | public |
| GET | /api/v1/auth/google/callback | Google OAuth callback | public |
| POST | /api/v1/auth/google/one-tap | Google One Tap login | public |
| POST | /api/v1/auth/sync-refresh-token | Sync refresh token from current session | Bearer |
| GET | /api/v1/auth/me | Get current user profile | Bearer |
| POST | /api/v1/auth/sendVerificationEmail | Send account verification email | Bearer |
| POST | /api/v1/auth/verifyAccount | Verify account with code | Bearer |
| POST | /api/v1/auth/send-code-change-password | Send code to change password | Bearer |
| POST | /api/v1/auth/change-password | Change password with code | Bearer |
| POST | /api/v1/auth/exchange | Exchange OAuth code for tokens (mobile app) | public |

#### Profile

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/profile | Get user profile | Bearer |
| PUT | /api/v1/profile | Update user profile | Bearer |
| POST | /api/v1/profile/upload-avatar | Upload profile avatar | Bearer |
| POST | /api/v1/profile/upload-banner | Upload profile banner | Bearer |

#### Devices

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/devices | List logged-in devices | Bearer |
| DELETE | /api/v1/devices/:sessionId | Logout a specific device | Bearer |
| POST | /api/v1/devices/logout-all-others | Logout all other devices | Bearer |

#### Quiz Sets

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/quizsets | List quiz sets (paginated, filterable) | Bearer |
| GET | /api/v1/quizsets/stats | Get quiz set statistics | Bearer |
| GET | /api/v1/quizsets/list/all | List all quiz sets (no pagination) | Bearer |
| GET | /api/v1/quizsets/:id | Get quiz set by ID | Bearer |
| POST | /api/v1/quizsets | Create new quiz set | Bearer |
| PUT | /api/v1/quizsets/:id | Update quiz set | Bearer |
| DELETE | /api/v1/quizsets/:id | Delete quiz set | Bearer |
| GET | /api/v1/quizsets/:id/questions | Get paginated questions for quiz set | Bearer |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | Assign quizzes to quiz set | Bearer |
| POST | /api/v1/quizsets/save-history-to-quizset | Save AI-generated quizzes to quiz set | Bearer |
| POST | /api/v1/quizsets/:quizSetId/questions | Add question to quiz set | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | Update question | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | Delete question | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels | Get labels for quiz set | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels | Create label | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | Update label | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | Delete label | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Assign questions to label | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Remove questions from label | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Get questions by label | Bearer |

#### Flashcard Sets

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/flashcardsets | List flashcard sets (paginated) | Bearer |
| GET | /api/v1/flashcardsets/stats | Get flashcard set statistics | Bearer |
| GET | /api/v1/flashcardsets/users/search | Search users for whitelist | Bearer |
| GET | /api/v1/flashcardsets/:id | Get flashcard set by ID | Bearer |
| GET | /api/v1/flashcardsets/:id/flashcards | Get paginated flashcards | Bearer |
| GET | /api/v1/flashcardsets/:id/labels | Get labels for flashcard set | Bearer |
| POST | /api/v1/flashcardsets | Create new flashcard set | Bearer |
| PUT | /api/v1/flashcardsets/:id | Update flashcard set | Bearer |
| DELETE | /api/v1/flashcardsets/:id | Delete flashcard set | Bearer |
| POST | /api/v1/flashcardsets/:id/share | Generate share link and access code | Bearer |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | Assign flashcards to set | Bearer |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | Save AI-generated flashcards to set | Bearer |
| POST | /api/v1/flashcardsets/:id/labels | Create label for flashcard set | Bearer |
| PUT | /api/v1/flashcardsets/:id/labels/:labelId | Update label | Bearer |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId | Delete label | Bearer |
| POST | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Assign flashcards to label | Bearer |
| DELETE | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Remove flashcards from label | Bearer |
| GET | /api/v1/flashcardsets/:id/labels/:labelId/flashcards | Get flashcards by label | Bearer |
| POST | /api/v1/flashcardsets/:setId/flashcards | Add flashcard to set | Bearer |
| PUT | /api/v1/flashcardsets/:setId/flashcards/:cardId | Update flashcard | Bearer |
| DELETE | /api/v1/flashcardsets/:setId/flashcards/:cardId | Delete flashcard | Bearer |
| GET | /api/v1/flashcardsets/study/:id/access | Check access to flashcard set | Bearer |
| GET | /api/v1/flashcardsets/study/:id/info | Get public info for study | Bearer |
| GET | /api/v1/flashcardsets/study/:id | Get flashcard set for study | Bearer |
| POST | /api/v1/flashcardsets/study/:id/verify-code | Verify access code | Bearer |
| POST | /api/v1/flashcardsets/study/:id/with-code | Get set with access code | Bearer |
| GET | /api/v1/flashcardsets/:id/sharing | Get sharing settings | Bearer |
| PUT | /api/v1/flashcardsets/:id/sharing | Update sharing settings | Bearer |
| POST | /api/v1/flashcardsets/:id/generate-code | Generate new access code | Bearer |

#### Exam Rooms

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/examrooms/list | List exam rooms (paginated) | Bearer |
| GET | /api/v1/examrooms/list-all | List all exam rooms | Bearer |
| GET | /api/v1/examrooms/detail/:id | Get exam room by ID | Bearer |
| GET | /api/v1/examrooms/get-public/:id | Get public exam room | Bearer |
| POST | /api/v1/examrooms | Create exam room | Bearer |
| PUT | /api/v1/examrooms/:id | Update exam room | Bearer |
| DELETE | /api/v1/examrooms/:id | Delete exam room | Bearer |
| GET | /api/v1/examrooms/:examRoomId/sessions | Get exam sessions for room | Bearer |

#### Exam Sessions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/examsessions/list | List exam sessions (paginated) | Bearer |
| GET | /api/v1/examsessions/get-by-id/:id | Get exam session by ID | Bearer |
| GET | /api/v1/examsessions/get-public/:id | Get public exam session | Bearer |
| POST | /api/v1/examsessions | Create exam session | Bearer |
| PUT | /api/v1/examsessions/:id | Update exam session | Bearer |
| DELETE | /api/v1/examsessions/:id | Delete exam session | Bearer |
| GET | /api/v1/examsessions/users/search | Search users for whitelist | Bearer |
| GET | /api/v1/examsessions/study/:id/access | Check access to exam session | Bearer |
| GET | /api/v1/examsessions/study/:id/info | Get public info | Bearer |
| GET | /api/v1/examsessions/study/:id | Get exam session for study | Bearer |
| POST | /api/v1/examsessions/study/:id/with-code | Get session with access code | Bearer |
| POST | /api/v1/examsessions/study/:id/verify-code | Verify access code | Bearer |
| GET | /api/v1/examsessions/study/:id/stats | Get student-visible stats | Bearer |
| GET | /api/v1/examsessions/:id/sharing | Get sharing settings | Bearer |
| PUT | /api/v1/examsessions/:id/sharing | Update sharing settings | Bearer |
| POST | /api/v1/examsessions/:id/generate-code | Generate access code | Bearer |
| GET | /api/v1/examsessions/room/:roomId/available-labels | Get available labels for room | Bearer |

#### Exam Attempts

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/examattempts/start | Start or resume exam attempt | Bearer |
| GET | /api/v1/examattempts/list | List exam attempts (paginated) | Bearer |
| GET | /api/v1/examattempts/history-stats | Get aggregated history statistics | Bearer |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | List attempts by room (owner) | Bearer |
| GET | /api/v1/examattempts/list-by-session/:sessionId | List attempts by session (owner) | Bearer |
| GET | /api/v1/examattempts/:attemptId/quiz | Get attempt with questions | Bearer |
| GET | /api/v1/examattempts/:attemptId/detail | Get attempt detail (owner) | Bearer |
| PUT | /api/v1/examattempts/:attemptId/progress | Update progress (auto-save) | Bearer |
| POST | /api/v1/examattempts/:attemptId/submit | Submit exam (legacy) | Bearer |
| GET | /api/v1/examattempts/:attemptId/secure-quiz | Get encrypted quiz with JWT tokens | Bearer |
| POST | /api/v1/examattempts/:attemptId/secure-submit | Submit with JWT verification | Bearer |

#### Subjects

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/subjects/categories | Get subject categories with subjects | Bearer |
| GET | /api/v1/subjects | List all subjects | Bearer |
| GET | /api/v1/subjects/:id | Get subject by ID | Bearer |
| GET | /api/v1/subjects/slug/:slug | Get subject by slug | Bearer |

#### Wallet

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/wallet/details | Get wallet with transaction history | Bearer |

#### Payment

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/payment/create | Create payment (credits/subscription) | Bearer |
| GET | /api/v1/payment/status/:paymentId | Check payment status | Bearer |
| GET | /api/v1/payment/subscription | Get current subscription | Bearer |
| GET | /api/v1/payment/subscription/plans | List subscription plans | Bearer |
| DELETE | /api/v1/payment/cancel/:paymentId | Cancel pending payment | Bearer |

#### Student

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/student/recent-flashcards | Get recent viewed flashcard sets | Bearer |
| GET | /api/v1/student/recent-exams | Get recent exam attempts | Bearer |
| POST | /api/v1/student/pin-flashcard/:id | Toggle pin/unpin flashcard set | Bearer |

#### AI Study

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/ai/quick-upload | Quick upload file for AI Teacher | Bearer |
| POST | /api/v1/ai/generate-from-file | Upload file and generate quiz/flashcard | Bearer |
| GET | /api/v1/ai/recent-uploads | List recently uploaded files | Bearer |
| GET | /api/v1/ai/models | Get AI model catalog | Bearer |
| GET | /api/v1/ai/upload/:uploadId | Get upload detail | Bearer |
| DELETE | /api/v1/ai/upload/:uploadId | Delete upload | Bearer |
| GET | /api/v1/ai/upload/:uploadId/history | Get quiz/flashcard history for upload | Bearer |
| POST | /api/v1/ai/regenerate/:uploadId | Regenerate quiz/flashcard from file | Bearer |
| GET | /api/v1/ai/job/:jobId | Get job status | Bearer |
| DELETE | /api/v1/ai/job/:jobId | Cancel job | Bearer |
| POST | /api/v1/ai/upload-image | Upload image for AI chat | Bearer |
| POST | /api/v1/ai/tutor/ingest | Create tutor ingest job | Bearer |
| GET | /api/v1/ai/tutor/ingest | List tutor ingest jobs | Bearer |
| GET | /api/v1/ai/tutor/ingest/:jobId | Get tutor ingest job detail | Bearer |
| GET | /api/v1/ai/tutor/graph/job/:jobId | Get tutor graph by job | Bearer |
| GET | /api/v1/ai/tutor/graph/document/:documentId | Get tutor graph by document | Bearer |
| GET | /api/v1/ai/tutor/knowledge-stats | Get knowledge base stats | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders | List knowledge folders | Bearer |
| POST | /api/v1/ai/tutor/knowledge-folders | Create knowledge folder | Bearer |
| PUT | /api/v1/ai/tutor/knowledge-folders/:folderId | Update knowledge folder | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-folders/:folderId | Delete knowledge folder | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders/:folderId/contents | Get folder contents | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files | List knowledge files | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/search | Search/filter knowledge files | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files | Upload knowledge file | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId | Get knowledge file status | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-files/:fileId | Delete knowledge file | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/:fileId/reprocess | Reprocess knowledge file | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId/graph | Get graph for knowledge file | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-delete | Bulk delete knowledge files | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-reprocess | Bulk reprocess knowledge files | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/catalog | Get dataset import catalog | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports | Create dataset import job | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports | List dataset import jobs | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/states | Get dataset import states | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/:jobId | Get dataset import job status | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:jobId/cancel | Cancel dataset import job | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:datasetKey/clear | Clear imported dataset | Bearer |

#### AI Chat

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/ai-chat | List all chats | Bearer |
| POST | /api/v1/ai-chat | Create new chat | Bearer |
| GET | /api/v1/ai-chat/:chatId/messages | Get chat messages | Bearer |
| POST | /api/v1/ai-chat/:chatId/message | Send message | Bearer |
| POST | /api/v1/ai-chat/:chatId/stream | Send message with SSE streaming | Bearer |
| GET | /api/v1/ai-chat/:chatId/exists | Check chat exists | Bearer |
| DELETE | /api/v1/ai-chat/:chatId | Delete chat | Bearer |
| GET | /api/v1/ai-chat/:chatId/documents | Get chat documents | Bearer |
| POST | /api/v1/ai-chat/:chatId/documents | Add document to chat | Bearer |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | Remove document from chat | Bearer |
| DELETE | /api/v1/ai-chat/message/:messageId | Delete message | Bearer |
| PATCH | /api/v1/ai-chat/message/:messageId | Update message | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | Regenerate AI response | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | Regenerate with SSE streaming | Bearer |

#### Flashcard Study

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/flashcard-study/session | Get or create study session | Bearer |
| PUT | /api/v1/flashcard-study/session/:sessionId | Update study session | Bearer |
| POST | /api/v1/flashcard-study/session/:sessionId/complete | Complete study session | Bearer |
| POST | /api/v1/flashcard-study/session/:sessionId/review | Review flashcard | Bearer |
| GET | /api/v1/flashcard-study/cards/:flashCardSetId | Get cards for study | Bearer |
| GET | /api/v1/flashcard-study/history/:flashCardSetId | Get study history | Bearer |
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | Get study progress | Bearer |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | Save study progress | Bearer |

#### Quiz Practice

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/quiz-practice-attempts | Get or create practice attempt | Bearer |
| GET | /api/v1/quiz-practice-attempts/by-quizset/:quizSetId | Get practice attempt by quiz set | Bearer |
| GET | /api/v1/quiz-practice-attempts/stats/completion-rate | Get completion rate stats | Bearer |
| GET | /api/v1/quiz-practice-attempts/:attemptId | Get practice attempt by ID | Bearer |
| PUT | /api/v1/quiz-practice-attempts/:attemptId | Update practice attempt | Bearer |
| POST | /api/v1/quiz-practice-attempts/:attemptId/submit | Submit practice attempt | Bearer |
| POST | /api/v1/quiz-practice-attempts/:attemptId/reset | Reset practice attempt | Bearer |

#### Cheating Logs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/cheatinglogs | Log cheating violation | Bearer |
| GET | /api/v1/cheatinglogs/attempt/:attemptId | Get cheating logs for attempt (host) | Bearer |
| GET | /api/v1/cheatinglogs/session/:sessionId/stats | Get cheating stats for session (host) | Bearer |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | Get user attempts with logs (host) | Bearer |

#### R2 Storage

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/r2/image | Upload image to R2 storage (max 2MB) | Bearer |

#### Webhook

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/webhook/sepay | SePay payment webhook callback | ApiKey |

---

### Auth Service (`localhost:3001`, `/api/v1/...`)

Internal service routes — not directly exposed to clients (gateway proxies to these).

#### Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/auth/register | Register user | public |
| POST | /api/v1/auth/login | Login | public |
| POST | /api/v1/auth/logout | Logout | Bearer |
| POST | /api/v1/auth/refresh | Refresh token | public (cookie) |
| POST | /api/v1/auth/sendVerificationEmail | Send verification email | Bearer |
| POST | /api/v1/auth/verifyAccount | Verify account | Bearer |
| POST | /api/v1/auth/send-code-reset-password | Send reset code | public |
| POST | /api/v1/auth/reset-password | Reset password | public |
| POST | /api/v1/auth/send-code-change-password | Send change password code | Bearer |
| POST | /api/v1/auth/change-password | Change password | Bearer |
| GET | /api/v1/auth/google | Initiate Google OAuth | public |
| POST | /api/v1/auth/google/one-tap | Google One Tap | public |
| GET | /api/v1/auth/google/callback | Google OAuth callback | public |
| GET | /api/v1/auth/me | Get current user | Bearer |
| POST | /api/v1/auth/sync-refresh-token | Sync refresh token | Bearer |
| POST | /api/v1/auth/exchange | Exchange OAuth code for tokens | public |

#### Profile

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/profile | Get profile | Bearer |
| PUT | /api/v1/profile | Update profile | Bearer |
| POST | /api/v1/profile/upload-avatar | Upload avatar | Bearer |
| POST | /api/v1/profile/upload-banner | Upload banner | Bearer |

#### Devices

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/devices | List devices | Bearer |
| DELETE | /api/v1/devices/:sessionId | Logout device | Bearer |
| POST | /api/v1/devices/logout-all-others | Logout all other devices | Bearer |

---

### Exam Service (`localhost:3002`, `/api/v1/...`)

#### Quiz Sets

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/quizsets | List quiz sets | Bearer |
| GET | /api/v1/quizsets/stats | Quiz set statistics | Bearer |
| GET | /api/v1/quizsets/:id | Get quiz set by ID | Bearer |
| GET | /api/v1/quizsets/:id/questions | Get paginated questions | Bearer |
| GET | /api/v1/quizsets/list/all | List all (no pagination) | Bearer |
| POST | /api/v1/quizsets | Create quiz set | Bearer |
| PUT | /api/v1/quizsets/:id | Update quiz set | Bearer |
| DELETE | /api/v1/quizsets/:id | Delete quiz set | Bearer |
| GET | /api/v1/quizsets/public/:id | Get public quiz set | public |
| POST | /api/v1/quizsets/set-quizzes-to-quizset | Assign quizzes to set | Bearer |
| POST | /api/v1/quizsets/save-history-to-quizset | Save AI-generated quizzes | Bearer |
| POST | /api/v1/quizsets/:quizSetId/questions | Add question | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/questions/:questionId | Update question | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/questions/:questionId | Delete question | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels | Get labels | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels | Create label | Bearer |
| PUT | /api/v1/quizsets/:quizSetId/labels/:labelId | Update label | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId | Delete label | Bearer |
| POST | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Assign questions to label | Bearer |
| DELETE | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Remove questions from label | Bearer |
| GET | /api/v1/quizsets/:quizSetId/labels/:labelId/questions | Get questions by label | Bearer |

#### Flashcard Sets

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/flashcardsets | List flashcard sets | Bearer |
| GET | /api/v1/flashcardsets/stats | Flashcard set statistics | Bearer |
| GET | /api/v1/flashcardsets/users/search | Search users for whitelist | Bearer |
| GET | /api/v1/flashcardsets/:id | Get flashcard set by ID | Bearer |
| GET | /api/v1/flashcardsets/:id/flashcards | Get paginated flashcards | Bearer |
| GET | /api/v1/flashcardsets/:id/labels | Get labels | Bearer |
| POST | /api/v1/flashcardsets | Create flashcard set | Bearer |
| PUT | /api/v1/flashcardsets/:id | Update flashcard set | Bearer |
| DELETE | /api/v1/flashcardsets/:id | Delete flashcard set | Bearer |
| GET | /api/v1/flashcardsets/public/:id | Get public flashcard set | optional |
| POST | /api/v1/flashcardsets/:id/share | Generate share link | Bearer |
| POST | /api/v1/flashcardsets/set-flashcards-to-flashcardset | Assign flashcards | Bearer |
| POST | /api/v1/flashcardsets/save-history-to-flashcardset | Save AI-generated flashcards | Bearer |
| POST | /api/v1/flashcardsets/:flashcardSetId/labels | Create label | Bearer |
| PUT | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId | Update label | Bearer |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId | Delete label | Bearer |
| POST | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Assign flashcards | Bearer |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Remove flashcards | Bearer |
| GET | /api/v1/flashcardsets/:flashcardSetId/labels/:labelId/flashcards | Get flashcards by label | Bearer |
| POST | /api/v1/flashcardsets/:flashcardSetId/flashcards | Add flashcard | Bearer |
| PUT | /api/v1/flashcardsets/:flashcardSetId/flashcards/:flashcardId | Update flashcard | Bearer |
| DELETE | /api/v1/flashcardsets/:flashcardSetId/flashcards/:flashcardId | Delete flashcard | Bearer |
| GET | /api/v1/flashcardsets/study/:id/access | Check access | optional |
| GET | /api/v1/flashcardsets/study/:id/info | Get public info | public |
| GET | /api/v1/flashcardsets/study/:id | Get set for study | optional |
| POST | /api/v1/flashcardsets/study/:id/verify-code | Verify access code | public |
| POST | /api/v1/flashcardsets/study/:id/with-code | Get set with access code | optional |
| GET | /api/v1/flashcardsets/:id/sharing | Get sharing settings | Bearer |
| PUT | /api/v1/flashcardsets/:id/sharing | Update sharing settings | Bearer |
| POST | /api/v1/flashcardsets/:id/generate-code | Generate access code | Bearer |

#### Exam Rooms

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/examrooms | Create exam room | Bearer |
| GET | /api/v1/examrooms/detail/:id | Get exam room by ID | Bearer |
| PUT | /api/v1/examrooms/:id | Update exam room | Bearer |
| GET | /api/v1/examrooms/list | List exam rooms | Bearer |
| GET | /api/v1/examrooms/list-all | List all exam rooms | Bearer |
| DELETE | /api/v1/examrooms/:id | Delete exam room | Bearer |
| GET | /api/v1/examrooms/get-public/:id | Get public exam room | public |
| GET | /api/v1/examrooms/:id/sessions | Get exam sessions for room | Bearer |

#### Exam Sessions

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/examsessions | Create exam session | Bearer |
| GET | /api/v1/examsessions/get-by-id/:id | Get exam session by ID | Bearer |
| PUT | /api/v1/examsessions/:id | Update exam session | Bearer |
| GET | /api/v1/examsessions/list | List exam sessions | Bearer |
| DELETE | /api/v1/examsessions/:id | Delete exam session | Bearer |
| GET | /api/v1/examsessions/get-public/:id | Get public exam session | public |
| GET | /api/v1/examsessions/study/:id/access | Check access | optional |
| GET | /api/v1/examsessions/study/:id/info | Get public info | public |
| GET | /api/v1/examsessions/study/:id | Get session for study | optional |
| POST | /api/v1/examsessions/study/:id/verify-code | Verify access code | public |
| POST | /api/v1/examsessions/study/:id/with-code | Get session with code | public |
| GET | /api/v1/examsessions/study/:id/stats | Get student stats | Bearer |
| GET | /api/v1/examsessions/:id/sharing | Get sharing settings | Bearer |
| PUT | /api/v1/examsessions/:id/sharing | Update sharing settings | Bearer |
| POST | /api/v1/examsessions/:id/generate-code | Generate access code | Bearer |
| GET | /api/v1/examsessions/users/search | Search users for whitelist | Bearer |
| GET | /api/v1/examsessions/room/:roomId/available-labels | Get available labels | Bearer |

#### Exam Attempts

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/examattempts/history-stats | Aggregated history statistics | Bearer |
| POST | /api/v1/examattempts/start | Start or resume exam attempt | Bearer |
| PUT | /api/v1/examattempts/:id/progress | Update progress (auto-save) | Bearer |
| POST | /api/v1/examattempts/:id/submit | Submit exam (legacy) | Bearer |
| GET | /api/v1/examattempts/:id/quiz | Get attempt with questions | Bearer |
| GET | /api/v1/examattempts/:id/secure-quiz | Get encrypted quiz with JWT | Bearer |
| POST | /api/v1/examattempts/:id/secure-submit | Submit with JWT verification | Bearer |
| GET | /api/v1/examattempts/list-by-room/:examRoomId | List attempts by room (owner) | Bearer |
| GET | /api/v1/examattempts/list-by-session/:sessionId | List attempts by session (owner) | Bearer |
| GET | /api/v1/examattempts/:id/detail | Get attempt detail (owner) | Bearer |
| POST | /api/v1/examattempts | Create exam attempt | Bearer |
| GET | /api/v1/examattempts/get-by-id/:id | Get attempt by ID | Bearer |
| PUT | /api/v1/examattempts/:id | Update attempt | Bearer |
| GET | /api/v1/examattempts/list | List attempts | Bearer |
| DELETE | /api/v1/examattempts/:id | Delete attempt | Bearer |

#### Subjects

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/subjects/categories | Get subject categories | public |
| GET | /api/v1/subjects | List all subjects | public |
| GET | /api/v1/subjects/:id | Get subject by ID | public |
| GET | /api/v1/subjects/slug/:slug | Get subject by slug | public |

#### AI

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/ai/quick-upload | Quick upload for AI Teacher | Bearer |
| POST | /api/v1/ai/generate-from-file | Upload and generate quiz/flashcard | Bearer |
| GET | /api/v1/ai/recent-uploads | List recent uploads | Bearer |
| GET | /api/v1/ai/models | Get AI model catalog | Bearer |
| POST | /api/v1/ai/upload | Create upload + trigger OCR | Bearer |
| GET | /api/v1/ai/upload/:uploadId | Get upload detail | Bearer |
| DELETE | /api/v1/ai/upload/:uploadId | Delete upload | Bearer |
| GET | /api/v1/ai/upload/:uploadId/history | Get quiz/flashcard history | Bearer |
| POST | /api/v1/ai/regenerate/:uploadId | Regenerate quiz/flashcard | Bearer |
| GET | /api/v1/ai/job/:jobId | Get job status | Bearer |
| DELETE | /api/v1/ai/job/:jobId | Cancel job | Bearer |
| POST | /api/v1/ai/upload-image | Upload image for AI chat | Bearer |
| POST | /api/v1/ai/tutor/ingest | Create tutor ingest job | Bearer |
| GET | /api/v1/ai/tutor/ingest | List tutor ingest jobs | Bearer |
| GET | /api/v1/ai/tutor/ingest/:jobId | Get tutor ingest job | Bearer |
| GET | /api/v1/ai/tutor/graph/job/:jobId | Get tutor graph by job | Bearer |
| GET | /api/v1/ai/tutor/graph/document/:documentId | Get tutor graph by document | Bearer |
| GET | /api/v1/ai/tutor/knowledge-stats | Get knowledge stats | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders | List knowledge folders | Bearer |
| POST | /api/v1/ai/tutor/knowledge-folders | Create knowledge folder | Bearer |
| PUT | /api/v1/ai/tutor/knowledge-folders/:folderId | Update knowledge folder | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-folders/:folderId | Delete knowledge folder | Bearer |
| GET | /api/v1/ai/tutor/knowledge-folders/:folderId/contents | Get folder contents | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files | List knowledge files | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/search | Search knowledge files | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files | Upload knowledge file | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId | Get knowledge file status | Bearer |
| DELETE | /api/v1/ai/tutor/knowledge-files/:fileId | Delete knowledge file | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/:fileId/reprocess | Reprocess knowledge file | Bearer |
| GET | /api/v1/ai/tutor/knowledge-files/:fileId/graph | Get graph for knowledge file | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-delete | Bulk delete knowledge files | Bearer |
| POST | /api/v1/ai/tutor/knowledge-files/bulk-reprocess | Bulk reprocess knowledge files | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/catalog | Get dataset catalog | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports | Create dataset import job | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports | List dataset import jobs | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/states | Get dataset import states | Bearer |
| GET | /api/v1/ai/tutor/dataset-imports/:jobId | Get dataset import job status | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:jobId/cancel | Cancel dataset import job | Bearer |
| POST | /api/v1/ai/tutor/dataset-imports/:datasetKey/clear | Clear imported dataset | Bearer |

#### AI Chat

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/ai-chat | List chats | Bearer |
| POST | /api/v1/ai-chat | Create chat | Bearer |
| PATCH | /api/v1/ai-chat/:chatId | Update chat title | Bearer |
| DELETE | /api/v1/ai-chat/:chatId | Delete chat | Bearer |
| POST | /api/v1/ai-chat/:chatId/clear | Clear chat content | Bearer |
| GET | /api/v1/ai-chat/:chatId/exists | Check chat exists | Bearer |
| GET | /api/v1/ai-chat/:chatId/messages | Get messages | Bearer |
| POST | /api/v1/ai-chat/:chatId/message | Send message | Bearer |
| POST | /api/v1/ai-chat/:chatId/stream | Send message with SSE streaming | Bearer |
| PATCH | /api/v1/ai-chat/message/:messageId | Update message | Bearer |
| DELETE | /api/v1/ai-chat/message/:messageId | Delete message | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate | Regenerate AI response | Bearer |
| POST | /api/v1/ai-chat/message/:messageId/regenerate-stream | Regenerate with SSE | Bearer |
| GET | /api/v1/ai-chat/:chatId/documents | Get chat documents | Bearer |
| POST | /api/v1/ai-chat/:chatId/documents | Add document to chat | Bearer |
| DELETE | /api/v1/ai-chat/:chatId/documents/:documentId | Remove document | Bearer |

#### Flashcard Study

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/flashcard-study/progress/:flashCardSetId | Get study progress | Bearer |
| POST | /api/v1/flashcard-study/progress/:flashCardSetId | Save study progress | Bearer |

#### Student

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/student/recent-flashcards | Get recent flashcard sets | Bearer |
| GET | /api/v1/student/recent-exams | Get recent exam attempts | Bearer |
| POST | /api/v1/student/pin-flashcard/:id | Toggle pin flashcard set | Bearer |
| POST | /api/v1/student/pin-exam-room/:id | Toggle pin exam room | Bearer |

#### R2

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/r2/image | Upload image to R2 storage | Bearer |

#### Cheating Logs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/cheatinglogs | Log cheating violation | Bearer |
| GET | /api/v1/cheatinglogs/attempt/:id | Get logs for attempt (host) | Bearer |
| GET | /api/v1/cheatinglogs/session/:id/stats | Get session stats (host) | Bearer |
| GET | /api/v1/cheatinglogs/session/:sessionId/user/:userId | Get user attempts with logs (host) | Bearer |

---

### Finance Service (`localhost:3003`, `/api/v1/...`)

#### Wallet

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/wallet/info | Get wallet info | Bearer |
| GET | /api/v1/wallet/details | Get wallet with transaction history | Bearer |

#### Payment

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/payment/create | Create payment and get QR code | Bearer |
| GET | /api/v1/payment/status/:paymentId | Check payment status | Bearer |
| GET | /api/v1/payment/history | Get payment history | Bearer |
| DELETE | /api/v1/payment/cancel/:paymentId | Cancel pending payment | Bearer |
| GET | /api/v1/payment/subscription | Get current subscription | Bearer |
| GET | /api/v1/payment/subscription/plans | Get subscription plans | Bearer |

#### Webhook

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/webhook | SePay payment webhook (apikey auth) | ApiKey |

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

#### Protected Routes (auth required)

| Path | Component | Layout | Guard |
|------|-----------|--------|-------|
| /k | KRootRedirect | KLayout | ProtectedRoute |
| /k/profile | ProfilePage | KLayout | ProtectedRoute |
| /k/verify | VerifyPage | KLayout | ProtectedRoute |
| /k/subscription | SubscriptionPage | KLayout | ProtectedRoute |
| /k/my-materials | MyMaterialsPage | KLayout | ProtectedRoute |
| /k/flash-card | FlashcardsPage | KLayout | ProtectedRoute |
| /k/history | HistoryPage | KLayout | ProtectedRoute |
| /k/history/exam | ExamHistoryPage | KLayout | ProtectedRoute |
| /k/history/pdf | PDFHistoryPage | KLayout | ProtectedRoute |
| /k/manage-exam | ManageExamPage | KLayout | ProtectedRoute |
| /k/manage-quiz-set/:id | ManageQuizSetDetailPage | KLayout | ProtectedRoute |
| /k/manage-flashcard-set/:id | ManageFlashcardSetDetailPage | KLayout | ProtectedRoute |
| /k/ai-tool | AIToolPage | KLayout | ProtectedRoute |
| /k/genai-knowledge | GenAIKnowledgePage | KLayout | ProtectedRoute |
| /k/manage-exam-room | ManageExamRoomPage | KLayout | ProtectedRoute |
| /k/manage-exam-room/:id | ManageExamRoomDetailPage | KLayout | ProtectedRoute |
| /k/manage-exam-room/:id/session/:sessionId | ExamRoomSessionAnalyticsPage | KLayout | ProtectedRoute |
| /k/my-exams | MyExamsPage | KLayout | ProtectedRoute |

#### Exam Session Routes (special layout)

| Path | Component | Layout |
|------|-----------|--------|
| /study-flashcard/:id | FlashcardStudyPage | none |
| /exam-session/:id | ExamSessionPage | ExamSessionLayout |
| /exam-session/:id/quiz | ExamQuizPage | none |

#### Catch-all

| Path | Component |
|------|-----------|
| * | NotFoundPage |

---

## Summary

| Category | Count |
|----------|-------|
| Gateway proxied routes (public) | 15 |
| Gateway proxied routes (authenticated) | ~140 |
| Auth service routes | 17 |
| Exam service routes | ~130 |
| Finance service routes | 10 |
| Frontend pages | 26 |
| **Total backend routes** | **~310** |
| **Total frontend routes** | **26** |

## Notes

1. **Duplicate finance routes**: Gateway has two proxy controllers exposing wallet/payment routes — `wallet-profile-proxy.controller.ts` (prefix `/api/v1/wallet`, `/api/v1/payment`, `/api/v1/profile`) and `finance-proxy.controller.ts` (prefix `/api/v1/finance/wallet`, `/api/v1/finance/payment`). Both proxy to the same finance-service. The `wallet-profile-proxy` version is the primary; `finance-proxy` is a secondary path (not wired from frontend). The authoritative finance paths use the `/wallet`, `/payment` prefix directly.

2. **Public vs optional vs authenticated**: Most routes use `AuthGuard` (authenticated). Public routes include: auth endpoints (login, register, reset, OAuth), subject list, public exam room/session/flashcard set access. Optional auth (`OptionalAuthGuard`) is used for study access checks that work with or without login.

3. **Quiz encryption**: Exam attempts have two submission paths — legacy `submit` (plain answers) and secure `secure-submit` (answers wrapped in JWT tokens from encrypted quiz). The `secure-quiz` endpoint returns AES-256-CBC encrypted questions with server-signed JWT tokens.

4. **Gateway is the only public entry**: All clients go through `gateway-service` on port 3000. Direct access to auth/exam/finance services is not exposed publicly.

5. **AI service** (Python FastAPI) runs as a separate process; not part of the NestJS scan. It is called by `exam-service` via HTTP and exposes its own endpoints under `/api/v1/...` forwarded by the AI controller.

## Unresolved

- `ocr-service` gRPC port collision with `finance-service` (both default to 50053) — not resolved in routes.
- `PendingJobDialog` rendered unconditionally in `KLayout` — unclear if intentional.
- `ProfilePage` uses both `getProfileApi` and `useAuthStore.user` — possible state drift.
- `SubscriptionPage` vs `SubscriptionTemplate` — two subscription UIs, unclear canonical.