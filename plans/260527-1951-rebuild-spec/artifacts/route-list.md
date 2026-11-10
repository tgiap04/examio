# Route List

Generated: 2026-05-27

## Notes

- Routes are listed from the scout report only; exact controller method signatures and request/response DTOs need code-level verification.
- Gateway public API uses `/api/v1` for proxied domain routes.
- Stable route codes use `ROUTE###`.

Sources: `plans/260527-1951-rebuild-spec/artifacts/scout-report.md` lines 624-761, 828-887, 891-924, 1209-1288.

## Backend Gateway Routes

| Code | Public Route | Target | Auth | Notes |
|---|---|---|---|---|
| ROUTE001 | `GET /health` | gateway | Public | Gateway health |
| ROUTE002 | `GET /status` | gateway | Public | Gateway status |
| ROUTE003 | `GET /api` | gateway | Public | Swagger UI |
| ROUTE004 | `/api/v1/auth/*` | auth-service | Mixed | Auth proxy |
| ROUTE005 | `/api/v1/quizsets/*` | exam-service | Mixed | Quiz set proxy |
| ROUTE006 | `/api/v1/flashcardsets/*` | exam-service | Auth | Flashcard set proxy |
| ROUTE007 | `/api/v1/examrooms/*` | exam-service | Auth | Exam room proxy |
| ROUTE008 | `/api/v1/examsessions/*` | exam-service | Mixed | Exam session proxy |
| ROUTE009 | `/api/v1/examattempts/*` | exam-service | Auth | Exam attempt proxy |
| ROUTE010 | `/api/v1/subjects/*` | exam-service | Public/Mixed | Subject proxy |
| ROUTE011 | `/api/v1/ai/*` | exam-service / AI integration | Auth | AI upload/generation/tutor proxy |
| ROUTE012 | `/api/v1/student/*` | exam-service | Auth | Student materials proxy |
| ROUTE013 | `/api/v1/r2/*` | exam-service | Auth | R2 upload proxy |
| ROUTE014 | `/api/v1/wallet/*` | finance-service | Auth | Wallet proxy |
| ROUTE015 | `/api/v1/payment/*` | finance-service | Auth | Payment proxy |
| ROUTE016 | `/api/v1/webhook/*` | finance-service | API key/external | SePay webhook proxy |

Source: `scout-report.md` lines 628-647.

## Backend Domain Routes

### Auth Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE017 | POST | `/auth/register` | Public | Register and set cookies |
| ROUTE018 | POST | `/auth/login` | Public | Login and set cookies |
| ROUTE019 | POST | `/auth/logout` | Auth | Clears cookies, deactivates session |
| ROUTE020 | POST | `/auth/refresh` | Public | Refresh access token |
| ROUTE021 | GET | `/auth/me` | Auth | Current user |
| ROUTE022 | POST | `/auth/sendVerificationEmail` | Auth | Send verification code |
| ROUTE023 | POST | `/auth/verifyAccount` | Auth | Verify account |
| ROUTE024 | POST | `/auth/send-code-reset-password` | Public | Send reset code |
| ROUTE025 | POST | `/auth/reset-password` | Public | Reset password |
| ROUTE026 | POST | `/auth/send-code-change-password` | Auth | Send change-password code |
| ROUTE027 | POST | `/auth/change-password` | Auth | Change password |
| ROUTE028 | GET | `/auth/google` | Public | Google OAuth start |
| ROUTE029 | POST | `/auth/google/one-tap` | Public | Google One Tap |
| ROUTE030 | GET | `/auth/google/callback` | Public | OAuth callback |
| ROUTE031 | POST | `/auth/sync-refresh-token` | Auth | Sync refresh token from session |
| ROUTE032 | GET | `/profile/*` | Auth | Profile routes, exact subroutes need verification |

Source: `scout-report.md` lines 649-669.

