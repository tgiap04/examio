# Backend Codebase Scout Report -- ExamIO

> Generated: 2026-05-27
> Root: `/Users/tgiap.dev/devs/examio/examio-be/`

---

## 1. Architecture Overview

**Type:** NestJS monorepo (Nx-style) + Python microservices (FastAPI)
**Monorepo tool:** Yarn 4.9.2 workspaces, managed via `nest-cli.json`
**Polyglot split:** 5 NestJS services + 1 Python FastAPI + 1 hybrid NestJS/Python service

### NestJS Projects (nest-cli.json)

| Project | Type | Root | Entry | Port |
|---|---|---|---|---|
| gateway-service | application | apps/gateway-service | main | 3000 |
| auth-service | application | apps/auth-service | main | 3001 |
| exam-service | application | apps/exam-service | main | 3002 |
| finance-service | application | apps/finance-service | main | 3003 |
| r2-service | application | apps/r2-service | main | 3004 |
| ocr-service | application | apps/ocr-service | main | gRPC only |
| ai-service | application (NestJS stub) | apps/ai-service | main | - |
| common | library | libs/common | index | - |
| database | library | libs/database | index | - |
| redis | library | libs/redis | index | - |

### Technology Versions

| Tech | Version |
|---|---|
| Node.js | 20-alpine (Docker) |
| TypeScript | ~5.8.3 |
| NestJS | ~11.1.3 |
| Prisma | 6.16.2 |
| Python | >=3.12 |
| FastAPI | ~0.115.12 |
| LangChain | 0.3.x |
| LangGraph | 0.3.x |
| RabbitMQ | amqp-connection-manager + amqplib (NestJS) / aio-pika (Python) |
| Redis | ioredis 5.8.2 |
| PostgreSQL | asyncpg (Python) + Prisma (NestJS) |
| gRPC | @grpc/grpc-js 1.14.3 |
| Docker | Multi-stage build with Alpine |

---

## 2. Service-by-Service Breakdown

### 2.1 Gateway Service (`apps/gateway-service`)

**Role:** API Gateway / Reverse proxy. Single entry point for all clients (FE, mobile). Proxies to internal services via HTTP.

**Key files:**

| File | Description |
|---|---|
| `src/main.ts` | Bootstrap, Swagger config, CORS setup |
| `src/gateway.module.ts` | Registers all proxy controllers + rate limiting |
| `src/gateway.controller.ts` | `GET /health`, `GET /status` |
| `src/middleware/proxy.middleware.ts` | Logging middleware for all routes |
| `src/services/proxy.service.ts` | Core proxy logic -- forwards requests to auth/exam/finance services via axios |

**Proxy Controllers (src/controllers/):**

| Controller | Backend Routes |
|---|---|
| `auth-proxy.controller.ts` | Proxies `/api/v1/auth/*` -> auth-service:3001 |
| `quizset-proxy.controller.ts` | Proxies quizset CRUD -> exam-service:3002 |
| `flashcardset-proxy.controller.ts` | Proxies flashcardset CRUD -> exam-service |
| `examroom-proxy.controller.ts` | Proxies exam room -> exam-service |
| `examsession-proxy.controller.ts` | Proxies exam session -> exam-service |
| `examattempt-proxy.controller.ts` | Proxies exam attempt -> exam-service |
| `subject-proxy.controller.ts` | Proxies subject -> exam-service |
| `wallet-profile-proxy.controller.ts` | Wallet, Payment, Profile, Devices -> finance/auth |
| `ai-study-proxy.controller.ts` | AI, AIChat, FlashcardStudy, QuizPractice, CheatingLog -> exam-service + AI Python service |
| `r2-proxy.controller.ts` | R2 file storage -> exam-service (r2 module) |
| `webhook-proxy.controller.ts` | External webhooks (SePay) -> finance-service |
| `student-proxy.controller.ts` | Student endpoints -> exam-service |

**Special behavior:** Cookie-based auth tokens are forwarded from gateway to internal services. JWT Bearer tokens also supported as fallback.

---

### 2.2 Auth Service (`apps/auth-service`)

**Role:** User authentication, registration, OAuth, session management, JWT issuance.

**gRPC port:** 50051 (package: `auth`)

**HTTP routes (`/api/v1/auth/`):**

