# Entities

Source artifacts: `data-model.md`, `scout-report.md`.


## Entity Reference Strategy

- `MODEL###` from `data-model.md` is the canonical cross-artifact reference for persisted backend models and shared contracts.
- `ENT###` in this file is an auxiliary catalog for readers who want a business-oriented entity index.
- Feature specs, API maps, behavior logic, and flows should prefer `MODEL###`; when needed, this catalog maps `ENT###` to the closest canonical `MODEL###`.

## ENT to MODEL Mapping

| ENT | Canonical MODEL | Entity |
|---|---|---|
| ENT001 | MODEL001 | User |
| ENT002 | MODEL002 | UserSession |
| ENT003 | MODEL003 | VerifyAccountCode |
| ENT004 | MODEL004 | ResetPasswordCode |
| ENT005 | MODEL006 | Wallet |
| ENT006 | MODEL007 | WalletTransaction |
| ENT007 | MODEL008 | Payment |
| ENT008 | MODEL009 | UserSubscription |
| ENT009 | MODEL010 | QuizSet |
| ENT010 | MODEL012 | QuizQuestion |
| ENT011 | MODEL015 | FlashCardSet |
| ENT012 | MODEL016 | FlashCard |
| ENT013 | MODEL018 | ExamRoom |
| ENT014 | MODEL019 | ExamSession |
| ENT015 | MODEL020 | ExamAttempt |
| ENT016 | MODEL021 | CheatingLog |
| ENT017 | MODEL022 | AIChat |
| ENT018 | MODEL023 | AIChatMessage |
| ENT019 | MODEL024 | AIChatDocument |
| ENT020 | MODEL027 | UserStorage |
| ENT021 | MODEL028 | Document |
| ENT022 | MODEL029 | UserStorageGraph |
| ENT023 | MODEL025 | HistoryGeneratedQuizz |
| ENT024 | MODEL026 | HistoryGeneratedFlashcard |
| ENT025 | Needs verification | SubjectCategory |
| ENT026 | Needs verification | Subject |
| ENT101 | MODEL031 | AuthService proto |
| ENT102 | MODEL032 | WalletService proto |
| ENT103 | MODEL033 | SubscriptionService proto |
| ENT104 | MODEL034 | R2Service proto |
| ENT105 | MODEL035 | OcrService proto |
| ENT106 | MODEL036-MODEL039 | RabbitMQ event payloads |

## Persistent Entities

| Code | Entity | Domain | Storage | Primary Consumers |
|---|---|---|---|---|
| ENT001 | User | Auth/Profile | PostgreSQL Prisma | BE auth, FE auth/profile, mobile auth |
| ENT002 | UserSession | Auth/Session | PostgreSQL Prisma | BE auth, FE Axios/auth store, mobile secure storage |
| ENT003 | VerifyAccountCode | Auth | PostgreSQL Prisma | Account verification |
| ENT004 | ResetPasswordCode | Auth | PostgreSQL Prisma | Forgot/reset password |
| ENT005 | Wallet | Finance | PostgreSQL Prisma | Finance service, web/mobile wallet |
| ENT006 | WalletTransaction | Finance | PostgreSQL Prisma | Payment/history UI |
| ENT007 | Payment | Finance | PostgreSQL Prisma | SePay payment/QR/status |
| ENT008 | UserSubscription | Finance | PostgreSQL Prisma | Subscription benefits/AI quota |
| ENT009 | QuizSet | Learning | PostgreSQL Prisma | Quiz authoring, exams |
| ENT010 | QuizQuestion | Learning | PostgreSQL Prisma | Quiz set/detail/exam attempt |
| ENT011 | FlashCardSet | Learning | PostgreSQL Prisma | Flashcard CRUD/study |
| ENT012 | FlashCard | Learning | PostgreSQL Prisma | Flashcard detail/study |
| ENT013 | ExamRoom | Exam | PostgreSQL Prisma | Teacher room management |
| ENT014 | ExamSession | Exam | PostgreSQL Prisma | Session scheduling/joining |
| ENT015 | ExamAttempt | Exam | PostgreSQL Prisma | Student attempts/scoring/history |
| ENT016 | CheatingLog | Exam Integrity | PostgreSQL Prisma | Proctoring logs/analytics |
| ENT017 | AIChat | AI Chat | PostgreSQL Prisma | Web AI chat |
| ENT018 | AIChatMessage | AI Chat | PostgreSQL Prisma | Web/mobile AI chat |
| ENT019 | AIChatDocument | AI Chat | PostgreSQL Prisma | Multi-document chat context |
| ENT020 | UserStorage | Storage/AI | PostgreSQL + R2 | Uploads/OCR/history |
| ENT021 | Document | AI/RAG | PostgreSQL vector/content | Python AI/RAG/generation |
| ENT022 | UserStorageGraph | AI/GraphRAG | PostgreSQL | Tutor/graph features |
| ENT023 | HistoryGeneratedQuizz | AI History | PostgreSQL | Generated quiz history |
| ENT024 | HistoryGeneratedFlashcard | AI History | PostgreSQL | Generated flashcard history |
| ENT025 | SubjectCategory | Tutor/Subject | PostgreSQL | AI teacher subject selector |
| ENT026 | Subject | Tutor/Subject | PostgreSQL | AI teacher/tutor prompts |

## Contract Entities

| Code | Contract | Kind | Used By |
|---|---|---|---|
| ENT101 | AuthService proto | gRPC | Auth validation/user info/permissions |
| ENT102 | WalletService proto | gRPC | Wallet creation/read/update |
| ENT103 | SubscriptionService proto | gRPC | User benefits/quota |
| ENT104 | R2Service proto | gRPC | Upload/sign/delete/list files |
| ENT105 | OcrService proto | gRPC | PDF OCR processing |
| ENT106 | RabbitMQ event payloads | Event | User/payment/wallet/subscription/exam/OCR events |

## Client-Side Entities

| Code | Entity | Client | Notes |
|---|---|---|---|
| ENT201 | Zustand auth state | Web | user/isAuthenticated/loading/initializing. |
| ENT202 | Store cache entries | Web | TTL map by feature/key. |
| ENT203 | Secure quiz payload | Web/mobile | Encrypted quiz/answer DTOs. |
| ENT204 | KMP SessionTokens | Mobile shared | accessToken/refreshToken/sessionId/deviceId. |
| ENT205 | Mobile UiState structs/classes | Android/iOS | Mostly mock-backed outside auth. |

## Unresolved Questions
- Exact Prisma relation fields and enum definitions require schema-level read.
- Entity code parity with `data-model.md` should be normalized during review.
