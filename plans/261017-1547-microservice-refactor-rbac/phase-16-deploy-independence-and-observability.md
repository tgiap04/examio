# Phase 16 — Deploy Independence
<!-- Red Team: RT-11 — observability stack, Redis ACL and Loki-backed admin logs moved to deferred phase 17; title trimmed (file name kept) -->

## Context Links
- [plan.md](./plan.md) · [red-team-changes.md](./reports/red-team-changes.md) RT-11, RT-12 (override the brief) · [planner-brief.md](./reports/planner-brief.md) decisions 13, 15
- [researcher-02 §5 images/CI, §6 compose](./research/researcher-02-migration-mechanics-report.md)
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §4.1, §7.4, §10.1–10.3, §12 P7
- Prior: [phase-05](./phase-05-gateway-rewrite.md) (owns compose networks `edge`/`internal`/`egress` + no data-store host ports, RT-2; owns `real_ip` in `examio-fe/nginx.conf`, RT-15), [phase-11](./phase-11-database-per-service.md) (`deploy/compose/<svc>.yml`, `deploy/env/<svc>.env.example`, `<svc>-migrate`), [phase-17](./phase-17-k8s-readiness.md) (deferred items)
- Current: `/Users/tgiap.dev/devs/examio/.github/workflows/deploy.yml` (push range diff `:53-67`, `docker compose build` + `down` + `up` `:131-139`, Telegram notify `:215-240`), `/Users/tgiap.dev/devs/examio/examio-be/deploy/docker-compose.yml` (gateway `6369:7000` `:40`), `/Users/tgiap.dev/devs/examio/examio-be/deploy/entrypoint-migration.sh` (`db push` `:13`, blind `migrate resolve --applied … || true` loop `:16-22`), `/Users/tgiap.dev/devs/examio/examio-fe/nginx.conf` (`/api/` → `${BACKEND_URL}` `:44-62`, **no `/ws/` location**)

## Overview
- [CARRIED from 11] F15: `AI_DB_POOL_MAX_<NAME>` has no upper bound (`apps/ai-service/src/db_settings.py:40-45`); cap it under the `ai_svc` role limit of 40. Legacy owner-less R2 keys are never deleted (accepted orphans; cleanup job here or on the roadmap). Worker lease contention and poison-key handling are proven by unit/DB e2e only; add live fault-injection R2 proof. amd64 image verification is still owed (the spike ran arm64 only).
- Priority: P1 · Status: Pending · Effort: 2.5d <!-- Red Team: RT-11, RT-12 (was 3d: −obs stack −Redis ACL −Loki admin logs −proto client graph −networks; +deploy waves +migration lint +P3009 halt) --> <!-- Updated: Validation Session 1 - +0.5d cutover runbook + smoke script + local rehearsal --> · Depends on: 12, 13, 14, 15
- Goal: changing one service builds, pushes and restarts only that service, with no full `down`. Per-service images on GHCR tagged by sha. Per-service env. Zero-downtime gateway for non-streaming requests (a/b). Deploys run in waves (changed gRPC servers first) and refuse destructive migrations unless explicitly flagged.
- <!-- Updated: Validation Session 1 - one-time production cutover runbook --> Production is deployed **once**, at the final merge of `refactor/microservice-rbac` (validation Q4/Q5). Until then production keeps running today's build and every milestone is verified on local compose only. The one-time cutover (DB reset) follows the runbook below; the per-service deploy waves are the steady state **after** cutover.
- Out of scope <!-- Red Team: RT-11 -->: Prometheus/Loki/Tempo/Grafana, Redis ACL, admin logs on Loki → [phase 17](./phase-17-k8s-readiness.md) (deferred). Compose network segmentation is done in phase 05 (RT-2); this phase only adds `gateway-a/b` to the existing `edge` network.

