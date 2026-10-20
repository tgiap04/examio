---
title: Examio Project Changelog
last_updated: 2026-10-20
---

# Examio Project Changelog

## [Unreleased] — 2026-10-20

### Changed

#### Microservice refactor, phase 06 (RBAC enforcement and security fixes; uncommitted on `refactor/microservice-rbac`)

- **Enforcement**: every exam/finance/admin/r2 handler declares a real permission (`@RequirePermissions`), or `@RequireOwnerOrPermission` / `@Authenticated()` on an allowlist with two-user negative specs. New decorator `@RequireOwnerOrPermission(perm, OwnerResolver)` in `@examio/auth-jwt`. Admin controllers use per-controller permissions instead of the class-level `admin:access`. CI: `test/authz` (declaration scan incl. WS gateways, STUDENT/TEACHER/admin matrix) and an exam e2e step with ownership + WebSocket specs. Per-endpoint table: [permissions](system/permissions.md).
- **Security fixes**: public quiz-set read removed; study/public payloads whitelisted by mappers (no answer key, `accessCode`, `whitelist`, emails); `users/search` TEACHER-only, no emails; access-code lockout with constant-time compare; non-owned resources answer 404; exam attempt `start` no longer admits the room host; pin / progress / recent-* need set or room access; word-family generation TEACHER-only, 20/day; admin PATCH user rejects `isAdmin` / `isSystemAdmin` / `role`; study-room socket checks `study_room:join`, `av`, token expiry.
- **Internals**: Zod validation pipe on 11 exam controllers; `BaseRepository.findOne` cache keys moved under the invalidated scopes; wallet/payment cache invalidation after commit, best effort (`invalidateWalletCachesBestEffort`); AMQP channels get `error` listeners; gateway `routes.yaml` exposes `GET /flashcardsets/public/:id` anonymously (matches the service `@Public()`).
- **Behaviour changes (clients)**:

| Area | Before | Now |
|---|---|---|
| Role scope | Any verified user | STUDENT on a TEACHER route, or TEACHER on `flashcard:study` / `exam:take` routes (except own-set preview): 403 `PERMISSION_DENIED` |
| `GET /quizsets/public/:id` | 200 | Removed (404) |
| `GET /flashcardsets/public/:id` | Via gateway needed a token | Anonymous; trimmed set (`tags`, cards, no code/whitelist) |
| Flashcard `study/:id`, `with-code` | Full entity (incl. code, whitelist) | `{ id, title, description, userId, thumbnail, isPublic, isPinned, viewCount, tag, flashCards[{id,question,answer,createdAt,updatedAt}], cardCount, creator{id,username,name,avatar}, createdAt, updatedAt }`; code-gated set without grant: 403 `CODE_REQUIRED` |
| Exam session `study/:id`, `with-code`, `get-public` | Included `answer`, `isCorrect`, `accessCode`, `whitelist`, host email | Question stem and options only; host as `{ id, username, name, avatar }` |
| `examrooms/get-public/:id` | Room + quiz set + host email | `{ id, title, description, host:{name,avatar} }`, only for a room with a PUBLIC session (else 404) |
| Exam attempt answers | Shown on completion | Examinee: only when COMPLETED and `showAnswersAfterSubmit`; host always |
| Non-owned resource | 403 | 404: exam attempts, cheating logs, exam session study/sharing, flashcard study/progress, pins, `ai-chat/:id/exists` (now `false`) |
| `verify-code` / `with-code` | Anonymous allowed, plain compare | Signed-in with `flashcard:study` / `exam:take`; 400 `INVALID_CODE_FORMAT` (not 6 digits), 400 `INVALID_CODE`, 429 `CODE_LOCKED { retryAfterSeconds }` after 5 wrong / 15 min, 503 `CODE_CHECK_UNAVAILABLE` |
| `users/search` | `email contains`, returned email, any length | `q` >= 3 chars else 400 `QUERY_TOO_SHORT`; prefix on username/name or exact email; `{ id, username, name, avatar }` |
| Sharing views, `generate-code` | Whitelist rows with email; new code wiped the whitelist | Whitelist rows without email; whitelist and visibility kept |
| `POST /flashcardsets/:id/share` | Any user with access | Owner only (student share button needs phase 07) |
| Set create/update (multipart) | Silent coercion | 400 `VALIDATION_FAILED`; other controllers: 400 from `nestjs-zod` |
| `POST /word-family/generate*` | Any user | TEACHER only; 429 `WORD_FAMILY_DAILY_LIMIT` after 20/day, 503 `GENERATION_LIMIT_UNAVAILABLE` |
| `recent-flashcards` | Every public set | Own, whitelisted or previously viewed sets |
| `/ws/study` `connect_error` | `UNAUTHORIZED` | `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `EMAIL_NOT_VERIFIED`, `PERMISSION_DENIED`, `TOKEN_STALE`, `SERVICE_UNAVAILABLE`, `UNAUTHORIZED`, `PAGE_DISABLED` |
| `/ws/study` lifetime | Until the client left | Server emits `auth:reauth { reason: 'TOKEN_EXPIRED' \| 'AUTHZ_CHANGED' }` then disconnects (at token `exp`, or on a role/ban change); client must refresh and reconnect (frontend work: phase 09). `room:kicked` is only for an in-room ban |

- **Known gaps**: the web student share button and quiz-set public access break until phases 07/09 (single production deploy of 06-09); `GET /quizsets/public/:id` removal is unchecked against mobile (`examio-app`); full legacy-text regeneration of the generated specs stays in plan phase 19.
- **Docs**: `system/permissions.md`, `system/business-rules.md`, `system/architecture.md`, `generated/permissions-matrix.md`, `generated/route-list.md`, `CLAUDE.md`, `AGENTS.md` updated.

#### Microservice refactor, phase 05 (gateway rewrite; uncommitted on `refactor/microservice-rbac`)

- **Gateway**: the 15 per-domain proxy controllers, `ProxyService`, `PageEnabledGuard`/`TogglePage` and the gateway's DB access are removed. Routing is now `apps/gateway-service/config/routes.yaml` (upstreams from `AUTH_/EXAM_/FINANCE_/ADMIN_SERVICE_URL`; `AI_SERVICE_URL` and `DATABASE_URL` no longer used). One dispatcher with `http-proxy-middleware` 3.0.7 streams bodies (SSE, multipart; no body parser). Pipeline: token verify (JWKS) -> revoked/`av` check -> permissions -> page flag -> body cap -> rate limit. Header hygiene runs on the incoming request (client `x-user-*` and `x-forwarded-*` stripped, `Expect` handled, `X-Forwarded-For` overwritten, `Authorization` built from the cookie). Per-route `maxBodySize` is enforced on streamed bytes (413 `PAYLOAD_TOO_LARGE`). Redis-backed (Lua) rate limits per route, default 100 / 60 s.
- **Control plane**: gRPC `GatewayControl` (`RevokeSession`, `InvalidateUser`, `SetPageFlags`) on `GRPC_PORT`; durable consumers (queue `gateway.events`) for `auth.user.authz_changed` and new `auth.session.revoked`; Redis keys `gw:revoked:sid:*`, `gw:user:*:av`, `gw:rl:*`. Redis down: admin routes and state-changing requests fail closed (503 `AUTH_STATE_UNAVAILABLE`), non-admin reads pass. `GATEWAY_CONTROL_ENABLED` defaults to `true` in compose.
- **WebSocket**: `/ws/study` upgrade is authenticated at the gateway (cookie/Bearer, revoke/`av`, `study-room` page flag, 20 upgrades / 10 s per IP); nginx gains a `/ws/` location.
- **Edge**: helmet, CORS allowlist (`CORS_ORIGINS` or `FRONTEND_URL`, required in production), error envelope `{ statusCode, code, message, requestId }` on gateway and auth.
- **Compose**: networks `edge` / `internal` / `egress`; Postgres, Redis and RabbitMQ no longer publish host ports; gateway published on `127.0.0.1:6369` only; gateway no longer depends on postgres/migration, but on rabbitmq. nginx takes the client IP from `CF-Connecting-IP` (`examio-fe/nginx/cloudflare-real-ip.conf`) and overwrites `X-Forwarded-For`. New required deploy env `RABBITMQ_GATEWAY_PASS`.
- **Behaviour changes (clients)**: new 401 codes `TOKEN_EXPIRED`, `SESSION_REVOKED` (logout/device revoke applies on the next request), `TOKEN_STALE` (role changed; refresh); cookies are now `accessToken` (`Path=/`) and `refreshToken` (`Path=/api/v1/auth`), HttpOnly, SameSite=Lax (was `none` in production), Secure in production, no `Domain`; auth no longer sets `token` / `session_id` and logout clears them as legacy names; the `token` cookie is no longer accepted by the gateway or the study-room socket; credential routes (login, register, verify, reset/change password, Google One Tap) are limited to 5 / min per IP and counted once (`@StrictThrottle`); unmatched paths return 404 `ROUTE_NOT_FOUND`.
- **Known gaps**: `apps/gateway-service/.env.example` still lists `AI_SERVICE_URL` and `AUTH_GRPC_URL`, which the gateway no longer reads; no admin-service caller of `SetPageFlags` yet (admin writes the cache itself).
- **Docs**: gateway sections of `system/architecture.md`, `system/overview.md`, `system/glossary.md`, `generated/route-list.md` (note only), `CLAUDE.md`, `AGENTS.md` and `examio-be/deploy/README.md` updated; full legacy-text rewrite stays in plan phase 19.

## [Unreleased] — 2026-10-19

### Changed

#### Microservice refactor, phase 04 (identity and RBAC core; uncommitted on `refactor/microservice-rbac`)

- **Roles**: `User.isAdmin` replaced by `User.role` (`BaseRole` STUDENT | TEACHER, default STUDENT), `User.isSystemAdmin` and `User.authzVersion`; new `RoleChangeLog` model; migration `20261018093802_rbac_core`. Only a SYSTEM_ADMIN grants TEACHER / admin; self-change blocked (`CANNOT_CHANGE_OWN_ROLE`), last active admin protected (`LAST_SYSTEM_ADMIN`).
- **JWT**: RS256 + JWKS (`GET /.well-known/jwks.json` on auth), claims `sub`, `sid`, `roles`, `email_verified`, `av`, access TTL 15 min; `JWT_SECRET` / `JWT_EXPIRATION` removed. Refresh reloads the role in a transaction. `GET /auth/me` returns `roles`, `permissions` and `user.isSystemAdmin`.
- **New lib `@examio/auth-jwt`** (stateless `JwtAuthGuard` -> `PermissionsGuard`, deny by default; `@Public`, `@Authenticated`, `@AllowUnverified`, `@RequirePermissions`, `@ServiceOnly`, `@RequirePermissionsOrService`; permission catalog; `ServiceTokenClient`; `assertSelfOrService`). Removed from `@examio/common`: `AuthGuard`, `OptionalAuthGuard`, `AdminGuard`, `AuthModule`, `AllowUnverified`, `sanitize-user`. No DB query per request.
- **Service tokens**: `POST /internal/token` (client_credentials, 5 min TTL); gRPC calls carry `authorization` metadata. Auth stores sha256 hashes in `SERVICE_CLIENTS`. Scripts: `scripts/gen-jwt-keypair.sh`, `scripts/gen-service-secret.sh`.
- **Finance**: `UserRegisteredHandler` removed; wallet (20 credits, once) + Free subscription row now provisioned on `auth.user.authz_changed` with `role = TEACHER`, lazily on wallet read for `wallet:use` callers, and by `yarn finance:reconcile-teachers`. STUDENTs have no wallet. `auth.user.registered` is still published, with no consumer.
- **Admin bootstrap** moved from admin-service to auth-service (`yarn bootstrap:admin`, `:list`, `:grant <email> [--teacher]`, `:revoke <email>`); admin-service grant/revoke call auth gRPC `SetSystemAdmin`.
- **Env (names)**: auth `JWT_PRIVATE_KEY`, `JWT_KID`, `JWT_RETIRED_PUBLIC_KEYS`, `JWT_ISSUER`, `JWT_AUDIENCE`, `SERVICE_CLIENTS`, `GATEWAY_CONTROL_ENABLED`; all services `AUTH_JWKS_URL`; callers `AUTH_TOKEN_URL`, `SERVICE_CLIENT_SECRET`; admin and finance `AUTH_GRPC_URL`.
- **Known gaps**: frontend still reads `user.isAdmin` (fixed in a later phase); `deploy/docker-compose.yml` still passes `ADMIN_EMAILS` / `ADMIN_DEFAULT_PASSWORD` to the admin container, not to auth.
- **Docs**: `docs/system/permissions.md` gains the current role-to-permission catalog; legacy `PERM###` text is rewritten in plan phase 19.