### Exam Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE033 | POST/GET | `/quizsets` | Auth / some public | Quiz set create/list |
| ROUTE034 | GET/PUT/DELETE | `/quizsets/:id` | Auth / some public | Quiz set detail/update/delete |
| ROUTE035 | GET/POST | `/quizsets/:id/questions` | Auth | Quiz questions |
| ROUTE036 | POST | `/quizsets/:id/questions/:qId/label` | Auth | Assign label |
| ROUTE037 | GET/POST | `/flashcardsets` | Auth | Flashcard set list/create |
| ROUTE038 | GET/PUT/DELETE | `/flashcardsets/:id` | Auth | Flashcard set detail/update/delete |
| ROUTE039 | POST | `/flashcardsets/:id/flashcards` | Auth | Add flashcards |
| ROUTE040 | POST/GET | `/examrooms` | Auth | Exam room create/list |
| ROUTE041 | POST | `/examsessions` | Auth | Create exam session |
| ROUTE042 | GET | `/examsessions` | Auth | List exam sessions |
| ROUTE043 | PUT | `/examsessions/:id` | Auth | Update exam session |
| ROUTE044 | POST | `/examsessions/:id/start` | Auth | Start session |
| ROUTE045 | POST | `/examsessions/:id/verify-code` | Public/code | Access-code validation |
| ROUTE046 | POST | `/examsessions/:id/sharing` | Auth | Sharing settings |
| ROUTE047 | POST | `/examsessions/:id/join` | Public/code | Join by code/link |
| ROUTE048 | POST/PUT | `/examattempts` | Auth | Attempt start/update |
| ROUTE049 | POST | `/cheatinglog` | Auth | Cheating violation logging |
| ROUTE050 | POST | `/flashcard-study/progress` | Auth | Study progress |
| ROUTE051 | POST | `/flashcard-study/submit-answer` | Auth | Study answer submission |
| ROUTE052 | GET | `/subjects` | Public | Subject list |
| ROUTE053 | POST | `/r2/*` | Auth | File/image upload via R2 |

Source: `scout-report.md` lines 670-725.

### Exam Service AI/Tutor Routes

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE054 | POST | `/ai/quick-upload` | Auth | Quick file upload |
| ROUTE055 | POST | `/ai/generate-from-file` | Auth | Generate quiz/flashcards from upload |
| ROUTE056 | POST | `/ai/upload` | Auth | File upload |
| ROUTE057 | POST | `/ai/upload-image` | Auth | Image upload |
| ROUTE058 | GET | `/ai/recent-uploads` | Auth | Recent uploads |
| ROUTE059 | GET | `/ai/models` | Auth | AI model catalog |
| ROUTE060 | GET | `/ai/upload/:uploadId` | Auth | Upload detail |
| ROUTE061 | DELETE | `/ai/upload/:uploadId` | Auth | Delete upload |
| ROUTE062 | POST | `/ai/regenerate/:uploadId` | Auth | Regenerate output |
| ROUTE063 | GET | `/ai/job/:jobId` | Auth | Job status |
| ROUTE064 | DELETE | `/ai/job/:jobId` | Auth | Cancel/delete job |
| ROUTE065 | GET | `/ai/upload/:uploadId/history` | Auth | Generated history |
| ROUTE066 | POST | `/ai/tutor/ingest` | Auth | Tutor ingest |
| ROUTE067 | GET | `/ai/tutor/ingest` | Auth | List ingest jobs |
| ROUTE068 | GET | `/ai/tutor/ingest/:jobId` | Auth | Ingest job detail |
| ROUTE069 | POST/GET | `/ai/tutor/knowledge-files` | Auth | Create/list knowledge files |
| ROUTE070 | GET | `/ai/tutor/knowledge-files/search` | Auth | Search knowledge files |
| ROUTE071 | GET | `/ai/tutor/knowledge-files/:fileId/graph` | Auth | Knowledge graph |
| ROUTE072 | POST | `/ai/tutor/knowledge-files/bulk-delete` | Auth | Bulk delete |
| ROUTE073 | POST | `/ai/tutor/knowledge-files/bulk-reprocess` | Auth | Bulk reprocess |
| ROUTE074 | POST/GET | `/ai/tutor/knowledge-folders` | Auth | Create/list folders |
| ROUTE075 | PUT/DELETE | `/ai/tutor/knowledge-folders/:folderId` | Auth | Update/delete folder |
| ROUTE076 | GET | `/ai/tutor/knowledge-stats` | Auth | Knowledge stats |
| ROUTE077 | POST/GET | `/ai/tutor/dataset-imports` | Auth | Dataset import management |
| ROUTE078 | GET | `/ai/tutor/dataset-imports/catalog` | Auth | Dataset catalog |
| ROUTE079 | GET | `/ai/tutor/dataset-imports/:jobId` | Auth | Import status |
| ROUTE080 | POST | `/ai/tutor/dataset-imports/:jobId/cancel` | Auth | Cancel import |
| ROUTE081 | POST | `/ai/tutor/dataset-imports/:datasetKey/clear` | Auth | Clear imported dataset |

Source: `scout-report.md` lines 689-719.

### Finance Service

| Code | Method | Route | Auth | Notes |
|---|---|---|---|---|
| ROUTE082 | GET | `/wallet/info` | Auth | Wallet summary |
| ROUTE083 | GET | `/wallet/details` | Auth | Wallet + transactions |
| ROUTE084 | POST | `/payment/create` | Auth | Create payment / QR |
| ROUTE085 | GET | `/payment/status/:paymentId` | Auth | Payment status |
| ROUTE086 | GET | `/payment/history` | Auth | Payment history |
| ROUTE087 | DELETE | `/payment/cancel/:paymentId` | Auth | Cancel pending payment |
| ROUTE088 | POST | `/webhook/sepay` | API key | SePay webhook |