## Key Insights
- Nest's default webpack externalizes node_modules, so today every image ships all root deps (incl. opencv/tesseract). This needs a custom `webpackConfigPath` bundling JS deps (spike) [researcher-02 §5]. The P01 Prisma/bundling spike (RT-14) already proved `nest build --webpack` with the Prisma wasm client; reuse its result.
- `@prisma/adapter-pg` + `engineType="client"` means no native engine to copy. The migrate role needs the `prisma` CLI in the image (add `prisma@6.19.x` in the runtime stage only for `ROLE=migrate`, or a dedicated slim migrate target).
- The FE nginx resolves upstream hostnames at start. Recreating a gateway container changes its IP, so nginx needs `resolver 127.0.0.11 valid=5s` + a `zone` upstream, or a reload after each rollout.
- `/ws/study` has no nginx location today (`nginx.conf` only proxies `/api/`). Production WS routing is [UNVERIFIED]. Add `location /ws/`.
- <!-- Red Team: RT-11 --> No proto client graph. The server of `examio.<svc>.v1` is `<svc>` by convention (`proto/examio/<svc>/` ↔ `deploy/services.json` key `<svc>`). `buf breaking` (CI) keeps proto changes wire-compatible, so clients that did not change code keep working with an old image and do not need a rebuild.
- <!-- Red Team: RT-12 --> Today's migration entrypoint runs `db push` and then marks every migration applied with `migrate resolve --applied … || true` (`entrypoint-migration.sh:13-22`). That hides failures. Phase 11 replaced it with `migrate deploy`; this phase must never add an automatic `migrate resolve`. A failed migration leaves `_prisma_migrations` in error state and later deploys fail with `P3009` until a human resolves it.
- <!-- Red Team: RT-12 --> Rollback restores the previous image only, never the DB. That is safe only if every migration is expand-only (old code still runs on the new schema). Destructive SQL (`DROP`, `RENAME`, `ALTER … TYPE`) breaks the previous image, so it must ship as a separate contract PR after all callers have moved.
- <!-- Red Team: RT-12 --> Honest drain: `stop_grace_period: 30s` drains in-flight non-streaming requests, but long-lived streams are cut when a gateway container stops. socket.io reconnects by default (`examio-fe/src/hooks/useStudyRoomSocket.ts`); the config SSE reconnects with backoff (`examio-fe/src/apis/configApi.ts:25-28,115`); an in-flight AI chat stream (`examio-fe/src/apis/aiChatApi.ts:265,342`, fetch reader, no resume) is cut and the user re-sends. So the zero-downtime criterion covers non-streaming requests only.
- <!-- Red Team: RT-11 --> Admin logs stay on the existing path: gateway `log-publisher.service.ts` → Redis list `logs:<svc>` + channel `logs:stream:<svc>` → admin `RedisLogService` (`apps/admin-service/src/modules/admin-logs/redis-log.service.ts`, registered in `admin-logs.module.ts:11`). With `gateway-a` + `gateway-b` both instances publish to the same keys, which works unchanged. `log-watcher.service.ts` (file tail of `LOGS_DIR`) is kept as is.

## Requirements
Functional
- Images: `ghcr.io/<owner>/examio-<svc>:<git-sha>` + `:main` for gateway, auth, finance, admin, r2, content, assessment, studyroom, vocabulary, aichat, document (Node, `deploy/Dockerfile.node`, `ARG SERVICE`) and ai (`apps/ai-service/Dockerfile`, Python 3.12-slim, `grpc_tools.protoc` step). Node 22-alpine runtime, `USER node`, healthcheck `wget -qO- localhost:3000/health/ready`. Python healthcheck uses `urllib`.
- `deploy/services.json` = single source for CI + deploy <!-- Red Team: RT-11 (no `proto` client graph) -->:
```json
{ "node":   { "auth": {"dir":"auth-service","db":true,"worker":true}, "studyroom": {"dir":"study-room-service","db":true,"worker":true},
              "gateway": {"dir":"gateway-service","instances":["gateway-a","gateway-b"]}, "...": {} },
  "python": { "ai": {"dir":"ai-service","db":true,"worker":true} } }
```
  The key is both the compose service name and the proto package (`proto/examio/<key>/`).