## [Unreleased] — 2026-10-18

### Changed

#### Microservice refactor, phase 03 (messaging foundation; uncommitted on `refactor/microservice-rbac`)

- **Lib**: new `@examio/messaging`: envelope v1, transactional outbox (`outbox_events`) with claim-then-publish relay, idempotent consumer (`processed_events`), `source` validation against the routing key, one 30 s retry tier + per-service DLQ, daily purge (published outbox rows > 7 d, `processed_events` > 14 d). New env `ROLE` (`api` | `worker` | `api,worker`, default `api,worker`); auth and finance gain `worker.module.ts`. New Prisma models + migration `20261018065200_messaging`.
- **Event rename**: `auth.user.created` -> `auth.user.registered`, written to the outbox inside the register transaction (email and Google). Finance consumes it (`UserRegisteredHandler`: wallet + 20 credits welcome transaction, skipped if the wallet exists). Fire-and-forget publish and `USER_CREATED` removed; the finance subscriber previously acked on error with no DLQ.
- **RabbitMQ**: image `3.13`; one broker user per service (`auth`, `finance`, `exam`, `ai`) plus the ops user, with topic permissions (write only own domain prefix). Definitions are rendered from `deploy/rabbitmq/definitions.template.json` by the one-shot `rabbitmq-defs` service into the gitignored `definitions.json`. Each service has its own `RABBITMQ_URL`.
- **Env (deploy)**: new `RABBITMQ_AUTH_PASS`, `RABBITMQ_FINANCE_PASS`, `RABBITMQ_EXAM_PASS`, `RABBITMQ_AI_PASS` (required; must be URL-safe); `RABBITMQ_URL` is no longer a shared `.env` value; `RABBITMQ_USER`/`RABBITMQ_PASS` now only the ops user. `setup-env.sh` and `deploy.yml` render definitions before `up`.

#### Microservice refactor, phase 02 (contracts and infra libs; uncommitted on `refactor/microservice-rbac`)

- **Protos**: moved from `libs/common/src/protos` to `examio-be/proto/examio/<svc>/v1` (auth, common, finance, gateway, r2), managed by buf. `yarn proto:lint` / `yarn proto:gen` (ts-proto into gitignored `libs/contracts/src/generated`); ai-service stubs via `apps/ai-service/scripts/gen_grpc.sh`.
- **Libs**: new `@examio/contracts`, `@examio/grpc` (client module, deadline/retry, error map), `@examio/http` (error envelope filter). `@examio/common` no longer exports gRPC client modules or protos.
- **Ports**: every container now listens on HTTP 3000; gRPC servers (auth, finance, r2) on 50051. The 7000-7006 / 50053 / 50054 / 50056 ports are gone; admin-service no longer opens gRPC.
- **Env**: `FINANCE_GRPC_URL` replaces `FINANCE_SERVICE_GRPC_URL` and `WALLET_GRPC_URL`.
- **Finance proto**: money fields are `int32`; `Debit`/`Credit`/`Refund` declared but `UNIMPLEMENTED` until a later phase. r2 proto gains `DeleteObjects`.
- **Behaviour change**: subscription limits (files per month, AI chat messages) are now actually enforced. A snake_case/camelCase field mismatch had silently disabled them; users over their tier limit will now be rejected.

