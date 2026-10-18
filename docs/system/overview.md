# System Overview

**Project**: examio
**Generated**: 2026-06-05
**Architecture Type**: Distributed multi-service (NestJS monorepo + Python FastAPI + React 19 SPA)

---

## Executive Summary

examio is a multi-tenant exam/quiz platform serving students and teachers. Authoring users create quiz sets, flashcard sets, and exam rooms; students take timed sessions under AES-256-CBC question encryption with JWT answer tokens. The backend is a NestJS monorepo of 6 services (gateway, auth, exam, finance, r2, admin) plus one Python FastAPI AI service, fronted by a gateway HTTP proxy. Payments are handled via SePay QR code and an internal wallet with credit-based subscription gating. AI features (generation, document RAG, AI teacher chat) are offloaded to a Python FastAPI worker. Infrastructure runs on PostgreSQL + Redis + RabbitMQ (topic exchange `examio.events`).

For architecture diagrams and tech stack details, see [architecture.md](architecture.md).

---

## Key Design Decisions

### Decision 1: Gateway HTTP Proxy as the Single Public Entry Point

**Context**: Six backend services (gateway, auth, exam, finance, r2) plus one Python AI service each expose HTTP/gRPC listeners. Exposing them directly to the public internet creates a large attack surface and makes CORS/CORS and rate-limiting inconsistent.

**Decision**: All public HTTP traffic enters through `gateway-service` (port 3000). The gateway proxies requests to downstream services based on URL prefix rules defined in `ProxyService`. Downstream services are network-isolated; only the gateway has a public port.

**Rationale**: Centralizes cross-cutting concerns (rate limiting at 100 req/min, auth token extraction, logging) in one place. Simplifies frontend API wiring — one base URL. Enables future auth middleware injection without touching every service.

### Decision 2: AES-256-CBC Question Encryption with JWT Answer Token Map

**Context**: Quiz questions are authored once but served to many students. Storing plaintext questions in the database and on the wire exposes them to retrieval by non-participating users.

**Decision**: Server encrypts each question with AES-256-CBC using a per-exam secret stored server-side (`QUIZ_JWT_SECRET`). The client decrypts with `VITE_QUIZ_AES_KEY` (env var). Answers are submitted via a signed JWT token map (`CryptoService.signQuestionToken`) rather than raw payloads, preventing answer tampering and replay.

**Rationale**: Questions remain opaque to students who download network traffic; the JWT answer token prevents clients from forging submissions. The server-side secret is never shipped to the browser.

### Decision 3: gRPC for Inter-Service Synchronous Communication

**Context**: auth-service, finance-service, and r2-service all need to be called by other services synchronously (e.g., exam-service verifying subscription credits before generating AI content, or fetching a signed R2 upload URL).

**Decision**: These three services expose gRPC APIs on gRPC port 50051 per container (auth, finance, r2). exam-service and auth-service embed gRPC client modules rather than HTTP-calling the gateway. Proto definitions live in `examio-be/proto/examio/<svc>/v1` (buf-managed); generated TS stubs are `@examio/contracts`.

**Rationale**: gRPC provides typed contracts, bidirectional streaming support, and lower latency than HTTP proxy chains for internal calls. Avoids circular gateway routing.

### Decision 4: RabbitMQ Topic Exchange for Async Event-Driven Workflows

**Context**: Wallet creation must happen automatically when a new user registers, without coupling auth-service to finance-service at the HTTP level.

**Decision**: auth-service writes `auth.user.registered` to a transactional outbox in the register tx; its worker relay publishes it to the durable topic exchange `examio.events` (library `@examio/messaging`). finance-service's `UserRegisteredHandler` consumes it idempotently (`processed_events` dedupe, retry tier 30 s, per-service DLQ) and creates the wallet with a 20-credit welcome bonus. Per-service RabbitMQ users restrict publishing to each service's own routing-key prefix. Legacy `EventType` enum values remain unused.

**Rationale**: Decouples service lifecycle and failure domains. If finance-service is down during registration, the event is retained and replayed. New cross-service workflows can be added by publishing/consuming events without code changes to unrelated services.

### Decision 5: Separate Python AI Service for RAG, Document Processing, and AI Chat

**Context**: AI workloads (embedding generation, vector search with FAISS, document OCR via Docling, ReAct agent orchestration) are I/O-heavy, stateful, and require different runtime characteristics (Python 3.12+, LangChain/LangGraph, Gemini). NestJS is not ideal for these workloads.

**Decision**: AI capabilities are extracted into a standalone Python FastAPI service (`ai-service`) with its own process. exam-service orchestrates AI calls via HTTP, passing auth headers and multipart form data. Frontend streams AI chat responses via SSE.

