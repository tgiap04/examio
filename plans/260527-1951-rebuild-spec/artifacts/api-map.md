# API Map

Source artifacts: `scout-report.md`, `_session-context.md`, `feature-list.md`.

## API001 - Authentication API
Public and authenticated account entry points handled by gateway -> auth-service.
- Gateway prefix: `/api/v1/auth/*`
- Auth-service routes: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/sync-refresh-token`, `GET /auth/google`, `POST /auth/google/one-tap`, `GET /auth/google/callback`
- Password routes: `POST /auth/send-code-reset-password`, `POST /auth/reset-password`, `POST /auth/send-code-change-password`, `POST /auth/change-password`
- Features: F001, F012
- Entities: MODEL001 User, MODEL002 UserSession, MODEL004 ResetPasswordCode
- Clients: web `authApi.ts`, Zustand `useAuthStore`, KMP `AuthApiService`, Android/iOS auth screens

## API002 - Verification, Profile & Devices API
Account verification, profile read/update, avatar/banner uploads, and device/session management.
- Gateway prefixes: `/api/v1/auth/*`, `/api/v1/profile/*`, `/api/v1/devices/*`, `/api/v1/r2/*`
- Known routes: `POST /auth/sendVerificationEmail`, `POST /auth/verifyAccount`, `GET /profile/*`, device list/logout endpoints from web `devicesApi.ts`
- Features: F002
- Entities: MODEL001 User, MODEL002 UserSession, MODEL003 VerifyAccountCode
- Clients: web `profileApi.ts`, `devicesApi.ts`, `mediaApi.ts`, KMP `ProfileApiService`
- Needs verification: exact device route list in backend scout is not enumerated.

## API003 - Quiz Set API
Quiz set CRUD, question management, labels, sharing/access, and history save flows.
- Gateway prefix: `/api/v1/quizsets/*`
- Known routes: `POST /quizsets`, `GET /quizsets`, `GET /quizsets/:id`, `PUT /quizsets/:id`, `DELETE /quizsets/:id`, `GET/POST /quizsets/:id/questions`, `POST /quizsets/:id/questions/:qId/label`
- Features: F004, F012
- Entities: MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion, MODEL013 DetailsQuizQuestion
- Clients: web `quizsetApi.ts`, Zustand `useQuizSetStore`, KMP `QuizSetApiService`

## API004 - Flashcard Set & Study API
Flashcard set CRUD, flashcard management, labels/sharing, and study session progress.
- Gateway prefixes: `/api/v1/flashcardsets/*`, `/api/v1/flashcard-study/*`
- Known routes: `GET/POST /flashcardsets`, `GET/PUT/DELETE /flashcardsets/:id`, `POST /flashcardsets/:id/flashcards`, `POST /flashcard-study/progress`, `POST /flashcard-study/submit-answer`
- Features: F005, F012
- Entities: MODEL014 FlashCardSet, MODEL015 FlashCard, MODEL016 DetailsFlashCard
- Clients: web `flashcardSetApi.ts`, `flashcardStudyApi.ts`, Zustand `useFlashcardSetStore`, KMP `FlashcardApiService`, `FlashcardRepository`

## API005 - Exam Rooms, Sessions & Attempts API
Teacher exam room/session management and student attempt lifecycle.
- Gateway prefixes: `/api/v1/examrooms/*`, `/api/v1/examsessions/*`, `/api/v1/examattempts/*`
- Room/session routes: `POST /examrooms`, `GET /examrooms`, `POST /examsessions`, `GET /examsessions`, `PUT /examsessions/:id`, `POST /examsessions/:id/start`, `POST /examsessions/:id/verify-code`, `POST /examsessions/:id/sharing`, `POST /examsessions/:id/join`
- Attempt routes: `POST/PUT /examattempts`, secure quiz/start/resume/submit routes from web/KMP clients; exact path list needs verification beyond scout summary.
- Features: F008, F009, F012
- Entities: MODEL016 ExamRoom, MODEL017 ExamSession, MODEL018 ExamAttempt
- Clients: web `examRoomApi.ts`, `examSessionApi.ts`, `examAttemptApi.ts`, stores for exam rooms/sessions, KMP `ExamRoomApiService`, `ExamAttemptApiService`

## API006 - AI Upload, Job & Generation Orchestration API
Gateway/exam-service API for uploads, generation jobs, model catalog, recent uploads, and generated history.
- Gateway prefix: `/api/v1/ai/*`
- Known routes: `POST /ai/quick-upload`, `POST /ai/generate-from-file`, `POST /ai/upload`, `POST /ai/upload-image`, `GET /ai/recent-uploads`, `GET /ai/models`, `GET /ai/upload/:uploadId`, `DELETE /ai/upload/:uploadId`, `POST /ai/regenerate/:uploadId`, `GET /ai/job/:jobId`, `DELETE /ai/job/:jobId`, `GET /ai/upload/:uploadId/history`
- Features: F003, F006, F012
- Entities: MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage, MODEL025 Document
- Clients: web `aiApi.ts`, `examApi.ts`, `historyApi.ts`, `useAIGeneratorStore`, KMP `AIGeneratorApiService`

## API007 - AI Chat API
Chat CRUD, messages, streaming, image upload, and multi-document chat from web to gateway/exam-service/Python AI service.
- Web API base: `/ai-chat/*`
- Python routes: `POST /api/chat/query`, `POST /api/chat/stream`, `GET /api/chat/health`
- Features: F007
- Entities: MODEL018 AIChat, MODEL019 AIChatMessage, MODEL020 AIChatDocument, MODEL024 UserStorage
- Clients: web `aiChatApi.ts`, Zustand `useAITeacherStore`, KMP `AIChatApiService`, `AIChatRepository`
- Needs verification: exact gateway/exam-service `/ai-chat/*` route list is referenced by frontend but not fully enumerated in backend scout.

## API008 - Subject & AI Model Catalog API
Subject taxonomy and model catalog used by AI teacher/generation flows.
- Gateway prefixes: `/api/v1/subjects/*`, `/api/v1/ai/models`
- Known routes: `GET /subjects`, `GET /ai/models`, Python `GET /api/ai/models`
- Features: F007
- Entities: subject/category models are referenced in frontend/KMP, but Prisma subject models are not enumerated in scout database list; Needs verification for MODEL assignment.
- Clients: web `subjectApi.ts`, `aiApi.ts`, `useAIModelCatalogStore`, KMP `SubjectApiService`

## API009 - History API
Aggregated history stats plus PDF and exam history lists.
- Gateway prefixes: `/api/v1/examattempts/*`, `/api/v1/ai/*`
- Known routes: `/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list`
- Features: F003
- Entities: MODEL018 ExamAttempt, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage
- Clients: web `historyApi.ts`, `useStatsStore`, KMP `HistoryApiService`

## API010 - Student Materials API
Recent materials, pinned materials, and student-facing access to flashcards/exams.
- Gateway prefix: `/api/v1/student/*`
- Known client base: `/student/materials/`
- Features: F003, F004, F005, F012
- Entities: MODEL010 QuizSet, MODEL014 FlashCardSet, MODEL016 ExamRoom, MODEL017 ExamSession
- Clients: web `studentMaterialsApi.ts`, Zustand `useStudentMaterialsStore`, KMP `StudentMaterialsApiService`
- Needs verification: exact backend student route list not detailed in scout.

## API011 - Python AI Processing API
Direct Python FastAPI endpoints used by NestJS exam-service for OCR, RAG, generation, entity extraction, and cache operations.
- Base prefixes: `/api/ai/*`, `/api/generate/*`
- Routes: `POST /api/ai/process-file`, `POST /api/ai/query-file`, `POST /api/ai/multi-query`, `GET /api/ai/file-status/{id}`, `GET /api/ai/graph-stats/{id}`, `POST /api/ai/extract-entities/{id}`, `GET /api/ai/entities/{id}`, `DELETE /api/ai/clear-cache/{id}`, `POST /api/generate/quiz`, `POST /api/generate/flashcards`, `GET /api/generate/quiz/{history_id}`, `GET /api/generate/flashcards/{history_id}`
- Features: F006, F007
- Entities: MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage, MODEL025 Document
- Clients: primarily backend exam-service; not usually called directly by web/mobile.

## API012 - R2 Storage API/gRPC
Cloudflare R2 storage upload/download/sign/delete/list capability exposed via service-to-service gRPC and gateway/exam-service routes.
- gRPC package: `r2`
- gRPC methods: `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles`
- Gateway prefix: `/api/v1/r2/*`; known route `POST /r2/*`; web image client `/r2/image`
- Features: F002, F006, F011
- Entities: MODEL024 UserStorage, MODEL025 Document
- Needs verification: complete HTTP route list for R2 proxy.

## API013 - OCR Service API/gRPC
PDF OCR processing via hybrid NestJS gRPC service and Python backend.
- gRPC package: `ocr`
- gRPC methods: `ProcessPdf`, `HealthCheck`
- Python backend: `http://127.0.0.1:8003`
- Features: F006, F011
- Entities: MODEL024 UserStorage, MODEL025 Document

## API014 - GenAI Tutor Knowledge API
Teacher/admin knowledge base ingestion, folders/files, graph snapshots, dataset imports, and bulk operations.
- Gateway/exam-service prefix: `/api/v1/ai/tutor/*`
- Python prefix: `/api/tutor/*`
- Known routes: `/ingest`, `/knowledge-files`, `/knowledge-files/{file_id}`, `/knowledge-files/{file_id}/graph`, `/knowledge-files/{file_id}/reprocess`, `/knowledge-files/bulk-delete`, `/knowledge-files/bulk-reprocess`, `/knowledge-folders`, `/knowledge-folders/{folder_id}`, `/knowledge-folders/{folder_id}/contents`, `/knowledge-stats`, `/dataset-imports`, `/dataset-imports/catalog`, `/dataset-imports/{job_id}`, `/dataset-imports/{job_id}/cancel`, `/dataset-imports/{dataset_key}/clear`
- Features: F007
- Entities: MODEL024 UserStorage, MODEL025 Document
- Clients: web `genaiTutorKnowledgeApi.ts`, `useGenAIKnowledgeStore`
- Needs verification: exact permission model; TeacherRoute does not enforce teacher role in scout.

## API015 - Cheating Log API
Exam proctoring violation logging and analytics.
- Gateway routes: `POST /cheatinglog`; frontend client base references `/cheatinglogs/*`
- Features: F009, F008
- Entities: MODEL019 CheatingLog, MODEL018 ExamAttempt
- Clients: web `useCheatingDetection`, `cheatingLogApi.ts`
- Needs verification: route naming mismatch singular/plural.

## API016 - Wallet, Payments & Subscription API
Wallet balance/details, payment QR creation, status/history/cancel, and subscription plan/benefit access.
- Gateway prefixes: `/api/v1/wallet/*`, `/api/v1/payment/*`
- Finance routes: `GET /wallet/info`, `GET /wallet/details`, `POST /payment/create`, `GET /payment/status/:paymentId`, `GET /payment/history`, `DELETE /payment/cancel/:paymentId`
- gRPC packages: `wallet`, `subscription`
- gRPC methods: `CreateWallet`, `GetWallet`, `UpdateBalance`, `GetUserBenefits`
- Features: F010, F012
- Entities: MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription
- Clients: web `subscriptionApi.ts`, KMP `WalletApiService`, Account screens
- Needs verification: frontend/mobile subscription plan endpoints such as `/payment/subscription/plans` are referenced but not in backend scout route table.

## API017 - External Webhook API
SePay callback endpoint for payment completion/failure processing.
- Gateway prefix: `/api/v1/webhook/*`
- Finance route: `POST /webhook/sepay`
- Auth: API key per scout
- Features: F010
- Entities: MODEL008 Payment, MODEL006 Wallet, MODEL007 WalletTransaction, MODEL009 UserSubscription

## API018 - Service-to-Service Auth & Events
Internal contracts for JWT validation, permission checks, wallet bootstrap, subscription checks, file storage, OCR, and asynchronous events.
- gRPC auth methods: `ValidateToken`, `GetUserInfo`, `CheckPermission`
- RabbitMQ exchange: `kmaedu.events`
- Event types: `user.created`, `user.updated`, `user.deleted`, `user.verified`, `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, `subscription.expired`, `exam.created`, `exam.started`, `exam.submitted`, `ocr.requested`, `ocr.completed`, `ocr.failed`
- Features: F001, F006, F010, F011
- Entities: MODEL001 User, MODEL006 Wallet, MODEL008 Payment, MODEL009 UserSubscription, MODEL024 UserStorage, MODEL025 Document