#### Microservice refactor, phase 01 (guardrails and cleanup; uncommitted on `refactor/microservice-rbac`)

- **CI**: new `.github/workflows/ci.yml` quality gate; `deploy.yml` depends on it.
- **Runtime**: Node 22 images (`examio-be/Dockerfile`); pino JSON logs with `X-Request-Id`.
- **Health**: `GET /health/live` and `GET /health/ready` replace `GET /api/v1/health`.
- **Database**: `db push` replaced by a single baseline migration + `prisma migrate deploy`; `prisma:push` script removed. Postgres is no longer published on host port 5411 (SSH tunnel; see `examio-be/deploy/README.md`).
- **Auth**: unverified users may reach only logout, sendVerificationEmail, verifyAccount, me; other guarded routes return 403.

### Removed

- `ocr-service` (and `yarn dev:ocr`).
- ai-service: `score/`, dev agent, Streamlit UI, benchmark index.

## [Unreleased] — 2026-07-24

### Added

#### UTM Signup Attribution (Admin Dashboard + Auth)

Tracks first-touch `utm_source` for new signups and surfaces a breakdown on the admin stats dashboard.

- **Database**: `User.utmSource String? @db.VarChar(64)` (indexed) — `libs/database/src/models/user.prisma`.
- **Auth capture**: `RegisterDto.utmSource` (email signup); Google OAuth carries it through the `state` param; Google One Tap accepts it in the request body. Sanitized server-side (`sanitizeUtmSource` — whitelist charset, 64-char cap, rejects a spoofed literal `"direct"`) before being stamped on `User` at signup.
- **FE capture**: `src/lib/utmSource.ts` grabs `?utm_source` on first page load and persists it client-side (first-touch only) until signup; encoded into the OAuth `state` for Google flows.
- **Admin API**: `GET /admin/stats/sources` (canonical, `AdminStatsController`) + `GET /admin/sources` (FE-facing alias, `AdminStatsFeRoutesController`) — signup counts grouped by `utm_source` (null → `"direct"`), top 20 desc, optional date range.
- **Admin UI**: new "Top nguồn" (`SourceBreakdownChart`) card on `AdminStatsPage` (SCR034).

## [Unreleased] — 2026-07-21

### Added

#### Study Room — Playlist, Access & Moderation (web only)

Extends the Study-Together Room feature (2026-07-19 entry below) with an ordered YouTube playlist, room access control, and host/cohost moderation. **Web only** — no `examio-app` counterpart.

**Backend — `exam-service`**

- **Playlist**: `StudyRoomPlaylistItem` (Prisma, `libs/database/src/models/study-room.prisma`) — ordered list of videos or YouTube playlists (`kind` 0 VIDEO / 1 PLAYLIST) per room, persisted (unlike timer/media/chat, which stay Redis-only). Auto-advance is **server-authoritative but keyless** — no YouTube Data API call; instead a designated "leader client" (one member, tracked in Redis `PlaylistState.leaderUserId`) reports `media:ended` and the server advances `currentIndex` and broadcasts the new item to everyone else
  - Host/cohost can skip via `playlist:next`/`playlist:prev`/`playlist:jump`; add/remove/reorder gated by `StudyRoom.playlistAddPermission` (0 EVERYONE / 1 COHOST+ / 2 HOST)
- **Access control**: `StudyRoom.accessType` (0 PUBLIC — any authenticated user / 1 CODE — 6-digit invite / 2 WHITELIST — explicit `userId[]` in `StudyRoom.whitelist`), mirroring the existing `ExamSession` access model. New `POST /api/v1/studyrooms/:id/join` (`StudyRoomController.joinById`) alongside the existing code-based `POST /studyrooms/join`
- **Moderation**: `StudyRoomMember.isBanned` (kick + block rejoin) and `.isMuted` (room-wide chat block), settable only by host/cohost, enforced server-side on every mutating socket event. Ban propagates cross-instance via the existing `@socket.io/redis-adapter` (`RedisIoAdapter`) so a banned member is kicked from whichever `exam-service` instance holds their socket
- **Personal chat block**: `StudyRoomChatBlock` (Prisma) — per-user, room-scoped block list; server persists the block and also tells the blocking client's UI to filter (`blocks:updated` sends `{blockedUserIds}` to the blocker only — not broadcast room-wide)
- WS event contract (`study-room.events.ts`, still the source of truth) gains:
  - client → server: `playlist:add`, `playlist:remove`, `playlist:reorder`, `playlist:next`, `playlist:prev`, `playlist:jump`, `media:ended` (leader-only), `chat:block`, `chat:unblock`, `member:ban`, `member:unban`, `member:mute`, `member:unmute`
  - server → client: `playlist:updated` (`{items, currentIndex, leaderUserId}`), `blocks:updated` (`{blockedUserIds}`, blocker-only), `member:moderated` (`{userId, isBanned?, isMuted?}`), `room:kicked` (sent to the banned member just before forced disconnect)

