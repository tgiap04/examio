# Phase 11 temper runs (Database per Service)

Scope: static checks on examio-be; live compose stack from an EMPTY volume run from a scratch copy
(project `p11t`, loopback only, dummy external keys, s3proxy as R2 stand-in, MAIL_TRANSPORT=json).
Raw rows: `evidence/phase-11/temper-raw.json`. The real `deploy/.env` was never read; the scratch `.env`
was generated in-session and is not copied here.

## Findings during the run

| # | Where | Finding | Status |
|---|---|---|---|
| F1 | `examio-be/deploy/Dockerfile.seed` (before fix) | `RUN yarn proto:gen && yarn prisma:generate` runs `scripts/prisma-generate.sh`, but the image never copied `scripts/`: `command not found: scripts/prisma-generate.sh`, exit 127 (`build-seed`), which also blocked `compose up --wait`. | Fixed by coordinator (`COPY scripts ./scripts`). Re-run below. |
| F2 | Docker Desktop VM (8 GB) | Parallel build of nine images with `yarn install` ran out of memory (`cannot allocate memory`, exam-migrate); the s3proxy stand-in was OOM-killed once (`OOMKilled=true`). | Environment. Builds were run sequentially afterwards. |
| F3 | `compose build --parallel 2` | Flag rejected in this Compose (v5.4.0): `no such service: 2`. | Harness error, not product. |
| F4 | `examio-be/deploy/Dockerfile.seed:19` (`rm -rf /root/.cache /tmp/*`) | At runtime the seed's `yarn run seed:dev:<svc>` makes corepack download yarn 4.9.2 again. The build step removed corepack's cache (under `/root/.cache`) and the seed is on `examio-internal` (no DNS, no egress), so the download fails: `getaddrinfo EAI_AGAIN repo.yarnpkg.com`, exit 1. Repro: `docker compose -p p11t -f deploy/docker-compose.yml up -d --wait` with the fixed F1 image; `examio-seed` exits 1 (log tail: `Seeding auth` then the corepack error). | OPEN (product bug). Scratch-only workaround: drop `/root/.cache` from the final RUN so the corepack cache survives. Product fix needed: keep the cache, or pre-activate yarn in the seed image. |

Harness note: login through the gateway used a local Turnstile stub (network alias `challenges.cloudflare.com`, self-signed CA trusted only by the scratch auth container via `NODE_EXTRA_CA_CERTS`); product code and repo compose unchanged. The stub, override and TLS material live only in the scratch directory and are removed at teardown.

## Results per item

Raw rows are in `evidence/phase-11/temper-raw.json`. Wrapper rows such as `iso-run`, `mig-status-run`, `post-seed-run` report the wrapper's own exit code; the inner rows carry the real per-command codes.

