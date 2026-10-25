---
title: System Architecture
last_updated: 2026-10-24
source: rebuild-spec pipeline run (plans/260605-2033-rebuild-spec/); manually patched 2026-07-19 for Study-Together Room (first WebSocket transport); patched 2026-07-21 for Study Room playlist/access/moderation extension; patched 2026-10-20 for gateway rewrite (microservice-refactor phase 05); patched 2026-10-23 for phase 10 (cross-DB access cut) and phase 11 (database per service); patched 2026-10-24 for phase 12 (study-room-service and vocabulary-service extracted from exam)
status: ACTIVE
---

# System Architecture

## High-Level Diagram

```mermaid
graph TB
    subgraph Client[Client Layer]
        FE[examio-fe<br/>React 19 SPA<br/>Zustand · Axios · React Router]
    end

    subgraph Edge[Edge Layer]
        GW[gateway-service<br/>:3000 HTTP + :50051 gRPC control<br/>routes.yaml dispatcher, no DB<br/>JWT verify, revoke/av check, rate limit<br/>WS upgrade proxy /ws/study]
    end

    subgraph Backend[Backend — NestJS Monorepo]
        AUTH[auth-service<br/>:3000 HTTP<br/>:50051 gRPC]
        EXAM[exam-service<br/>:3000 HTTP, no gRPC server<br/>Quiz/Flashcard/Exam<br/>GenerationJob]
        AICHAT[ai-chat-service<br/>:3000 HTTP, no gRPC server<br/>AI chat + subjects, SSE]
        STUDY[study-room-service<br/>:3000 HTTP + Socket.io /ws/study<br/>Study rooms]
        VOCAB[vocabulary-service<br/>:3000 HTTP + :50051 gRPC<br/>Word families]
        FIN[finance-service<br/>:3000 HTTP<br/>:50051 gRPC<br/>Wallet/Payment/Sub]
        DOC[document-service<br/>:3000 HTTP + :50051 gRPC<br/>Uploads, quota, OCR status]
        R2[r2-service<br/>:3000 HTTP<br/>:50051 gRPC<br/>Cloudflare R2]
    end

    subgraph AI[AI Layer — Python]
        AISVC[ai-service<br/>:50051 gRPC AiService + :3000 /health only<br/>ai-worker: events<br/>RAG · LangGraph · Gemini]
    end

    subgraph Infra[Infrastructure]
        PG[(PostgreSQL<br/>one schema + role per service)]
        REDIS[(Redis<br/>Cache)]
        RMQ[RabbitMQ<br/>Topic exchange<br/>examio.events]
        R2STORE[(Cloudflare R2<br/>Object storage)]
    end

    FE -->|HTTPS via nginx: cookie accessToken + X-Device-ID| GW
    FE -->|WebSocket /ws/study via nginx /ws/, cookie accessToken| GW
    GW -->|HTTP proxy| AUTH
    GW -->|HTTP proxy| EXAM
    GW -->|HTTP proxy /api/v1/studyrooms, WS upgrade proxy ws:true| STUDY
    GW -->|HTTP proxy /api/v1/word-family| VOCAB
    GW -->|HTTP proxy /api/v1/ai/upload*, /r2/image| DOC
    GW -->|HTTP proxy| FIN
    GW -->|HTTP proxy| ADMIN
    AUTH -->|gRPC GatewayControl: RevokeSession, InvalidateUser| GW
    ADMIN -->|gRPC SetPageFlags, forwarded admin token| GW
    GW -->|boot pull: gRPC AdminService.GetPageFlags| ADMIN
    ADMIN -->|gRPC AuthUserService + auth RPCs| AUTH
    ADMIN -->|gRPC FinanceAdminService, FinanceStatsService| FIN
    ADMIN -->|gRPC WordFamilyAdminService, forwarded admin token| VOCAB
    EXAM -->|gRPC WordFamilyService.GetWordFamily| VOCAB
    VOCAB -->|gRPC DeleteObjects as vocabulary| R2
    VOCAB -->|gRPC GenerateWordFamily, svc:vocabulary token| AISVC
    EXAM -->|gRPC GetPublicProfilesByIds| AUTH
    STUDY -->|gRPC GetPublicProfilesByIds| AUTH
    RMQ -->|gateway.events: authz_changed, session.revoked| GW
    GW -->|revoke / av / rate limit / page flags| REDIS
    EXAM -->|gRPC Debit / Credit / Refund / GetWallet| FIN
    EXAM -->|gRPC DocumentService: CreateUpload, GetDocumentsByIds, AssertOwnership, ListDocuments, GetQuota, EnsureProcessed, DeleteDocuments| DOC
    EXAM -->|gRPC ListModels, svc:exam token| AISVC
    AICHAT -->|gRPC Query / StreamChat, svc:ai-chat token| AISVC
    AICHAT -->|gRPC DocumentService + GetUserBenefits, forwarded user token| DOC
    DOC -->|gRPC GetUserBenefits / Debit, forwarded user token; Refund, svc:document| FIN
    DOC -->|gRPC UploadFile, CreatePresignedDownload, DeleteObjects, svc:document| R2
    DOC -->|outbox document.uploaded / document.deleted| RMQ
    RMQ -->|ai.events: document.*, content.generation.requested| AISVC
    AISVC -->|outbox ai.document.*, ai.generation.*| RMQ
    RMQ -->|document.events: ai.document.processed / failed| DOC
    RMQ -->|exam.events: ai.generation.*, document.deleted| EXAM
    EXAM -->|outbox content.generation.requested, source=content| RMQ
    AUTH -->|outbox: auth.user.registered, auth.user.authz_changed| RMQ
    FIN -->|subscribe auth.user.authz_changed| RMQ
    RMQ -->|studyroom.events: authz_changed, user.updated| STUDY
    RMQ -->|exam.events: user.updated| EXAM
    AUTH -->|Prisma| PG
    EXAM -->|Prisma| PG
    FIN -->|Prisma| PG
    ADMIN -->|Prisma| PG
    STUDY -->|Prisma| PG
    VOCAB -->|Prisma| PG
    DOC -->|Prisma, schema document| PG
    AISVC -->|asyncpg, schema ai| PG
    AUTH -->|cache| REDIS
    STUDY -->|studyroom: keys, socket.io adapter| REDIS
    VOCAB -->|vocab: keys| REDIS
    EXAM -->|cache| REDIS
    FIN -->|cache| REDIS
    ADMIN -->|cache| REDIS
    R2 -->|upload| R2STORE
```

## Service Topology

