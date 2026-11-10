# Phase 14 — Extract Content & Assessment, Delete exam-service

## Context Links
- [plan.md](./plan.md) · [planner-brief.md](./reports/planner-brief.md) decisions 5, 8, 9 · [red-team-changes.md](./reports/red-team-changes.md) RT-1, RT-8, RT-11, RT-15 (authoritative over this file's earlier text) <!-- Red Team: RT-1, RT-8, RT-11, RT-15 -->
- `/Users/tgiap.dev/devs/kmaedu/ARCHITECTURE.md` §4.4 (content/assessment rows + boundary notes), §6.2 (`content/v1`), §6.3 events, §7.3 snapshots, §9.4 flow, §12 P5, **§13 checklist**, Appendix B
- Prior: [phase-07](./phase-07-quiz-sharing-and-student-practice.md) (QuizSet sharing, practice), [phase-10](./phase-10-cut-cross-db-access.md) (`Debit`/`Refund`, shared finance client, `GetPublicProfilesByIds`), [phase-11](./phase-11-database-per-service.md) (`r2_delete_tasks`), [phase-13](./phase-13-extract-ai-chat.md), [phase-15](./phase-15-document-service-and-ai-service-db.md) (generation already event-driven, RT-1 charge flow)

## Overview
- [CARRIED from 13] `apps/ai-chat-service/src/clients/{document.client,document-errors}.ts` are near-copies of `apps/exam-service/src/clients/` (`requireUserToken`, `userMetadata`, `isGrpcStatus`, `toDocumentHttpException`). When content-service takes over exam's copy, move the shared DocumentService client + error mapping into `libs/grpc` (like `FinanceClient`) instead of a third copy.
- Priority: P1 · Status: Done — awaiting sign-off (uncommitted) · Effort: 4.5d (+0.5d: snapshot drift banner + refresh action, snapshot cache, reaper/R2 worker moves; minus the dropped user purgers) <!-- Red Team: RT-1, RT-11, RT-15 --> · Depends on: 07, 11, 13, 15 (the `modules/ai` generation code must already be event-driven by phase 15, with the RT-1 charge flow, before it moves; plan.md agrees). <!-- Reconcile: deps -->
- Goal: `content-service` ("author and self-study") and `assessment-service` ("proctored exams"). Assessment snapshots the quiz at session time (`ExamSession.quizSnapshot`), so content edits and deletes never change running sessions or results. Teachers see when the source quiz drifted and can refresh the snapshot while it is still safe. Split `/student/*`. **Delete exam-service.** <!-- Red Team: RT-15 -->
- Last link of the sequential chain 12 → 13 → 14 (shared `exam-service.module.ts`, `main.ts`, exam `prisma/schema/**`, routes YAML).

## Key Insights
- Content modules left in exam after 12/13/15: `quizset` (incl. phase-07 `quizset-sharing.*`, `quizset-access.ts`), `flashcardset` (+ `word-family-to-flashcard.*` from 12), `flashcard-study`, `quiz-practice` (phase 07, prefix `/api/v1/quiz-practice`), `ai` (generation only after 15), `finance-client`, and the flashcard half of `student`.
- `modules/common/whitelist.util.ts` (phase 07) is used by quizset/flashcardset (content) and examsession (assessment). It is Prisma-bound per service, so each service gets its own copy (≈ 30 lines). This is a deliberate small duplication: it cannot live in `libs/` (no Prisma in libs).
- Assessment modules: `examroom`, `examsession`, `examattempt`, `cheatinglog`, and the exam half of `student`.
- Cross-domain reads to cut: `ExamRoom → QuizSet` FK cascade (`exam.prisma:144-160`). examsession reads `detailsQuizQuestion` (live questions, `examsession.service.ts:530-558,592-618,886`). `examattempt.service.ts:1571-1579` counts `userStorage`, `quizSet` and `flashCardSet` for `history-stats`. `student.service.ts` mixes `flashCardSet`/`flashcardStudyProgress` with `examRoom`/`examAttempt`.
- Question shape (`exam.prisma:85-114`): `QuizQuestion {question, options String[], answer String (letter "A"…)}`, linked through `DetailsQuizQuestion {quizSetId, labelId?}`. Labels `QuizSetLabel {name, color, order}`. Sessions use `questionSelectionMode` ALL / RANDOM_TOTAL / RANDOM_BY_LABEL + `labelQuestionConfig`, and attempts store `selectedQuestionIds`. So the snapshot must keep question ids and label ids. `ExamSession.status` is `Int` (0 UPCOMING, 1 ONGOING, 2 ENDED; `exam.prisma:165`).
- `QUIZ_AES_KEY` (secure-quiz encryption) becomes assessment-only.
- Behaviour change (intended, ARCH §4.4): deleting a QuizSet no longer cascades to its exam rooms. The room is flagged `sourceDeleted`, and existing sessions keep their snapshot.
- <!-- Red Team: RT-8 --> Content-owned R2 objects are only the set thumbnails: `QuizSet.thumbnail` (`exam.prisma:6`) and `FlashCardSet.thumbnail` (`exam.prisma:62`). Questions/flashcards hold no R2 URLs. Phase 11 already turned the delete/replace call sites (`quizset.service.ts:239,411`, `flashcardset.service.ts:253,396`) into `r2_delete_tasks` enqueues in the exam schema; this phase moves them with the code into the content schema.
- <!-- Red Team: RT-1 --> Generation money after phase 15: `GenerationJob` states `PENDING_CHARGE → QUEUED → PROCESSING → COMPLETED|FAILED|CANCELLED`, one `Debit(gen:<jobId>)` per job (upload + generation in one debit for new files; generation only when a COMPLETED file is reused, `ai.service.ts:366-382`; free retry for a reused FAILED/PENDING file), a 10-min `PENDING_CHARGE` reaper, cancel/refund only for `PENDING_CHARGE|QUEUED|PROCESSING`. Refunds are new behaviour (none existed, `ai.service.ts:953-1000`). This phase moves all of it unchanged into content-service.
- <!-- Red Team: RT-11 --> User deletion is deferred (phase 11). Neither service has an `auth.user.deleted` handler or purger.

## Requirements
Functional — contracts
- `kmaedu.content.v1.ContentService` (server: content; client: assessment):
```proto
rpc GetQuizSetSnapshot(GetQuizSetSnapshotRequest) returns (QuizSetSnapshot);   // caller token must be owner, else NOT_FOUND
rpc GetQuizSetsByIds(GetQuizSetsByIdsRequest) returns (GetQuizSetsByIdsResponse); // only sets owned by caller; missing ids omitted
rpc GetUserContentStats(GetUserContentStatsRequest) returns (UserContentStats);   // {quiz_set_count, flashcard_set_count}
message GetQuizSetSnapshotRequest { string quiz_set_id = 1; }
message GetQuizSetsByIdsRequest { repeated string ids = 1; bool with_content_hash = 2; } // hash only for teacher detail views  <!-- Red Team: RT-15 -->
message QuizSetSummary { string id = 1; string title = 2; optional string content_hash = 3; }
message QuizSetSnapshot {
  int32 schema_version = 1;  string quiz_set_id = 2;  string title = 3;  string owner_id = 4;
  string taken_at = 5;       string content_hash = 6;   // sha256 of canonical questions+labels JSON
  repeated SnapshotLabel labels = 7;  repeated SnapshotQuestion questions = 8; }
message SnapshotLabel { string id = 1; string name = 2; int32 order = 3; optional string color = 4; }
message SnapshotQuestion { string id = 1; string question = 2; repeated string options = 3;
  string answer = 4; optional string label_id = 5; int32 order = 6; }
```
- `content_hash` is computed by ONE function (`content-hash.ts`) used by both `GetQuizSetSnapshot` and `GetQuizSetsByIds(with_content_hash)`, so equal content always yields an equal hash. <!-- Red Team: RT-15 -->
- `ExamSession.quizSnapshot Json` (+ `quizSnapshotHash String`), stored shape (TS, zod-validated on read):
```ts
type QuizSnapshotV1 = { v: 1; quizSetId: string; title: string; takenAt: string; contentHash: string;
  labels: { id: string; name: string; order: number; color?: string }[];
  questions: { id: string; question: string; options: string[]; answer: string; labelId: string | null; order: number }[] };
```
- <!-- Red Team: RT-15 --> Snapshot lifecycle:
  - Taken on `POST /examsessions`. `PUT /examsessions/:id` never touches the snapshot.
  - Drift: `GET /examsessions/get-by-id/:id` (host view) and the room's session list call `GetQuizSetsByIds([quizSetId], with_content_hash=true)` (one call per room view, fail-soft: `UNAVAILABLE` → `snapshotOutdated: null`) and return `snapshotOutdated = (current hash ≠ quizSnapshotHash)` plus `canRefreshSnapshot = (status = 0 UPCOMING && attemptCount = 0 && !sourceDeleted)`.
  - Refresh: `POST /examsessions/:id/refresh-snapshot` (`exam_session:manage` + host) re-takes the snapshot in a tx that re-checks `status = 0` and `attemptCount = 0` (`SELECT … FOR UPDATE` on the session; attempt start takes the same row lock) → `200 {quizSnapshotHash}`; otherwise `409 SNAPSHOT_LOCKED`. Never allowed after the first attempt.
  - FE (teacher session views): when `snapshotOutdated`, show the banner "Đề đã thay đổi kể từ khi tạo phiên — Cập nhật đề". The "Cập nhật đề" button calls refresh and is shown only when `canRefreshSnapshot`; otherwise the banner text alone (no button).
  - Exam-time reads: attempt start, `GET :id/quiz`, `secure-quiz`, submit/grading and `available-labels` read ONLY the snapshot (no content call at exam time, ARCH §9.4). Answers are stripped in every student-facing response (keep the phase-06 fix).
  - Cache: parsed + zod-validated snapshot in an in-process LRU keyed `<sessionId>:<quizSnapshotHash>` (TTL 5 min, max 50 entries), so the hash in the key makes a refresh self-invalidating. Each replica has its own cache (no Redis, no cross-replica invalidation needed).
  - Field selection: list endpoints (`list`, room lists, `recent-exams`, history) use Prisma `select` without `quizSnapshot`. Only the exam-time readers and refresh load the column.
- `ExamRoom`: `quizSetId String @index` (no FK) + `sourceDeleted Boolean @default(false)`. `POST /examrooms` validates via `GetQuizSetsByIds([id])` (empty → 404). Room lists enrich titles with one batch call, cached `assessment:cache:quizset:<id>` 5m. Creating a session when `sourceDeleted` → `422 QUIZSET_DELETED`.
- Events <!-- Red Team: RT-11 -->: content publishes `content.quizset.deleted {quizSetIds[], ownerId}` (outbox, from the quiz-set delete) and `content.generation.requested` (moved code from 15). Content consumes `ai.generation.completed|failed`, `document.deleted {storageIds}` (null `HistoryGenerated*.userStorageId`), `auth.user.updated` (profile cache DEL). Assessment consumes `content.quizset.deleted` (→ `sourceDeleted=true`, cache DEL) and `auth.user.updated`. No `auth.user.deleted` consumers. `assessment.attempt.submitted` is not published until a consumer exists (YAGNI).
- `/student/*` split (paths unchanged): content `@Controller('student')` → `GET recent-flashcards`, `POST pin-flashcard/:id` (`flashcard:study` + access check); assessment `@Controller('student')` → `GET recent-exams`, `POST pin-exam-room/:id` (`exam:take` + access check).
- `GET /examattempts/history-stats` (assessment): own attempt stats + parallel `content.GetUserContentStats(sub)` and `document.GetQuota(sub).fileCount` (deadline 3s; `null` field on `UNAVAILABLE`).
- Permissions (decision 5; moved decorators from phase 06 stay):
  - content: `quizset:manage`, `flashcardset:manage`, `content:share` (sharing/generate-code/`:id/share`), `user:search`, `ai:generate` (generation routes), `flashcard:study` (study/progress/with-code), `quiz:practice`, `@Public()` (public/:id, study/:id/info, verify-code, study/:id/access)
  - assessment: `exam_room:manage`, `exam_session:manage` (incl. `refresh-snapshot`), `exam_result:view` (list-by-room/session, cheating stats, host attempt detail), `exam:take` (start/progress/submit/quiz/secure-*/history-stats, POST cheatinglog), `content:share` + `user:search` (session sharing), `@Public()` (get-public/:id, study/:id/info)
- <!-- Red Team: RT-1 --> Generation money (moved from 15, behaviour unchanged): `content-service/src/modules/ai/` keeps the three-step flow (tx `GenerationJob PENDING_CHARGE` → `Debit(gen:<jobId>)` → tx `QUEUED` + outbox), the reuse branch, the cancel status guard (COMPLETED/FAILED → 409, CANCELLED → idempotent 200) and the conditional status updates. The `PENDING_CHARGE` reaper (every 60s, jobs older than 10 min → `Refund(gen:<jobId>)`, `NOT_FOUND` = never charged → `CANCELLED`) runs in `content-worker`. `Debit` uses the forwarded user token (`wallet:use`); `Refund` from the reaper, the `ai.generation.failed` consumer and cancel uses the content service token (finance allowlist `content`, P10). `AI_FREE_MODE` stays inside the shared finance client wrapper (`libs/grpc/src/clients/finance.client.ts`, P10); content has no own bypass. Remove `exam` from the finance `Debit`/`Refund` caller allowlist once exam is deleted.
- <!-- Red Team: RT-8 --> R2: content schema gets `r2_delete_tasks`; the moved thumbnail delete/replace paths enqueue keys (via `r2KeyFromUrl`) in the same tx as the row delete/update; `content-worker` drains them with the phase-11 worker (`DeleteObjects`, service token `svc:content`). Add `content` to the r2 `DeleteObjects` allowlist and remove `exam`. Assessment owns no R2 objects.
- <!-- Red Team: RT-15 --> User enrichment in both services uses `auth.v1.GetPublicProfilesByIds` (`{id, username, name, avatar}`, cached per P10) only. No content or assessment response contains `email`.

Non-functional
- Snapshot size bound: reject > 1 MB of serialized snapshot JSON (`422 QUIZSET_TOO_LARGE`) on create and refresh. Grading stays O(questions). <!-- Red Team: RT-15 -->
- Money flows (generation debit/refund, reaper) keep the phase-15 e2e green after the move. <!-- Red Team: RT-1 -->

## Architecture
```
Teacher ─POST /examsessions─► assessment ─gRPC GetQuizSetSnapshot (teacher token)─► content
                                └─ INSERT ExamSession{quizSnapshot,hash}
Teacher ─GET /examsessions/get-by-id/:id─► assessment ─GetQuizSetsByIds(with_content_hash)─► content ─► snapshotOutdated
Teacher ─POST /examsessions/:id/refresh-snapshot─► assessment (tx: UPCOMING && 0 attempts) ─GetQuizSetSnapshot─► content
Student ─/examattempts/*─► assessment (LRU snapshot cache → snapshot only, AES via QUIZ_AES_KEY)
content ─outbox content.quizset.deleted─► assessment.events ─► ExamRoom.sourceDeleted=true
content ─tx GenerationJob(PENDING_CHARGE) ─Debit(gen:<jobId>)─► finance ─tx QUEUED + outbox content.generation.requested─► ai-service ─► ai.generation.* ─► content.events
content-worker: PENDING_CHARGE reaper (Refund) · r2_delete_tasks ─DeleteObjects─► r2
```
<!-- Red Team: RT-1, RT-8, RT-15 -->
Gateway `config/routes.yaml` (phase-05 schema; `path` regex wins over `prefix`). Afterwards no route uses `${EXAM_SERVICE_URL}`, and that env var is deleted:
```yaml
# content (C = '${CONTENT_SERVICE_URL}')       existing ids from phase 05 keep their auth/permissions/pageFlag/rateLimit; only upstream changes
- { id: quizsets,        upstream: C, match: { prefix: /api/v1/quizsets } }
- { id: flashcardsets,   upstream: C, match: { prefix: /api/v1/flashcardsets } }
- { id: flashcard-study, upstream: C, match: { prefix: /api/v1/flashcard-study } }
- { id: quiz-practice,   upstream: C, match: { prefix: /api/v1/quiz-practice } }                  # phase 07 prefix
- { id: wf-to-flashcard, upstream: C }                                                           # was exam (phase 12)
- { id: ai-upload-history, upstream: C }                                                         # entry created in 15
- { id: ai,              upstream: C, match: { prefix: /api/v1/ai }, permissions: [ai:generate] } # generation routes; document entries are path-matched (15)
- { id: student-content, upstream: C, match: { path: '^/api/v1/student/(recent-flashcards|pin-flashcard/[^/]+)$' }, auth: required }
# assessment (A = '${ASSESSMENT_SERVICE_URL}')
- { id: student-exam,    upstream: A, match: { path: '^/api/v1/student/(recent-exams|pin-exam-room/[^/]+)$' }, auth: required }
- { id: examrooms | examsessions | examattempts | cheatinglogs, upstream: A }                    # 4 existing prefix entries; refresh-snapshot falls under examsessions
- delete the phase-05 `student` prefix entry (replaced by the 2 path entries)
```

## Related Code Files
File ownership (globs):
- Create: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/{content,assessment}-service/**`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/proto/kmaedu/content/v1/content.proto`, `.../proto/kmaedu/events/v1/content_events.proto`, `.../deploy/compose/{content,assessment}.yml`, `.../deploy/env/{content,assessment}.env.example`
- Delete: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service/**`, `.../deploy/compose/exam.yml`, `.../deploy/env/exam.env.example`
- Modify: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/config/routes.yaml` (all remaining exam entries), gateway env (upstreams)
- Modify: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/deploy/postgres/init/01-service-schemas.sh` (drop `exam` from the list; DB reset), `.../{nest-cli.json,package.json,jest.config.js,deploy/docker-compose.yml,scripts/check-model-ownership.ts}`
- Modify (decorator/constant lines only; allowlists live in code <!-- Reconcile: X6 -->): `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/r2-service/src/r2-service.controller.ts` (`DeleteObjects` `@ServiceOnly`: + `content`, − `exam`), `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/finance-service/src/modules/wallet/wallet.grpc.controller.ts` (`Debit`/`Refund` caller lists: − `exam`), ai-service `src/backend/auth/service_token.py` (`ALLOWED_CALLERS`: − `svc:exam`), `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/deploy/rabbitmq/definitions.template.json` (users `content`, `assessment`; remove `exam`) <!-- Red Team: RT-1, RT-2, RT-8 -->
- Modify: `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/{admin,vocabulary,ai-chat}-service/src/**` only if they still name `exam-service` hosts in env/clients (grep)
- Modify (FE, drift banner) <!-- Red Team: RT-15 -->: `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/apis/examSessionApi.ts` (`refreshSnapshot`, `snapshotOutdated`/`canRefreshSnapshot` types), `.../kmaedu-fe/src/stores/useExamRoomDetailStore.ts` (refresh action + invalidate the cached session), `.../kmaedu-fe/src/pages/k/components/session-card.tsx` and `.../kmaedu-fe/src/pages/k/ManageExamRoomDetailPage.tsx` (banner + button). New component `.../kmaedu-fe/src/pages/k/components/snapshot-outdated-banner.tsx`.
- Docs (`CLAUDE.md`, `docs/system/*`) are updated in phase 19, not here.

## Implementation Steps
Scaffold both apps (ARCH §13): 1) protos `content/v1` + `events/v1` → `buf lint/breaking/generate`; 2) apps with `ROLE`, env zod, libs; 3) Prisma `schema=content|assessment` + baselines (content incl. `GenerationJob`, outbox, processed, `r2_delete_tasks`; assessment incl. `quizSnapshot`, `quizSnapshotHash`, `sourceDeleted`, outbox, processed); 4) queues `content.events`, `assessment.events`, Redis prefixes `content:`/`assessment:`, RabbitMQ users `content`/`assessment` (P03 pattern); 5) compose files + includes (`content-worker`, `assessment-worker`); 6) gateway entries; 7) clients: assessment → content/auth/document, content → auth/finance/document/r2/vocabulary (forwarded user token on request paths; service token in workers); 8) [removed by RT-11: `auth.user.deleted` handlers]; 9) CI; 10) observability. <!-- Red Team: RT-2, RT-8, RT-11 -->
Content moves:
11. `git mv` quizset, flashcardset (incl. word-family-to-flashcard), flashcard-study, quiz-practice, ai (generation incl. the RT-1 job states and reaper), finance-client usage (now the shared `libs/grpc` wrapper) → `content-service/src/{modules,clients}`. Copy `modules/common/whitelist.util.ts` into both apps. Implement the `ContentService` gRPC controller over the existing quizset repository, with `content-hash.ts`. <!-- Red Team: RT-1, RT-15 -->
12. Split `student.controller.ts`/`student.service.ts`: the flashcard half → content `modules/student-content/`.
13. <!-- Red Team: RT-1, RT-8 --> Workers: register the generation reaper and the `r2_delete_tasks` worker in `content-worker`. Switch the finance/r2 `@ServiceOnly` / `@RequirePermissionsOrService` caller lists in code (+ `content`, − `exam`). <!-- Reconcile: X6 -->
Assessment moves:
14. `git mv` examroom, examsession, examattempt, cheatinglog → assessment. The exam half of student → `modules/student-exam/`.
15. Replace every live question read (examsession `detailsQuizQuestion`, quizSet relations) with snapshot readers (`snapshot.reader.ts`: select by mode/label, shuffle, strip answers, grade) behind `snapshot.cache.ts` (LRU, 5 min, key `<sessionId>:<hash>`). Drop `quizSnapshot` from every list `select`. <!-- Red Team: RT-15 -->
16. Snapshot write on create; `refresh-snapshot` endpoint with the row-locked guard; 1 MB cap; `snapshotOutdated`/`canRefreshSnapshot` on the host session views. `available-labels` from the snapshot. Room create/list via `GetQuizSetsByIds`. <!-- Red Team: RT-15 -->
17. history-stats via content + document RPCs.
18. FE: `snapshot-outdated-banner.tsx` + store action + API; `yarn build && yarn lint` in `kmaedu-fe`. <!-- Red Team: RT-15 -->
Cutover + delete:
19. Run both migrate jobs, switch the YAML, run the smoke matrix (below), then `git rm -r apps/exam-service`. Remove the `exam` project/scripts/compose/env, the `exam` RabbitMQ user and `exam` from the init schema list. Ownership map without `exam`.

## Tests
Write first:
- Snapshot unit: a quiz with 2 labels / 5 questions → snapshot shape + stable `contentHash`; `GetQuizSetsByIds(with_content_hash)` returns the same hash for unchanged content and a different one after a question edit. RANDOM_BY_LABEL selection draws only from the snapshot. Grading uses the snapshot answer letters. <!-- Red Team: RT-15 -->
- Immutability e2e: create a session → teacher edits a question + deletes the quiz set → student starts/submits → grading uses the original answers. The room shows `sourceDeleted`. A new session → 422.
- <!-- Red Team: RT-15 --> Drift + refresh e2e: create a session → edit a question → host `get-by-id` returns `snapshotOutdated: true`, `canRefreshSnapshot: true` → `POST refresh-snapshot` → new hash, `snapshotOutdated: false`. After the first attempt (or status ONGOING) → `refresh-snapshot` → 409 `SNAPSHOT_LOCKED`, hash unchanged. `PUT :id` with any body → hash unchanged. Concurrent refresh + attempt start → either the attempt sees the new snapshot or the refresh gets 409 (never both a started attempt and a changed snapshot). Content `UNAVAILABLE` → `snapshotOutdated: null`, 200.
- Snapshot cache: two `GET :id/quiz` within 5 min → 1 DB read of `quizSnapshot`; after a refresh → the new hash is read (key changes). <!-- Red Team: RT-15 -->
- Size cap: a 1.1 MB snapshot → 422 `QUIZSET_TOO_LARGE` on create and on refresh. <!-- Red Team: RT-15 -->
- `GetQuizSetSnapshot` contract: non-owner token → `NOT_FOUND`; no token → `UNAUTHENTICATED`.
- Answer leakage: every `exam:take`/`flashcard:study` response contains no `answer`, `accessCode` or `whitelist` (JSON key scan helper).
- <!-- Red Team: RT-15 --> Email contract: the same JSON key scan over every content + assessment e2e response (sessions, attempts, rooms, quiz/flashcard sharing, practice, student) → no `email` key. Profile enrichment calls only `GetPublicProfilesByIds` (fake auth fails the test on any `GetUsersByIds` call).
- Permission matrix e2e (STUDENT/TEACHER/ADMIN) on 2 routes per controller in both apps, plus `refresh-snapshot`. Student split: the 4 `/student/*` routes reach the right upstream (gateway route test).
- history-stats with content `UNAVAILABLE` → 200 with `quizSetCount: null`.
- <!-- Red Team: RT-1 --> Generation money e2e (from phase 15) passes against content-service: new file → exactly one `Debit(gen:<jobId>)` (upload + generation amount); reused COMPLETED file → one `Debit` with the generation amount only; reused FAILED file → no `Debit`; insufficient balance → job FAILED, no outbox row; crash after `Debit` (fault injection before step 3) → reaper refunds once and sets CANCELLED; `ai.generation.failed` → one `Refund`; cancel QUEUED → CANCELLED + one `Refund`; cancel COMPLETED → 409; cancel then completed → no history, refunded once; `AI_FREE_MODE=true` → no finance call, job QUEUED.
- <!-- Red Team: RT-8 --> R2: delete a QuizSet with an R2 thumbnail → `r2_delete_tasks` row in the same tx (rollback → none); replace a FlashCardSet thumbnail → old key enqueued; `content-worker` → `DeleteObjects([key])` once with a `svc:content` token.
- `content.quizset.deleted` replayed → `sourceDeleted` stays true, no error (idempotent). <!-- Red Team: RT-11 -->

## Todo List
- [x] content/v1 proto (+ `with_content_hash`) + events <!-- Red Team: RT-15 -->
- [x] Scaffold content-service + assessment-service (§13), RabbitMQ users <!-- Red Team: RT-2 -->
- [x] Move content modules (+ generation with RT-1 states/reaper, shared finance client) <!-- Red Team: RT-1 -->
- [x] Content `r2_delete_tasks` + worker; r2/finance allowlists (+content, −exam) <!-- Red Team: RT-1, RT-8 -->
- [x] Move assessment modules
- [x] `/student/*` split
- [x] quizSnapshot write + snapshot readers + LRU cache + field selection + 1 MB cap <!-- Red Team: RT-15 -->
- [x] Drift detection + `refresh-snapshot` (UPCOMING, 0 attempts) + FE banner "Đề đã thay đổi kể từ khi tạo phiên — Cập nhật đề" <!-- Red Team: RT-15 -->
- [x] ExamRoom FK cut + `sourceDeleted` + title enrichment
- [x] history-stats via RPCs
- [x] Event handlers (quizset.deleted, generation, document.deleted, user.updated) <!-- Red Team: RT-11 -->
- [x] Email contract test (content + assessment) <!-- Red Team: RT-15 -->
- [x] Gateway YAML (no `exam` upstream)
- [x] Delete exam-service + init/compose/env/scripts cleanup
- [x] [CARRIED from 09] D4 retire the legacy `libs/common` event consumer (`event-subscriber.service.ts:50` JSON.parse outside try) with consumers on `@kmaedu/messaging`; D8 public `ExamSessionPage` renders `sessionUnavailable`
- [x] [CARRIED from 10] N3: session `whitelist` accepts any string; validate ids before storage (`create-examsession.dto.ts:30`, `sharing.dto.ts:10`).

## Verification
- Temper: 164 green runs in `evidence/phase-14/temper-final.json`, including live gateway flows and FE checks. The count is taken from the evidence file as reported, not recounted.
- Review: opus, SEALED, 0 Critical / 0 High. M1 (content had no egress for Turnstile) was fixed.
- Deferred lows: L1 snapshot LRU bounded by count, not size; L2 legacy `POST /examattempts` ignores RANDOM; L3 room/delete race leaves the `sourceDeleted` banner unset.
- Deviation not in Delivered: content and assessment run `ROLE=api,worker` in one container each (`content`, `assessment`), with no separate `content-worker`/`assessment-worker` compose services. Same convention as vocabulary and document.
- Carried to phase 16: CI boot smoke (compose config passes, but `up` needs `PAYMENT_*`, `GOOGLE_CLIENT_*` and `REFRESH_TOKEN_ENC_KEY`).
- Not run live: AI generate-from-file money flow, ADMIN permission row, flashcard study UI (covered by e2e).

## Success Criteria
- `test ! -d /Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/exam-service && echo ok` → `ok`. `grep -rn "exam-service\|EXAM_SERVICE_URL" /Users/tgiap.dev/devs/kmaedu/kmaedu-be --include='*.ts' --include='*.yaml' --include='*.yml' --include='*.json' --include='*.example'` → no output.
- `cd /Users/tgiap.dev/devs/kmaedu/kmaedu-be && yarn build && yarn test && npx depcruise apps libs && npx ts-node scripts/check-model-ownership.ts --strict` green.
- `grep -rn "deleteFile(\|deleteImage(" /Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/content-service/src --exclude-dir=r2-delete` → no output. <!-- Red Team: RT-8 -->
- `grep -rn "auth.user.deleted" /Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/{content,assessment}-service/src` → no output. <!-- Red Team: RT-11 -->
- Compose from an empty volume: all services healthy. The phase-01 route snapshot test is green. `cd /Users/tgiap.dev/devs/kmaedu/kmaedu-fe && yarn build && yarn lint` green. <!-- Red Team: RT-15 -->
- Manual FE: teacher creates a quiz → room → session (private code); edits a question → the banner appears → "Cập nhật đề" refreshes it; student joins, takes and submits; the banner shows without the button afterwards; teacher sees results; flashcard study via code; AI generate-from-file end to end (balance debited once). <!-- Red Team: RT-1, RT-15 -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Behaviour regressions in a large move | H | H | `git mv` first (no edits), tests green, then the snapshot refactor in separate commits |
| Snapshot vs live drift confuses teachers | M | M | Drift banner + refresh while UPCOMING with 0 attempts; banner without button afterwards <!-- Red Team: RT-15 --> |
| Refresh races the first attempt | L | H | Same session row lock in refresh and attempt start; e2e for the race <!-- Red Team: RT-15 --> |
| Missed route stays on deleted exam | M | H | YAML lint: no `exam` upstream; route snapshot test; 404-rate alert after deploy |
| Snapshot JSON too large / memory | L | M | 1 MB cap; LRU max 50 entries (≤ 50 MB worst case, typical sets ≪ 1 MB); lists never select the column <!-- Red Team: RT-15 --> |
| Money regressions in the generation move | M | H | Generation money e2e incl. reaper and free mode is a merge gate; allowlist switch in the same PR <!-- Red Team: RT-1 --> |
| In-flight jobs or R2 tasks in the exam schema at cutover | L | L | DB reset policy; drain the exam worker before cutover in non-reset envs <!-- Red Team: RT-1, RT-8 --> |

## Rollback
- Revert the PR: exam-service, its compose/env, the YAML entries, the allowlists and the FE banner return together. DB reset policy: recreate the `exam` schema (init list revert) and run exam-migrate. <!-- Red Team: RT-1, RT-8, RT-15 -->

## Security Considerations
- Snapshots contain answers. They are never serialized to students. The `secure-quiz` AES payload is built from the snapshot without answers. The LRU cache is in-process memory only.
- `GetQuizSetSnapshot` enforces ownership with the forwarded token (decision 9). Assessment never accepts a client-supplied snapshot. `refresh-snapshot` is host-only. <!-- Red Team: RT-15 -->
- Whitelists/access codes are not exposed in public/study responses. No response carries `email` (public profile projection only). <!-- Red Team: RT-15 -->
- `Refund` and `DeleteObjects` accept only allowlisted service tokens (`content`); `exam` leaves every allowlist with this phase. <!-- Red Team: RT-1, RT-2, RT-8 -->

## Next Steps
- Phase 16 builds per-service images and the deploy matrix. Phase 19 documents the snapshot contract, the drift/refresh rule and the deletion behaviour change. <!-- Red Team: RT-15 -->

## Delivered beyond plan / deviations

- Built in three parts: A content-service (`git mv` of the content modules), B `git mv apps/exam-service apps/assessment-service` then the snapshot work (exam's multi-file schema and migration history replaced by a fresh `assessment` init migration, DB reset policy), C gateway/deploy/CI/allowlists + FE.
- Generation pricing follows the phase-15 decision (reused documents always pay 5, no free retry); this file's "free retry" text is outdated.
- ContentService RPCs take only the caller's forwarded user token: `GetQuizSetSnapshot`/`GetQuizSetsByIds` need `quizset:manage` + ownership (service token → PERMISSION_DENIED, > 50 ids → INVALID_ARGUMENT); `GetUserContentStats` any user. So `SERVICE_AUDIENCES` gets no `content`/`assessment` entry.
- Student views never call content: `ExamRoom.quizSetTitle` is stored at room creation/re-point; teacher views refresh title + `questionCount` with one cached batch call (falls back to the stored title). `QuizSetSummary.question_count` (additive field 4) was added so teacher room lists keep their question counts.
- `ExamSession.quizSnapshot` is hidden by a global Prisma `omit`; `SnapshotStore` is its only reader. `selectedQuestionIds` are snapshot question ids. The attempt-detail slider lists only the attempt's selected questions. `available-labels` takes an optional `?sessionId=` to count labels from that session's snapshot.
- `history-stats` keeps its existing keys (`examsCreated`, `flashcardSets`, `totalPDFs`), each `null` when its dependency is down (plan text said `quizSetCount`).
- content and assessment each run one container with `ROLE=api,worker` (no separate `content-worker` / `assessment-worker` compose services), matching vocabulary and document.
- content gets the `egress` network and `TURNSTILE_SECRET_KEY` (flashcard study/with-code verify Turnstile tokens), as exam had (review M1).
- Security fix on the way: `GET /examsessions/:id/quiz` returned the raw session row (accessCode, whitelist, answers) to examinees; it now goes through the whitelist mapper.
- Shared libs: DocumentService client + error mapping moved to `libs/grpc` (CARRIED from 13; ai-chat uses it); `BaseRepository` got an opt-in Redis `keyNamespace`; the legacy `libs/common/src/events` consumer was deleted (D4, no importers). `libs/messaging` `alsoPublishes` is unused by apps but kept.
- r2 allowlist: `content` on `UploadFile` (thumbnails) and `DeleteObjects`; `exam` removed everywhere. Broker users `content` (`^content\.`) and `assessment` (`^assessment\.`); postgres init has 10 roles.
- FE: the drift chip sits in the teacher room-detail session rows (`session-card.tsx` is the student card, untouched); rooms with `sourceDeleted` show "Bộ đề gốc đã bị xóa — không thể tạo phiên thi mới"; D8 public `ExamSessionPage` renders `SessionUnavailable` instead of redirecting.
- N3: session whitelist ids validated (`z.string().min(1).max(64)`, same as content sharing).
