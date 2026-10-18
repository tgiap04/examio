# Phase 12 — Extract Study-Room & Vocabulary

## Context Links
- [plan.md](./plan.md) · [planner-brief.md](./reports/planner-brief.md) decisions 5, 9, 10 · [red-team-changes.md](./reports/red-team-changes.md) (RT-2, RT-5, RT-8, RT-10, RT-11, RT-15 override the brief)
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §4.4 (study-room, vocabulary rows), §7.4 Redis, §12 P5, **§13 new-service checklist**
- [scout-rbac-surface §1 study-room, word-family](./reports/scout-rbac-surface-report.md)
- Prior: [phase-05 gateway/WS](./phase-05-gateway-rewrite.md), [phase-06](./phase-06-rbac-enforcement-and-security-fixes.md) (WS middleware authz, RT-5), [phase-10](./phase-10-cut-cross-db-access.md), [phase-11](./phase-11-database-per-service.md) (`r2_delete_tasks`)

## Overview
- Priority: P1 · Status: Pending · Effort: 3d · Depends on: 05, 11
- Goal: the first two strangler cuts out of exam-service. `study-room-service` (HTTP + Socket.io `/ws/study`) and `vocabulary-service` (word family + categories). Both have the fewest dependencies (ARCH §12 P5 order).
- **Sequential with 13 → 14**: all three edit `apps/exam-service/src/exam-service.module.ts`, `apps/exam-service/src/main.ts`, `apps/exam-service/prisma/schema/**` and `apps/gateway-service/config/routes.yaml`. Can run in parallel with 15 only (line-level YAML ownership, see Related Code Files).

## Key Insights
- study-room (`apps/exam-service/src/modules/study-room/`, 23 files incl. 9 specs): models StudyRoom, StudyRoomMember, StudyRoomPlaylistItem, StudyRoomChatBlock. No FK to other domains apart from `User` (cut in 11). `RedisIoAdapter` is wired in `apps/exam-service/src/main.ts:9,42-44`. The gateway is `study-room.gateway.ts:63` (`path: WS_STUDY_PATH`, 27 `@SubscribeMessage`).
- <!-- Red Team: RT-5 --> Socket auth runs in the `server.use` middleware (`study-room.gateway.ts:98-106`, `afterInit`). Phase 06 put the RT-5 checks there (token signature/aud/exp/`email_verified`, `study_room:join`, `av` check via the source P06 chose, disconnect at `exp`, disconnect on `auth.user.authz_changed`). This phase moves that code unchanged and re-proves it with message-level e2e tests. HTTP guards return `true` for `ws` contexts (P04), so the middleware is the only WS gate. [CROSS-PHASE] If `study-room-socket-auth.service.ts:45,52` still reads `userSession`/`user`, fix it here first.
- word-family (`modules/word-family/`): models WordFamilyCategory, WordFamily, UserSavedWordFamily. It calls ai-service over HTTP with `x-internal-service-token` (`word-family.service.ts:36,210-216,327-333`).
- `word-family-bridge.service.ts:73-116` creates a `FlashCardSet` + cards in one tx. That write belongs to content, so the `:id/to-flashcard` route stays in exam (content domain) and reads the word family through `vocabulary.v1.GetWordFamily`.
- <!-- Red Team: RT-15 --> Bug: after `createMany`, the bridge looks up the new cards with `flashCard.findMany({ where: { question: { in: [...] } } })` (`word-family-bridge.service.ts:92-96`), which matches cards with the same question across ALL users and links them into the new set. Fixed in the move.
- The exam category CUD routes were deleted in phase 10. Admin uses `WordFamilyAdminService` (served by exam since phase 10); this phase moves that server.
- WordFamily rows are shared catalog data (no `userId`). Only `UserSavedWordFamily` is per-user. Category `imageUrl` is admin-managed R2; vocabulary owns its deletion. <!-- Red Team: RT-8 -->

