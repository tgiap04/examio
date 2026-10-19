# System Overview

**Project**: examio
**Generated**: 2026-06-05
**Architecture Type**: Distributed multi-service (NestJS monorepo + Python FastAPI + React 19 SPA)

---

## Executive Summary

examio is a multi-tenant exam/quiz platform serving students and teachers. Authoring users create quiz sets, flashcard sets, and exam rooms; students take timed sessions under AES-256-CBC question encryption with JWT answer tokens. The backend is a NestJS monorepo of 6 services (gateway, auth, exam, finance, r2, admin) plus one Python FastAPI AI service, fronted by a YAML-routed gateway (streaming proxy, no database). Payments are handled via SePay QR code and an internal wallet with credit-based subscription gating. AI features (generation, document RAG, AI teacher chat) are offloaded to a Python FastAPI worker. Infrastructure runs on PostgreSQL + Redis + RabbitMQ (topic exchange `examio.events`).

For architecture diagrams and tech stack details, see [architecture.md](architecture.md).

---

## Key Design Decisions

### Decision 1: Gateway as the Single Public Entry Point

**Context**: Six backend services (gateway, auth, exam, finance, r2) plus one Python AI service each expose HTTP/gRPC listeners. Exposing them directly to the public internet creates a large attack surface and makes CORS/CORS and rate-limiting inconsistent.

**Decision**: All public HTTP traffic enters through `gateway-service` (port 3000). The gateway matches each request against the route table in `apps/gateway-service/config/routes.yaml` (path regex, else longest prefix), checks the token, revoke/stale state, permissions, page flag, body size and rate limit, then streams it to the upstream. Downstream services sit on the internal compose network; only the gateway is published (`127.0.0.1:6369`, reached through the FE nginx).

**Rationale**: Centralizes cross-cutting concerns (rate limiting: 100 req/min default plus per-route buckets, JWT verification, revoked-session check, logging) in one place. Simplifies frontend API wiring — one base URL. A new route is one entry in `routes.yaml`, not a new controller.

### Decision 2: AES-256-CBC Question Encryption with JWT Answer Token Map

**Context**: Quiz questions are authored once but served to many students. Storing plaintext questions in the database and on the wire exposes them to retrieval by non-participating users.

**Decision**: Server encrypts each question with AES-256-CBC using a per-exam secret stored server-side (`QUIZ_JWT_SECRET`). The client decrypts with `VITE_QUIZ_AES_KEY` (env var). Answers are submitted via a signed JWT token map (`CryptoService.signQuestionToken`) rather than raw payloads, preventing answer tampering and replay.

**Rationale**: Questions remain opaque to students who download network traffic; the JWT answer token prevents clients from forging submissions. The server-side secret is never shipped to the browser.

### Decision 3: gRPC for Inter-Service Synchronous Communication

**Context**: auth-service, finance-service, and r2-service all need to be called by other services synchronously (e.g., exam-service verifying subscription credits before generating AI content, or fetching a signed R2 upload URL).

**Decision**: These three services expose gRPC APIs on gRPC port 50051 per container (auth, finance, r2). exam-service and auth-service embed gRPC client modules rather than HTTP-calling the gateway. Proto definitions live in `examio-be/proto/examio/<svc>/v1` (buf-managed); generated TS stubs are `@examio/contracts`.

**Rationale**: gRPC provides typed contracts, bidirectional streaming support, and lower latency than HTTP proxy chains for internal calls. Avoids circular gateway routing.

### Decision 4: RabbitMQ Topic Exchange for Async Event-Driven Workflows

**Context**: Wallet creation must happen automatically when an account becomes a TEACHER, without coupling auth-service to finance-service at the HTTP level.

**Decision**: auth-service writes `auth.user.authz_changed` to a transactional outbox in the same tx as every role / admin / ban / password change (`auth.user.registered` is still written at registration, with no consumer); its worker relay publishes to the durable topic exchange `examio.events` (library `@examio/messaging`). finance-service's `UserAuthzChangedHandler` consumes it idempotently (`processed_events` dedupe, retry tier 30 s, per-service DLQ) and, only for `role = TEACHER`, creates the wallet with a 20-credit welcome bonus. STUDENTs have no wallet. Per-service RabbitMQ users restrict publishing to each service's own routing-key prefix. Legacy `EventType` enum values remain unused.

**Rationale**: Decouples service lifecycle and failure domains. If finance-service is down during a role change, the event is retained and replayed. New cross-service workflows can be added by publishing/consuming events without code changes to unrelated services.

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
│ routes.yaml proxy · JWT/revoke check · rate limit · no DB  │
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
| gateway-service | 3000 HTTP / 50051 gRPC (GatewayControl, internal) | HTTP + gRPC | Public entry: YAML-routed streaming proxy, JWT verify, revoke/stale check, rate limit, WS upgrade (`/ws/study`); no database |
| auth-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | RS256 JWT + JWKS, service tokens, roles (RBAC), Google OAuth, session/device management |
| exam-service | 3000 | HTTP | Quiz/flashcard/exam authoring, attempts, AI orchestration |
| finance-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Wallet, SePay QR payments, subscriptions |
| r2-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Cloudflare R2 storage |
| admin-service | 3000 HTTP | HTTP | Admin dashboard: users, stats, finance, logs, audit |
| ai-service | 3000 (compose) | HTTP | RAG, document processing, AI chat (Python FastAPI) |

---

## Cross-Service Communication Patterns

### HTTP Proxy (gateway → downstream)