Source: `scout-report.md` lines 727-738.

### Python AI Service

| Code | Method | Route | Notes |
|---|---|---|---|
| ROUTE089 | GET | `/` | Health check |
| ROUTE090 | GET | `/health` | Health check |
| ROUTE091 | POST | `/api/chat/query` | Stateless AI query |
| ROUTE092 | POST | `/api/chat/stream` | SSE streaming query |
| ROUTE093 | GET | `/api/chat/health` | Chat health |
| ROUTE094 | POST | `/api/ai/process-file` | OCR + embeddings |
| ROUTE095 | POST | `/api/ai/query-file` | Query file content |
| ROUTE096 | POST | `/api/ai/multi-query` | Multi-query file |
| ROUTE097 | GET | `/api/ai/file-status/{id}` | File status |
| ROUTE098 | GET | `/api/ai/models` | Model catalog |
| ROUTE099 | GET | `/api/ai/graph-stats/{id}` | GraphRAG stats |
| ROUTE100 | POST | `/api/ai/extract-entities/{id}` | Extract entities |
| ROUTE101 | GET | `/api/ai/entities/{id}` | Entity list |
| ROUTE102 | DELETE | `/api/ai/clear-cache/{id}` | Clear retriever cache |
| ROUTE103 | POST | `/api/generate/quiz` | Generate quiz |
| ROUTE104 | POST | `/api/generate/flashcards` | Generate flashcards |
| ROUTE105 | GET | `/api/generate/quiz/{history_id}` | Generated quiz history |
| ROUTE106 | GET | `/api/generate/flashcards/{history_id}` | Generated flashcard history |
| ROUTE107 | Various | `/api/tutor/*` | Tutor knowledge endpoints; exact list in AI service section |

Sources: `scout-report.md` lines 255-314, 739-761.

## Web Frontend Routes

| Code | Path | Page | Guard/Layout |
|---|---|---|---|
| ROUTE108 | `/` | `HomePage` | PublicLayout |
| ROUTE109 | `/about` | `AboutPage` | PublicLayout |
| ROUTE110 | `/contact` | `ContactPage` | PublicLayout |
| ROUTE111 | `/terms` | `TermsPage` | PublicLayout |
| ROUTE112 | `/privacy` | `PrivacyPage` | PublicLayout |
| ROUTE113 | `/cookies` | `CookiesPage` | PublicLayout |
| ROUTE114 | `/security` | `SecurityPage` | PublicLayout |
| ROUTE115 | `/login` | `LoginPage` | PublicRoute/AuthLayout |
| ROUTE116 | `/register` | `RegisterPage` | PublicRoute/AuthLayout |
| ROUTE117 | `/forgot-password` | `ForgotPasswordPage` | PublicRoute/AuthLayout |
| ROUTE118 | `/reset-password` | `ResetPasswordPage` | PublicRoute/AuthLayout |
| ROUTE119 | `/k` | `KRootRedirect` | ProtectedRoute/KLayout |
| ROUTE120 | `/k/profile` | `ProfilePage` | ProtectedRoute/KLayout |
| ROUTE121 | `/k/verify` | `VerifyPage` | ProtectedRoute/KLayout |
| ROUTE122 | `/k/subscription` | `SubscriptionPage` | ProtectedRoute/KLayout |
| ROUTE123 | `/k/my-materials` | `MyMaterialsPage` | ProtectedRoute/KLayout |
| ROUTE124 | `/k/flash-card` | `FlashcardsPage` | ProtectedRoute/KLayout |
| ROUTE125 | `/k/history` | `HistoryPage` | ProtectedRoute/KLayout |
| ROUTE126 | `/k/history/exam` | `ExamHistoryPage` | ProtectedRoute/KLayout |
| ROUTE127 | `/k/history/pdf` | `PDFHistoryPage` | ProtectedRoute/KLayout |
| ROUTE128 | `/k/manage-exam` | `ManageExamPage` | ProtectedRoute/KLayout |
| ROUTE129 | `/k/manage-quiz-set/:id` | `ManageQuizSetDetailPage` | ProtectedRoute/KLayout |
| ROUTE130 | `/k/manage-flashcard-set/:id` | `ManageFlashcardSetDetailPage` | ProtectedRoute/KLayout |
| ROUTE131 | `/k/ai-tool` | `AIToolPage` | ProtectedRoute/KLayout |
| ROUTE132 | `/k/genai-knowledge` | `GenAIKnowledgePage` | ProtectedRoute/KLayout |
| ROUTE133 | `/k/manage-exam-room` | `ManageExamRoomPage` | ProtectedRoute/KLayout |
| ROUTE134 | `/k/manage-exam-room/:id` | `ManageExamRoomDetailPage` | ProtectedRoute/KLayout |
| ROUTE135 | `/k/manage-exam-room/:id/session/:sessionId` | `ExamRoomSessionAnalyticsPage` | ProtectedRoute/KLayout |
| ROUTE136 | `/k/my-exams` | `MyExamsPage` | ProtectedRoute/KLayout |
| ROUTE137 | `/study-flashcard/:id` | `FlashcardStudyPage` | No route guard |
| ROUTE138 | `/exam-session/:id` | `ExamSessionPage` | No route guard |
| ROUTE139 | `/exam-session/:id/quiz` | `ExamQuizPage` | No route guard |