- CI matrix logic `examio-be/scripts/changed-services.sh <base> <head>` → JSON `{ "wave1": [...], "wave2": [...] }` <!-- Red Team: RT-11, RT-12 -->:
  - `examio-be/apps/<dir>/**` → that service
  - `examio-be/{libs/**,package.json,yarn.lock,tsconfig*.json,nest-cli.json,deploy/Dockerfile.node,deploy/webpack.service.js}` → **all Node services**
  - `examio-be/proto/examio/<key>/**` → service `<key>` (server), placed in **wave 1**. `proto/examio/{common,events}/**` → all Node + ai.
  - `examio-be/apps/ai-service/**` → ai
  - `examio-be/deploy/compose/<svc>.yml`, `deploy/env/<svc>.env.example` → svc (redeploy)
  - Empty base / force / `workflow_dispatch services=all` → everything. Reuse the multi-commit `before..sha` logic (`deploy.yml:53-67`).
  - Waves: wave 1 = changed services that are servers of a changed `proto/examio/<key>/` (new RPCs/fields exist before any caller uses them); wave 2 = every other changed service. Within a wave the order is alphabetical, with `gateway` last.
- Migration lint <!-- Red Team: RT-12 --> `examio-be/scripts/lint-migrations.sh <base> <head>` (PR workflow): scans migration files added in the diff (`apps/*/prisma/migrations/*/migration.sql`, ai `alembic/versions/*.py` per phase 15). Fails on `DROP TABLE|COLUMN|TYPE|SCHEMA`, `RENAME`, `ALTER COLUMN … [SET DATA] TYPE`, `ALTER TYPE`, `SET NOT NULL`, `ADD COLUMN … NOT NULL` without `DEFAULT` (alembic: `op.drop_*`, `op.rename_*`, `op.alter_column(… type_=|nullable=False)`). `DROP INDEX|DEFAULT|NOT NULL|CONSTRAINT` are allowed (expand-safe). The check passes when the PR carries the label `migration:contract`.
- Two-PR contract flow <!-- Red Team: RT-12 --> (documented in `examio-be/deploy/README.md`): PR 1 (expand) adds the new column/table, code writes both or reads new with fallback, deploys normally. PR 2 (contract, label `migration:contract`) drops the old shape and is merged only after every service using the old shape is deployed with PR 1 (checked by the author: `git log` of the callers + GHCR tags in `deploy/.tags.env`). A contract migration's rollback = roll forward (the previous image is no longer compatible).
- PR workflow (extends phase 01 `ci.yml`): `detect` job → matrix `service` → `tsc --noEmit -p apps/$DIR/tsconfig.app.json`, eslint, `jest apps/$DIR`, e2e with service containers (postgres/pgvector, redis, rabbitmq). Once (not per service): `depcruise` (phase 10), `buf lint` + `buf breaking`, the FE permission-type diff check (phase 09), `lint-migrations.sh`.
- Deploy workflow (push main): `detect` → `build` matrix (`docker/build-push-action`, `cache-from/to: type=gha,scope=<svc>`, `packages: write`) → `deploy` job (concurrency `deploy-production`, sequential) SSH → `deploy/deploy-service.sh <svc> <sha>` for every wave-1 service, then every wave-2 service. Any failure stops the job before the next service. The FE keeps its own job.
- `deploy/deploy-service.sh` <!-- Red Team: RT-12 (P3009 halt) -->:
```bash
prev=$(get_tag "$SVC"); set_tag "$SVC" "$SHA"                 # deploy/.tags.env: <SVC>_TAG=<sha>
docker compose pull "$SVC" ${HAS_WORKER:+"$SVC-worker"} ${HAS_DB:+"$SVC-migrate"}
if [ -n "$HAS_DB" ]; then
  out=$(docker compose run --rm --no-deps "$SVC-migrate" 2>&1); rc=$?; echo "$out"
  if [ $rc -ne 0 ]; then
    set_tag "$SVC" "$prev"                                     # old image keeps running (never recreated)
    echo "$out" | grep -q 'P3009' && alert "P3009 $SVC: failed migration recorded; manual 'prisma migrate resolve' required. Deploy halted."
    alert "migrate failed for $SVC@$SHA; previous image $prev still running"; exit 1
  fi
fi
docker compose up -d --no-deps --wait --wait-timeout 90 "$SVC" ${HAS_WORKER:+"$SVC-worker"} \
  || { set_tag "$SVC" "$prev"; docker compose up -d --no-deps --wait "$SVC" ${HAS_WORKER:+"$SVC-worker"}; alert "rollback $SVC → $prev"; exit 1; }
```
  `alert` posts to the existing Telegram channel (same secrets as `deploy.yml:215-240`). The script never runs `migrate resolve` or `db push`. Gateway: run the same for `gateway-a`, then `docker exec examio-frontend nginx -s reload`, then `gateway-b`, then reload. Never `down`.
