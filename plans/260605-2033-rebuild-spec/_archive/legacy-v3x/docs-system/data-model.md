# Data Model

Generated: 2026-05-27

## Notes

- Backend PostgreSQL/Prisma schema is the source of truth for persisted domain entities.
- Web and mobile types mirror selected backend entities but may not cover full DB shape.
- Field lists are limited to fields present in the scout report; missing fields are marked as Needs verification.
- Stable entity codes use `MODEL###`.

Sources: `plans/260527-1951-rebuild-spec/artifacts/scout-report.md` lines 443-495, 990-1002, 1231-1287.

## Backend Persistent Models

### User / Auth Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL001 | `User` | Core user account | `id`, `email`, `username`, `name`, `avatar`, `banner`, `bio`, `isAdmin`, `isVerified`, `password` | Web `types/user.ts`; mobile `UserModels.kt` |
| MODEL002 | `UserSession` | Refresh/session/device tracking | `sessionId`, `refreshToken`, `deviceId`, `deviceName`, `browser`, `OS`, `IP`, `location` | Web auth store/session handling; mobile `SessionTokens` |
| MODEL003 | `VerifyAccountCode` | Email verification code | Needs verification | Web verify flow |
| MODEL004 | `ResetPasswordCode` | Password reset code | Needs verification | Web/mobile forgot/reset password |
| MODEL005 | `UserMonthlyFileUpload` | Monthly upload limit tracking | Needs verification | AI upload/subscription limit flow |

Sources: `scout-report.md` lines 451-456, 533-557, 953-971, 1217-1219, 1231-1237.

### Finance Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL006 | `Wallet` | User wallet balance | `balance`, one-to-one with `User` | Web subscription store/API; mobile `WalletDetails` |
| MODEL007 | `WalletTransaction` | Wallet transaction history | `amount`, `type`, `direction` (`ADD`/`SUBTRACT`) | Web transaction table; mobile `Transaction` |
| MODEL008 | `Payment` | Payment records | `amount`, `currency`, `status`, `paymentType`, SePay VA | Web QR payment/status/history |
| MODEL009 | `UserSubscription` | Subscription tier state | tier values `0=none`, `1=basic`, `2=advanced`, `3=vip` | Finance gRPC `GetUserBenefits`; web/mobile subscription plans |

Sources: `scout-report.md` lines 458-463, 178-213, 918-919, 1283-1287.

### Quiz Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL010 | `QuizSet` | Quiz collection | `title`, `tags`, public/pinned flags, labels | Web `QuizSet`; mobile `QuizSet` |
| MODEL011 | `QuizSetLabel` | Quiz set label/organization | Needs verification | Web/mobile label types |
| MODEL012 | `QuizQuestion` | Individual quiz question | question text, options array, answer | Web `Quizz`; mobile `Question` |
| MODEL013 | `DetailsQuizQuestion` | QuizSet-to-QuizQuestion junction | history and label links | Needs verification in clients |
| MODEL014 | `QuizPracticeAttempt` | Practice attempt tracking | `type`, answers, score, time, marked questions | Web flashcard/quiz practice flows |

Sources: `scout-report.md` lines 465-470, 995-999, 1264-1270.

### Flashcard Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL015 | `FlashCardSet` | Flashcard collection | `title`, `tags`, `accessCode`, whitelist | Web `FlashcardSet`; mobile `FlashcardSet` |
| MODEL016 | `FlashCard` | Individual flashcard | `question`, `answer` | Web/mobile flashcard types |
| MODEL017 | `DetailsFlashCard` | FlashCardSet-to-FlashCard junction | history links | Needs verification |

Sources: `scout-report.md` lines 472-475, 995-999, 1253-1258.

### Exam Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL018 | `ExamRoom` | Teacher/host exam room | `title`, `description`, host, linked `QuizSet` | Web/mobile exam room types |
| MODEL019 | `ExamSession` | Exam session lifecycle and access rules | `status`, timestamps, `assessType`, `accessCode`, whitelist, `passingScore`, `allowRetake` | Web `ExamSession`; mobile `ExamSession` |
| MODEL020 | `ExamAttempt` | Student attempt state/scoring | `score`, answers, `currentIndex`, `markedQuestions`, `violationCount`, `status` | Web/mobile `ExamAttempt`; secure quiz flow |
| MODEL021 | `CheatingLog` | Proctoring violation record | attempt + type (`TAB_SWITCH`, `WINDOW_BLUR`, `DEVTOOLS_OPEN`, etc.) | Web `useCheatingDetection`; cheating log API |