**Database — Prisma schema additions** (`libs/database/src/models/study-room.prisma`)

```prisma
model StudyRoom {
  // ...existing fields...
  accessType            Int      @default(0) // 0 PUBLIC | 1 CODE | 2 WHITELIST
  whitelist             String[] @default([])
  playlistAddPermission Int      @default(1) // 0 EVERYONE | 1 COHOST+ | 2 HOST
  playlist StudyRoomPlaylistItem[]
}

model StudyRoomMember {
  // ...existing fields...
  isBanned Boolean @default(false)
  isMuted  Boolean @default(false)
}

model StudyRoomPlaylistItem {
  id, studyRoomId, url, kind (0 VIDEO/1 PLAYLIST), title, addedByUserId, order, createdAt
}

model StudyRoomChatBlock {
  id, studyRoomId, blockerId, blockedId, createdAt
  @@unique([studyRoomId, blockerId, blockedId])
}
```

- **Migration status**: applied directly to the dev database via `psql` for local verification; **no migration file has been generated/committed yet** (same gap flagged for the base Study-Together Room models on 2026-07-19 — `StudyRoom`/`StudyRoomMember` still have no migration either). Block before any environment that runs `prisma:deploy` gating.

**Frontend (`examio-fe`)**

- Playlist UI, access-mode room settings, and moderation controls (ban/mute, personal chat block) wired into the existing `/k/study-room` / `/k/study-room/:id` pages, `useStudyRoomSocket.ts`, `useStudyRoomStore.ts`, and `src/types/studyRoom.ts` (mirrors the event contract above)

**Key Design Decisions**

- No YouTube Data API dependency for auto-advance — a single "leader" client (not the server) detects end-of-media via the YouTube IFrame API and reports it; the server treats that report as authoritative and fans the advance out to the room. Keeps the feature within the existing Redis-authoritative live-state model instead of adding a new external API integration
- Access modes reuse the `ExamSession` PUBLIC/CODE/WHITELIST shape rather than inventing a new access model
- Moderation state (`isBanned`/`isMuted`) lives on `StudyRoomMember`, not Redis, so bans/mutes survive reconnects and Redis flushes; propagation to other room instances rides the same `@socket.io/redis-adapter` already in place for broadcasts

---

## [Unreleased] — 2026-07-19

### Added

#### Study-Together Room (web only)

Dedicated page where multiple users study together in a private room: synchronized Pomodoro timer (work/break/long-break), shared YouTube media (play/pause/seek sync), live roster (studying/on-break), ephemeral chat, and a focus-time leaderboard. Host + co-hosts control the room via a 6-digit invite code. **Web only** (`examio-fe`) — no `examio-app` (mobile) counterpart yet.

**Architecturally new — first WebSocket/Socket.io usage in the backend.** Previously the backend only had SSE + Redis pub/sub + RabbitMQ + gRPC for realtime/async communication (see `docs/system/architecture.md` § Cross-Service Communication).

**Backend — `exam-service`**

- New `StudyRoomModule` (`apps/exam-service/src/modules/study-room/`): `StudyRoomGateway` (Socket.io `@WebSocketGateway`, path `/ws/study`, websocket-only transport — long-polling intentionally dropped to avoid sticky sessions across gateway instances), `StudyRoomService`, `StudyRoomRepository`, `StudyRoomStateService` (Redis-backed live state), `StudyRoomBroadcaster`, `StudyRoomSocketAuth`, `StudyRoomPomodoro` (deterministic timer: server stores `{phase, cycle, phaseStartedAt, running}`, clients compute countdown locally)
- `RedisIoAdapter` (`redis-io.adapter.ts`) wires `@socket.io/redis-adapter` so socket broadcasts fan out correctly across multiple `exam-service` instances
- Socket handshake auth: JWT from `handshake.auth.token` (or `token` cookie fallback), same verify + active-session check as `AuthGuard`, in `StudyRoomSocketAuth`
- REST surface under `/api/v1/studyrooms` (`StudyRoomController`): `POST /` create, `GET /mine`, `POST /join`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `POST /:id/leave`, `POST /:id/regenerate-code`, `GET /:id/leaderboard`
- Live state (timer phase/cycle, media play position, chat, presence) lives in Redis only; Prisma holds room config + membership. Chat is an ephemeral Redis LIST capped at 200 messages — **no** `StudyRoomMessage` Prisma model
- Focus-time credit: 30s heartbeat increments a Redis counter per member, flushed to `StudyRoomMember.totalFocusSeconds` on room close and periodically via a 5-min sweep (`StudyRoomGateway.afterInit`)
- WS event contract (`study-room.events.ts`, source of truth — FE mirrors it): client → server `room:join/leave`, `presence:heartbeat`, `timer:start/pause/reset/config`, `media:set/play/pause/seek`, `chat:send`, `role:grant/revoke`; server → client `room:snapshot`, `presence:updated`, `timer:updated`, `media:updated`, `chat:message`, `role:updated`, `room:closed`, `error`

**Backend — `gateway-service`**

