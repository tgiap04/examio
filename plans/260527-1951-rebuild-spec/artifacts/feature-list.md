# Feature List

Source artifacts: `scout-report.md`, `_session-context.md`, `user-stories.md`.

## F001 - Account Authentication & Session Management
Users register, log in, use Google OAuth/One Tap, refresh sessions, log out, and recover/change passwords across web and mobile.
- User stories: US001, US002, US003
- Screens/routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, mobile auth flows
- APIs: API001
- Entities: MODEL001 User, MODEL002 UserSession, MODEL004 ResetPasswordCode
- Notes: Cookie-first JWT with Bearer fallback on backend; web stores tokens in localStorage/cookies; mobile uses secure storage patterns with iOS KMP storage incomplete.

## F002 - Account Verification & Profile Security
Authenticated users verify accounts, manage profile details, upload avatar/banner media, and manage active devices/sessions.
- User stories: US004, US015
- Screens/routes: `/k/verify`, `/k/profile`, profile/device components, mobile account/profile views
- APIs: API001, API002, API012
- Entities: MODEL001 User, MODEL002 UserSession, MODEL003 VerifyAccountCode

## F003 - Workspace Navigation, Dashboard & Material Access
Authenticated users access the workspace shell, protected routes, recent materials, history summaries, and cached student material lists.
- User stories: US005, US010, US019
- Screens/routes: `/k`, `/k/my-materials`, `/k/history`, `/k/history/exam`, `/k/history/pdf`, mobile home/history/study tabs
- APIs: API006, API009, API010
- Entities: MODEL010 QuizSet, MODEL015 FlashCardSet, MODEL020 ExamAttempt, MODEL027 UserStorage
- Notes: Web is production wired; mobile non-auth screens mostly use mock UiState data.

## F004 - Quiz Set Authoring & Practice Content
Users create quiz sets, manage questions and labels, save generated quiz content, and use quiz material for practice/exam workflows.
- User stories: US006, US008
- Screens/routes: `/k/manage-quiz-set/:id`, quiz set modals/forms, mobile De Thi/teacher screens
- APIs: API003, API010
- Entities: MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion, MODEL013 DetailsQuizQuestion, MODEL025 HistoryGeneratedQuizz

## F005 - Flashcard Authoring & Study
Users create flashcard sets, manage flashcards and labels, share access, and run flashcard study sessions with progress tracking.
- User stories: US007
- Screens/routes: `/k/flash-card`, `/k/manage-flashcard-set/:id`, `/study-flashcard/:id`, mobile study views
- APIs: API004, API010
- Entities: MODEL015 FlashCardSet, MODEL016 FlashCard, MODEL017 DetailsFlashCard

## F006 - AI File Upload, OCR & Content Generation
Users upload files/images, store them in R2, process them through OCR/RAG pipelines, poll jobs/status, and generate quizzes or flashcards.
- User stories: US008
- Screens/routes: `/k/ai-tool`, recent files/history dialogs, mobile AI tool screens
- APIs: API006, API011, API012, API013
- Entities: MODEL025 HistoryGeneratedQuizz, MODEL026 HistoryGeneratedFlashcard, MODEL027 UserStorage, MODEL028 Document
- Notes: Backend flow spans gateway -> exam-service -> R2 gRPC -> Python AI service -> PostgreSQL; some async processing uses RabbitMQ.

## F007 - AI Chat & Virtual Tutor
Users chat with AI using SSE streaming, selected subjects, images, and attached documents; teachers/admins manage tutor knowledge sources.
- User stories: US009, US018
- Screens/routes: `/k/ai-tool`, `/k/genai-knowledge`, mobile AI chat views
- APIs: API007, API008, API011, API014
- Entities: MODEL022 AIChat, MODEL023 AIChatMessage, MODEL024 AIChatDocument, MODEL027 UserStorage, MODEL028 Document
- Notes: Mobile SSE clients are stubs; teacher/admin authorization for GenAI knowledge needs verification.

## F008 - Exam Room & Session Management
Teachers create rooms and sessions, configure schedules/access/sharing/retake rules, and view room/session analytics.
- User stories: US011, US014
- Screens/routes: `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/k/manage-exam-room/:id/session/:sessionId`, mobile teacher/exam screens
- APIs: API005
- Entities: MODEL018 ExamRoom, MODEL019 ExamSession, MODEL020 ExamAttempt, MODEL021 CheatingLog

## F009 - Exam Taking, Attempts & Integrity Logging
Students join exam sessions, start/resume attempts, receive secure/encrypted quiz payloads, submit answers, and generate cheating logs from proctoring signals.
- User stories: US012, US013
- Screens/routes: `/exam-session/:id`, `/exam-session/:id/quiz`, mobile My Exams quiz/result states
- APIs: API005, API015
- Entities: MODEL019 ExamSession, MODEL020 ExamAttempt, MODEL021 CheatingLog
- Notes: Standalone web exam routes are not route-guarded and rely on API/session/code access control.

## F010 - Wallet, Payments & Subscription Benefits
Users view wallet details, create/cancel payments, poll payment status, review history, and receive subscription benefits through finance service and gRPC.
- User stories: US016, US017
- Screens/routes: `/k/subscription`, mobile account wallet views
- APIs: API016, API017
- Entities: MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription
- Notes: Web `FREE_MODE = true` currently bypasses frontend credit checks; production intent needs verification.

## F011 - Storage, Media & File Lifecycle
The system uploads, signs, lists, and deletes user files/media via R2, while keeping metadata and processed document chunks in the database.
- User stories: US008, US015, US018
- Screens/routes: profile avatar/banner upload, AI upload flows, GenAI knowledge file manager
- APIs: API012, API013
- Entities: MODEL027 UserStorage, MODEL028 Document
- Notes: R2 deletion behavior on data deletion should be verified per product rule.

## F012 - Cross-Platform Mobile Companion
Android and iOS expose mobile versions of auth, AI, study, exams, history, account, wallet, and teacher management using shared KMP API/repository contracts.
- User stories: US019, US020
- Screens/routes: Android `KMAEduApp` tabs, iOS `ContentView` TabView, app deep links
- APIs: API001, API003, API004, API005, API006, API009, API010, API016
- Entities: Same backend models via shared KMP DTOs
- Notes: Shared API layer is real; most platform UIs outside auth still need repository wiring. Non-auth deep link completion needs verification.