| Route | Method | Auth | Description |
|---|---|---|---|
| `/register` | POST | No | Register new user (sets cookies) |
| `/login` | POST | No | Login (sets cookies) |
| `/logout` | POST | Yes | Logout, clears cookies, deactivates session |
| `/refresh` | POST | No | Refresh access token (cookie or body) |
| `/me` | GET | Yes | Get current user info |
| `/sendVerificationEmail` | POST | Yes | Send email verification code |
| `/verifyAccount` | POST | Yes | Verify account with code |
| `/send-code-reset-password` | POST | No | Send password reset code |
| `/reset-password` | POST | No | Reset password |
| `/send-code-change-password` | POST | Yes | Send change password code |
| `/change-password` | POST | Yes | Change password |
| `/google` | GET | No | Google OAuth initiate |
| `/google/one-tap` | POST | No | Google One Tap login |
| `/google/callback` | GET | No | Google OAuth callback |
| `/sync-refresh-token` | POST | Yes | Sync refresh token from session |

**gRPC methods:**

| Method | Description |
|---|---|
| `ValidateToken` | Validates JWT, returns user info |
| `GetUserInfo` | Gets user by ID |
| `CheckPermission` | Checks user permission on resource |

**Sub-modules:**
- `devices/` -- Device management, session cleanup (cron: `session-cleanup.cron.ts`)
- `profile/` -- Profile reading
- `strategies/` -- Google OAuth2 strategy (passport-google-oauth20)

**Key files:**

| File | Description |
|---|---|
| `src/auth.controller.ts` | REST auth endpoints |
| `src/auth.service.ts` | Auth business logic (register, login, JWT, sessions) |
| `src/grpc/auth.grpc.controller.ts` | gRPC auth controller (ValidateToken, GetUserInfo, CheckPermission) |
| `src/repositories/user.repository.ts` | User DB queries |
| `src/devices/user-session.repository.ts` | Session DB queries |
| `src/devices/session-cleanup.cron.ts` | Periodic session cleanup (node-cron) |
| `src/dto/` | DTOs: login, register, auth-response |
| `src/profile/profile.controller.ts` | Profile routes |

---

### 2.3 Exam Service (`apps/exam-service`)

**Role:** Core business logic -- quizzes, flashcards, exam rooms, exams, AI integration, file management.

**Port:** 3002

**Modules:**

| Module | Files | Description |
|---|---|---|
| `quizset/` | controller, service, repository, DTOs | Quiz set CRUD, labels, questions, sharing, history |
| `flashcardset/` | controller, service, repository, DTOs | Flashcard set CRUD, labels, questions, sharing, history |
| `examroom/` | controller, service, repository, DTOs | Exam room management |
| `examsession/` | controller, service, repository, DTOs | Exam session lifecycle (create, start, end), access control |
| `examattempt/` | controller, service, repository, DTOs | Exam attempt tracking, scoring, answer management |
| `cheatinglog/` | controller, service, repository, DTOs | Cheating violation tracking (tab switch, devtools, etc.) |
| `ai/` | controller, service, repository, DTOs | AI file upload, tutor knowledge management, models catalog |
| `ai-chat/` | controller, service, repository | AI chat history management |
| `flashcard-study/` | controller, service | Flashcard study mode |
| `student/` | controller, service | Student-specific data |
| `subject/` | controller, service, repository | Subject management |
| `r2/` | controller, upload service | R2 file upload proxy |
| `finance-client/` | module, service | Finance/wallet client for credit checks |

**Key properties of the AI module (exam-service):** It handles file upload (multipart), triggers OCR processing, manages tutor knowledge files/folders, and queries AI service via HTTP. It uses `gRPC R2 client` for file storage lookup and R2 upload service for storing files.

---

### 2.4 Finance Service (`apps/finance-service`)

**Role:** Wallet management, payments (SePay), subscriptions.

**HTTP port:** 3003
**gRPC port:** 50053 (packages: `wallet`, `subscription`)

**HTTP Routes (`/api/v1/`):**

| Route | Method | Description |
|---|---|---|
| `/wallet/info` | GET | Get wallet info (auth required) |
| `/wallet/details` | GET | Get wallet details with transactions (auth required) |
| `/payment/create` | POST | Create payment, get QR code (auth required) |
| `/payment/status/:paymentId` | GET | Check payment status (auth required) |
| `/payment/history` | GET | Payment history (auth required) |
| `/payment/cancel/:paymentId` | DELETE | Cancel pending payment (auth required) |

**Webhook/SePay controllers:**
- `webhook.controller.ts` -- SePay webhook handler (external callback)
- `webhook.service.ts` -- Webhook processing logic
- `sepay.service.ts` -- SePay integration service
- `subscription.service.ts` / `subscription.grpc.controller.ts` -- Subscription management + gRPC

**gRPC methods:**

| Service | Method | Description |
|---|---|---|
| `WalletService` | `CreateWallet` | Create wallet for new user (called by auth-service on registration) |
| `WalletService` | `GetWallet` | Get wallet info |
| `WalletService` | `UpdateBalance` | Update wallet balance |
| `SubscriptionService` | `GetUserBenefits` | Get user subscription benefits (files/month, messages rate) |

