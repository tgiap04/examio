# Phase 06 — RBAC Enforcement & Security Fixes

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§06, decisions 4, 5, 8)
- Red team (authoritative where it conflicts): [reports/red-team-changes.md](./reports/red-team-changes.md) RT-4, RT-5, RT-6, RT-7 <!-- Red Team: RT-4, RT-5, RT-6, RT-7 -->
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §1 (inventory), §7 (9 gaps) · [researcher-01](./research/researcher-01-rbac-report.md) §2 (ownership = `where`, 404), §6 (IDOR, search)
- Decisions: [reports/decisions.md](./reports/decisions.md) (STUDENT scope, TEACHER previews own only; 2026-10-18 validation: demotion keeps content, TEACHER += `word_family:save`, word-family generation free) <!-- Updated: Validation Session 1 - decisions -->

## Overview
- Priority: P1 · Status: Completed (2026-10-20) · Effort: 4.75d <!-- Red Team: RT-4, RT-5, RT-7 (was 3d: +code lockout, +WS middleware/av/exp/event disconnect + message e2e, +ownership specs + decorator) --> <!-- Updated: Validation Session 1 - +0.25d demoted-owner access spec --> · Depends on: 04
- Replace phase-04's mechanical `@Authenticated()` with the real permission per handler (exam, finance, admin, r2). Close the 9 security gaps. Add a CI test that fails on any undeclared HTTP or WS handler, on an unapproved `@Authenticated()`, and on an allowlist entry without a linked two-user negative spec. Prove the matrix as actor × resource-relation with HTTP-level tests. Harden code entry (lockout + constant-time compare) and WebSocket auth. <!-- Red Team: RT-4, RT-5, RT-7 -->
- Out of scope: auth-service (its Public/Authenticated set from 04 is final), gateway (05, incl. `routes.yaml` `rateLimit`), QuizSet sharing (07). <!-- Red Team: RT-4 -->

