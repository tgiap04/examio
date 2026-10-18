# Phase 15 — Document Service & AI-Service DB

## Context Links
- [plan.md](./plan.md) · [planner-brief.md](./reports/planner-brief.md) decisions 1, 9, 13 · [red-team-changes.md](./reports/red-team-changes.md) RT-1, RT-2, RT-8, RT-10, RT-11, RT-15 (authoritative over this file's earlier text) <!-- Red Team: RT-1, RT-2, RT-8, RT-10, RT-11, RT-15 -->
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §4.4 (document row), §4.5 ai-service, §6.2 (`ai/v1`, `document/v1`, `r2/v1`), §6.3 events, §9.3 flow, §12 P6, **§13 checklist**
- [researcher-02 §2 Python gRPC, §3 aio-pika outbox/consumer](./research/researcher-02-migration-mechanics-report.md)
- Prior: [phase-03](./phase-03-messaging-foundation.md) (envelope, one retry tier + DLQ), [phase-04](./phase-04-identity-and-rbac-core.md) (service tokens), [phase-10](./phase-10-cut-cross-db-access.md) (`Debit`/`Refund`, shared finance client), [phase-11](./phase-11-database-per-service.md) (`r2_delete_tasks`)

## Overview
- Priority: P1 · Status: Pending · Effort: 5d (+1d: RT-1 charge states + reapers, Python service-token verifier, Python envelope/retry/DLQ moved from P03, `DeleteDocuments`, r2 gRPC upload; minus the dropped user purgers) <!-- Red Team: RT-1, RT-2, RT-8, RT-10, RT-11 --> · Depends on: 03, 10 (finance `Debit`/`Refund` + idempotency keys, shared finance client), 11 <!-- Red Team: RT-1 -->
- Goal: (a) new `document-service` owns uploaded-file metadata, monthly quota and processing status. (b) ai-service owns DB schema `ai` (pgvector, Alembic), stops writing other services' tables and drops runtime DDL. (c) gRPC `AiService` for synchronous AI, guarded by service tokens. (d) Long-running work (OCR, generation) moves to events; generation stays async (the red-team proposal to make it a synchronous gRPC call was rejected: it runs for minutes). (e) exam `modules/ai` generation is rewired to document gRPC + events with an idempotent, crash-safe charge. (f) r2's HTTP `internal/upload` and its `INTERNAL_SERVICE_TOKEN` are deleted. <!-- Red Team: RT-1, RT-2, RT-15 -->
- Parallelism [CROSS-PHASE]: runs in parallel with **12 only**. 13 must wait for this phase (it needs `AiService` + document-service). 14 follows 13. The lead must update plan.md: 13 depends on 15, and 15 no longer runs alongside 13–14.

## Key Insights
- Upload routes in exam `modules/ai/ai.controller.ts`: `quick-upload :44`, `recent-uploads :125`, `upload/:id` GET `:153` / DELETE `:166`, `upload :179`, `upload-image :191` (placeholder, returns no URL, `:196-205`). Plus `modules/r2/r2.controller.ts:26` `POST /r2/image`. Generation routes: `generate-from-file :86`, `regenerate/:id :207`, `job/:id` GET/DELETE `:221,:242`, `upload/:id/history :263`, `models :144`.
- jobId == `UserStorage.id` today. Status is derived from `UserStorage.processingStatus` + the latest history (`ai.service.ts:1219-1240`). Content needs its own `GenerationJob`.
- <!-- Red Team: RT-1 --> Charge points today (all via `UpdateBalance(SUBTRACT)` with no key; P10 switched them to `Debit`):
  - `generateFromFile` new file: ONE debit of upload + generation credits (`ceil(sizeMB/2) + 5`, `ai.service.ts:467-495`), after the R2 upload and before the `UserStorage` insert; a failed debit aborts.
  - `generateFromFile` reuse branch (`:366-382`): duplicate by `(userId, filename, size)` (`findDuplicateUserStorage`, `:346-350`). COMPLETED → charge generation only (5); FAILED/PENDING → free retry; PROCESSING → return the running job. A failed debit here is only logged (`:382-386`).
  - `createUpload` (`POST /ai/upload`, `:1019`): upload credits, `creditCharged=true`. `quickUpload` (`:226-318`): no charge (`creditCharged: false`).
  - `regenerate` (`:1141`): `ceil(count/10)`.
  - Refunds: none. `cancelJob` (`:953-1000`) deletes embeddings and resets the file to PENDING without refunding; `deleteUpload` (`:901-948`) does not refund; `financeClient.addCredits` has no caller. Every refund below is **new behaviour**.
- Quota `enforceFileUploadQuota :190-200` via finance `GetUserBenefits`. The file goes over gRPC bytes today (`r2.proto` `UploadFile`; gateway limit 50 MB `ai-study-proxy.controller.ts:57,126`).
- ai-service SQL touches `"Document"`, `"DocumentEntity"`, `"UserStorageGraph(Group)"` (its own; `BenchmarkItem` was deleted in phase 01 <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->) plus `"UserStorage"` (UPDATE/SELECT) and `"HistoryGenerated{Quizz,Flashcard}"` (INSERT/SELECT), which are foreign. Runtime DDL: `graph_storage_service.py:220-257`. 7 asyncpg pools (scout). The current consumer is `src/backend/rabbitmq_consumer.py` (old lib).
- exam → ai-service HTTP: `/ai/process-file` (`ai.service.ts:658`, `ai-chat.service.ts:648`), `/generate/{quiz,flashcards}` (`ai.service.ts:693-694`), `/ai/clear-cache` (`:208`), `/ai/models` (`:845`), `/chat/{query,stream}` (ai-chat), `/generate/word-family` (vocabulary). All send `x-internal-service-token` (`ai.service.ts:55-56`, `ai-chat.service.ts:54-55`); ai-service checks it at `src/backend/main.py:121-122`. <!-- Red Team: RT-2 -->
- <!-- Red Team: RT-15 --> r2 `POST internal/upload` (`apps/r2-service/src/r2-service.controller.ts:47-90`, `assertInternalToken` `:73-88`) is the only r2 consumer of `INTERNAL_SERVICE_TOKEN`. No in-repo caller was found by grep (callers use the `UploadFile` gRPC); the replacement is `r2.v1.UploadFile` with a service token.
- <!-- Red Team: RT-8 --> R2 deletion: phase 11 turned `deleteUpload`'s R2 call (`ai.service.ts:908`) and `clearChat`'s (`ai-chat.service.ts:769`) into `r2_delete_tasks` enqueues in the exam schema. `clearChat(deleteFiles)` (`ai-chat.service.ts:740-793`) also deletes `UserStorage` rows directly (`:774`), which breaks once `UserStorage` leaves exam → it needs a document RPC.
- `src/score/`, the dev agent, `benchmark_index_service.py` and the `BenchmarkItem` model are deleted in phase 01 (validation Q7: delete both, no reload). This phase has nothing to migrate or delete for them. <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->
- UserStorage leaves the exam schema here, while ai-chat (until 13) and examattempt history-stats (until 14) still read it in exam. Hence the carve-outs below.
- `python-jose[cryptography]` is already an ai-service dependency (`pyproject.toml:32`), so the Python token verifier adds no new package. <!-- Red Team: RT-2 -->
- <!-- Red Team: RT-11 --> User deletion is deferred (phase 11): no `auth.user.deleted` consumers in document-service or ai-service.

## Requirements
Functional — document-service
- HTTP (paths unchanged, `document:upload`, owner checks → 404): `POST /ai/upload`, `POST /ai/quick-upload`, `GET /ai/recent-uploads`, `GET|DELETE /ai/upload/:uploadId`, `POST /ai/upload-image`, `POST /r2/image`. Multer disk storage, 50 MB limit.
- gRPC `examio.document.v1.DocumentService` (user-scoped; forwarded user token, actor = token `sub`): <!-- Red Team: RT-1, RT-2, RT-8 -->
```proto
rpc CreateUpload(CreateUploadRequest) returns (CreateUploadResponse);
  // {filename, mimetype, bytes data, charge_credits, reuse_duplicate} → {document, reused}
  // reuse_duplicate: return the caller's existing (filename,size) upload instead of storing again (generateFromFile reuse branch)
  // charge_credits=false when the caller charges itself (generation path: one combined debit)
rpc GetDocumentsByIds(GetDocumentsByIdsRequest) returns (GetDocumentsByIdsResponse); // caller-owned only
rpc AssertOwnership(AssertOwnershipRequest) returns (google.protobuf.Empty);        // NOT_FOUND if any id not owned
rpc GetQuota(GetQuotaRequest) returns (Quota);           // {used_this_month, monthly_limit, file_count}
rpc EnsureProcessed(EnsureProcessedRequest) returns (DocumentInfo); // re-emit document.uploaded if FAILED/never processed
rpc DeleteDocuments(DeleteDocumentsRequest) returns (DeleteDocumentsResponse);
  // {ids[]} → {deleted: [{id, filename}], not_found_ids[]}; owner-scoped; idempotent (gone/not-owned ids → not_found_ids)
```
  `DeleteDocuments` guard: `@RequirePermissionsOrService('document:upload')` with an empty service-caller allowlist until a service caller exists (user deletion is deferred).
- Data `schema=document`: `UserStorage` (status incl. `PENDING_CHARGE`, `creditCharged`, `keyR2`), `UserMonthlyFileUpload`, outbox, processed, `r2_delete_tasks`. <!-- Red Team: RT-1, RT-8 -->
- Events <!-- Red Team: RT-8, RT-11 -->: publish `document.uploaded {storageId, userId, filename, mimetype, downloadUrl (presigned GET, 1h)}` and `document.deleted {storageIds[], userId}`. Consume `ai.document.processed {storageId, pageCount}` → COMPLETED; `ai.document.failed {storageId, reason}` → FAILED + `Refund(doc:<storageId>)` when `creditCharged` (new behaviour). No `auth.user.deleted` consumer.
- <!-- Red Team: RT-8 --> Delete (HTTP `DELETE /ai/upload/:id` and `DeleteDocuments` share one service method): one tx = `DELETE UserStorage` rows + `r2_delete_tasks.enqueue(keyR2[])` + outbox `document.deleted`. The document worker drains the tasks (`DeleteObjects`, service token `svc:document`). Consumers of `document.deleted`: ai-service (vectors/entities/graph), exam ai-chat (links; ai-chat-service from 13), exam/content generation (null `HistoryGenerated*.userStorageId`). These replace today's `deleteUploadAggregate` cross-table delete.
- <!-- Red Team: RT-1 --> Credits for `POST /ai/upload` (`charge_credits=true`), same 3-step shape as generation: (1) R2 upload (r2 gRPC), then tx insert `UserStorage {status=PENDING_CHARGE}`, commit; (2) `Debit(doc:<storageId>)` (amount unchanged, `ceil(sizeMB/2)`); (3) tx `status=PENDING, creditCharged=true` (conditional on `PENDING_CHARGE`) + outbox `document.uploaded`. Insufficient balance → row `FAILED` + R2 key enqueued for deletion, same HTTP status as today. Reaper (document worker, every 60s): rows in `PENDING_CHARGE` > 10 min → `Refund(doc:<storageId>)` (`NOT_FOUND` = never charged, fine) → `FAILED` + R2 key enqueued. `quick-upload` stays uncharged. Quota check is unchanged and runs before (1).
- r2 (RT-15): every document → r2 call is gRPC with a service token `svc:document`: `UploadFile`, `CreatePresignedDownload`, `DeleteObjects`. Add `'document'` to those r2 `@ServiceOnly(...)` decorators (code, not env). <!-- Red Team: RT-2, RT-15 --> <!-- Reconcile: X6 -->

Functional — ai-service
- DB `schema=ai` (role `ai_svc`, `DB_SEARCH_PATH=ai,extensions`), Alembic baseline (`version_table_schema='ai'`): `Document` (`embeddings extensions.vector`), `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`, `outbox_events`, `processed_events`. Keep the `userStorageId` column, no FK. One shared asyncpg pool (`max_size=5`) instead of 7, plus a separate pool (`max_size=2`) for the outbox relay. <!-- Red Team: RT-10 -->
- Remove the runtime DDL and the `AI_RUNTIME_DDL` flag. Remove every SQL touching `UserStorage`/`HistoryGenerated*`.
- gRPC `examio.ai.v1.AiService` on :50051 (`grpc.aio.server(maximum_concurrent_rpcs=64)`, SIGTERM `stop(grace=20)`): `StreamChat` (server-stream), `Query`, `GenerateWordFamily`, `ListModels`. Callers have already authorized storage ids.
- <!-- Red Team: RT-2 --> Service-token interceptor (`src/backend/auth/service_token.py`, `python-jose`): verifies the `authorization` metadata against `AUTH_JWKS_URL` (JWKS cached, refetch on unknown `kid`), `algorithms=['RS256']`, `iss`, `aud=ai`, `exp`, `roles ∋ SERVICE`, `sub ∈ ALLOWED_CALLERS` (a code constant in `service_token.py`, not env: `svc:exam, svc:ai-chat, svc:vocabulary, svc:content`; `exam` removed in 14) <!-- Reconcile: X6 -->. Missing/invalid → `UNAUTHENTICATED`; wrong caller → `PERMISSION_DENIED`. The FastAPI app keeps only `/health` (+ compat routes below; `/metrics` arrives with phase 17 <!-- Reconcile: X9 -->), which still check `INTERNAL_SERVICE_TOKEN` until 13.
- <!-- Red Team: RT-10 --> Messaging (Python, moved here from P03): `src/backend/messaging/`:
  - `envelope.py`: `build(type, data, source, correlation_id)` / `parse(body) -> Envelope` — the P03 envelope `{id: "evt_<ulid>", type, version: 1, occurredAt, source, correlationId, data}`, version ≠ 1 → permanent error. No `traceparent` (deferred).
  - `consumer.py`: aio-pika `connect_robust`, queue `ai.events` with ONE retry tier `ai.retry.30s` (TTL 30 s, DLX back to `ai.events`) and `ai.dlq`; `x-retry-count` ≥ 5 or permanent → `nack(requeue=false)` → DLQ. Queue args byte-identical to `libs/messaging` (shared topology contract test). Idempotency via `processed_events (consumer, event_id)` in the same tx as the effect. The consumer rejects (permanent) an envelope whose `source` does not match the routing-key domain (`document.*` must come from `document`, `content.*` from `content`/`exam` until 14).
  - `outbox_relay.py`: same algorithm as `libs/messaging` — claim rows in a short tx (`FOR UPDATE SKIP LOCKED LIMIT 100`, set `locked_until = now()+30s`, commit), publish OUTSIDE the tx with publisher confirms, then mark `published_at`; failures → `attempts+1`, backoff. Daily purge: outbox published > 7 d, `processed_events` > 14 d.
- <!-- Red Team: RT-2 --> RabbitMQ users (P03 pattern, edited in `deploy/rabbitmq/definitions.template.json`, rendered at deploy <!-- Reconcile: X6 -->): `ai` — write on `examio.events` with routing keys `^ai\.` only, read on `ai.events` (+ its retry queue); `document` — write `^document\.`, read `document.events` (+ retry). Python and Nest services get their own credentials via env (`RABBITMQ_URL` per service).
- Events: consume `document.uploaded` (download via `downloadUrl`, OCR/chunk/embed/graph; prefetch 1, CPU in an executor) → `ai.document.processed|failed`. `document.deleted` → delete vectors/entities/graph. `content.generation.requested {jobId, userId, storageId, type, options, model}` → process the doc inline if no chunks → `ai.generation.completed {jobId, type, items}` (inline ≤ 512 KB) | `ai.generation.failed {jobId, reason}`. Outbox relay as above.
- Roles: `api` (gRPC + FastAPI `/health`) <!-- Reconcile: X9 -->, `worker` (aio-pika + relay + purge), `migrate` (`alembic upgrade head`).
- HTTP compat: keep only `/chat/query`, `/chat/stream`, `/generate/word-family` behind `AI_HTTP_COMPAT=true` (callers removed in 13). Delete all other routers now.
- Extend the phase-02 `scripts/gen_grpc.sh` (`grpc_tools.protoc`) to also emit `examio/{ai,document}/v1` + `events/v1`. Remove any leftover `src/backend/grpc_generated/` if phase 02 has not already done so.

Functional — exam `modules/ai` (generation stays in exam until 14) <!-- Red Team: RT-1 -->
- `GenerationJob {id, storageId, userId, type, status, chargeKey, chargedAmount, error?, historyId?, createdAt}`; `status ∈ PENDING_CHARGE | QUEUED | PROCESSING | COMPLETED | FAILED | CANCELLED`; `chargeKey = gen:<jobId>`.
- `generate-from-file`: multer (50 MB) → lock `content:gen:lock:<userId>:<type>` → `DocumentService.CreateUpload(charge_credits=false, reuse_duplicate=true)` → charge amount:
  - new file → upload + generation credits (`ceil(sizeMB/2) + 5`) in ONE `Debit`;
  - reused COMPLETED → generation only (5);
  - reused FAILED/PENDING → 0 (free retry, as today; `EnsureProcessed`);
  - reused PROCESSING → return the running job (as today).
  Then the three steps: (1) tx insert `GenerationJob {status=PENDING_CHARGE}`, commit; (2) if amount > 0: `Debit(user, amount, reason, idempotency_key=gen:<jobId>)` through the shared finance client (forwarded user token; `AI_FREE_MODE` handled inside the wrapper, P10); (3) tx `UPDATE … SET status=QUEUED WHERE id=$1 AND status=PENDING_CHARGE` + outbox `content.generation.requested` → `{ jobId }`. Insufficient balance at (2) → job `FAILED`, no outbox row, same HTTP status as today (the reuse branch no longer swallows a failed debit). (3) updating 0 rows (cancelled meanwhile) → `Refund(gen:<jobId>)` → `409 JOB_CANCELLED`.
- `regenerate/:uploadId`: `AssertOwnership` → new job, same three steps, amount `ceil(count/10)`.
- `GET job/:jobId`: the GenerationJob (fallback: latest job by `storageId`, keeps old clients working). `upload/:id/history`: `AssertOwnership` + local `HistoryGenerated*`. `models` → `ListModels` (service token `svc:exam`, cache 10m).
- `DELETE job/:jobId` (cancel, new refund behaviour): owner check; conditional `UPDATE … SET status=CANCELLED WHERE status IN (PENDING_CHARGE, QUEUED, PROCESSING)`; if 1 row → `Refund(gen:<jobId>)` (`NOT_FOUND` = never charged). Already CANCELLED → 200 (idempotent). COMPLETED or FAILED → `409 JOB_NOT_CANCELLABLE`. Cancel no longer deletes embeddings or resets the document (the processed file stays reusable).
- Reaper (exam worker, every 60s): jobs in `PENDING_CHARGE` older than 10 min → conditional update to `CANCELLED` → `Refund(gen:<jobId>)`.
- Consumer `ai.generation.completed` → conditional update `WHERE status IN (QUEUED, PROCESSING)` → write `HistoryGenerated*` + COMPLETED (a CANCELLED job ignores it). `failed` → conditional → FAILED + `Refund(gen:<jobId>)`. Lock released on any terminal state.
- Service tokens: `Refund` (cancel, reaper, consumer) uses `svc:exam` (finance `Refund` is service-only, P10). <!-- Red Team: RT-2 -->

Carve-outs [CROSS-PHASE, collision-free because 13/14 run after 15 and 12 does not touch these]:
- `apps/exam-service/src/modules/ai-chat/{ai-chat.service.ts,ai-chat.repository.ts}`: `userStorage` reads → `GetDocumentsByIds`/`AssertOwnership`; `/ai/process-file` → `EnsureProcessed`; `clearChat(deleteFiles)` (`ai-chat.service.ts:740-793`) → one `DeleteDocuments(ids)` call with the user token (filenames from the response; failure → 503, chat kept). <!-- Red Team: RT-8 -->
- `apps/exam-service/src/modules/examattempt/examattempt.service.ts:1571` → `GetQuota().fileCount`.
- `apps/exam-service/prisma/schema/{ai-chat,content}.prisma`: drop the relations to UserStorage (`AIChatDocument`, `HistoryGenerated*`).

## Architecture
```
Teacher ─/api/v1/ai/upload─► gateway ─► document ─gRPC GetUserBenefits/Debit (user token)─► finance
                                          ├─gRPC UploadFile/CreatePresignedDownload (svc token)─► r2
                                          └─outbox document.uploaded ─► ai.events ─► ai worker ─► schema ai (pgvector)
ai worker ─► ai.document.processed|failed ─► document.events ─► UserStorage.status (+Refund(doc:) on fail if charged)
Teacher ─/api/v1/ai/generate-from-file─► exam(modules/ai) ─CreateUpload(charge=false, reuse)─► document
          ├─ tx GenerationJob PENDING_CHARGE ─► Debit(gen:<jobId>, upload+gen) ─► tx QUEUED + outbox content.generation.requested
          └─► ai ─► ai.generation.* ─► exam(→content in 14)   (reaper: PENDING_CHARGE >10 min → CANCELLED + Refund)
ai-chat/vocabulary/content/exam ─gRPC AiService (svc token, allowlist)─► ai-service:50051
delete: document tx { DELETE UserStorage; r2_delete_tasks; outbox document.deleted } ─► worker ─DeleteObjects─► r2
                                                    document.deleted ─► ai (vectors) · ai-chat (links) · exam/content (history)
```
<!-- Red Team: RT-1, RT-2, RT-8, RT-15 -->
Gateway `config/routes.yaml` (phase-05 schema; this phase owns only these 3 entries; the `ai` prefix entry stays on exam for generation):
```yaml
- { id: ai-upload-history, upstream: '${EXAM_SERVICE_URL}', match: { path: '^/api/v1/ai/upload/[^/]+/history$' }, auth: required, permissions: [ai:generate] }  # → content in 14
- { id: ai-upload, upstream: '${DOCUMENT_SERVICE_URL}', match: { path: '^/api/v1/ai/(upload(/[^/]+)?|quick-upload|recent-uploads|upload-image)$' }, auth: required, permissions: [document:upload], maxBodySize: 50mb }
- { id: r2-image,  upstream: '${DOCUMENT_SERVICE_URL}', match: { prefix: /api/v1/r2/image }, auth: required, permissions: [document:upload] }   # existing id, upstream changes
```
Two regex entries both match `/ai/upload/:id/history`; the more specific `ai-upload-history` must be listed first, or `upload(/[^/]+)?` must stay anchored with `$` (as above) so `…/history` cannot match it. The P05 per-route `rateLimit` values for these paths move with the entries unchanged (RT-4).

## Related Code Files
File ownership (globs):
- Create: `/Users/tgiap.dev/devs/examio/examio-be/apps/document-service/**`, `.../proto/examio/{document,ai}/v1/**`, `.../proto/examio/events/v1/{document,ai}_events.proto`, `.../deploy/compose/document.yml`, `.../deploy/env/{document,ai}.env.example`, `.../apps/exam-service/prisma/schema/generation.prisma`
- Create (moved from P03) <!-- Red Team: RT-10 -->: `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src/backend/messaging/{__init__.py,envelope.py,consumer.py,outbox_relay.py,purge.py}` + `src/backend/tests/messaging/**`
- Create <!-- Red Team: RT-2 -->: `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src/backend/auth/{__init__.py,service_token.py}`
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/**` (alembic/, src/, Dockerfile, pyproject.toml), `.../deploy/compose/ai.yml`
- Modify: `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/{ai,r2}/**`, `.../apps/exam-service/prisma/schema/{document,ai}.prisma` (delete) + exam migration, `.../proto/examio/r2/v1/**` (additive `CreatePresignedDownload`; `DeleteObjects` exists since P02)
- Modify <!-- Red Team: RT-15 -->: `/Users/tgiap.dev/devs/examio/examio-be/apps/r2-service/src/r2-service.controller.ts` (delete `internal/upload` + `assertInternalToken`, `:47-90`), r2 env (drop `INTERNAL_SERVICE_TOKEN`); `@ServiceOnly` decorators in the r2 controller + `document` <!-- Reconcile: X6 -->
- Modify <!-- Red Team: RT-1, RT-2 -->: `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/wallet/wallet.grpc.controller.ts` (verify P10's `Debit`/`Refund` decorator caller lists contain `document`), `/Users/tgiap.dev/devs/examio/examio-be/deploy/rabbitmq/definitions.template.json` (users `ai`, `document`) <!-- Reconcile: X6 -->
- Carve-outs: the 3 items listed above
- Modify (line-level YAML entries above): `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/config/routes.yaml`
- Modify (append-only, serialize with 12): `/Users/tgiap.dev/devs/examio/examio-be/{nest-cli.json,package.json,jest.config.js,deploy/docker-compose.yml,scripts/check-model-ownership.ts}`, `.../deploy/postgres/init/01-service-schemas.sh` (remove the temporary `ai_svc` exam grant lines)
- Delete: `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/r2/r2.controller.ts`, `.../apps/ai-service/src/backend/api/{file,generation}.py`, `.../apps/ai-service/src/backend/rabbitmq_consumer.py` (replaced by `messaging/consumer.py`) <!-- Red Team: RT-10 -->

## Implementation Steps
1. Protos `document/v1` (incl. `DeleteDocuments`, `CreateUpload.reuse_duplicate`), `ai/v1`, the r2 additions, the events → `buf lint/breaking/generate`. Extend the phase-02 Python gen script `apps/ai-service/scripts/gen_grpc.sh`. <!-- Red Team: RT-1, RT-8 -->
2. Scaffold document-service (ARCH §13 steps 2–10: ROLE main, env zod, libs, Prisma `schema=document` baseline incl. `r2_delete_tasks`, queue `document.events`, RabbitMQ user `document`, Redis `doc:`, compose with `document-migrate|document|document-worker`, gateway entries, clients finance (user token for `Debit`, svc token for `Refund`) / r2 (svc token), CI, metrics). No `auth.user.deleted` handler. <!-- Red Team: RT-2, RT-8, RT-11 -->
3. Move the upload code from `modules/ai/{ai.service,ai.repository,ai.controller}.ts` + `modules/r2/r2.controller.ts` into `document-service/src/modules/upload/`. Implement `DocumentService` gRPC over the same service layer: the 3-step upload charge + reaper, `reuse_duplicate`, `DeleteDocuments` (tx + `r2_delete_tasks` + outbox), the r2 `r2_delete_tasks` worker. <!-- Red Team: RT-1, RT-8 -->
4. r2 <!-- Red Team: RT-15 -->: confirm no caller of `internal/upload` (grep + 1 day of r2 access logs with 0 hits), then delete the route, `assertInternalToken` and `INTERNAL_SERVICE_TOKEN` from r2 code/env. Add `'document'` to the r2 `UploadFile`/`CreatePresignedDownload`/`DeleteObjects` `@ServiceOnly(...)` decorators. <!-- Reconcile: X6 -->
5. ai-service: Alembic baseline (`alembic revision -m init`, hand-written DDL matching today's tables, vector via `extensions`). One pool module `src/db.py` with `server_settings.search_path` (+ the relay pool). Remove the DDL blocks + foreign-table SQL.
6. ai-service gRPC server `src/grpc_server.py` (`AiServicer`) with the service-token interceptor, wrapping the existing chat/query/word-family/models functions. Entry `ROLE` switch in `src/main.py`. <!-- Red Team: RT-2 -->
7. ai-service messaging <!-- Red Team: RT-10 -->: `messaging/{envelope,consumer,outbox_relay,purge}.py` (one retry tier 30 s + DLQ, max 5, source validation, idempotent via `processed_events`); RabbitMQ user `ai`. Delete `rabbitmq_consumer.py`.
8. exam `modules/ai` <!-- Red Team: RT-1 -->: `GenerationJob` with the states above, the 3-step charge, cancel guard, reaper (exam worker), conditional consumers. Delete the HTTP client + `INTERNAL_SERVICE_TOKEN` usage from this module (`ai.service.ts:55-56`).
9. Apply the carve-outs (ai-chat incl. `clearChat` → `DeleteDocuments`, examattempt, schema relations). Drop migration in exam for UserStorage/Document tables (DB reset); move pending exam-schema `r2_delete_tasks` handling for document keys to document-service. <!-- Red Team: RT-8 -->
10. Remove the temporary grants: exam migration SQL `REVOKE ALL ON ALL TABLES IN SCHEMA exam FROM ai_svc; ALTER DEFAULT PRIVILEGES FOR ROLE exam_svc IN SCHEMA exam REVOKE ALL ON TABLES FROM ai_svc; REVOKE USAGE ON SCHEMA exam FROM ai_svc;` + delete the init lines.
11. Delete the ai-service routers except compat. <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->

## Tests
Write first:
- <!-- Red Team: RT-1 --> document e2e (money): `POST /ai/upload` → exactly one `Debit(doc:<id>)` even when the gRPC call is retried (fake finance returns `already_applied` on the 2nd); fault after (2) → reaper → one `Refund(doc:<id>)`, row FAILED, R2 key enqueued; `ai.document.failed` for a charged doc → one `Refund` (replayed event → still one); `quick-upload` → no `Debit`; quota exceeded → 429/403 per the current code; owner-only GET/DELETE → 404 for others.
- <!-- Red Team: RT-8 --> `DeleteDocuments`: owned ids → rows gone, `r2_delete_tasks` rows + one `document.deleted` outbox row in the same tx (rollback → none); mixed owned/foreign ids → foreign ids in `not_found_ids`, untouched; second call → all in `not_found_ids`, no new outbox row; worker → `DeleteObjects` with a `svc:document` token. HTTP `DELETE /ai/upload/:id` → same effects.
- `DocumentService` contract: `AssertOwnership` mixed ids → `NOT_FOUND`; `GetDocumentsByIds` for N ids → 1 query; `CreateUpload(reuse_duplicate)` for an existing `(filename,size)` → `reused=true`, no R2 upload. <!-- Red Team: RT-1 -->
- <!-- Red Team: RT-1 --> Generation e2e (money, fake ai worker publishing events): new file → one `Debit(gen:<jobId>)` for upload + generation, `CreateUpload` called with `charge_credits=false`; reused COMPLETED → one `Debit` of 5; reused FAILED → no `Debit`; insufficient balance → FAILED, no outbox row, today's HTTP status; crash between (2) and (3) → reaper → CANCELLED + one `Refund`; completed → history rows + COMPLETED; failed → one `Refund`; cancel QUEUED → CANCELLED + one `Refund`; cancel COMPLETED → 409; cancel twice → 200, one `Refund`; cancel then completed → no history, refunded once; cancel during `PENDING_CHARGE` → step (3) updates 0 rows → `Refund` + 409; `AI_FREE_MODE=true` → no finance call.
- <!-- Red Team: RT-2 --> ai-service pytest `test_service_token.py`: valid `svc:ai-chat` token → OK; user token (no SERVICE role) → `PERMISSION_DENIED`; `aud=finance` → `UNAUTHENTICATED`; HS256 / `none` → `UNAUTHENTICATED`; unknown caller `svc:admin` → `PERMISSION_DENIED`; unknown `kid` → one JWKS refetch.
- <!-- Red Team: RT-10 --> ai-service pytest messaging: `test_envelope.py` (shape, ulid prefix, version 2 → permanent); `test_consumer_idempotent.py` (same event id twice → one effect); `test_retry_dlq.py` (transient error → `ai.retry.30s`, 5th failure → `ai.dlq`); `test_source_mismatch.py` (`document.uploaded` with `source=content` → DLQ, no effect); `test_relay.py` (publish happens after the claim tx commits; a crash after claim → row re-claimed after `locked_until`); `test_purge.py`. Topology contract: declaring `ai.events` from Python and from `libs/messaging` → no `PRECONDITION_FAILED`.
- ai-service pytest: `test_grpc_stream.py` (server-stream yields; cancel → `CancelledError` handled), `test_no_foreign_tables.py` (grep SQL strings for `UserStorage|HistoryGenerated` → none), `alembic upgrade head` on an empty schema.
- RabbitMQ permissions (compose CI): user `ai` publishing `document.uploaded` → channel error (`ACCESS_REFUSED`); user `document` reading `ai.events` → `ACCESS_REFUSED`. <!-- Red Team: RT-2 -->
- Python ↔ Nest gRPC contract job in CI (compose: ai-service + a tiny Nest client test, with a real service token from auth).
- ai-chat carve-out regression: attach doc + list docs + clear chat with files still pass (exam tests). <!-- Red Team: RT-8 -->

## Todo List
- [ ] Protos (document incl. `DeleteDocuments`/`reuse_duplicate`, ai, r2 additions, events) + Python codegen <!-- Red Team: RT-1, RT-8 -->
- [ ] document-service scaffold + moved upload code + gRPC + 3-step upload charge + reaper <!-- Red Team: RT-1 -->
- [ ] `DeleteDocuments` + `document.deleted` + `r2_delete_tasks` worker <!-- Red Team: RT-8 -->
- [ ] r2: delete `internal/upload` + `INTERNAL_SERVICE_TOKEN`; document on `r2.v1` gRPC with service token <!-- Red Team: RT-15 -->
- [ ] ai-service Alembic `ai` schema, single pool, no runtime DDL, no foreign SQL
- [ ] ai-service gRPC AiService + service-token interceptor + roles api/worker/migrate <!-- Red Team: RT-2 -->
- [ ] ai-service messaging (envelope, consumer 1 tier + DLQ, relay, purge) <!-- Red Team: RT-10 -->
- [ ] RabbitMQ users `ai`, `document` + permission tests <!-- Red Team: RT-2 -->
- [ ] exam modules/ai → GenerationJob (PENDING_CHARGE → Debit → QUEUED), cancel guard, reaper, events + document gRPC <!-- Red Team: RT-1 -->
- [ ] Carve-outs (ai-chat incl. clearChat, examattempt, schema relations) <!-- Red Team: RT-8 -->
- [ ] Revoke temporary ai_svc grants
- [ ] Delete old routers, old consumer, old stubs <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->
- [ ] Gateway YAML entries + route snapshot

## Success Criteria
- `grep -rnE '"(UserStorage|HistoryGenerated[A-Za-z]*)"|CREATE TABLE|CREATE INDEX' /Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src` → no output.
- <!-- Red Team: RT-15 --> `grep -rn "INTERNAL_SERVICE_TOKEN\|x-internal-service-token\|internal/upload" /Users/tgiap.dev/devs/examio/examio-be/apps/r2-service /Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/ai /Users/tgiap.dev/devs/examio/examio-be/apps/document-service --exclude-dir=node_modules` → no output. (Remaining users — ai-service compat, exam ai-chat, vocabulary — are removed in 13.)
- `grep -rn "UpdateBalance\|deductCredits" /Users/tgiap.dev/devs/examio/examio-be/apps/document-service /Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/ai` → no output. <!-- Red Team: RT-1 -->
- `docker compose exec postgres psql -U ai_svc -d examio -c 'select 1 from exam."UserStorage"'` → permission denied (or relation missing).
- `cd /Users/tgiap.dev/devs/examio/examio-be/apps/ai-service && ./venv/bin/pytest -q && ./venv/bin/alembic upgrade head` green. `cd ../.. && yarn build && yarn test` green.
- `grpcurl -plaintext ai-service:50051 list` (from an internal container) shows `examio.ai.v1.AiService`; a `Query` call without a token → `Unauthenticated`. <!-- Red Team: RT-2 -->
- Manual: upload a PDF → status PENDING → COMPLETED, balance debited once; generate-from-file → quiz history, balance debited once by upload + generation; cancel a queued job → balance restored; delete upload → vectors gone (`select count(*) from ai."Document" where "userStorageId"=$1` = 0) and the R2 object gone within 1 min. <!-- Red Team: RT-1, RT-8 -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Double charge / missed refund across async hops | M | H | One debit per job/doc with keys `doc:`/`gen:` (`@@unique` in finance, P10); conditional status updates; reapers; money e2e above; DLQ alert <!-- Red Team: RT-1 --> |
| Crash between Debit and QUEUED leaves a charged, unqueued job | L | H | `PENDING_CHARGE` reaper (10 min) refunds + cancels; fault-injection e2e <!-- Red Team: RT-1 --> |
| New refunds surprise users/finance reports | L | L | Documented as new behaviour (cancel, failed generation, failed charged upload); tx reason text names the job <!-- Red Team: RT-1 --> |
| Long OCR blocks the event loop (heartbeats, gRPC) | M | H | Separate `worker` role, prefetch 1, CPU work in an executor |
| aio-pika queue args differ from Nest → PRECONDITION_FAILED | M | M | Shared topology contract test; one retry tier on both sides <!-- Red Team: RT-10 --> |
| Python token verifier drifts from `libs/auth-jwt` rules | M | H | Same claims test vectors (RS256 only, `aud`, `roles`, `kid`) in pytest and jest <!-- Red Team: RT-2 --> |
| An unknown caller still uses r2 `internal/upload` | L | M | Grep + 1 day of r2 access logs with 0 hits before deletion; revert restores it <!-- Red Team: RT-15 --> |
| ai-chat in exam breaks when UserStorage leaves exam | M | H | Carve-out (incl. clearChat → `DeleteDocuments`) done in the same PR; exam ai-chat tests <!-- Red Team: RT-8 --> |

## Rollback
- Revert the PR: the exam upload routes, HTTP AI calls, r2 `internal/upload` + token, the old Python consumer and grants come back. DB reset for the `document`/`ai` schemas (pending reaper/R2 tasks are dropped; no money is lost because nothing stays in `PENDING_CHARGE` after a reset). `AI_HTTP_COMPAT` gives a 1-sprint safety net for chat/word-family callers. Do not revert P10's `Debit`/`Refund`; this phase only consumes them. <!-- Red Team: RT-1, RT-10, RT-15 -->

## Security Considerations
- ai-service gets no R2 write credentials; it only reads via presigned GET URLs (1h). It has no host-exposed port.
- <!-- Red Team: RT-2 --> `AiService` accepts only service tokens from the in-code `ALLOWED_CALLERS`; <!-- Reconcile: X6 --> network placement is not the trust boundary. document-service RPCs act on the forwarded user token `sub`; `Refund` and r2 writes use allowlisted service tokens. Each service has its own RabbitMQ user limited to its routing-key prefix and its own queues, and consumers reject envelopes whose `source` does not match.
- <!-- Red Team: RT-15 --> `INTERNAL_SERVICE_TOKEN` is removed from exam `modules/ai` and from r2. It remains only behind the ai-service compat flag (and in exam ai-chat / vocabulary) until 13.
- Document ownership is enforced in document-service (token `sub`). Callers cannot fetch or delete someone else's storage ids. <!-- Red Team: RT-8 -->

## Next Steps
- 13 uses `AiService` + `DocumentService` (incl. `DeleteDocuments`), removes the compat HTTP and the last `INTERNAL_SERVICE_TOKEN` users. 14 moves `modules/ai` + `GenerationJob` (states, reaper) into content-service. <!-- Red Team: RT-1, RT-8, RT-15 -->