**Event handlers:**
- `events/user-event.handler.ts` -- Handles `user.created` events -> auto-creates wallet

---

### 2.5 R2 Service (`apps/r2-service`)

**Role:** Cloudflare R2 file storage (S3-compatible). Handles file upload, download, signed URLs, listing.

**HTTP port:** 3004
**gRPC port:** 50054 (package: `r2`)
**gRPC message limit:** 500MB (for large file uploads)

**gRPC methods:**

| Method | Description |
|---|---|
| `UploadFile` | Upload file to R2 (50MB max) |
| `GetFileUrl` | Generate signed URL |
| `DeleteFile` | Delete file from R2 |
| `ListUserFiles` | List files by user with pagination |

**Files:**

| File | Description |
|---|---|
| `src/r2-service.controller.ts` | Optional HTTP health check |
| `src/r2-service.service.ts` | Core R2 logic using @aws-sdk/client-s3 |
| `src/config/r2.config.ts` | R2 configuration (bucket, credentials) |

---

### 2.6 AI Service (Python FastAPI) (`apps/ai-service`)

**Role:** Stateless AI processing node. OCR, vector search, RAG, content generation, AI tutoring.

**Python version:** >=3.12
**Framework:** FastAPI 0.115.x + Uvicorn
**Port:** 3434 (default, configurable via `PORT` env)

**Poetry-managed packages:** `pyproject.toml` with `[tool.poetry.packages]` for `agent`, `backend`, `genai_tutor`, `rag`, `llm`, `score`, `streamlit_ui`

**Core dependencies:** LangChain, LangGraph, FastAPI, FAISS, rank-bm25, Google Gemini API, OpenAI API, PyTorch, transformers, sentence-transformers, networkx, asyncpg, aio-pika (RabbitMQ), pytesseract, pdfplumber, docling

**API Structure (`/api/` prefix from FastAPI):**

**Chat endpoints (`/api/chat/`):**

| Route | Method | Description |
|---|---|---|
| `/query` | POST | Stateless AI query with optional RAG context |
| `/stream` | POST | Streaming AI query (SSE) |
| `/health` | GET | Health check |

**AI/File endpoints (`/api/ai/`):**

| Route | Method | Description |
|---|---|---|
| `/process-file` | POST | OCR + embeddings for uploaded file |
| `/query-file` | POST | Query file content via vector search |
| `/multi-query` | POST | Multi-query file |
| `/file-status/{user_storage_id}` | GET | Get file processing status |
| `/graph-stats/{user_storage_id}` | GET | Get GraphRAG stats |
| `/extract-entities/{user_storage_id}` | POST | Extract educational entities |
| `/entities/{user_storage_id}` | GET | Get extracted entities |
| `/models` | GET | Get AI model catalog |
| `/clear-cache/{user_storage_id}` | DELETE | Clear retriever cache |

**Generation endpoints (`/api/generate/`):**

| Route | Method | Description |
|---|---|---|
| `/quiz` | POST | Generate quiz questions from file |
| `/flashcards` | POST | Generate flashcards from file |
| `/quiz/{history_id}` | GET | Get generated quiz by history ID |
| `/flashcards/{history_id}` | GET | Get generated flashcards by history ID |

**Tutor endpoints (`/api/tutor/`):**

| Route | Method | Description |
|---|---|---|
| `/ingest` | POST | Create tutor ingestion job |
| `/knowledge-files` | POST | Create tutor knowledge file entry |
| `/knowledge-files` | GET | List tutor knowledge files |
| `/knowledge-files/{file_id}` | GET | Get knowledge file |
| `/knowledge-files/{file_id}/graph` | GET | Get knowledge file graph |
| `/knowledge-files/{file_id}/reprocess` | POST | Reprocess knowledge file |
| `/knowledge-files/bulk-delete` | POST | Bulk delete knowledge files |
| `/knowledge-files/bulk-reprocess` | POST | Bulk reprocess knowledge files |
| `/knowledge-folders` | POST/GET | Create/list knowledge folders |
| `/knowledge-folders/{folder_id}` | PUT/DELETE | Update/delete knowledge folders |
| `/knowledge-folders/{folder_id}/contents` | GET | Get folder contents |
| `/knowledge-stats` | GET | Get knowledge statistics |
| `/ingest/{job_id}` | GET | Get ingest job |
| `/ingest` | GET | List ingest jobs |
| `/graph/job/{job_id}` | GET | Get graph by job |
| `/graph/document/{document_id}` | GET | Get graph by document |
| `/dataset-imports` | POST/GET | Dataset import management |
| `/dataset-imports/catalog` | GET | List dataset catalog |
| `/dataset-imports/states` | GET | List dataset states |
| `/dataset-imports/{job_id}` | GET | Get import job status |
| `/dataset-imports/{job_id}/cancel` | POST | Cancel import job |
| `/dataset-imports/{dataset_key}/clear` | POST | Clear imported dataset |