- Compose (on top of the phase-05 networks): `gateway-a`/`gateway-b` on `edge` + `internal`; remove the remaining gateway host port `6369:3000` (container port 3000 since phase 02) once nginx uses the upstream. <!-- Reconcile: X9 --> `ROLE=api,worker` for vocabulary, admin. `mem_limit` per container. `stop_grace_period: 30s`. Image tags `${<SVC>_TAG:-main}`.
- Env: `deploy/env/<svc>.env` per service (+ `.env.example` committed; started in phase 11). The shared `deploy/.env` holds only compose-level vars (tags, Postgres superuser). No `JWT_SECRET` outside auth; `SERVICE_CLIENT_SECRET` per service (RT-2, phase 04).

Non-functional
- A single-service deploy finishes in ≤ 3 min.
- <!-- Red Team: RT-12 --> Gateway rollout: 0 failed **non-streaming** requests (k6 smoke during the rollout). WS/SSE clients reconnect; an in-flight AI chat stream may be cut (documented, not a failure).
- VPS RAM budget: measure after this phase (ARCH §14.2 Q5). Collapse `api,worker` where idle.

## Production cutover runbook (one-time, at final merge) <!-- Updated: Validation Session 1 - one-time production cutover runbook -->
Lives in `examio-be/deploy/cutover-runbook.md` (exact commands; operator ticks each checkpoint). Smoke script: `examio-be/scripts/cutover-smoke.ts` (axios + `socket.io-client`, already a devDependency since P06; `BASE_URL`, test accounts from env).
0. Preconditions: merge commit green in CI; GHCR images exist for every `services.json` key at the merge sha; `deploy/env/<svc>.env` filled on the VPS (JWT keypair, `SERVICE_CLIENTS` + per-service `SERVICE_CLIENT_SECRET`, per-service DB/RabbitMQ passwords); Cloudflare → nginx topology confirmed (P05 risk); downtime window announced; the push-main deploy job is gated by repo variable `CUTOVER_DONE` (job exits no-op until it is `true`, so the merge push does not run waves against the old stack). The runbook has been rehearsed end-to-end on an empty local compose host.
1. Backup (keep it): `docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > /srv/backups/examio-pre-cutover-<date>.dump`; verify with `pg_restore --list`; copy off-host; never deleted by this plan. Record the running commit as git tag `pre-cutover` and `docker tag` every running image as `:pre-cutover`.
2. Drain + stop: confirm `rabbitmqctl list_queues` shows no ready messages, then `docker compose down` (old compose from `pre-cutover`).
3. Drop data volumes: `docker volume ls | grep -E '(postgres|redis|rabbitmq)_data'` → `docker volume rm` those three (names carry the compose project prefix). R2: point `R2_BUCKET_NAME` at a new empty bucket; the old bucket is kept untouched for rollback and emptied only after the rollback window (CLAUDE.md rule: DB rows that own R2 objects are deleted together with them).
4. Checkout the merge sha; `node deploy/rabbitmq/render-definitions.cjs` (P03; fails fast on a missing password); `docker compose pull`.
5. Infra: `docker compose up -d --wait postgres redis rabbitmq` (empty data dir → `deploy/postgres/init/01-service-schemas.sh` creates schemas, `<svc>_svc` roles, `search_path`, pgvector).
6. Migrate per service in deploy-wave order (`changed-services.sh` with empty base = all): `docker compose run --rm --no-deps <svc>-migrate` for every `db:true` key (Prisma `migrate deploy`; ai = Alembic `ROLE=migrate`). Any non-zero exit → stop, go to rollback.
7. Seed reference data only: `docker compose run --rm -e ROLE=seed -e SEED_PROFILE=prod <svc>` for admin (PageFeatureFlag), vocabulary (word-family categories), aichat (subjects). Dev seeds (users, wallets, audit) never run in production.
8. Start in wave order with `deploy-service.sh <svc> <sha>` (auth first: JWKS + `/internal/token`; gateway-a, gateway-b last), then the FE container + `nginx -s reload`.
9. Bootstrap the first SYSTEM_ADMIN: the admin registers + verifies on the web, then `docker compose exec auth node dist/apps/auth-service/commands/cli.js grant <email> --teacher` (P04 CLI; exact path per the built image) → `RoleChangeLog source=cli`.
10. Smoke (`BASE_URL=https://<prod> yarn ts-node scripts/cutover-smoke.ts`): login (email + Google manual); TEACHER creates a quiz set; STUDENT studies a granted (whitelisted) flashcard/quiz set; admin assigns a role on `/admin/roles` and the target gets `TOKEN_STALE` → refresh; STUDENT joins a study room over WS (`/ws/study`); gateway logs show real client IPs (not Cloudflare ranges). All green → set `CUTOVER_DONE=true`, announce, watch logs for 1 h.
Rollback (any failure in 4–10, or within the 24 h rollback window): `docker compose down`; remove the new volumes; checkout `pre-cutover`; start the old stack's postgres on an empty volume and `pg_restore` the step-1 dump; restore `R2_BUCKET_NAME` to the old bucket; `docker compose up -d` with the `:pre-cutover` images (old build-on-VPS compose); smoke login. Data created after cutover is lost (accepted; announced with the window). Keep `CUTOVER_DONE=false`.