- WebSocket upgrade proxy: `http-proxy` (`ws: true`) forwards `upgrade` requests whose URL starts with `WS_STUDY_PATH` (`/ws/study`) to `exam-service`; other upgrade requests are closed. This is a **net-new capability** — the gateway previously only did buffered HTTP/Axios proxying plus one SSE passthrough
- `StudyRoomProxyController` (`/api/v1/studyrooms/*`, gated by `PageEnabledGuard` + `TogglePage('study-room')`) proxies the REST surface to `exam-service` via `ProxyService.forwardWithAuth`

**Database — Prisma schema additions** (`libs/database/src/models/study-room.prisma`)

```prisma
model StudyRoom {
  id, name, description, hostId, inviteCode (unique, 6-digit)
  workMinutes, breakMinutes, longBreakMinutes, cyclesBeforeLongBreak
  currentMediaUrl, isActive, maxParticipants
}

model StudyRoomMember {
  studyRoomId, userId, role (0 MEMBER/1 COHOST/2 HOST)
  totalFocusSeconds, joinedAt, lastSeenAt
  @@unique([studyRoomId, userId])
}
```

- **No migration has landed yet for these models** — schema change is present but not applied via `prisma:migrate`/`prisma:deploy`; treat as pending on the shared DB until a migration ships.

**Frontend (`examio-fe`)**

- New routes `/k/study-room` (`StudyRoomListPage`, gated by `FeatureRoute pageKey="study-room"`) and `/k/study-room/:id` (`StudyRoomPage`)
- `src/apis/studyRoomApi.ts` — REST client for the `/studyrooms` surface
- `src/hooks/useStudyRoomSocket.ts` + `src/stores/useStudyRoomStore.ts` — Socket.io client connection, event handling, and room state store
- `src/types/studyRoom.ts` — mirrors the backend WS event contract

**Key Design Decisions**

- Socket.io/WebSocket chosen over SSE for this feature specifically because it needs bidirectional low-latency sync (timer control, media seek, chat) — unlike the existing SSE use cases (AI chat streaming, admin log tail, page-config push), which are all server-to-client only
- Gateway remains the single public entry point — WS traffic is proxied through it rather than exposing `exam-service` directly
- Scope: web only, private rooms, ~10–20 capacity; WebRTC excluded

**Implementation plan**: `plans/260719-1844-study-together-room/`

---

## [Unreleased] — 2026-07-17

### Added

#### Word Family — Single Root-Word Regeneration (F016)

(Re-)generate the child words for one specific root word on the detail page, overwriting the existing record.

**Backend — `exam-service` + `gateway-service` + `ai-service`**

- Route `POST /api/v1/word-family/generate-root` — `WordFamilyController.generateWordFamilyForRoot` → `WordFamilyService.generateWordFamilyForRoot`
- Gateway proxy route added in `WordFamilyProxyController`
- Python AI service `generate/word-family` request gained an optional `rootWord` field; when present, the prompt targets that exact root instead of proposing new ones
- Always overwrites via the existing `[rootWord, categorySlug]` upsert; concurrency lock is scoped per `userId:categorySlug:rootWord`, so it doesn't contend with the category-wide `generate` lock

**Frontend (`examio-fe`)**

- `generateWordFamilyForRootApi` added to `src/apis/wordFamilyApi.ts`; wired to a `useWordFamilyStore` action and a regenerate button on `WordFamilyDetailPage`

### Fixed

#### Word Family — background generate-root job + status endpoint (F016)

Follow-up fix in the same round: `generate-root` originally awaited the AI HTTP call before responding, so a slow model call could exceed the gateway proxy timeout.

**Backend — `exam-service` + `gateway-service`**

- `WordFamilyService.generateWordFamilyForRoot` now acquires the `userId:categorySlug:rootWord` lock, fires the AI call + upsert via an unawaited `runRootGeneration` background worker, and returns `{ generating, categorySlug, rootWord, startedAt }` immediately instead of waiting on the AI response
- New route `GET /api/v1/word-family/generation-status/:slug/:rootWord` — `WordFamilyService.getRootGenerationStatus`, proxied via `WordFamilyProxyController`; root-scoped status, independent of the existing category-level `generation-status/:slug`
- `GET /api/v1/word-family/category/:categorySlug/:rootWord` (`getWordFamily`) now returns a flattened `{ id, rootWord, categorySlug, words, createdAt, updatedAt }` instead of the raw record with the payload nested under `.data`, matching the FE `WordFamilyData` type

**Frontend (`examio-fe`)**

- `generateWordFamilyForRootApi` return type changed from the full record to the background-job ack shape; new `getRootWordFamilyGenerationStatusApi` added to `src/apis/wordFamilyApi.ts`
- `useWordFamilyStore`: renamed `regeneratingRoot` → `regeneratingKey` (`${categorySlug}:${rootWord}`); added `checkRootGenerationStatus` / `abandonRootGeneration`; `generateWordFamilyForRoot` now only fires the request — the poller triggers the refetch once the lock clears
- `WordFamilyDetailPage` polls `generation-status/:slug/:rootWord` every 5s (capped ~11min) on mount and after triggering a regenerate

## [Unreleased] — 2026-07-03

### Added

#### Page Feature Flags (F015 / Feature Toggling)

Full-stack feature toggle system enabling dynamic page enable/disable without redeployment.

**Backend — `admin-service` + `gateway-service`**

