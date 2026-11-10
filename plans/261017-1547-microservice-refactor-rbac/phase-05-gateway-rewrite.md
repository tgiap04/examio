# Phase 05 — Gateway Rewrite

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§05, decisions 10, 11)
- Red team: [reports/red-team-changes.md](./reports/red-team-changes.md) RT-2, RT-3, RT-4, RT-6, RT-11, RT-15 (authoritative over this file's earlier text and the brief)
- Research: [researcher-02](./research/researcher-02-migration-mechanics-report.md) §4 (hpm 3.0.7 wiring, WS upgrade, Lua limiter) · [researcher-01](./research/researcher-01-rbac-report.md) §3 (coarse vs fine, Redis outage policy)
- Prior: [phase-03](./phase-03-messaging-foundation.md) (consumer `dedupe:false`, broker users), [phase-04](./phase-04-identity-and-rbac-core.md) (`av` claim, `auth.user.authz_changed`, service tokens, `@ServiceOnly`)
- ARCHITECTURE.md §4.2 (pipeline, Redis keys, GatewayControl), §5.2 (cookies), §5.4
- Scout: [current state](./reports/scout-current-state-report.md) "Gateway" · phase 01 `apps/gateway-service/test/fixtures/route-inventory.json`

## Overview
- Priority: P1 · Status: Completed (2026-10-20) · Effort: 4.25d <!-- Red Team: RT-2, RT-3, RT-4, RT-6, RT-15 (was 3d: +compose networks 0.25d, +durable av worker 0.25d, +rate-limit port 0.25d, +helmet/CORS/OPTIONS/real-ip/XFF 0.5d) --> · Depends on: 02, 03, 04
- Replace 17 hand-written proxy controllers (208 handlers) with one YAML-driven streaming proxy. Add JWT verify, revoke + `av` staleness checks, coarse prefix permissions, a Redis rate limiter carrying every current per-route limit, the `GatewayControl` gRPC server, a durable `authz_changed` consumer, authenticated WS upgrade, and the edge hardening (helmet, CORS, real client IP). Segment the compose networks. Only auth sets cookies. The gateway stops touching Postgres.

## Key Insights
- `ProxyService.forward*` returns only `response.data` (status and headers lost). AI chat SSE is buffered (`proxy.service.ts:189-225`). Uploads are buffered by multer then re-posted (`ai-study-proxy.controller.ts:82-106`, `r2-proxy.controller.ts:67-90`).
- Gateway sets cookies again (30d, `auth-proxy.controller.ts:308-341`). Auth sets `token`, `session_id`, `refreshToken` (`auth.controller.ts:232-237, 292-297, 375-376, 518-523, 565-570`).
- WS `/ws/study` is hand-proxied via `http-proxy` with a per-IP limiter (`main.ts:139-211`). socket.io `auth.token` is in the CONNECT packet and not visible at HTTP upgrade. Decision 10: the gateway checks cookie `accessToken` / `Authorization` at upgrade, and study-room re-verifies in its `server.use` middleware (phase 06, RT-5).
- <!-- Red Team: RT-15 --> The WS limiter keys on the **leftmost** `X-Forwarded-For` entry (`main.ts:187-191`), which the client controls, so it is bypassable. Raw upgrade requests have no `req.ip`; the fix computes the IP with `proxy-addr` and Express's own `trust proxy fn`, the same function behind HTTP `req.ip`.
- <!-- Red Team: RT-15 --> nginx forwards `X-Forwarded-For $proxy_add_x_forwarded_for` and `X-Real-IP $remote_addr` (`examio-fe/nginx.conf:48-49`) with no `real_ip` config. Behind Cloudflare, `$remote_addr` is a Cloudflare edge IP, so every per-IP limit today collapses onto a few CF addresses.
- <!-- Red Team: RT-15 --> Current edge hardening to port: helmet with a Swagger-friendly CSP (`main.ts:35-46`), CORS allowlist from `CORS_ORIGINS|FRONTEND_URL` with dev origins and a production fail-fast (`main.ts:54-82`). The admin proxy already overwrites `x-forwarded-for` with `req.ip` (`admin-proxy.controller.ts:131-134`); the dispatcher does the same for every upstream so service throttlers (auth `trust proxy 1`, `auth-service/src/main.ts:40`) see the client.
- <!-- Red Team: RT-4 --> Current per-route limits (all `{limit, ttl: 60000}`, one bucket per handler):
  - gateway: `POST studyrooms/join` 5 (`study-room-proxy.controller.ts:49`); `POST ai/quick-upload` 10, `POST ai/generate-from-file` 5, `POST ai/regenerate/:uploadId` 5, `POST ai-chat/:chatId/stream` 10, `POST ai-chat/message/:messageId/regenerate-stream` 10 (`ai-study-proxy.controller.ts:55,124,293,437,574`); global 100/min (`gateway.module.ts:67-71`).
  - auth (service-side, kept): register, login, verifyAccount, send-code-reset-password, reset-password, send-code-change-password, change-password, google/one-tap → 5 (`auth.controller.ts:186-496`); refresh → auth global 30/min (`auth.module.ts:47-52`).
  - No limit today on `flashcardsets|examsessions /study/:id/verify-code|with-code` (`flashcardset.controller.ts:599,614`, `examsession.controller.ts:197,212`) or `users/search` (`flashcardset.controller.ts:698`, `examsession.controller.ts:286`); `quiz-practice/sets/:id/unlock` arrives in phase 07.
- <!-- Red Team: RT-2 --> Compose today: one `examio-network` for everything (`deploy/docker-compose.yml:461-464`), Postgres published on the host `5411:5432` (`:374-375`), gateway `6369:7000` (`:39-40`). The FE compose joins `examio-network` as external (`examio-fe/docker-compose.yml:25-26,39-42`). Services that call the internet: auth (Google OAuth, SMTP), exam (Turnstile verify, `libs/common/src/services/turnstile.service.ts`), finance (SePay, `sepay.service.ts:15`), r2 (Cloudflare R2), ai (Gemini).
- Page flags: gateway reads Redis `CONFIG_PAGES_KEY` and falls back to Prisma `pageFeatureFlag` (`services/config.service.ts:63-75`). Admin already rebuilds the cache and publishes `CONFIG_PAGES_CHANNEL` on change (`admin-page-config.service.ts:86-100`). **So the DB fallback can go** if admin warms the cache at boot. A cache miss means all pages are enabled (the default-on semantics FE already uses).
- hpm 3.0.7 v3 API: `pathFilter`, `on.{proxyReq,error}`, `proxyTimeout`. It streams (no `selfHandleResponse`). Status and multiple `Set-Cookie` pass verbatim. `ws:true` auto-subscribes only after the first HTTP request, so use an explicit `server.on('upgrade')`. `xfwd` is NOT used: the dispatcher sets `X-Forwarded-*` itself (overwrite, not append). <!-- Red Team: RT-15 -->
- `bodyParser:false` is mandatory, so no Nest body-consuming controllers remain except `config` (GET only) and health. Swagger setup (`main.ts:84-137`) is dropped: it documented the deleted proxy controllers.
- Route inventory from phase 01 is the contract: every `METHOD /path` line must match a YAML route.

## Requirements
- Functional — routing:
  - `config/routes.yaml` (zod-validated at boot; upstreams via `${ENV}` interpolation).
    - Route = `{ id, upstream, match: {prefix}|{path regex}, methods?, auth: required|optional|none, permissions?: Permission[], public?: [{method,path}], pageFlag?, timeout?, maxBodySize?, websocket? }`.
    - Match order: `path` regex first, then longest `prefix`. No match → 404 `ROUTE_NOT_FOUND`.
  - <!-- Red Team: RT-4 --> Top-level `rateLimits: [{ id, method, path (regex), window, max }]`, matched independently of routes (first match wins, else `default {60s, 100}`). One bucket per entry. Key = `gw:rl:<id>:<sub|ip>:<windowStart>`, `sub` when a verified token is present, else the client IP. Entries (ported 1:1 plus new):

    | id(s) | method · path | max / 60 s |
    |---|---|---|
    | `auth-register`, `auth-login`, `auth-verify-account`, `auth-send-reset-code`, `auth-reset-password`, `auth-send-change-code`, `auth-change-password`, `auth-google-one-tap` (one entry each) | `POST /api/v1/auth/<endpoint>` | 5 |
    | `auth-refresh` | `POST /api/v1/auth/refresh` | 30 |
    | `studyroom-join` | `POST /api/v1/studyrooms/join` | 5 |
    | `ai-quick-upload` | `POST /api/v1/ai/quick-upload` | 10 |
    | `ai-generate-from-file`, `ai-regenerate` | `POST /api/v1/ai/generate-from-file`, `POST /api/v1/ai/regenerate/[^/]+` | 5 |
    | `ai-chat-stream`, `ai-chat-regenerate-stream` | `POST /api/v1/ai-chat/[^/]+/stream`, `POST /api/v1/ai-chat/message/[^/]+/regenerate-stream` | 10 |
    | `flashcard-code`, `examsession-code` (new) | `POST /api/v1/(flashcardsets\|examsessions)/study/[^/]+/(verify-code\|with-code)` | 5 |
    | `quiz-unlock` (new, pre-declared for 07) | `POST /api/v1/quiz-practice/sets/[^/]+/unlock` | 5 |
    | `word-family-generate` (new) <!-- Updated: Validation Session 1 - word-family gen free + gateway rate-limited --> | `POST /api/v1/word-family/(generate\|generate-root)` | 5 |
    | `flashcard-user-search`, `examsession-user-search` (new) | `GET /api/v1/(flashcardsets\|examsessions)/users/search` | 30 |
    | `ws-upgrade` | WS upgrade `/ws/study` | 20 / 10 s (as today) |

  - `/.well-known/jwks.json`, auth `/internal/token`, and r2 `internal/*` are NOT routed (internal only). <!-- Red Team: RT-2 -->
- Functional — pipeline per request (after helmet + CORS; `OPTIONS` preflights are answered by the CORS middleware and never reach the dispatcher) <!-- Red Team: RT-15 -->:
  1. `X-Request-Id` (reuse or new).
  2. Extract the token: Bearer header → cookie `accessToken`. Never from the query string.
  3. Verify with `libs/auth-jwt` (`AUTH_JWKS_URL`, `audience = JWT_AUDIENCE` only, so service tokens fail here): expired → 401 `TOKEN_EXPIRED`, invalid → 401 `TOKEN_INVALID`. <!-- Red Team: RT-2 -->
  4. One Redis round trip `MGET gw:revoked:sid:<sid> gw:user:<sub>:av`: revoked → 401 `SESSION_REVOKED`; token `av` < stored → 401 `TOKEN_STALE`. No stored value → pass. <!-- Red Team: RT-3 -->
  5. Coarse `permissions` via `hasPermission`; `email_verified=false` → 403 `EMAIL_NOT_VERIFIED`; else 403 `PERMISSION_DENIED`.
  6. Page flag off → 403 `PAGE_DISABLED`.
  7. Rate limit → 429 `RATE_LIMITED` + `Retry-After`.
  8. Proxy: strip inbound `x-user-*`; set `authorization: Bearer <token>` when present, `x-request-id`, and overwrite `X-Forwarded-For` with the client IP, `X-Forwarded-Proto`, `X-Forwarded-Host`. <!-- Red Team: RT-15 -->
  - <!-- Red Team: RT-6 --> `auth: optional`: run steps 2–4 when a token is present. If verify, revoke, or `av` fails, **strip** `authorization` and the `accessToken` cookie (rewrite the `Cookie` header) and forward as anonymous. Never 401.
- Functional — Redis outage <!-- Red Team: RT-3 -->: when step 4 cannot read Redis:
  - admin routes (`/api/v1/admin/*`) and every non-`GET`/`HEAD` request → 503 `AUTH_STATE_UNAVAILABLE` (on `auth: optional` routes: strip the token instead);
  - `GET`/`HEAD` on non-admin routes (incl. WS upgrade) → pass;
  - both cases log (rate-limited `warn`) + increment an in-process counter (exported when phase 17 adds metrics). The rate limiter fails open (auth's in-process throttler stays as the backstop for anonymous auth routes).
- Functional — `av` sources <!-- Red Team: RT-3 -->:
  - Lua `SETMAX`: `local c=redis.call('GET',KEYS[1]); if (not c) or tonumber(c) < tonumber(ARGV[1]) then redis.call('SET',KEYS[1],ARGV[1],'EX',960) end` (960 s = token TTL + 60 s skew). Idempotent and order-safe.
  - (a) fast path: gRPC `InvalidateUser(user_id, authz_version)` → `SETMAX gw:user:<id>:av`.
  - (b) durable: a gateway consumer `@EventHandler('auth.user.authz_changed', { dedupe: false })` on queue `gateway.events` → `SETMAX` with `data.authzVersion`. Runs in-process (the gateway has no DB). Several gateway replicas compete on one queue; Redis is shared, so one delivery suffices.
  - `gw:user:<id>:av` is the only staleness key. <!-- Reconcile: X5 -->
- Functional — `GatewayControl` gRPC server on `:50051` (internal only), guarded by `libs/auth-jwt` (`aud = gateway`) <!-- Red Team: RT-2 -->:
  - `RevokeSession(sid, exp)` (`@ServiceOnly('auth')`) → `SET gw:revoked:sid:<sid> 1 EX max(exp-now,1)`;
  - `InvalidateUser(user_id, authz_version)` (`@ServiceOnly('auth')`) → `SETMAX`; <!-- Reconcile: X1 -->
  - `SetPageFlags(flags)` (`@ServiceOnly('admin')`) → write `gw:config:pages` + publish the channel.
- Functional — callers wired + `GATEWAY_CONTROL_ENABLED=true`:
  - auth `logout`, `DELETE /devices/:sessionId`, `logout-all-others` → `RevokeSession` per sid;
  - `change-password` / `reset-password` → `InvalidateUser(userId, authzVersion)` after the phase-04 bump; <!-- Red Team: RT-3 -->
  - role change (04) → `InvalidateUser(userId, authzVersion)`.
  - No ban logic here. Ban = auth `SetUserStatus` (phase 08), which calls `InvalidateUser` from auth after commit; admin-service never calls `GatewayControl.InvalidateUser`. <!-- Reconcile: X1 -->
- Functional — WS: `server.on('upgrade')` after `listen`. Match a `websocket:true` route. Client IP = `proxy-addr(req, trustProxyFn)` (shared `client-ip.ts`, also used by the HTTP limiter key). Run steps 2–4 + page flag + `ws-upgrade` limit, then `proxy.upgrade`. Failure → write `HTTP/1.1 401|403|429|503` and destroy the socket. <!-- Red Team: RT-15 -->
- Functional — edge hardening <!-- Red Team: RT-15 -->:
  - helmet with today's options (`main.ts:35-46`).
  - `app.enableCors` with today's allowlist logic and allowed headers (`main.ts:54-82`), registered before the dispatcher. Production with an empty allowlist → throw at boot.
  - `trust proxy 1` (nginx is the one trusted hop).
  - nginx (`examio-fe/nginx.conf`): `include /etc/nginx/cloudflare-real-ip.conf;` (`set_real_ip_from` for every Cloudflare v4/v6 range + `real_ip_header CF-Connecting-IP;`), and `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite). A client-sent `X-Forwarded-For` or `CF-Connecting-IP` from a non-Cloudflare source never changes the key.
- Functional — error envelope <!-- Red Team: RT-11 -->: register `HttpErrorEnvelopeFilter` (phase 02) in the gateway (Nest controllers) and in auth `main.ts`; the dispatcher's `error-response.ts` emits the same `{ statusCode, code, message, requestId }`. `message` keeps today's value (string or array), so FE readers of `response.data.message` keep working. Other services adopt it when a later phase touches them.
- Functional — admin log stream <!-- Reconcile: X9 -->: the dispatcher keeps today's request log line (`→ METHOD url status ms`) and, on `res.finish`, calls the existing `LogPublisherService.publish('gateway', line)` (`src/common/log-publisher.service.ts`, today called from `middleware/proxy.middleware.ts:20-24`; redaction kept). Admin logs keep working until phase 17.
- Functional — compose networks (moved here from 16) <!-- Red Team: RT-2 -->:
  - `edge` (`name: examio-edge`): gateway + FE nginx only.
  - `internal` (`name: examio-internal`, `internal: true`): every service, Postgres, Redis, RabbitMQ, migration, seed.
  - `egress` (`name: examio-egress`): auth, exam, finance, r2, ai.
  - No host port for Postgres, Redis, or RabbitMQ (drop `5411:5432`). The gateway host port `6369` stays until phase 16 moves nginx onto the gateway upstream.
  - FE compose joins `examio-edge` as external. (The `BACKEND_URL` default `:3000` change is owned by phase 02.) <!-- Reconcile: X9 -->
  - Gateway gets `RABBITMQ_URL` for user `gateway` (added to the phase-03 definitions template: read `gateway.*`, topic write `^gateway\.` (none used)).
- Functional — cookies (auth only): `accessToken` (Path=/, Max-Age 900) and `refreshToken` (Path=/api/v1/auth, Max-Age = session TTL), `HttpOnly; SameSite=Lax; Secure` when `NODE_ENV=production`, host-only. Drop the `token` and `session_id` cookies. Logout clears both, including legacy names.
- Functional — streaming: SSE routes (`ai-chat/*/stream`, `regenerate-stream`, `admin/logs/stream`) get `timeout: 0` and no compression. Uploads stream through. `maxBodySize` is checked on `content-length` → 413 `PAYLOAD_TOO_LARGE` before proxying.
- Functional — gateway self-served: `GET /api/v1/config/pages`, `GET /api/v1/config/stream` (SSE from Redis), `/health/*` (all `@Public()`).
- Non-functional: gateway overhead p95 < 5ms excluding upstream (one Redis `MGET` per authenticated request). No Prisma import (`grep` gate). Each file < 200 lines.

## Architecture
```
Cloudflare ─► nginx [edge] (real_ip CF-Connecting-IP; XFF := $remote_addr)
           ─► gateway [edge+internal] (Express, bodyParser:false, trust proxy 1)
                ├─ helmet → CORS (OPTIONS ends here)
                ├─ /health/*, /api/v1/config/* (Nest controllers, @Public)
                └─ dispatcher: match → verify → MGET(revoked sid, av) → coarse perms → pageFlag → rateLimit(Lua) → hpm[routeId] ─► upstream [internal]
upgrade ─► wsUpgradeHandler: match(websocket) → clientIp(proxy-addr) → same checks → hpm.upgrade ─► study-room (exam-service)
auth (RevokeSession, InvalidateUser) / admin (SetPageFlags) ─gRPC (svc token, aud=gateway)─► GatewayControl ─► Redis gw:* <!-- Reconcile: X1 -->
auth outbox ─► examio.events auth.user.authz_changed ─► gateway.events ─► gateway consumer ─► SETMAX gw:user:<id>:av
services needing internet [internal+egress]: auth, exam, finance, r2, ai
```
<!-- Red Team: RT-2, RT-3, RT-15 -->
Coarse permission routes (everything else: auth required/optional only):

| Route match | permissions |
|---|---|
| `^/api/v1/admin/.*` | `admin:access` |
| `^/api/v1/ai/(upload.*\|quick-upload\|recent-uploads)$` | `document:upload` (maxBodySize 100mb, timeout 120s) |
| `^/api/v1/ai/.*` (rest) | `ai:generate` |
| `^/api/v1/ai-chat/.*` | `ai_chat:use` |
| `^/api/v1/wallet/.*` | `wallet:use` |
| `^/api/v1/payment/.*` (public exception `GET /api/v1/payment/subscription/plans`) | `wallet:use` |

Rate limit Lua (atomic): `c=INCR k; if c==1 then PEXPIRE k w end; return {c, PTTL k}`. Key per `rateLimits` entry (see Requirements). <!-- Red Team: RT-4 -->

## Related Code Files
File ownership (globs): `examio-be/apps/gateway-service/**`, `examio-be/libs/auth-jwt/src/extract-token.ts` (drop `token` cookie fallback), `examio-be/libs/common/src/utils/cookie-config.ts`, `examio-be/apps/auth-service/src/{auth.controller.ts,devices/devices.service.ts,auth.service.ts}` (cookie + RevokeSession/InvalidateUser call sites only), `examio-be/apps/auth-service/src/main.ts` (envelope filter line only), `examio-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.service.ts` (warm cache on boot), `examio-be/deploy/docker-compose.yml` (`networks` for every service, data-store `ports`, gateway env), `examio-be/deploy/rabbitmq/definitions.template.json` (`gateway` user only), `examio-be/deploy/README.md` (ports/networks section), `examio-fe/{nginx.conf,docker-compose.yml,Dockerfile}`, `examio-fe/nginx/cloudflare-real-ip.conf`. <!-- Red Team: RT-2, RT-11, RT-15 -->

- Create:
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/config/routes.yaml`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/routing/{route-config.schema.ts,route-table.ts,route-matcher.ts,rate-limit-table.ts}` <!-- Red Team: RT-4 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/pipeline/{dispatcher.middleware.ts,auth-check.ts,auth-state.service.ts,rate-limiter.service.ts,rate-limit.lua,set-max.lua,page-flag.check.ts,error-response.ts,proxy-factory.ts,client-ip.ts,forward-headers.ts,request-log.ts}` <!-- Reconcile: X9 --> <!-- Red Team: RT-3, RT-6, RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/ws/ws-upgrade.handler.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/control/gateway-control.grpc.controller.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/events/authz-changed.handler.ts` <!-- Red Team: RT-3 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/test/{route-coverage.spec.ts,gateway.e2e-spec.ts,jest-e2e.json}`
  - `/Users/tgiap.dev/devs/examio/examio-fe/nginx/cloudflare-real-ip.conf` <!-- Red Team: RT-15 -->
- Modify:
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/{main.ts,gateway.module.ts}`, `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/services/config.service.ts` (drop Prisma), `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/controllers/config.controller.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/utils/cookie-config.ts`, `/Users/tgiap.dev/devs/examio/examio-be/libs/auth-jwt/src/extract-token.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/{auth.controller.ts,auth.service.ts,main.ts}`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/devices/devices.service.ts` <!-- Red Team: RT-11 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/modules/admin-page-config/admin-page-config.service.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/deploy/docker-compose.yml`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/rabbitmq/definitions.template.json`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/README.md` <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-fe/nginx.conf`, `/Users/tgiap.dev/devs/examio/examio-fe/docker-compose.yml`, `/Users/tgiap.dev/devs/examio/examio-fe/Dockerfile` (copy the real-ip include) <!-- Red Team: RT-2, RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/package.json` (`http-proxy-middleware@3.0.7`, `yaml`, `proxy-addr`; drop `http-proxy`)
- Delete:
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/controllers/*-proxy.controller.ts` (all 15 remaining)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/services/proxy.service.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/middleware/proxy.middleware.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/guards/{page-enabled.guard.ts,toggle-page.decorator.ts}`, `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/ws-study.constant.ts`

## Implementation Steps
1. Write `route-coverage.spec.ts` first. It loads `routes.yaml` and, for each line in `route-inventory.json`, turns `:param` into a sample segment and asserts a match. It also asserts no route matches `/.well-known/jwks.json`, `/internal/token`, `/api/v1/internal/token`, or `/api/v1/r2/internal/upload`, and that every throttled handler listed in Key Insights resolves to its `rateLimits` entry with the same `max`. Fails initially. <!-- Red Team: RT-2, RT-4 -->
2. `route-config.schema.ts` (zod, incl. `rateLimits`) + `route-table.ts` (load, interpolate env, build one hpm proxy per route via `proxy-factory.ts`) + `route-matcher.ts` + `rate-limit-table.ts`.
3. Author `routes.yaml`: one route per resource prefix (auth, profile, devices, quizsets, flashcardsets, examrooms, examsessions, examattempts, cheatinglogs, flashcard-study, student, studyrooms, subjects, word-family, ai, ai-chat, r2/image, wallet, payment, webhook, admin). Also add `quiz-practice` → exam, pre-declared for phase 07 (404 upstream until then). Add the coarse table, the SSE timeouts, the WS route `/ws/study` (`pageFlag: study-room`), existing `PageEnabledGuard` keys mapped to `pageFlag`, and the `rateLimits` table. Turn the coverage test green. <!-- Red Team: RT-4 -->
4. Pipeline modules: `client-ip.ts` (`proxy-addr` + `app.get('trust proxy fn')`), `forward-headers.ts` (strip `x-user-*`, overwrite XFF, optional-route token strip), `auth-check.ts` (`verifyAccessToken`), `auth-state.service.ts` (MGET revoke + `av`, Redis-down policy by route/method), `rate-limiter.service.ts` (`defineCommand` Lua), `page-flag.check.ts` (shared with `ConfigService`), `error-response.ts` (envelope), `request-log.ts` (log line + `LogPublisherService.publish('gateway', …)` on `finish`, ported from `proxy.middleware.ts` before it is deleted <!-- Reconcile: X9 -->). `dispatcher.middleware.ts` composes them. <!-- Red Team: RT-3, RT-6, RT-15 -->
5. `main.ts`:
   - `NestFactory.create(GatewayModule, { bodyParser: false })`;
   - `trust proxy 1`, helmet (today's options), `enableCors` (today's allowlist + prod fail-fast), `cookie-parser`, then `app.use(dispatcher)`; <!-- Red Team: RT-15 -->
   - `useGlobalFilters(HttpErrorEnvelopeFilter)`; <!-- Red Team: RT-11 -->
   - hybrid gRPC `GatewayControl`; messaging consumer (`gateway.events`, `dedupe:false`); <!-- Red Team: RT-3 -->
   - after `listen`, `server.on('upgrade', wsUpgradeHandler)`.
   Delete the old WS code and the Swagger setup.
6. `ConfigService`: remove Prisma. A cache miss returns `{}`. Admin `onModuleInit` rebuilds `CONFIG_PAGES_KEY`. Remove `DatabaseModule`, the old `AuthModule`, `ThrottlerModule`, `HttpModule` from `GatewayModule`; add `AuthJwtModule` (config/health `@Public()`) and `MessagingModule` (consumer only).
7. `GatewayControl` server (`@ServiceOnly` per RPC) + `authz-changed.handler.ts`. Wire the auth call sites (`InvalidateUser(userId, authzVersion)`). Set `GATEWAY_CONTROL_ENABLED=true` in compose. <!-- Red Team: RT-2, RT-3 -->
8. Cookie cleanup in auth (`cookie-config.ts`, every `res.cookie`) and the extractor (drop `token`). Register the envelope filter in auth `main.ts`. <!-- Red Team: RT-11 -->
9. Compose + nginx <!-- Red Team: RT-2, RT-15 -->:
   - declare `edge`/`internal`/`egress`, assign every service per Requirements, drop `5411:5432`, add the gateway `RABBITMQ_URL`, add the `gateway` broker user to the definitions template;
   - FE compose: `examio-edge` external (`BACKEND_URL` already `:3000` from phase 02); <!-- Reconcile: X9 -->
   - `cloudflare-real-ip.conf` from https://www.cloudflare.com/ips-v4 and /ips-v6 (committed; refresh steps in `deploy/README.md`), `include` it in `nginx.conf`, switch XFF to `$remote_addr`, `COPY` it in the FE `Dockerfile`;
   - `deploy/README.md`: ports/networks section, ops DB access via `docker compose exec postgres psql`.
10. Write and run `gateway.e2e-spec.ts` (fake upstreams + real Redis + RabbitMQ).
11. Manual smoke through the FE (Vite proxy → gateway): login, AI chat streaming visibly token-by-token, PDF upload 20MB, study room join, admin logs SSE, page flag toggle. Then on the compose stack: `docker compose up` with the new networks, FE → gateway → services, Google login, SePay plan list, AI generation (egress paths).

## Tests
- Write first:
  - `route-coverage.spec.ts` (contract vs the phase-01 inventory + rate-limit parity + not-routed internal paths); <!-- Red Team: RT-4 -->
  - `route-matcher.spec.ts` (regex before prefix, longest prefix);
  - `auth-state.service.spec.ts` <!-- Red Team: RT-3 -->: Redis down → admin GET 503, non-admin POST 503, non-admin GET pass (counter +1), optional POST → token stripped; token `av` 2 vs stored 3 → `TOKEN_STALE`; no stored `av` → pass;
  - `set-max.lua` spec (real Redis): 5 then 4 → 5; 4 then 5 → 5; TTL ≤ 960; <!-- Red Team: RT-3 -->
  - `rate-limiter.service.spec.ts` (101st call → 429 with Retry-After; `auth-login` 6th → 429);
  - `client-ip.spec.ts`: `X-Forwarded-For: 6.6.6.6, 10.0.0.9` from a trusted hop → `10.0.0.9`. <!-- Red Team: RT-15 -->
- `gateway.e2e-spec.ts` (fake upstream http server + Redis + RabbitMQ containers):
  - status/headers/two `Set-Cookie` passthrough;
  - SSE chunks arrive before the upstream ends;
  - a 30MB body is streamed (upstream sees the bytes, gateway RSS stays flat);
  - 401 `TOKEN_EXPIRED` / `SESSION_REVOKED`; `TOKEN_STALE` after `InvalidateUser(u, av+1)`; <!-- Red Team: RT-3 -->
  - durable path: publish `auth.user.authz_changed {authzVersion: av+1}` with `InvalidateUser` disabled → next request `TOKEN_STALE` within 2 s; <!-- Red Team: RT-3 -->
  - STUDENT token on `/api/v1/ai/models` → 403 before reaching upstream;
  - inbound `x-user-roles: SYSTEM_ADMIN` stripped;
  - optional route with a revoked token → upstream sees no `authorization` and no `accessToken` cookie, response 200; <!-- Red Team: RT-6 -->
  - a service token (`aud=finance`) on any route → 401 `TOKEN_INVALID`; `GatewayControl.InvalidateUser` with a user token, `svc:exam` or `svc:admin` → `PERMISSION_DENIED`; <!-- Red Team: RT-2 --> <!-- Reconcile: X1 -->
  - forged XFF <!-- Red Team: RT-15 -->: 6 `POST /api/v1/auth/login` with distinct leftmost `X-Forwarded-For` values and the same trusted-hop value → 6th is 429; the upstream sees `X-Forwarded-For` = the single client IP; the same for 21 WS upgrades in 10 s → 21st refused;
  - `OPTIONS` from an allowed origin → 204 with CORS headers and the upstream not called; a disallowed origin → no `Access-Control-Allow-Origin`; <!-- Red Team: RT-15 -->
  - errors carry `{ statusCode, code, message, requestId }`; <!-- Red Team: RT-11 -->
  - a proxied request appends one redacted line to Redis `logs:gateway` (admin log stream unchanged); <!-- Reconcile: X9 -->
  - WS upgrade without a cookie → 401 and the socket is closed.
- Auth: `logout.e2e` → the next request with the old access token → 401 `SESSION_REVOKED`.
- Config: `docker compose config` passes; a CI step asserts no `ports:` on `postgres|redis|rabbitmq` and that `postgres` is only on `internal`. `docker run --rm -v $PWD/examio-fe/nginx.conf:/etc/nginx/templates/default.conf.template -v $PWD/examio-fe/nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf -e BACKEND_URL=http://x:3000 nginx:1.27-alpine nginx -t` → exit 0. <!-- Red Team: RT-2, RT-15 -->

## Todo List
- [x] Coverage contract test (red) → routes.yaml (green), incl. rate-limit parity <!-- Red Team: RT-4 -->
- [x] Route schema/table/matcher + rateLimits table + hpm per route <!-- Red Team: RT-4 -->
- [x] Pipeline: auth, MGET revoke+av (Redis-down policy), coarse perms, page flag, Lua limiter, envelope errors, XFF overwrite, optional strip <!-- Red Team: RT-3, RT-6, RT-11, RT-15 -->
- [x] main.ts bodyParser:false + helmet + CORS + dispatcher + WS upgrade handler (proxy-addr IP) <!-- Red Team: RT-15 -->
- [x] GatewayControl gRPC server (`@ServiceOnly`) + `authz_changed` consumer; auth callers wired; flag on <!-- Red Team: RT-2, RT-3 -->
- [x] Gateway DB/Auth/Throttler/Http modules removed; admin warms page-flag cache
- [x] Cookies: only auth, accessToken/refreshToken, Lax, legacy names cleared; auth envelope filter <!-- Red Team: RT-11 -->
- [x] Compose networks edge/internal/egress; data host ports removed; FE compose + nginx real_ip <!-- Red Team: RT-2, RT-15 -->
- [x] Gateway log publisher ported into the dispatcher (`request-log.ts`) <!-- Reconcile: X9 -->
- [x] Old controllers/ProxyService/guards deleted
- [ ] e2e + manual FE smoke + compose smoke (OPEN: e2e green; no browser FE smoke and no `docker compose up` of the real stack in evidence; static `compose config` + live curl/nginx checks only)

## Success Criteria
- `cd examio-be && yarn typecheck && yarn build:all && yarn test`: exit 0. `cd examio-be/apps/gateway-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`: exit 0.
- `grep -rn "prisma\|@examio/database" examio-be/apps/gateway-service/src` → none. `ls examio-be/apps/gateway-service/src/controllers` → `config.controller.ts` only. `grep -rn "split(',')\[0\]" examio-be/apps/gateway-service/src` → none. <!-- Reconcile: X5 --> <!-- Red Team: RT-3, RT-15 -->
- Browser devtools: `/api/v1/ai-chat/:id/stream` shows incremental chunks. The response sets only `accessToken`/`refreshToken` cookies, `SameSite=Lax`.
- After logout, replaying the old cookie → 401 `SESSION_REVOKED`. After an admin role change, the next request → 401 `TOKEN_STALE`, then FE refresh succeeds with new roles. The same holds with the `GatewayControl` call blocked (durable path). <!-- Red Team: RT-3 -->
- <!-- Red Team: RT-2 --> On the compose host: `docker compose ps --format '{{.Name}} {{.Ports}}'` shows no host port for postgres/redis/rabbitmq; `docker compose exec admin wget -qO- -T 3 https://example.com` fails (no egress) while `exec auth` succeeds.
- <!-- Red Team: RT-15 --> Local compose (nginx with a test `set_real_ip_from`): 6 failed logins from one client → 429 regardless of a spoofed `X-Forwarded-For`. The real-Cloudflare check (distinct client IPs in gateway logs, not CF ranges) runs once in the phase-16 cutover smoke at final merge. <!-- Updated: Validation Session 1 - single production deploy -->
- `cd examio-fe && yarn build && yarn lint`: exit 0 (no FE code change expected).

## Risk Assessment
- Missed route (FE 404) → High/Medium. The coverage contract vs the inventory catches it, plus a manual click-through of every sidebar page.
- <!-- Red Team: RT-4 --> A limit lost in the port → brute force reopens → Medium/High. The coverage spec asserts parity for every throttled handler.
- Upload/SSE timeouts too short → per-route `timeout` and nginx `proxy_read_timeout 3600s` (`examio-fe/nginx.conf:54-55`).
- Express 5 path matching quirks → dispatcher is mounted pathless and matches on `req.url` itself.
- WS clients relying on the `token` cookie → the study-room client connects with `withCredentials: true` and no `auth` option (`examio-fe/src/hooks/useStudyRoomSocket.ts`), so it sends the `accessToken` cookie at upgrade. Unaffected by dropping `token`.
- `SameSite=Lax` breaks the Google OAuth callback cookie → top-level GET navigations send Lax cookies. E2E-check the Google login manually.
- Mobile reads cookies? Mobile uses Bearer (ARCH §4.6). Unaffected.
- <!-- Red Team: RT-3 --> Redis outage makes the site read-only for writes (503 on non-GET) → Medium/Medium. Accepted trade (RT-3): stale/revoked tokens must not write. Countermove: Redis healthcheck + restart policy; the counter/log surfaces it.
- <!-- Red Team: RT-2 --> A service loses an internet dependency on `internal: true` → Medium/High (e.g. exam's Turnstile verify). Countermove: the egress list comes from code (Key Insights); the compose smoke exercises login (Turnstile + Google), SePay plans, R2 upload, AI generation.
- <!-- Red Team: RT-2 --> Ops lose host DB access (`5411`) → Low. `docker compose exec postgres psql` is documented.
- <!-- Red Team: RT-2 --> Network rename leaves the FE container on the old `examio-network` → FE 502 → Medium. Compose bring-up order (local now, production once at the phase-16 cutover): BE compose first (creates `examio-edge`), then FE compose; both changes are on the same branch. <!-- Updated: Validation Session 1 - single production deploy -->
- <!-- Red Team: RT-15 --> A host-level proxy or Cloudflare Tunnel sits between Cloudflare and nginx → `$remote_addr` is that proxy, CF ranges never match, every client shares one key → Medium/High [UNVERIFIED production topology]. Countermove: confirm the production topology before the final-merge cutover (phase 16 runbook); if present, add its address to `set_real_ip_from`. The cutover smoke (distinct IPs in logs) catches it. <!-- Updated: Validation Session 1 - single production deploy -->
- <!-- Red Team: RT-11 --> Envelope changes auth error bodies → FE reads `message`; `message` is preserved verbatim, `error` field dropped. Low: `grep -rn "data\.error\|data?\.error" examio-fe/src` → no hits today; re-run before merge.

## Rollback
- Gateway is stateless: on the branch, revert the phase commits (old controllers in git). Production only changes at the final-merge cutover; its rollback is the phase-16 runbook (previous image tags + DB dump). <!-- Updated: Validation Session 1 - single production deploy -->
- Cookie change: revert the auth cookie commit (the old gateway sets cookies itself).
- `GATEWAY_CONTROL_ENABLED=false` turns callers into no-ops. The `authz_changed` consumer can be disabled by unbinding `gateway.events`; staleness then relies on the fast path. <!-- Red Team: RT-3 -->
- <!-- Red Team: RT-2 --> Networks: revert the compose commits (BE + FE together) and `docker compose up -d`; volumes are untouched. Re-adding `5411:5432` is a one-line revert.
- <!-- Red Team: RT-15 --> nginx: revert `nginx.conf` + the include; limits fall back to the previous (CF-collapsed) keys.

## Security Considerations
- The gateway is the only identity forwarder: it strips client `x-user-*` and never trusts query tokens. Services re-verify (defense in depth).
- <!-- Red Team: RT-3 --> Stale-role enforcement: `av` checked on every authenticated request; fail-closed on admin routes and all state-changing requests when Redis is down; fail-open only for non-admin GETs (logged + counted). Two `av` sources (gRPC fast path, durable event) so a lost call cannot leave a demoted admin active beyond one event delivery.
- <!-- Red Team: RT-6 --> Optional routes never forward a token that failed verify/revoke/`av`, so a service `@Public()` parser cannot pick up a revoked identity.
- <!-- Red Team: RT-2 --> Service tokens are rejected at the edge (`aud`); `GatewayControl` accepts only allowlisted service callers. Only the gateway sits on `edge`; data stores have no host ports and live on an `internal: true` network; only services with a real outbound need are on `egress`.
- <!-- Red Team: RT-15 --> Real client IP: nginx trusts `CF-Connecting-IP` only from Cloudflare ranges and overwrites XFF; the gateway trusts one hop and overwrites XFF upstream; WS uses the same trust function. A forged header never changes a limiter key.
- <!-- Red Team: RT-15 --> helmet + CORS allowlist with production fail-fast are kept; preflights end at the CORS middleware.
- No JWKS, `/internal/token`, or r2-internal exposure. 413 before proxying protects upstream memory.

## Next Steps
- Unblocks 12–14 (route-only service moves in `config/routes.yaml`), 09 (TOKEN_STALE handling), 16 (gateway-a/b on top of these networks).
- [CROSS-PHASE] Admin page flags: here the DB fallback is removed and admin warms the Redis cache. Phase 10 still owns the move to `SetPageFlags` (server ready here, `@ServiceOnly('admin')`).
- Single `config/routes.yaml` with env-interpolated upstreams (DRY); phases 12–14 append named entries to that one file (plan.md agrees).
- [CROSS-PHASE] Ban is auth `SetUserStatus`, implemented in phase 08 (durable `authz_changed(reason:'ban')` + auth-side `InvalidateUser`). 04 + 05 + 08 are verified together on local compose and reach production only in the single final-merge deploy, so there is no interim gap. <!-- Reconcile: X1 --> <!-- Updated: Validation Session 1 - single production deploy -->
- [CROSS-PHASE] <!-- Red Team: RT-2 --> Phase 16 no longer owns the network split or data-port removal; it adds `gateway-a/b`, drops the gateway host port, and adds the nginx `/ws/` location (nginx has none today, `examio-fe/nginx.conf` proxies only `/api/`).
- [CROSS-PHASE] <!-- Red Team: RT-4 --> Phases 06/07 add per-resource code-failure counters behind the `flashcard-code`/`examsession-code`/`quiz-unlock` gateway limits.

### Deferred / carried (closed 2026-10-20)
1. P16: loopback-bound gateway port `127.0.0.1:6369`. Local callers can still choose XFF (accepted residual). Remove the host port with gateway-a/b.
2. WS upgrade has no Origin allowlist. SameSite=Lax mitigates.
3. Gateway sits on the non-internal `edge` network (unneeded egress). Tighten in P16.
4. `POST /auth/exchange` is `@Public` in auth but routed as required-auth. Unused. Delete or expose deliberately.
5. `SessionRevoker` writes one outbox row per session in a loop. Batch later.
6. Real-Cloudflare client-IP check at the P16 cutover smoke.
7. Admin `SetPageFlags` caller is P10.
8. New durable event `auth.session.revoked` added beyond plan (user-approved). Reflect in ARCHITECTURE.md at P19.

<!-- Updated: 2026-10-20 user decision --> **Todo 11 (manual FE + full `docker compose up` smoke) → moved to the phase-16 cutover smoke** (user decision 2026-10-20). Local verification evidence: evidence/phase-05/ (80/80) and evidence/phase-05-runs.md rounds 1–6.