## Requirements
Functional — study-room-service
- Routes (unchanged paths) and permissions (decision 5):
  - `POST /studyrooms`, `PUT /studyrooms/:id`, `DELETE /studyrooms/:id`, `POST /studyrooms/:id/regenerate-code` → `study_room:create` + room HOST check (`study-room.service.ts:94,105,179`)
  - `GET mine`, `POST join`, `POST :id/join`, `GET :id`, `POST :id/leave`, `GET :id/leaderboard` → `study_room:join`
  - WS `/ws/study` <!-- Red Team: RT-5 -->: `server.use` middleware verifies the token (signature, aud, exp, `email_verified`), requires `study_room:join`, checks `av`, joins room `user:<id>`, schedules a disconnect at token `exp`. HOST/COHOST checks stay room-level (`StudyRoomMember.role`). The gateway class is `@Authenticated()`-declared for the CI declaration test, which also lists every `@SubscribeMessage` handler.
- Events consumed <!-- Red Team: RT-5, RT-10, RT-11 -->:
  - `auth.user.authz_changed {userId, authzVersion, …}` → `fetchSockets()` in `user:<id>` → sockets with `data.av < event.authzVersion` get `auth:reauth { reason: 'AUTHZ_CHANGED' }` + `disconnect(true)` (P06 naming, moved unchanged; covers ban and role change; clients refresh and reconnect). `room:kicked` stays only for the in-room ban (HOST kick). <!-- Reconcile: X4 -->
  - `auth.user.updated {userId, changed, version}` → name/avatar cache DEL (order-safe; the next read refetches).
  - No `auth.user.deleted` consumer (user deletion deferred).
- R2: none (YouTube URLs only).
- Redis prefix `studyroom:`. The Socket.io adapter `key: 'studyroom'` (prepares the deferred phase-17 Redis ACL `&studyroom:*`). <!-- Red Team: RT-11 -->
- The in-service page-flag read is gone (phase 10). The gateway checks `pageFlag: study-room` at upgrade. Join rate limit (5/min) lives in the gateway top-level `rateLimits` entry `studyroom-join` (P05, RT-4). <!-- Reconcile: P05 schema -->

Functional — vocabulary-service
- Routes + permissions:
  - `GET categories`, `GET categories/:slug/roots`, `GET category/:categorySlug/:rootWord`, `GET generation-status/:slug(/:rootWord)` → `word_family:read`
  - `POST save`, `GET saved`, `DELETE saved/:wordFamilyId` → `word_family:save` (STUDENT + TEACHER) <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->
  - `POST generate`, `POST generate-root` → `word_family:generate` + the phase-06 per-user limit of 20/day (Redis key moves under prefix `vocab:`). Free: no finance `Debit`, no finance client in vocabulary-service; TEACHER-only via `word_family:generate`; rate-limited at the gateway by the path-keyed `word-family-generate` entry (P05, unchanged by the move). <!-- Updated: Validation Session 1 - word-family gen free + gateway rate-limited -->
- gRPC `examio.vocabulary.v1`: `WordFamilyAdminService {ListCategories, UpsertCategory, DeleteCategory}` (moved, contract unchanged; <!-- Red Team: RT-2 --> forwarded admin token with `word_family:admin`, actor = token `sub`); add `WordFamilyService.GetWordFamily(id)` (any valid user or service token) for exam/content.
- `DeleteCategory` and an `UpsertCategory` that replaces `imageUrl` enqueue the old key in vocabulary's `r2_delete_tasks` in the same tx; the vocabulary worker drains it (phase-11 pattern). Add `'vocabulary'` to the r2 `DeleteObjects` `@ServiceOnly(...)` decorator (code, not env). <!-- Red Team: RT-8 --> <!-- Reconcile: X6 -->
- AI call: move it as-is behind `src/clients/ai.client.ts` (HTTP + `INTERNAL_SERVICE_TOKEN`, temporary). **Phase 13 switches it to gRPC `GenerateWordFamily`.**
- Events consumed: none. <!-- Red Team: RT-11 --> (`UserSavedWordFamily` cleanup on user deletion is deferred.)
- `ROLE=api,worker` in one process (low traffic, ARCH §10.1); the worker runs the R2 delete poller.

Functional — exam `to-flashcard` <!-- Red Team: RT-15 -->
- `word-family-to-flashcard.service.ts` assigns card ids before insert (`createId()` per card) and links exactly those ids into `DetailsFlashCard`. No lookup by `question`.

Non-functional
- Every listed route keeps its exact response shape (FE + mobile unchanged). WS reconnects after deploy (client already retries).

