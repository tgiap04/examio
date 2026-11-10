# Phase 16 temper runs (deploy independence + cutover rehearsal)

Branch `refactor/microservice-rbac`, HEAD `2137847` plus the uncommitted phase-16 changes. Raw rows: `evidence/phase-16/temper-raw.json` (176 rows, real exit codes; superseded rows carry `[harness-invalid] superseded by ...`).

## Method

- Work was done in a scratch root (`.../scratchpad/p16t`). The real `kmaedu-be/deploy` and `kmaedu-fe` were never composed; the real `.env` files were never opened. The stack ran from a copy of `git ls-files -co --exclude-standard` (no `.env`), with throwaway values from `ci-dummy.env.sh` plus `scripts/gen-jwt-keypair.sh` and `scripts/gen-service-secret.sh`.
- Compose project `p16new` (new), `p16old` (old main). Images built one at a time. No GHCR access: `docker compose pull` was replaced by a shim (`DOCKER=` for `deploy-service.sh`) that adds `--ignore-pull-failures`; a missing local image still fails at `up`.
- R2: a node S3-compatible stub (`r2stub`, logs method/path/status only) added through a scratch `docker-compose.override.yml`. Turnstile: Cloudflare always-pass test secret (`1x000...AA`), token `XXXX.DUMMY.TOKEN.XXXX`. Mail: `MAIL_TRANSPORT=json`.
- Smoke accounts: registered through the API, verified by SQL (`UPDATE auth."User" SET "isVerified"=true`, the runbook appendix allows it because the mail templates are missing, F1), TEACHER set through `PUT /api/v1/admin/roles/users/:id/role`.
- Load: a node fixed-rate GET generator (`k6` is not installed); socket.io probe on `/ws/study` (joined to a room).
- Deviations from the runbook text: the FE port is pinned to `127.0.0.1:6368` in the scratch copy (F11); the admin password was not changed (step 9); the in-container file `/tmp/restore.dump` was left in `kmaedu-postgres` (see the refused command below), removed with the container at teardown.

## Stage 1: static

| Check | Exit | Result |
|---|---|---|
| `bash scripts/changed-services.test.sh` | 0 | all selection fixtures pass (vocabulary-only, finance+content waves, libs, docs-only) |
| `bash scripts/lint-migrations.test.sh` | 0 | expand-safe passes, DROP COLUMN fails, contract label passes |
| `bash deploy/deploy-service.test.sh` | 0 | DRY_RUN fixtures incl. no `migrate resolve` / `db push` |
| `node --test deploy/compose-topology.spec.cjs` | 0 | 0 failing |
| `node --test deploy/rabbitmq/render-definitions.spec.cjs` | 0 | 0 failing |
| `shellcheck` on deploy + scripts `.sh` (8 files) | 0 | clean |
| `actionlint .github/workflows/deploy.yml` | 0 | clean |
| `actionlint .github/workflows/ci.yml` | 1 | 12 shellcheck findings (SC2018/SC2019 info, SC2034 warning). The same 12 messages exist on HEAD's ci.yml (only line numbers moved). Not new. |
| `yarn typecheck` (11 tsc) | 0 | clean |
| `yarn check:deps` | 0 | 1071 modules, 4198 dependencies, 0 violations |
| `yarn check:ownership` | 0 | 0 violations |
| `yarn build:all` (sequential nest builds) | 0 | 42 s. `dist/apps` still lists stale `exam-service`, `codecraft-be`, `ocr-service` (F12) |
| jest (`npx jest --forceExit`, no yarn wrapper) | 0 | 244 suites passed, 1 skipped; 2480 tests passed, 6 skipped. Single run, not repeated for flakiness. |
| `pytest src/backend/tests -q` (ai-service) | 0 | 114 passed, 58 skipped (infra). Includes `test_switch_never_allows_link_local`. |
| `yarn build` / `yarn lint` / `yarn test` (FE) | 0 / 0 / 0 | build ok; lint 0 errors, 29 warnings; vitest 128 passed |

Carried fixes checked statically: `libs/redis` has no `ioredis/` deep import (grep empty); regenerate admits before `deleteFrom` (`ai-chat-answer.service.ts:28,44`, `ai-chat-stream.service.ts:60,75`); the turn service sends `systemPrompt`/`modelType` on both the stream and non-stream paths (`ai-chat-turn.service.ts:76-77`).

## Stage 2: images

Built one at a time, `docker build -f deploy/Dockerfile.node --build-arg SERVICE=<dir> -t ghcr.io/tgiap04/kmaedu-<key>:p16t .`, then ai, then FE.

| Image | Size (bytes) | Note |
|---|---|---|
| kmaedu-admin / ai-chat / assessment / auth / content / document / finance / gateway / r2 / study-room / vocabulary | 176.3 to 176.6 MB each (about 168 MiB) | target < 250 MB met |
| kmaedu-ai (`apps/ai-service/Dockerfile`) | 477049061 (about 455 MiB) | |
| p16new-frontend (FE, `VITE_API_URL=/api/v1`, Turnstile test key) | 28357825 (about 27 MiB) | |