**Internal modules:**

| Module | Description |
|---|---|
| `src/rag/` | RAG pipeline: vector store, retriever, docling extractor, metadata filter, semantic analyzer, hybrid retrieval, graph RAG |
| `src/llm/` | LLM abstraction: model manager, registry, factory, Gemini client, embeddings, HF chat model, token counter |
| `src/agent/` | LangGraph agents: react graph, supervisor agent, state management |
| `src/genai_tutor/` | Tutor knowledge base: graph extractor, ingestion pipeline, knowledge file worker, code analyzer |
| `src/graph_rag/` | Graph RAG: graph builder, retriever, department graph manager, semantic department detector, subgraph partitioner |
| `src/score/` | Scoring tools: score calculator, student trust score, database models |
| `src/backend/services/` | Business services: entity extraction, generation, graph storage, hybrid retrieval, image preprocessing, OCR, PDF OCR, tutor storage/knowledge storage/dataset import/benchmark |
| `src/streamlit_ui/` | Streamlit UI for testing |
| `src/evaluation/` | Benchmark evaluation: code extraction, pass@k, codebleu, sandboxed execution |
| `src/backend/rabbitmq_consumer.py` | RabbitMQ consumer for async tasks |

**Message queue:** AI Service consumes from RabbitMQ `examio.events` exchange (topic type). On startup, starts async consumer. Tutor knowledge file processing events routed via RabbitMQ.

**AI models used:** Google Gemini (via langchain-google-genai), OpenAI (via langchain-openai), local HuggingFace models. Model registry supports runtime resolution.

---

### 2.7 OCR Service (Hybrid NestJS/Python) (`apps/ocr-service`)

**Role:** PDF OCR processing. NestJS gRPC server + Python FastAPI backend.

**NestJS port:** gRPC only (default 50053)
**Python backend:** http://127.0.0.1:8003

**gRPC (package: `ocr`):**

| Method | Description |
|---|---|
| `ProcessPdf` | Process PDF -> markdown content |
| `HealthCheck` | Health check |

**Files:**

| File | Description |
|---|---|
| `src/main.ts` | NestJS gRPC bootstrap |
| `src/ocr-service.module.ts` | Module definition |
| `src/services/ocr.service.ts` | NestJS OCR service (calls Python backend) |
| `src/api/ocr.grpc.controller.ts` | gRPC controller |
| `src/backend/main.py` | Python FastAPI backend server |
| `requirements.txt` | fastapi, uvicorn, grpcio, pytesseract, pdf2image, opencv-python |

**Python backend uses:** Tesseract OCR with Vietnamese support, pdf2image for PDF-to-image conversion, OpenCV for image preprocessing.

---

## 3. Shared Libraries

### 3.1 `@examio/common` (`libs/common`)

| File | Description |
|---|---|
| `src/index.ts` | Barrel export |
| `src/common.module.ts` | Module definition |
| `src/config/mail.config.ts` | Mail configuration |
| `src/guard/auth.guard.ts` | JWT auth guard (cookie + Bearer) |
| `src/guard/google-auth.guard.ts` | Google OAuth guard |
| `src/guard/optional-auth.guard.ts` | Optional auth (allows unauthenticated) |
| `src/decorators/file-upload.decorator.ts` | File upload decorator |
| `src/dto/authenticated-request.dto.ts` | Authenticated request type |
| `src/interceptors/logging.interceptor.ts` | Request logging |
| `src/middleware/session-validation.middleware.ts` | Session validation |
| `src/repositories/base.repository.ts` | Base repository pattern |
| `src/services/crypto.service.ts` | Encryption utilities |
| `src/services/generate-id.service.ts` | ID generation |
| `src/services/image-preprocessing.service.ts` | Image preprocessing |
| `src/services/mail.service.ts` | Email (nodemailer) |
| `src/services/password.service.ts` | Password hashing (bcryptjs) |
| `src/services/pdf.service.ts` | PDF manipulation (pdf-lib, pdf-parse, pdf2pic) |
| `src/services/recaptcha.service.ts` | reCAPTCHA verification |
| `src/utils/cookie-config.ts` | Cookie configuration utility |
| `src/utils/generate-code.ts` | Code generation |
| `src/utils/prompt.ts` | AI prompt templates |
| `src/utils/sanitize-filename.ts` | Filename sanitization |
| `src/utils/sanitize-user.ts` | User data sanitization |
| `src/events/` | Event system: publisher, subscriber, types, RabbitMQ service |
| `src/grpc/` | gRPC clients module, R2 client service |