## Architecture
```
Browser ──/api/v1/studyrooms/*, WS /ws/study──► gateway ──► study-room-service:3000 (HTTP + Socket.io, Redis adapter "studyroom")
Browser ──/api/v1/word-family/*──────────────► gateway ──► vocabulary-service:3000
Browser ──/api/v1/word-family/:id/to-flashcard► gateway ──► exam-service (content domain) ─gRPC GetWordFamily─► vocabulary
admin-service ─gRPC WordFamilyAdminService (admin token)──► vocabulary-service:50051 ─tx─► category + r2_delete_tasks
vocabulary ─HTTP (temp)──► ai-service /generate/word-family    (gRPC in phase 13)
auth outbox ─► auth.user.authz_changed|updated ─► studyroom.events ─► disconnect / cache DEL
```
Gateway `config/routes.yaml` changes (phase-05 schema `{id, upstream, match:{prefix}|{path}, auth, permissions?, pageFlag?, timeout?, websocket?}`; rate limits are the separate path-keyed top-level `rateLimits` table; upstreams via `${ENV}`):
```yaml
- { id: studyrooms, upstream: '${STUDYROOM_SERVICE_URL}', match: { prefix: /api/v1/studyrooms }, auth: required, pageFlag: study-room }  # was exam
- { id: ws-study,   upstream: '${STUDYROOM_SERVICE_URL}', match: { prefix: /ws/study }, auth: required, websocket: true, pageFlag: study-room }
- { id: wf-to-flashcard, upstream: '${EXAM_SERVICE_URL}', match: { path: '^/api/v1/word-family/[^/]+/to-flashcard$' }, auth: required }  # path wins over prefix
- { id: word-family, upstream: '${VOCABULARY_SERVICE_URL}', match: { prefix: /api/v1/word-family }, auth: required, pageFlag: word-family }  # was exam
```
Gateway env: `STUDYROOM_SERVICE_URL=http://study-room-service:3000`, `VOCABULARY_SERVICE_URL=http://vocabulary-service:3000`. Keep the existing route ids; change only `upstream`. The path-keyed P05 `rateLimits` entries need no change.

## Related Code Files
File ownership (globs):
- Create: `/Users/tgiap.dev/devs/examio/examio-be/apps/study-room-service/**`, `/Users/tgiap.dev/devs/examio/examio-be/apps/vocabulary-service/**`
- Create: `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/vocabulary/v1/word_family.proto` (adds `WordFamilyService`; the admin service file moves here if phase 10 put it elsewhere)
- Create: `/Users/tgiap.dev/devs/examio/examio-be/deploy/compose/{study-room,vocabulary}.yml`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/env/{studyroom,vocabulary}.env.example`
- Create: `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/flashcardset/word-family-to-flashcard.{controller,service}.ts`, `.../apps/exam-service/src/clients/vocabulary.client.ts`
- Modify (shared with 13/14 → sequential): `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/{exam-service.module.ts,main.ts,worker.module.ts}`, `.../apps/exam-service/prisma/schema/{study-room,vocabulary}.prisma` (delete) + new exam migration
- Modify (line-level; 15 owns the `ai-upload*`/`r2-image` entries only): `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/config/routes.yaml` entries `studyrooms`, `ws-study`, `word-family`, `wf-to-flashcard`
- Modify (append-only, serialize merges with 15): `/Users/tgiap.dev/devs/examio/examio-be/{nest-cli.json,package.json,jest.config.js,deploy/docker-compose.yml(include list),scripts/check-model-ownership.ts(map)}`
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/deploy/env/admin.env.example` (`VOCABULARY_GRPC_URL`), gateway env (upstreams), `/Users/tgiap.dev/devs/examio/examio-be/apps/r2-service/src/r2-service.controller.ts` (`DeleteObjects` `@ServiceOnly` list + `vocabulary`, decorator line only) <!-- Red Team: RT-8 --> <!-- Reconcile: X6 -->
- Delete: `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/{study-room,word-family}/**`