- New `PageFeatureFlag` Prisma model with fields: `key` (unique slug), `label`, `enabled`, `isSystemLevel`, `createdAt`, `updatedAt`
- `PageConfigModule` in admin-service: controller, service, repository
- `PageEnabledGuard` in `@examio/common` — validates request against enabled pages
- Gateway proxy: `PageConfigProxyController` routes `/api/v1/admin/page-config/*` to admin-service
- Shared page-key constants in `@examio/common/enums/page-keys.enum.ts` (DASHBOARD, AI_CHAT, EXAM_TAKING, etc.)
- SSE endpoint: `GET /api/v1/admin/page-config/stream` — real-time updates when flags change

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/page-config` | GET | Bearer | List all page flags |
| `/page-config/:id` | PATCH | Admin | Toggle page enabled state |
| `/page-config/stream` | GET | Bearer (SSE) | Real-time page flag updates |

- Seed script integration: `libs/database/src/seed/page-feature-flag.seed.ts` — default flags seeded in `seed:dev` + production (`seed:prod`)

**Frontend (`examio-fe`)**

- New `usePageConfigStore` Zustand store: manages page flag cache, SSE connection, realtime updates
- `PageConfigApiClient` in `src/apis/pageConfigApi.ts` — GET, PATCH, and SSE stream methods
- `PageConfigProvider` wrapper for root layout — initializes store + SSE listener on mount
- Sidebar filter: pages disabled via flag are hidden from `KLayout` navigation
- Route guards: `<ProtectedRoute>` checks `pageConfigStore.isPageEnabled(key)` before rendering protected pages
- i18n: Vietnamese + English translations in `public/locales/{vi,en}/page-config.json`

**Key Design Decisions**

- System-level flags (`isSystemLevel=true`) cannot be disabled; app-level flags can toggle
- SSE (no WebSocket) for real-time flag updates; graceful fallback to polling if connection fails
- Flags cached in Zustand; store syncs via SSE on change (300ms debounce)
- `PageEnabledGuard` runs AFTER `JwtAuthGuard` — ensures authenticated context
- Mobile (iosApp/androidApp) will require native flag sync (TODO: implement native feature flag bridge)

---

## [Unreleased] — 2026-06-14

### Added

#### Word Family Categories Seed (Phase 6)

- Seed file `libs/database/src/seed/word-family-category.seed.ts` — 10 categories inserted via `upsert`
- Seed wired into `libs/database/prisma/seed.ts` (imported and called from `main()`)
- No AI image generation endpoint; categories seeded with `imageUrl: null` (per design decision)
- Categories: shopping-restaurant, traffic-construction, workplace-leisure, position-title, location-place, meeting-work-office, travel-entertainment, banking-post-office, announcement-advertising, news-broadcasting-travel

#### Word Family Integration — NestJS Backend (Phase 3)

**Backend — `exam-service` + `gateway-service`**

- New `WordFamilyModule` in exam-service: controller, service, bridge service, repository, DTOs, interfaces
- `WordFamilyRepository` — Prisma CRUD for `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` with Redis caching (TTL 30 min)
- `WordFamilyService` — business logic for categories, root words, detail, AI generation orchestration with dedup, user collections
- `WordFamilyBridgeService` — transactional conversion of word families to FlashCard decks (`FlashCardSet` + `FlashCard` + `DetailsFlashCard`)
- `WordFamilyProxyController` in gateway-service — 11 proxy routes under `/api/v1/word-family/*`
- Integration with Python AI service for word family generation (`POST /api/generate/word-family`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/word-family/categories` | GET | Bearer | List active categories |
| `/word-family/categories` | POST | Admin | Create category |
| `/word-family/categories/:id` | PUT | Admin | Update category |
| `/word-family/categories/:id` | DELETE | Admin | Soft-delete category |
| `/word-family/categories/:slug/roots` | GET | Bearer | Get root words in category |
| `/word-family/category/:categorySlug/:rootWord` | GET | Bearer | Get word family detail |
| `/word-family/generate` | POST | Bearer | Generate via AI |
| `/word-family/save` | POST | Bearer | Save to collection |
| `/word-family/saved` | GET | Bearer | Get saved collections |
| `/word-family/saved/:id` | DELETE | Bearer | Remove from collection |
| `/word-family/:id/to-flashcard` | POST | Bearer | Convert to flashcard deck |

## [Unreleased] — 2026-06-07

### Added

#### Admin Dashboard (F014 / Phase 3)
Full-stack admin dashboard implementation, completing Phase 3 of the development roadmap.

**Backend — `admin-service` (NestJS, port 7006, gRPC 50056)**

| Module | Description |
|--------|-------------|
| `admin-bootstrap` | OnModuleInit reads `ADMIN_EMAILS` env, idempotent sync: skip existing, grant non-admin, create new |
| `admin-management` | CLI via `yarn bootstrap:admin`: `sync`, `list`, `grant <email>`, `revoke <email>` |
| `admin-users` | List (paginated, filter by search/admin/banned), detail, update, ban, unban, grant-admin, revoke-admin |
| `admin-audit` | Paginated audit log with admin include, optional filters |
| `admin-stats` | Overview (6 KPIs) + 3 series (signups/traffic/revenue), Redis 5-min cache, raw SQL `date_trunc` |
| `admin-finance` | Refund (status=4, reverse credits), credit (ADD/SUBTRACT), set-tier — all in `$transaction` Serializable |
| `admin-logs` | Log redactor (4 PII patterns), recent log tail, ticket exchange SSE stream |

- `AdminGuard` in `@examio/common` — standalone JWT verify + Prisma `isAdmin` lookup
- `AuditWriterService` — shared service writes one `AdminAudit` row per changed field
- User soft-delete: `isBanned = true` + `deletedAt = now()`
- Ticket exchange SSE: `POST /admin/logs/ticket` → Redis `sse:ticket:{uuid}` (300s, single-use) → `GET /admin/logs/stream?ticket=`
- Rate limiting: 30 req/min per admin (ThrottlerModule `name: 'admin'`)
- PII redaction: email, Bearer token, password JSON, JWT patterns
- Healthcheck: `GET /health/live`, `GET /health/ready` (moved from `/api/v1/health` on 2026-10-18)
- gRPC: `ENABLE_ADMIN_GRPC=true` enables reflection on port 50056

**Frontend (`examio-fe`, route `/admin`)**

| Page | Components |
|------|-----------|
| Overview | `KpiCard`, `MiniChartCard`, `StatChart`, `RangeSelector`, Recharts Area/Line/Bar |
| Stats | 3 large charts with date range picker |
| Users | `UserTable` with `UserDetailDrawer`, ban/unban/grant/revoke actions |
| Finance | `PaymentTable` with `FinanceActionModal` (refund/credit/tier) |
| Logs | `LogViewer` with SSE reconnect backoff |
| Audit | `AuditTable` with expandable payload row |

- `AdminRoute` guard: redirect `/admin` → `/login` (unauthenticated) or `/k` (non-admin)
- `AdminLayout`: cream canvas `#faf9f5`, 6 nav items, admin name + Logout top bar
- Zustand `useAdminStore` with 5-min in-memory cache per endpoint
- antd Table with pagination + filters on all list pages
- Vietnamese + English i18n: `public/locales/{vi,en}/admin.json`
- KLayout sidebar: admin-only "Trang quản trị" nav link (visible when `user.isAdmin`)

#### Admin UI design-token realignment
All admin pages and components now strictly follow `DESIGN.md` tokens — no hardcoded hex, no antd `Tag` preset colors, no `shadow-inner`, no off-spec radii.

- New `BadgePill` component (3 brand variants: `positive`/`negative`/`neutral`) replaces every antd `<Tag color="geekblue|green|red|blue|volcano|purple|orange|cyan">` in admin (10 sites)
- `AdminLayout` body + sidebar + header + logout button: `bg-[#faf9f5]` → `bg-canvas` (token-driven, dark-mode safe)
- `LogViewer` terminal surface: `bg-[#181715] text-[#e6dfd8] shadow-inner` → `bg-surface-dark text-on-dark` (shadow dropped per DESIGN §Elevation)
- `MiniChartCard` + `StatChart`: raw hex consts `PRIMARY/GRID/AXIS_TEXT` → CSS-var reads; tooltip inline hex → `var(--canvas)` / `var(--hairline)`; `rounded-xl` → `rounded-lg` (12px content card)
- `KpiCard` `rounded-xl` → `rounded-lg`
- `RangeSelector` active tab: `text-white` → `text-on-primary`
- All admin page h1s: `text-2xl font-semibold` → `font-display text-3xl font-normal tracking-tight` (per DESIGN §Typography: display weight 400, negative tracking)
- `UserDetailDrawer` section h3s: drop `uppercase`, switch to display style
- `AuditTable` JSON pre block: `bg-[#faf9f5]` → `bg-canvas`

**Database — Prisma schema additions**

```prisma
// libs/database/src/models/user.prisma
isBanned   Boolean  @default(false)
deletedAt  DateTime?
adminAudits AdminAudit[]

// libs/database/src/models/admin-audit.prisma
model AdminAudit {
  id        String   @id @default(cuid())
  adminId   String
  action    String
  targetId  String?
  payload   Json?
  reason    String?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  admin     User     @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId, createdAt])
  @@index([action, createdAt])
}
```

**Gateway proxy**

- `apps/gateway-service/src/controllers/admin-proxy.controller.ts`: `@All('*')` catch-all forward `/api/v1/admin/*` to admin-service
- `apps/gateway-service/src/services/proxy.service.ts`: `admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:7006'`

**Deployment**

- `deploy/docker-compose.yml`: admin-service + `examio_logs` volume
- `package.json`: `dev:admin`, `build:admin`, `start:admin`, `bootstrap:admin sync|list|grant|revoke`

**Permissions** (PERM046–PERM053)

| ID | Name | Description |
|----|------|-------------|
| PERM046 | `AdminRouteAccess` | Route guard via AdminGuard |
| PERM047 | `AdminUserManagement` | Ban/unban/soft-delete |
| PERM048 | `AdminGrantRevoke` | Grant/revoke admin |
| PERM049 | `AdminFinanceRefund` | Wallet refund |
| PERM050 | `AdminCreditAdjustment` | Manual credit adjustment |
| PERM051 | `AdminSubscriptionTierChange` | Subscription tier change |
| PERM052 | `AdminAuditLogView` | Audit log query |
| PERM053 | `AdminLogView` | Server log retrieval + SSE stream |

**Implementation plan**: `plans/260607-1538-admin-dashboard/`

---

*Older entries will be added as they are recorded.*