### 3.2 `@examio/database` (`libs/database`)

| File | Description |
|---|---|
| `src/database.module.ts` | Module definition |
| `src/database.service.ts` | Database service |
| `src/prisma.service.ts` | Prisma client service |
| `prisma/schema.prisma` | **AUTO-GENERATED** merged schema |
| `prisma/base.prisma` | Base prisma file (generator + datasource) |
| `prisma/models/*.prisma` | Individual model files (merged via prisma-merge) |
| `prisma/seed.ts` | Database seed script |

### 3.3 `@examio/redis` (`libs/redis`)

| File | Description |
|---|---|
| `src/redis.module.ts` | Module definition |
| `src/redis.service.ts` | Redis service (ioredis) |
| `src/redis.config.ts` | Redis configuration |
| `src/constants.ts` | Constants |

---

## 4. gRPC Contracts (Proto Files)

All proto files in `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/protos/`:

| File | Package | Services |
|---|---|---|
| `auth.proto` | `auth` | `AuthService` (ValidateToken, GetUserInfo, CheckPermission) |
| `r2.proto` | `r2` | `R2Service` (UploadFile, GetFileUrl, DeleteFile, ListUserFiles) |
| `ocr.proto` | `ocr` | `OcrService` (ProcessPdf, HealthCheck) |
| `subscription.proto` | `subscription` | `SubscriptionService` (GetUserBenefits) |
| `wallet.proto` | `wallet` | `WalletService` (CreateWallet, GetWallet, UpdateBalance) |

**gRPC port mapping:**

| Service | gRPC Port | Proto Packages |
|---|---|---|
| auth-service | 50051 | auth |
| finance-service | 50053 | wallet, subscription |
| r2-service | 50054 | r2 |
| ocr-service | 50053 | ocr |

---

## 5. Database Schema (Prisma)

**Location:** `/Users/tgiap.dev/devs/examio/examio-be/libs/database/prisma/schema.prisma` (auto-generated from `prisma/models/*.prisma` via prisma-merge)

**Datasource:** PostgreSQL

**Models (grouped by domain):**

### User Domain
- `User` -- Core user (id, email, username, name, avatar, banner, bio, isAdmin, isVerified, password)
- `UserSession` -- Session management (sessionId, refreshToken, deviceId, deviceName, browser, OS, IP, location)
- `VerifyAccountCode` -- Email verification codes
- `ResetPasswordCode` -- Password reset codes
- `UserMonthlyFileUpload` -- Monthly upload tracking for subscription limits

### Finance Domain
- `Wallet` -- User wallet (balance, one-to-one with User)
- `WalletTransaction` -- Transaction history (amount, type, direction ADD/SUBTRACT)
- `Payment` -- Payment records (amount, currency, status, paymentType, SePay VA)
- `UserSubscription` -- Subscription tiers (0=none, 1=basic, 2=advanced, 3=vip)

### Quiz Domain
- `QuizSet` -- Quiz collection (title, tags, public/pinned, labels)
- `QuizSetLabel` -- Quiz set label/organization
- `QuizQuestion` -- Individual question (question text, options array, answer)
- `DetailsQuizQuestion` -- Junction: QuizSet <-> QuizQuestion (with history and label links)
- `QuizPracticeAttempt` -- Quiz practice tracking (type, answers, score, time, marked questions)

### Flashcard Domain
- `FlashCardSet` -- Flashcard collection (title, tags, accessCode, whitelist)
- `FlashCard` -- Individual flashcard (question, answer)
- `DetailsFlashCard` -- Junction: FlashCardSet <-> FlashCard (with history links)

### Exam Domain
- `ExamRoom` -- Exam room (title, description, host, linked to QuizSet)
- `ExamSession` -- Exam session (status, timestamps, assessType, accessCode, whitelist, passingScore, allowRetake)
- `ExamAttempt` -- Exam attempt (score, answers, currentIndex, markedQuestions, violationCount, status)
- `CheatingLog` -- Cheating violations per attempt+type (TAB_SWITCH, WINDOW_BLUR, DEVTOOLS_OPEN, etc.)

### AI Domain
- `AIChat` -- AI chat sessions
- `AIChatMessage` -- Chat messages (role, content, imageUrl, document references)
- `AIChatDocument` -- Junction: AIChat <-> UserStorage for multi-document support

