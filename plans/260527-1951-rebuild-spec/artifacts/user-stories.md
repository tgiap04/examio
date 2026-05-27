# User Stories

Source artifacts: `scout-report.md`, `_session-context.md`.

## Public Visitor & Account Access

### US001 - Create an account
As a visitor, I want to register with email/password or Google OAuth so that I can access Examio learning features.
- References: routes `/register`, `/api/v1/auth/register`, `/api/v1/auth/google`; entities MODEL001 User, MODEL002 UserSession.

### US002 - Sign in and keep my session active
As a user, I want to log in, refresh my session, and be redirected back to my intended page so that I can continue working without repeated sign-ins.
- References: routes `/login`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/sync-refresh-token`; entities MODEL001 User, MODEL002 UserSession.

### US003 - Recover or change my password
As a user, I want to request reset/change codes and set a new password so that I can regain or secure account access.
- References: routes `/forgot-password`, `/reset-password`, `/api/v1/auth/send-code-reset-password`, `/api/v1/auth/reset-password`, `/api/v1/auth/change-password`; entities MODEL004 ResetPasswordCode.

### US004 - Verify my account
As an authenticated user, I want to receive and submit an account verification code so that my account becomes verified.
- References: routes `/k/verify`, `/api/v1/auth/sendVerificationEmail`, `/api/v1/auth/verifyAccount`; entities MODEL003 VerifyAccountCode.

## Learner Workspace

### US005 - Manage my learning materials
As a learner, I want to view recent flashcards and exams, pin materials, and access shared links so that I can quickly resume study.
- References: route `/k/my-materials`, `/api/v1/student/*`; entities MODEL010 QuizSet, MODEL014 FlashCardSet.

### US006 - Create and organize quiz sets
As a learner or teacher, I want to create quiz sets, add questions, assign labels, and share access so that quizzes can be reused for practice and exams.
- References: routes `/k/manage-quiz-set/:id`, `/api/v1/quizsets/*`; entities MODEL010 QuizSet, MODEL011 QuizSetLabel, MODEL012 QuizQuestion.

### US007 - Create and study flashcard sets
As a learner or teacher, I want to create flashcard sets, edit cards, organize labels, and run study sessions so that I can practice spaced recall.
- References: routes `/k/flash-card`, `/study-flashcard/:id`, `/api/v1/flashcardsets/*`, `/api/v1/flashcard-study/*`; entities MODEL014 FlashCardSet, MODEL015 FlashCard.

### US008 - Generate learning content from uploaded files
As a learner, I want to upload PDFs/images and generate quizzes or flashcards from processed document content so that I can turn materials into study assets.
- References: route `/k/ai-tool`, `/api/v1/ai/quick-upload`, `/api/v1/ai/generate-from-file`, Python `/api/generate/*`; entities MODEL024 UserStorage, MODEL025 Document, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard.

### US009 - Chat with an AI tutor
As a learner, I want to chat with an AI teacher using selected subjects and attached documents so that I can get contextual learning support.
- References: route `/k/ai-tool`, `/api/v1/ai-chat/*`, Python `/api/chat/stream`; entities MODEL018 AIChat, MODEL019 AIChatMessage, MODEL020 AIChatDocument, MODEL024 UserStorage.

### US010 - Review learning history
As a learner, I want to view PDF, generation, and exam history so that I can track past activity.
- References: routes `/k/history`, `/k/history/exam`, `/k/history/pdf`, `/api/v1/examattempts/history-stats`, `/api/v1/ai/recent-uploads`; entities MODEL017 ExamAttempt, MODEL021 HistoryGeneratedQuizz, MODEL022 HistoryGeneratedFlashcard, MODEL024 UserStorage.

## Exams & Assessment

### US011 - Manage exam rooms and sessions
As a teacher, I want to create exam rooms and sessions with access rules, schedules, question selection, and sharing settings so that students can take controlled assessments.
- References: routes `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/api/v1/examrooms/*`, `/api/v1/examsessions/*`; entities MODEL016 ExamRoom, MODEL017 ExamSession.

### US012 - Join and take an exam session
As a student, I want to join an exam session by link/code, answer secure questions, and submit my attempt so that my score is recorded.
- References: routes `/exam-session/:id`, `/exam-session/:id/quiz`, `/api/v1/examsessions/:id/join`, `/api/v1/examattempts/*`; entities MODEL017 ExamSession, MODEL018 ExamAttempt.

### US013 - Monitor exam integrity
As a teacher or system, I want exam attempts to record tab switches, window blur, devtools, and other violations so that integrity risks are visible.
- References: frontend hook `useCheatingDetection`, `/api/v1/cheatinglog` or `/api/v1/cheatinglogs/*`; entities MODEL019 CheatingLog.

### US014 - Analyze exam room sessions
As a teacher, I want to view exam room/session analytics and logs so that I can evaluate outcomes and suspicious behavior.
- References: route `/k/manage-exam-room/:id/session/:sessionId`, `/api/v1/examsessions/*`, `/api/v1/cheatinglogs/*`; entities MODEL016 ExamRoom, MODEL017 ExamSession, MODEL018 ExamAttempt, MODEL019 CheatingLog.

## Profile, Payments & Administration

### US015 - Manage profile and devices
As a user, I want to update profile details, avatar/banner, and active devices so that my account is personalized and secure.
- References: route `/k/profile`, `/api/v1/profile/*`, `/api/v1/devices/*`, `/api/v1/r2/*`; entities MODEL001 User, MODEL002 UserSession.

### US016 - Manage wallet and subscription
As a user, I want to see wallet balance, create payments, check payment status, and review transaction history so that I can pay for premium usage.
- References: route `/k/subscription`, `/api/v1/wallet/*`, `/api/v1/payment/*`; entities MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription.

### US017 - Process payment webhooks
As the system, I want to receive SePay webhook callbacks and update payments, wallet balances, and subscription state so that purchases are applied automatically.
- References: `/api/v1/webhook/sepay`, RabbitMQ `payment.success`, `wallet.updated`, `subscription.activated`; entities MODEL006 Wallet, MODEL007 WalletTransaction, MODEL008 Payment, MODEL009 UserSubscription.

### US018 - Manage GenAI tutor knowledge
As a teacher/admin, I want to create folders, upload knowledge files, import datasets, inspect graphs, and bulk process files so that tutor knowledge stays organized.
- References: route `/k/genai-knowledge`, `/api/v1/ai/tutor/*`, Python `/api/tutor/*`; entities MODEL024 UserStorage, MODEL025 Document. Needs verification for exact teacher/admin authorization.

## Mobile Companion

### US019 - Use core Examio flows on mobile
As a mobile user, I want to log in, view AI, study, exams, history, profile, and wallet screens so that I can use Examio from Android or iOS.
- References: `examio-app` Android Compose screens, iOS SwiftUI views, shared KMP repositories; entities mirror web/backend models. Most non-auth platform UIs are mock-data backed and need repository wiring.

### US020 - Receive deep links on mobile
As a mobile user, I want exam, flashcard, chat, profile, and OAuth links to open the right mobile destination so that shared workflows continue in-app.
- References: Android `examio://auth`, iOS `examio` URL scheme, KMP `DeepLink`; Needs verification for non-auth deep link handling completeness.