Sources: `scout-report.md` lines 477-480, 996-997, 1042-1049, 1264-1270.

### AI Chat / Generation Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL022 | `AIChat` | AI chat session | Needs verification | Web AI teacher/chat; mobile `AIChat` |
| MODEL023 | `AIChatMessage` | AI chat message | `role`, `content`, `imageUrl`, document references | Web `aiChatApi`; mobile `AIChatMessage` |
| MODEL024 | `AIChatDocument` | AIChat-to-UserStorage junction | Links chat to user storage for multi-document support | Web multi-document chat |
| MODEL025 | `HistoryGeneratedQuizz` | Saved generated quiz history | quizzes JSON, linked `UserStorage` | Web PDF/exam history |
| MODEL026 | `HistoryGeneratedFlashcard` | Saved generated flashcard history | flashcards JSON, linked `UserStorage` | Web PDF/flashcard history |

Sources: `scout-report.md` lines 482-489, 911-916, 940-945, 1240-1249.

### Storage / Document Domain

| Code | Model | Purpose | Key Fields From Scout | Related Coverage |
|---|---|---|---|---|
| MODEL027 | `UserStorage` | File metadata and processing state | `filename`, `url`, `mimetype`, `size`, `keyR2`, `processingStatus`, `creditCharged` | Web recent uploads/history; AI processing |
| MODEL028 | `Document` | OCR-processed document chunks | `pageRange`, `title`, `content`, embeddings vector | Python AI RAG/generation |
| MODEL029 | `UserStorageGraph` | Graph/RAG artifact | Needs verification | Mentioned in session context only |
| MODEL030 | `UserStorageGraphGroup` | Graph/RAG grouping artifact | Needs verification | Mentioned in session context only |

Sources: `scout-report.md` lines 491-494, 561-590, `_session-context.md` lines 18-21.

## Shared Contracts / Non-DB Models

### gRPC Contracts

| Code | Contract | Service | Methods | Notes |
|---|---|---|---|---|
| MODEL031 | `auth.proto` | `AuthService` | `ValidateToken`, `GetUserInfo`, `CheckPermission` | Auth service port 50051 |
| MODEL032 | `wallet.proto` | `WalletService` | `CreateWallet`, `GetWallet`, `UpdateBalance` | Finance service port 50053 |
| MODEL033 | `subscription.proto` | `SubscriptionService` | `GetUserBenefits` | Finance service port 50053 |
| MODEL034 | `r2.proto` | `R2Service` | `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles` | R2 service port 50054 |
| MODEL035 | `ocr.proto` | `OcrService` | `ProcessPdf`, `HealthCheck` | OCR gRPC service |

Source: `scout-report.md` lines 420-440.

### RabbitMQ Event Types

| Code | Event Group | Events |
|---|---|---|
| MODEL036 | User events | `user.created`, `user.updated`, `user.deleted`, `user.verified` |
| MODEL037 | Payment/wallet/subscription events | `payment.success`, `payment.failed`, `wallet.created`, `wallet.updated`, `subscription.activated`, `subscription.expired` |
| MODEL038 | Exam events | `exam.created`, `exam.started`, `exam.submitted` |
| MODEL039 | OCR events | `ocr.requested`, `ocr.completed`, `ocr.failed` |

Source: `scout-report.md` lines 499-530.

## Web Frontend Type Coverage