### History Domain
- `HistoryGeneratedQuizz` -- Saved quiz generation history (quizzes JSON, linked to UserStorage)
- `HistoryGeneratedFlashcard` -- Saved flashcard generation history (flashcards JSON, linked to UserStorage)

### Storage Domain
- `UserStorage` -- File storage metadata (filename, url, mimetype, size, keyR2, processingStatus, creditCharged)
- `Document` -- OCR-processed document chunks (pageRange, title, content, embeddings vector)

**Index patterns:** Composite indexes on userId+updatedAt, accessCode, refreshToken, userId+isActive, userId+deviceId, etc.

---

## 6. Message Queue (RabbitMQ)

**Library (NestJS):** `amqp-connection-manager` + `amqplib` (NestJS services)
**Library (Python):** `aio-pika` (AI service)

**Exchange:** `examio.events` (topic exchange, durable)

**Event types (`libs/common/src/events/event-types.ts`):**

| Event | Description |
|---|---|
| `user.created` | New user registered |
| `user.updated` | User updated |
| `user.deleted` | User deleted |
| `user.verified` | User verified |
| `payment.success` | Payment completed |
| `payment.failed` | Payment failed |
| `wallet.created` | Wallet created |
| `wallet.updated` | Wallet updated |
| `subscription.activated` | Subscription activated |
| `subscription.expired` | Subscription expired |
| `exam.created` | Exam created |
| `exam.started` | Exam started |
| `exam.submitted` | Exam submitted |
| `ocr.requested` | OCR processing requested |
| `ocr.completed` | OCR processing completed |
| `ocr.failed` | OCR processing failed |

**Known consumers:**
- AI Service `rabbitmq_consumer.py` -- Listens for tutor knowledge file processing requests
- AI Service startup -- Starts async consumer if `RABBITMQ_URL` is set

---

## 7. Authentication / Authorization

**Strategy:** JWT-based auth with cookie-first, Bearer fallback

**Auth flow:**
1. Login/Register -> JWT token issued -> Set in httpOnly cookies (`token`, `accessToken`, `refreshToken`, `session_id`)
2. Subsequent requests: Cookie parsed by `AuthGuard` (higher priority) or Bearer token (`Authorization: Bearer <jwt>`)
3. `AuthGuard` (in `@examio/common`) verifies JWT, loads user from DB, attaches `request.user`

**OAuth:** Google OAuth2 via passport-google-oauth20 with One Tap support

**Refresh token:** Long-lived refresh token stored in `UserSession` table. `POST /auth/refresh` issues new access token.

**Password:** bcryptjs hashing

**Session management:**
- Device tracking with `x-device-id` header
- Session cleanup cron job (auth-service)
- Session deactivation on logout
- Maximum active sessions per device

**Authorization model:**
- Simple role-based: `isAdmin` flag on User
- gRPC `CheckPermission` for service-to-service auth
- Ownership checks in service layer

---

## 8. AI Integration Points

### AI Service (Python FastAPI -- port 3434)

**Integration with NestJS:**
- NestJS exam-service calls AI Service via HTTP for: file processing, chat queries, content generation
- AI Service shares PostgreSQL database with NestJS (reads/writes to `Document`, `UserStorage`, `HistoryGeneratedQuizz`, `HistoryGeneratedFlashcard` tables)
- RabbitMQ for async processing (tutor knowledge files)

**AI Capabilities:**

| Capability | Implementation |
|---|---|
| RAG (Retrieval-Augmented Generation) | Hybrid retrieval: vector similarity (FAISS/PG vector) + BM25 + GraphRAG entities |
| Content Generation | LangChain-based quiz/flashcard generation from document chunks |
| OCR | pdfplumber (text PDFs) + pytesseract (scanned) + docling (advanced) |
| Vector Search | FAISS in-memory + PostgreSQL vector store |
| GraphRAG | NetworkX-based entity-relationship graphs, department detection, subgraph partitioning |
| AI Tutoring | LangGraph supervisor agent with knowledge base |
| Model Management | Runtime model registry (local HF, Gemini, OpenAI) |
| Code Evaluation | Sandboxed execution with pass@k, CodeBLEU metrics |
| Streaming | Server-Sent Events (SSE) for real-time chat responses |

**Model Pipeline:**
1. User uploads file -> NestJS saves to R2 via gRPC
2. NestJS creates `UserStorage` record (status=PENDING)
3. NestJS calls AI Service `POST /api/ai/process-file`
4. AI Service downloads from R2, runs OCR -> chunks -> embeddings -> saves to DB
5. Status updated to COMPLETED
6. User can query file, generate quizzes/flashcards, or chat with AI context