1. Static (real repo): install --immutable, prisma:generate, typecheck, build:all, `TZ=UTC yarn test` (190 suites passed, 1 skipped; 1910 tests passed, 5 skipped), check:ownership (0 violations), check:deps (0 errors), no `@examio/database`|`libs/database` references, compose-topology spec 18/18, render-definitions spec. **PASS.** Not run in this session: the `test/db-isolation` and `test/r2-delete` e2e configs (their `*-spec.ts` files are outside `yarn test`'s regex; see F5 below).
2. Compose from empty volume: all `<svc>-migrate` exited 0; `rabbitmq-defs` exited 0; postgres, redis, rabbitmq, auth, finance, admin, exam, gateway, r2, ai healthy. **PASS.** `up --wait` exits 1 because `examio-seed` fails (F4). Seed run (`docker compose run --rm seed`, scratch copy with F4 workaround) exit 0, "Seeds complete". Counts: page flags 9, subject categories 4, subjects 15, word-family categories 10, users 8, wallets 7, admin audit 20. **PASS** on counts; **FAIL** on the in-stack seed (F4).
3. Isolation: `permission denied for schema auth|finance` for content_svc→auth, exam_svc→auth, auth_svc→finance, auth_svc create in public; ai_svc `permission denied for schema exam` on DDL and `auth` on read; ai_svc reads exam tables; `auth_svc` raw `outbox_events` resolves via role search_path. Privilege matrix: only exam_svc has CREATE on exam; ai_svc USAGE on exam only. `prisma migrate status`: up to date for auth, finance, admin, exam. **PASS.**
4. R2 durable delete (final run, `r2-results-run3.json`, 20/20): thumbnail delete → task row observed, object deleted in 3 s; r2 stopped → delete returns 200, task persists with attempts=1 (last_error `DEADLINE_EXCEEDED`), r2 restarted → task removed after 55 s; avatar replace → old `avatars/...` object deleted in 2 s, `auth.r2_delete_tasks` drained. **PASS.** Caveat: "row observed right after delete" is best-effort (worker can be faster).
5. Smoke through gateway (`smoke-results.json`, 18/18): login ADMIN/TEACHER/STUDENT (`/auth/me` roles and isSystemAdmin correct); STUDENT demoted via admin roles API; quiz set, flashcard set, exam room, exam session, wallet info, studyroom list; admin credit with Idempotency-Key once plus a replay (balance +1000 once, `previousBalance 150000 → newBalance 151000`); set-tier unknown user → 404 `USER_NOT_FOUND`. **PASS.** Login returns 201 (not 200).
6. UI matrix (ui9, 64 checks, scratch copy redirected from phase-09 evidence): 63 PASS, 1 FAIL, 1 NOTE. FAIL: "6 STUDENT start -> /exam-session/:id/quiz" landed on `/exam-session/<id>`. Cause: the fixture session starts 00:03 UTC and the run was at 23:40 UTC (`exam."ExamSession".startTime` in DB), so the session was not open; the matrix needs an open session. Not a product verdict. NOTE: "Từ đã lưu" saved-words view has no match in examio-fe src (0 hits). The matrix also verified no non-local request left the browser (29 external attempts blocked, hosts `www.googletagmanager.com`, `challenges.cloudflare.com`).
7. ai-service: `/health` 200 from inside the container; `DB_SEARCH_PATH=exam,extensions`, `AI_RUNTIME_DDL=false`, `DATABASE_URL` as `ai_svc` (password redacted in the row); zero `CREATE TABLE|CREATE INDEX|ALTER TABLE` lines in its logs. The "Skipping runtime DDL" log line was not observed, so the guard's execution path is not confirmed at boot. **PASS** with that caveat.
8. Teardown: `down -v --rmi local` exit 0; stand-in containers removed; `examio-internal` removed; scratch TLS key and cert deleted; no `examio-*` or `p11t*` containers, networks or volumes remain.

## Findings

| # | Where | Finding | Status |
|---|---|---|---|
| F1 | `examio-be/deploy/Dockerfile.seed` | seed image did not COPY `scripts/` (exit 127). | Fixed by coordinator; rebuild OK. |
| F4 | `examio-be/deploy/Dockerfile.seed:19` | final `RUN ... rm -rf /root/.cache` deletes corepack's cache; `yarn run` in the seed container (on `examio-internal`, no DNS) then fails `EAI_AGAIN repo.yarnpkg.com`, so `examio-seed` exits 1 and `up --wait` fails. | OPEN, product bug. Scratch workaround verified the seed itself (exit 0, counts match). |
| F5 | `examio-be/jest.config.js` (`testRegex: '.*\\.spec\\.ts$'`) | e2e specs named `*-spec.ts` (`test/db-isolation/*.e2e-spec.ts`, `test/r2-delete/*`) are never run by `yarn test`. Phase-11 success criteria say `yarn test` is green "incl. the db-isolation e2e". | OPEN (test gap). |
| F6 | `examio-be/apps/auth-service/src/auth.controller.ts:204-211, 268-277` | In production, login and register reject any request without `turnstileToken` (400 "Captcha verification required"); a supplied token triggers a server-side call to `challenges.cloudflare.com`. A compose stack with `NODE_ENV=production` cannot log in without an outbound Cloudflare call. | Expected by design; the harness used the stub above. Worth documenting in deploy/README and the test runbook. |
| F7 | `examio-be/apps/r2-service/src/r2-service.service.ts:18-25` | S3 client has no `forcePathStyle` and no checksum setting; stand-ins need path-style and anonymous shims. Real R2 is fine. | Harness constraint only; no product change. |
| F8 | `examio-be/apps/exam-service/src/clients/r2.client.ts:109` | `deleteFile` wrapper is unused by any caller. | Dead code. |

## Harness notes (scratch only)

- login through the gateway used a local Turnstile stub (network alias `challenges.cloudflare.com`, self-signed CA trusted only by the scratch auth container via `NODE_EXTRA_CA_CERTS`); product code and repo compose unchanged.
- R2 stand-in: s3proxy (path-style, anonymous auth) behind a scratch nginx shim that rewrites `bucket.s3stub` to path-style, because s3proxy's virtual-host mode fails with MalformedXML on PutObject.
- Scratch seed Dockerfile: `rm -rf /root/.cache` removed from the final RUN (F4 workaround). Not in the repo.
- Egress: the stack was not network-blocked. The smoke and R2 paths avoid Gemini, SePay and Google OAuth; no outbound request from those was observed in the logs, but no packet capture was taken.
- Not run: `test/db-isolation` and `test/r2-delete` e2e via jest (F5); `migrations-and-seeds` e2e.

## Status

**DONE_WITH_CONCERNS.** Passes: static, migrations, isolation, seed counts, R2 durable delete, gateway smoke, UI 63/64 (+1 note), ai-service health and no-DDL statements. Open: F4 blocks `up --wait` in the stack as built; F5 means the isolation e2e is not in CI. F6 and F7 are documentation and harness constraints.

## Re-temper 2 (after review fixes)

Interim section, written while the run is still in progress; the final verdict is appended at the end.
Same method as round 1: scratch copy only (`.../scratchpad/p11t2/`, never in the repo), compose project `p11t2`,
loopback-only published ports, dummy external keys, s3proxy + nginx path-style shim as the R2 stand-in,
Turnstile stub on `examio-internal`, `MAIL_TRANSPORT=json`. Raw rows: `phase-11/temper-raw.json`, command text
prefixed `re-temper-2:`. Scratch logs are not copied into the repo.

### Item 1: scratch copy and gitignore

- `rsync` of `examio-be` into scratch, excluding `node_modules`, `dist`, `.git`, `generated/`, venvs, and every
  `.env` / `.env.*` except `*.env.example`. A post-copy find confirmed no non-example env file was copied.
- The scratch `deploy/.env` was generated by `p11t2/gen-env.cjs` from `.env.example` with dummy values (key
  material from the repo's own `gen-jwt-keypair.sh` and `gen-service-secret.sh`). The real `deploy/.env` was never opened.
- Real repo, `git check-ignore` without `-v`: `deploy/env/auth.env.example` is NOT ignored (exit 1); `deploy/env/auth.env`
  IS ignored (exit 0); `deploy/.env` ignored (exit 0).

### Item 2: sequential builds and in-stack bring-up

- 12 images built one at a time: `auth/finance/admin/exam-migrate`, `auth`, `finance`, `admin`, `exam`, `gateway`,
  `r2`, `ai`, `seed`. All exit 0. The seed image built in 16 s.
- Full bring-up from an empty volume (`up -d --wait` with the stand-in override): all four `<svc>-migrate` exit 0,
  `rabbitmq-defs` exit 0, `examio-seed` exit 0 in the stack. **F4 is fixed**: the seed runs in-stack
  and exits 0 (`COREPACK_HOME=/opt/corepack` holds yarn outside the removed cache). All APIs healthy.
- **F9 (new, open): `docker compose up -d --wait` returns exit 1 on a fresh stack** even though every service is
  healthy and every one-shot exited 0: `container examio-seed exited (0)`. Reproduced on two fresh bring-ups.
  Compose only tolerates a one-shot that another service depends on, and nothing depends on `examio-seed`.
  The repeat `up -d --wait` on the settled stack exits 0. `deploy/README.md` documents `up -d` (no `--wait`).
- **F10 (new, open): every `docker compose up -d` re-runs the seed.** An exited one-shot is started again by `up`
  (`examio-seed` `StartedAt` moved on a plain `up -d` with no config change). `AdminAudit` grows by 20 rows per run:
  20 after one run, 40 after two, 60 after three. The other seeded tables stay stable (page flags 9, subject
  categories 4, subjects 15, word-family categories 10, users 8, wallets 7). The seed's own comment and README say
  it is "idempotent, safe to re-run"; that holds for upserts but not for the audit inserts.
- One further anomaly, not isolated: on the first bring-up the seed container logged two full runs with no restart count.

### Items 3-9: results

- **3 CI-equivalent checks (PASS, with harness notes).** Drift (`prisma migrate diff --exit-code`, as each role, in each
  `<svc>-migrate` image): auth, finance, admin, exam all "No difference detected", exit 0. The db-isolation config
  (`test/db-isolation/jest-e2e.json`, `CI=true`, CI env, 127.0.0.1 port-forwards to compose Postgres 55432 and RabbitMQ 55672):
  **5/5 suites, 36/36 tests pass** on the fresh DB while the live `examio-exam` and `examio-auth` containers were paused.
  Harness faults, fixed in scratch and not product: generated Prisma/proto output was missing from the scratch copy;
  the CI job env (`JWT_*`, `SERVICE_CLIENT_SECRET`, `AUTH_JWKS_URL`, `AUTH_TOKEN_URL`, Google placeholders) was not set.
  With the live workers running, the same config fails 1 test (`r2-delete.e2e-spec.ts` lease re-claim): the live
  workers claim and back off rows in the same DB (`attempts=1`, `next_attempt_at=now()+60s`, the FAIL shape). Harness
  contamination, not a product bug; CI has no live workers on its DB.
- **4 Isolation and migrate status (PASS).** Six expected denials, each `permission denied for schema` (content_svc,
  exam_svc to auth; auth_svc to finance and to create in public; ai_svc DDL on exam and read on auth). Allowed reads
  succeed (auth outbox via search_path, ai_svc reads exam). Privilege matrix as round 1. `prisma migrate status`:
  up to date for auth, finance, admin, exam. Note: the superuser is `examio` (`.env.example` `POSTGRES_USER`); round-1
  scripts used `examio_super`, which does not exist here. Scratch scripts retargeted.
- **5 R2 durable delete, owner-scoped keys (PASS, 23/23).** Teacher thumbnail key `flashcardset-thumbnails/<teacherId>/...`
  is in the bucket; delete removed it within 1 s. With r2 stopped, delete returns 200, the task persists with
  `attempts=1`, `last_error=4 DEADLINE_EXCEEDED ... after 10.00`; after r2 is healthy the task drains (55 s).
  Avatar `avatars/<teacherId>/...` replaced; the old object was deleted within 3 s and `auth.r2_delete_tasks` is empty.
- **6 Cross-user attacks (FAIL: cross-user script 23/24, one failure `1b`, F11; AI traversal probe 2 of 4 checks failed, F12).** Passing: B create with A's thumbnail URL → 400
  `VALIDATION_FAILED`; B update own set to A's thumbnail → 400, B row unchanged; B `PUT /profile` avatar = A's URL →
  400 `Giá trị avatar không hợp lệ`, B avatar unchanged; B (TEACHER for this probe) `POST /ai/upload` with A's
  `keyR2` → 400 `keyR2 không hợp lệ`, A's upload rows unchanged (1 and 1); a planted legacy owner-less thumbnail
  (`flashcardset-thumbnails/legacy-...`) is NOT deleted when its set is deleted (object still in S3, no
  `r2_delete_tasks` row, exam log "Not deleting thumbnail outside ..."). Failing: the encoded `..` traversal, thumbnail (`1b`, F11) and AI `keyR2` (probe, F12). The probe's URL check passed: the traversal URL resolves to A's object.
- **7 Worker resilience (PARTIAL).** A second exam worker (`p11t2-exam-w2`, same image and env, on `examio-internal`)
  ran beside `examio-exam`. S3 backend paused 15 s (> 10 s worker deadline, < 120 s lease). The first send failed at the
  deadline (`DEADLINE_EXCEEDED after 10.003s`, logged by `examio-exam`), `next_attempt_at` was +60 s, the retry at
  +60 s succeeded and the table drained at +56 s. The shim saw exactly 2 `POST /?delete` requests for the task, never
  concurrent. The first request reached S3 after the worker had timed out (the delete is idempotent: at-least-once). Limits:
  the second worker logged no send for this task, so "two workers, no double-send" was not stressed; the lease
  expiry path is covered only by `r2-delete.e2e-spec.ts` (passing with the workers paused). Poison key: not
  reproducible live (the nginx stand-in cannot inspect the DeleteObjects body); covered by the unit spec
  `r2-delete.worker.spec.ts:100` ("partial result: deletes succeeded keys, fails only the poison key with backoff").
  The final check of the run crashed on `docker logs --no-color` (unsupported flag): harness.
- **8 Regression (PASS).** Smoke through the gateway: **18/18 PASS** (same as round 1). UI matrix (second run, clean): **64 PASS, 0 FAIL,
  1 NOTE, exit 0**. The NOTE is the round-1 item: "Từ đã lưu" has no match in examio-fe src. Check 6 passes:
  the fixture session (whitelisted student, `startTime` moved to 1 h ago in the scratch DB; see `ui/fixtures2.cjs`)
  starts into `/exam-session/<id>/quiz`. The first matrix run exited 1 only because the copied `ui/ev` directory was
  missing when it wrote its JSON; its 64 checks were already PASS.
- **9 ai-service (PASS).** Compose health `healthy` (`curl localhost:3000/health`). No `AI_DB_POOL_*` override set:
  in-process pool sizes GENERATION 6, GRAPH 6, ENTITY 4, OCR 6, VECTOR 6, sum 28, under the `ai_svc` role limit of 40.
  `AI_RUNTIME_DDL=false`, `DB_SEARCH_PATH=exam,extensions`. Zero `CREATE TABLE|INDEX`, `ALTER TABLE` lines in the logs.
  The guard's "Skipping runtime DDL" line was not observed (round-1 caveat unchanged).

### Findings (new in round 2)

| # | Where | Finding | Severity | Status |
|---|---|---|---|---|
| F9 | `deploy/compose/seed.yml` (default profile) + `docker compose up -d --wait` | `up --wait` returns exit 1 on a fresh stack although all services are healthy: `container examio-seed exited (0)`. Reproduced on two fresh bring-ups. Repeat `up -d --wait` exits 0. Expected 0. | Medium (ops/CI) | OPEN |
| F10 | `examio-be/apps/admin-service/prisma/seed.ts` (`seedAdminAudit`, `--dev`) + `deploy/compose/seed.yml` | Every `docker compose up -d` re-runs the seed (a plain `up -d` with no config change restarted the exited one-shot). `seedAdminAudit` writes 20 new `AdminAudit` rows per run (random ids, no upsert): 20 → 40 → 60. Other seeded tables stay stable. The seed also runs in the production compose file, creating dev users, with no environment guard. | Medium (data hygiene) / High if this stack runs in production | OPEN |
| F11 | `examio-be/libs/common/src/utils/r2-key-from-url.ts:15-16` | Owner check on thumbnail URLs does not normalise the path. `.../flashcardset-thumbnails/<B>/%2e%2e/<A>/<file>` passes (`split('/').includes('..')` sees literal `%2e%2e`) and B's set is created (201). A browser normalises `%2e%2e`, so the URL loads A's object (probe: 70 bytes, same as A's direct URL). Expected 400. No direct deletion of A's object (B's delete computes the literal key). Impact: B's set can display A's object, and A's later delete breaks it. | Medium-low (authorisation bypass, integrity) | OPEN |
| F12 | `examio-be/libs/common/src/utils/r2-owned-key.ts:35` (gate at `apps/exam-service/src/modules/ai/ai.service.ts:1010`) | Same gap for `keyR2`: `ai-teacher/<A>/%2e%2e/<B>/victim-object.png` is accepted (201), a `UserStorage` row is created and 1 credit is charged. Expected 400. OCR then failed with `Refusing to download from non-https URL scheme: 'http'` (stand-in is http). Static reading: `download_file_from_r2` (`ocr_service.py:388`) re-quotes the path with `quote(path, safe='/')`, which turns `%2e` into `%252e`, so the production OCR fetch would not traverse. Not verified live. | Medium-low | OPEN |
| F13 | `apps/exam-service/src/modules/ai/ai.service.ts:1030` (`deductCredits` before processing) | The credit is charged at upload time and the row is created; when OCR fails the row is `FAILED` and the balance stays charged (150000 to 150999). No refund path was seen in the failure branch; not exhaustively checked. | Observation | OPEN (verify) |
| F14 | `examio-be/deploy/README.md:338` (`docker compose up -d --scale exam=2`) | `compose/exam.yml:25` pins `container_name: examio-exam`, so scaling to 2 cannot work as documented. Static only, not executed (it would recreate the exam container). | Low (docs) | OPEN |
| F15 | `apps/ai-service/src/db_settings.py:40-45` | `AI_DB_POOL_MAX_<NAME>` has no upper bound; overrides can exceed the `ai_svc` role's `CONNECTION LIMIT 40`. | Observation | OPEN |

Harness-only (not product): the scratch copy lacked generated code and some CI env (fixed); the superuser name (`examio`,
not `examio_super`); the first stand-in run lacked a bucket-named DNS alias for virtual-host S3 calls
(`examio-p11t2.s3stub`, fixed by attaching the shim with that alias); the seeded-user password comes from
`SEED_PASSWORD` / `ADMIN_DEFAULT_PASSWORD` (seed.ts:26) and was set to `ChangeMe123!` for the API probes; the UI
matrix's copied `ev` directory was missing on the first run. The `deploy_default` network predates this run
(created 2026-10-18, no containers) and was left alone.

### Teardown

`down -v --rmi local --remove-orphans` exit 0. Stand-ins (`p11t2-s3backend`, `p11t2-shim`, `p11t2-turnstile`) and
forwarders removed, `p11t2-stubnet` removed. Scratch TLS key and cert deleted, scratch `deploy/.env` and
`exam-w2.env` deleted, the `node_modules` symlink unlinked (the real repo's `node_modules` untouched). No `examio-*`
or `p11t2` containers, networks, volumes or images remain.

### Status

**DONE_WITH_CONCERNS.** Passing: builds (12/12), migrations (4/4), seed in-stack (F4 fixed), isolation, drift, CI
db-isolation (36/36 with live workers paused), R2 durable delete with owner-scoped keys (23/23), smoke (18/18), UI
matrix (64/0/1 NOTE), ai-service. Open: F9, F10 (both operational), F11 and F12 (traversal past the owner check: fix at
the key parser, e.g. reject `%` or decode before the prefix check), F13 (verify refund path), F14, F15. Item 7 only
partly verified: no live poison key, and the second worker did not send.

## Re-temper 3 (targeted, after final fixes)

Scope: F9, F10, F11, F12 only. Throwaway containers `p11t3-pg` (pgvector pg16 with `deploy/postgres/init/01-service-schemas.sh`), `p11t3-redis`, `p11t3-rmq`, all bound to 127.0.0.1, all removed at the end. Every app command ran under `env -i` with a scratch env built from a freshly generated throwaway password set. The real `deploy/.env` was never opened; the compose check ran on a scratch copy with a dummy `.env` and dummy JWT keys from `scripts/gen-jwt-keypair.sh`. Raw rows: `phase-11/temper-raw.json`, command text prefixed `re-temper-3:`. The `user-enrichment` note below is the only unexplained result.

### Results per item

| Item | Result | Evidence |
|---|---|---|
| **F11** thumbnail traversal (`%2e%2e`, `%2E%2E`, `//`, tab/newline segment, upper-case scheme and host, explicit `:443`) on flashcard create (JSON and multipart) and update | **PASS** | `r2-cross-user.ownership.e2e-spec.ts`: 400, no row, row keeps its thumbnail. Control: same route accepts an own canonical key (201/200). Unchanged legacy value round-trips on update (2xx). |
| **F11** avatar variants (`%2e%2e`, `%2E%2E`, `//`, tab/newline, upper host, `:443`) | **PASS** | `user-update.writer.spec.ts`: all rejected, nothing enqueued. Legacy unchanged value still accepted (existing case). |
| **F12** AI `keyR2` traversal (`%2e%2e`, `%2E%2E`, `//`, tab/newline) on `POST /ai/upload` | **PASS** | 400 whose body names `keyR2`; no `UserStorage` row; `FinanceClientService.deductCredits` spy not called. |
| **F10** admin seed run twice | **PASS** | `AdminAudit` 0 to 20 on run 1, still 20 after run 2 (exit 0 both). Page flags 9. |
| **F9** compose seed profile (config only) | **PASS (config level)** | Default `config --services`: no `seed`. `--profile seed config --services`: `seed` present. Default `config --format json`: 15 services, no `seed`. Live `up --wait` was NOT re-run; the config check does not prove the exit-code fix in a live stack. |

### RED reasoning and the pre-fix check

The pre-fix parser was not run against the repo (no stash or checkout). Instead a scratch-only reconstruction of the pre-fix logic was mapped in through a scratch Jest config (`p11t3/red/`, repo untouched). The pre-fix logic rejected only a literal `..` segment and had no canonical-key or normalisation step. The new cases then fail for the stated reason:

- **10 of 15** new cases fail against the reconstruction: the `%2e%2e` and `%2E%2E` thumbnail create and update, all three AI `keyR2` cases, the combined normalisation case, the AI tab/newline case, and the thumbnail `//` case. The legacy round-trip passes on both, as it should. Each is accepted (201 or 200) where 400 is expected, so the row or upload gets created.
- The combined normalisation case (tab/newline segments, upper-case scheme and host, `:443`) fails on the reconstruction. It stops at its first variant (the tab segment), so it does not show which of the four variants the pre-fix code accepts. The `:443` and upper-case host variants are covered only by the hardened tree, where they pass.
- H2 and H3 controls still pass on the reconstruction, so the RED is specific to the traversal cases.

### Full run results (hardened tree)

- Exam e2e folder (`test/jest-e2e.json`, `--runInBand`): **220/220** on two consecutive runs, exit 0 each.
- `libs/common/src/utils`: **24/24**, exit 0. Auth `user-update.writer` spec: **9/9**, exit 0.
- Static on the repo: `yarn typecheck` exit 0; `TZ=UTC yarn test` exit 0 (1962 passed, 5 skipped, 0 failed); `yarn check:ownership` exit 0 (0 violations); `yarn check:deps` exit 0 (799 modules); `node --test deploy/compose-topology.spec.cjs` exit 0 (19/19).

### Harness-only faults (fixed in scratch, not product)

- First R2 e2e attempt exited 1 with `AUTH_TOKEN_URL is required`. My scratch env was passed to `env -i` as one word under zsh. Re-run with inline expansion, exit 0.
- The study-room `authz_changed` tests failed with `AggregateError` because the scratch env lacked `RABBITMQ_AUTH_URL`; `amqp.connect(undefined)` throws. Added the URL (same throwaway broker user). Study-room 8/8, exit 0.

### Open

- **`user-enrichment.ownership.e2e-spec.ts` (unexplained, not reproduced).** It failed once, in the first full-folder run (exit 1, 3 failures counting the two study-room ones). That log shows no assertion text, so the cause is unknown. It passed solo (6/6) and in both later folder runs (220/220 each). Its spec does not touch the broker, so the broker gap does not explain it. Treat as a flake until a capture shows the failure text. Suggest a repeat run with `--testNamePattern` on that suite and a saved full log.
- F9 live `up --wait` exit code is not re-verified here (config-level only). F10 seed is now idempotent for `AdminAudit`. The compose seed is still re-run by plain `up` only if the one-shot is restarted, which the profile change avoids.
- F13, F14, F15 unchanged (not in this brief).

### Status

**DONE_WITH_CONCERNS.** F9 (config level), F10, F11 and F12 pass on the hardened tree, and the RED reconstruction fails for the expected reasons. Concerns: one unexplained `user-enrichment` failure in run 1 (not reproduced in four later runs), and F9's live exit-code fix still needs a live `up --wait` before it is called closed.

## Re-temper 4 (final live: up --wait + opt-in seed)

Scope: the live acceptance criterion after the seed became opt-in (profile `seed`): `docker compose up -d --wait` from an empty volume exits 0, every `<svc>-migrate` and `rabbitmq-defs` exits 0, the seed does not start, all APIs healthy; `--profile seed run --rm seed` exit 0 with counts matching, twice. Method as Re-temper 2: scratch rsync copy of `examio-be` (exclusions as before, `*.env.example` kept, `*.env` and `.env.*` excluded; post-copy find: 0 real env files), dummy `deploy/.env` from `gen-env.cjs` in the scratch copy only (`ADMIN_DEFAULT_PASSWORD` set to the scratch smoke password), scratch CA and Turnstile stub on `examio-internal` only (the CA is mounted into the auth container only, via a scratch override), s3proxy + nginx path-style shim as R2, `MAIL_TRANSPORT=json`, sequential builds, project `p11t4`, loopback-only published ports. The real repo deploy dir was never used for compose. Raw rows: `phase-11/temper-raw.json`, prefix `re-temper-4:`. Logs stay in the scratch dir.

### Results

| Item | Command (abridged) | Exit | Result |
|---|---|---|---|
| 1 | scratch copy + env generation (dummy) | 0 | 0 real env files in copy |
| 2a | `build` x12, one at a time (auth/finance/admin/exam-migrate, auth, finance, admin, exam, gateway, r2, ai, seed) | 0 x12 | all built |
| 2b | `up -d --wait --wait-timeout 1500` from an empty volume (0 p11t4 volumes before) | **0** | **PASS** |
| 2c | ps assertion (`ps-check4.cjs`, `ps -a --format json`) | 0 | 15 services; `auth/finance/admin/exam-migrate` and `rabbitmq-defs` all exited 0; no `seed` container; auth, finance, admin, exam, gateway, r2, ai, postgres, redis, rabbitmq running and healthy. 0 violations |
| 3a | `--profile seed run --rm seed` (run 1) | **0** | PASS |
| 3b | counts after run 1 | 0 | page_flags 9, subject_categories 4, subjects 15, word_family_categories 10, users 8, wallets 7, admin_audit 20 |
| 3c | `--profile seed run --rm seed` (run 2) | **0** | PASS |
| 3d | counts after run 2 | 0 | identical to 3b; admin_audit still 20 |
| 4 | plain `up -d --wait --wait-timeout 900` (no profile) | **0** | PASS; seed not started (`run --rm` removed its container; ps check: no `seed` service) |
| 4b | counts after plain up | 0 | identical; admin_audit 20 |
| 4c | ps-check after plain up | 0 | 0 violations |
| 5a | `migrate-status` x4 | 0 x4 | `Database schema is up to date!` for auth, finance, admin, exam |
| 5b | isolation (`iso.sh`) | 0 (script) | 6 expected denials, each `permission denied for schema` (content_svc and exam_svc to auth; auth_svc to finance and to create in public; ai_svc DDL on exam and read on auth). Allowed reads succeed (auth outbox via search_path, ai_svc reads exam). Privilege matrix printed. Per-step exit 1 is the expected denial, not a fault |

Harness notes (not product): the first copy dropped `*.env.example` because the exclude `.env.*` also matched it (fixed, re-copied). The compose stack is project `p11t4`; the stand-in bucket name is `examio-p11t2` (the value comes from the scratch env, not a real config).

### Live checks (after the bring-up above)

| Item | Exit | Result |
|---|---|---|
| 5c smoke through gateway (`smoke.cjs`) | 0 | **18/18 PASS**, 0 FAIL |
| 5d cross-user, traversal and variant probes (`xuser4.cjs`, B presents A's thumbnail) | 1 | **15/16 PASS**, 1 FAIL (below) |
| 5d (a) encoded `%2e%2e` traversal into A's prefix | 0 | 400 `VALIDATION_FAILED`: PASS |
| 5d (b) upper-case R2 host (`EXAMIO-P11T2.S3STUB`) | 0 | 400 `VALIDATION_FAILED`: PASS |
| 5d (c) explicit default port (`:80` on an `http` base) | 0 | **201 CREATED: FAIL** (expected 400). See F16. |
| 5d control: canonical A thumbnail URL | 0 | 400: PASS |
| 5e B own upload, then delete set | 0 | 201, key `flashcardset-thumbnails/<B>/...` present in S3, delete 200, object gone after 4.0 s (worker, owner-scoped key): PASS |
| teardown (`down -v --rmi local --remove-orphans`, stand-ins, `examio-internal` network removed, scratch TLS and `.env` deleted) | 0 | no `examio`/`p11t4` containers, volumes, networks or images left |

### Finding (new, open)

| # | Where | Finding | Severity | Status |
|---|---|---|---|---|
| F16 | `examio-be/libs/common/src/utils/r2-key-from-url.ts:42` (origin compare) and `examio-be/libs/common/src/utils/r2-owned-key.ts:59-60` (`isForeignR2Url`), gate at `examio-be/apps/exam-service/src/modules/common/owned-thumbnail.ts:19` | A URL on the same hostname as `R2_PUBLIC_URL` but with a different port (`:80` vs `:8080`) gets `null` from `rawR2Key` (origin mismatch), so `isForeignR2Url` treats it as external and does not reject it. B created a set with `http://examio-p11t2.s3stub:80/flashcardset-thumbnails/<A>/...` and got 201; the row stored that URL. Expected 400. Impact in this stack: low. Nothing listens on :80 in the shim (connection refused), so the URL does not serve A's object here. The gap is real because the guard's doc says "a URL on our host" is foreign. Not probed: the avatar path (`user-update.writer.ts:63`) uses the same check, so it probably has the same gap. Fix: treat same hostname with a different port as foreign, or compare host and path and not origin. | Low-medium (guard gap, defence in depth) | OPEN |

Notes: the (c) probe's base is `http` on `:8080`, so the "default port" is `:80`, a different origin. The `:443` case on an `https` base was covered in re-temper 3 (passing). Not checked here: whether the round-3 specs include a different-port case on the same host.

### Status

**DONE_WITH_CONCERNS.** Passing live: builds 12/12 exit 0; `up -d --wait` from an empty volume exit 0 (F9 live: closed); every `<svc>-migrate` and `rabbitmq-defs` exit 0, no seed container, all APIs healthy; opt-in seed exit 0 twice with identical counts (admin_audit stays 20, F10 live: closed); plain `up -d --wait` exit 0 with the seed not started; smoke 18/18; migrate status up to date for 4 services; isolation denials as expected; own thumbnail delete removes the owner-scoped object in 4 s; traversal (a) and upper-case host (b) rejected. Open: F16 (c). Re-run xuser4 (c) after the fix. Teardown complete.

## Final verification set (gate input)

`temper-raw.json` keeps every round (initial, re-temper 2/3/4, incl. the failures that found F1, F4, F9–F12 and F16). `temper-results.json` is built from `temper-final.json`: the `final:` static rows run by the coordinator on the FINAL code (after the F16 fix: typecheck, build:all, full yarn test 1964 passed, check:ownership 0, check:deps 0, compose-topology 19/19, libs/common utils 26/26), every passing `re-temper-4:` row (live empty-volume `up -d --wait` exit 0, migrate x4 + rabbitmq-defs exit 0, no seed container, opt-in seed run twice with identical counts, second `up --wait` exit 0, smoke 18/18, migrate status x4, isolation, own upload + worker delete) and the passing `re-temper-3:` e2e/seed rows (exam e2e 220/220 with the F11/F12 variants, admin seed twice). Excluded: rows 269–272 and 276–277 are the deliberate `permission denied` psql probes inside iso.sh (expected exit 1; the iso.sh aggregate row passes); row 281 (xuser4 15/16) found F16, which is fixed after the live run and proven by the unit spec on the exact gate function (`isForeignR2Url`) — the live re-probe of that one variant is not re-run.
- Human sign-off: given 2026-10-23 ("Ký duyệt + commit"); riskGate.humanSignedOff=true, hard gate re-run exit 0.
