# Scout — Current State (2026-10-17)

Condensed from 3 Explore agents + 1 reviewer fact-check. Full narrative: `/ARCHITECTURE.md` §2. Paths relative to `examio-be/`.

## Data (shared DB anti-pattern)
- 1 `DATABASE_URL` for all services incl. Python ai-service; `yarn prisma:merge` merges `libs/database/src/models/*.prisma` → `schema.prisma` (48 models).
- Migration: `deploy/entrypoint-migration.sh` = `prisma db push` + `migrate resolve --applied` (3 migration dirs only). One `examio-migration` container gates every service.
- 24 FK → `User`, all `onDelete: Cascade`. `ExamRoom → QuizSet` cascade (`exam.prisma:148,156`).
- ai-service `asyncpg.create_pool(DATABASE_URL)` ×7; writes `UserStorage` (status, creditCharged), `Document` (pgvector), `DocumentEntity`, `HistoryGenerated*`; runtime `CREATE TABLE` for `UserStorageGraph*`, `BenchmarkItem`. `score/database.py` reads non-Prisma tables.
- Cross-boundary access:
  - guards in `libs/common/src/guard/{auth,admin,optional-auth}.guard.ts` query `userSession` + `user` every request (all services).
  - admin-service writes finance tables: `admin-finance.service.ts:102-337`; writes `User`: `admin-users.service.ts:218-407`; raw SQL stats `admin-stats.service.ts:153-240`; writes `WordFamilyCategory` (also written by exam).
  - auth creates `UserSubscription` in register tx (`auth.service.ts:183,600`); auth `user.repository.ts:96-121` reads wallet/subscription.
  - exam reads `user` via includes (examroom/examsession/examattempt/study-room/flashcardset/student services) + `user.findMany` for whitelist resolution (`flashcardset.service.ts:1389,1419`, `examsession.service.ts:775,806`).
  - gateway reads `pageFeatureFlag` (`gateway-service/src/services/config.service.ts:69`).
- Redis: single instance, shared `libs/common/src/constants/cache-keys.ts`; throttler in-memory.

## Auth
- HS256 shared `JWT_SECRET`; access 15m (`auth-service/src/auth.module.ts:36-42`); stray `7d` in `libs/common/src/auth/auth.module.ts:14-17`. Claims `{userId, sessionId}` only (`auth.service.ts:66-69`).
- Refresh: opaque, AES-GCM (`libs/common/src/services/refresh-token-cipher.service.ts`), rotation + grace, session 30d — KEEP.
- Cookies set twice (auth 7d via `libs/common/src/utils/cookie-config.ts`, gateway 30d `auth-proxy.controller.ts:308-341`), `SameSite=None` prod.
- Role state: `User.role` REMOVED in plan `plans/260513-2045-remove-user-role/`; only `User.isAdmin`, `isBanned`, `isVerified` remain (`libs/database/src/models/user.prisma`). `AdminGuard` reads `isAdmin` from DB. Legacy FE route labels kept (`/k/*`). Auth gRPC proto still exposes numeric `role` derived from `isAdmin`.
- Admin bootstrap CLI: `apps/admin-service/src/commands/cli.ts` (grant/revoke/list), env `ADMIN_EMAILS`.

## Gateway
- 17 `*-proxy.controller.ts` + `config.controller.ts`, 208 handlers, 11 copies of `h()/t()` helpers. `exam-proxy` + `finance-proxy` controllers NOT registered (dead).
- `ProxyService.forward*` returns only `response.data` (except `forwardWithRedirect`); AI chat SSE buffered (`proxy.service.ts:189-225`); admin logs + config stream real.
- `AuthGuard` only on ai, ai-chat, one admin method, one config method.
- Uploads buffered by multer then re-posted (`ai-study-proxy.controller.ts:82-106`, `r2-proxy.controller.ts:67-90`).
- WS `/ws/study` hand-proxied via `http-proxy` in `main.ts:139-211`, per-IP limiter.

## gRPC / events
- Protos `libs/common/src/protos/{auth,wallet,r2,ocr,subscription}.proto`, runtime proto-loader, hand-written TS interfaces. `admin.proto` referenced (`admin-service/src/main.ts:47`) but missing. ocr + finance both 50053. `registerAuthClient` unused.
- Only good boundary: exam → finance gRPC (`exam-service/src/modules/finance-client/finance-client.service.ts`).
- RabbitMQ `libs/common/src/events/`: exchange `examio.events`; only `USER_CREATED` auth→finance (`finance-service/src/events/user-event.handler.ts`); subscriber always acks, no DLQ, no outbox. `ai.ocr.requested` orphaned.
- exam → ai-service HTTP with `x-internal-service-token` (`modules/ai/ai.service.ts`, `modules/ai-chat/ai-chat.service.ts`, `modules/word-family/word-family.service.ts`).

## exam-service modules (to split)
`ai, ai-chat, cheatinglog, examattempt, examroom, examsession, finance-client, flashcard-study, flashcardset, quizset, r2, student, study-room, subject, word-family`.
- `student` mixes content + assessment: `recent-flashcards`, `pin-flashcard/:id` vs `recent-exams`, `pin-exam-room/:id`.
- `ai` controller: upload routes (`upload`, `quick-upload`, `recent-uploads`, `upload/:id` GET/DELETE, `upload-image`) → document; generation routes (`generate-from-file`, `regenerate/:id`, `job/:id`, `upload/:id/history`, `models`) → content.

## Deploy / CI
- One `deploy/Dockerfile` (ARG `SERVICE_NAME`), compose builds locally, single `.env`, one network, Postgres published `5411`, seed echoes `DATABASE_URL`.
- `.github/workflows/deploy.yml`: push main → SSH VPS → build all → `down` → `up`; no tests/lint/registry.
- Health static `{status:'ok'}`; no OTel/Prometheus.
- Tests: exam 11 specs, admin 5, finance 4, auth 3, r2 1, gateway 0; FE none.

## Clients
- FE: axios `baseURL=/api/v1`, `withCredentials`, 401 → `/auth/refresh` retry (`examio-fe/src/apis/api.ts`); socket.io `/ws/study`; SSE via fetch (ai chat) + EventSource (admin logs).
- FE routes `examio-fe/src/routes/index.tsx`: `/k/*` user area, `/admin/*` (stats, users, finance, logs, audit, word-family, page-config).
- Mobile `examio-app/` NOT present in this checkout (separate repo/location) — parity work must be planned as cross-repo.
