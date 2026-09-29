# System Overview

**Project**: kmaedu
**Generated**: 2026-06-05
**Architecture Type**: Distributed multi-service (NestJS monorepo + Python AI service + React 19 SPA)

---

## Executive Summary

kmaedu is a multi-tenant exam/quiz platform serving students and teachers. Authoring users create quiz sets, flashcard sets, and exam rooms; students take timed sessions under AES-256-CBC question encryption with JWT answer tokens. The backend is a NestJS monorepo of 10 services (gateway, auth, content, assessment, ai-chat, study-room, vocabulary, document, r2, admin) plus one Python AI service (gRPC + worker), fronted by a YAML-routed gateway (streaming proxy, no database). Each service owns its own database schema. There is no wallet, subscription or payment: usage is not metered, and AI cost is guarded only by the gateway rate limits. AI features (generation, document RAG, AI teacher chat) are offloaded to the Python AI service. Infrastructure runs on PostgreSQL + Redis + RabbitMQ (topic exchange `kmaedu.events`).

For architecture diagrams and tech stack details, see [architecture.md](architecture.md).

---

## Key Design Decisions

### Decision 1: Gateway as the Single Public Entry Point

**Context**: Eleven backend services plus one Python AI service each expose HTTP/gRPC listeners. Exposing them directly to the public internet creates a large attack surface and makes CORS and rate-limiting inconsistent.

**Decision**: All public HTTP traffic enters through `gateway-service` (port 3000). The gateway matches each request against the route table in `apps/gateway-service/config/routes.yaml` (path regex, else longest prefix), checks the token, revoke/stale state, permissions, page flag, body size and rate limit, then streams it to the upstream. Downstream services sit on the internal compose network; no backend port is published; the gateway runs as `gateway-a` and `gateway-b`, reached only through the FE nginx (the one host port, `FE_PORT`).

**Rationale**: Centralizes cross-cutting concerns (rate limiting: 100 req/min default plus per-route buckets, JWT verification, revoked-session check, logging) in one place. Simplifies frontend API wiring — one base URL. A new route is one entry in `routes.yaml`, not a new controller.

### Decision 2: AES-256-CBC Question Encryption with JWT Answer Token Map

**Context**: Quiz questions are authored once but served to many students. Storing plaintext questions in the database and on the wire exposes them to retrieval by non-participating users.

**Decision**: Server encrypts each question with AES-256-CBC using a per-exam secret stored server-side (`QUIZ_JWT_SECRET`). The client decrypts with `VITE_QUIZ_AES_KEY` (env var). Answers are submitted via a signed JWT token map (`CryptoService.signQuestionToken`) rather than raw payloads, preventing answer tampering and replay.

**Rationale**: Questions remain opaque to students who download network traffic; the JWT answer token prevents clients from forging submissions. The server-side secret is never shipped to the browser.

### Decision 3: gRPC for Inter-Service Synchronous Communication

**Context**: Several services need to be called by other services synchronously (e.g., content-service asking document-service to confirm the caller owns a file before generating AI content, assessment-service reading a quiz snapshot from content, or document-service fetching a signed R2 URL).

