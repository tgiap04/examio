# KMAEdu Full-Stack Scout Report

> Generated: 2026-05-27
> Scope: kmaedu-be, kmaedu-fe, kmaedu-app

## Executive Summary

KMAEdu is a multi-workspace platform with a NestJS/Python backend, React/Vite web frontend, and Kotlin Multiplatform mobile app. The backend exposes gateway-backed REST APIs, gRPC service contracts, RabbitMQ events, Prisma/PostgreSQL persistence, R2 storage, and Python AI/OCR services. The web frontend consumes gateway APIs through Axios/Zustand and implements most production flows. The mobile app has real shared KMP API/repository layers, while most platform UI screens remain mock-data backed except auth.

## Backend Scout

# Backend Codebase Scout Report -- KMAEdu

> Generated: 2026-05-27
> Root: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/`

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

**Message queue:** AI Service consumes from RabbitMQ `kmaedu.events` exchange (topic type). On startup, starts async consumer. Tutor knowledge file processing events routed via RabbitMQ.

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

### 3.1 `@kmaedu/common` (`libs/common`)

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

### 3.2 `@kmaedu/database` (`libs/database`)

| File | Description |
|---|---|
| `src/database.module.ts` | Module definition |
| `src/database.service.ts` | Database service |
| `src/prisma.service.ts` | Prisma client service |
| `prisma/schema.prisma` | **AUTO-GENERATED** merged schema |
| `prisma/base.prisma` | Base prisma file (generator + datasource) |
| `prisma/models/*.prisma` | Individual model files (merged via prisma-merge) |
| `prisma/seed.ts` | Database seed script |

### 3.3 `@kmaedu/redis` (`libs/redis`)

| File | Description |
|---|---|
| `src/redis.module.ts` | Module definition |
| `src/redis.service.ts` | Redis service (ioredis) |
| `src/redis.config.ts` | Redis configuration |
| `src/constants.ts` | Constants |

---

## 4. gRPC Contracts (Proto Files)

All proto files in `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/protos/`:

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

**Location:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/prisma/schema.prisma` (auto-generated from `prisma/models/*.prisma` via prisma-merge)

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

**Exchange:** `kmaedu.events` (topic exchange, durable)

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
3. `AuthGuard` (in `@kmaedu/common`) verifies JWT, loads user from DB, attaches `request.user`

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

### Gateway (`kmaedu-be:3000`)

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

4. **Shared auth library:** `@kmaedu/common` is the most critical shared lib -- used by gateway, auth, exam, and finance services.

5. **Prisma merge workflow:** Individual `.prisma` model files under `prisma/models/` are merged into `schema.prisma` via `prisma-merge` before generation. Model files exist in both `prisma/models/` and `src/models/` (duplicates).

6. **Config duplication:** Each service has its own `.env` file and `tsconfig.app.json`.

7. **No dedicated message broker other than RabbitMQ** for events. Redis is used for caching only.

8. **No API versioning** beyond `/api/v1` prefix.

9. **Rate limiting** implemented at gateway level via `@nestjs/throttler` (100 req/min).

10. **Templates directory** at root `templates/` used for email templates (referenced in auth-service and exam-service `nest-cli.json` asset config).

## Frontend Scout

# Frontend Scout Report: kmaedu-fe

**Project**: kmaedu-fe (React 19 + Vite + TypeScript + Yarn 4)
**Date**: 2026-05-27
**Path**: `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/`

---

## 1. Architecture Overview

- **Framework**: Vite 7 + React 19 + TypeScript 5.9
- **Package Manager**: Yarn 4.9.2
- **Routing**: React Router DOM v7.9.3 (createBrowserRouter)
- **HTTP Client**: Axios 1.12 with interceptors for auth token injection + refresh
- **State**: Zustand 5 (11 stores)
- **Styling**: Tailwind CSS v4 + Ant Design v6.3.7 + custom CSS
- **Entry**: `src/main.tsx` -> wraps App in `AppProviders` -> `App.tsx` renders `RouterProvider`

---

## 2. Directory Structure

```
src/
  apis/          23 files (Axios API clients)
  app/           1 file (GenAI Knowledge page)
  components/    120+ files (atoms/molecules/organisms)
  hooks/         6 files
  lib/           15 files
  pages/         25 files (page-level components)
  provider/      3 files
  routes/        5 files
  stores/        11 files (Zustand)
  templates/     10 files
  types/         8 files
```

---

## 3. Pages & Routes

### Route Definition: `src/routes/index.tsx`

React Router v7 flat route config using `createBrowserRouter`. Each route wraps its page component in a layout and optional guard.

### Route Guards

| File | Purpose |
|---|---|
| `src/routes/guards/ProtectedRoute.tsx` | Redirects to `/login` if `isAuthenticated === false`. Shows loading state while `initializing`. Stores return path via `setRedirectBackTarget`. |
| `src/routes/guards/PublicRoute.tsx` | Redirects to `/k` if already authenticated. |
| `src/routes/guards/TeacherRoute.tsx` | Checks `isAuthenticated` but does NOT check teacher role (incomplete). Redirects to `/login` if not auth'd. |

### Route Layouts

| File | Description |
|---|---|
| `src/routes/layouts/PublicLayout.tsx` | Header + Footer + GoogleOneTap for landing pages |
| `src/routes/layouts/AuthLayout.tsx` | Minimal wrapper (empty div) for auth forms |
| `src/routes/layouts/KLayout.tsx` | Authenticated workspace layout with sidebar, header, search bar, theme toggle, verification banner, pending job dialog |

### Route Table

| Path | Page | Guard | Layout |
|---|---|---|---|
| `/` | `HomePage` | None | PublicLayout |
| `/about` | `AboutPage` | None | PublicLayout |
| `/contact` | `ContactPage` | None | PublicLayout |
| `/terms` | `TermsPage` | None | PublicLayout |
| `/privacy` | `PrivacyPage` | None | PublicLayout |
| `/cookies` | `CookiesPage` | None | PublicLayout |
| `/security` | `SecurityPage` | None | PublicLayout |
| `/login` | `LoginPage` | PublicRoute | AuthLayout |
| `/register` | `RegisterPage` | PublicRoute | AuthLayout |
| `/forgot-password` | `ForgotPasswordPage` | PublicRoute | AuthLayout |
| `/reset-password` | `ResetPasswordPage` | PublicRoute | AuthLayout |
| `/k` | `KRootRedirect` | ProtectedRoute | KLayout |
| `/k/profile` | `ProfilePage` | ProtectedRoute | KLayout |
| `/k/verify` | `VerifyPage` | ProtectedRoute | KLayout |
| `/k/subscription` | `SubscriptionPage` | ProtectedRoute | KLayout |
| `/k/my-materials` | `MyMaterialsPage` | ProtectedRoute | KLayout |
| `/k/flash-card` | `FlashcardsPage` | ProtectedRoute | KLayout |
| `/k/history` | `HistoryPage` | ProtectedRoute | KLayout |
| `/k/history/exam` | `ExamHistoryPage` | ProtectedRoute | KLayout |
| `/k/history/pdf` | `PDFHistoryPage` | ProtectedRoute | KLayout |
| `/k/manage-exam` | `ManageExamPage` | ProtectedRoute | KLayout |
| `/k/manage-quiz-set/:id` | `ManageQuizSetDetailPage` | ProtectedRoute | KLayout |
| `/k/manage-flashcard-set/:id` | `ManageFlashcardSetDetailPage` | ProtectedRoute | KLayout |
| `/k/ai-tool` | `AIToolPage` | ProtectedRoute | KLayout |
| `/k/genai-knowledge` | `GenAIKnowledgePage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room` | `ManageExamRoomPage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room/:id` | `ManageExamRoomDetailPage` | ProtectedRoute | KLayout |
| `/k/manage-exam-room/:id/session/:sessionId` | `ExamRoomSessionAnalyticsPage` | ProtectedRoute | KLayout |
| `/k/my-exams` | `MyExamsPage` | ProtectedRoute | KLayout |
| `/study-flashcard/:id` | `FlashcardStudyPage` | None | None (standalone) |
| `/exam-session/:id` | `ExamSessionPage` | None | None (standalone) |
| `/exam-session/:id/quiz` | `ExamQuizPage` | None | None (standalone) |

**Note**: The study/exam-session routes have NO auth guard -- they handle their own access control via API-level checks.

---

## 4. API Clients (`src/apis/`)

### Base Configuration (`src/apis/api.ts`)

- Axios instance created with `baseURL` from `env.apiUrl`, `withCredentials: true`
- **Request interceptor**: Injects `Bearer {auth_token}` from `localStorage`; adds `X-Device-ID` header
- **Response interceptor**: On 401, attempts token refresh via `POST /auth/refresh`. If refresh fails, calls `handleAuthFailure()` which clears tokens and redirects to `/login`. Handles special error codes: `SESSION_INVALIDATED`, `SESSION_EXPIRED`, `MODEL_UNAVAILABLE`, `MODEL_INSUFFICIENT_VRAM`, `MODEL_RUNTIME_ERROR`.

### API Endpoints (23 files)

| File | Base Endpoint | Purpose |
|---|---|---|
| `authApi.ts` | `/auth/*` | Login, register, logout, refresh, verify, change password, sync-refresh-token |
| `subjectApi.ts` | `/subjects/*` | Subject categories, flat subjects list |
| `examApi.ts` | `/ai/generate-from-file` | AI exam generation from PDF (multipart form upload) |
| `examRoomApi.ts` | `/examrooms/*` | CRUD exam rooms, sessions list, available labels |
| `examSessionApi.ts` | `/examsessions/*` | CRUD exam sessions, access control, sharing settings, stats |
| `examAttemptApi.ts` | `/examattempts/*` | Start/resume/submit attempts, progress update, secure quiz (encrypted), owner listing |
| `flashcardSetApi.ts` | `/flashcardsets/*` | CRUD flashcard sets + flashcards + labels, sharing, access control, search users |
| `flashcardStudyApi.ts` | `/flashcard-study/*` | Spaced repetition study sessions, progress tracking, review cards |
| `quizsetApi.ts` | `/quizsets/*` | CRUD quiz sets + questions + labels, save from history |
| `aiApi.ts` | `/ai/*` | AI models catalog, file uploads, regenerate, job status polling, cancel |
| `aiChatApi.ts` | `/ai-chat/*` | Chat CRUD, messages, streaming (SSE), image upload, multi-document support |
| `virtualTeacherApi.ts` | `/virtual-teacher/*` | Legacy virtual teacher chat + file upload + quick upload |
| `genaiTutorKnowledgeApi.ts` | `/ai/tutor/knowledge-*` | GenAI knowledge base: folders, files, stats, dataset imports, graph, bulk operations |
| `historyApi.ts` | `/examattempts/history-stats`, `/ai/recent-uploads` | History stats, PDF history, exam history |
| `studentMaterialsApi.ts` | `/student/*` | Recent flashcards/exams, pin/unpin, share links |
| `profileApi.ts` | `/profile/*` | User profile CRUD, avatar/banner upload to R2 |
| `subscriptionApi.ts` | `/wallet/*`, `/payment/*` | Wallet details, payment creation (QR), subscription plans, payment status |
| `mediaApi.ts` | `/r2/image` | Generic R2 image upload |
| `devicesApi.ts` | `/devices/*` | List/logout devices |
| `cheatingLogApi.ts` | `/cheatinglogs/*` | Log violations, get logs/stats, user attempts with logs |

**Backend services consumed**: A single backend service at `VITE_API_URL=/api/v1` (proxy). Endpoints follow RESTful patterns with pagination. Notable: exam generation uses async job queue with polling (`/ai/job/:id`).

---

## 5. State Management (`src/stores/`)

11 Zustand stores, all created with `create()`:

| Store | State Slice | Purpose |
|---|---|---|
| `useAuthStore` | `user`, `isAuthenticated`, `loading`, `initializing` | Auth lifecycle: login, signup, logout, getUser, refreshSession, verify, Google OAuth redirect |
| `useExamRoomStore` | `examRooms`, `currentExamRoom`, `loading`, `error` | CRUD exam rooms with `storeCache` |
| `useExamRoomDetailStore` | `sessions`, loading states | Sessions under an exam room with `storeCache` |
| `useExamSessionStore` | `examSessions`, `currentExamSession` | CRUD exam sessions with `storeCache` |
| `useQuizSetStore` | `quizSetsK`, `currentQuizSet`, `loading` | CRUD quiz sets + questions + labels with `storeCache` |
| `useFlashcardSetStore` | `flashcardSetsK`, `currentFlashcardSet` | CRUD flashcard sets + flashcards with `storeCache` |
| `useAIGeneratorStore` | 3 sub-stores: `useJobStore`, `useTestGeneratorStore`, `useFlashcardGeneratorStore`, `useRecentUploadsStore` | AI generation orchestration: job queue polling, file management, credit checking, cross-store sync |
| `useAITeacherStore` | Extensive chat state, subjects, streaming, TTS, files | AI teacher chat with SSE streaming, voice TTS, document attachments |
| `useAIModelCatalogStore` | `catalog`, `generationModels`, `defaultModel` | Lazy-loads AI model catalog from `/ai/models` |
| `useStatsStore` | `flashcardStats`, `quizStats` | Dashboard stats (fetched with raw fetch, not axios) |
| `useStudentMaterialsStore` | Paginated caches for flashcards + exams | Recent student materials with page-based cache |
| `useGenAIKnowledgeStore` | `folders`, `files`, `hydrated` | Knowledge base manager state with localStorage persistence |

**Cache layer**: Custom `storeCache` (`src/lib/storeCache.ts`) -- in-memory Map with TTL-based expiry. Used by most stores to reduce redundant API calls. Cache keys are parameter-prefix strings. Invalidated on mutations.

---

## 6. Auth Strategy

### Token Storage
- `auth_token` in `localStorage` + duplicate cookie (`token`) for SSR/browser refresh compatibility
- `refresh_token` in `localStorage`
- `session_id` in `localStorage`
- The `useAuthSync` hook (`src/hooks/useAuthSync.ts`) bootstraps auth on mount:
   1. Reads `token`, `refreshToken`, `sessionId` from URL query params (OAuth redirect)
   2. Strips them from URL via `history.replaceState`
   3. Calls `getUser()` if token exists
   4. Auto-syncs `refresh_token` from server if absent but `session_id` exists

### OAuth Flow
- **Google OAuth**: `loginWithGoogle()` in `useAuthStore` redirects to `{apiUrl}/auth/google?redirect={encodedPath}`. On return, the backend redirects back with `token`, `refreshToken`, `sessionId` as URL query params, which the `useAuthSync` hook captures.
- **Google One Tap**: `GoogleOneTap` component rendered in `PublicLayout`.

### Token Refresh
- Axios response interceptor catches 401, calls `POST /auth/refresh` with stored refresh token
- If no `refresh_token` but `session_id` exists, calls `syncRefreshTokenApi(sessionId)` to retrieve it
- Singleton promise pattern prevents concurrent refresh attempts
- On final failure: calls `handleAuthFailure()` which clears all tokens and redirects to `/login`

### reCAPTCHA
- `ReCaptchaProvider` wraps the app using `react-google-recaptcha-v3`
- reCAPTCHA tokens are passed to backend exam submission endpoints

---

## 7. Providers (`src/provider/`)

| File | Order in Tree | Purpose |
|---|---|---|
| `ReCaptchaProvider.tsx` | Outermost | Google reCAPTCHA v3 |
| `ThemeProvider.tsx` | 2nd | `next-themes` wrapper with `useThemeContext()` hook exposing `isDarkMode` |
| `AppProviders.tsx` | Composes all | Wraps app in: ReCaptcha > ThemeProvider > AntdConfigProvider > ToastProvider > AuthSyncBootstrap > GoogleAnalytics |
| `AntdConfigProvider.tsx` | Inside ThemeProvider | Dynamic Ant Design theme (dark/light), custom colors (primary: `#cc785c`) |

---

## 8. Type System (`src/types/`)

| File | Key Types |
|---|---|
| `user.ts` | `User` (id, username, email, avatar, wallet balance, isAdmin, isVerified) |
| `exam.ts` | `Quizz`, `Flashcard`, `TypeResultGenerateExam` enum |
| `examSession.ts` | `ExamSession`, `EXAM_SESSION_STATUS` enum, `ASSESS_TYPE`, `QUESTION_SELECTION_MODE`, `LabelQuestionConfig`, `AccessCheckResult`, `ExamSessionPublicInfo`, `SharingSettings` |
| `examRoom.ts` | `ExamRoom`, `ExamSessionBasic` |
| `flashcardSet.ts` | `FlashcardSet`, `Flashcard`, `FlashcardStudySession`, `FlashcardSetProgress`, access/sharing types |
| `quizset.ts` | `QuizSet`, `Quizz` (with id), `QuizSetLabel`, `LastAttemptInfo` |
| `ai.ts` | `AIModel`, `AIModelCatalog` (embedding + generation models), `AIModelType`, `DEFAULT_AI_MODEL` |
| `genai-knowledge.ts` | `GenAIKnowledgeFolder`, `GenAIKnowledgeFile`, `GenAIKnowledgeGraphSnapshot`, dataset import types |

---

## 9. Component Architecture (`src/components/`)

Organized by atomic design pattern (atoms/molecules/organisms) with feature sub-directories:

### Atoms (~26 files)
- **Generic**: `GlassBackground`, `ProfileDropdown`, `ClientOnly`, `Logo`, `ModelSelector`
- **k/ (workspace)**: `ProgressCircle`, `DifficultyBadge`, `FlipCard`, `CountdownTimer`, `FloatingDock`, `UserAvatar`, `CardActionsMenu`, `SecureBadge`, `ConnectionStatus`, `NotificationBadge`, `ExamStatusBadge`, `FormSelectFlashcardSet`, `FormSelectQuizSet`, `SystemCheckItem`, etc.
- **subscription/**: `CreditPackageCard`
- **ui shims**: `not-found`, `input` (custom shim), card, button, dialog, etc.
- **antd/**: Wrapped/re-exported Ant Design components (button, dialog, select, etc.) for consistent styling
- **magicui/**: `highlighter`, `sparkles-text` (eye candy)
- **kokonutui/**: Brand logo icons (DeepSeek, Mistral, Gemini, OpenAI, Anthropic)

### Molecules (~36 files)
- **Generic**: `RichTextViewer`, `RichTextEditor`, `StandardMarkdownRenderer`, `SearchBar`, `LabelSelector`, `FilterSelect`, `HeaderSection`, `PostCard`
- **k/**: `ExamMetricCard`, `TrendingTopicItem`, `StatCard`, `HistoryStatCard`, `ExamHistoryListItem`, `PDFHistoryListItem`, `ExamRoomCardItem`, `ChatInputBar`, `ConversationItem`, `NotificationItem`, `RoomInfoRow`, `ChatHistoryCard`, `RoomStatsCard`, etc.
- **profile/**: `ProfileForm`, `DeviceList`, `ChangePasswordSection`
- **subscription/**: `UsageBreakdownCard`, `SubscriptionPlanCard`, `CreditSlider`, `TransactionHistoryTable`, `CreditStatisticsCard`

### Organisms (~56 files)
- **Generic**: `ConfirmDialog`, `DeleteConfirmDialog`, `FullscreenConfirmDialog`, `ImageUrlDialog`, `PendingJobDialog`, `TableSkeletonLoader`
- **landing/**: `HeroBand`, `FeatureGrid`, `PricingCards`, `PricingBand`, `WaysToStudy`, `TrustStrip`, `ProductShowcase`, `CoralCallout`, `LegalPageShell`
- **auth/**: `auth-layout-shell`, `signin-form`, `signup-form`
- **subscription/**: `QRPaymentDialog`
- **k/**: `SideBar`, `ExamTable`, `ExamTablePagination`, `FlashcardTable`, `FlashcardSearchFilterBar`, `FlashcardGenerator`, `TestGenerator`, `PostsList`, `ConversationList`, `NotificationList`, `NotificationFilterSidebar`, `CategoriesSidebar`, `TrendingSidebar`, `SettingsSidebar`, `ThemeSettingsSection`, `InterfaceSettingsSection`, `UpcomingExamsSection`, `RecentActivitySection`, `QuickTasksSection`, `TopContributors`, `NeedHelpSection`, etc.
- **k/genai-knowledge/**: `KnowledgeFolderList`, `KnowledgeFileGrid`, `KnowledgeUploadZone`, `KnowledgeStatsCards`, `KnowledgeFilterBar`, `KnowledgeFolderDialog`, `KnowledgeGraphDialog`, `KnowledgeDatasetImportDialog`, `KnowledgePendingUploadList`
- **Modals**: `QuizSetModal`, `FlashcardSetModal`, `ExamRoomModal`, `ExamSessionFormModal`, `ShareFlashcardModal`, `QuestionEditorDialog`, `FlashcardEditorDialog`, `FlashcardLabelManager`, `PracticeSettingsModal`, `RecentFilesModal`

### Templates (~10 files)
Page-level composition components: `HistoryTemplate`, `ExamRoomManagementTemplate`, `ExamRoomDetailTemplate`, `ExamManagementTemplate`, `ProfileTemplate`, `SettingsTemplate`, `SubscriptionTemplate`, `NotificationTemplate`, `FlashcardManagementTemplate`

These serve as the bridge between page components and organisms.

---

## 10. Hooks (`src/hooks/`)

| File | Purpose |
|---|---|
| `useAuthSync.ts` | Auth bootstrap: captures OAuth redirect params, syncs token to cookie, initializes getUser |
| `useCheatingDetection.ts` | Exam proctoring: detects tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, print screen. Logs violations to API. |
| `useDebounce.ts` | Generic debounce with configurable delay |
| `useExportPDF.ts` | Dynamic jsPDF export for quiz sets and flashcard sets |
| `useGenerationGuard.ts` | `beforeunload` guard during AI generation + visibility/network change handlers |
| `useMediaQuery.ts` | SSR-safe media query hook with Tailwind breakpoint presets (`useIsMobile`, `useIsDesktop`, etc.) |

---

## 11. Lib Utilities (`src/lib/`)

| File | Purpose |
|---|---|
| `env.ts` | Reads env vars from `import.meta.env` (Vite) or `process.env` (legacy). Keys: `apiUrl`, `recaptchaSiteKey`, `measurementId`, `quizAesKey`, `genAITutorAllowedEmails` |
| `storeCache.ts` | In-memory cache manager for Zustand stores (Map-based, TTL support) |
| `creditUtils.ts` | Credit cost calculation (OCR, generation). Has `FREE_MODE = true` flag that bypasses all balance checks. |
| `authRedirect.ts` | `setRedirectBackTarget` / `getRedirectBackTarget` / `clearRedirectBackTarget` for post-login redirect |
| `navigation.ts` | `navigateTo` wrapper around React Router |
| `crypto.ts` | AES encryption/decryption (likely for quiz answer encryption) |
| `deviceId.ts` | `getOrCreateDeviceId` -- generates/persists unique device fingerprint |
| `secureQuizHelpers.ts` | Helpers for secure quiz flow (encrypted answers with JWT) |
| `quizAnswerUtils.ts` | Quiz answer processing utilities |
| `pdfUtils.ts` | PDF-related utilities |
| `text.ts` | Text processing utilities |
| `utils.ts` | General utilities |
| `genai-knowledge-cache.ts` | Cache utilities for GenAI knowledge API calls |
| `genai-knowledge-access.ts` | Access control for GenAI knowledge manager feature |

---

## 12. Third-Party Integrations

| Library | Version | Usage |
|---|---|---|
| **React** | 19.1.0 | Framework |
| **React Router DOM** | 7.9.3 | Client-side routing |
| **Axios** | 1.12.2 | HTTP client with interceptors |
| **Zustand** | 5.0.8 | State management |
| **Ant Design (antd)** | 6.3.7 | UI component library (modals, tables, forms, selects, etc.) |
| **Tailwind CSS** | 4 | Utility CSS framework |
| **Framer Motion / Motion** | 12.23.22 | Animation library |
| **Recharts** | 3.5.1 | Charts (stats, analytics) |
| **TipTap** | 3.11.1 | Rich text editor (with image, placeholder, starter-kit) |
| **Lucide React** | 0.544.0 | Icons |
| **Tabler Icons** | 3.35.0 | Additional icons |
| **Heroicons** | 2.2.0 | Additional icons |
| **react-google-recaptcha-v3** | 1.11.0 | reCAPTCHA v3 |
| **next-themes** | 0.4.6 | Theme provider (dark/light mode) |
| **Date-fns** | 4.1.0 | Date formatting |
| **jsPDF** | 3.0.3 | Client-side PDF generation |
| **KaTeX** | 0.16.27 | Math equation rendering |
| **react-markdown** | 10.1.0 | Markdown rendering |
| **Crypto-JS** | 4.2.0 | AES encryption (quiz answer security) |
| **Cobe** | 0.6.5 | Globe visualization |
| **Three.js** | 0.180.0 | 3D rendering (globe) |
| **Facehash** | 0.1.0 | Avatar generation from user identity |
| **Driver.js** | 1.4.0 | Product tour / onboarding |
| **Clsx** | 2.1.1 | Class name utility |
| **Tailwind Merge** | 3.3.1 | Tailwind class deduplication |
| **Input OTP** | 1.4.2 | OTP input for verification |
| **Rough Notation** | 0.5.1 | Hand-drawn annotation effects |

---

## 13. Key UI Patterns

1. **Landing page sections**: Modular "Band" pattern (`HeroBand`, `FeatureGrid`, `PricingBand`, etc.) -- all under `components/organisms/landing/`
2. **Workspace sidebar**: `SidebarKit` with navigation items, user profile dropdown, floating dock (mobile). Collapsible via sidebar_collapsed in localStorage.
3. **CRUD modals**: Consistent pattern of `{Entity}Modal` + `{Entity}Form` for creation/editing (QuizSet, FlashcardSet, ExamRoom, ExamSession)
4. **AI Generation flow**: File upload -> job queue -> polling -> display results. Handled by `useAIGeneratorStore` (3 sub-stores + shared job store)
5. **AI Teacher chat**: SSE streaming with `aiChatApi.streamMessage()`, TTS via proxy API, file attachments, subject selection
6. **Exam taking**: Secure quiz flow with encrypted questions (`/secure-quiz`), JWT token per question, anti-cheating detection, fullscreen enforcement
7. **QR payments**: `QRPaymentDialog` shows QR code for bank transfer. Payment status polling.
8. **History pages**: Template-based layout with stats grid, PDF history list, exam history list, recent activity

---

## 14. Unresolved Questions / Notes for Wave 0

1. The `TeacherRoute.tsx` guard does NOT actually check for teacher/admin role -- it checks `isAuthenticated` only (same as `ProtectedRoute`). The `isAdmin` field exists on User but is unused in route guards.
2. `FREE_MODE = true` in `creditUtils.ts` -- hardcoded to bypass all credit checks. Intended for development but may need attention in production.
3. The app has remnants of Next.js (`next.config.ts`, `next-env.d.ts`, `next-themes`, `app/` directory) suggesting a migration from Next.js to Vite+React Router.
4. Some API endpoints reference `/api/v1` prefixes (exam-service) while others don't -- the proxy configuration in `nginx.conf` and `vite.config.ts` should be verified.
5. The `useStatsStore` uses raw `fetch()` instead of the Axios instance, bypassing auth interceptors. Uses `credentials: "include"` instead.
6. Secure quiz flow uses AES encryption (`crypto-js`) with a key from env var `VITE_QUIZ_AES_KEY`. Default fallback is `"default-aes-256-key-32-chars!!!"` in `env.ts`.
7. PDF upload has a 50MB limit enforced client-side.
8. The store naming convention is inconsistent: some use `use*Store` pattern, others use `use*Store` with different camelCase (e.g., `useTestGeneratorStore`, `useJobStore` defined in same file).
9. `GoogleOneTap` component exists but its API (Google Identity Services) may require separate client ID configuration.
10. The `AutoJoinByLink` feature on exam sessions suggests a shareable link flow that bypasses auth checks.

---

*Report generated from source code analysis of `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/` -- 180+ source files examined.*

## Mobile App Scout

# Mobile App Codebase Scout Report

**Date:** 2026-05-27
**Project:** KMAEdu KMP Mobile App
**Root:** `/Users/tgiap.dev/devs/kmaedu/kmaedu-app/`

## 1. Project Overview

This is a **Kotlin Multiplatform (KMP)** mobile application with **Android (Jetpack Compose)** and **iOS (SwiftUI)** frontends sharing Kotlin common code. It serves as the mobile companion to the KMAEdu exam/learning platform, featuring AI question generation from PDFs, flashcard study, exam rooms, and account/wallet management.

**Architecture Pattern:** Simple app-level architecture (not full Clean Architecture). Features are organized by domain folders. Data flow is: **View -> UiState (local) -> Repository (shared) -> ApiService (shared Ktor) -> Backend**. There are no ViewModel classes in the shared module -- each platform manages its own UI state locally.

**State Management:**
- Android: `remember { mutableStateOf(...) }` with `copy()` for immutable state updates (no ViewModel / StateFlow for screens, no shared ViewModels).
- iOS: `@State` with local struct states, plus `@StateObject AuthViewModel` for auth (using `@Published` properties).
- Shared: `LoadableState<T>` sealed interface for async data (Idle/Loading/Empty/Data/Error), `ApiResult<T>` for API responses.

**Navigation Library:**
- Android: Custom `AuthNavGraph` composable for auth flow (enum-based screen switching), main content uses `Scaffold` + `BottomTabBar` with `when(selectedTab)`.
- iOS: `NavigationStack` with `switch(route)` for auth, `TabView` with tab selection for main content. Simple enum-based navigation, no NavigationStack path-based routing for the main tabs.
- Neither platform uses a navigation library (no Jetpack Navigation Compose, no NavigationStack path navigation).

**API Client Library:** **Ktor** (shared multiplatform HTTP client) with:
- Ktor CIO engine on Android (via `ktor-client-okhttp`), Darwin engine on iOS (via `ktor-client-darwin`)
- Content negotiation with `kotlinx.serialization.json`
- `AuthInterceptor` plugin for automatic bearer token injection
- `safeApiCall<T>` / `safeUnitApiCall` helper functions wrapping calls in try/catch and returning `ApiResult<T>`

**Backend API Base URL:** `http://10.0.2.2:3000` (Android emulator localhost) / `http://localhost:3000` (iOS simulator), configurable via `BuildConfig` (Android) or `Info.plist` key `KMAEduAPIBaseURL`.

---

## 2. Build Configuration

### Root `build.gradle.kts`
- Applies plugins: `android.application`, `android.library`, `kotlin.android`, `kotlin.multiplatform`, `kotlin.compose`, `kotlin.serialization` (all via version catalog `libs`)

### `settings.gradle.kts`
- Root project: `KMAEduApp`
- Modules: `:androidApp`, `:shared`
- Uses version catalog (`libs`)

### `shared/build.gradle.kts`
- KMP targets: `androidTarget()`, `iosX64()`, `iosArm64()`, `iosSimulatorArm64()`
- Shared framework is **static** (`baseName = "Shared", isStatic = true`)
- Common dependencies: `ktor-client-core`, `ktor-client-content-negotiation`, `ktor-client-logging`, `ktor-serialization-kotlinx-json`, `kotlinx-serialization-json`
- Android-specific: `ktor-client-okhttp`
- iOS-specific: `ktor-client-darwin`
- Min SDK: from version catalog
- Namespace: `com.kmaedu.app.shared`

### `androidApp/build.gradle.kts`
- Application ID: `com.kmaedu.app`
- Compile SDK: from version catalog, Min SDK: from version catalog, Target SDK: from version catalog
- Version: `0.1.0` (versionCode 1)
- `API_BASE_URL` build config field: `"http://10.0.2.2:3000"` (emulator localhost)
- BuildConfig enabled
- Dependencies: `shared` module, `androidx.activity.compose`, Compose BOM, `material3`, `material.icons.extended`

---

## 3. Shared Module (`shared/src/`)

### 3.1 Common Main (`shared/src/commonMain/`)

#### Core Layer

| File | Description |
|------|-------------|
| `core/config/AppConfig.kt` | Data class holding `apiBaseUrl` and `environmentName` |
| `core/network/HttpClientFactory.kt` | Creates Ktor `HttpClient` with content negotiation (JSON), timeouts (30s req, 15s connect), logging, and auth interceptor |
| `core/network/AuthInterceptor.kt` | Ktor `HttpSend` plugin interceptor that injects `Bearer` token and `X-Device-ID` header from `SecureTokenStorage` |
| `core/network/ApiEndpoints.kt` | All REST endpoint path constants (`/auth/login`, `/auth/me`, `/profile`, `/wallet/details`, `/flashcardsets`, `/quizsets`, `/examrooms`, `/examsessions`, `/examattempts`, `/ai`, `/subjects`) |
| `core/network/ApiResult.kt` | Sealed interface: `Success<T>`, `HttpError(statusCode, message)`, `NetworkError(message)` |
| `core/network/ApiCall.kt` | `safeApiCall<T>` and `safeUnitApiCall` inline functions wrapping Ktor calls with error handling |
| `core/network/PaginatedResponse.kt` | `@Serializable` generic paginated response (`data`, `total`, `page`, `limit`, `totalPages`) |
| `core/network/SSEClient.kt` | Interface for SSE streaming (`stream(url, headers, onEvent)`); platform `expect`/`actual` |
| `core/storage/SecureTokenStorage.kt` | Interface with `readTokens()`, `saveTokens()`, `clearTokens()`; `expect fun createSecureTokenStorage()` |
| `core/session/SessionModels.kt` | `SessionTokens` (accessToken, refreshToken, sessionId, deviceId), `UserSession` (userId, email, displayName, roles) |
| `core/ui/LoadableState.kt` | Sealed interface: `Idle`, `Loading`, `Empty`, `Data<T>`, `Error(message)` |

#### Navigation Models

| File | Description |
|------|-------------|
| `features/navigation/MainTab.kt` | Enum: `AiTool` ("AI"), `TaiLieu` ("Tai lieu"), `BaiThi` ("Bai thi"), `DeThi` ("De thi"), `LichSu` ("Lich su") |
| `features/navigation/AuthState.kt` | `NavigationAuthState` (Loading/Unauthenticated/Authenticated), `UserSession`, `UserRole` (Student/Teacher/Admin) |
| `features/navigation/DeepLink.kt` | `DeepLink` sealed interface (`ExamSession`, `Flashcard`, `Chat`, `Profile`) with `parseDeepLink()` and `targetTab()` |

#### Auth Feature

| File | Description |
|------|-------------|
| `features/auth/models/AuthModels.kt` | Request/response types: `LoginRequest`, `SignupRequest`, `AuthResponse`, `CurrentUserResponse`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `RefreshTokenRequest`, `MessageResponse` |
| `features/auth/models/UserModels.kt` | `User` model (id, email, username, name, avatar, banner, bio, isVerified, roles, createdAt, updatedAt), `UserRole` enum (Student/Teacher/Admin) |
| `features/auth/api/AuthApiService.kt` | API methods: login, signup, currentUser, refresh, logout, forgotPassword, resetPassword |
| `features/auth/repository/AuthRepository.kt` | Orchestrates auth: `restoreSession()` with token refresh fallback, login/signup/logout with token persistence, OAuth token saving |

#### AI Feature

| File | Description |
|------|-------------|
| `features/ai/models/AIChatModels.kt` | `AIChat`, `AIChatMessage` (id, chatId, role, content), `SendMessageRequest` |
| `features/ai/models/SubjectModels.kt` | `SubjectCategory` (id, name, description, icon), `Subject` (id, name, slug, description, categoryId) |
| `features/ai/models/AIGeneratorModels.kt` | `RecentUpload`, `GenerateExamRequest` (uploadId, questionCount, difficulty), `GenerateExamResponse` |
| `features/ai/api/AIChatApiService.kt` | List chats, get messages, send message (`/ai/chats`, `/ai/chat`) |
| `features/ai/api/SubjectApiService.kt` | Categories, subjects list, single subject (`/subjects`) |
| `features/ai/api/AIGeneratorApiService.kt` | Recent uploads, generate exam from file (`/ai/recent-uploads`, `/ai/generate-from-file`) |
| `features/ai/repository/AIChatRepository.kt` | Aggregates chat, generator, subject APIs + SSE client for streaming |

#### Study Feature

| File | Description |
|------|-------------|
| `features/study/models/FlashcardModels.kt` | `FlashcardSet`, `Flashcard` (id, question, answer, image), `CreateFlashcardSetRequest`, `FlashcardSetLabel` |
| `features/study/models/FlashcardStudyModels.kt` | `FlashcardStudyState` (setId, currentIndex, isAnswerVisible, masteredCardIds) |
| `features/study/api/FlashcardApiService.kt` | CRUD for flashcard sets + get flashcards within a set (`/flashcardsets`) |
| `features/study/api/StudentMaterialsApiService.kt` | Recent flashcards, recent exams, toggle pin (`/student/materials/`) |
| `features/study/repository/FlashcardRepository.kt` | Aggregates flashcard and materials APIs |

#### Exams Feature

| File | Description |
|------|-------------|
| `features/exams/models/QuizSetModels.kt` | `QuizSet`, `Question`, `CreateQuizSetRequest`, `QuizSetLabel` |
| `features/exams/models/ExamRoomModels.kt` | `ExamRoom`, `ExamSession`, `ExamSessionStatus` (Draft/Scheduled/Active/Completed/Cancelled) |
| `features/exams/models/ExamAttemptModels.kt` | `ExamAttempt`, `StartExamAttemptRequest`, `SecureQuestion` (encrypted), `SecureQuizResponse`, `SecureAnswer`, `SubmitExamAttemptRequest` |
| `features/exams/api/QuizSetApiService.kt` | Full CRUD for quiz sets + questions (`/quizsets`) |
| `features/exams/api/ExamRoomApiService.kt` | List exam rooms, get detail, list sessions (`/examrooms`) |
| `features/exams/api/ExamAttemptApiService.kt` | Start attempt, list attempts, get secure quiz, submit attempt (`/examattempts`) |
| `features/exams/repository/ExamRepository.kt` | Aggregates quiz set, exam room, and exam attempt APIs |

#### History Feature

| File | Description |
|------|-------------|
| `features/history/models/HistoryModels.kt` | `HistoryStats` (totalPdfs, totalExams, totalFlashcards, completedAttempts), `PDFHistoryItem`, `ExamHistoryItem` |
| `features/history/api/HistoryApiService.kt` | Stats, PDF history, exam history (`/examattempts/history-stats`, `/ai/recent-uploads`, `/examattempts/list`) |

#### Account Feature

| File | Description |
|------|-------------|
| `features/account/models/ProfileModels.kt` | `UserProfile`, `UpdateProfileData` |
| `features/account/models/WalletModels.kt` | `Transaction`, `WalletDetails` (balance + transactions), `SubscriptionPlan` |
| `features/account/api/ProfileApiService.kt` | Get/update profile (`/profile`) |
| `features/account/api/WalletApiService.kt` | Wallet details, subscription plans (`/wallet/details`, `/payment/subscription/plans`) |
| `features/account/repository/AccountRepository.kt` | Aggregates profile and wallet APIs |

### 3.2 Android Main (`shared/src/androidMain/`)

| File | Description |
|------|-------------|
| `core/storage/SecureTokenStorage.android.kt` | `actual fun createSecureTokenStorage()`, uses Android SharedPreferences + AES/GCM encryption via Android KeyStore (key alias `kmaedu_mobile_session`); initialized via `initSecureTokenStorage(context)` |
| `core/network/SSEClient.kt` | `actual fun createSSEClient()`, currently throws `NotImplementedError("SSE streaming is wired in Phase 6")` |

### 3.3 iOS Main (`shared/src/iosMain/`)

| File | Description |
|------|-------------|
| `core/storage/SecureTokenStorage.ios.kt` | `actual fun createSecureTokenStorage()`, currently returns `null` from `readTokens()` and throws `NotImplementedError` from `saveTokens()` -- **NOT YET IMPLEMENTED** |
| `core/network/SSEClient.kt` | Same `NotImplementedError` as Android -- not yet wired |

---

## 4. Android App (`androidApp/`)

### 4.1 Core Android Files

| File | Description |
|------|-------------|
| `AndroidManifest.xml` | Single activity (`MainActivity`), `launchMode="singleTop"`, deep link intent filter for `kmaedu://auth` |
| `MainActivity.kt` | Entry point; sets up edge-to-edge, initializes secure token storage, creates `AndroidAppContainer`, handles OAuth callback URI (`kmaedu://auth`), renders `KMAEduTheme { KMAEduApp(...) }` |
| `KMAEduApp.kt` | Root composable; manages auth state (mut state); shows `AuthNavGraph` when unauthenticated, `Scaffold` + top bar + bottom tab bar + content `when(selectedTab)` when authenticated |
| `OAuthCallbackHolder.kt` | Singleton `StateFlow<String?>` to pass OAuth callback URIs between Activity and Compose tree |
| `design/KMAEduTheme.kt` | Material 3 `lightColorScheme` with primary `#CC785C` (coral), background `#FAF9F5`, surface variant `#EFE9DE` |

### 4.2 Backend / DI

| File | Description |
|------|-------------|
| `backend/AndroidAppContainer.kt` | Manual DI container: creates `HttpClient` via `HttpClientFactory.create()`, instantiates `AuthRepository` with `AuthApiService` |
| `backend/AndroidSecureTokenStorage.kt` | Unused? (Duplicates `shared/src/androidMain/` implementation -- also AES/GCM with Android KeyStore) |
| `core/config/MobileApiConfig.kt` | Builds API base URL from `BuildConfig.API_BASE_URL` + `/api/v1`, provides `googleOAuthUrl()` with `kmaedu://auth/callback` redirect |

### 4.3 Navigation

| File | Description |
|------|-------------|
| `navigation/BottomTabBar.kt` | Material 3 `NavigationBar` with 5 tabs (AI, Tai lieu, Bai thi, De thi, Lich su) and coral accent color |
| `navigation/AppHeader.kt` | `TopAppBar` with logo image and profile icon button |

### 4.4 Feature Screens

#### Auth

| File | Description |
|------|-------------|
| `features/auth/AuthNavGraph.kt` | Auth screen router: Login/Register/ForgotPassword/ResetPassword navigation via enum, OAuth callback processing, form validation |
| `features/auth/AuthState.kt` | `AuthScreen` enum, `AuthUiState` (isAuthenticated, isLoading, errorMessage, successMessage), `toAuthMessage()` |
| `features/auth/LoginScreen.kt` | Login form: credential + password inputs, Google OAuth button, validation, error/success display |
| `features/auth/RegisterScreen.kt` | Register form: username + email + password + confirm password |
| `features/auth/ForgotPasswordScreen.kt` | Email input for sending reset code |
| `features/auth/ResetPasswordScreen.kt` | Code + new password input |
| `features/auth/AuthCardShell.kt` | Shared card-based layout with gradient background for auth screens |
| `features/auth/AuthFormComponents.kt` | Reusable `AuthTextField`, `AuthPrimaryButton`, `AuthSocialButton`, `AuthMessage` |

#### Home (Note: HomeScreen is defined but NOT used in KMAEduApp.kt -- `selectedTab` defaults to `AiTool`)

| File | Description |
|------|-------------|
| `features/home/HomeScreen.kt` | Dashboard with stats grid (2x2), recent flashcards, recent exams sections |
| `features/home/HomeDashboardModels.kt` | `HomeDashboardState`, `HomeStat`, `HomeRecentFlashcard`, `HomeRecentExam` |
| `features/home/StatsCard.kt` | Individual stat card composable |
| `features/home/RecentItems.kt` | Recent flashcard/exam row composables |

#### AI

| File | Description |
|------|-------------|
| `features/ai/AiScreen.kt` | AI tab with 3 sub-sections (Teacher chat, Tool generate, History), uses `FilterChip` for section switching |
| `features/ai/AIToolScreen.kt` | PDF upload zone, question type filters ("Trac nghiem", "Dien tu", "Dung/Sai", etc), count/keyword inputs, preview |
| `features/ai/AiModels.kt` | `AiUiState`, `AiSection` enum, `AiChatMessage`, `AiHistoryItem` |

#### Exams

| File | Description |
|------|-------------|
| `features/exams/MyExamsScreen.kt` | 4 states: list view, session detail view, quiz-taking view (with progress + radio buttons), result view |
| `features/exams/MyExamsModels.kt` | `MyExamsUiState`, `ExamAttempt`, `ExamQuestion`, `ExamStatus` |
| `features/exams/DeThiScreen.kt` | Exam sets management: stats cards, Flash Card / Phong thi buttons, exam set list, FAB for create |

#### Study

| File | Description |
|------|-------------|
| `features/study/StudyScreen.kt` | Two states: material list (with pin toggle) + flashcard study (front/back flip, prev/next, progress bar) |
| `features/study/StudyModels.kt` | `StudyUiState`, `StudyMaterial`, `StudyFlashcard` |

#### History

| File | Description |
|------|-------------|
| `features/history/LichSuScreen.kt` | Stats cards (PDF/Bai thi/Flashcards/Tu hoc) + recent activity list |

#### Account

| File | Description |
|------|-------------|
| `features/account/AccountScreen.kt` | 4 sections via `FilterChip`: Profile, Wallet, Teacher, Settings |
| `features/account/AccountModels.kt` | `AccountUiState`, `AccountSection` enum, `TransactionItem` |
| `features/account/ProfileSheet.kt` | `ModalBottomSheet` for profile: wallet entry, change password, logout |

#### Teacher

| File | Description |
|------|-------------|
| `features/teacher/TeacherScreen.kt` | Teacher content management: segmented picker (Flashcard/Quiz/Phong thi), create button, item list |
| `features/teacher/TeacherModels.kt` | `TeacherUiState`, `TeacherContentType`, `TeacherContentItem` |

---

## 5. iOS App (`iosApp/`)

### 5.1 Core iOS Files

| File | Description |
|------|-------------|
| `KMAEduApp.swift` | `@main` SwiftUI App struct, renders `ContentView()` in `WindowGroup` |
| `ContentView.swift` | Root view: shows `AuthFlowView` if not authenticated, tabbed main content (`TabView` with 5 tabs + `AppHeader` + `ProfileSheet` sheet) if authenticated; handles `onOpenURL` for deep links |
| `AppConfig.swift` | API config: reads `KMAEduAPIBaseURL` from `Info.plist` (default `http://localhost:3000`), builds `apiBaseURL` with `/api/v1` prefix, provides `googleOAuthURL()` |
| `AppRouter.swift` | `AppDeepLink` enum (`examSession`, `flashcard`, `chat`, `profile`) + `AppTab` enum + `parseAppDeepLink()` function |
| `Info.plist` | App version `0.1.0`, custom URL scheme `kmaedu`, `KMAEduAPIBaseURL` default `http://localhost:3000` |

### 5.2 Auth

| File | Description |
|------|-------------|
| `Features/Auth/AuthViewModel.swift` | `@MainActor final class ObservableObject` with `@Published` auth state; login/register/sendResetCode/resetPassword methods calling private `AuthApiClient` (URLSession-based), private `KeychainTokenStore` for token persistence; OAuth callback handling via `completeOAuthCallback(url:)` |
| `Features/Auth/AuthFlowView.swift` | `NavigationStack` with `switch(route)` routing Login/Register/ForgotPassword/ResetPassword; `onOpenURL` handler for OAuth |
| `Features/Auth/LoginView.swift` | Login UI: branded gradient background, circular decorative blobs, card-based form, credential + password fields, Google OAuth button via `openURL(AppConfig.googleOAuthURL())`, error/success messages |
| `Features/Auth/RegisterView.swift` | Registration form with name/email/password/confirm fields |
| `Features/Auth/ForgotPasswordView.swift` | Email input for reset code |
| `Features/Auth/ResetPasswordView.swift` | Code + new password input |
| `Features/Auth/AuthComponents.swift` | `AuthMessageView` shared component |

### 5.3 Feature Views

| File | Description |
|------|-------------|
| `Views/HomeView.swift` | Dashboard with stats grid (empty state: all zeros), recent flashcards, recent exams sections |
| `Views/AiView.swift` | 3-section AI view (Teacher chat / Tool / History) via segmented picker; chat bubble UI, PDF generation tool UI, history list |
| `Views/StudyView.swift` | Material list view with flashcard set rows + flashcard study view with flip card animation (tap to reveal answer) |
| `Views/MyExamsView.swift` | Exam attempts list, session detail, quiz-taking (progress bar, question card, prev/next/submit), result view |
| `Views/AccountView.swift` | 4-section segmented picker: Profile, Wallet, Teacher, Settings |
| `Views/TeacherView.swift` | Teacher content management with segmented picker (Flashcard/Quiz/Phong thi) |
| `Views/PlaceholderScreen.swift` | Generic placeholder view |

---

## 6. Auth Flow Details

### Android
1. `MainActivity.onCreate()` checks `intent.data` for `kmaedu://auth` scheme -- stores in `OAuthCallbackHolder`
2. `KMAEduApp` renders `AuthNavGraph` when `authState == Unauthenticated`
3. `AuthNavGraph` uses `LaunchedEffect` to observe `OAuthCallbackHolder.callback` flow
4. Login: validates -> calls `authRepository.login(credential, password)` -> Ktor POST `/auth/login` -> `AuthResponse` contains tokens -> `persistTokens()` saves via `AndroidSecureTokenStorage` (AES/GCM/KeyStore) -> `onAuthenticated(user)` -> app switches to main content
5. Google OAuth: opens URL `{apiBaseUrl}/auth/google?redirect=kmaedu://auth/callback` -> system browser -> callback intercepted by `MainActivity.onNewIntent()` -> `AuthNavGraph` parses `token`/`refreshToken` from callback URI query params -> `authRepository.saveOAuthTokens()`

### iOS
1. `AuthFlowView` in `ContentView` shows unauthenticated flow
2. `AuthViewModel` handles all auth logic (private `AuthApiClient` using `URLSession`, private `KeychainTokenStore` for Keychain persistence)
3. Login/Register call `AuthApiClient` methods -> save tokens via Keychain (service: `kmaedu.session`) -> set `isAuthenticated = true`
4. Google OAuth: `LoginView` calls `openURL(AppConfig.googleOAuthURL())` -> system browser -> callback via `onOpenURL` in `AuthFlowView` -> routes to `AuthViewModel.completeOAuthCallback(url:)` -> parses token from query params -> saves via Keychain
5. **Keychain token store** stores accessToken, refreshToken, sessionId, deviceId per account

### Token Refresh (Shared)
- `AuthRepository.restoreSession()` handles the refresh flow: reads stored tokens -> calls `currentUser()` -> if fails, calls `refresh(refreshToken)` -> on success, persists new tokens -> retries `currentUser()`
- On 401/403 errors, tokens are cleared

---

## 7. Key Observations

### What is Real vs. Mock Data
- **Shared module (commonMain):** All API services, models, and repositories are real and fully wired to the Ktor `HttpClient`. The `ExamRepository`, `AIChatRepository`, `FlashcardRepository`, `AuthRepository`, `AccountRepository` are production-ready facades.
- **Platform UI (Android + iOS):** Most screens currently use **hardcoded mock data** via local UiState objects with sample arrays. The UI infrastructure is laid out but not yet connected to repositories.
- **SSE Client:** Both platforms have stub `NotImplementedError` implementations.
- **iOS SecureTokenStorage (KMP):** Stub that returns `null` and throws `NotImplementedError`. The actual iOS Keychain token store lives in `AuthViewModel.swift` as a private class.

### Feature Completeness per Platform

| Feature | Android (Compose) | iOS (SwiftUI) | Shared API |
|---------|:-:|:-:|:-:|
| Login/Register | Full UI + auth flow | Full UI + auth flow | Complete |
| OAuth Google | Full flow | Full flow | Complete |
| Forgot/Reset Password | Full UI | Full UI | Complete |
| Home Dashboard | Full UI (unused) | Full UI | Not wired |
| AI Chat | Full UI (mock) | Full UI (mock) | Ready |
| AI Tool (PDF gen) | Full UI (mock) | Full UI (mock) | Ready |
| Flashcard Study | Full UI (mock) | Full UI (mock) | Ready |
| My Exams (attempts) | Full UI (mock) | Full UI (mock) | Ready |
| De Thi (exam sets) | Full UI (mock) | Full UI (mock) | Ready |
| History | Full UI (mock) | Full UI (mock) | Ready |
| Account Profile | Full UI | Full UI | Ready |
| Account Wallet | Full UI | Full UI | Ready |
| Teacher Management | Full UI | Full UI | Not wired |
| SSE Streaming | Stub | Stub | Interface ready |

### Duplication / Inconsistencies
1. `AndroidSecureTokenStorage` exists in **two places**: `androidApp/.../backend/` and `shared/src/androidMain/.../storage/`. Both use AES/GCM with Android KeyStore -- the shared module version is the one actually used (via `expect`/`actual`).
2. iOS has **two** token storage mechanisms: the stub KMP `IosSecureTokenStorage` (shared/iosMain) and the real `KeychainTokenStore` (embedded in `AuthViewModel.swift`). The real one is a private class, not accessible from shared code.
3. `HomeScreen` is built on Android but **not wired into navigation** -- the default tab is `AiTool`.
4. No shared ViewModels -- each platform manages its own state for every screen.
5. No DI framework -- manual constructor injection via `AndroidAppContainer` (Android) and direct instantiation (iOS).

### Unanswered Questions
1. Is a DI framework (Koin/Kodein) planned for the shared module?
2. Will iOS use KMP-generated framework classes for the API layer across all features (it currently uses a private `AuthApiClient` / `URLSession` directly in `AuthViewModel.swift` instead of the shared Ktor client)?
3. When will SSE streaming be wired (referenced as "Phase 6" in stubs)?
4. Are the mock data states in UiState objects intentionally designed to be replaced by repository calls (e.g., via `LoadableState`), or is this a V1 pattern?
5. The SecureQuiz feature includes encrypted payloads (`encryptedPayload` + `iv`) -- is client-side decryption planned?
6. No tests exist in the codebase -- what is the testing strategy?