### GenAI Tutor Pipeline:
1. Teacher uploads knowledge files -> AI Service creates knowledge file entries
2. Knowledge files processed: chunked -> embedded -> graph extracted -> stored
3. Students can query the knowledge base via LangGraph supervisor agent

---

## 9. File Upload & Storage Flow

1. Client uploads file to gateway (`POST /api/v1/ai/quick-upload` or `POST /api/v1/ai/upload`)
2. Gateway forwards to exam-service (multipart)
3. Exam-service uploads file to R2 via gRPC (`R2Service.UploadFile`)
4. Exam-service creates `UserStorage` record in DB
5. Exam-service calls AI Service `POST /api/ai/process-file` (if synchronous) or queues via RabbitMQ
6. AI Service processes: OCR -> chunking -> embeddings -> `Document` records in DB
7. Status updated on `UserStorage.processingStatus`

---

## 10. Docker & Deployment

**Dockerfile:** Multi-stage build (base -> deps -> builder -> prod-deps -> runner)
- Base: `node:20-alpine`
- Build arg: `SERVICE_NAME` (chooses which NestJS service to build)
- Build arg: `ENABLE_OCR` (optionally installs Tesseract + ghostscript + poppler)
- Production Prisma migration: `prisma migrate deploy`
- Health check: `wget http://localhost:3000/api/v1/health`

**Docker Compose:** Single-file `docker-compose.example.yml` running gateway on port 6369:80

---

## 11. API Route Summary (Complete)

All routes prefixed with `/api/v1/`.

### Gateway (`examio-be:3000`)

| Route | Internal Target |
|---|---|
| `GET /health` | Gateway itself |
| `GET /status` | Gateway itself |
| `GET /api` | Swagger UI |
| `/api/v1/auth/*` | auth-service:3001 |
| `/api/v1/quizsets/*` | exam-service:3002 |
| `/api/v1/flashcardsets/*` | exam-service |
| `/api/v1/examrooms/*` | exam-service |
| `/api/v1/examsessions/*` | exam-service |
| `/api/v1/examattempts/*` | exam-service |
| `/api/v1/subjects/*` | exam-service |
| `/api/v1/ai/*` | exam-service |
| `/api/v1/student/*` | exam-service |
| `/api/v1/r2/*` | exam-service |
| `/api/v1/wallet/*` | finance-service:3003 |
| `/api/v1/payment/*` | finance-service |
| `/api/v1/webhook/*` | finance-service |

### Auth Service (`auth-service:3001`)

| Route | Auth |
|---|---|
| `POST /auth/register` | Public |
| `POST /auth/login` | Public |
| `POST /auth/logout` | Auth |
| `POST /auth/refresh` | Public |
| `GET /auth/me` | Auth |
| `POST /auth/sendVerificationEmail` | Auth |
| `POST /auth/verifyAccount` | Auth |
| `POST /auth/send-code-reset-password` | Public |
| `POST /auth/reset-password` | Public |
| `POST /auth/send-code-change-password` | Auth |
| `POST /auth/change-password` | Auth |
| `GET /auth/google` | Public (OAuth) |
| `POST /auth/google/one-tap` | Public (One Tap) |
| `GET /auth/google/callback` | Public (OAuth callback) |
| `POST /auth/sync-refresh-token` | Auth |
| `GET /profile/*` | Auth |

### Exam Service (`exam-service:3002`)