Compose publishes only the gateway on the host, bound to loopback (`127.0.0.1:6369` -> 3000); see [Edge and network topology](#edge-and-network-topology). Ports are unified in containers (`deploy/docker-compose.yml`): every Nest service listens on HTTP `3000`; services with a gRPC server (auth, finance, r2, admin, vocabulary, document, ai, and the gateway's control server) use `50051`; exam and study-room have no gRPC server. `ai-service` serves gRPC on `GRPC_PORT` (50051) and `/health` plus the compat routes on `PORT` (3000 in compose; the `.env.example` default is `3434`). Each container has its own network namespace, so there is no collision. Local `yarn dev:*` runs set `PORT`/`GRPC_PORT` per service in each `.env`.

| Service | HTTP Port | gRPC Port | Runtime | Role |
|---------|----------:|----------:|---------|------|
| `gateway-service` | 3000 | 50051 (GatewayControl, internal only) | Node 22 | Public HTTP entry: YAML-routed streaming proxy, JWT verify, revoke/stale checks, rate limit, WS upgrade proxy (`/ws/study`). No database |
| `auth-service` | 3000 | 50051 | Node 22 | RS256 JWT issuer + JWKS, service tokens, OAuth, sessions, devices, roles (RBAC) |
| `exam-service` | 3000 | none | Node 22 | Quiz/flashcard authoring, exam sessions, `GenerationJob` (quiz/flashcard generation, charge and refund), `recent-uploads`, `word-family/:id/to-flashcard` bridge; `ROLE=api,worker` (event relay, generation reaper) |
| `ai-chat-service` | 3000 | none | Node 22 | AI chat (HTTP `/api/v1/ai-chat/*`, SSE stream and regenerate-stream) and public `/api/v1/subjects/*` (since phase 13); schema `aichat`; `ROLE=api,worker` (`r2_delete_tasks` worker for message images); consumes `aichat.events` in the API process |
| `study-room-service` | 3000 | none | Node 22 | Study-Together Room: HTTP `/api/v1/studyrooms/*` and Socket.io `/ws/study`; one container, consumes `studyroom.events` in the API process |
| `vocabulary-service` | 3000 | 50051 (`WordFamilyAdminService`, `WordFamilyService`, internal only) | Node 22 | Word families and categories, AI generation (gRPC `GenerateWordFamily` to ai-service), `r2_delete_tasks` worker (`ROLE=api,worker`) |
| `document-service` | 3000 | 50051 (`DocumentService`, internal only) | Node 22 | Uploaded files, monthly upload quota, OCR status, upload charge/refund (`doc:<id>`), `r2_delete_tasks` worker; `ROLE=api,worker` |
| `finance-service` | 3000 | 50051 | Node 22 | Wallet, SePay QR payments, subscriptions |
| `r2-service` | 3000 | 50051 | Node 22 | Cloudflare R2 object storage (proxy) |
| `admin-service` | 3000 | 50051 (`AdminService.GetPageFlags`, internal only) | Node 22 | Admin dashboard: users, stats, finance, logs, audit. Owns `AdminAudit` and `PageFeatureFlag` only |
| `ai-service` | 3000 (compose, `/health` and `/` only) | 50051 (`AiService`, service tokens only) | Python 3.12+ | RAG, OCR/embedding, chat answering for ai-chat-service, generation worker (LangChain + LangGraph). `ROLE` = `api` / `worker` / `migrate`; owns schema `ai` |

## Cross-Service Communication

### 1. HTTP Reverse Proxy (gateway -> downstream)

Source of truth: `examio-be/apps/gateway-service/config/routes.yaml` (route table), `src/pipeline/**` (guard chain, header hygiene, body cap), `src/routing/**` (matcher). The 15 per-domain proxy controllers, `ProxyService` and the gateway's own DB access were removed in phase 05; adding a route means editing `routes.yaml`.

```mermaid
sequenceDiagram
    participant FE as examio-fe / nginx
    participant GW as gateway:3000
    participant R as Redis
    participant EX as exam:3000
    FE->>GW: POST /api/v1/examrooms (cookie accessToken)
    GW->>GW: match route (YAML), verify RS256 via JWKS
    GW->>R: MGET gw:revoked:sid:<sid>, gw:user:<id>:av
    GW->>GW: permissions, page flag, body cap, rate limit (Lua on Redis)
    GW->>GW: prepare request: strip x-user-*, overwrite XFF, Authorization from cookie
    GW->>EX: stream request (no body parser)
    EX-->>GW: 201 Created
    GW-->>FE: 201 Created
```

- **Route table**: `upstreams` (`auth`, `exam`, `studyroom`, `vocabulary`, `finance`, `admin`) come from env with fallbacks (`AUTH_SERVICE_URL`, `EXAM_SERVICE_URL`, `STUDYROOM_SERVICE_URL`, `VOCABULARY_SERVICE_URL`, `FINANCE_SERVICE_URL`, `ADMIN_SERVICE_URL`; `${VAR}` required, `${VAR:-x}` default). A route has `match` (`path` regex, full-match, file order; else longest `prefix`), `auth` (`none` | `optional` | `required`), optional `methods`, `permissions`, `pageFlag`, `public` (method+path exceptions), `maxBodySize`, `timeout` (default 30 s; `0` = none, for SSE), `pathRewrite`, `websocket`. `upstream: self` routes (`/api/v1/status`, `/api/v1/config/*`) are served by Nest controllers in the gateway. Unmatched path: 404 `ROUTE_NOT_FOUND`. Auth `/.well-known/jwks.json`, `/internal/token` and r2 `internal/*` are deliberately not routed.
- **Dispatcher**: one pathless middleware (`pipeline/dispatcher.middleware.ts`) after helmet, CORS (answers every `OPTIONS` preflight) and `cookie-parser`. The app is created with `bodyParser: false`; `http-proxy-middleware` 3.0.7 streams bodies, so SSE and multipart pass through untouched.
- **Guard chain** (`pipeline/guard-chain.ts`, shared by HTTP and WS upgrade): authenticate -> coarse permissions (403 `EMAIL_NOT_VERIFIED` / `PERMISSION_DENIED`) -> page flag (403 `PAGE_DISABLED`) -> declared body size (413) -> rate limit (429 `RATE_LIMITED` + `Retry-After`).
- **Token**: `extractHttpToken`: `Authorization: Bearer`, then cookie `accessToken`; never the query string. Verified against auth's JWKS (`AUTH_JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`). Service tokens are refused at the edge (`TOKEN_INVALID`). On `optional` routes an unusable credential is stripped and the request continues anonymously.
- **Request preparation** (`pipeline/prepare-request.ts`) runs on the incoming request before it reaches http-proxy (http-proxy skips its `proxyReq` hook when `Expect` is present): client `x-user-*` and `forwarded`, `x-real-ip`, `x-internal-service-token`, `x-forwarded-port/prefix/server`, `x-original-url`, `x-rewrite-url` are removed; `x-request-id` is reused if well-formed else `req_<ulid>`; `x-forwarded-for` / `x-real-ip` are overwritten with the computed client IP, `x-forwarded-proto` / `-host` set; verified routes get `Authorization: Bearer <token>` (also when the token came from the cookie); `Expect` is dropped.
- **Body caps**: `maxBodySize` (e.g. `profile` 3mb, `r2-image` 3mb, `ai-upload` and `ai-chat` 100mb) is enforced on streamed bytes by a counting transform (`pipeline/body-cap.ts`), so a chunked body without `Content-Length` is also cut. Over the cap: 413 `PAYLOAD_TOO_LARGE`, upstream request destroyed, the rest of the body drained within a bounded byte/time budget.
- **Error envelope**: `{ statusCode, code, message, requestId }` on the gateway (`pipeline/error-response.ts`) and on auth (`HttpErrorEnvelopeFilter` from `@examio/http`). Gateway codes: `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `TOKEN_STALE` (all 401), `AUTH_STATE_UNAVAILABLE` (503), `EMAIL_NOT_VERIFIED`, `PERMISSION_DENIED`, `PAGE_DISABLED` (403), `RATE_LIMITED` (429), `PAYLOAD_TOO_LARGE` (413), `ROUTE_NOT_FOUND` (404), `UPSTREAM_UNAVAILABLE` (502), `UPSTREAM_TIMEOUT` (504), `INTERNAL_ERROR` (500). The FE reads `message`.
- **Rate limits** (fixed window, Lua `INCR` on Redis, key `gw:rl:<id>:<user id | client ip>:<window start>`; first matching `rateLimits` entry wins, else `defaultRateLimit` 100 / 60 s):

| Entry (`routes.yaml` `rateLimits`) | Limit |
|---|---|
| `POST` auth register, login, verifyAccount, send-code-reset-password, reset-password, send-code-change-password, change-password, google/one-tap | 5 / 60 s |
| `POST` auth refresh | 30 / 60 s |
| `POST` studyrooms/join; flashcard and exam-session `verify-code` / `with-code`; quiz-practice unlock; word-family generate | 5 / 60 s |
| `POST` ai generate-from-file, ai regenerate | 5 / 60 s |
| `POST` ai quick-upload, ai-chat stream and regenerate-stream | 10 / 60 s |
| `GET` flashcardsets / examsessions `users/search` | 30 / 60 s |
| `UPGRADE` `/ws/study` | 20 / 10 s |
| everything else | 100 / 60 s |

- **Redis-down policy** (`pipeline/auth-state.service.ts`): the revoke/`av` read has a 500 ms timeout. On failure, admin routes and every state-changing method (anything but GET/HEAD/UPGRADE) fail closed with 503 `AUTH_STATE_UNAVAILABLE`; non-admin GET/HEAD/WS pass (logged, counted). The rate limiter and page-flag read fail open.
- **Config surface**: `GET /api/v1/config/pages` (optional auth) and SSE `GET /api/v1/config/stream` (any authenticated user, no timeout) are served by the gateway from Redis (`config:pages:flags`, channel `config:pages`); the gateway has no DB (admin-service pushes the full flag map through the gateway's `SetPageFlags` RPC and never writes Redis itself; when Redis has no flags the gateway pulls them at boot from admin's `AdminService.GetPageFlags`, retrying, and a 60 s watcher keeps re-checking). Cache miss means every page is enabled; only an explicit `false` blocks (`pageFlag` routes: `ai-tool`, `manage-exam`, `flash-card`, `manage-exam-room`, `word-family`, `study-room`).
- **Edge hardening**: helmet, CORS allowlist from `CORS_ORIGINS` or `FRONTEND_URL` (production boot fails with neither; `credentials: true`; allowed headers `Content-Type`, `Authorization`, `Cookie`, `X-Requested-With`, `X-Device-ID`), `trust proxy` = 1 hop (nginx).

#### Gateway control plane (auth/admin -> gateway)

| Mechanism | Purpose | Redis effect |
|---|---|---|
| gRPC `GatewayControl.RevokeSession(sid, exp)` (caller `auth`) | deny a session's access token until it would expire | `gw:revoked:sid:<sid>` with TTL `exp - now` |
| gRPC `GatewayControl.InvalidateUser(user_id, authz_version)` (caller `auth`) | refuse tokens with `av` below the stored version (401 `TOKEN_STALE`) | `gw:user:<id>:av` via Lua SETMAX (idempotent, order-safe) |
| gRPC `GatewayControl.SetPageFlags(flags)` (allowlisted caller `admin`; called by admin-service `AdminPageConfigService` on every toggle, full map, serialized) | write page-flag cache, publish to SSE clients | `config:pages:flags` + channel `config:pages` |
| durable event `auth.user.authz_changed` (queue `gateway.events`) | twin of `InvalidateUser`; covers a lost gRPC call | same SETMAX |
| durable event `auth.session.revoked` | twin of `RevokeSession` | same revoked key; ignored if `exp` already passed |

The gRPC server listens on `GRPC_PORT` (50051) inside the internal network only and requires a service token with `aud = gateway` (`@ServiceOnly`). Auth calls it only when `GATEWAY_CONTROL_ENABLED=true` (compose default `true`, `GATEWAY_GRPC_URL=gateway:50051`); failures are logged, never block the mutation. Consumers use `@examio/messaging` with `dedupe: false` (handlers are idempotent), so the gateway needs no `processed_events` table and no DB. Source: `src/control/`, `src/events/`.

### 2. gRPC (synchronous inter-service)

```mermaid
sequenceDiagram
    participant EX as exam-service
    participant FIN as finance-service:50051
    EX->>FIN: gRPC WalletService.Debit(userId, amount, idempotencyKey) + caller's access token
    FIN-->>EX: { transaction, alreadyApplied }
    Note over EX,FIN: Charge before AI generation; a retry with the same key never double-charges
```

**Proto definitions**: `examio-be/proto/examio/<svc>/v1/` (packages `admin`, `ai`, `auth`, `common`, `document`, `events`, `finance`, `gateway`, `r2`, `vocabulary`), linted and generated with buf. `yarn proto:lint` runs `buf lint proto`; `yarn proto:gen` runs `buf generate` (ts-proto, output `libs/contracts/src/generated/`, gitignored) and is exposed as `@examio/contracts`. The Python ai-service generates its stubs with `apps/ai-service/scripts/gen_grpc.sh`. Client helpers live in `@examio/grpc`, HTTP helpers in `@examio/http`.

Finance `WalletService` money fields are `int32` (credits are whole numbers). `R2Service` has `DeleteObjects` and `CreatePresignedDownload` (service `document` only); r2's HTTP `internal/upload` route and its `INTERNAL_SERVICE_TOKEN` are gone. gRPC env: `AUTH_GRPC_URL`, `R2_GRPC_URL`, `FINANCE_GRPC_URL`, `GATEWAY_GRPC_URL`, `VOCABULARY_GRPC_URL` (admin and exam to vocabulary), `DOCUMENT_GRPC_URL` (exam and ai-chat to document), `AI_GRPC_URL` (exam, ai-chat and vocabulary to ai), `ADMIN_GRPC_URL` (gateway to admin), `GRPC_PORT` on each serving service.

**Data ownership (phase 10, enforced by the database since phase 11).** Each Prisma model is read and written by exactly one service; the services share one Postgres database but each has its own schema and role (see Database per service below): auth (`User`, `UserSession`, `VerifyAccountCode`, `ResetPasswordCode`, `RoleChangeLog`), finance (`Wallet`, `WalletTransaction`, `Payment`, `UserSubscription`), admin (`AdminAudit`, `PageFeatureFlag`), study-room (`StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock`), vocabulary (`WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily`, `R2DeleteTask`), exam (everything else, until later phases extract more services). `OutboxEvent` and `ProcessedEvent` are per-service. The map is `examio-be/scripts/check-model-ownership.ts` (`yarn check:ownership`, strict in CI, also catches relation access through `include`/`select`/nested writes); `yarn check:deps` runs dependency-cruiser with `.dependency-cruiser.cjs`. A service needing foreign data calls the owner over gRPC.

| Service (proto) | RPC | Guard |
|---|---|---|
| finance `WalletService` | `Debit`, `Credit`, `Refund` | `Debit`: user with `wallet:use` or service `exam`/`content`/`document`; `Credit`, `Refund`: those services only |
| | `CreateWallet` | service `auth` only |
| | `GetWallet` | user or service (self-or-service check) |
| finance `FinanceAdminService` | `AdjustBalance`, `RefundPayment`, `ChangeTier`, `ListPayments`, `ListSubscriptions`, `GetUserFinance` | `finance:admin` (user token only; actor is the token subject) |
| finance `FinanceStatsService` | `GetRevenueStats` | `stats:read` |
| auth `AuthUserService` | `UpdateUserAdmin`, `GetUserAdminDetail` | `user:manage` |
| | `SearchUsers` / `GetUserStats` | `user:search` / `stats:read` |
| auth `AuthService` | `GetPublicProfilesByIds` | any verified user or service |
| | `GetUsersByIds` | `user:manage` or service `admin` |
| gateway `GatewayControl` | `SetPageFlags` | service `admin` |
| admin `AdminService` | `GetPageFlags` | service `gateway` |
| vocabulary `WordFamilyAdminService` | `ListCategories`, `UpsertCategory`, `DeleteCategory` | `word_family:admin` (forwarded admin token) |
| vocabulary `WordFamilyService` | `GetWordFamily` | `@RequirePermissionsOrService([])`: no permission needed, any service caller; exam calls it with a service token of audience `vocabulary` (auth `SERVICE_AUDIENCES` must list it) |

**Money idempotency.** `WalletTransaction` has `idempotencyKey` and `balanceAfter`, unique on `(walletId, idempotencyKey)`; `Payment.refundIdempotencyKey` is unique. Stored keys are namespaced: `debit:`, `credit:`, `refund:<debit key>` (a debit refunds at most once), `adjust:`, `refund-payment:`, `welcome:`. Replaying a key returns the original transaction with `alreadyApplied = true`; the same key with a different request fails `FAILED_PRECONDITION` `IDEMPOTENCY_KEY_REUSED`. `UpdateBalance` no longer exists. `Debit` creates the welcome wallet only when the forwarded token belongs to a TEACHER; otherwise a missing wallet is `WALLET_NOT_FOUND`. Admin HTTP finance actions accept an `Idempotency-Key` header (1-200 chars) and answer with `alreadyApplied`. Exam charges through the shared client in `libs/grpc` (`FinanceClient`), where `AI_FREE_MODE=true` skips charging but is forced off when `NODE_ENV=production`.

### 3. RabbitMQ Topic Exchange (async events)

```mermaid
graph LR
    AUTH[auth API] -->|same tx| OUTBOX[(outbox_events<br/>source=auth)]
    OUTBOX -->|auth worker relay<br/>claim, publish, mark| EXCHANGE[examio.events<br/>topic, durable]
    EXCHANGE -->|auth.user.authz_changed| FQ[finance.events]
    FQ -->|finance worker consumer<br/>processed_events dedupe| WALLET[(Wallet<br/>WalletTransaction)]
    FQ -.->|transient error| RETRY[finance.retry.30s<br/>TTL 30s, max 5]
    RETRY -.-> FQ
    FQ -.->|permanent / 5 retries| DLQ[finance.dlq]
```

**Library**: `@examio/messaging` (`examio-be/libs/messaging`), used by auth, finance, the gateway, study-room-service (consumer only: `authz_changed` and `user.updated`), document-service and exam-service (`user.updated`, `ai.generation.*` and `document.deleted` consumers; it writes `content.generation.requested` to its outbox). vocabulary-service has no RabbitMQ. ai-service uses a Python port of the same contract (`apps/ai-service/src/backend/messaging`: envelope, consumer, outbox relay, purge; queue `ai.events`, retry tier `ai.retry.30s`, `ai.dlq`, dead-letter at `x-retry-count >= 5`; a shared topology contract keeps the queue arguments identical). `MessagingModuleOptions.alsoPublishes` lets a service write outbox rows whose `source` is another domain: exam publishes `content.*` (`source=content`) until content-service exists (phase 14).

**Envelope v1**: `{ id: "evt_<ulid>", type, version: 1, occurredAt, source, correlationId, data }`. AMQP props: `messageId=id`, persistent, `application/json`. `parseEnvelope` rejects `version !== 1` as permanent. State events (`*.updated`, `*.changed`, `*_changed`) must carry a numeric version (`data.version`, or `data.authzVersion` for `auth.user.authz_changed`); `createEnvelope` throws otherwise.

**Producer (transactional outbox)**: `OutboxService.add(tx, type, data)` inserts into `outbox_events` inside the caller's Prisma transaction (the service's own schema; each row has a `source`). The relay (worker role) polls every 500 ms: (1) short claim tx sets `locked_until = now()+30s` on up to 100 unpublished rows of its own `source` (`FOR UPDATE SKIP LOCKED`); (2) publishes with broker confirms outside any tx; (3) marks `published_at`, or on failure `attempts+1`, `next_attempt_at` with backoff `min(2^attempts, 300)s`, `last_error`. A crash between publish and mark re-publishes after the lock expires; consumers absorb duplicates. The relay uses its own `pg.Pool({ max: 2 })`. A daily purge (03:00, `node-cron`) deletes `outbox_events` published more than 7 days ago and `processed_events` older than 14 days, in batches of 5 000.

**Consumer**: `@EventHandler('<type>', { dedupe?: boolean })` methods are discovered and bound to `<svc>.events` (prefetch 10).
- Source validation: `envelope.type` must equal the routing key and `envelope.source` its first segment, else `PermanentEventError('SOURCE_MISMATCH')` goes to the DLQ.
- Dedupe (default): in one tx, `INSERT processed_events(consumer, event_id) ON CONFLICT DO NOTHING`; zero rows means duplicate, ack. Otherwise the handler runs with `(envelope, tx)` and acks after commit. `dedupe: false` is for handlers idempotent by construction.
- Transient error: republished to `<svc>.retry` (fanout) with `x-retry-count+1` and the original routing key, then acked. After `<svc>.retry.30s` (TTL 30 s) it dead-letters via `<svc>.requeue` back to `<svc>.events`. Count >= 5 or `PermanentEventError`: `nack(requeue=false)` to `<svc>.dead` then `<svc>.dlq`.

**Process role**: env `ROLE` = `api` | `worker` | `api,worker` (default `api,worker`; compose sets `api,worker` for auth, finance, exam, vocabulary and document). study-room-service has no `ROLE`: its consumer needs the Socket.io server, so it runs in the API process of a single container. `worker` runs the relay/purge (auth) or the consumer (finance) via `worker.module.ts`.

**Broker security**: one RabbitMQ user per service (`auth`, `finance`, `exam`, `studyroom`, `document`, `ai`, `gateway`) plus the ops user from `RABBITMQ_USER`/`RABBITMQ_PASS` (management UI only). Per user: configure/write/read limited to `examio.events` and `<svc>.*` (legacy: `exam-service` for exam). Topic permissions on `examio.events`: write only `^<domain>\.`, read `.*`; user `exam` may write `^(exam|content)\.` until phase 14. So a validated `source` cannot be forged. Users come from `deploy/rabbitmq/definitions.template.json` (committed, no secrets), rendered by the one-shot `rabbitmq-defs` compose service (`render-definitions.cjs`) into the gitignored `definitions.json` (compose and CI pass `--out`; without `--out` the script writes `<os.tmpdir()>/definitions.json`, never into the repo tree) and loaded at broker boot (`rabbitmq.conf`). Each service gets its own `RABBITMQ_URL`; broker passwords must be URL-safe because they are embedded in `amqp://` URLs. Broker image: `rabbitmq:3.13-management-alpine`.

**Currently wired events**:
- `auth.user.registered` (auth-service): `{ userId, email, username, utmSource|null }`, written to the outbox in the register tx (email and Google OAuth paths). No consumer since phase 04 (finance's `UserRegisteredHandler` was removed; STUDENTs have no wallet). Replaces `auth.user.created`.
- `auth.user.authz_changed` (auth-service -> finance-service): `{ userId, authzVersion, role, isSystemAdmin, isBanned, reason, version }` (proto `UserAuthzChanged`, `reason` is one of role, admin, password, ban, unban, reapply). Written to the outbox in the same tx as the change. Finance (`UserAuthzChangedHandler`) provisions wallet (20 credits, once) + Free subscription row only when `role = TEACHER`; everything else is a no-op. study-room-service (`study-room-authz.handler.ts`, queue `studyroom.events`) also consumes it to close stale study-room sockets (`auth:reauth` then disconnect). exam no longer binds this key (on a pre-existing broker the stale binding on `exam.events` stays until the broker is reset).

- `auth.user.updated` (auth-service): state event written to the outbox in the tx that changes a profile field (`changed` is a subset of `name`, `bio`, `avatar`, `banner`, `is_verified`; `version` is `updatedAt` in epoch ms); exam-service (consumer registered in `modules/user-profile/user-profile.module.ts`) invalidates `exam:cache:user:<id>` and study-room-service invalidates `studyroom:cache:user:<id>` on it; both handlers are `dedupe: false`.

- `document.uploaded` / `document.deleted` (document-service, outbox): `document.uploaded` carries `storageId`, `userId`, `filename`, `mimetype` and a presigned `downloadUrl` (1 h); consumed by ai-service (OCR, chunking, embedding, graph; prefetch 1). `document.deleted` (`storageIds[]`, `userId`) is consumed by ai-service (vectors, entities, graph) and exam (nulls `HistoryGenerated*.userStorageId`, detaches ai-chat links).
- `ai.document.processed` / `ai.document.failed` (ai-service, outbox) -> document-service (`document.events`): `COMPLETED` / `FAILED`; on failure of a charged upload it issues `Refund(doc:<id>)` and clears `creditCharged` in the same tx. Failures always publish `ai.document.failed` so the refund cannot be skipped.
- `content.generation.requested` (exam, `source=content`) -> ai-service: `jobId`, `userId`, `storageId`, `type`, `options`, `model`, plus optional `downloadUrl` / `mimetype` (so ai-service can process a chunk-less document inline). Answers: `ai.generation.completed` (items inline up to 512 KB) or `ai.generation.failed` -> exam (`GenerationJob`, conditional updates; a late event after a cancel or timeout is ignored).

**Defined but unused**: the remaining `EventType` enum values in `libs/common/src/events` (`USER_CREATED` was removed).

### 4. Admin Service

**Location**: `apps/admin-service/`
**HTTP Port**: 3000 (container)
**gRPC Port**: 50051 (`GRPC_PORT`; serves `AdminService.GetPageFlags` to the gateway, `@ServiceOnly('gateway')`)

**Auth**: per-controller `@RequirePermissions(...)` from `@examio/auth-jwt` (stateless JWT; `user:manage` for users, `role:assign` for `/admin/roles*`, others per phase 06). Role, admin-flag and ban changes are RPCs to auth (`AUTH_GRPC_URL`: `SetUserRole`, `SetSystemAdmin`, `SetUserStatus`, `ListUsers`, `ListRoleChanges`) that forward the calling admin's own token (`forwardUser(req)`), so auth decides from the token `sub` and permissions; admin-service writes `AdminAudit` only after the RPC succeeds and answers with the `HttpErrorEnvelopeFilter` envelope. It no longer owns the bootstrap (see § 7).

**Proxy**: `routes.yaml` routes `/api/v1/admin/*` to `admin-service` (`auth: required`, `permissions: [admin:access]`); the SSE `GET /admin/logs/stream` is `auth: none` at the edge because EventSource cannot send headers, and admin-service checks the single-use ticket from `POST /admin/logs/ticket`.

**Modules**:
- `AdminStatsModule` — KPI overview + time-series charts, built from auth `GetUserStats` in parallel with finance `GetRevenueStats` (5-minute cache; parity golden test)
- `AdminFinanceModule` — payment refunds, credit adjustments, tier changes, payment/subscription lists via finance `FinanceAdminService` (`Idempotency-Key` header, `alreadyApplied` in responses); no direct DB access to finance models
- `AdminLogsModule` — server-side log retrieval
- `AdminUsersModule` — list/detail/patch, ban/unban (auth `SetUserStatus`)
- `AdminRolesModule` — role matrix, user role list, role change history, set base role / SYSTEM_ADMIN (auth RPCs, `role:assign`)
- `AdminWordFamilyModule` — category list/create/update/delete via vocabulary `WordFamilyAdminService` (`VOCABULARY_GRPC_URL`); the image is a pasted URL, and the owner (vocabulary) deletes R2 objects only under the `word-family/` prefix
- `AdminAuditModule` — audit log query (one row per changed field per mutation)

**Audit**: every admin mutation writes an `AdminAudit` row via `AuditWriterService` (shared, `@examio/common`). Fields captured: `adminId`, `targetId`, `action`, `payload` (JSON diff of changed fields), `ipAddress`, `userAgent`.

**Rate limiting**: `ThrottlerModule` 30 req/min per admin (configured via `THROTTLE_ADMIN_LIMIT`).

### 5. AI generation and document processing (gRPC + events)

Generation is asynchronous and idempotent per job: one `Debit` with key `gen:<jobId>`, conditional status updates, and a refund path for every failure.

```mermaid
sequenceDiagram
    participant FE as examio-fe
    participant EX as exam-service
    participant DOC as document-service
    participant FIN as finance-service
    participant AI as ai-service (worker)
    FE->>EX: POST /ai/generate-from-file (multipart, via gateway)
    EX->>DOC: gRPC CreateUpload(charge_credits=false, reuse_duplicate=true)
    DOC-->>EX: document (new or reused)
    EX->>EX: tx insert GenerationJob PENDING_CHARGE
    EX->>FIN: gRPC Debit(key gen:jobId, upload + generation credits)
    EX->>EX: tx QUEUED + outbox content.generation.requested
    EX-->>FE: { jobId, newBalance }
    EX-)AI: event content.generation.requested (+ downloadUrl)
    AI-)EX: event ai.generation.completed | failed
    EX->>EX: COMPLETED + HistoryGenerated* | FAILED + Refund(gen:jobId)
    loop poll
        FE->>EX: GET /ai/job/{jobId}
    end
```

#### AI chat (phase 13)

ai-chat-service answers `POST /ai-chat/:chatId/message` through gRPC `AiService.Query` (deadline 60 s) and `.../stream` and `message/:id/regenerate-stream` through `AiService.StreamChat` (server stream, no deadline, 60 s idle timeout), both with a `svc:ai-chat` service token. The SSE is written by hand (`text/event-stream`, `X-Accel-Buffering: no`, `: hb` every 15 s). Until the first frame arrives a failure is an HTTP status (`RESOURCE_EXHAUSTED` 429, `PERMISSION_DENIED`/`UNAUTHENTICATED` 502, `UNAVAILABLE` 503, deadline 504); afterwards it is an `event: error` frame. A client disconnect cancels the gRPC call and saves the text received so far; the gateway also destroys the upstream request when the client closes a streamed route (`abortOnClientClose` in `pipeline/proxy-factory.ts`), so the LLM call stops. Document RPCs (`GetDocumentsByIds`, `AssertOwnership`, `EnsureProcessed`, `DeleteDocuments`) and finance `GetUserBenefits` (cached `aichat:benefits:<id>`, 5 min) use the forwarded user token. Deleting a chat calls `DeleteDocuments` once (503 keeps the chat), then queues `r2_delete_tasks` for message images under `images/<ownerId>/` only. The free tier is limited to 6 messages a minute (429 `RATE_LIMITED`). Chats and documents of another user answer 404; `systemPrompt` is never in a response.

`finance.subscription.changed` carries the effective tier (an inactive subscription is tier 0) and fires on admin set-tier, activation, reactivation and expiry; ai-chat drops `aichat:benefits:<id>` on it and unlinks documents on `document.deleted` (queue `aichat.events`). Expiry is flipped by `SubscriptionExpiryService.expireIfLapsed` on read paths and by a finance worker sweeper every `SUBSCRIPTION_EXPIRY_SWEEP_MS` (default 60000, batch 200).

Upload path (`POST /ai/upload`, JSON): document-service inserts `UserStorage` as `PENDING_CHARGE`, calls `Debit(doc:<id>)` with the forwarded user token, then sets `PENDING` + `creditCharged` and writes `document.uploaded`; ai-service OCRs and answers `ai.document.processed|failed`. Refund rules are in [business-rules](business-rules.md#ai-credits-charge-and-refund-phase-15).

### 6. WebSocket / Socket.io (bidirectional realtime — Study-Together Room)

**First WebSocket transport in the backend.** Prior to this, realtime/async communication was HTTP request-response, SSE (server → client only), RabbitMQ (async events), and gRPC (synchronous inter-service) — see sections 1–5 above. This is additive, not a replacement for any of those.

```mermaid
sequenceDiagram
    participant FE as examio-fe
    participant GW as gateway:3000
    participant EX as study-room-service<br/>StudyRoomGateway
    participant R as Redis
    FE->>GW: WS upgrade /ws/study (cookie accessToken)
    GW->>GW: verify token, revoke/av, page flag study-room, ws-upgrade limit
    GW->>EX: http-proxy ws:true forward (single public entry preserved)
    EX->>EX: StudyRoomSocketAuth.authenticate (stateless JWT verify + banned/deleted check)
    EX-->>FE: room:snapshot (roster, timer, media, chat backlog)
    FE->>EX: timer:start / media:play / chat:send / ...
    EX->>R: read/write live state (timer, media position, chat LIST capped 200, presence)
    EX-->>FE: timer:updated / media:updated / chat:message (broadcast to room)
    Note over EX,R: @socket.io/redis-adapter (RedisIoAdapter) fans broadcasts out<br/>across multiple study-room-service instances (adapter `key: 'studyroom'`)
```

- **Gateway**: the `study-ws` route (`prefix: /ws/study`, `websocket: true`, `auth: required`, `pageFlag: study-room`, no timeout) is handled by `ws/ws-upgrade.handler.ts` on the Node `upgrade` event. It runs the same guard chain as HTTP (token verify, revoke/`av`, page flag, `UPGRADE` rate limit 20 / 10 s per client IP), then `prepareUpgradeRequest` (same header hygiene) and hands the handshake to the proxy (`study-ws` and `studyrooms` point at the named upstream `studyroom`). A refused upgrade gets a bare status line with `X-Error-Code` and the socket is closed; any other path: 404 `ROUTE_NOT_FOUND`. HTTP long-polling on the same path takes the HTTP route with the same checks. socket.io's `handshake.auth` payload is not visible to the gateway, so study-room-service re-verifies in its socket middleware.
- **study-room-service**: `StudyRoomGateway` (`@nestjs/websockets`, path `/ws/study`); the FE client connects with `transports: ["websocket"]` (no long-polling, avoids sticky sessions)
- **Multi-instance fan-out**: `RedisIoAdapter` (`@socket.io/redis-adapter`) — required once `study-room-service` runs more than one instance, otherwise a broadcast only reaches sockets connected to the same process; also used to force-disconnect a banned member's socket regardless of which instance holds it (see Moderation below)
- **Auth**: JWT passed via `handshake.auth.token` (cookie `accessToken` fallback; the legacy `token` cookie is no longer read), verified in the socket `server.use` middleware by `@examio/auth-jwt`'s `TOKEN_VERIFIER` (RS256/JWKS), then `email_verified`, `study_room:join` and the token `av` against Redis `gw:user:<sub>:av` (phase 06). The guards skip `ws` contexts (the gateway class is declared `@Authenticated()` for the declaration test). A DB read remains only for display data and a banned/deleted check. Sockets join room `user:<id>`, are closed at token `exp` and on `auth.user.authz_changed`, each time after an `auth:reauth` event; connect failures surface as `connect_error` codes (see [permissions](permissions.md) § Per-endpoint enforcement)
- **State model**: Redis holds all live/ephemeral state (timer phase/cycle, YouTube media position, playlist playback position/leader, chat, presence); Prisma (`StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock`) holds room config, membership/focus-time totals, playlist item list (persisted, unlike other live state), and moderation/block state (persisted so it survives Redis flushes and reconnects)
- **Access control** (added 2026-07-21): `StudyRoom.accessType` — 0 PUBLIC (any authenticated user), 1 CODE (6-digit invite, existing), 2 WHITELIST (`StudyRoom.whitelist` userId list) — mirrors the `ExamSession` access model. `POST /api/v1/studyrooms/:id/join` added alongside the existing code-based `POST /studyrooms/join`
- **Playlist** (added 2026-07-21): `StudyRoomPlaylistItem` (ordered, `kind` 0 VIDEO / 1 PLAYLIST) per room; auto-advance is reported by a single designated "leader client" via `media:ended` (no YouTube Data API call) — the server treats that report as authoritative and advances `currentIndex`, broadcasting to the rest of the room. Add/remove/reorder gated by `StudyRoom.playlistAddPermission` (0 EVERYONE / 1 COHOST+ / 2 HOST); next/prev/jump reserved to host/cohost
- **Moderation** (added 2026-07-21): `StudyRoomMember.isBanned` (kick + block rejoin) / `.isMuted` (room-wide chat block), settable only by host/cohost, enforced server-side on every mutating event
- **Personal chat block** (added 2026-07-21): `StudyRoomChatBlock` — per-user, room-scoped; server-persisted, client-filtered; `blocks:updated` is sent only to the blocking user, not broadcast
- **WS event contract additions (2026-07-21)**, `study-room.events.ts` remains the source of truth:
  - client → server: `playlist:add`, `playlist:remove`, `playlist:reorder`, `playlist:next`, `playlist:prev`, `playlist:jump`, `media:ended` (leader-only), `chat:block`, `chat:unblock`, `member:ban`, `member:unban`, `member:mute`, `member:unmute`
  - server → client: `playlist:updated` (`{items, currentIndex, leaderUserId}`), `blocks:updated` (`{blockedUserIds}`, blocker-only), `member:moderated` (`{userId, isBanned?, isMuted?}`), `room:kicked` (sent to the banned member before forced disconnect)
- **Feature docs**: `docs/project-changelog.md` § Study-Together Room, § Study Room — Playlist, Access & Moderation

### 7. Identity and Authorization (phase 04)

Source of truth: `examio-be/libs/auth-jwt` (`@examio/auth-jwt`), `apps/auth-service/src/{token,roles,admin-bootstrap}`. Role-to-permission table: [permissions](permissions.md).

- **Tokens**: auth signs RS256 access tokens (`typ at+jwt`, default 15 min via `ACCESS_TOKEN_EXPIRATION`) with claims `sub`, `sid`, `roles`, `email_verified`, `av` (authz version). Public keys are served at `GET /.well-known/jwks.json` on auth (current key plus `JWT_RETIRED_PUBLIC_KEYS`). Refresh (`POST /auth/refresh`) reloads the account in a transaction, so the new token carries the current role/`av`; banned or deleted accounts are refused (`ACCOUNT_DISABLED`) and the session revoked.
- **Verification**: every service uses `AuthJwtModule.forRoot({ serviceName })`, which registers global `JwtAuthGuard` (verify against JWKS, no DB per request) then `PermissionsGuard` (deny by default, 403 `NO_AUTHZ_DECLARED`). The gateway registers it with `globalGuards: false`; its route-level checks are the guard chain in § 1, and its own Nest controllers (`status`, `config`) declare `@Public` / `@Authenticated`.
- **Declarations**: `@Public`, `@Authenticated`, `@AllowUnverified`, `@RequirePermissions`, `@RequireOwnerOrPermission(perm, OwnerResolver)` (permission or resource owner; phase 06), `@ServiceOnly`, `@RequirePermissionsOrService`. Since phase 06 exam, finance, admin and r2 handlers carry the real permission; plain `@Authenticated()` is limited to `test/authz/authenticated-allowlist.ts` and `test/authz/handler-declarations.spec.ts` fails CI on any undeclared handler or unlisted `@Authenticated()`. Per-endpoint table: [permissions](permissions.md). `apps/auth-service/test/allow-unverified-allowlist.spec.ts` pins the `@AllowUnverified` handlers.
- **Service tokens**: callers fetch `POST /internal/token` on auth (`client_credentials`: `client_id`, `client_secret`, `audience`; 5 min TTL; `ServiceTokenClient` caches per audience and refreshes 60 s early). Auth stores only sha256 hashes (`SERVICE_CLIENTS`). Service tokens have `sub = svc:<name>`, `roles = ["SERVICE"]`. gRPC calls send them in `authorization` metadata (`@examio/auth-jwt` `grpc-metadata`); RPCs taking a `user_id` use `assertSelfOrService`.
- **Cookies**: only auth sets them (`libs/common/src/utils/cookie-config.ts`): `accessToken` (`Path=/`, lives one access TTL) and `refreshToken` (`Path=/api/v1/auth`, 30 days); both `HttpOnly`, `SameSite=Lax`, `Secure` in production, host-only (no `Domain`). Logout (`clearAuthCookies`) clears them plus the legacy `token`, `session_id` and `refreshToken` names, including the `COOKIE_DOMAIN` variants in production. Neither the gateway nor any other service sets cookies.
- **Credential throttle**: auth's credential routes (register, login, verifyAccount, reset/change-password flows, google/one-tap) use `@StrictThrottle()` (5 / 60 s per IP, same budget as the gateway bucket, defense in depth); the marker makes the global throttler skip the handler so each request is counted once.
- **Roles**: `User.role` (`BaseRole` STUDENT | TEACHER), `User.isSystemAdmin`, `User.authzVersion`; every change goes through `RoleChangeService` (advisory lock, self-change and last-admin guards, `RoleChangeLog`, outbox event). The fast-path `InvalidateUser` / `RevokeSession` calls to the gateway are behind `GATEWAY_CONTROL_ENABLED` (code default off; compose default `true`) and are backed by durable events (§ 1).
- **Admin bootstrap** moved from admin-service to auth-service: `ADMIN_EMAILS` synced on auth start and by `yarn bootstrap:admin` (`:list`, `:grant <email> [--teacher]`, `:revoke <email>`), all through `RoleChangeService` with source `cli`/`bootstrap`. Re-running `grant` re-emits the event (recovery path).
- **Request validation (phase 06)**: every exam-service controller that takes input (11 of 14) declares `@UsePipes(ZodValidationPipe)` (`nestjs-zod`) on the class, so DTO violations answer 400. Multipart set forms (quiz set / flashcard set create and update) go through `parseSetForm` (`modules/common/multipart-body.ts`), which answers 400 `VALIDATION_FAILED`; query helpers are in `modules/common/query-schema.ts`. There is no global pipe in `main.ts`: a new controller must add the class-level pipe itself.
- **Access-code lockout and search**: shared helpers in `apps/exam-service/src/modules/common/` (`access-code-guard.ts`, `user-search.service.ts`); rules in [permissions](permissions.md).
- **Finance**: `yarn finance:reconcile-teachers` pages auth `ListUsers(role=TEACHER)` and ensures each wallet; `wallet:use` callers also get the wallet lazily on read.

## Data Flow — Quiz Taking

```mermaid
sequenceDiagram
    participant S as Student
    participant FE as examio-fe
    participant GW as gateway
    participant EX as exam-service
    participant PG as PostgreSQL
    S->>FE: Click "Start Exam"
    FE->>GW: POST /api/v1/examattempts/start
    GW->>EX: Forward
    EX->>PG: INSERT ExamAttempt (status=IN_PROGRESS)
    EX-->>FE: { attemptId }
    FE->>GW: GET /api/v1/examattempts/:id/secure-quiz
    GW->>EX: Forward
    EX->>EX: CryptoService.encryptContent (AES-256-CBC)
    EX-->>FE: { encrypted_questions, token_map }
    FE->>FE: lib/crypto.ts decrypt with VITE_QUIZ_AES_KEY
    S->>FE: Answer + submit
    FE->>FE: lib/secureQuizHelpers.ts signQuestionToken
    FE->>GW: POST /api/v1/examattempts/:id/secure-submit
    GW->>EX: Forward
    EX->>EX: CryptoService.verifyQuestionToken (server-side)
    EX->>PG: UPDATE ExamAttempt (status=COMPLETED, score=...)
    EX-->>FE: { score, answers, timeSpent }
```

## Tech Stack

### Frontend (`examio-fe/`)

| Layer | Technology | Version |
|-------|-----------|--------:|
| Framework | React | 19 |
| Build | Vite | latest |
| Language | TypeScript | 5.x |
| State | Zustand | latest |
| HTTP | Axios | latest |
| Routing | React Router | latest |
| UI | Radix UI primitives + custom (Tailwind 4) | latest |
| Editor | TipTap | latest |
| Animation | Framer Motion | latest |
| Charts | Recharts | latest |
| Bot protection | react-google-recaptcha-v3 | latest |
| i18n | i18next (`vi`, `en`, `ja`) | latest |
| Auth sync | httpOnly cookies (`withCredentials`) + `X-Device-ID` header; session (`user`, `roles`, `permissions`) from `/auth/me` held in Zustand, never persisted | — |
| Tests | Vitest (`yarn test`, `src/**/*.test.ts`, node env) | latest |

**Frontend RBAC (phase 09, 2026-10-22)**: routes go through `guarded()` → `RequirePermission` (`examio-fe/src/routes/index.tsx`); permission names are generated from `libs/auth-jwt/src/permissions.ts` into `src/types/permissions.generated.ts` (`yarn gen:fe-permissions`, CI `fe-permissions-drift`). `src/apis/api.ts` throws `ApiRequestError` (status, code, requestId) and applies the 401/403 policy of `src/lib/rbac/api-error-policy.ts` with a single-flight refresh shared with the study-room socket. Role change or logout resets role-scoped stores. Route, nav and error tables: [permissions](permissions.md) § Frontend route guards.

**Redis outage handling (exam-service)**: HTTP requests that fail with ioredis `MaxRetriesPerRequestError` answer 503 `SERVICE_UNAVAILABLE` (`RedisUnavailableFilter` from `@examio/redis`, registered globally in `main.ts`); `/ws/study` message handlers answer with an `error` event `SERVICE_UNAVAILABLE` (`StudyRoomWsExceptionFilter`) and lifecycle/timer work runs through `runSafely` so a Redis failure is logged, not an unhandled rejection. The web client treats it as retryable (bounded backoff).

### Backend (`examio-be/`)

| Layer | Technology | Version |
|-------|-----------|--------:|
| Framework | NestJS | 10+ |
| Language | TypeScript | 5.x |
| ORM | Prisma | latest |
| Database | PostgreSQL | 15+ |
| Cache | Redis | 7+ |
| Message broker | RabbitMQ | 3.13 (topic exchange) |
| gRPC | `@grpc/grpc-js` | latest |
| WebSocket | `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter` | latest |
| Object storage | Cloudflare R2 | — |
| Validation | Zod + `nestjs-zod` | latest |
| Auth | RS256 JWT (access 15 min, JWKS) + Passport Google OAuth | — |
| Encryption | AES-256-CBC + JWT answer tokens | — |
| Image preprocessing | jimp + cv (OpenCV.js) | — |
| Bot protection | Cloudflare Turnstile | — |
| Email | Nodemailer (Gmail SMTP); transport built lazily on first send, JSON transport (no network) when `NODE_ENV=test` or `MAIL_TRANSPORT=json`, production requires `EMAIL_USER`/`EMAIL_PASS` | — |
| Cron | @nestjs/schedule | latest |
| File upload | multipart/form-data (max 50MB for gRPC R2) | — |

### AI Layer (`examio-be/apps/ai-service/`)

| Layer | Technology | Version |
|-------|-----------|--------:|
| Framework | gRPC (grpc.aio) + FastAPI (`/health`, compat routes) | latest |
| Language | Python | 3.12+ |
| RAG | LangChain + LangGraph | latest |
| LLM | Gemini integration | latest |
| Vector search | FAISS | latest |
| Document processing | Docling | latest |
| OCR | tesseract.js (eng+vie) | — |

### Infrastructure

| Component | Purpose |
|-----------|---------|
| PostgreSQL 15+ | System of record (Prisma, one schema + role per service; pgvector in `extensions`) |
| Redis 7+ | Cache + pub/sub for events |
| RabbitMQ 3.13 | Async event bus |
| Cloudflare R2 | User file storage |
| Docker Compose | Deploy stack (gateway + 5 services + 3 infra + one `<svc>-migrate` one-shot per DB-owning service; split into `deploy/compose/*.yml`), networks edge / internal / egress |

## Database per service (phase 11)

One Postgres database, one schema and one login role per service. `libs/database` and `@examio/database` are gone.

| Service | Prisma schema | Migrations | Postgres schema / role |
|---|---|---|---|
| auth | `apps/auth-service/prisma/schema.prisma` | `apps/auth-service/prisma/migrations` | `auth` / `auth_svc` |
| finance | `apps/finance-service/prisma/schema.prisma` | `apps/finance-service/prisma/migrations` | `finance` / `finance_svc` |
| admin | `apps/admin-service/prisma/schema.prisma` | `apps/admin-service/prisma/migrations` | `admin` / `admin_svc` |
| exam | `apps/exam-service/prisma/schema/*.prisma` (multi-file) | `apps/exam-service/prisma/schema/migrations` | `exam` / `exam_svc` |
| study-room | `apps/study-room-service/prisma/schema.prisma` | `apps/study-room-service/prisma/migrations` | `studyroom` / `studyroom_svc` |
| vocabulary | `apps/vocabulary-service/prisma/schema.prisma` | `apps/vocabulary-service/prisma/migrations` | `vocabulary` / `vocabulary_svc` |
| document | `apps/document-service/prisma/schema.prisma` | `apps/document-service/prisma/migrations` | `document` / `document_svc` |
| ai (Python) | none (no Prisma; Alembic) | `apps/ai-service/alembic/versions` (one-shot `ai-migrate`, `ROLE=migrate`) | `ai` / `ai_svc`; `DB_SEARCH_PATH=ai,extensions`; one shared asyncpg pool, no runtime DDL, no access to other schemas |

- Roles `content` and `assessment` are also created (with `<SVC>_DB_PASSWORD`) but no service uses them yet; `studyroom` and `vocabulary` are used since phase 12, `document` and `ai` since phase 15, `aichat` since phase 13 (the temporary `ai_svc` grants on `exam` are revoked). All 11 roles and the `extensions` schema (pgvector) come from `deploy/postgres/init/01-service-schemas.sh`, which runs only on an empty data volume; existing dev stacks need `docker compose down -v` once. `PUBLIC` has no privileges, so a role selecting another service's table gets `permission denied` (checked by `test/db-isolation`, a CI step).
- `DATABASE_URL` per service: `postgresql://<svc>_svc:...@postgres:5432/examio?schema=<svc>`. There is no shared URL.
- Each service has a local Prisma module `apps/<svc>-service/src/prisma` (`PrismaPg` adapter, pool of 5, a database `ReadinessCheck` feeding `/health/ready`) and a generated client in `apps/<svc>-service/src/generated/prisma` (gitignored; `yarn prisma:generate` loops over `apps/*/prisma`).
- No foreign key points at `User` any more: other services keep `userId` (usually indexed), and read profile data from auth over gRPC.
- Migrations: `PRISMA_ADMIN_URL=... scripts/prisma-migrate-dev.sh <svc> <name>` (local only, diffs against a throwaway shadow DB); deploy applies them as the service role through the `<svc>-migrate` one-shot containers.
- Durable R2 deletion: `r2_delete_tasks` exists in the `auth`, `exam`, `vocabulary` and `document` schemas. `R2DeleteTaskWriter.enqueue(tx, keys)` inserts rows in the caller's own transaction; `R2DeleteWorker` (`libs/messaging/src/r2-delete`) claims batches with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff (cap 1 h) and stops retrying after 10 attempts (default `maxAttempts`), logging a stuck metric. exam, vocabulary and document therefore run `ROLE=api,worker` (document's worker calls r2 `DeleteObjects` as service `document`; vocabulary's worker calls r2 `DeleteObjects` as service `vocabulary`; it deletes only keys under `word-family/`, so a category image pointing at a generic `images/` upload is never deleted). auth, exam, vocabulary and document need `R2_PUBLIC_URL` so `r2KeyFromUrl` can map a stored URL to a key; URLs outside that host are never deleted.
- Admin `set-tier` first checks the user with auth (404 `USER_NOT_FOUND`) since it can no longer join to `User`.

## Key Architectural Patterns

1. **Gateway as single public entry** — every request hits the gateway first; routing is data (`routes.yaml`), not controllers
2. **Database per service** — each of auth, finance, admin, exam, study-room, vocabulary has its own Prisma schema, migrations and generated client; no FK crosses services (`userId` + index instead); `yarn check:ownership` still guards model access; cross-service data goes over gRPC
3. **Shared infra libs** — `@examio/common`, `@examio/redis`, `@examio/messaging`, `@examio/auth-jwt`
4. **Repository pattern with cache** — `BaseRepository<T>` wraps Prisma + Redis invalidation
5. **Composite screen detection** — single page with independent regions (REG###)
6. **Backend-for-frontend (BFF) pattern** — the frontend never calls ai-service; exam-service (generation), ai-chat-service (chat), vocabulary-service (word-family generation) and document-service (uploads) front it, over gRPC and events
7. **Optimistic UI with sendBeacon** — quiz auto-save uses `navigator.sendBeacon` on unload
8. **Event-driven wallet bootstrap** — `auth.user.authz_changed` (outbox) with `role=TEACHER` → finance creates wallet idempotently

## Cross-Cutting Concerns

| Concern | Implementation |
|---------|---------------|
| Auth | `@examio/auth-jwt`: `JwtAuthGuard` + `PermissionsGuard` (stateless, deny by default); see § 7 |
| Rate limiting | Gateway Lua fixed window from `routes.yaml` (default 100 / 60 s, per-route buckets, § 1); auth keeps `@StrictThrottle` (5 / 60 s) on credential routes |
| Logging | `LoggingInterceptor` (sanitizes sensitive body fields) |
| Cache invalidation | `BaseRepository` scoped to userId + itemId. Since phase 06 a cached `findOne` lives under the scope writes invalidate (`{id, owner}` item scope, `{id}` public scope, `{owner}` user `one:` scope), so create/update/delete/upsert/updateMany clear it. Wallet, wallet-transaction and payment caches are invalidated after commit by `invalidateWalletCachesBestEffort` (`@examio/common`; payment create/cancel, SePay webhook, admin refund/credit); a Redis failure there is logged, never fails the committed operation |
| Request validation | Zod via `ZodValidationPipe` on exam-service controllers; see § 7 |
| AMQP channel errors | `RabbitMQService.createChannel` (`libs/common`) and `AmqpConnection` (`libs/messaging`) attach an `error` listener to every channel (warn log; ChannelWrapper `error` / `Channel ended` no longer crash the process), and `RabbitMQService` closes its channels before the connection on shutdown |
| Bot protection | Cloudflare Turnstile on sensitive forms |
| Image preprocessing | jimp + OpenCV.js (grayscale → CLAHE → threshold → denoise → sharpen) |
| PDF OCR | pdf2pic + tesseract.js + ImagePreprocessingService |

## Deployment Topology

```mermaid
graph TB
    subgraph Production
        LB[Load Balancer<br/>HTTPS termination]
        GW[gateway :3000]
        AUTH[auth :3000/:50051]
        EXAM[exam :3000]
        STUDY[study-room :3000]
        VOCAB[vocabulary :3000/:50051]
        FIN[finance :3000/:50051]
        ADMIN[admin :3000]
        R2[r2 :3000/:50051]
        AI[ai :3000]
        PG[(PostgreSQL HA)]
        REDIS[(Redis HA)]
        RMQ[RabbitMQ HA]
    end
    LB --> GW
    GW --> AUTH
    GW --> EXAM
    GW --> STUDY
    GW --> VOCAB
    GW --> FIN
    GW --> ADMIN
    GW --> R2
    EXAM --> AI
    AUTH --> PG
    EXAM --> PG
    STUDY --> PG
    VOCAB --> PG
    FIN --> PG
    ADMIN --> PG
    AUTH --> RMQ
    FIN --> RMQ
    STUDY --> RMQ
    AUTH --> REDIS
    EXAM --> REDIS
    STUDY --> REDIS
    VOCAB --> REDIS
    FIN --> REDIS
    ADMIN --> REDIS
```

Docker Compose file: `examio-be/deploy/docker-compose.yml` (production-grade)

### Edge and network topology

```mermaid
graph LR
    CF[Cloudflare] -->|CF-Connecting-IP| NGX[nginx examio-fe<br/>real_ip + /api/ + /ws/]
    NGX -->|examio-edge| GW[gateway 127.0.0.1:6369]
    GW -->|examio-internal| SVC[auth / exam / study-room / vocabulary / document / finance / admin / r2 / ai]
    SVC --- DATA[(postgres, redis, rabbitmq)]
    SVC -->|examio-egress| NET[internet: OAuth, SMTP, SePay, R2, Gemini]
```

| Network | Members | Notes |
|---|---|---|
| `edge` (`examio-edge`) | gateway, FE nginx | only way in; bring this stack up first (it creates the network) |
| `internal` (`examio-internal`, `internal: true`) | every service, Postgres, Redis, RabbitMQ | no route out |
| `egress` (`examio-egress`) | auth, exam, finance, r2, ai | services that really call the internet; admin has none |

- Postgres, Redis and RabbitMQ publish no host ports; the gateway is published only as `127.0.0.1:6369:3000`.
- nginx (`examio-fe/nginx.conf`) includes `nginx/cloudflare-real-ip.conf` (real_ip from `CF-Connecting-IP`, trusted only from Cloudflare ranges) and **overwrites** `X-Forwarded-For` with `$remote_addr` on `/api/` and `/ws/`. The gateway trusts exactly that one hop, so rate-limit keys are the real client IP. `location /ws/` proxies to `${BACKEND_URL}/ws/` with `Upgrade` headers and 3600 s read/send timeouts.
- Operational detail: `examio-be/deploy/README.md`.

## Known Architectural Issues

| # | Issue | Source | Owner | Priority |
|---|-------|--------|-------|:--------:|
| A.1 | ~~`ocr-service` gRPC port collision~~ — resolved 2026-10-18: service deleted | scout + W7a | platform | P0 |
| A.2 | `FREE_MODE = true` shipped in `FinanceClientService.deductCredits` — credit gating bypassed | scout + W7a | backend | P0 |
| A.4 | `EventType` enum defines legacy events (unused); `auth.user.authz_changed` is consumed by finance (wallet), the gateway and study-room-service's authz handler; `auth.user.registered` is published without a consumer | W7a | backend | P3 |
| A.6 | `r2/image` (≤2MB cap) routed through `document-service` (was exam) rather than directly to `r2-service` | W7a | backend | P3 |
| A.7 | 12 v3.x legacy feature spec dirs in `docs/features/f001-*` (kebab-case) — now archived to `_archive/legacy-v3x/` | rebuild-spec | devops | ✅ done |

## Cross-References

- Service topology table: `docs/system/overview.md` § Service Summary
- Feature spec cross-references: `docs/features/F###_*/`
- Process flows: `docs/flows/FLOW###.md`
- Business rules: `docs/system/business-rules.md`
- Permissions: `docs/system/permissions.md`
- API map: `docs/generated/api-map.md`


## Operational Notes (2026-10-18, microservice-refactor phase 01)

- Health probes: `GET /health/live` and `GET /health/ready` (`libs/observability`), replacing `/api/v1/health`.
- Logs: pino JSON with `X-Request-Id` correlation.
- Schema: per-service migrations (see Database per service) applied with `prisma migrate deploy`; `db push` is no longer used. The phase-01 shared baseline (`libs/database`) no longer exists.
- Postgres, Redis and RabbitMQ are not published on host ports; reach them through the containers or an SSH tunnel (`examio-be/deploy/README.md`).
- Unverified users may only reach logout, sendVerificationEmail, verifyAccount, me (`@AllowUnverified`); other guarded routes return 403.
- CI: `.github/workflows/ci.yml` runs as a quality gate that `deploy.yml` requires before deploying.