## Implementation Steps
New-app scaffold checklist (ARCH §13), per service (`study-room`, `vocabulary`):
1. Proto: `vocabulary/v1` additions; `buf lint && buf generate`. (study-room has no gRPC server; HTTP + WS only.)
2. App: `nest g app <svc>-service`. `main.ts` reads `ROLE` (api|worker|migrate). `config/env.schema.ts` (zod). Wire `libs/{auth-jwt,grpc,messaging,observability,http,redis}`. HTTP 3000 / gRPC 50051 (vocabulary).
3. Prisma: `apps/<svc>-service/prisma/schema.prisma` with `schema=<studyroom|vocabulary>`; models copied from exam `prisma/schema/{study-room,vocabulary}.prisma` + `ProcessedEvent` (study-room) / `r2_delete_tasks` (vocabulary); `scripts/prisma-migrate-dev.sh <svc> init`.
4. DB/Redis/Rabbit: schema + role already exist (phase 11 init). Queue `studyroom.events` + bindings (`auth.user.authz_changed`, `auth.user.updated`) declared by libs/messaging on start. vocabulary declares no queue.
5. Compose: `deploy/compose/<svc>.yml` with `<svc>-migrate`, `<svc>` (+ `<svc>-worker` for study-room). Add the include line.
6. Gateway: upstream + route entries above. Update the phase-01 route snapshot test (upstream column only).
7. Callers: admin `VOCABULARY_GRPC_URL=vocabulary-service:50051`; exam `vocabulary.client.ts` for `GetWordFamily`.
8. Event handlers per the Requirements (study-room only).
9. CI: add to the phase-01 workflow service list (matrix finalized in phase 16). e2e with Postgres/Redis/Rabbit service containers.
10. Observability: `/health/{live,ready}`, pino with `service` label (`/metrics` arrives with phase 17). <!-- Reconcile: X9 -->

Moves:
11. `git mv apps/exam-service/src/modules/study-room/* apps/study-room-service/src/modules/study-room/`. Move `redis-io.adapter.ts` wiring into the new `main.ts`. Delete it from exam `main.ts`. The P06 `server.use` middleware and its authz consumer move unchanged. <!-- Red Team: RT-5 -->
12. `git mv apps/exam-service/src/modules/word-family/* apps/vocabulary-service/src/modules/word-family/` except `word-family-bridge.service.ts`. That file becomes `apps/exam-service/src/modules/flashcardset/word-family-to-flashcard.service.ts`, which calls `GetWordFamily` instead of `wordFamily` Prisma reads and pre-assigns card ids (RT-15); its route moves into `word-family-to-flashcard.controller.ts` (`@Controller('word-family')`, `POST :id/to-flashcard`, `flashcardset:manage`).
13. vocabulary `DeleteCategory`/`UpsertCategory` → `r2_delete_tasks` enqueue in the tx; wire the poller in the worker role. <!-- Red Team: RT-8 -->
14. Exam removal: drop `StudyRoomModule`, `WordFamilyModule` from `exam-service.module.ts:27-28,49-50`. Delete the schema files. `prisma migrate dev --create-only --name drop_studyroom_vocabulary` (DROP TABLEs; DB reset, no copy). Update the ownership map. Move the exam legacy seed `prisma/seed/word-family-categories.ts` (phase 11) to `apps/vocabulary-service/prisma/seed.ts`.
15. Run both `<svc>-migrate`, switch the YAML, smoke, then delete the moved dirs from exam (same PR; rollback = revert).

## Tests
Write first:
- Move the existing 9 study-room specs unchanged; they must pass in the new app (`yarn test apps/study-room-service`).
- `apps/study-room-service/test/ws-auth.e2e-spec.ts` <!-- Red Team: RT-5 -->, message-level through the gateway: STUDENT and TEACHER tokens → connect → `room:join` → `chat:send` delivered to a second member; SYSTEM_ADMIN-only token → `connect_error` (no `study_room:join`); no token / `email_verified=false` → `connect_error`; publish `auth.user.authz_changed` with a higher `authzVersion` → the socket receives `auth:reauth {AUTHZ_CHANGED}` (not `room:kicked`) and is disconnected, <!-- Reconcile: X4 --> and reconnecting with the old token → `connect_error` (`TOKEN_STALE`); a token that expires during the session → disconnected at `exp`.
- `apps/study-room-service/test/permissions.e2e-spec.ts`: STUDENT `POST /studyrooms` → 403; TEACHER → 201; non-host PUT → 404.
- `apps/vocabulary-service/test/permissions.e2e-spec.ts`: STUDENT `POST generate` → 403; STUDENT `POST save` → 201; TEACHER `POST save` → 201 and `GET saved` → 200 (catalog: TEACHER has `word_family:save`); TEACHER `POST generate` → 2xx with no wallet transaction written; the 21st generation in a day → 429. <!-- Updated: Validation Session 1 - TEACHER += word_family:save; free generation -->
- gRPC contract test: admin `UpsertCategory` → vocabulary server (generated types), category visible via `GET categories`; a call without a `word_family:admin` token → `PERMISSION_DENIED`. <!-- Red Team: RT-2 -->
- `DeleteCategory` with an image → `r2_delete_tasks` row in the same tx; worker → `DeleteObjects([key])`. <!-- Red Team: RT-8 -->
- exam `word-family-to-flashcard` unit <!-- Red Team: RT-15 -->: fake `GetWordFamily` → FlashCardSet + cards created; a pre-existing card of ANOTHER user with an identical `question` is NOT linked into the new set; `NOT_FOUND` → 404.
- `auth.user.updated` replayed or out of order → cache ends empty (next read refetches); no error. <!-- Red Team: RT-10 -->
- CI "every handler declared" test runs in both new apps and includes `@SubscribeMessage` handlers.