## Architecture
```
PR ─► ci.yml: detect matrix + buf breaking + lint-migrations (label migration:contract bypass) + depcruise
push main ─► detect (changed-services.sh + services.json) → {wave1: changed proto servers, wave2: rest}
          ─► build matrix ─► GHCR examio-<svc>:<sha>
          ─► deploy (SSH, sequential): wave1 … then wave2 … ─► deploy-service.sh <svc> <sha>
                 migrate ─fail─► restore tag, old image untouched, Telegram alert (P3009 = manual resolve), halt
                 up --no-deps --wait ─fail─► restore tag + old image, alert, halt
Cloudflare ─► examio-fe nginx [edge] ─upstream gw{gateway-a:3000, gateway-b:3000}─► gateway [edge+internal] ─► services [internal]
```
nginx (`examio-fe/nginx.conf`, on top of the phase-05 `real_ip` block):
```nginx
resolver 127.0.0.11 valid=5s;
upstream gw { zone gw 64k; server gateway-a:3000 max_fails=1 fail_timeout=5s; server gateway-b:3000 max_fails=1 fail_timeout=5s; }
location /api/ { proxy_pass http://gw; proxy_next_upstream error timeout http_502 http_503; proxy_buffering off; ... }
location /ws/  { proxy_pass http://gw; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_read_timeout 3600s; }
```
`proxy_next_upstream` retries only idempotent methods by default (nginx does not resend POST unless `non_idempotent` is set; keep it unset).