## Key Insights
- After 04 every protected handler is `@Authenticated()` (behaviour unchanged). The gap is role scope, not authn.
- TEACHER has no `flashcard:study`/`quiz:practice`/`exam:take`, but may preview OWN sets. The pattern is "permission OR owner": `@RequireOwnerOrPermission(perm, OwnerResolver)` (new, below). The ad-hoc service helper `assertPermissionOrOwner` is not built. <!-- Red Team: RT-7 -->
- Ownership stays in services as `findFirst({ where: { id, userId } })` → 404 (no existence leak). Most quizset/flashcardset methods already do this (scout §1).
- `whitelist` stores user ids (`flashcardset.service.ts:1088,1392`). `users/search` matches `email contains` (`:1411+`) and returns email. Fix: exact-email or username/name prefix match, no email in results.
- FE does not call `GET /quizsets/public/:id` (grep `kmaedu-fe/src`: no hit) → delete it (gap #1). `examrooms/get-public` and `examsessions/get-public` are used (`examRoomApi.ts:89`, `examSessionApi.ts:118`) → sanitize, do not delete.
- `MyMaterialsPage.tsx:433` (student) calls `POST /flashcardsets/:id/share`. Owner-only breaks it until phase 07 changes the FE to build the link client-side.
- Large service files (quizset 1398, flashcardset 1774, examsession 1149 lines). Put new logic in small new files (mappers/access helpers), not in the giants.
- <!-- Red Team: RT-4 --> exam-service has **no `ThrottlerModule`** (grep `ThrottlerModule`: only gateway, admin, auth), so any `@Throttle` added there is a silent no-op. Code entry is compared with plain `!==`/`===`: `flashcardset.service.ts:1124`, `examsession.service.ts:493`, and `examattempt.service.ts:52-92` (`assertSessionAccess`, `providedCode === …`, called from `start` `:170` and `:1178`). `verify-code` is unauthenticated today (`flashcardset.controller.ts:599-611`, `examsession.controller.ts:197-210`).
- <!-- Red Team: RT-5 --> Study-room socket auth already runs in `server.use` inside `afterInit` (`study-room.gateway.ts:98-117`), deliberately not in `handleConnection` (socket.io does not await it; comment at `:100-105`). The gateway has 27 `@SubscribeMessage` handlers and no `OnGatewayConnection`. P04 makes HTTP guards return `true` for `ws` contexts, so this middleware is the only WS gate. The Redis socket.io adapter (`redis-io.adapter.ts`) makes `server.in(room).fetchSockets()` cluster-wide; `kickUser` (`:620-630`) already uses it.

## Requirements
- Functional: every exam/finance/admin/r2 HTTP handler carries exactly one of `@Public()`, `@Authenticated()` (allowlist only), `@RequireOwnerOrPermission(...)` (allowlist only), `@RequirePermissions(...)`, per the table below. All 9 gaps from scout §7 are fixed. <!-- Red Team: RT-7 -->
- <!-- Red Team: RT-4 --> Code entry (`verify-code`, `with-code`, exam attempt `start` with `accessCode`; P07 adds `unlock`) requires auth with the matching permission and goes through one helper `access-code-guard.ts`:
  - Redis counter `exam:codefail:<resourceId>:<userId>`: `INCR` on a wrong code, `EXPIRE 900` set on the first failure, `DEL` on success. At ≥ 5 → 429 `CODE_LOCKED` `{ retryAfterSeconds }` **before** comparing (a correct code is also refused while locked).
  - Compare `crypto.timingSafeEqual(sha256(stored), sha256(given))` (fixed length, no early exit). DTO validates `^\d{6}$` → 400 (not counted as a failure).
  - Redis error → 503 `CODE_CHECK_UNAVAILABLE` (fail-closed).
  - No `@Throttle` in exam-service. Per-IP/user request rate limits are gateway `routes.yaml` entries (P05).
- <!-- Red Team: RT-5 --> WebSocket (`/ws/study`): auth + permission run in the `server.use` middleware (never `handleConnection`):
  - verify the token (signature, `iss`, `aud`, `exp`, `typ`), require `email_verified`, require `study_room:join`;
  - `av` check against the gateway's Redis key `gw:user:<sub>:av` (read-only mirror; chosen over an auth `GetAuthzVersion` RPC because exam already holds Redis and the socket.io adapter needs it anyway). Token `av` < stored → `connect_error` `TOKEN_STALE`. Key missing → pass. Redis error → `connect_error` `SERVICE_UNAVAILABLE` (fail-closed);
  - store `{ user, av, exp }` in `socket.data`;
  - `handleConnection` (sync, no auth logic) joins room `user:<id>` and schedules `disconnect` at `exp` (timer cleared in `handleDisconnect`). Before disconnecting it emits `auth:reauth { reason: 'TOKEN_EXPIRED' }`;
  - consumer `@EventHandler('auth.user.authz_changed')` (exam `MessagingModule`, P03) → `server.in('user:<id>').fetchSockets()` → sockets with `data.av < event.authzVersion` get `auth:reauth { reason: 'AUTHZ_CHANGED' }` + `disconnect(true)`. Idempotent (re-delivery finds no stale sockets).
- <!-- Red Team: RT-6 --> `AUTHENTICATED_ALLOWLIST` (`test/authz/authenticated-allowlist.ts`) lists every `@Authenticated()` / `@RequireOwnerOrPermission` handler with a linked spec. Phase 07 appends its new handlers there with their specs.
- <!-- Red Team: RT-7 --> `@RequireOwnerOrPermission(perm, Resolver)` (libs/auth-jwt): composes `@Authenticated()` + metadata + a per-handler `OwnerOrPermissionGuard`. Pass if the token has `perm`; else `Resolver.resolveOwnerId(req)` (single `findUnique … select { userId }`) must equal `sub`; else 403 `PERMISSION_DENIED` (same response whether the resource is missing or foreign). With `perm` the service still runs its access predicate (public | owner | whitelist), so "has permission" never means "sees everything".
- <!-- Updated: Validation Session 1 - demotion keeps content --> Owner-role independence: every student access check (`flashcardset-access.ts` `canAccessFlashcardSet`, exam session `study/:id` access, P07 `quizset-access.ts`, pin/progress checks, `recent-*`) decides only from `isPublic`, `whitelist`, code-unlock state, session visibility and `ownerId === sub`. None reads the owner's `User.role`/`isSystemAdmin` (no join to `User`, no auth RPC), so a demoted TEACHER's granted/whitelisted/public/code content stays studyable. Management stays permission-gated (`*:manage`), so the demoted owner gets 403 there; as a STUDENT owner they may still study their own set (owner relation).
- Non-functional: STUDENT → TEACHER-only route returns 403 `PERMISSION_DENIED`. Non-owned resource returns 404. No N+1 introduced (access checks are single `findFirst` with `select`).

## Architecture
Endpoint → permission (all under `/api/v1`; "own" = service owner check → 404; "O|P" = `@RequireOwnerOrPermission`; "code" = `access-code-guard.ts`): <!-- Red Team: RT-4, RT-7 -->

| Controller (file) | Routes | Declaration | Service check / fix |
|---|---|---|---|
| quizset (`ES/quizset/quizset.controller.ts`) | all CRUD, `stats`, `list/all`, questions, labels, `set-quizzes-to-quizset`, `save-history-to-quizset` | `quizset:manage` | own (exists) |
| | `GET public/:id` | — | **delete** (gap 1) |
| flashcardset | CRUD, `stats`, list, `:id/flashcards`, labels, cards, `set-flashcards-…`, `save-history-…` | `flashcardset:manage` | own (exists) |
| | `GET/PUT :id/sharing`, `POST :id/generate-code`, `POST :id/share` | `content:share` | own. `share` owner-only (fix `:1749`). `generate-code` keeps whitelist (gap 6) |
| | `GET users/search` | `user:search` | gap 5 rules |
| | `GET public/:id`, `study/:id/info`, `study/:id/access` | `@Public()` | strip `accessCode`, `whitelist` (gap 3) |
| | `POST study/:id/verify-code` <!-- Red Team: RT-4 --> | `flashcard:study` | code (lockout + constant-time) |
| | `GET study/:id` | O\|P `flashcard:study`, `FlashcardSetOwnerResolver` | `canAccessFlashcardSet` (public\|owner\|whitelist). Strip code/whitelist |
| | `POST study/:id/with-code` <!-- Red Team: RT-4 --> | `flashcard:study` | code. Remembering added in 07 |
| flashcard-study | `POST/GET progress/:setId` | O\|P `flashcard:study`, `FlashcardSetOwnerResolver(:setId)` | add `canAccessFlashcardSet` (gap 7) |
| student | `recent-flashcards`, `pin-flashcard/:id` | `flashcard:study` | pin: `canAccessFlashcardSet` (gap 7). recent: only owned/whitelisted/viewed sets, not every public set |
| | `recent-exams`, `pin-exam-room/:id` | `exam:take` | pin: user has an attempt in a session of the room, or session access (gap 7) |
| examroom | POST, `detail/:id`, PUT, list, `list-all`, DELETE, `:id/sessions` | `exam_room:manage` | own/host (exists) |
| | `get-public/:id` | `@Public()` | return `{id,title,description,host:{name,avatar}}` only; no email (gap 4) |
| examsession | POST, `get-by-id`, PUT, DELETE, list, `GET/PUT :id/sharing`, `POST :id/generate-code`, `room/:roomId/available-labels` | `exam_session:manage` | host. `generate-code` keeps whitelist + visibility (gap 6) |
| | `users/search` | `user:search` | gap 5 rules |
| | `get-public/:id`, `study/:id/info`, `study/:id/access` | `@Public()` | sanitize (gap 2) |
| | `POST study/:id/verify-code` <!-- Red Team: RT-4 --> | `exam:take` | code |
| | `GET study/:id`, `POST study/:id/with-code`, `GET study/:id/stats` | `exam:take` | deep-strip answers + `accessCode` + `whitelist` (gap 2). `with-code`: code <!-- Red Team: RT-4 --> |
| examattempt | `history-stats`, `start`, `:id/progress`, `:id/submit`, `:id/quiz`, `:id/secure-quiz`, `:id/secure-submit`, `POST /`, `GET list` | `exam:take` | own attempt. `start`/`POST /`: drop the host branch of `assertSessionAccess`; its `accessCode` path goes through code <!-- Red Team: RT-4 --> |
| | `list-by-room/:roomId`, `list-by-session/:sid` | `exam_result:view` | host |
| | `DELETE :id` | `exam_session:manage` | host |
| | `:id/detail`, `get-by-id/:id`, `PUT :id` | `@Authenticated()` (allowlist) | `examattempt-access.ts`: owner && `exam:take` OR host && `exam_result:view`, else 404 |
| cheatinglog | `POST /` | `exam:take` | attempt owner (exists) |
| | `attempt/:id`, `session/:id/stats`, `session/:sid/user/:uid` | `exam_result:view` | host (exists) |
| study-room (`ES/study-room`) | POST | `study_room:create` | — |
| | `mine`, `join`, `:id/join`, `:id`, `:id/leave`, `:id/leaderboard` | `study_room:join` | member/applyJoin (exists) |
| | PUT, DELETE, `:id/regenerate-code` | `study_room:create` | room HOST (exists) |
| | WS gateway class + 27 `@SubscribeMessage` <!-- Red Team: RT-5 --> | class `@Authenticated()` (declarative; HTTP guards skip `ws`) | `server.use` middleware: verify, `email_verified`, `study_room:join`, `av`; disconnect at `exp` / on `authz_changed` |
| word-family | `categories`, `categories/:slug/roots`, `category/:cat/:root`, `generation-status/*` | `word_family:read` | — |
| | `save`, `saved`, `DELETE saved/:id` | `word_family:save` (STUDENT + TEACHER) <!-- Updated: Validation Session 1 - TEACHER += word_family:save --> | own |
| | `generate`, `generate-root` | `word_family:generate` (TEACHER only) | free (no credit charge); gateway `word-family-generate` 5/min (P05) + per-user limit 20/day (Redis) (gap 9) <!-- Updated: Validation Session 1 - word-family gen free + gateway rate-limited --> |
| | `:id/to-flashcard` | `flashcardset:manage` | — |
| | categories POST/PUT/DELETE | `word_family:admin` | — |
| ai (`ES/ai/ai.controller.ts`) | `quick-upload`, `upload`, `upload-image`, `recent-uploads`, `GET/DELETE upload/:id` | `document:upload` | own (exists) |
| | `generate-from-file`, `regenerate/:id`, `GET/DELETE job/:id`, `upload/:id/history`, `models` | `ai:generate` | own (exists) |
| ai-chat | all 17 handlers | `ai_chat:use` | own. `:chatId/exists` gets the owner filter (gap 8) |
| subject | all 4 GETs | `@Public()` | — |
| r2 (`ES/r2`) | `POST image` | `document:upload` | — |
| finance payment | `create`, `status/:id`, `history`, `cancel/:id` | `wallet:use` | own |
| | `subscription` | `subscription:manage` | own |
| | `subscription/plans` | `@Public()` | — |
| finance webhook | `POST /webhook` | `@Public()` | SePay signature (exists) |
| finance wallet | `info`, `details` | `wallet:use` | own |
| admin users | list, `:id`, PATCH `:id`, `ban`, `unban` | `user:manage` | PATCH no longer accepts `isAdmin` (role path only) |
| | `grant-admin`, `revoke-admin` | `role:assign` | interim. Replaced in 08 |
| admin finance | `refund`, `credit`, `set-tier`, `tier` | `finance:admin` | — |
| admin logs | `recent`, `ticket`, `stream` | `logs:read` | — |
| admin page-config | GET, PATCH `:key` | `page_config:manage` | — |
| admin stats | `admin/stats/*`, `admin/overview`, `admin/series/:name`, `admin/sources` | `stats:read` | — |
| admin audit | GET | `audit:read` | — |
| admin word-family | categories CRUD | `word_family:admin` | — |
| all services | `/health/*`, `GET /` | `@Public()` | — |
| r2-service | `internal/upload` | `@Public()` | internal only (not in gateway YAML) |

Admin controllers drop the class-level `admin:access` from 04 in favour of the per-controller permission (handler-level overrides class — keep one level per controller).

Gap 5 rules (`users/search`):
- `q` ≥ 3 chars, max 10 results.
- Match `username`/`name` prefix (insensitive), or `email` **exact** (lowercased).
- Return `{ id, username, name, avatar }` (no email).
- Rate limit: gateway `routes.yaml` entry (P05). No service `@Throttle` (no `ThrottlerModule` in exam-service). <!-- Red Team: RT-4 -->

<!-- Red Team: RT-4 --> Code check (`modules/common/access-code-guard.ts`, used by flashcardset, examsession, examattempt; P07 reuses it for quiz `unlock`):
```ts
// verifyAccessCodeOrThrow({ resourceId, userId, stored, given })
// 1. GET exam:codefail:<resourceId>:<userId> ≥ 5 → 429 CODE_LOCKED { retryAfterSeconds: TTL }
// 2. stored && timingSafeEqual(sha256(stored), sha256(given)) → DEL key, return
// 3. INCR key; if result == 1 → EXPIRE 900; throw 400 INVALID_CODE (or 429 at the 5th)
```

<!-- Red Team: RT-5 --> WebSocket flow:
```
handshake ─► server.use: verifyAccessToken (sig/iss/aud/exp/typ) → email_verified → hasPermission(roles,'study_room:join')
          → redis GET gw:user:<sub>:av (> token.av → TOKEN_STALE; error → SERVICE_UNAVAILABLE) → page gate (existing)
          → socket.data = { user, av, exp } → next()
handleConnection (sync): socket.join(`user:<id>`); setTimeout(emit auth:reauth{TOKEN_EXPIRED} + disconnect, exp − now)
auth.user.authz_changed {userId, authzVersion} ─► exam consumer ─► server.in(`user:<id>`).fetchSockets()
          → data.av < authzVersion → emit auth:reauth{AUTHZ_CHANGED} + disconnect(true)
```
FE reaction to `auth:reauth` (refresh, then reconnect) is phase 09.

<!-- Red Team: RT-7 --> Test dimension = actor × resource-relation. Relations: owner · other same role · other role · host · whitelisted · code-unlocked · anonymous. Every allowlist entry carries `spec` (a two-user negative spec file whose test titles contain the entry `key`) or `selfScoped: true` (allowed only when the route has no path params, e.g. auth `me`).
```ts
// test/authz/authenticated-allowlist.ts (shape)
{ key: 'ExamAttemptController.getDetail', spec: 'apps/exam-service/test/ownership/examattempt.ownership.e2e-spec.ts' }
```

## Related Code Files
File ownership (globs): `kmaedu-be/apps/exam-service/src/modules/**` (controllers, + listed services/mappers/helpers), `kmaedu-be/apps/exam-service/test/{ownership/**,study-room-ws.e2e-spec.ts}`, `kmaedu-be/apps/auth-service/test/ownership/**` (new spec files only; auth source stays 04-final), `kmaedu-be/apps/finance-service/src/modules/**/*.controller.ts`, `kmaedu-be/apps/admin-service/src/modules/**/*.controller.ts`, `kmaedu-be/apps/admin-service/src/modules/admin-users/dto/update-user.body.ts`, `kmaedu-be/apps/r2-service/src/r2-service.controller.ts`, `kmaedu-be/libs/auth-jwt/src/{owner-or-permission.decorator.ts,owner-or-permission.guard.ts,index.ts}`, `kmaedu-be/libs/auth-jwt/test/**`, `kmaedu-be/test/authz/**`, `kmaedu-be/package.json` (devDependency `socket.io-client` line only). <!-- Red Team: RT-4, RT-5, RT-7 -->

- Create:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/auth-jwt/src/{owner-or-permission.decorator.ts,owner-or-permission.guard.ts}` (`@RequireOwnerOrPermission`, `OwnerResolver` interface) <!-- Red Team: RT-7 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/flashcardset/{flashcardset-access.ts,flashcardset-owner.resolver.ts,flashcardset-public.mapper.ts}` <!-- Red Team: RT-7 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/examsession/examsession-public.mapper.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/examattempt/examattempt-access.ts` <!-- Red Team: RT-7 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/common/user-search.service.ts` (shared by flashcardset + examsession, DRY)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/common/access-code-guard.ts` (+ `.spec.ts`) <!-- Red Team: RT-4 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/study-room/study-room-authz.handler.ts` (`auth.user.authz_changed` consumer) <!-- Red Team: RT-5 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/word-family/word-family-generation-limit.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/test/authz/{handler-declarations.spec.ts,authz-matrix.spec.ts,authenticated-allowlist.ts,test-tokens.ts}` <!-- Red Team: RT-6, RT-7 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/test/ownership/{flashcardset,flashcard-study,examattempt,examsession,quizset,examroom,ai,ai-chat}.ownership.e2e-spec.ts` (two users, real Postgres) <!-- Red Team: RT-7 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/test/study-room-ws.e2e-spec.ts` <!-- Red Team: RT-5 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/test/ownership/demoted-owner.ownership.e2e-spec.ts` <!-- Updated: Validation Session 1 - demotion keeps content -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/test/ownership/devices.ownership.e2e-spec.ts` (user B cannot list/revoke A's devices; the other auth allowlist entries are `selfScoped`) <!-- Red Team: RT-7 -->
- Modify: every controller in the table. Services:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/quizset/quizset.service.ts` (remove `getPublic`)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` (share owner-only, generate-code, `verifyAccessCode` `:1114-1130` → code guard, use mapper/access/search) <!-- Red Team: RT-4 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/examsession/examsession.service.ts` (generate-code, study mapper, search, `verifyAccessCode` `:483-500` → code guard) <!-- Red Team: RT-4 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/examroom/examroom.service.ts` (get-public select)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/examattempt/examattempt.service.ts` (`assertSessionAccess` `:52-92`: no host branch, code guard instead of `===`) <!-- Red Team: RT-4 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/student/student.service.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/flashcard-study/flashcard-study.service.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/ai-chat/ai-chat.service.ts` (`exists`)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/word-family/word-family.service.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/src/modules/study-room/{study-room.gateway.ts,study-room-socket-auth.service.ts,study-room.events.ts,study-room.module.ts}` (middleware checks, `OnGatewayConnection`, `auth:reauth` event, consumer wiring) <!-- Red Team: RT-5 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/modules/admin-users/dto/update-user.body.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/package.json` (devDependency `socket.io-client@^4.8`) <!-- Red Team: RT-5 -->
- Delete: `quizset.controller.ts:256` handler + service method `quizset.service.ts:245-270`.

## Implementation Steps
1. Write `test/authz/handler-declarations.spec.ts` (red): <!-- Red Team: RT-5, RT-6, RT-7 -->
   - boot each service module with `Test.createTestingModule` (providers overridden by `useMocker`);
   - use `DiscoveryService` + `MetadataScanner` to list every HTTP handler **and** every `@WebSocketGateway` class with its `@SubscribeMessage` methods;
   - fail if an HTTP handler has no `Public`/`Authenticated`/`RequireOwnerOrPermission`/`RequirePermissions`;
   - fail if a WS gateway class lacks class-level `@Authenticated()` (or a `WS_DOCUMENTED` entry with a reason);
   - fail if an `Authenticated`/`RequireOwnerOrPermission` handler is missing from `AUTHENTICATED_ALLOWLIST` (exam: examattempt `get-by-id`/`detail`/`update`, flashcardset `study/:id`, flashcard-study `progress*`; auth list from 04; P07 appends quiz-practice);
   - fail if an entry has neither `spec` nor a valid `selfScoped`, if the spec file is missing, or if no test title in it contains the entry `key`.
2. Write `test/authz/authz-matrix.spec.ts` (red). Use real guards plus test RS256 keys (`createLocalJWKSet`). Tokens for STUDENT, TEACHER, SYSTEM_ADMIN (synthetic, permission-level only), TEACHER+ADMIN. Services are stubbed. Rows below.
3. Write the ownership specs (red), see Tests. <!-- Red Team: RT-7 -->
4. Apply the table, controller by controller (one commit per service): exam → finance → admin → r2.
5. `owner-or-permission.{decorator,guard}.ts` + `flashcardset-owner.resolver.ts` + `flashcardset-access.ts` (single `findFirst` select `{userId,isPublic,whitelist}`) + `examattempt-access.ts`. <!-- Red Team: RT-7 -->
6. `access-code-guard.ts` (+ unit spec), then swap the three compare sites (flashcardset `:1124`, examsession `:493`, examattempt `assertSessionAccess`). Remove nothing from the gateway; P05 owns `routes.yaml`. <!-- Red Team: RT-4 -->
7. Gap fixes 1–9 with unit tests per fix (see Tests). Mappers do whitelist-based field picking (never spread `...entity`).
8. Study-room WS <!-- Red Team: RT-5 -->:
   - `study-room-socket-auth.service.ts` returns `{ user, av, exp }` after verify + `email_verified` + `study_room:join` + `av` (Redis `gw:user:<sub>:av`); typed errors `TOKEN_*`, `PERMISSION_DENIED`, `SERVICE_UNAVAILABLE`;
   - the existing `server.use` (`study-room.gateway.ts:106`) passes the error code to `next(new Error(code))`;
   - implement `OnGatewayConnection` (sync: join `user:<id>`, exp timer), clear the timer in `handleDisconnect`;
   - `study-room-authz.handler.ts` with `@EventHandler('auth.user.authz_changed')`; import the P03 consumer module in `StudyRoomModule`;
   - add `ServerEvents.AUTH_REAUTH = 'auth:reauth'` in `study-room.events.ts`.
9. Run the full suite and the manual FE smoke as TEACHER+ADMIN (bootstrap user) and as a fresh STUDENT.

## Tests
- Write first: the declaration and matrix specs above, the ownership specs, `access-code-guard.spec.ts`, and the WS e2e. <!-- Red Team: RT-4, RT-5, RT-7 -->
- Matrix rows (status expected for STUDENT / TEACHER / ADMIN-only):

| Request | STUDENT | TEACHER | ADMIN-only |
|---|---|---|---|
| `POST /quizsets` | 403 | 201 | 403 |
| `GET /flashcardsets/study/:id` (granted set) | 200 | 403 (not owner, no `flashcard:study`) | 403 |
| `GET /flashcardsets/study/:id` (own set) | — | 200 | — |
| `POST /flashcardsets/study/:id/verify-code` <!-- Red Team: RT-4 --> | 200/400 | 403 | 403 |
| `POST /examattempts/start` | 200 | 403 | 403 |
| `GET /examattempts/list-by-session/:sid` | 403 | 200 (host) | 403 |
| `POST /ai/generate-from-file` | 403 | 2xx | 403 |
| `POST /ai-chat` | 403 | 201 | 403 |
| `GET /wallet/info` | 403 | 200 | 403 |
| `POST /studyrooms` / `POST /studyrooms/join` | 403 / 200 | 201 / 200 | 403 / 403 |
| `GET /word-family/saved` / `POST /word-family/generate` | 200 / 403 | 200 / 2xx <!-- Updated: Validation Session 1 - TEACHER += word_family:save --> | 403 / 403 |
| `GET /admin/users` | 403 | 403 | 200 |
| `GET /examsessions/users/search?q=ab` | 403 | 400 (len) | 403 |

- Anonymous on every non-`@Public` row → 401. <!-- Red Team: RT-4 -->
- <!-- Red Team: RT-7 --> Ownership (two users of the same role unless stated, real Postgres; one spec file per family, test titles carry the allowlist `key`):

| Request | owner | other same role | other role | host | whitelisted | code-unlocked | anonymous |
|---|---|---|---|---|---|---|---|
| `GET /flashcardsets/study/:id` (private) | 200 (TEACHER preview) | 403 (TEACHER) | 404 (STUDENT, no grant) | — | 200 | 200 (via `with-code`) | 401 |
| `POST/GET /flashcard-study/progress/:setId` | 200 | 403 | 404 | — | 200 | — | 401 |
| `GET /examattempts/get-by-id/:id`, `:id/detail`, `PUT :id` | 200 | 404 | 404 (TEACHER non-host) | 200 (GET only) | — | — | 401 |
| `PUT /examattempts/:id/progress`, `:id/submit` | 200 | 404 | 403 | 403 | — | — | 401 |
| `GET /examsessions/study/:id` (private) | — | — | 404 (STUDENT, no grant) | 403 (no `exam:take`) | 200 | 200 | 401 |
| `GET/PUT /quizsets/:id`, `GET /examrooms/detail/:id` | 200 | 404 | 403 | — | — | — | 401 |
| `GET/DELETE /ai/upload/:id`, `GET /ai/job/:id`, `GET /ai-chat/:chatId`, `/:chatId/exists` | 200 | 404 / false | 403 | — | — | — | 401 |

- <!-- Updated: Validation Session 1 - demotion keeps content --> `apps/exam-service/test/ownership/demoted-owner.ownership.e2e-spec.ts` (real Postgres + auth `RoleChangeService`, tokens re-minted after the change): TEACHER T owns a private flashcard set (student S whitelisted), a public quiz set (P07 adds a whitelisted one) and an exam session that S unlocked by code; admin demotes T → STUDENT. Then: S `GET /flashcardsets/study/:id` → 200, S `GET /examsessions/study/:id` → 200, anonymous `GET /flashcardsets/public/:id` → 200 (unchanged); T (now STUDENT token) `PUT /flashcardsets/:id`, `POST /quizsets`, `PUT /examsessions/:id` → 403 `PERMISSION_DENIED`; content rows and `ownerId` unchanged. Test title carries "demoted teacher's shared set still studyable by whitelisted student; demoted user gets 403 on manage". A static check (`grep -rn "role\|isSystemAdmin" .../flashcardset-access.ts .../examattempt-access.ts`) → none.
- `access-code-guard.spec.ts` (Redis test container or ioredis-mock) <!-- Red Team: RT-4 -->: 5 wrong codes → the 5th returns 429 `CODE_LOCKED` with `retryAfterSeconds`; a correct code while locked → 429; success resets the counter; a malformed code → 400 and no counter increment; Redis error → 503; the counter key is per `resourceId:userId` (user B is not locked by A's failures).
- `apps/exam-service/test/study-room-ws.e2e-spec.ts` (socket.io-client, message level) <!-- Red Team: RT-5 -->:
  - STUDENT token: connect → `room:join` → `chat:send` delivered to a second member;
  - SYSTEM_ADMIN-only token (no `study_room:join`) → `connect_error` `PERMISSION_DENIED`; `email_verified=false` → `connect_error`;
  - stale token (`av` < Redis `gw:user:<id>:av`) → `connect_error` `TOKEN_STALE`;
  - connected socket + published `auth.user.authz_changed` with a higher `authzVersion` → `auth:reauth {AUTHZ_CHANGED}` then disconnect;
  - token with a 2 s `exp` → `auth:reauth {TOKEN_EXPIRED}` then disconnect.
- Unit (one per gap):
  - quizset public route gone (404);
  - exam `study/:id` payload contains no `isCorrect`/`answer` keys at any depth, and no `accessCode`/`whitelist`;
  - flashcard study/public payload has no code/whitelist;
  - `examrooms/get-public` has no `email`;
  - search returns no `email` and rejects `q<3`;
  - `generate-code` keeps the whitelist;
  - pin/progress on an inaccessible set → 404;
  - `ai-chat/:id/exists` for another user's chat → false/404;
  - the 21st word-family generation in a day → 429.

## Todo List
- [x] handler-declarations (HTTP + WS + allowlist spec links) + authz-matrix specs (red) <!-- Red Team: RT-5, RT-6, RT-7 --> (evidence: `yarn test test/authz` 191/191)
- [x] ownership e2e specs per resource family (two users) <!-- Red Team: RT-7 --> (evidence: exam ownership + WS 153/153, auth ownership 4/4)
- [x] demoted-owner spec: shared content still studyable, manage → 403; access helpers never read owner role <!-- Updated: Validation Session 1 - demotion keeps content --> (evidence: demoted-owner 3/3; static grep none)
- [x] `@RequireOwnerOrPermission` decorator/guard + resolvers; examattempt access policy <!-- Red Team: RT-7 --> (evidence: owner-or-permission spec 9/9; examattempt ownership green)
- [x] exam-service controllers per table (evidence: handler-declarations green; `@Authenticated()` grep = allowlisted examattempt handlers + WS gateway class only)
- [x] finance, admin, r2 controllers per table; admin PATCH drops isAdmin (evidence: finance e2e 20/20, admin e2e 20/20, r2 e2e 3/3; `update-user.body.ts` rejects isAdmin/isSystemAdmin/role)
- [x] access-code-guard (Redis lockout, timingSafeEqual) on verify-code / with-code / attempt start <!-- Red Team: RT-4 --> (evidence: unit 12/12; live 10 parallel guesses → 5 evaluated, correct code still 429)
- [x] Gaps 1–9 fixed with unit tests (evidence: ownership specs + `word-family-generation-limit.spec.ts` in full `yarn test` 1408/1408)
- [x] WS middleware (verify, email_verified, study_room:join, av), exp disconnect, authz_changed disconnect, message-level e2e <!-- Red Team: RT-5 --> (evidence: study-room-ws e2e 8/8; 5 mutants killed)
- [ ] Manual smoke STUDENT vs TEACHER+ADMIN — **partial, left open:** API-level curl smoke run for STUDENT vs TEACHER (fresh signup, role set to TEACHER). Not run: browser FE pass, and a single TEACHER+ADMIN actor. Carried to P09 (see Next Steps item 10).

## Success Criteria
- `cd kmaedu-be && yarn typecheck && yarn build:all && yarn test`: exit 0, including `yarn test test/authz`.
- `cd kmaedu-be/apps/exam-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership test/study-room-ws.e2e-spec.ts`: exit 0. `cd kmaedu-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership`: exit 0. <!-- Red Team: RT-5, RT-7 -->
- `grep -rn "@Authenticated()" kmaedu-be/apps/{exam,finance,admin,r2}-service/src` → only allowlisted handlers + the WS gateway class.
- `grep -rn "@Throttle" kmaedu-be/apps/exam-service/src` → none. `grep -rn "accessCode?.toString() !==\|providedCode ===" kmaedu-be/apps/exam-service/src` → none. <!-- Red Team: RT-4 -->
- `curl -s localhost:<gw>/api/v1/quizsets/public/x` → 404 `ROUTE_NOT_FOUND`/404.
- STUDENT session in browser: AI tool, manage pages, wallet calls → 403. Study of a whitelisted flashcard set works.

## Risk Assessment
- Over-restriction breaks a legit flow (e.g. teacher preview) → Medium/High. The O|P decorator + ownership rows for own-set preview + manual smoke as TEACHER.
- Host branch removal in `examattempt start` breaks teacher "try exam" → intended (decision). Note in changelog (19).
- Student share button breaks between 06 and 07 → accepted transient on the branch only; production gets 06–09 together at the final merge. <!-- Updated: Validation Session 1 - single production deploy -->
- Matrix test boot cost with many mocked providers → use `useMocker(() => ({}))` and only controllers + guards.
- <!-- Red Team: RT-4 --> Lockout used to deny service to a victim (attacker burns the victim's counter) → Low: the key includes the attacker's own `userId`, so only the attacker is locked.
- <!-- Red Team: RT-5 --> Every study-room user is disconnected at token `exp` (15 min) → High/Medium UX hit if the FE does not reconnect. Countermove: `auth:reauth` event + P09 refresh-and-reconnect; until P09 lands on the branch, the existing reconnect UI shows "disconnected" in local testing. Production gets 06 and 09 together at the final merge. <!-- Updated: Validation Session 1 - single production deploy -->
- <!-- Red Team: RT-5 --> Gateway `gw:user:<id>:av` key name/semantics change in P05 → the WS check silently passes. Countermove: the WS e2e writes the key through the same helper P05 uses (export the key builder from `libs/auth-jwt` or P05's module; agree with P05 before step 8).
- <!-- Updated: Validation Session 1 - demotion keeps content --> A later change joins the owner `User` row into an access check (e.g. to show the owner's role) and silently locks students out after a demotion → Low/High. Countermove: the demoted-owner e2e + the static grep in Tests.
- <!-- Red Team: RT-7 --> Ownership specs slow CI (real Postgres) → one shared seeded DB per spec run, two users, no per-test reset.

## Rollback
- Per-service commits: revert one service's decorator commit to fall back to 04's mechanical `@Authenticated()`. Gap fixes are separate commits and revertible individually.
- <!-- Red Team: RT-4, RT-5 --> The code guard and the WS changes are separate commits. Reverting the WS commit restores the 04 middleware (verify only). Reverting the code guard restores plain compare (and must also revert P07's `unlock` usage).

## Security Considerations
- Deny-by-default + CI declaration test prevent silent exposure of new HTTP and WS handlers. <!-- Red Team: RT-5 -->
- 404 on non-owned resources, 403 only on permission denial. Log 403s with `userId, route, perm` (pino).
- Mappers whitelist output fields (no `...spread`) so new columns never leak.
- <!-- Red Team: RT-4 --> 6-digit codes: auth required, per-user-per-resource lockout (5 / 15 min), constant-time compare, gateway rate limit on top (P05). Anonymous brute force is impossible.
- <!-- Red Team: RT-5 --> A long-lived socket cannot outlive a role change, ban (both bump `authzVersion`) or token `exp`. The WS gate re-verifies in-service even though the gateway checked at upgrade.
- <!-- Red Team: RT-7 --> Every endpoint that is not plain `@RequirePermissions` has a two-user negative test, so IDOR regressions fail CI.

## Next Steps
- Unblocks 07 (sharing builds on `flashcardset-access.ts`, `access-code-guard.ts`, the allowlist), 08 (admin perms in place), 09 (FE mirrors this table; handles `auth:reauth`), 12 (moves the WS middleware unchanged). <!-- Red Team: RT-4, RT-5, RT-6 -->
- [CROSS-PHASE] <!-- Red Team: RT-4 --> Gateway `rateLimit` for `users/search`, `*/verify-code`, `*/with-code`, `*/unlock` lives in `apps/gateway-service/config/routes.yaml` (P05 owns it). The service-side lockout does not depend on it.
- Resolved (reconciliation X4): on `authz_changed` the server emits `auth:reauth` then disconnects; `room:kicked` stays only for the in-room ban. P12 now matches this phase. <!-- Reconcile: X4 -->
- [CROSS-PHASE] Deleting `GET /quizsets/public/:id` must be confirmed against mobile (`kmaedu-app`, phase 18) — not in this checkout.
- Resolved (validation Q1): word-family generation is free (no finance `Debit`), TEACHER-only (`word_family:generate`), rate-limited at the gateway (`word-family-generate`, P05) plus the 20/day per-user cap. <!-- Updated: Validation Session 1 - word-family gen free + gateway rate-limited -->

### Deferred / carried (sync 2026-10-20)
1. AMQP consumer setup failure only warns (`libs/messaging/src/amqp-connection.ts:74-80`). Add a readiness signal (P16/P17). Owner: P16 implementer.
2. `users/search` exact-email match lets a TEACHER confirm an email is registered (`user-search.service.ts:60-70`; rate-limited 30/min). Product decision: keep or drop the exact-email clause. Owner: product (user).
3. `libs/common/utils/generate-code.ts` (unused, `Math.random`): delete in cleanup. Delete only this path (outside `src/`). `libs/common/src/utils/generate-code.ts` is a different, CSPRNG file used by `auth-service` verification codes and must stay. Owner: P19 cleanup.
4. Multipart with a real file is not tested live (needs R2). Cover in the P15/P16 cutover smoke. Owner: P16 cutover runbook.
5. P09 must apply the response-shape change list in `evidence/phase-06/response-shape-changes.md` (sources: `evidence/phase-06-runs.md` and the implementer summaries). Owner: P09 implementer.
6. Code-unlocked students' access is not remembered until P07 (a code unlock lasts one request). Owner: P07 implementer.
7. `GET /quizsets/public/:id` removed. Confirm mobile does not call it during P18. Owner: P18 implementer (kmaedu-app).
8. Zod pipe now enforces DTOs. Run a browser pass on exam-session and study-room forms in P09. Owner: P09 implementer.
9. BaseRepository cache key change affects all services using it (verified finance/exam only). Re-verify any other consumer in P10/P11. Owner: P10 implementer.
10. Added by sync: manual smoke is API-level only (curl, STUDENT vs TEACHER). The browser FE pass and a single TEACHER+ADMIN actor are not in evidence. Run in P09 browser smoke. Owner: P09 implementer.
11. Added by sync: mutant `grpc invalidation not best-effort` (finance `wallet.grpc.controller.ts`, phase-06-runs.md Follow-up 5) SURVIVED: no spec pins the best-effort wrap on that call site. The `UpdateBalance` variant is killed. Add a spec for the `CreateWallet` path or accept the gap. Owner: P10 implementer (finance touched there).