## Todo List
- [ ] Scaffold study-room-service (§13 steps 1–10)
- [ ] Scaffold vocabulary-service (§13 steps 1–10)
- [ ] Move study-room module + WS adapter + P06 middleware; message-level WS e2e <!-- Red Team: RT-5 -->
- [ ] Move word-family module; relocate the bridge to exam flashcardset; fix the cross-user card lookup <!-- Red Team: RT-15 -->
- [ ] `GetWordFamily` RPC + exam client
- [ ] Move the WordFamilyAdminService server; admin URL switch
- [ ] `authz_changed` disconnect + `updated` cache handlers (study-room) <!-- Red Team: RT-5, RT-10 -->
- [ ] vocabulary `r2_delete_tasks` + poller <!-- Red Team: RT-8 -->
- [ ] Gateway YAML + route snapshot
- [ ] Exam removal + drop migration + ownership map + seed move

## Success Criteria
- `grep -rn "StudyRoomModule\|WordFamilyModule" /Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src` → no output.
- `grep -rn "question: { in:" /Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/flashcardset` → no output. <!-- Red Team: RT-15 -->
- `cd /Users/tgiap.dev/devs/examio/examio-be && yarn build && yarn test && npx depcruise apps libs` green.
- `docker compose -f deploy/docker-compose.yml up -d --wait study-room-service vocabulary-service` → healthy. `curl -s localhost:<gw>/api/v1/word-family/categories -H "Authorization: Bearer $STUDENT"` → 200 with the same JSON as before.
- FE `/k/study-room`: create (teacher), join (student), timer/chat/playlist sync across 2 browsers. Admin word-family CRUD works. Banning a joined user from the admin UI removes them from the room within 5 s. <!-- Red Team: RT-5 -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| WS breaks through the new upstream | M | H | ws-auth e2e through the gateway; keep the exam WS code until the smoke passes (same PR) |
| WS authz regresses in the move (HTTP guards skip `ws`) | M | H | Message-level e2e incl. stale/expired tokens; declaration test covers `@SubscribeMessage` <!-- Red Team: RT-5 --> |
| Socket.io Redis adapter channel mismatch across instances | L | M | Single instance now; adapter `key` set explicitly; test 2 replicas in compose |
| `to-flashcard` regresses (cross-domain write) | M | M | Dedicated unit + e2e; route regex ordered before the prefix |
| Shared-file merge conflicts with 15 | M | L | Line-level YAML ownership; append-only edits; rebase before merge |

## Rollback
- Flip the YAML upstreams back to `exam` and revert the PR (exam modules come back with the revert). DB reset policy: re-run exam-migrate; the dropped tables are recreated from the reverted migration history.

## Security Considerations
- <!-- Red Team: RT-5 --> The WS middleware re-verifies the JWT in-service, checks `av`, and enforces `exp`, even though the gateway checked at upgrade. A long-lived socket cannot outlive a ban or role change.
- study-room has no gRPC server port exposed. vocabulary gRPC is internal-only; <!-- Red Team: RT-2 --> admin RPCs require the forwarded admin token with `word_family:admin` (network placement is not the trust boundary).
- `INTERNAL_SERVICE_TOKEN` stays only in vocabulary env until phase 13.

## Next Steps
- Phase 13: ai-chat extraction + switch vocabulary `ai.client.ts` to gRPC.