**Rationale**: Allows independent scaling, different dependency management, and GPU resource isolation. The AI service can be updated/replaced without touching the NestJS monorepo. Exam-service acts as the coordinator, not the processor.

---

## Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     examio-fe (React 19 SPA)                │
│          Zustand stores · Axios · React Router             │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (X-Device-ID header)
┌────────────────────────▼────────────────────────────────────┐
│               gateway-service :3000                        │
│    HTTP proxy · rate limit 100 req/min · logging           │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────────────┐
   │      │      │      │      │      │      │ HTTP
   │gRPC  │gRPC  │gRPC  │gRPC  │gRPC  │gRPC  │ (AI study proxy)
   ▼      ▼      ▼      ▼      ▼      ▼      ▼
auth:3000 exam:3000 finance:3000 r2:3000 admin:3000
gRPC:50051      gRPC:50051 gRPC:50051   (containers)
         exam-service ←──────────────────┐
                  │ HTTP                │ gRPC (wallet check)
                  ▼                     │
           ai-service :3000 in compose (Python FastAPI)
           RAG · embedding · AI chat · ReAct agent

Infrastructure: PostgreSQL (Prisma shared) · Redis (cache) · RabbitMQ (topic exchange examio.events)
```

### Service Summary

| Service | Port | Protocol | Role |
|---|---|---|---|
| gateway-service | 3000 | HTTP | Public entry, proxy, rate limit |
| auth-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | JWT auth, Google OAuth, session/device management |
| exam-service | 3000 | HTTP | Quiz/flashcard/exam authoring, attempts, AI orchestration |
| finance-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Wallet, SePay QR payments, subscriptions |
| r2-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Cloudflare R2 storage |
| admin-service | 3000 HTTP | HTTP | Admin dashboard: users, stats, finance, logs, audit |
| ai-service | 3000 (compose) | HTTP | RAG, document processing, AI chat (Python FastAPI) |

---

## Cross-Service Communication Patterns

### HTTP Proxy (gateway → downstream)

gateway-service proxies HTTP requests to downstream services by URL prefix. Admin routes (`/api/v1/admin/*`) are routed to `admin-service` (port 3000) via `ProxyService.forwardWithAuth`. Downstream services use shared `AuthGuard` (Prisma-direct session validation via `SessionValidationMiddleware`) rather than calling the gRPC AuthService for every request. Admin routes use `AdminGuard` (standalone JWT verify + Prisma lookup) instead of `AuthGuard`.

### gRPC (synchronous, internal)

- auth-service `AuthService` (port 50051): token validation, session lookup
- finance-service `WalletService` (port 50051): credit deduction, balance check (`Debit`/`Credit`/`Refund` declared, `UNIMPLEMENTED` until a later phase)
- r2-service `R2Service` (port 50051): signed upload URLs, file deletion (incl. `DeleteObjects`)

Every container uses HTTP 3000 / gRPC 50051 (unified ports; separate network namespaces). admin-service has no gRPC server in the current compose.


### RabbitMQ (async, event-driven)

Exchange: `examio.events` (topic, durable). Only wired event: `auth.user.registered` (outbox) → `UserRegisteredHandler` in finance-service (wallet creation). See [architecture](architecture.md) § RabbitMQ.

### AI Orchestration (HTTP, exam-service → ai-service)

exam-service calls `aiApi.generateExamApi` (multipart) → returns `jobId` → frontend polls `getJobStatus` every 10s (up to 360 attempts / 60min). Completion stores result + refreshes wallet balance.

---

## Auth / Session Flow

1. User submits credentials → `POST /auth/login` → auth-service → returns `accessToken` (JWT) + `refreshToken` (cookie) + `sessionId`
2. Axios interceptor in `apis/api.ts` attaches `Authorization: Bearer {token}` + `X-Device-ID` header on every request
3. `SessionValidationMiddleware` on every non-public gateway route: checks `UserSession.isActive && expiresAt > now` → 401 `SESSION_INVALIDATED`/`SESSION_EXPIRED`
4. OAuth (Google): redirect → backend `/auth/google` → Google One Tap → callback URL with `?token=&refreshToken=&sessionId=` → `AuthSyncBootstrap` stores in localStorage + cookie → `syncRefreshTokenApi`
5. Device tracking: `X-Device-ID` header from `getOrCreateDeviceId()`; sessions tracked per device in `UserSession` table
6. Session cleanup: `session-cleanup.cron.ts` (scheduled job) invalidates expired sessions
7. Cloudflare Turnstile: `TurnstileGuard` on sensitive auth forms (signup, login, forgot password)

---

## Quiz Encryption Flow

1. Author creates exam room → server encrypts each question with AES-256-CBC using exam-scoped secret
2. Client loads questions → `lib/crypto.ts` decrypts with `VITE_QUIZ_AES_KEY`
3. Student submits answers → `lib/secureQuizHelpers.ts` builds signed JWT answer token map via `CryptoService.signQuestionToken`
4. Server validates JWT answer token and computes score server-side (never trust client arithmetic)

---

## AI Generation Flow

1. Teacher triggers generation on `AIToolPage` → frontend calls `POST /ai-study/generate` (multipart)
2. exam-service proxies to ai-service → ai-service queues job → returns `jobId`
3. Frontend polls `GET /ai-study/generate/status/{jobId}` every 10s (up to 360 attempts)
4. On completion: exam-service stores generated questions in DB, calls `FinanceClientService.deductCredits`
5. `PendingJobDialog` shows progress; job state persisted in localStorage (`pending_generation_job`) for resume on reload

> **Unresolved**: `FREE_MODE = true` shipped in `FinanceClientService.deductCredits` — production credit gating may be bypassed.

---

## Wallet / Payment Flow

1. New user registers → `auth.user.registered` event (outbox) → `UserRegisteredHandler` creates wallet with 20-credit welcome bonus
2. Teacher purchases subscription → `POST /finance/payment/create-sepay-qr` → SePay QR returned → student scans and pays
3. SePay webhook (`POST /webhook/sepay`) confirms payment → wallet credited
4. AI generation deducts credits via `FinanceClientService.deductCredits` (gRPC call to finance-service)
5. Subscription gates AI features: `FinanceClientService` checks active subscription before generation

---

## Storage / RAG Pipeline

1. Teacher uploads document → `POST /r2/upload` → r2-service returns signed Cloudflare R2 URL
2. OCR triggered via `OcrService` (gRPC → Python FastAPI worker via Docling)
3. Extracted text chunked and embedded via LangChain + FAISS
4. AI chat attaches document context via `UserStorageGraph` + `UserStorageGraphGroup` (RAG retrieval)
5. Frontend streams AI chat via SSE (`aiChatApi.ts`)

---

## Security Overview

- **Authentication**: JWT cookie (`accessToken`) + `refreshToken` cookie; Google OAuth via One Tap; Cloudflare Turnstile on auth forms
- **Authorization**: `AuthGuard` + `SessionValidationMiddleware` on gateway; role-based guards (`TeacherRoute`, `ProtectedRoute`, `PublicRoute`) on frontend routes; gRPC `AuthGuard` for inter-service calls
- **Data Encryption**: AES-256-CBC question encryption (server-side secret); client decrypts with `VITE_QUIZ_AES_KEY`; JWT answer token prevents tampering
- **API Security**: Bearer token + `X-Device-ID` header on all proxied requests; rate limit 100 req/min at gateway; session invalidation on logout/device revocation

---

## Scalability

- **Current Capacity**: Single-instance per service; PostgreSQL shared across all NestJS services via Prisma; Redis for session/cache; RabbitMQ for async decoupling
- **Scaling Strategy**: Service-level horizontal scaling behind gateway proxy; Redis cluster for session scale-out; RabbitMQ consumer groups for event processing parallelism; ai-service scales independently for GPU workloads
- **Performance Targets**: Gateway rate limit 100 req/min per client; AI generation polling up to 360 attempts (60min timeout); Redis cache TTL 5 minutes default; cursor-based pagination for large datasets

---

## Unresolved Questions

2. Gateway has duplicate finance routes (`wallet-profile-proxy.controller.ts` + `finance-proxy.controller.ts`) — consolidate or clarify.
3. `AuthService.ValidateToken` gRPC wired but unused — services use `AuthGuard` (Prisma-direct) instead; evaluate if gRPC path is needed.
4. `FREE_MODE = true` shipped in production code path in `FinanceClientService.deductCredits` — credit gating bypassed; needs env-gate or removal.
5. `ExamAttempt.submit` via `submitSecureQuiz` vs legacy `submitExamAttemptApi` — clarify canonical submission path.
6. `PendingJobDialog` rendered unconditionally in `KLayout` — check if it should be scoped to AI tool pages only.
7. `ProfilePage` reads both `getProfileApi` and `useAuthStore.user` — possible state drift; designate single source of truth.
8. `SubscriptionPage` vs `SubscriptionTemplate` — two subscription UIs; designate canonical screen.
9. `libs/database/src/schema.prisma` (27KB, canonical) vs `prisma/schema.prisma` (17KB, stale) — confirm single source of truth; deprecate stale copy.