The first Node build pass used the working-tree context, where `migration.sql` is mode 0600 (F2). The Node images were rebuilt from a normalized context (`a+r`, execute bits kept), the same as a clean checkout. The reconciled rows say so.

## Stage 3: new stack from empty volumes

| Runbook step | Exit | Result |
|---|---|---|
| 4 render RabbitMQ definitions, non-empty | 0 | `rabbitmq-defs` one-shot |
| 5 infra `up --wait`, 10 `*_svc` roles, 10 broker users, no `exam.*` queue | 0 | pgvector installed |
| 6 `<svc>-migrate` x10 in order | 0 | all exit 0 (second pass on the rebuilt stack too) |
| 7 `ROLE=seed SEED_PROFILE=prod` admin, vocabulary, ai-chat | 0 | `admin.PageFeatureFlag` = 9 rows |
| 8 `deploy-service.sh` auth, finance, r2, admin, content, assessment, study-room, vocabulary, document, ai-chat, ai, gateway | 0 | auth first, gateway last (runbook order, not the wave order, F10) |
| 8 FE `docker compose up --wait` on `kmaedu-edge` | 0 | FE healthy |
| 9 admin sync (ADMIN_EMAILS) | - | `sync complete: total=1 created=1 errors=0` |
| 10 `yarn smoke:cutover` | 0 | 18 PASS, 0 FAIL (run on the first stack and again after the rebuild from empty volumes) |

`docker compose ps` (rebuilt stack): all 17 running containers `healthy`, including `ai-worker` (heartbeat) and `rabbitmq-defs` `Exited (0)`. Published host ports: only `kmaedu-frontend 127.0.0.1:6368->80`; backend containers show exposed ports only.

Memory (first stack, `docker stats --no-stream`): gateway-a 65 MiB / 256 MiB, gateway-b 59 MiB / 256 MiB, ai 427 MiB / 1.5 GiB, ai-worker 120 MiB / 2 GiB, content 84 MiB / 512 MiB, auth 106 MiB / 512 MiB, postgres 90 MiB / 1 GiB, rabbitmq 89 MiB / 512 MiB. The sum is about 1.7 GiB.

## Stage 4: deploy-service.sh live