## Related Code Files
File ownership (globs; runs after 12–15, no parallel BE phase):
- `/Users/tgiap.dev/devs/examio/examio-be/deploy/**` (Create: `Dockerfile.node`, `webpack.service.js`, `services.json`, `deploy-service.sh`, `README.md` (contract flow), `env/*.env.example` (complete). Delete: `Dockerfile`, `Dockerfile.migration`, `Dockerfile.seed`, `entrypoint-migration.sh`)
- `/Users/tgiap.dev/devs/examio/examio-be/scripts/{changed-services.sh,changed-services.test.sh,lint-migrations.sh,lint-migrations.test.sh,cutover-smoke.ts}` (create; `cutover-smoke.ts` <!-- Updated: Validation Session 1 - one-time production cutover runbook -->), `/Users/tgiap.dev/devs/examio/examio-be/deploy/cutover-runbook.md` (create) <!-- Updated: Validation Session 1 - one-time production cutover runbook -->, `.../examio-be/nest-cli.json` (`webpackConfigPath`, proto assets)
- `/Users/tgiap.dev/devs/examio/.github/workflows/{deploy.yml,ci.yml}`
- `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/Dockerfile`
- `/Users/tgiap.dev/devs/examio/examio-fe/{nginx.conf,docker-compose.yml,Dockerfile}` (upstream + `/ws/` + resolver only; the `real_ip` block stays phase-05 owned)
- Not touched <!-- Red Team: RT-11 -->: `libs/observability` (beyond phase 01), `libs/redis` ACL, `apps/admin-service/src/modules/admin-logs/**` → phase 17.

## Implementation Steps
1. Spike (0.25d, reuses the P01 RT-14 result): `webpack.service.js` (`externals: []` + `LimitChunkCountPlugin({maxChunks:1})`) for auth + content. Check grpc-js, amqplib, `@nestjs/websockets` optional requires. Record which externals are needed. Fallback = full prod node_modules (researcher-02 option B).
2. `Dockerfile.node`: deps (`yarn install --immutable`, BuildKit cache) → build (`yarn proto:gen`, `prisma generate --schema apps/$SERVICE/prisma`, `nest build $SERVICE`) → runtime node:22-alpine (`dist/apps/$SERVICE`, `proto/`, `prisma/migrations`, `prisma` CLI for migrate). `ENTRYPOINT` reads `ROLE`; `ROLE=migrate` runs only `prisma migrate deploy`; `ROLE=seed` runs the service seed with `SEED_PROFILE=prod|dev` (prod = reference data only; replaces the deleted `Dockerfile.seed`) <!-- Updated: Validation Session 1 - one-time production cutover runbook -->.
3. ai-service Dockerfile: protoc step, `alembic` included, roles via `ROLE`.
4. `services.json` (no proto graph) + `changed-services.sh` (waves) + `changed-services.test.sh` with fixture file lists.
5. `lint-migrations.sh` + `lint-migrations.test.sh` (fixtures: expand SQL passes; `DROP COLUMN` fails; `DROP COLUMN` + label passes; alembic `op.drop_column` fails). Write the two-PR flow in `deploy/README.md`.
6. Rewrite `ci.yml` into a matrix (+ migration lint reading `github.event.pull_request.labels`) and `deploy.yml` into detect/build/deploy with waves. Keep `workflow_dispatch` (`services`, `force_rebuild`).
7. `deploy-service.sh` with migrate gate, P3009 detection, Telegram `alert`, `DRY_RUN=1`.
8. Compose: `gateway-a`/`gateway-b`, env files, `mem_limit`, image tags, drop `6369`. Move FE to the external `edge` network if phase 05 did not.
9. nginx upstream + `/ws/` + resolver. Rollout rehearsal on local compose with k6 (non-streaming) + a manual WS/SSE reconnect check (production sees it only after cutover). <!-- Updated: Validation Session 1 - single production deploy -->
10. <!-- Updated: Validation Session 1 - one-time production cutover runbook --> Write `deploy/cutover-runbook.md` + `scripts/cutover-smoke.ts`; gate the push-main deploy job on `vars.CUTOVER_DONE == 'true'`; rehearse the whole runbook (steps 0–10 + rollback) on an empty local compose host with a throwaway dump.

