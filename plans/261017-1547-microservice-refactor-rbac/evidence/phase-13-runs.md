# Phase 13 tempering runs (ai-chat-service extraction, finance effective tier, vocabulary gRPC, ai-service HTTP removed)

Raw rows: `evidence/phase-13/temper-raw.json` (98 rows, `{command, exitCode, summary, ts}`, real exit codes; 12 non-zero rows kept and classified below).
Verdict: **not sealed**. Two acceptance criteria fail on the live stack (F1, F2) and the FE AI chat page criterion cannot run at HEAD (F4). No product code was edited.

## Scope contract

- **Changed:** `apps/ai-chat-service` (new), exam (AI chat and subject modules removed), finance `subscription` event (effective tier), vocabulary `ai.client` (HTTP to gRPC), ai-service (HTTP compat and `INTERNAL_SERVICE_TOKEN` removed), gateway `routes.yaml`, compose/RabbitMQ/CI wiring, `r2` `DeleteObjects` ServiceOnly.
- **Impacted:** AI chat and AI teacher (FE and API), subjects (public), word-family generation, subscription limits, ai-service HTTP surface, R2 deletion, broker users, CI.
- **Will verify:** the criteria in `evidence/phase-13/study-context.json` on the final uncommitted tree: stage 1 static, stage 2 e2e, stage 3 live stack from an empty volume, stage 4 live flows through the gateway, stage 5 FE.
- **Deliberately skipped:** mobile (no mobile change in scope); the ai-service integration of a real model (no model key; fake AiService used); the Stripe-like SePay and OAuth flows (dummies); the full ui9 FE matrix (not in this scratchpad, and the AI chat page is not mounted, see F4); repeated runs for flake (each suite ran once after the environment fix, see "Excluded").

## Method

- Static on the working tree (`examio-be` at `/Users/tgiap.dev/devs/examio/examio-be`), no env files read. `buf` taken from `node_modules/.bin/buf`; breaking check against a `git archive HEAD` snapshot of `examio-be/proto`.
- E2E: throwaway `pgvector/pgvector:pg16`, `redis:7`, `rabbitmq:3.13` on 127.0.0.1 with the CI env (dummy values, `QUIZ_JWT_SECRET`/`PAYMENT_*` added as the boot env requires). Scratch copy of `examio-be` without real env files (post-copy check: 0 real env files). Ephemeral RS256 key from `scripts/ci-ephemeral-auth-env.sh`.
- Live stack: compose project `p13t`, empty volume, images built one at a time (19 builds, one re-run), dummy `deploy/.env` generated from `.env.example` (values never printed), `up -d --wait`, opt-in seed. Ports: gateway on 127.0.0.1:6369 only.
- Stand-ins: an in-memory S3-compatible mock as R2 (replaced an nginx+s3proxy shim that silently dropped multi-object deletes), a grpc-js fake `AiService` on `ai:50051` that verifies the RS256 service token (aud `ai`, allow-listed `sub`), the real `ai` container stopped for stage 4a.
- Auth: login needs Turnstile and was not used. Tokens were minted with the stack's RS256 key using the claim shape auth issues (`typ=at+jwt`, `aud=examio`, `iss=examio-auth`, `sub`, `roles`, `sid`, `av`). Users, wallets and subscriptions were inserted as the superuser (scratch fixtures, destroyed with the volume).
- Stage 5: Vite dev server on 127.0.0.1:5273 with `VITE_API_URL=/api/v1` and `VITE_BACKEND_URL=http://localhost:6369` (process env overrides the gitignored FE `.env`, which was not read), playwright-core on system Chrome 155, cookie `accessToken` injected, non-local hosts aborted.

## Stage 1: static (final tree)