gateway-service proxies HTTP requests to downstream services per `config/routes.yaml` (upstreams from `AUTH_SERVICE_URL`, `EXAM_SERVICE_URL`, `FINANCE_SERVICE_URL`, `ADMIN_SERVICE_URL`). Admin routes (`/api/v1/admin/*`) go to `admin-service` with `admin:access` checked at the edge as well. The gateway forwards the verified token as `Authorization: Bearer` and strips client-supplied `x-user-*` / `x-forwarded-*`. Auth and admin push revoke/stale-token signals to the gateway over gRPC `GatewayControl` and durable events. Every service also verifies the RS256 access token itself with `@examio/auth-jwt` (JWKS from auth, no DB or gRPC call per request); access is declared per handler (`@RequirePermissions('admin:access')` on admin routes). Details: [architecture](architecture.md) § 7.

### gRPC (synchronous, internal)

- auth-service `AuthService` (port 50051): token validation, session lookup
- finance-service `WalletService` (port 50051): credit deduction, balance check (`Debit`/`Credit`/`Refund` declared, `UNIMPLEMENTED` until a later phase)
- r2-service `R2Service` (port 50051): signed upload URLs, file deletion (incl. `DeleteObjects`)

Every container uses HTTP 3000 / gRPC 50051 (unified ports; separate network namespaces). admin-service has no gRPC server in the current compose.


### RabbitMQ (async, event-driven)

Exchange: `examio.events` (topic, durable). Only consumed event: `auth.user.authz_changed` (outbox) → `UserAuthzChangedHandler` in finance-service (wallet for TEACHER). `auth.user.registered` is published but has no consumer. See [architecture](architecture.md) § RabbitMQ.

### AI Orchestration (HTTP, exam-service → ai-service)

exam-service calls `aiApi.generateExamApi` (multipart) → returns `jobId` → frontend polls `getJobStatus` every 10s (up to 360 attempts / 60min). Completion stores result + refreshes wallet balance.

---

## Auth / Session Flow

1. User submits credentials → `POST /auth/login` → auth-service → returns `accessToken` (RS256 JWT, 15 min; claims `sub`, `sid`, `roles`, `email_verified`, `av`) + `refreshToken` (cookie) + `sessionId`; roles are `STUDENT` (default) or `TEACHER`, plus `SYSTEM_ADMIN` for flagged admins
2. Axios interceptor in `apis/api.ts` attaches `Authorization: Bearer {token}` + `X-Device-ID` header on every request
3. Each service's `JwtAuthGuard` verifies the token against auth's JWKS (stateless) and `PermissionsGuard` checks the declared permission (deny by default). `POST /auth/refresh` reloads the role, so a role change reaches the token within 15 min; `GET /auth/me` returns `roles`, `permissions` and `user.isSystemAdmin`
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

1. A SYSTEM_ADMIN grants TEACHER → `auth.user.authz_changed` (outbox) → `UserAuthzChangedHandler` creates the wallet with a 20-credit welcome bonus (also lazily on first wallet read; `yarn finance:reconcile-teachers` repairs missed ones). New registrations are STUDENTs without a wallet
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
- **Authorization**: `@examio/auth-jwt` guards in every service (permission per route, deny by default; [permissions](permissions.md)); role-based guards (`TeacherRoute`, `ProtectedRoute`, `PublicRoute`) on frontend routes; service tokens (`POST /internal/token`) on gRPC / inter-service calls
- **Data Encryption**: AES-256-CBC question encryption (server-side secret); client decrypts with `VITE_QUIZ_AES_KEY`; JWT answer token prevents tampering
- **API Security**: HttpOnly cookie `accessToken` (or Bearer) + `X-Device-ID` header; rate limit at gateway (default 100 req/min per user or IP, 5 req/min on credential routes); error envelope `{statusCode, code, message, requestId}`; 401 codes `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `TOKEN_STALE`; session invalidation on logout/device revocation takes effect at the gateway on the next request

---

## Scalability

- **Current Capacity**: Single-instance per service; PostgreSQL shared across all NestJS services via Prisma; Redis for session/cache; RabbitMQ for async decoupling
- **Scaling Strategy**: Service-level horizontal scaling behind gateway proxy; Redis cluster for session scale-out; RabbitMQ consumer groups for event processing parallelism; ai-service scales independently for GPU workloads
- **Performance Targets**: Gateway rate limit 100 req/min per client by default (per-route buckets in `routes.yaml`); AI generation polling up to 360 attempts (60min timeout); Redis cache TTL 5 minutes default; cursor-based pagination for large datasets

---

## Unresolved Questions

2. ~~Gateway has duplicate finance routes~~ — resolved 2026-10-20: proxy controllers removed; one `wallet` and one `payment` entry in `routes.yaml`.
4. `FREE_MODE = true` shipped in production code path in `FinanceClientService.deductCredits` — credit gating bypassed; needs env-gate or removal.
5. `ExamAttempt.submit` via `submitSecureQuiz` vs legacy `submitExamAttemptApi` — clarify canonical submission path.
6. `PendingJobDialog` rendered unconditionally in `KLayout` — check if it should be scoped to AI tool pages only.
7. `ProfilePage` reads both `getProfileApi` and `useAuthStore.user` — possible state drift; designate single source of truth.
8. `SubscriptionPage` vs `SubscriptionTemplate` — two subscription UIs; designate canonical screen.
9. `libs/database/src/schema.prisma` (27KB, canonical) vs `prisma/schema.prisma` (17KB, stale) — confirm single source of truth; deprecate stale copy.