**Decision**: The services that others call expose gRPC on port 50051 per container: auth, r2, admin, vocabulary, document and content (plus the gateway's internal `GatewayControl` and the Python ai-service). assessment, ai-chat and study-room have no gRPC server; they are clients. Callers use the `@kmaedu/grpc` client modules rather than HTTP-calling the gateway. Proto definitions live in `kmaedu-be/proto/kmaedu/<svc>/v1` (buf-managed); generated TS stubs are `@kmaedu/contracts`.

**Rationale**: gRPC provides typed contracts, bidirectional streaming support, and lower latency than HTTP proxy chains for internal calls. Avoids circular gateway routing.

**Update (phase 10, 2026-10-23)**: gRPC is also how a service reads or writes data owned by another service. Each Prisma model has exactly one owning service (`kmaedu-be/scripts/check-model-ownership.ts`, enforced in CI by `yarn check:ownership` and `yarn check:deps`); exam (now content and assessment), admin and the gateway call auth, vocabulary (word-family admin and `GetWordFamily`), admin (page flags) and gateway (`SetPageFlags`) RPCs. Update (phase 11): the database is no longer shared at the access level; each service has its own schema and role. Update (phase 12, 2026-10-24): `WordFamilyAdminService` moved from exam to the new vocabulary-service, which also serves `WordFamilyService.GetWordFamily` to content. Update (phase 14, 2026-10-25): exam-service was split into content-service (gRPC server `ContentService`, used by assessment-service) and assessment-service (no gRPC server). Update (phase 15): document-service owns uploads and serves `DocumentService`. Details: [architecture](architecture.md) § gRPC.

### Decision 4: RabbitMQ Topic Exchange for Async Event-Driven Workflows

**Context**: Identity and permission changes (a role grant, a ban, a password change) must reach the gateway and study-room-service reliably, without coupling auth-service to them at the HTTP level.

**Decision**: auth-service writes `auth.user.authz_changed` to a transactional outbox in the same tx as every role / admin / ban / password change (`auth.user.registered` is still written at registration, with no consumer); its worker relay publishes to the durable topic exchange `kmaedu.events` (library `@kmaedu/messaging`). The gateway (stale-token state) and study-room-service (close stale sockets) consume it with idempotent handlers (retry tier 30 s, per-service DLQ). Per-service RabbitMQ users restrict publishing to each service's own routing-key prefix. Legacy `EventType` enum values remain unused.

**Rationale**: Decouples service lifecycle and failure domains. If the gateway is down during a role change, the event is retained and replayed. New cross-service workflows can be added by publishing/consuming events without code changes to unrelated services.

### Decision 5: Separate Python AI Service for RAG, Document Processing, and AI Chat

**Context**: AI workloads (embedding generation, vector search with FAISS, document OCR via Docling, ReAct agent orchestration) are I/O-heavy, stateful, and require different runtime characteristics (Python 3.12+, LangChain/LangGraph, Gemini). NestJS is not ideal for these workloads.

**Decision**: AI capabilities are extracted into a standalone Python service (`ai-service`) with its own process and its own database schema (`ai`). Synchronous AI calls go over gRPC (`kmaedu.ai.v1.AiService`, service tokens only); long work (OCR, generation) runs through RabbitMQ events between document-service, content-service and ai-service. AI chat (`ai-chat-service`) and word-family generation (`vocabulary-service`) also use gRPC since phase 13; ai-service HTTP serves only `/` and `/health`, and `AI_SERVICE_URL` and `INTERNAL_SERVICE_TOKEN` no longer exist. Frontend streams AI chat responses via SSE.

**Rationale**: Allows independent scaling, different dependency management, and GPU resource isolation. The AI service can be updated/replaced without touching the NestJS monorepo. content-service and document-service act as coordinators, not processors; ai-service never touches another service's tables.

---

## Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     kmaedu-fe (React 19 SPA)                │
│            Zustand stores · Axios · React Router            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS via FE nginx (the only host port)
                         │ cookie accessToken · X-Device-ID · /api/ and /ws/
┌────────────────────────▼────────────────────────────────────┐
│       gateway-service  (gateway-a + gateway-b, :3000)       │
│ routes.yaml proxy · JWT/revoke/av check · rate limit · no DB│
└──┬────────┬───────────┬─────────┬──────────┬────────────────┘
   │ HTTP   │ HTTP      │ HTTP    │ HTTP     │ HTTP (+ WS /ws/study)
   ▼        ▼           ▼         ▼          ▼
 auth     content    assessment  ai-chat   study-room
 :50051   :50051     (no gRPC)   (no gRPC) (no gRPC)

 also routed by the gateway: vocabulary :50051 · document :50051 · admin :50051
 not routed: r2 :50051 (storage proxy, gRPC clients only)

gRPC between services (user token forwarded, or service token from auth):
  content    → document · vocabulary · ai · auth · r2
  assessment → content (quiz snapshot) · document · auth
  ai-chat    → ai (Query/StreamChat) · document · r2
  document   → r2                  vocabulary → ai · r2        study-room → auth
  admin      → auth · vocabulary · gateway                     auth → gateway (revoke / stale) · r2
  ai-service (Python): gRPC :50051 (service tokens only) + /health, plus ai-worker (events)

Events (RabbitMQ topic exchange kmaedu.events, outbox per service):
  auth → gateway · study-room · content · assessment (authz_changed, user.updated)
  content ⇄ ai · assessment    document ⇄ ai · content · ai-chat

Infrastructure: PostgreSQL (one schema + role per service, Prisma per service; ai-service uses Alembic) · Redis · RabbitMQ · Cloudflare R2
```

### Service Summary

| Service | Port | Protocol | Role |
|---|---|---|---|
| gateway-service | 3000 HTTP / 50051 gRPC (GatewayControl, internal) | HTTP + gRPC | Public entry: YAML-routed streaming proxy, JWT verify, revoke/stale check, rate limit, WS upgrade (`/ws/study`); no database |
| auth-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | RS256 JWT + JWKS, service tokens, roles (RBAC), Google OAuth, session/device management |
| ai-chat-service | 3000 | HTTP | AI chat (SSE) and subjects; schema `aichat`; calls ai-service over gRPC |
| content-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Quiz sets, flashcard sets (sharing, practice, study), `GenerationJob` (generation orchestration, no charge), `recent-uploads`, `word-family/:id/to-flashcard`, `/student/*` content routes; schema `content` |
| assessment-service | 3000 | HTTP | Exam rooms, sessions (with the quiz snapshot), attempts, cheating logs, `/student/*` exam routes; schema `assessment` |
| document-service | 3000 | HTTP + gRPC 50051 | Uploaded files, upload counts (no quota, no charge), OCR status |
| study-room-service | 3000 | HTTP + Socket.io (`/ws/study`) | Study-Together Room (phase 12; extracted from exam) |
| vocabulary-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Word families and categories (phase 12; extracted from exam) |
| r2-service | 3000 HTTP / 50051 gRPC | HTTP + gRPC | Cloudflare R2 storage |
| admin-service | 3000 HTTP / 50051 gRPC (`AdminService.GetPageFlags`, gateway only) | HTTP + gRPC | Admin dashboard: users, roles, stats, logs, audit, page flags |
| ai-service | 3000 (compose, `/health` only) / 50051 gRPC | gRPC + `/health` | RAG, OCR/embedding, chat answering, generation worker (Python; `ROLE` api / worker / migrate) |

---

## Cross-Service Communication Patterns

### HTTP Proxy (gateway → downstream)

gateway-service proxies HTTP requests to downstream services per `config/routes.yaml` (upstreams from `AUTH_SERVICE_URL`, `CONTENT_SERVICE_URL`, `ASSESSMENT_SERVICE_URL`, `STUDYROOM_SERVICE_URL`, `VOCABULARY_SERVICE_URL`, `DOCUMENT_SERVICE_URL`, `AICHAT_SERVICE_URL`, `ADMIN_SERVICE_URL`). Admin routes (`/api/v1/admin/*`) go to `admin-service` with `admin:access` checked at the edge as well. The gateway forwards the verified token as `Authorization: Bearer` and strips client-supplied `x-user-*` / `x-forwarded-*`. Auth and admin push revoke/stale-token signals to the gateway over gRPC `GatewayControl` and durable events. Every service also verifies the RS256 access token itself with `@kmaedu/auth-jwt` (JWKS from auth, no DB or gRPC call per request); access is declared per handler (`@RequirePermissions('admin:access')` on admin routes). Details: [architecture](architecture.md) § 7.

### gRPC (synchronous, internal)

- auth-service `AuthService` / `AuthUserService`: public profiles, user search, role and ban changes (forwarded admin token)
- r2-service `R2Service`: `DeleteObjects`, `CreatePresignedDownload`, upload
- content-service `ContentService` (quiz snapshot for assessment), document-service `DocumentService` (uploads, upload counts, `EnsureProcessed`, `DeleteDocuments`), vocabulary-service `WordFamilyService` / `WordFamilyAdminService`, admin-service `AdminService`, ai-service `AiService`

Every container uses HTTP 3000 / gRPC 50051 (unified ports; separate network namespaces). assessment, ai-chat and study-room have no gRPC server.


### RabbitMQ (async, event-driven)

Exchange: `kmaedu.events` (topic, durable). Main flows: `auth.user.authz_changed` (outbox) → the gateway (stale-token state) and study-room (close stale sockets); `auth.user.updated` → content, assessment and study-room profile caches; `document.uploaded|deleted`, `ai.document.*`, `content.generation.requested`, `ai.generation.*` between document, content and ai-service; `content.quizset.deleted` → assessment. `auth.user.registered` is published but has no consumer. Each consumer has a 30 s retry tier and a DLQ. See [architecture](architecture.md) § RabbitMQ.

### AI Orchestration (gRPC + events, content-service → ai-service)

`POST /ai/generate-from-file` (multipart) creates a `GenerationJob` (`QUEUED`, with the outbox row in the same transaction) and publishes `content.generation.requested`; ai-service answers `ai.generation.completed|failed`. The frontend polls `GET /ai/job/{jobId}` every 10s (up to 360 attempts / 60min). Completion stores the history. Details: [architecture](architecture.md) § 5.

---

## Auth / Session Flow

1. User submits credentials → `POST /auth/login` → auth-service → returns `accessToken` (RS256 JWT, 15 min; claims `sub`, `sid`, `roles`, `email_verified`, `av`) + `refreshToken` (both HttpOnly cookies set by auth) + `sessionId`; roles are `STUDENT` (default) or `TEACHER`, plus `SYSTEM_ADMIN` for flagged admins
2. Axios (`apis/api.ts`, `withCredentials`) sends the cookies and the `X-Device-ID` header on every request; the token is never in `localStorage`
3. Each service's `JwtAuthGuard` verifies the token against auth's JWKS (stateless) and `PermissionsGuard` checks the declared permission (deny by default). `POST /auth/refresh` reloads the role, so a role change reaches the token within 15 min; `GET /auth/me` (and login/refresh) returns `{ user, roles, permissions }` with `user.isSystemAdmin`, no wallet/subscription (the feature was removed)
4. OAuth (Google): redirect → backend `/auth/google` (or One Tap) → `/auth/google/callback` sets the `accessToken` / `refreshToken` cookies and redirects to the frontend; a native client (allowlisted app redirect) instead receives a one-time `?code=` and swaps it at `POST /auth/exchange`. `AuthSyncBootstrap` only hydrates the user from `/auth/me`
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

1. Teacher triggers generation on `AIToolPage` → frontend calls `POST /ai/generate-from-file` (multipart)
2. content-service stores the file through document-service (`CreateUpload`), creates a `GenerationJob` straight in `QUEUED` and writes `content.generation.requested` to the outbox in the same transaction → returns `{ jobId }` (no charge)
3. Frontend polls `GET /ai/job/{jobId}` every 10s (up to 360 attempts)
4. ai-service publishes `ai.generation.completed|failed`: content-service stores the generated history and marks the job `COMPLETED`, or marks it `FAILED`. Cancel, timeout and no-charge rules: [business-rules](business-rules.md#ai-generation-has-no-charge)
5. `PendingJobDialog` shows progress; job state persisted in localStorage (`pending_generation_job`) for resume on reload

> There is no charge and no per-user generation limit; AI cost is guarded only by the gateway rate limits. Generation stays TEACHER-only (`ai:generate`).

---

## Storage / RAG Pipeline

1. Teacher uploads a document → `POST /ai/upload` (JSON; the file is already in R2) → document-service records `UserStorage` (schema `document`) and publishes `document.uploaded` with a presigned download link
2. ai-service worker downloads the file, runs OCR (Docling), and publishes `ai.document.processed|failed`; document-service updates the status
3. Extracted text is chunked and embedded via LangChain + pgvector into schema `ai` (`Document`, `DocumentEntity`)
4. AI chat attaches document context via `UserStorageGraph` + `UserStorageGraphGroup` in schema `ai` (RAG retrieval); ai-chat-service reads document metadata through document gRPC
5. Frontend streams AI chat via SSE (`aiChatApi.ts`)

---

## Security Overview

- **Authentication**: JWT cookie (`accessToken`) + `refreshToken` cookie; Google OAuth via One Tap; Cloudflare Turnstile on auth forms
- **Authorization**: `@kmaedu/auth-jwt` guards in every service (permission per route, deny by default; [permissions](permissions.md)); frontend routes go through `guarded()` → `RequirePermission` (UX only; `ProtectedRoute` / `PublicRoute` for login-only and public pages); service tokens (`POST /internal/token`) on gRPC / inter-service calls
- **Data Encryption**: AES-256-CBC question encryption (server-side secret); client decrypts with `VITE_QUIZ_AES_KEY`; JWT answer token prevents tampering
- **API Security**: HttpOnly cookie `accessToken` (or Bearer) + `X-Device-ID` header; rate limit at gateway (default 100 req/min per user or IP, 5 req/min on credential routes); error envelope `{statusCode, code, message, requestId}`; 401 codes `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `TOKEN_STALE`; session invalidation on logout/device revocation takes effect at the gateway on the next request

---

## Scalability

- **Current Capacity**: Single-instance per service; one PostgreSQL database with a schema and login role per service (Prisma schema per service); Redis for session/cache; RabbitMQ for async decoupling
- **Scaling Strategy**: Service-level horizontal scaling behind gateway proxy; Redis cluster for session scale-out; RabbitMQ consumer groups for event processing parallelism; ai-service scales independently for GPU workloads
- **Performance Targets**: Gateway rate limit 100 req/min per client by default (per-route buckets in `routes.yaml`); AI generation polling up to 360 attempts (60min timeout); Redis cache TTL 5 minutes default; cursor-based pagination for large datasets

---

## Unresolved Questions

2. ~~Gateway has duplicate finance routes~~ — moot: the finance routes were removed together with finance-service.
4. ~~`FREE_MODE = true` in `FinanceClientService.deductCredits`~~ — moot: finance-service, `FinanceClient` and `AI_FREE_MODE` were removed.
5. `ExamAttempt.submit` via `submitSecureQuiz` vs legacy `submitExamAttemptApi` — clarify canonical submission path.
6. `PendingJobDialog` rendered unconditionally in `KLayout` — check if it should be scoped to AI tool pages only.
7. `ProfilePage` reads both `getProfileApi` and `useAuthStore.user` — possible state drift; designate single source of truth.
8. ~~`SubscriptionPage` vs `SubscriptionTemplate`~~ — moot: both subscription UIs were removed.
9. ~~`libs/database` schema vs stale `prisma/schema.prisma`~~ — resolved (phase 11): `libs/database` removed; one Prisma schema per service.