| Code | Type File | Key Types | Backend Alignment |
|---|---|---|---|
| MODEL040 | `src/types/user.ts` | `User` with wallet balance/admin/verified fields | `User`, `Wallet` subset |
| MODEL041 | `src/types/exam.ts` | `Quizz`, `Flashcard`, `TypeResultGenerateExam` | Quiz/flashcard generation output |
| MODEL042 | `src/types/examSession.ts` | `ExamSession`, status/access/sharing enums/types | `ExamSession`, access rules |
| MODEL043 | `src/types/examRoom.ts` | `ExamRoom`, `ExamSessionBasic` | `ExamRoom`, `ExamSession` subset |
| MODEL044 | `src/types/flashcardSet.ts` | `FlashcardSet`, `Flashcard`, study/access/sharing types | `FlashCardSet`, `FlashCard` |
| MODEL045 | `src/types/quizset.ts` | `QuizSet`, `Quizz`, `QuizSetLabel`, `LastAttemptInfo` | `QuizSet`, `QuizQuestion`, `QuizSetLabel` |
| MODEL046 | `src/types/ai.ts` | `AIModel`, `AIModelCatalog`, default model | AI model catalog endpoint |
| MODEL047 | `src/types/genai-knowledge.ts` | Knowledge folder/file/graph/dataset types | Python tutor storage; exact DB tables need verification |

Source: `scout-report.md` lines 990-1002.

## Mobile Shared Type Coverage

| Code | Kotlin File/Area | Key Types | Backend Alignment |
|---|---|---|---|
| MODEL048 | `SessionModels.kt` | `SessionTokens`, `UserSession` | `UserSession`, auth tokens |
| MODEL049 | `AuthModels.kt` / `UserModels.kt` | login/signup/current user/reset/auth response/user roles | Auth routes and `User` |
| MODEL050 | `AIChatModels.kt` | `AIChat`, `AIChatMessage`, `SendMessageRequest` | `AIChat`, `AIChatMessage` |
| MODEL051 | `SubjectModels.kt` | `SubjectCategory`, `Subject` | Subject taxonomy; DB source needs verification |
| MODEL052 | `AIGeneratorModels.kt` | `RecentUpload`, `GenerateExamRequest`, `GenerateExamResponse` | `UserStorage`, generated histories |
| MODEL053 | `FlashcardModels.kt` | `FlashcardSet`, `Flashcard`, create request, labels | `FlashCardSet`, `FlashCard`, labels |
| MODEL054 | `QuizSetModels.kt` | `QuizSet`, `Question`, create request, labels | `QuizSet`, `QuizQuestion`, labels |
| MODEL055 | `ExamRoomModels.kt` | `ExamRoom`, `ExamSession`, `ExamSessionStatus` | `ExamRoom`, `ExamSession` |
| MODEL056 | `ExamAttemptModels.kt` | `ExamAttempt`, secure question/answer/submit requests | `ExamAttempt`, secure quiz response |
| MODEL057 | `HistoryModels.kt` | stats, PDF history item, exam history item | uploads, attempts, generated history |
| MODEL058 | `ProfileModels.kt` / `WalletModels.kt` | `UserProfile`, update profile, transactions, wallet details, subscription plan | `User`, `Wallet`, `WalletTransaction`, subscriptions |

Sources: `scout-report.md` lines 1217-1287.

## Important Relationships

- `User` owns `UserSession`, wallet/subscription, upload history, learning content, and exam attempts. Exact cardinalities need schema verification.
- `Wallet` is one-to-one with `User`; wallet creation is triggered by `user.created` event or finance gRPC flow.
- `QuizSet` links to `QuizQuestion` through `DetailsQuizQuestion`; `ExamRoom` links to `QuizSet`; `ExamSession` belongs to an exam room/session lifecycle; `ExamAttempt` records student progress and score.
- `FlashCardSet` links to `FlashCard` through `DetailsFlashCard`.
- `UserStorage` stores uploaded file metadata and links to `Document` chunks plus generated quiz/flashcard histories.
- `AIChat` links to `UserStorage` through `AIChatDocument` for multi-document chat.

Sources: `scout-report.md` lines 443-495, 584-590, 599-608.

## Needs Verification

- Full Prisma fields, enums, defaults, unique constraints, cascade behavior, and relation cardinalities.
- Subject/category persisted model names and fields; scout lists frontend/mobile subject types but not DB models in the Prisma domain summary.
- GenAI tutor knowledge file/folder/dataset import DB tables; scout describes API/services but not Prisma model names.
- Whether web/mobile type fields exactly match backend DTOs for secure quiz, payments, AI chat streaming, and subscription plans.
- Whether `UserStorageGraph` and `UserStorageGraphGroup` are active models in current Prisma schema or only noted context entities.