## Tests
Write first:
- `scripts/changed-services.test.sh`: `libs/grpc/x.ts` → all node in wave 2; `proto/examio/content/v1/a.proto` + `apps/assessment-service/x.ts` → `{wave1:["content"], wave2:["assessment"]}`; `proto/examio/common/v1/x.proto` → all; `apps/ai-service/x.py` → `{wave2:["ai"]}`; docs-only → empty. <!-- Red Team: RT-11, RT-12 -->
- `scripts/lint-migrations.test.sh` (fixtures above). <!-- Red Team: RT-12 -->
- Image smoke in CI: `docker run --rm -e ROLE=api … examio-content:<sha>` → `/health/live` 200. Image size per service logged (target < 250 MB Node).
- <!-- Updated: Validation Session 1 - one-time production cutover runbook --> `scripts/cutover-smoke.ts` runs green against local compose after a from-empty rehearsal; the rollback rehearsal restores a dump into the old compose and the old login works.
- `deploy-service.sh` with `DRY_RUN=1` and a fake `docker` shim: a failing `--wait` restores the previous tag; a migrate output containing `P3009` → exit 1, alert called with "manual", `up` never called, tag restored; no code path calls `migrate resolve` (`grep -c 'migrate resolve' deploy/deploy-service.sh` → 0). shellcheck clean. <!-- Red Team: RT-12 -->

## Todo List
- [ ] webpack bundle spike + decision recorded
- [ ] Dockerfile.node + ai Dockerfile, Node 22
- [ ] services.json (no proto graph) + changed-services.sh (waves) + tests
- [ ] lint-migrations.sh + tests + contract-flow README <!-- Red Team: RT-12 -->
- [ ] ci.yml matrix, deploy.yml detect/build/deploy in waves + GHCR
- [ ] deploy-service.sh with migrate gate + P3009 halt/alert + auto-rollback
- [ ] Compose gateway-a/b, env per service, drop 6369
- [ ] nginx upstream + /ws/ + rollout rehearsal
- [ ] Cutover runbook + smoke script + `CUTOVER_DONE` deploy gate + local rehearsal (incl. rollback) <!-- Updated: Validation Session 1 - one-time production cutover runbook -->
- [ ] [CARRIED from 09] D1 socket transport-attempt cap test; D3 `REDIS_COMMAND_TIMEOUT_MS` per env (first call 504 → 503); D12 15-min socket expiry run in the cutover smoke; D14 CI e2e on a dedicated DB; D15 auth throttle decision before cutover
- [ ] [CARRIED from 10] remove the `UpdateBalance` breaking override from `buf.yaml` after merge to main; L4 page-flag push serialization per admin instance (gateway version for multi-replica); exam e2e parallel-worker segfault (keep CI `maxWorkers 1` until fixed); N1 Redis-down degraded boot run live; U1 `dist/apps/exam-service` vanished once (fail the build when any service output is missing); W6 empty page-flag default checked on the FE.