| Test | Exit | Result |
|---|---|---|
| Single-service redeploy: `vocabulary p16t2` | 0 | Only `kmaedu-vocabulary` changed `StartedAt` (line 18 of 19). The other 18 containers unchanged. `VOCABULARY_TAG` pinned to `p16t2`. |
| Failing migrate: `content p16bad` (migration `29990101000000_p16t_broken`, invalid SQL) | 1 | P3018. Alert text "migrate failed ... previous image p16t still running". `CONTENT_TAG` restored to `p16t`. Content `StartedAt` 14:30:58.908 unchanged, still healthy. |
| P3009 halt: `content p16t` after the failed row exists | 1 | P3009 detected; alert "manual resolution ... required"; content still running. The failed row was then deleted by hand (the README's manual step; the script never resolves). |
| Gateway rollout run 1 (`p16t2`, default rateLimit) | 0 | Load invalid (F5): 6821 of 7500 were 429. Window 14:38:00 to 14:38:43 UTC: 2150 requests, 117 2xx, 2033 429. Zero 5xx, zero transport errors. Socket: disconnect 14:38:37.824, reconnect 14:38:38.476 (0.65 s). |
| Gateway rollout run 2 (`p16t3`, default limit raised in a scratch image) | 0 | 7500 sent, 4492 2xx, 3008 non-2xx: 3007 are 429 (F5, also before and after the deploy) and 1 is `socket hang up` at 14:41:51.536Z on `/api/v1/status` inside the gateway-a window. Gateway 5xx: 0. nginx 502/503: 0. Socket: disconnect 14:42:21.702Z (gateway-b replacement), reconnect 14:42:22.361Z (0.66 s, within 10 s). `room:joined` ack was not observed after reconnect (the probe did not confirm room membership). |
| `grep -c 'migrate resolve\|db push' deploy/deploy-service.sh` | 0 | 0 |
| `grep -c down deploy/deploy-service.sh` | 1 | the single hit is a comment on line 16 ("never runs `down`"); no `compose down` command |

## Stage 5: env isolation

Names only, per container (`docker inspect` env, names piped through `sed`). Credential families: `PAYMENT_*` only on finance; `GOOGLE_*`, `EMAIL_*`, `REFRESH_TOKEN_ENC_KEY`, `JWT_PRIVATE_KEY`, `SERVICE_CLIENTS` only on auth; `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` only on r2; `GEMINI_*` only on ai and ai-worker. `POSTGRES_PASSWORD` is on postgres only. `R2_PUBLIC_URL`, `R2_ALLOWED_HOSTS`, `R2_ALLOW_PRIVATE_HOSTS`, `R2_GRPC_URL` are non-secret wiring and appear on other services; they are not credentials.

Missing env file: `env/finance.env` moved aside, `docker compose config --quiet` exit 1 ("env file ... not found"); file restored, exit 0.

## Stage 6: carried fixes (live)

| Fix | Exit | Result |
|---|---|---|
| ai-chat regenerate admission before delete | 0 | Teacher: 5 sends 201, 6th 429 `RATE_LIMITED`. Regenerate of latest user message: 429 `RATE_LIMITED`. Messages before 10, after 10, same ids. PASS. A student has no ai-chat permission (403), so only the teacher run is evidence. |
| ai-chat non-stream `systemPrompt`/`modelType` | - | Code path only (`ai-chat-turn.service.ts:76-77`, shared by both paths). Not checked live (needs AI). |
| OCR refuses link-local always | - | `test_switch_never_allows_link_local` (parametrized, passed in stage 1). `ocr_service.py:148-160`. |
| libs/redis no ioredis deep import | - | Static: none. |
| ai-worker heartbeat healthy | 0 | Healthy from start. |
| ai-worker turns unhealthy when broker stops | 0 | FAIL. RabbitMQ stopped 14:47:38; ai-worker still `healthy` at 14:51:11 (3.5 min); heartbeat file touched 14:50:54 while reconnect errors ("Name or service not known") were logged. Cause: F3. |
| ai-worker recovers after broker start | 0 | rabbitmq healthy 14:51:50; broker lists user `ai` connected; ai-worker healthy; no errors after 14:51:39. PASS. |

## Stage 7: cutover rehearsal with rollback

| Step | Exit | Result |
|---|---|---|
| Old stack from `git archive main` built one service per command (`docker compose -p p16old build <svc>`, 9 images) | 0 | `ai` 267 s, `gateway` 135 s, rest 30 s |
| Old stack up | 1 then 0 | `up -d --wait` exits 1 on main (F8), `up -d` converges. Old finance initially crashed on `JWT_SECRET` too short (throwaway secret, harness). |
| Sample data on old: register (201), verify (SQL), login (201), `POST /api/v1/quizsets` (201), list (count 1, title present) | 0 | via old gateway port 6369 |
| Step 1 `pg_dump -Fc` | 0 | `kmaedu-pre-cutover-20261027-2205.dump`, 133151 bytes |
| Step 1 `pg_restore --list` on the copied file | 0 | TOC 307 entries, 98 TABLE, `QuizSet` data present (the stdin variant printed only the header and is excluded) |
| Step 1 `:pre-cutover` tags on 9 old app images | 0 | same image ids as `:latest` |
| Step 2 drain check | 0 | no queues with messages |
| Step 2 `docker compose down` (no `-v`) | 0 | |
| Step 3 volumes | 0 | Real names are `p16old_postgres_data`, `p16old_redis_data`, `p16old_rabbitmq_data` (F7); removed |
| Steps 4 to 10 on the new stack from empty volumes | 0 | see Stage 3 (volumes `p16new_*` were removed first, then recreated) |
| Rollback: new stack down, FE down, `p16new_*` volumes removed | 0 | no `p16` volumes left |
| Rollback: old postgres on an empty volume, `pg_restore --clean --if-exists` the step-1 dump | 0 | |
| Rollback: old stack `up -d --no-build` | 0 | all healthy |
| Rollback check: old account logs in through the old gateway, quiz set listed | 0 | login 201; list 200, count 1, title present |

## Findings

Severity: Blocker (cutover cannot succeed), High, Medium, Low, Info.

| ID | Severity | Where | What | Repro |
|---|---|---|---|---|
| F1 | Blocker | `kmaedu-be/deploy/Dockerfile.node:101-105` (runtime-core copies `dist`, `libs`, tsconfig, `stage`; not `templates/`). `kmaedu-be/libs/common/src/services/mail.service.ts:15-20` looks for `process.cwd()/templates/<name>.ejs`. HEAD `deploy/Dockerfile` has the same gap; `main`'s root `Dockerfile:77` had `COPY templates ./templates`. | Every image sends mail through `MailService`, which cannot find `welcome`, `verify-account`, `reset-password`, `change-password` templates. Register still returns 201, so the failure is silent to the caller. Users cannot verify or reset accounts in production. | `POST /api/v1/auth/register` then `docker logs kmaedu-auth \| grep "Template not found"` ("welcome.template.ejs. Tried paths: /app/templates/..."). `docker run --rm --entrypoint sh ghcr.io/tgiap04/kmaedu-auth:p16t -c 'ls /app/templates'` gives "No such file". |
| F2 | Medium | `kmaedu-be/deploy/Dockerfile.node:58-66` (`stage-service` `cp -r` keeps the source mode). | The build copies context modes verbatim. On this laptop `migration.sql` is `-rw-------` (git index says 100644). The image keeps `root:root 0600`, `USER node` cannot read it, and `prisma migrate deploy` reports P3015 "Could not find the migration file" (misleading). A clean checkout is not affected. Fix: `COPY --chmod=a+rX` or `RUN chmod -R a+rX` in the stage step. | `docker run --rm --user node --entrypoint sh ghcr.io/tgiap04/kmaedu-auth:<image-from-0600-context> -c 'head -c1 /app/apps/auth-service/prisma/migrations/*/migration.sql'` -> Permission denied (repro on the first build, now replaced). |
| F3 | High | `kmaedu-be/apps/ai-service/src/backend/messaging/consumer.py:74-76` (`is_connected` = `connection is not None and not connection.is_closed`); `worker.py:59` (heartbeat gated on it); `heartbeat.py` (touches the file every 30 s while healthy). | aio-pika `connect_robust` keeps `is_closed` False while it retries. During a broker outage the heartbeat keeps refreshing, so the compose healthcheck (`find ... -mmin -2`) never fails. The carried-fix acceptance ("turns unhealthy when the broker is stopped") fails. | `docker stop kmaedu-rabbitmq`; `docker inspect -f '{{.State.Health.Status}}' kmaedu-ai-worker` stays `healthy` for 3.5 min (14:47:38 to 14:51:11); `docker logs kmaedu-ai-worker` shows "Name or service not known" retries. |
| F4 | Medium | `kmaedu-fe/nginx.conf:68-69` (`proxy_next_upstream error timeout http_502 http_503`, retries only upstream errors), `kmaedu-be/deploy/compose/gateway.yml` (`stop_grace_period` / recreate). | One client-visible `socket hang up` on a GET during gateway-a recreate and nginx reload (run 2, 14:41:51Z). Not a 5xx. Likely an idle keep-alive connection closed by nginx during reload (client keep-alive race) but not proven. Run 1 had 0 transport errors, so this is intermittent. Criterion 6 literal ("0 non-2xx") is not met. | `node loadgen.cjs` at 50 rps for 150 s with `./deploy-service.sh gateway <tag>` at t+15 s; count `ERR:` rows in the load log. Reproduced 1 in 2 runs. |
| F5 | Medium | `kmaedu-be/apps/gateway-service/config/routes.yaml:262` (`defaultRateLimit` 100 per 60 s per client IP; `rateLimits` entries for `status`/`config-pages`/`auth/me` fall through to it). `apps/gateway-service/src/pipeline/guard-chain.ts:86` (deny path). | A single-IP load test cannot exceed 100 requests/min without 429. Denials are not logged by the request logger (gateway logs had 0 `statusCode":429` lines while clients saw 429). After raising the default in a scratch image, 429s still appeared at a steady ~16 to 17/s through the rollout and stopped after the load. Source not attributed (OPEN). | `for i in $(seq 1 400); do curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6368/api/v1/status; done \| sort \| uniq -c` (default image: 429 after about 100). |
| F6 | Medium | `kmaedu-be/deploy/cutover-runbook.md:68` (and the step 0/`.env` sourcing guidance). `kmaedu-be/scripts/gen-jwt-keypair.sh:32` (prints `JWT_PRIVATE_KEY=-----BEGIN ...` unquoted). | `set -a; . ./.env; set +a` fails on the unquoted PEM line: `./.env: line 27: PRIVATE: command not found`. Compose parses the file fine, but the runbook's shell sourcing breaks in the middle of the cutover. | `bash -c 'set -a; . ./.env'` in the deploy dir with a generated key. Fix: quote the value in `gen-jwt-keypair.sh` output, or use `docker compose config --variables`/`--env-file` in the runbook. |
| F7 | Low | `kmaedu-be/deploy/cutover-runbook.md:89` (step 3) and the Rollback section (`docker volume rm deploy_postgres_data ...`). | Volume names carry the compose project name, not `deploy_` unless the checkout directory is named `deploy`. Rehearsal volumes were `p16old_*` and `p16new_*`. | `docker volume ls --format '{{.Name}}' \| grep -E 'postgres_data\|redis_data\|rabbitmq_data'`. Fix: derive the names from `docker volume ls` or `COMPOSE_PROJECT_NAME`. |
| F8 | Low | main's `deploy/docker-compose.yml` (old stack, `kmaedu-migration` and `kmaedu-seed` one-shots). | `docker compose up -d --wait` exits 1 because the one-shots exit 0 (`container kmaedu-seed exited (0)`). `up -d` converges. The new stack is unaffected (`run --rm`). Only matters if the old runbook is reused. | `COMPOSE_PROJECT_NAME=p16old docker compose up -d --wait` (exit 1); `... up -d` (exit 0, all healthy). |
| F9 | Low | `CLAUDE.md` (kmaedu-be notes, "Rate limit 6 tin/phút gói Free") vs `kmaedu-be/apps/ai-chat-service/src/config/ai-chat.constants.ts:33` (`messagesPerMinute: 5`). | Doc says 6, code and the live 429 text say 5. | Send 6 messages as a teacher: 5 x 201, 6th 429. |
| F10 | Low | `kmaedu-be/scripts/changed-services.sh:100-101` (alphabetical sort, gateway last). | Runbook step 8 says auth first; the wave output starts with `admin`. The automated push deploy would start `admin` before `auth` (runtime dependency not verified). I followed the runbook order. | `cd kmaedu-be && scripts/changed-services.sh "" HEAD` -> `"wave2":["admin","ai",...,"auth",...,"gateway"]`. |
| F11 | Low | `kmaedu-fe/docker-compose.yml:21` (`'${FE_PORT:-6368}:80'` binds all interfaces). | The phase says only the FE publishes a port; the default binds 0.0.0.0, so the FE is reachable on the VPS address without Cloudflare. Scratch copy pinned to 127.0.0.1. | `docker ps --format '{{.Ports}}'` shows `0.0.0.0:6368->80/tcp` with the unchanged file. |
| F12 | Low | `kmaedu-be/dist/apps/` (`exam-service`, `codecraft-be`, `ocr-service` stale output) | `build:all` does not clean `dist`. Carried item U1. No effect on the Dockerfile (it copies one service dir). | `ls kmaedu-be/dist/apps`. |
| F13 | Info | `.github/workflows/ci.yml` | actionlint exit 1 with 12 pre-existing shellcheck findings (same as HEAD, line numbers moved). `deploy.yml` now clean (HEAD had 10 SC2086). | `actionlint .github/workflows/ci.yml` on HEAD and on the working tree. |

## Excluded rows

- `s3-roles` first run (exit 1, `set -a; . ./.env` broke on the PEM line; F6). Superseded by the `dc.sh` exec row.
- `s3-broker-users`, `s3-no-exam-queue` (wrong compose project in the shell, "service not running", exit 0 but meaningless). Superseded by `s5-broker-users-new.log` and `s5-broker-queues-new.log`.
- `s3-db-verify`, `s5-roles-new` (psql quoting, exit 1). Superseded by stdin SQL rows.
- `s6-deploy-gateway-p16t2` (run 1 load, rate-limited, F5). Superseded by `s6-rollout-gateway-p16t3-clean.log`.
- `s7-old-up-all` (old finance `JWT_SECRET` too short, exit 1). Superseded by `s7-old-up-nowait.log`.
- `s7-pg-restore-list` (stdin variant; printed only the header). Superseded by the file-based row.
- One junk row `s7-old-sample-teacher` (no payload, no evidence).
- Not in the raw file: a command that was refused by the Claude Code safety check. It removed `/tmp/restore.dump` inside the `kmaedu-postgres` container (`docker exec ... rm -f`) while also restoring the dump. It was not run, so no row exists. The rest of the restore ran without the `rm`. The file was removed with the container at teardown (verified below).

## Not run / deliberate gaps

- GitHub Actions runs and GHCR push/pull: no access (as instructed). `docker compose pull` was replaced by the shim; the GHCR login, manifest check (runbook step 0) and the deploy job were not exercised.
- k6: not installed; a node fixed-rate generator was used instead (`loadgen.cjs`).
- Browser matrix (F10 carried, 64 checks), Google login, SePay plans, AI generation, 20 MB PDF upload, admin log SSE, page-flag toggle, real Cloudflare client IPs in gateway logs, D12 15-minute socket expiry: not run.
- Live verification mail and password-reset mail: blocked by F1 (accounts verified by SQL).
- Admin password change (runbook step 9): not performed.
- Non-stream `systemPrompt`/`modelType` live: not checked (needs AI).
- `ai-worker` unhealthy-on-stop after a fix: not re-run (the fix does not exist yet).
- Repeat runs for flakiness: jest and the load run were each done once (except the two rollout runs). F4 is a single observation in two runs.
- amd64: images were built and run on the host architecture only.
- Telegram alerts: no credentials, so the alert text was checked in the logs only.
- Changed-services selection on live commits: fixtures only (`changed-services.test.sh`), not a live diff.
- Real repo side effects (gitignored, not product code): `yarn build:all` rewrote `kmaedu-be/dist`; `yarn proto:gen` regenerated `libs/contracts/src/generated`. No tracked file was edited, and no git stash/checkout/reset/restore.

## Teardown proof

- Old stack: `COMPOSE_PROJECT_NAME=p16old docker compose down -v --remove-orphans` (exit 0): removed `p16old_postgres_data` and `kmaedu-network`. Its `kmaedu-postgres` container, `/tmp/restore.dump` included, went with it.
- Images removed by name: `ghcr.io/tgiap04/kmaedu-{admin,ai-chat,assessment,auth,content,document,finance,gateway,r2,study-room,vocabulary,ai}:p16t`, `kmaedu-gateway:p16t2`, `kmaedu-gateway:p16t3`, `kmaedu-vocabulary:p16t2`, `kmaedu-content:p16bad`, `p16new-frontend:latest`, `p16old-*:latest` and `p16old-*:pre-cutover` (9 each). Base images were kept (`redis:7-alpine`, `pgvector/pgvector:pg16`, `rabbitmq:3.12/3.13-management-alpine`, `node:22-alpine`); they predate this run.
- After teardown: `docker images | grep -E 'p16|kmaedu'` empty; `docker ps -a | grep -E 'p16|kmaedu'` empty; `docker volume ls | grep -E 'p16|kmaedu'` empty; `docker network ls | grep -E 'p16|kmaedu'` empty.
- Scratch copies deleted with literal absolute paths (`stack`, `old`, `ctx`, `dump`, `headwf`, `bad`, the two cookie files, `old-pw.txt`). Logs (`logs/`), harness scripts (`bin/`) and `findings.txt` are kept under the scratch root; they hold no secrets (values were never printed).
- No background processes left (`pgrep` for socketprobe, loadgen, r2stub, builds, docker-shim: none).

**Status:** FAIL. Criteria 1, 2, 3, 4, 5, 7 and 8 pass under the scope above. Criterion 6 is PARTIAL (one rollout-window client reset in run 2), criterion 9 is PARTIAL (ai-worker does not turn unhealthy on a broker outage, F3). F1 (mail templates missing from every image) blocks the production cutover regardless of the criteria.

## Orchestrator triage and fix re-verification (2026-10-27)

Raw rows 177-187 were added by the orchestrator. `temper-final.json` has 170 rows, all exit 0: 159 tester rows, plus the
3 negative-path rows (88, 89, 95) rewritten as `; test $? -eq 1` assertions, plus 10 green fix rows.

| Finding | Verdict | Action | Proof (raw row) |
|---|---|---|---|
| F1 mail templates missing | product, blocker | `COPY templates ./templates` in runtime-core (`deploy/Dockerfile.node`) | 181: auth image lists 4 templates under /app/templates |
| F2 0600 build-context file | product | `chmod -R a+rX /stage` in stage-service and stage-seeds | 181: 0 files unreadable by others |
| F3 heartbeat healthy with broker down | product | `consumer.py` `is_connected` also requires `connection.connected.is_set()` | 177 (red before), 178, 180: stop gives False, restart gives True after 7 s |
| F4 one client reset in a gateway rollout | open (residual) | not changed; goes to review and user decision | 172 |
| F5 429 under single-IP load | harness (per-IP limit); missing 429 log line is observability, low | none | 172 |
| F6 `. ./.env` breaks on the PEM line | product (runbook) | dump, restore and `\du` run `sh -c` inside postgres; FE step relies on compose reading `.env` | 187 |
| F7 hardcoded `deploy_*` volumes | product (runbook) | `PROJECT` from `docker compose config --format json` | 187 |
| F8 main `up --wait` exits 1 | old code (main) | rollback step says no `--wait`, check `ps` | excluded 110, 111 |
| F9 CLAUDE.md says 6/min, code says 5 | docs | doc-writer | n/a |
| F10 alphabetical wave order | product | `changed-services.sh` puts auth first in each wave, gateway last; runbook follows the printed order | 182 |
| F11 FE port on 0.0.0.0 | needs the user's VPS topology | unchanged (binding loopback could cut production traffic) | n/a |
| F12 stale dist | carried U1 | none | n/a |

Excluded tester rows:
- 6, 8: actionlint findings on ci.yml are pre-existing (12 at HEAD, 12 now; row 186).
- 26: F6, fixed.
- 41: F2, fixed.
- 110, 111: F8.
- 167: F3, fixed.
- 27, 28, 80, 90, 91, 109, 113, 115, 123: harness-invalid rows, as the tester noted.

## F4 re-run (no nginx reload)

Goal: prove the phase-16 gateway rollout causes no client-visible error after the fix (`deploy-service.sh` rolls gateway-a then gateway-b with no `nginx -s reload`; `nginx.conf` adds `proxy_connect_timeout 3s`). Verdict criterion: 0 client transport errors and 0 gateway 5xx / nginx 502/503 caused by the rollout. 429s counted separately (single-IP load against the 100/min default limit).

### Method

- Scratch only: `scratchpad/p16t/p16r/{be,fe}` copies of the working trees (`git ls-files -co --exclude-standard`: 1472 be files, 555 fe files; `find` confirms no `.env` file copied). Real `kmaedu-be/deploy` and `kmaedu-fe` were never composed and no real `.env` was opened.
- `deploy-service.test.sh` ran in the real `kmaedu-be` directory (fake docker and curl): exit 0, 53 checks passed.
- Images, one at a time from the copy: gateway (`p16r`, re-tagged `p16r2`), auth, admin, study-room, FE (`p16r-frontend`). All build exit 0. No `fork failed`.
- Env: `ci-dummy.env.sh` and `mkenv.cjs` (throwaway values). `POSTGRES_USER`/`POSTGRES_DB` set to `kmaedu`. FE port pinned to `127.0.0.1:6368` in the scratch copy (F11).
- Stack (project `p16r`): infra `--wait`; `auth-migrate`, `admin-migrate`, `study-room-migrate` exit 0; `up --no-deps --wait` for auth, admin, study-room, gateway-a, gateway-b, FE. Admin served page flags to the gateway at boot.
- Accounts: teacher and student registered via `/api/v1/auth/register` (201), verified by SQL, teacher role set by SQL (`auth."User".role`; deviation: admin UI not used). Login 201, room created 201, student join 201.
- Rollout: `COMPOSE_PROJECT_NAME=p16r DOCKER=docker-shim.sh bash deploy-service.sh gateway <tag>`. The shim adds `--ignore-pull-failures` (GHCR unreachable, as in stage 4). Tags alternated `p16r2` and `p16r`, so each run recreated both instances.
- Load: `loadgen.cjs` 50 rps for 200 s (about 10000 requests) at `http://127.0.0.1:6368`, paths `/api/v1/config/pages`, `/api/v1/status`, `/api/v1/auth/me` (student cookie). Socket: `socketprobe.cjs` on `/ws/study`, joined to the room. Rollout starts at +15 s.
- Probe fix: the probe waited for `room:joined`, which the server never emits. The join is confirmed by `room:snapshot` (`study-room.gateway.ts:223`). The Stage 4 note "room:joined ack not observed" was this probe bug. Fixed in the scratch probe; every reconnect now shows a rejoin.
- Access token TTL is 15 min (see control). Runs 1 to 3 used a cookie from 15:46:24Z and finished at 15:59:36Z (inside TTL). Run 4 used a fresh login.

### Per-run results (UTC)

| Run | Tag change | Rollout window | Requests | (a) transport | (b) gateway 5xx | (c) client 502/503 (nginx access 502/503) | (d) 429 (separate) | 2xx | Socket drops and reconnect / rejoin | SIGHUP lines | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | p16r to p16r2 | 15:47:58 to 15:48:41 | 10000 | 0 | 0 | 0 (0/0) | 9205 (2001 in window) | 795 (150 in window) | 1: 460 / 479 ms | 0 | PASS |
| 2 | p16r2 to p16r | 15:52:06 to 15:53:19 | 10001 | 0 | 0 | 0 (0/0) | 9267 (3491 in window) | 734 (160 in window) | 2: 692 / 710 ms and 352 / 366 ms | 0 | PASS |
| 3 | p16r to p16r2 | 15:56:01 to 15:56:44 | 10000 | 0 | 0 | 0 (0/0) | 9338 (2033 in window) | 662 (117 in window) | 1: 754 / 776 ms | 0 | PASS |
| 4 | p16r2 to p16r | 16:04:55 to 16:05:38 | 10000 | 0 | 0 | 0 (0/0) | 9316 (2000 in window) | 684 (150 in window) | 1: 706 / 722 ms | 0 | PASS |

- Every run: `deployed gateway@<tag>` with `Recreated`, `Healthy` for gateway-a then gateway-b; `rc=0`; load and socket rc 0.
- Gateway logs (both instances): 0 lines with `"statusCode":5xx` in every run.
- nginx internal retries (not client-visible): `connect() failed (111: Connection refused)` 7, 12, 7, 7 per run, each with an `upstream server temporarily disabled` warn. nginx moved those requests to the other instance.
- Socket reconnect max 754 ms (requirement at most 10 s). Socket drops coincide with each instance stop.
- Run 4 PIDs: nginx master (PID 1) and workers 269 to 278 identical before and after the run. No reload, no worker recycle.
- The FE container `StartedAt` stayed `2026-10-27T15:46:05.862Z` throughout (never restarted).

### Positive control (not part of the verdict)

Same load and socket, but `nginx -s reload` x3 at 16:00:19, 16:00:49 and 16:01:19 instead of a deploy (`bash control-reload-run.sh`, exit 0).
- The reloads appear in `docker logs kmaedu-frontend` as `[notice] signal 1 (SIGHUP) received ... reconfiguring` (3 lines). The default `error_log` level is `notice`, so the reload check is valid. Runs 1 to 4: 0 such lines.
- One client `socket hang up` on `GET /api/v1/status` at 16:00:49.345Z, at reload 2. This is the client-visible reset that F4 suspected, so the harness does detect it.
- Confound: 2002 `401` responses from access-token expiry at 16:01:24.046Z (15:00 after the 15:46:24Z login), and a server-side `auth:reauth` socket disconnect at the same time. The control's socket reconnect data is not usable.

### Verdict

- Acceptance "0 client transport errors and 0 5xx/502/503 caused by the rollout": PASS in 4 of 4 runs.
- Socket reconnect at most 10 s: PASS (max 754 ms).
- `docker logs kmaedu-frontend` shows no reload signal during the rollout: PASS (0 SIGHUP lines in runs 1 to 4; PID check for run 4).
- Limits of this evidence: 4 clean runs are consistent with the fix. They do not prove the event is gone. F4 was seen once in 2 earlier runs, so 4 clean runs would miss it about 1 time in 16 if the rate were still 1 in 2. See F15 and F17 below.

### Teardown proof

- Before: 10 `p16r` containers (9 running, `rabbitmq-defs` exited 0).
- `docker compose -p p16r -f docker-compose.yml down -v --remove-orphans` in the scratch FE dir: exit 0. Same in the scratch backend deploy dir (`--env-file .env --env-file .tags.env`): exit 0.
- `docker rmi` by name: `kmaedu-gateway:p16r`, `kmaedu-gateway:p16r2`, `kmaedu-auth:p16r`, `kmaedu-admin:p16r`, `kmaedu-study-room:p16r`, `p16r-frontend:latest`: exit 0.
- After, each filter empty:
  - containers, label `com.docker.compose.project=p16r`: empty. Name `p16r`: empty. Names `kmaedu-(frontend|gateway-a|gateway-b|auth|admin|study-room|postgres|redis|rabbitmq|rabbitmq-defs)`: empty.
  - volumes, label and name `p16r`: empty.
  - networks, label and name (`p16r`, `kmaedu-edge`, `kmaedu-internal`, `kmaedu-egress`): empty.
  - images, reference `*p16r*` and the six tags above: empty. Dangling images: 0.
- Scratch copies removed by literal path: `.../scratchpad/p16t/p16r` (be and fe copies, deploy env with throwaway secrets, cookie files, room id). `ls` reports no such file. Harness scripts and logs are kept under `.../scratchpad/p16t/` (cookie values were written only to the removed directory and never printed).
- Background processes: `pgrep` for loadgen, socketprobe, rollout-run, control-reload-run, deploy-service, docker-shim, session.cjs, room.cjs: none.
- Real repo: no tracked file edited by this run. The real `deploy-service.test.sh` used a temp dir and a fake docker.

### New findings

| ID | Severity | Where | What | Evidence |
|---|---|---|---|---|
| F14 | Low | `kmaedu-fe/nginx.conf:17-20` (upstream `gw`, `resolve`, `fail_timeout=5s`) | Each gateway instance stop costs nginx 7 to 12 `[error] connect() failed (111)` plus `[warn] upstream server temporarily disabled` lines, while the cached address still points at the stopped container (`resolver valid=5s`). Clients see nothing (retried internally). Log noise only. A drain before stop would remove it. | `grep -c 'connect() failed' scratchpad/p16t/logs/f4-run{1..4}-fe.log` = 7, 12, 7, 7 |
| F15 | Medium (test design) | `kmaedu-be/apps/gateway-service/config/routes.yaml:262` (`defaultRateLimit: { window: 60s, max: 100 }`) | One client IP means about 93% of requests are 429. The 2xx path during the rollout window is sampled by only 117 to 160 requests per run. The zero-error verdict is strong for transport errors (all requests counted) but thin for the 2xx path. Fix: a scratch image or config with a higher limit for a 2xx-dominant pass. | In-window 2xx counts above |
| F16 | Low (harness) | `kmaedu-be/apps/study-room-service/src/modules/study-room/study-room.gateway.ts:223`; `study-room.events.ts:96` | The probe waited for `room:joined`, which the server never emits. The server confirms a join with `room:snapshot`. This explains the Stage 4 "ack not observed" note. Product code is fine. | Probe rejoin now logged on every reconnect |
| F17 | Medium (process) | `kmaedu-be/deploy/deploy-service.sh`, `kmaedu-be/deploy/deploy-service.test.sh` | Both are untracked (`??` in git status), so the no-reload rollout and its test are not in any commit. `kmaedu-fe/nginx.conf` is modified and not committed either. The claim cannot be verified from history or CI until these are committed. | `git status --short -- deploy/deploy-service.sh deploy/deploy-service.test.sh` |
| F18 | Info | auth access token | 15 min TTL confirmed (401 at login plus 15:00). Long socket or load runs must re-login. | Control 401 at 16:01:24.046Z |

### Status

**DONE_WITH_CONCERNS.** Verdict PASS in 4 of 4 runs. Open before this is called closed: F15 (raise the limit in a scratch run to get a 2xx-dominant pass), F17 (commit the script and test so CI can exercise the claim), and more runs if F4 is to be closed for real (earlier rate 1 in 2 runs).

## Review fix round (M1–M4) re-verification

Raw rows 213–220 (orchestrator):
- M2: red spec on the pre-fix code, then green (101 tests).
- M3: live `import_definitions` on RabbitMQ 3.13.
- M4: `jq` metadata.
- M1: script test with no reload.
- The stale heartbeat file is now cleared at worker start.

Tester row 172 (the run with one hang-up, made while the script still reloaded nginx) is excluded from `temper-final`. The "F4 re-run (no nginx reload)" section replaces it: 4/4 runs clean, and a reload-only control reproduces the hang-up. F15 (thin 2xx sample under the per-IP limit) and F14 (nginx connect-refused log noise) are recorded as open Low/Medium items for the user.

## F11 after the user decision (2026-10-28)

The user chose a host reverse proxy (nginx/Caddy) in front of the FE container.

Changes:
- `kmaedu-fe/docker-compose.yml` publishes `${FE_BIND:-127.0.0.1}:${FE_PORT:-6368}`.
- `nginx/cloudflare-real-ip.conf` also trusts `CF-Connecting-IP` from the Docker private ranges.
- The runbook's step 0 requires that the host proxy accepts Cloudflare addresses only.

Proof, raw rows 221-222:
- `nginx -t` passes.
- Live: the header is honoured (203.0.113.7). Without it, nginx logs the bridge gateway 172.17.0.1, which every user would have shared before the fix.