Source: `scout-report.md` lines 852-887.

## Web API Client Coverage

| Code | API Client | Backend Base | Purpose |
|---|---|---|---|
| ROUTE140 | `authApi.ts` | `/auth/*` | Auth lifecycle |
| ROUTE141 | `subjectApi.ts` | `/subjects/*` | Subjects/categories |
| ROUTE142 | `examApi.ts` | `/ai/generate-from-file` | AI exam generation |
| ROUTE143 | `examRoomApi.ts` | `/examrooms/*` | Exam rooms |
| ROUTE144 | `examSessionApi.ts` | `/examsessions/*` | Sessions/access/sharing/stats |
| ROUTE145 | `examAttemptApi.ts` | `/examattempts/*` | Attempts/progress/secure quiz |
| ROUTE146 | `flashcardSetApi.ts` | `/flashcardsets/*` | Flashcard sets/cards/labels |
| ROUTE147 | `flashcardStudyApi.ts` | `/flashcard-study/*` | Study progress/review |
| ROUTE148 | `quizsetApi.ts` | `/quizsets/*` | Quiz sets/questions/labels |
| ROUTE149 | `aiApi.ts` | `/ai/*` | Uploads/jobs/models/regenerate |
| ROUTE150 | `aiChatApi.ts` | `/ai-chat/*` | Chat CRUD/messages/SSE |
| ROUTE151 | `virtualTeacherApi.ts` | `/virtual-teacher/*` | Legacy teacher chat/upload; backend coverage needs verification |
| ROUTE152 | `genaiTutorKnowledgeApi.ts` | `/ai/tutor/knowledge-*` | Knowledge folders/files/stats/datasets |
| ROUTE153 | `historyApi.ts` | `/examattempts/history-stats`, `/ai/recent-uploads` | History |
| ROUTE154 | `studentMaterialsApi.ts` | `/student/*` | Recent materials/pin/share |
| ROUTE155 | `profileApi.ts` | `/profile/*` | Profile/avatar/banner |
| ROUTE156 | `subscriptionApi.ts` | `/wallet/*`, `/payment/*` | Wallet/payment/subscription |
| ROUTE157 | `mediaApi.ts` | `/r2/image` | Generic image upload |
| ROUTE158 | `devicesApi.ts` | `/devices/*` | Device/session management; gateway route needs verification |
| ROUTE159 | `cheatingLogApi.ts` | `/cheatinglogs/*` | Cheating logs; singular/plural backend route needs verification |

Source: `scout-report.md` lines 891-924.

## Mobile Route/API Coverage

Mobile has simple local navigation rather than route URLs. Shared KMP endpoint constants and API services cover:

| Code | Mobile Area | Backend Base | Status |
|---|---|---|---|
| ROUTE160 | Auth | `/auth/login`, `/auth/me`, reset/refresh/logout | Real shared API; platform auth flows wired |
| ROUTE161 | Profile/account | `/profile`, `/wallet/details`, `/payment/subscription/plans` | Shared API ready; UI partly mock/local |
| ROUTE162 | AI chat/generator | `/ai/chats`, `/ai/chat`, `/ai/recent-uploads`, `/ai/generate-from-file`, `/subjects` | Shared API ready; platform UI mock; SSE stub |
| ROUTE163 | Study | `/flashcardsets`, `/student/materials/` | Shared API ready; platform UI mock |
| ROUTE164 | Exams | `/quizsets`, `/examrooms`, `/examattempts` | Shared API ready; platform UI mock |
| ROUTE165 | History | `/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list` | Shared API ready; platform UI mock |
| ROUTE166 | Deep links | `kmaedu://auth`, `kmaedu://...` parsed to exam/flashcard/chat/profile | Auth callback real; feature deep-link behavior needs verification |

Sources: `scout-report.md` lines 1209-1288, 1311-1323, 1408-1412, 1440-1459, 1464-1488.

## Needs Verification

- Exact backend route names for web `/ai-chat/*`, `/virtual-teacher/*`, `/devices/*`, and plural `/cheatinglogs/*` versus scout backend route list.
- Exact auth requirements for quiz/subject routes marked mixed or some public.
- Exact request/response DTOs for all routes.
- Mobile shared endpoint constants should be checked against gateway routes before implementation.
