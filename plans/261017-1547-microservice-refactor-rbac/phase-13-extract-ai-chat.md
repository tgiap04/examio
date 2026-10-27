# Phase 13 — Extract AI-Chat (+ Subjects)

## Context Links
- [plan.md](./plan.md) · [planner-brief.md](./reports/planner-brief.md) decisions 5, 9 · [red-team-changes.md](./reports/red-team-changes.md) RT-2, RT-8, RT-11, RT-15 (authoritative over this file's earlier text) <!-- Red Team: RT-2, RT-8, RT-11, RT-15 -->
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §4.4 (ai-chat row), §4.5, §6.2 (`ai/v1`, `document/v1`), §12 P5, **§13 checklist**
- [researcher-02 §2 server-streaming → SSE](./research/researcher-02-migration-mechanics-report.md)
- Prior: [phase-11](./phase-11-database-per-service.md) (`r2_delete_tasks`, `r2-key-from-url.ts`), [phase-12](./phase-12-extract-study-room-and-vocabulary.md), [phase-15](./phase-15-document-service-and-ai-service-db.md) (AiService gRPC + document-service + `DeleteDocuments`)

## Overview
- Priority: P1 · Status: Done (signed off and committed 2026-10-25, 8b4a881..ebae483) · Effort: 2d (unchanged: the dropped user-purge work offsets the clear-chat/R2 additions) <!-- Red Team: RT-8, RT-11 --> · Depends on: 11, 12, 15 (ai-chat reads `UserStorage` and streams from ai-service, so it needs document-service + `AiService.StreamChat` from phase 15; plan.md agrees). <!-- Reconcile: deps -->
- Goal: `ai-chat-service` owns AI conversations, AI-teacher subjects (`Subject.systemPrompt`) and chat↔document links. It talks to ai-service over gRPC only, with a service token. After this phase, no HTTP caller of ai-service remains, so the compat HTTP and the last `INTERNAL_SERVICE_TOKEN` users are removed. <!-- Red Team: RT-2 -->
- Sequential: after 12, before 14 (shared `exam-service.module.ts`, `main.ts`, exam `prisma/schema/**`, routes YAML).

## Key Insights
- Source: `apps/exam-service/src/modules/ai-chat/` (controller with 16 routes `ai-chat.controller.ts:34-257`, service, repository, module) and `modules/subject/` (4 public GETs `subject.controller.ts:10-32`).
- Prisma models touched by ai-chat: `aIChat`, `aIChatMessage`, `aIChatDocument`, `subject`. The `userStorage` reads, the `/ai/process-file` call (`ai-chat.service.ts:648`) and the `clearChat` file deletion were already switched to `document.v1` (`GetDocumentsByIds`/`AssertOwnership`/`EnsureProcessed`/`DeleteDocuments`) by the phase-15 carve-out. <!-- Red Team: RT-8 -->
- Remaining ai-service HTTP calls: `/chat/query` (`ai-chat.service.ts:233`), `/chat/stream` (`:366`) → `AiService.Query`, `AiService.StreamChat`. They are served by ai-service compat HTTP (`AI_HTTP_COMPAT=true`) until this phase. Today they send `x-internal-service-token` (`ai-chat.service.ts:54-55`). <!-- Red Team: RT-2 -->
- Subscription limits use the finance `subscription` gRPC (`ai-chat.module.ts:22-25`, `checkLimits` `:675-720`) → `finance.v1.GetUserBenefits` via libs/grpc.
- <!-- Red Team: RT-8 --> R2 deletion in chat code today:
  - `clearChat(chatId, user, deleteFiles)` (`ai-chat.service.ts:740-793`) loops over the chat's documents, calls `r2UploadService.deleteImage(keyR2)` (`:769`) and `prisma.userStorage.delete` (`:774`) per doc, swallowing per-file errors. Phase 11 turned the R2 call into an `r2_delete_tasks` enqueue; phase 15 replaced the whole loop with one `DocumentService.DeleteDocuments(ids)` call (document-service owns `UserStorage` and its R2 key).
  - `deleteChat` (`:147-151`) and `clearChat` cascade-delete `AIChatMessage` rows whose `imageUrl` (`ai-chat.prisma:23`) may point at R2. Nothing deletes those objects today (orphans). `POST /ai/upload-image` is still a placeholder (`ai.controller.ts:196-205`), so most messages carry no image; `/r2/image` uploads can still produce R2 URLs.
- Remaining ai-service HTTP callers after phase 15: ai-chat (this phase) and vocabulary `clients/ai.client.ts` (phase 12, temporary; was `word-family.service.ts:215,332`, also `x-internal-service-token`). Both are switched here. <!-- Red Team: RT-2 -->
- <!-- Red Team: RT-15 --> After phase 15, `INTERNAL_SERVICE_TOKEN` is gone from r2 (`r2-service.controller.ts:47-90` → `r2.v1` gRPC) and from exam `modules/ai`. What is left: ai-service compat (`src/backend/main.py:121-122`, `.env.example:48`), ai-chat (`ai-chat.service.ts:54-55`), vocabulary `ai.client.ts`, `deploy/.env.example:7`. This phase removes all of them.
- The SSE stream is buffered today by the old gateway (scout). Phase 05 made the gateway stream; this phase makes the upstream stream token-by-token from gRPC.
- <!-- Red Team: RT-11 --> User deletion is deferred (phase 11). ai-chat has no `auth.user.deleted` handler and no purger.

## Requirements
Functional
- Routes (paths unchanged): all `/api/v1/ai-chat/*` → `@RequirePermissions('ai_chat:use')` + owner check (`chat.userId === sub` → else 404, incl. `:chatId/exists`, scout gap 8). `/api/v1/subjects/*` (`categories`, `/`, `:id`, `slug/:slug`) → `@Public()`.
- Streaming `POST :chatId/stream` and `POST message/:messageId/regenerate-stream`: manual SSE from `AiService.StreamChat` (server-stream). Headers `text/event-stream`, `X-Accel-Buffering: no`, 15s `: hb` heartbeat. `res.on('close')` → unsubscribe → gRPC cancel. Persist the assistant message on `complete`; on cancel, persist the partial text [UNVERIFIED current behaviour; match it].
- Attach document `POST :chatId/documents`: `DocumentService.AssertOwnership([storageId], sub)` then insert `AIChatDocument {chatId, documentId}` (no FK). Listing enriches via `GetDocumentsByIds` (one batch). Pending docs → `EnsureProcessed` (fire-and-forget per doc, no 5-min blocking loop). The send endpoint returns `409 DOCUMENT_PROCESSING` while status is not COMPLETED [confirm UX] or proceeds without the doc.
- <!-- Red Team: RT-8 --> Delete / clear chat:
  - `DELETE :chatId?deleteFiles=true` (`clearChat`): (1) owner check; (2) if `deleteFiles`, collect the chat's `AIChatDocument.documentId`s and call `DocumentService.DeleteDocuments(ids)` with the forwarded user token (owner-scoped; ids not owned or already deleted come back in `not_found_ids` and are skipped). `UNAVAILABLE`/`DEADLINE_EXCEEDED` → 503 and the chat is NOT deleted, so the user can retry (the RPC is idempotent). (3) One local tx: collect `AIChatMessage.imageUrl` → keys via `r2KeyFromUrl` (`libs/common/src/utils/r2-key-from-url.ts`, phase 11; `null` for non-R2 hosts) → `r2_delete_tasks.enqueue(tx, keys)` + `DELETE AIChat` (cascade messages, doc links). Response keeps `{ success, message, deletedFiles }`, with `deletedFiles` = the filenames returned by `DeleteDocuments`.
  - `deleteChat` and `deleteMessage` use the same step (3) for message images.
  - The aichat worker (`ROLE=worker`) drains `r2_delete_tasks` with the phase-11 shared worker. No handler calls R2 after commit.
- Limits: `GetUserBenefits(sub)` cached `aichat:benefits:<id>` 5m; consume `finance.subscription.changed` → DEL.
- Events consumed <!-- Red Team: RT-11 -->: `document.deleted {storageIds}` (delete `AIChatDocument` rows with `documentId IN storageIds`; no-op if the chat is already gone), `finance.subscription.changed`. No `auth.user.deleted` consumer (user deletion deferred). ai-chat publishes no events.
- <!-- Red Team: RT-15 --> ai-chat needs no user profile data. Any future enrichment uses `auth.v1.GetPublicProfilesByIds` (public projection), never `GetUsersByIds`. No ai-chat response contains `email`.
- vocabulary: `apps/vocabulary-service/src/clients/ai.client.ts` → gRPC `AiService.GenerateWordFamily` (deadline 60s) with a service token `svc:vocabulary`. Delete the HTTP code + env. <!-- Red Team: RT-2 -->
- ai-service: delete the remaining compat HTTP (`src/backend/api/chat.py` + the word-family route kept by phase 15, the `AI_HTTP_COMPAT` flag, and the `include_router` at `src/backend/main.py:136`), keeping `/health` (+ dev routes only when `ENV=dev`). Remove `INTERNAL_SERVICE_TOKEN` from ai-service (`main.py:121-122`), all env files and `libs/common` (if referenced).

Non-functional
- gRPC deadlines: Query 60s, StreamChat none + rxjs idle `timeout({each: 60_000})`. ai-service `maximum_concurrent_rpcs=64` → `RESOURCE_EXHAUSTED` → 429.
- First token latency ≤ the current baseline (phase-01 metrics) + 100ms.
- <!-- Red Team: RT-2 --> Trust model (P04 service tokens):
  - ai-chat → ai-service (`Query`, `StreamChat`, `ListModels`) and vocabulary → ai-service (`GenerateWordFamily`): service token `sub=svc:ai-chat|svc:vocabulary`, `aud=ai`, from the P04 service-token provider (5-min TTL, cached by the caller). The phase-15 Python verifier allowlists both callers.
  - ai-chat → document (`AssertOwnership`, `GetDocumentsByIds`, `EnsureProcessed`, `DeleteDocuments`) and → finance `GetUserBenefits`: forwarded user token (explicit `metadata` param, P02).
  - ai-chat worker → r2 `DeleteObjects`: service token `svc:ai-chat`. Add `'ai-chat'` to the r2 `DeleteObjects` `@ServiceOnly(...)` decorator (code, not env). <!-- Reconcile: X6 -->
  - RabbitMQ user `aichat` (P03 pattern): read on `aichat.events` (+ its retry queue) only, no publish permission.

## Architecture
```
Browser ─POST /api/v1/ai-chat/:id/stream─► gateway (route timeout 0, no buffering) ─► ai-chat-service
  ai-chat ─gRPC GetUserBenefits (user token)─► finance
  ai-chat ─gRPC AssertOwnership/GetDocumentsByIds/EnsureProcessed/DeleteDocuments (user token)─► document
  ai-chat ─gRPC StreamChat (server-stream, svc token)─► ai-service ── tokens ──► SSE `data:` frames ──► Browser
vocabulary ─gRPC GenerateWordFamily (svc token)─► ai-service
events: document.deleted, finance.subscription.changed ─► aichat.events
clear chat: DeleteDocuments ─► tx { enqueue r2_delete_tasks(image keys); DELETE AIChat } ─► aichat worker ─DeleteObjects (svc token)─► r2
```
<!-- Red Team: RT-2, RT-8, RT-11 -->
Prisma (`schema=aichat`): `AIChat`, `AIChatMessage`, `AIChatDocument (documentId String @index, no relation)`, `SubjectCategory`, `Subject` (intra-service FKs `AIChat→Subject SetNull`, `Subject→SubjectCategory` kept), `ProcessedEvent`, `r2_delete_tasks` (phase-11 table). <!-- Red Team: RT-8 -->
Gateway `config/routes.yaml` (phase-05 schema; change `upstream` on the existing ids, keep phase 05's SSE `timeout: 0` entries):
```yaml
- { id: ai-chat-stream, upstream: '${AICHAT_SERVICE_URL}', match: { path: '^/api/v1/ai-chat/.+/(stream|regenerate-stream)$' }, auth: required, permissions: [ai_chat:use], timeout: 0 }
- { id: ai-chat,  upstream: '${AICHAT_SERVICE_URL}', match: { prefix: /api/v1/ai-chat },  auth: required, permissions: [ai_chat:use] }  # was exam
- { id: subjects, upstream: '${AICHAT_SERVICE_URL}', match: { prefix: /api/v1/subjects }, auth: optional }                               # was exam
```

## Related Code Files
File ownership (globs):
- Create: `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-chat-service/**`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/compose/ai-chat.yml`, `/Users/tgiap.dev/devs/examio/examio-be/deploy/env/aichat.env.example`
- Modify (sequential with 12/14): `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/{exam-service.module.ts,worker.module.ts}`, `.../apps/exam-service/prisma/schema/ai-chat.prisma` (delete) + exam drop migration
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/config/routes.yaml` (entries `ai-chat*`, `subjects`)
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/apps/vocabulary-service/src/clients/ai.client.ts`, `.../apps/vocabulary-service/src/config/env.schema.ts`
- Modify/Delete (phase 15 finished, so no collision): `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src/backend/{main.py,api/**}`, `.../apps/ai-service/.env.example`
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/apps/r2-service/src/r2-service.controller.ts` (`DeleteObjects` `@ServiceOnly` + `ai-chat`, decorator line only), ai-service `src/backend/auth/service_token.py` (`ALLOWED_CALLERS` constant already lists `ai-chat`, `vocabulary` from 15; verify), `/Users/tgiap.dev/devs/examio/examio-be/deploy/rabbitmq/definitions.template.json` (user `aichat`; rendered at deploy) <!-- Red Team: RT-2, RT-8 --> <!-- Reconcile: X6 -->
- Modify (append-only): `/Users/tgiap.dev/devs/examio/examio-be/{nest-cli.json,package.json,jest.config.js,deploy/docker-compose.yml,scripts/check-model-ownership.ts}`, `deploy/env/*.env.example` (drop `INTERNAL_SERVICE_TOKEN`, `AI_SERVICE_URL`), `/Users/tgiap.dev/devs/examio/examio-be/deploy/.env.example` (line 7) <!-- Red Team: RT-15 -->
- Delete: `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/{ai-chat,subject}/**`
- Seed move: `apps/exam-service/prisma/seed/subjects.ts` (phase-11 per-owner seed file) → `apps/ai-chat-service/prisma/seed.ts` <!-- Red Team: RT-14 -->

## Implementation Steps
Scaffold (ARCH §13):
1. Proto: no new server proto (ai-chat exposes HTTP only). Consumes `ai/v1`, `document/v1` (incl. `DeleteDocuments` from 15), `finance/v1`, `r2/v1`. Confirm generated types exist (`yarn proto:gen`). <!-- Red Team: RT-8 -->
2. App `ai-chat-service`: `main.ts` with `ROLE`, env zod, libs wiring, HTTP 3000.
3. Prisma `schema=aichat` (models above, incl. `r2_delete_tasks`) + baseline via `scripts/prisma-migrate-dev.sh ai-chat init`. <!-- Red Team: RT-8 -->
4. Queue `aichat.events` bindings: `document.deleted`, `finance.subscription.changed`. Redis prefix `aichat:`. RabbitMQ user `aichat` in `deploy/rabbitmq/definitions.template.json`. <!-- Red Team: RT-2, RT-11 --> <!-- Reconcile: X6 -->
5. Compose `deploy/compose/ai-chat.yml` (`ai-chat-migrate`, `ai-chat`, `ai-chat-worker`) + include line.
6. Gateway entries above; update the route snapshot.
7. Clients: `src/clients/{ai,document,finance,r2}.client.ts` (libs/grpc, explicit `metadata`). document/finance: forwarded user token. ai: service token `svc:ai-chat` (`aud=ai`). r2 (worker only): service token. <!-- Red Team: RT-2 -->
8. <!-- Red Team: RT-8 --> R2: wire the phase-11 `r2_delete_tasks` writer + worker (`ROLE=worker`); add `'ai-chat'` to the r2 `DeleteObjects` `@ServiceOnly(...)` decorator. <!-- Reconcile: X6 -->
9. CI + 10. Observability as in phase 12.
Moves:
11. `git mv` `modules/ai-chat` and `modules/subject` into the new app. Replace the chat HTTP calls with `AiService` client calls (drop the `x-internal-service-token` header, `ai-chat.service.ts:54-55`). Keep the document client calls from phase 15 (incl. `DeleteDocuments` in `clearChat`). Remove `R2UploadService`. <!-- Red Team: RT-2, RT-8 -->
12. Rewrite the two stream handlers to the manual-SSE pattern (researcher-02 §2).
13. <!-- Red Team: RT-8 --> `clearChat`/`deleteChat`/`deleteMessage`: the 503-on-`DeleteDocuments`-failure rule, then one tx with `r2KeyFromUrl(imageUrl)` keys → `r2_delete_tasks` + row delete. (Replaces the old step "move `ai-chat.user-purge.ts`", removed by RT-11.)
14. Exam removal: drop `AIChatModule`, `SubjectModule` from `exam-service.module.ts`. Delete the schema file. Drop migration. Ownership map. Remove `ai-chat` code paths from the exam `r2_delete_tasks` writer list.
15. vocabulary: switch `ai.client.ts` to gRPC with a `svc:vocabulary` service token; e2e `POST /word-family/generate` green. <!-- Red Team: RT-2 -->
16. ai-service cleanup: delete the HTTP routers + token check; run the grep gate in Success Criteria → none. <!-- Red Team: RT-15 -->

## Tests
Write first:
- `apps/ai-chat-service/test/stream.e2e-spec.ts` with a fake gRPC `AiService` (grpc-js server in test): emits 3 chunks → client receives 3 `data:` frames before `complete`. Client abort → fake server sees `CANCELLED`. Upstream error → `event: error` frame.
- Ownership: another user's `chatId` on `GET :id/exists`, `GET :id/messages`, `POST :id/stream`, `DELETE :id` → 404. <!-- Red Team: RT-8 -->
- Permissions matrix: STUDENT → 403 on all `/ai-chat/*`; anonymous `GET /subjects` → 200.
- Attach doc: `AssertOwnership` `NOT_FOUND` → 404. The list uses exactly 1 `GetDocumentsByIds` call for N docs.
- Limits: `GetUserBenefits` free tier → the 6th message within a minute → 429 (`checkLimits` parity).
- <!-- Red Team: RT-8 --> e2e "clear chat with files" (`test/clear-chat.e2e-spec.ts`, fake document + r2 gRPC): a chat with 2 docs + 1 message with an R2 `imageUrl` + 1 message with an external URL → `DELETE :id?deleteFiles=true` → exactly 1 `DeleteDocuments([d1,d2])` call with the user token; response `deletedFiles` = both filenames; chat, messages and links gone; `r2_delete_tasks` holds exactly the R2 image key (the external URL is skipped); the worker sends `DeleteObjects([key])` once with a `svc:ai-chat` token. Fake document `UNAVAILABLE` → 503, chat still present, no task row. Replay after success → 404 (chat gone), no extra `DeleteDocuments`.
- `deleteChat` without `deleteFiles` → no `DeleteDocuments` call; image keys still enqueued.
- Handlers: `document.deleted` removes links (and is a no-op for a deleted chat); replay = no-op. <!-- Red Team: RT-11 -->
- <!-- Red Team: RT-2 --> Service token: the ai client sends `authorization: Bearer <svc token>` with `aud=ai`; the fake AiService rejects a user token → `PERMISSION_DENIED` surfaces as 502 (not a silent success).
- <!-- Red Team: RT-15 --> Email key scan over the ai-chat e2e responses → no `email` key.
- vocabulary `GenerateWordFamily` contract test (Nest client ↔ Python server in compose CI job), incl. a call without a service token → `UNAUTHENTICATED`. <!-- Red Team: RT-2 -->

## Todo List
- [x] [CARRIED from 10] `finance.subscription.changed` effective tier, published on expiry and reactivation (Part A + F2 fix). Evidence: finance e2e 73/73 incl. `subscription-changed`; F2 re-verification (read path and sweeper each publish one `toTier 0` event, no duplicate).
- [x] Scaffold ai-chat-service (§13), incl. RabbitMQ user `aichat` <!-- Red Team: RT-2 -->. Evidence: compose healthy from empty volume; `aichat` migrate exit 0; broker ACL probes as expected.
- [x] Move ai-chat + subject modules. Evidence: exam greps empty; ai-chat-service e2e 83/83; `/subjects` anonymous 200.
- [x] gRPC Query/StreamChat (service token) + manual SSE <!-- Red Team: RT-2 -->. Evidence: stage 4a PASS; F1 fixed (client abort cancels the upstream call).
- [x] document/finance/r2 clients replace Prisma + R2UploadService. Evidence: no `R2UploadService` and no `deleteImage(`/`deleteFile(` in `apps/ai-chat-service`.
- [x] clearChat/deleteChat: `DeleteDocuments` + image keys → `r2_delete_tasks` + worker; e2e clear chat with files <!-- Red Team: RT-8 -->. Evidence: stage 4c PASS, 503 path PASS, owned R2 object gone in 46 s.
- [x] Event handlers (document.deleted, subscription.changed) <!-- Red Team: RT-11 -->. Evidence: stage 4d(i)/(ii) and 4f PASS.
- [x] Gateway YAML (stream route timeout 0) + snapshot. YAML live PASS (stage 4; gateway e2e 61/61); the route snapshot is `apps/gateway-service/test/route-coverage.spec.ts` (every inventory line served; ai-chat, ai-chat-stream, regenerate-stream and subjects resolve to the `aichat` upstream).
- [x] Exam removal + drop migration. Evidence: exam greps empty; `migrate deploy` x8 on empty DB; `migrate diff` no drift x8; exam e2e 256/256.
- [x] vocabulary → gRPC GenerateWordFamily (service token) <!-- Red Team: RT-2 -->. Evidence: stage 4e PASS (201, `sub=svc:vocabulary`, no wallet transaction).
- [x] Remove ai-service HTTP compat + every remaining INTERNAL_SERVICE_TOKEN <!-- Red Team: RT-15 -->. Evidence: grep gate empty; live `/` and `/health` only (POST 405, removed routes 404).

## Success Criteria
Status 2026-10-25: 9/9 PASS (criteria 6 and 9 reworded, see notes). Evidence: [phase-13-runs.md](./evidence/phase-13-runs.md), [inspection-verdict.json](./evidence/phase-13/inspection-verdict.json). Signed off and committed 2026-10-25 (8b4a881..ebae483).
- [x] 1. `grep -rn "AIChatModule\|SubjectModule" /Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src` → no output.
- [x] 2. <!-- Red Team: RT-15 --> `grep -rn "INTERNAL_SERVICE_TOKEN\|x-internal-service-token\|AI_SERVICE_URL"` over `apps`, `libs`, `deploy` (`*.ts`, `*.py`, `*.example`, `*.yml`) → no output. ai-service serves only `/` and `/health` (live: POST 405, removed routes 404). <!-- Reconcile: X7 -->
- [x] 3. `grep -rn "deleteImage(\|deleteFile(" /Users/tgiap.dev/devs/examio/examio-be/apps/ai-chat-service/src` → no output. Message image R2 keys are deleted only via `r2_delete_tasks` + worker (`svc:ai-chat`). <!-- Red Team: RT-8 -->
- [x] 4. `yarn build && yarn test && check:deps && check:ownership` green (2314 tests pass); ai-service pytest green; `ai-chat-service` healthy after `up -d --wait` from an empty volume.
- [x] 5. `POST /api/v1/ai-chat/:id/stream` through the gateway prints incremental `data:` frames (11 frames, ~400 ms apart, not one burst). Client abort cancels the gRPC call (F1 fixed). Upstream error → `event: error` frame. `regenerate-stream` works.
- [x] 6. (reworded, F3 accepted) STUDENT → 403 on `/ai-chat/*`. Another user's chatId → 404 on messages, stream and DELETE. On `GET :chatId/exists` another user's chat returns 200 `{exists:false}`, the same body as a missing chat, so existence does not leak. Anonymous `GET /subjects` → 200 with no `systemPrompt` or `email`.
- [x] 7. Clear chat with files: exactly one `DeleteDocuments` with the user token; `deletedFiles` = filenames; chat, messages and links gone; only R2 image keys enqueued (external URLs skipped); worker `DeleteObjects` once as `svc:ai-chat`; document `UNAVAILABLE` → 503 with the chat kept; `deleteChat` without `deleteFiles` → no `DeleteDocuments`, image key still enqueued. <!-- Red Team: RT-8 -->
- [x] 8. Limits and events: 6th free-tier message within a minute → 429 `RATE_LIMITED`. `finance.subscription.changed` carries the effective tier and fires on expiry (read path and sweeper, F2 fixed), activation and reactivation; ai-chat deletes `aichat:benefits:<id>`. `document.deleted` removes links idempotently.
- [x] 9. (reworded, F4 deferred) Vocabulary `GenerateWordFamily` over gRPC with `svc:vocabulary` → 201 with no wallet transaction; a call without a service token → `UNAUTHENTICATED`. `/k/ai-tool` loads for TEACHER; STUDENT is redirected to `/403`.
- [ ] FE AI chat page actions (send, stream, regenerate, attach doc, clear chat with files, AI teacher subject list): NOT verified. No route mounts the page at HEAD (F4, Medium, deferred). Mounting it is FE work outside this phase. Not part of criterion 9.

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Streams buffered somewhere (gateway/nginx/compression) | M | H | No compression on the route; `X-Accel-Buffering: no`; curl `-N` check in CI smoke |
| Client disconnect leaks LLM calls | M | M | unsubscribe → `call.cancel()`; Python `CancelledError` path tested |
| Phase 15 not finished → no document/AI gRPC | M | H | Hard dependency on 15 (flagged); do not start 13 before 15 merges |
| Removing ai-service HTTP breaks a forgotten caller | L | H | Grep gate above; ai-service access log shows 0 `/api/*` hits for 1 day before deletion |
| Clear chat deletes documents but the chat delete fails | L | M | `DeleteDocuments` is idempotent; retry skips gone ids; `document.deleted` removes stale links <!-- Red Team: RT-8 --> |
| `r2KeyFromUrl` maps an external URL to a key and deletes the wrong object | L | H | Resolver returns a key only for the `R2_PUBLIC_URL` host (phase 11); e2e covers an external URL <!-- Red Team: RT-8 --> |
| Expired/missing service token breaks every chat call | M | H | Provider refreshes at 80% TTL; contract test without token; alert on `UNAUTHENTICATED` from ai-service <!-- Red Team: RT-2 --> |

## Rollback
- Revert the PR. The YAML upstreams return to exam, and the ai-service HTTP routers + token return with the revert (both in the same PR). DB reset policy for the aichat schema. Pending `r2_delete_tasks` rows in the aichat schema are lost with the reset (orphans only, no data loss). <!-- Red Team: RT-8 -->

## Security Considerations
- Owner checks on every chatId/messageId (404, not 403). `systemPrompt` is never returned to clients [UNVERIFIED current response; strip if present].
- <!-- Red Team: RT-2 --> AiService RPCs require a service token from an allowlisted caller (`ai-chat`, `vocabulary`, `content`); network placement is not the trust boundary. The caller authorizes the documents via `AssertOwnership` before sending storage ids.
- `DeleteDocuments` runs with the user's token, so a chat can only delete documents its owner owns. <!-- Red Team: RT-8 -->
- Removing `INTERNAL_SERVICE_TOKEN` drops a shared secret. ai-service has no host-exposed port (phase 05 networks). <!-- Red Team: RT-2 -->

## Next Steps
- Sign-off: the user reviews and signs off (`humanSignedOff=false`; touches auth/permissions, finance events, config), then commit. Owner: user. Done when the commit lands on `refactor/microservice-rbac`.
- Phase 14 extracts content + assessment and deletes exam-service.

## Delivered beyond plan / deviations
Part A (2026-10-24):
- `finance.subscription.changed` now carries the EFFECTIVE tier (`effectiveTier(sub, now)`: inactive/expired → 0) and fires on lazy expiry (guarded `updateMany`, outbox in the same tx, published once under concurrent observers), on admin reactivation and on payment activation of an expired same-tier row; no event when the effective tier does not change. `finance_events.proto` comment-only. No consumer existed before ai-chat. `finance-admin.e2e-spec.ts` same-tier reactivation now expects 2 events (`0 → tier`).
- Open product question (deferred): admin reactivation does not reset a past `nextPaymentDate`, so such a row stays effective tier 0 (no event), consistent with `getUserSubscriptionBenefits`.
- vocabulary `ai.client.ts` → gRPC `AiService.GenerateWordFamily` (60 s, not retried, service token `svc:vocabulary`, aud `ai`); `{success, error}` mapping kept; HTTP/`AI_SERVICE_URL`/`INTERNAL_SERVICE_TOKEN` removed from vocabulary code, env and compose; `AI_GRPC_URL` added.
- Incident: an implementer's plain `grep -r` over `deploy/` matched the real gitignored `examio-be/deploy/.env` and printed a live `INTERNAL_SERVICE_TOKEN` value into the session transcript (not into git). The token is removed from the code in this phase; rotate it wherever it is still configured. Repo-wide greps now use `git grep`.
Coordinator decisions for part B: keep the phase-15 bounded OCR wait (no `409 DOCUMENT_PROCESSING`); stream cancel keeps the HEAD behaviour for partial text; `systemPrompt` never returned; exam keeps its `document.deleted` handler for `HistoryGenerated*` only.
Part B (2026-10-24):
- `ai-chat-service`: HTTP + `ROLE=api,worker` (r2 delete poller as `svc:ai-chat`; `aichat.events` consumer in the API process), schema `aichat`, seed (4 categories / 15 subjects) moved from exam; exam no longer seeds reference data.
- Stream cancel: HEAD only unsubscribed locally and never cancelled the upstream HTTP call (the full answer was still saved after the client left). Now an abort cancels the gRPC call and keeps the partial text; an abort before any chunk stores only the user message. A failure before the first frame is an HTTP error (RESOURCE_EXHAUSTED 429, auth errors 502, UNAVAILABLE 503, DEADLINE 504); after it an `event: error` frame.
- `systemPrompt` leak fixed: HEAD's `GET /subjects` returned every column incl. `systemPrompt`; explicit select + key-scan test.
- `DELETE :chatId?deleteFiles=true` added next to HEAD's `POST :chatId/clear` (same path).
- Status codes vs HEAD: foreign/missing document on attach/send 404 (was 403); 6th free message per minute 429 `RATE_LIMITED` (was 403); full chat stays 403 `CHAT_LIMIT_REACHED`. FE shows the body `message` for any status, so no FE change.
- Message image R2 keys are enqueued only when under the chat owner's `images/<ownerId>/` folder (`ownedR2KeyFromUrl`), stricter than plain `r2KeyFromUrl`: `imageUrl` is client-supplied (phase-11 owner scoping).
- Input bounds added (message ≤ 8000, ids ≤ 128, imageUrl ≤ 2048, title ≤ 255).
- ai-service serves only `/` and `/health`; `INTERNAL_SERVICE_TOKEN`, `AI_SERVICE_URL`, `AI_HTTP_COMPAT` removed from all code/env/compose; gateway header hygiene and logger redaction no longer mention `x-internal-service-token`.
- `@nestjs/axios` left in package.json (unused) to avoid lockfile churn.

## Fixed while tempering

- F2: an expired active tier never flipped or published `finance.subscription.changed` because the guarded flip lived only in the caller-less `hasActiveSubscription`; now `SubscriptionExpiryService.expireIfLapsed` (conditional `updateMany` on `isActive AND nextPaymentDate < now` + outbox tier -> 0 in one tx) is shared by `getUserSubscriptionBenefits`, `getSubscription` (GET /payment/subscription) and a worker-role `SubscriptionExpirySweeper` (`SUBSCRIPTION_EXPIRY_SWEEP_MS`, default 60000, batches of 200); `hasActiveSubscription` deleted; covered in `apps/finance-service/test/subscription-changed.e2e-spec.ts`.
- F1: the gateway did not pass a client disconnect upstream on streamed routes, so closing the AI chat SSE left the LLM gRPC call running and the full answer was saved; `proxy-factory.ts` now destroys the upstream request on `res` close when the response has not finished (`abortOnClientClose` on `proxyReq`), so ai-chat sees its socket close and cancels the call. Covered in `proxy-factory.spec.ts` (fails without the fix) and `test/gateway-streaming.e2e-spec.ts`.
- F7: the CI `be-e2e` job lacked `QUIZ_JWT_SECRET` / `QUIZ_AES_KEY` (exam boot env) and did not run `subscription-changed.e2e-spec.ts`; both added to `.github/workflows/ci.yml`.

## Tempering dispositions (not fixed)

- F3 (Low, accepted): a foreign `GET /ai-chat/:chatId/exists` returns 200 `{exists:false}`, same body as a missing chat, so existence does not leak; the "other user's chatId -> 404" criterion applies to the read/write routes, not to `exists`.
- F4 (Medium, pre-existing, deferred): no FE route mounts the AI chat page or `SubjectSelector` at HEAD (`aiChatApi` is only used by the unmounted `ChatHistoryCard`), so the FE AI chat criterion cannot be exercised; mounting it is FE work outside this phase.
- F6 (Low, noted): eight e2e configs set `forceExit: true`, which hides leaked handles.
- Review (opus, 9/9 criteria, 0 Critical/High): fixed three Lows: gateway `onProxyError` stays quiet when the client already left (no ECONNRESET warn per abort), `ChatAccessService.ownedMessage` rethrows non-404 errors instead of masking a DB failure as 404, `SUBSCRIPTION_EXPIRY_SWEEP_MS` documented in `deploy/env/finance.env.example`. Rejected: keeping `x-internal-service-token` in the gateway strip list (criterion 2 requires the name gone; nothing reads it). Deferred to phase 16: regenerate-before-admission (Medium) and four Lows (non-stream Query systemPrompt/modelType parity, OCR wait after SSE abort, stale in-flight benefits write-back, destructive drop migration).