## Success Criteria
- <!-- Updated: Validation Session 1 - one-time production cutover runbook --> Cutover: runbook steps 0–10 ticked, smoke script exit 0 against production, `CUTOVER_DONE=true`, the pre-cutover dump exists off-host. After that (steady state):
- A commit touching only `examio-be/apps/vocabulary-service/**` → the Actions run builds and deploys only `vocabulary` (`detect` output `{wave1:[], wave2:["vocabulary"]}`). `docker ps` uptime of other containers is unchanged.
- A commit touching `proto/examio/finance/v1/*.proto` + `apps/content-service/**` → the deploy log shows `finance` finished before `content` started. <!-- Red Team: RT-12 -->
- `bash examio-be/scripts/changed-services.test.sh && bash examio-be/scripts/lint-migrations.test.sh` → all pass.
- A PR adding `ALTER TABLE "X" DROP COLUMN "y"` without the `migration:contract` label → CI red; with the label → green. <!-- Red Team: RT-12 -->
- `docker compose -f examio-be/deploy/docker-compose.yml config | grep -c 'published'` → 0 for backend services.
- During a gateway rollout, `k6 run smoke.js` (50 rps, 2 min, non-streaming endpoints) → 0 non-2xx caused by the deploy. A connected study-room socket reconnects within 10 s. <!-- Red Team: RT-12 -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Bundling breaks a native/optional dep at runtime | M | H | Spike first; per-service image smoke; externals list; fallback option B |
| Auto-rollback with a non-backward-compatible migration | M | H | <!-- Red Team: RT-12 --> Migration lint + `migration:contract` label + two-PR flow; rollback restores the image only (DB expand-only) |
| Failed migration leaves `_prisma_migrations` dirty (P3009) | M | H | <!-- Red Team: RT-12 --> Halt + Telegram alert, old image untouched; human runs `migrate resolve` after inspecting; no auto resolve |
| A caller deploys before its new server RPC exists | M | M | <!-- Red Team: RT-12 --> Waves: changed proto servers first; `buf breaking` blocks wire-incompatible changes |
| nginx keeps a stale gateway IP | M | M | resolver + zone upstream, plus a reload after each half |
| Streaming clients cut during gateway rollout | H | L | <!-- Red Team: RT-12 --> Clients reconnect (socket.io, config SSE); AI chat stream re-send; criterion limited to non-streaming |
| RAM exhaustion on the VPS (~12 svc × roles) | M | H | `mem_limit`, combine api/worker, measure |
| GHCR auth on the VPS | L | M | Deploy-only PAT with `read:packages`, `docker login` in the deploy script |
| Merge push runs waves against the old stack before cutover | M | H | Deploy job gated on `CUTOVER_DONE`; set only after the smoke passes <!-- Updated: Validation Session 1 - one-time production cutover runbook --> |
| Cutover fails midway (migrate, env, image) | M | H | Rehearsed runbook; dump + `:pre-cutover` images + old bucket kept; rollback path in the runbook <!-- Updated: Validation Session 1 - one-time production cutover runbook --> |
| Old R2 objects orphaned by the DB reset | H | L | New bucket at cutover; old bucket emptied after the rollback window <!-- Updated: Validation Session 1 - one-time production cutover runbook --> |

## Rollback
- Cutover (one-time): the runbook rollback (previous `:pre-cutover` images + `pg_restore` of the kept dump + old R2 bucket). <!-- Updated: Validation Session 1 - one-time production cutover runbook -->
- Per service (steady state, after cutover): `set_tag <svc> <prev_sha>` + `deploy-service.sh` (images are immutable by sha). Valid only while the DB is expand-compatible; after a `migration:contract` deploy, roll forward. <!-- Red Team: RT-12 -->
- Whole phase: revert the workflows/compose. The old `Dockerfile` path returns with the revert (build-on-VPS mode). Do NOT restore `entrypoint-migration.sh`'s blind `migrate resolve` loop; keep `migrate deploy`.

## Security Considerations
- Only FE nginx publishes ports (networks from phase 05). Secrets live in per-service env files on the VPS (not in git). GHCR images contain no `.env`.
- The `migration:contract` label is applied only by maintainers (repo label permissions); the lint result is a required check.
- Redis per-service ACL is deferred (phase 17). Until then, key-prefix ownership is a code convention only. <!-- Red Team: RT-11 -->

## Next Steps
- 19 documents the deploy runbook (waves, contract flow, P3009 procedure) and the one-time cutover runbook (links `deploy/cutover-runbook.md`). <!-- Updated: Validation Session 1 - one-time production cutover runbook --> 17 (deferred) adds observability, Redis ACL and K8s.

<!-- Updated: 2026-10-20 carried from P05 Todo 11 --> **Cutover smoke additions (carried from P05):** browser run through the FE nginx covering login (cookies accessToken/refreshToken only, SameSite=Lax), AI chat token streaming, a 20 MB PDF upload, study-room join over `/ws/study`, admin log SSE, page-flag toggle; plus on the new compose networks: Google login, SePay plan list, AI generation; real Cloudflare client IPs visible in gateway logs.