| Check | Exit | Result |
|---|---|---|
| `yarn proto:lint` | 0 | clean |
| `buf breaking` vs HEAD proto snapshot | 0 | no breaking change (the first two attempts failed on PATH and on a bad git ref, both superseded) |
| `yarn typecheck` | 0 | clean |
| `TZ=UTC yarn test` (jest) | 0 | 224 suites passed, 1 skipped; 2304 tests passed, 6 skipped, 0 failed |
| `yarn check:deps` | 0 | dependency-cruiser clean |
| `yarn check:ownership` (strict) | 0 | 0 violations |
| `yarn build:all` | 0 | 10 Nest apps, 0 warnings |
| `node --test deploy/rabbitmq/render-definitions.spec.cjs` | 0 | pass |
| `node --test deploy/compose-topology.spec.cjs` | 0 | pass |
| ai-service `pytest -q` (unit) | 0 | pass |
| CI ruff gate (exact CI file list) | 0 | "All checks passed!" |
| ruff over whole `src` (not a CI gate) | 1 | 1197 legacy errors, the CI comment says the legacy tree has ruff debt |
| Greps (`git grep`, pathspec = ts/py/example/yml) for `INTERNAL_SERVICE_TOKEN\|x-internal-service-token\|AI_SERVICE_URL` | no match | PASS (the `.cjs` spec lines that name the tokens in assertions are outside the criterion's include list) |
| `AIChatModule\|SubjectModule` in exam src | no match | PASS |
| `deleteImage(\|deleteFile(` in ai-chat-service src | no match | PASS |

## Stage 2: e2e on throwaway infra

| Suite | Exit | Result |
|---|---|---|
| Prisma `migrate deploy` x8 (auth, finance, admin, exam, studyroom, vocabulary, document, aichat) | 0 x8 | applied on empty DB |
| `migrate diff --exit-code` x8 (drift) | 0 x8 | "No difference" x8 |
| ai-service Alembic `ROLE=migrate` on empty `ai` schema | 0 | baseline 0001 |
| `test/db-isolation` (`CI=true`) | 0 | 5 suites, 70/70 |
| ai-chat-service e2e folder (one process) | 0 | 8 suites, 83/83 |
| exam-service e2e folder (one process) | 0 | 22 suites, 256/256 (first run exit 1: `QUIZ_JWT_SECRET` missing, harness env, see Excluded) |
| finance-service e2e folder (incl. `subscription-changed`) | 0 | 6 suites, 69/69 (first run exit 1: `RABBITMQ_AUTH_URL` missing, harness env) |
| vocabulary-service e2e folder | 0 | 4 suites, 19/19 |
| document-service e2e folder | 0 | 6 suites, 71/71 |
| gateway e2e (7 CI files) | 0 | 7 suites, 60/60 |
| ai-service `pytest` with `REQUIRE_INTEGRATION=1` | 0 | 147 passed (skips are failures under this flag) |

Jest wall time: unit 15 s, db-isolation 25 s, ai-chat 21 s, exam 32 s, finance 9 s, document 17 s, vocabulary 6 s, gateway 23 s. Eight e2e configs set `forceExit: true`; 9 runs logged "Force exiting Jest" / "worker process has failed to exit gracefully", i.e. leaked handles hidden by forceExit (F6).

## Stage 3: live stack from an empty volume

- 19 builds, sequential, all exit 0 (the `study-room-migrate` build exited 126 once because the run wrapper was replaced mid-chain; the image was built and a rebuild returned 0).
- `up -d --wait`: exit 0 in 30 s. Healthy: postgres, redis, rabbitmq, r2, auth, finance, admin, exam, study-room, vocabulary, document, ai-chat, gateway, ai (later stopped for stage 4). `ai-worker` running (no healthcheck).
- One-shots: auth, finance, admin, exam, study-room, vocabulary, document, ai-chat, ai migrate and `rabbitmq-defs`: exit 0 each.
- Opt-in seed (`--profile seed run --rm seed`): exit 0. `aichat`: 15 subjects, 4 categories.
- Isolation (as `aichat_svc`): `exam."Subject"` denied, `auth."User"` denied, `document."UserStorage"` denied (3 rows, exit 1 = the expected denial). Exam has no AIChat or Subject table.
- Broker: `aichat.events` is bound to `examio.events` with `document.deleted` and `finance.subscription.changed`. Permission probes as user `aichat` (after a settle delay, which fixed an early false positive in my probe): publish `aichat.probe` ALLOWED; publish `document.deleted` and `finance.x` REFUSED (ACCESS_REFUSED); consume own `aichat.events` ALLOWED; consume `document.dlq` REFUSED.
- ai-service HTTP: GET `/` and `/health` exist (POST gives 405); `POST /api/chat/query`, `/api/chat/stream`, `/chat/query` give 404.

## Stage 4: live flows through the gateway (fake AiService)

| Case | Result |
|---|---|
| a. stream | PASS. 9 `data:` frames in 2.85 s, one chunk every ~400 ms (not one burst). Frame types started, user_message, chunk x6, done. |
| a. client abort mid-stream | **FAIL (F1)**. Direct to ai-chat:3000 the abort cancels upstream at +1.3 s (`CANCELLED after 3 chunks`). Through the gateway the fake ran to `done` at +3.3 s, and the full answer was saved. |
| a. upstream error | PASS. `event: error` frame with the message, after the started frame. |
| a. regenerate-stream | PASS. 8 frames from a user message id. |
| b. STUDENT 403 on `/ai-chat` (list, create, stream) | PASS (403 x3) |
| b. other user's chat on messages, stream, DELETE | PASS (404 x3) |
| b. other user's chat on `exists` | **FAIL vs criterion (F3)**. 200 `{"exists":false}`, same as HEAD; no existence leak. |
| b. anonymous `GET /subjects` | PASS (200; no `systemPrompt`, no `email` key) |
| c. clear with files (2 owned docs, owned image, external image) | PASS. `deletedFiles` = both filenames; chat, messages and links gone; both documents gone; owned image R2 key enqueued and drained; both R2 objects 404 within 46 s (of 60 s). |
| c. document-service stopped, clear with files | PASS. 503 `SERVICE_UNAVAILABLE`, chat and links kept, no task enqueued. |
| c. `deleteChat` without `deleteFiles` | PASS. 200, image key enqueued and drained (object 404). |
| c. external URL untouched | Not observed directly (drained before capture); covered by the ai-chat clear-chat e2e (exit 0). |
| d. free-tier 6th message in a minute | PASS. Messages 1-5 201, 6th and 7th 429 `RATE_LIMITED`. |
| d. admin tier change to tier 2 | PASS. `set-tier` 200 (`previousTier 0 -> newTier 2`); `aichat:benefits:u_t1` existed (1) before and was deleted (0) after; 7 messages then 201 (new tier applies). |
| d. lazy expiry publishes tier 0 | **FAIL (F2)**. The read path applies tier 0 (429 at the 6th message) but nothing is published and the row stays `isActive=true`. |
| e. vocabulary `POST /word-family/generate` as TEACHER | PASS. 201; fake AI logged `GenerateWordFamily OK sub=svc:vocabulary`; wallet balance 1000 and 0 transactions before and after. |
| e. no token to AiService | PASS. `UNAUTHENTICATED` (code 16). |
| f. delete an attached document through the gateway | PASS. 200; link count 1 -> 0; handler log `1 chat link(s) of 1 document(s) removed`. |
| g. gateway smoke (compact set) | PASS: auth/me 200, wallet/info 200, anonymous 401 x3, `ai/models` 200 (after aligning the fake's caller allow-list to ai-service's, which also allows `svc:exam`), studyrooms/mine 200, word-family categories 200, foreign document GET and DELETE 404 with the row kept, owner GET 200, STUDENT ai-chat 403, STUDENT admin set-tier 403. |

## Stage 5: FE (reachable scope)

- PASS: TEACHER opens `/k/ai-tool` and stays there (no 403); page renders (1533 chars of body); `/api/v1/config/pages`, `auth/me`, `config/stream`, `ai/recent-uploads` all 200 via the Vite proxy; no uncaught page errors. Screenshot: `scratchpad/p13t/ui/teacher-ai-tool.png`.
- PASS: STUDENT on `/k/ai-tool` is redirected to `/403`.
- PASS: only `www.googletagmanager.com` was aborted (external hosts blocked).
- NOT RUN: AI chat page actions (send, stream, regenerate, attach doc, clear chat with files, AI teacher subject list). See F4.

## Findings

| # | Where | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | `apps/gateway-service/src/pipeline/proxy-factory.ts` (streaming proxy; only `cutOnTruncation` on `proxyRes`) | A client disconnect on a streamed route is not propagated upstream. Repro: `curl -N --max-time 1.3 -X POST .../api/v1/ai-chat/<chat>/stream` via :6369. The upstream runs to `done` (+3.3 s) and the full answer is saved. Direct to ai-chat it cancels at +1.3 s. Violates "client abort cancels the gRPC call"; LLM cost keeps running after the user leaves. | High | Fixed and verified 2026-10-25 (see Re-verification) |
| F2 | `apps/finance-service/src/modules/sepay/subscription.service.ts:223` (`hasActiveSubscription`, the only lazy-expiry flip and publish, no production caller) and `:298` (`getUserSubscriptionBenefits`, used by GetUserBenefits) | Expiry does not flip `isActive` nor publish `finance.subscription.changed` (toTier 0) on the path ai-chat uses. Repro: backdate `nextPaymentDate` to 2020, drop `aichat:benefits:<id>`, send a message. Tier 0 is applied (429), but the row stays `isActive=true` and no event fires. ai-chat holds the stale tier until the 5-min TTL. Criterion "fires on expiry" not met. | Medium | Fixed and verified 2026-10-25 (see Re-verification) |
| F3 | `apps/ai-chat-service/src/modules/ai-chat/ai-chat.controller.ts:78` (`chatExists`) | Non-owned chat on `GET :chatId/exists` returns 200 `{exists:false}`. Criterion says 404. HEAD (exam) did the same, so this is an acceptance-text mismatch, not a regression; there is no existence leak. | Low | Decision needed: amend the criterion or change to 404 |
| F4 | FE: `src/apis/aiChatApi.ts`, `src/components/molecules/ChatHistoryCard.tsx`, `src/apis/subjectApi.ts`, `src/components/organisms/SubjectSelector.tsx` | At HEAD no route mounts an AI chat page or AI teacher subject selector. `aiChatApi` is imported only by `ChatHistoryCard`, and `SubjectSelector` is imported nowhere; neither is rendered. Stage-5 items (send, stream, regenerate, attach, clear, subject list) cannot be exercised in the UI. The backend behaviour is verified via the API. | Medium (acceptance gap) | Open: confirm whether the chat UI is on another branch |
| F5 | Harness only | First R2 stand-in (nginx + s3proxy) accepted SDK `DeleteObjects` with 200 and deleted nothing (s3proxy needs Content-MD5, and the bucket-qualified host needed an extra alias). Replaced by an in-memory S3 mock. Not a product defect. | Info | Closed (harness) |
| F6 | e2e jest configs (`forceExit: true`) | 9 runs logged leaked handles / "failed to exit gracefully" that `forceExit` hides. | Low | Open: `--detectOpenHandles` on the ai-chat and finance folders |
| F7 | `.github/workflows/ci.yml` `be-e2e` job env | The job env has no `QUIZ_JWT_SECRET` / `QUIZ_AES_KEY` (only the boot job has them). The exam e2e throws `QUIZ_JWT_SECRET environment variable is required` without them. Local run reproduces it (exit 1, 256/256 after the variable was added). | Medium (CI gap, likely red in CI) | Fixed: QUIZ_JWT_SECRET/QUIZ_AES_KEY added to the be-e2e env and subscription-changed spec to the finance step in `.github/workflows/ci.yml` (not yet run in CI) |
| F8 | `ai-service` ruff | Whole-`src` ruff reports 1197 legacy errors. The CI gate (phase-15+ modules) passes. | Info | Known debt per CI comment |

## Excluded and expected-failure rows (kept in `temper-raw.json`)

- Exit 127 / 1 on `buf breaking` (first two attempts): `buf` not on PATH, then a bad `.git#ref` form. Superseded by the exit-0 run against the HEAD proto snapshot.
- Exit 1 ruff over whole `src`: not the CI gate (F8). The CI gate row is exit 0.
- Exit 1 exam e2e: harness env (`QUIZ_JWT_SECRET`, F7). Superseded by exit 0 (256/256).
- Exit 1 finance e2e: harness env (`RABBITMQ_AUTH_URL` exported by CI only in the RBAC step). Superseded by exit 0 (69/69).
- Exit 1 x3 `aichat_svc` denied on exam, auth and document: expected denials (PASS by design).
- Exit 1 x4 `ai` HTTP probes via `wget` on port 8000 (wrong port and no output): superseded by the node probes on port 3000 (405 on `/` and `/health`, 404 on the removed routes).
- Exit 126 on the first `study-room-migrate` build: the chain's wrapper was replaced mid-run; the image built and a rebuild exited 0. The 126 row was lost in the row-file repair; it is in `scratchpad/p13t/logs/build-chain.out`.
- The AI-chat, document and gateway e2e folders each ran once. No flake was observed or re-run.

## Teardown

- Fake AiService, R2 mock, s3proxy and shim containers removed (`docker rm -f`); R2 volume `p13t-s3data` removed.
- `docker compose -p p13t down -v --rmi local --remove-orphans`: exit 0. Compose project volumes and networks removed.
- Vite (PID 78163) stopped by PID after confirming its command line; the Vite and jest processes of this run are gone.
- Scratch secrets deleted (`deploy/.env`, rendered broker definitions, auth env, public key, tokens); repo copy removed. Only logs, `rows.jsonl`, the UI JSON and the screenshot remain in `scratchpad/p13t`, with no secret values.
- Earlier e2e infra (`p13t-pg`, `p13t-redis`, `p13t-rabbit`) removed before the live stack.
- `docker ps -a`: 0 containers. `docker volume ls` for `p13t|examio`: none. `docker network ls` for `examio|p13t`: none. `deploy_default` and `meetio_*` were not touched.
- The real `examio-be/deploy/.env` and every `apps/*/.env` were never read; no compose command ran in the real `deploy/` directory.

## Re-verification after F1/F2 fixes (2026-10-25)

Scope: gateway proxy abort propagation (F1) and finance subscription expiry flip and publish (F2) only. Product code and test files were not edited. Raw rows: `evidence/phase-13/temper-raw.json` (rows appended after the 98 originals, real exit codes).

| Check | Exit | Result |
|---|---|---|
| Gateway e2e, 7 CI files (`gateway`, `gateway-streaming`, `gateway-expect`, `gateway-authz`, `gateway-control`, `gateway-edge`, `redis-scripts`), forceExit, watchdog | 0 | 7 suites, 61/61 (includes "a client that leaves mid-stream closes the upstream request too") |
| Finance e2e whole folder (6 suites incl. `subscription-changed`), forceExit, watchdog | 0 | 6 suites, 73/73 |
| 4a normal stream through gateway | 0 | 11 `data:` frames, chunks every ~400 ms (incremental), HTTP 201 at 3.35 s |
| 4a client abort at 1.3 s through gateway | 28 (curl `--max-time`, expected) | fake AiService logged `CANCELLED after 3 chunks` at +1.3 s; saved assistant message `w1 w2 w3 ` (9 chars), not the full 8-chunk answer |
| 4d(i) backdate `p13r_t1`, drop cache, message read | 0 | 201; `isActive=false`; one `finance.subscription.changed` outbox row, `toTier 0`, `fromTier 2`, published |
| 4d(i) second read after the event | 0 | 201; still exactly 1 event row (no duplicate); `isActive=false` |
| 4d(i) ai-chat consumer | n/a | `aichat.events` consumed (0 ready, 1 consumer). Handler uses `dedupe: false`, so no `processed_events` row is expected. Cache deletion confirmed by the key being absent after the event (before the second read re-cached it) |
| 4d(ii) sweeper, `p13r_t2` backdated, no read | 0 | flipped in 7 s (tick is 60 s); one event, `toTier 0`, published; sentinel `aichat:benefits:p13r_t2` deleted by ai-chat; still 1 row after a further 75 s window (no duplicate) |

Notes:
- Harness, not product: the first 4d(ii) probe was invalid. zsh did not word-split a `$PSQL` variable, so the backdate never ran and the poll read a stale row. Its row is kept as `[harness-invalid]` with a superseded summary. The rerun is `sweeper-test.sh`.
- Harness, not product: the first `psql` migrate loop failed under zsh (`bad substitution`). Those 8 rows (exit 1) are superseded by the bash `migrate.sh` rows (exit 0 x8).
- Limits: the fake AiService checks the token's `sub`/`aud` claims but not the RS256 signature. Live services ran as host processes from the scratch copy (`dist/apps/*/main.js`), not as compose containers. No compose command ran in `examio-be/deploy`. Stage 3 and the rest of the 19-image stack were not re-run (unchanged since the last run).
- Pre-existing broker DLQ entries (`finance.dlq` 1, `gateway.dlq` 1) came from the e2e suites that ran before the live services started (gateway `SOURCE_MISMATCH` log at 04:14:25, before any live request). Not seen from live traffic.
- F3 (`exists` 200 vs 404) and F4 (FE chat page not mounted) are unchanged and out of this re-verification.

Teardown: containers `p13r-pg`, `p13r-redis`, `p13r-rabbit` removed with `-v`; all 5 Node processes stopped by PID after command-line check and confirmed dead; scratch secrets (`svc.env.sh`, `auth-env.txt`, minted-token script, rendered definitions) and the repo copy deleted; logs kept under `scratchpad/p13r` without secret values. `docker ps -a` for `p13r|examio`: none. Volumes created today: none. Networks for `p13r|examio`: none. `deploy_default` and `meetio_*` untouched.

## temper-final

`phase-13/temper-final.json` = `temper-raw.json` minus the 22 rows listed under "Excluded" above, the re-verification harness rows (zsh migrate loop exit 1 x8, `[harness-invalid]` sweeper probe) and `[f1-red]` (exit 1 by design: the F1 regression test run with the fix disabled, proving it fails without it). 108 rows, all exit 0. Final-tree rows added by the coordinator: gateway unit 202/202, `yarn typecheck` 0, `yarn test` 2314 passed.