| Route | Auth |
|---|---|
| `POST /quizsets`, `GET /quizsets`, `GET /quizsets/:id` | Auth (some public) |
| `PUT /quizsets/:id`, `DELETE /quizsets/:id` | Auth |
| `GET/POST /quizsets/:id/questions` | Auth |
| `POST /quizsets/:id/questions/:qId/label` | Auth |
| `GET/POST /flashcardsets` | Auth |
| `GET/PUT/DELETE /flashcardsets/:id` | Auth |
| `POST /flashcardsets/:id/flashcards` | Auth |
| `POST /examrooms`, `GET /examrooms` | Auth |
| `POST /examsessions` | Auth |
| `GET /examsessions` | Auth |
| `PUT /examsessions/:id` | Auth |
| `POST /examsessions/:id/start` | Auth |
| `POST /examsessions/:id/verify-code` | Public (access code) |
| `POST /examsessions/:id/sharing` | Auth |
| `POST/PUT /examattempts` | Auth |
| `POST /ai/quick-upload` | Auth |
| `POST /ai/generate-from-file` | Auth |
| `POST /ai/upload` | Auth |
| `POST /ai/upload-image` | Auth |
| `GET /ai/recent-uploads` | Auth |
| `GET /ai/models` | Auth |
| `GET /ai/upload/:uploadId` | Auth |
| `DELETE /ai/upload/:uploadId` | Auth |
| `POST /ai/regenerate/:uploadId` | Auth |
| `GET /ai/job/:jobId` | Auth |
| `DELETE /ai/job/:jobId` | Auth |
| `GET /ai/upload/:uploadId/history` | Auth |
| `POST /ai/tutor/ingest` | Auth |
| `POST /ai/tutor/knowledge-files` | Auth |
| `POST /ai/tutor/knowledge-folders` | Auth |
| `PUT/DELETE /ai/tutor/knowledge-folders/:folderId` | Auth |
| `GET /ai/tutor/knowledge-folders` | Auth |
| `GET /ai/tutor/knowledge-stats` | Auth |
| `GET /ai/tutor/knowledge-files` | Auth |
| `GET /ai/tutor/knowledge-files/search` | Auth |
| `GET /ai/tutor/knowledge-files/:fileId/graph` | Auth |
| `POST /ai/tutor/knowledge-files/bulk-delete` | Auth |
| `POST /ai/tutor/knowledge-files/bulk-reprocess` | Auth |
| `POST /ai/tutor/dataset-imports` | Auth |
| `GET /ai/tutor/dataset-imports` | Auth |
| `GET /ai/tutor/dataset-imports/catalog` | Auth |
| `GET /ai/tutor/dataset-imports/:jobId` | Auth |
| `POST /ai/tutor/dataset-imports/:jobId/cancel` | Auth |
| `POST /ai/tutor/dataset-imports/:datasetKey/clear` | Auth |
| `GET /ai/tutor/ingest` | Auth |
| `GET /ai/tutor/ingest/:jobId` | Auth |
| `POST /cheatinglog` | Auth |
| `POST /examsessions/:id/join` | Public/Code |
| `POST /flashcard-study/progress` | Auth |
| `POST /flashcard-study/submit-answer` | Auth |
| `GET /subjects` | Public |
| `POST /r2/*` | Auth |

### Finance Service (`finance-service:3003`)

| Route | Auth |
|---|---|
| `GET /wallet/info` | Auth |
| `GET /wallet/details` | Auth |
| `POST /payment/create` | Auth |
| `GET /payment/status/:paymentId` | Auth |
| `GET /payment/history` | Auth |
| `DELETE /payment/cancel/:paymentId` | Auth |
| `POST /webhook/sepay` | API Key (SePay) |

### AI Service (Python FastAPI -- port 3434)

| Route | Method |
|---|---|
| `/` | Health check |
| `/health` | Health check |
| `/api/chat/query` | POST |
| `/api/chat/stream` | POST |
| `/api/chat/health` | GET |
| `/api/ai/process-file` | POST |
| `/api/ai/query-file` | POST |
| `/api/ai/multi-query` | POST |
| `/api/ai/file-status/{id}` | GET |
| `/api/ai/models` | GET |
| `/api/ai/graph-stats/{id}` | GET |
| `/api/ai/extract-entities/{id}` | POST |
| `/api/ai/entities/{id}` | GET |
| `/api/ai/clear-cache/{id}` | DELETE |
| `/api/generate/quiz` | POST |
| `/api/generate/flashcards` | POST |
| `/api/generate/quiz/{history_id}` | GET |
| `/api/generate/flashcards/{history_id}` | GET |
| `/api/tutor/*` | Various |

---

## 12. Key Observations for Wave 0

1. **Monorepo complexity:** 9 NestJS projects + 2 Python services in one `nest-cli.json`. Build cache optimization is critical.

2. **gRPC inter-service coupling:** auth-service provides JWT validation via gRPC (port 50051). All services depend on this. r2-service (port 50054) is the file storage backbone.

3. **AI Service dual-dependencies:** Python AI service reads/writes the same PostgreSQL database as NestJS services (`UserStorage`, `Document`, `HistoryGenerated*` tables). This creates implicit coupling.

4. **Shared auth library:** `@examio/common` is the most critical shared lib -- used by gateway, auth, exam, and finance services.

5. **Prisma merge workflow:** Individual `.prisma` model files under `prisma/models/` are merged into `schema.prisma` via `prisma-merge` before generation. Model files exist in both `prisma/models/` and `src/models/` (duplicates).

6. **Config duplication:** Each service has its own `.env` file and `tsconfig.app.json`.

7. **No dedicated message broker other than RabbitMQ** for events. Redis is used for caching only.

8. **No API versioning** beyond `/api/v1` prefix.

9. **Rate limiting** implemented at gateway level via `@nestjs/throttler` (100 req/min).

10. **Templates directory** at root `templates/` used for email templates (referenced in auth-service and exam-service `nest-cli.json` asset config).
