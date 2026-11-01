# KMAEdu Backend - Docker Deployment Guide

This guide explains how to deploy the KMAEdu backend using Docker with containerized PostgreSQL and Redis databases.

## Architecture Overview

The deployment consists of the following containers:
- **PostgreSQL** (Database)
- **Redis** (Cache)
- **RabbitMQ** (Message Queue)
- **Gateway Service** (YAML-routed streaming proxy; JWT verify, revoke/stale checks, rate limits; no database)
- **Auth Service** (Authentication)
- **Content Service** (quiz sets, flashcard sets, quiz/flashcard generation jobs, `/student/*` content routes: HTTP + gRPC `kmaedu.content.v1.ContentService` on 50051; `ROLE=api,worker`: outbox relay and the R2 delete worker; no internet access)
- **Assessment Service** (exam rooms, sessions, attempts, cheating log, `/student/*` exam routes; no gRPC server; `ROLE=api,worker`: outbox relay and purge; reads quizzes only from the snapshot frozen in each session, fetched from content over gRPC at session create)
- **Study-room Service** (study rooms: HTTP + Socket.io `/ws/study`; consumes `auth.user.authz_changed` and `auth.user.updated` inside the API process)
- **Vocabulary Service** (word families + categories: HTTP + gRPC `WordFamilyAdminService`/`WordFamilyService`, plus an R2 delete worker for category images in the same container; calls ai-service for generation)
- **Document Service** (uploaded-file metadata and OCR status: HTTP `/ai/upload*`, `/ai/quick-upload`, `/r2/image` + gRPC `DocumentService`; one container runs `api,worker`: outbox relay, `document.events` consumer and the R2 delete worker)
- **AI Chat Service** (AI conversations, messages, attached documents and the public AI-teacher subjects: HTTP `/ai-chat/*` (SSE streaming) and `/subjects/*`, no gRPC server; one container runs `api,worker`: the `aichat.events` consumer and the R2 delete worker for message images. Calls ai-service `Query`/`StreamChat` as `svc:ai-chat`, document-service as the caller)
- **R2 Service** (File Storage)
- **AI Service** (Python, one image, three containers selected by `ROLE`: `ai` = gRPC `kmaedu.ai.v1.AiService` on 50051 guarded by service tokens, plus `/health` as its only HTTP route; `ai-worker` = RabbitMQ consumer on `ai.events` (OCR/embedding for `document.uploaded`, generation for `content.generation.requested`), outbox relay and purge; `ai-migrate` = one-shot `alembic upgrade head`. Owns schema `ai`; no host port)
- **`<svc>-migrate`** (`auth-migrate`, `admin-migrate`, `content-migrate`, `assessment-migrate`, `study-room-migrate`, `vocabulary-migrate`, `document-migrate`, `ai-chat-migrate`: one `prisma migrate deploy` per service schema, each runs once and exits; `ai-migrate` is the Alembic equivalent for schema `ai`)

The stack is split by service in `compose/*.yml` (`infra`, `auth`, `admin`, `content`, `assessment`, `study-room`, `vocabulary`, `document`, `ai-chat`, `gateway`, `r2`, `ai`, `seed`) and assembled by the `include:` list in `docker-compose.yml` (needs Docker Compose 2.24+). Run every command from `deploy/`; paths stay relative to it.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.24+ (`include:`, and `env_file` entries with `required:`)
- `jq` and `git` on the deploy host (`deploy-service.sh`, the cutover runbook)
- At least 4GB RAM available
- 20GB disk space

## Deployment Steps

### 1. Setup Environment File

**Option A: Automatic (Recommended)**

Run the setup script to copy the `.env` file and create the missing per-service `env/<name>.env` files
from their templates:

```bash
# For Linux/Mac
cd kmaedu-be/deploy
./setup-env.sh

# For Windows (PowerShell)
cd kmaedu-be\deploy
.\setup-env.ps1
```

**Option B: Manual**

```bash
# Copy .env from parent directory
cd kmaedu-be/deploy
cp ../.env .env

# Or create from example
cp .env.example .env
# Then edit .env with your configuration

# Per-service runtime env (see "Per-service env files" below)
for f in env/*.env.example; do cp -n "$f" "${f%.example}"; done
```

**Per-service env files.** `deploy/.env` holds only compose-level variables (database and broker passwords,
Postgres superuser, Redis password, JWT keypair, service-token secrets, `FRONTEND_URL`): compose uses it to
interpolate the `${VAR}` in `compose/*.yml` and does not hand it to the containers. Each container gets one file
`env/<name>.env` through `env_file` (`required: true`, so a missing file stops `up` before anything starts), with
the secrets only that service reads (`GOOGLE_*`/`EMAIL_*`/`REFRESH_TOKEN_ENC_KEY`
in `auth.env`, `R2_*` keys in `r2.env`, `GEMINI_*` in `ai.env`, `QUIZ_*` in `assessment.env`).
A compromised container sees its own file only. Real `*.env` files and `.tags.env` are gitignored; the
templates are `env/*.env.example` (see `env/README.md`).

### 2. Configure Environment Variables

Edit `.env` for the compose-level values below (database and broker passwords, Redis, JWT keypair, service-token
secrets, RabbitMQ, `R2_PUBLIC_URL`, `FRONTEND_URL`). Secrets that one service reads (`ADMIN_*`, `GEMINI_*`,
`AI2_API_KEY`, `QUIZ_*`, `R2_*` keys, `GOOGLE_*`, `EMAIL_*`) go into that service's `env/<name>.env`
instead; the blocks below say which file.

#### Database Configuration (PostgreSQL Container)
```bash
POSTGRES_USER=kmaedu
POSTGRES_PASSWORD=your_strong_password_here
POSTGRES_DB=kmaedu

# One password per service role (all 9 required; URL-safe, e.g. `openssl rand -hex 24`)
AUTH_DB_PASSWORD=...  ADMIN_DB_PASSWORD=...  CONTENT_DB_PASSWORD=...  ASSESSMENT_DB_PASSWORD=...  STUDYROOM_DB_PASSWORD=... (used by study-room)
VOCABULARY_DB_PASSWORD=... (used by vocabulary)  AICHAT_DB_PASSWORD=...  DOCUMENT_DB_PASSWORD=...  AI_DB_PASSWORD=...
```

There is no shared `DATABASE_URL`. `postgres/init/01-service-schemas.sh` runs once on an **empty** data volume and creates, for each of `auth admin content assessment studyroom vocabulary aichat document ai`, the role `<svc>_svc` (own password, `CONNECTION LIMIT 40`), the schema `<svc>` it owns, and a role-level `search_path = <svc>, extensions` (pgvector lives in `extensions`). `PUBLIC` has no privileges on the database or on `public`, so one role cannot read another's schema (`content_svc` selecting from `auth."User"` gets `permission denied`). Compose gives each service `postgresql://<svc>_svc:...@postgres:5432/$POSTGRES_DB?schema=<svc>`; the Python ai-service connects as `ai_svc` (no `?schema=`; it pins `DB_SEARCH_PATH=ai,extensions`, creates its tables through Alembic, runs no DDL at runtime and holds no grant on any other service's schema; the temporary grant on the old `exam` schema was revoked in phase 15; that schema no longer exists). Changing a password or adding a role later needs a volume reset (`down -v`) or a manual `ALTER ROLE`. Per-service variable lists: `env/<svc>.env.example`.

#### Redis Configuration (Redis Container)
```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty or set a password
```

#### Security (REQUIRED - Change these!)
```bash
# RS256 access tokens: `scripts/gen-jwt-keypair.sh` prints both lines (never commit the key)
JWT_PRIVATE_KEY=<pkcs8 pem on one line, newlines as \n>
JWT_KID=<kid>
JWT_ISSUER=kmaedu-auth
JWT_AUDIENCE=kmaedu
ACCESS_TOKEN_EXPIRATION=15m
# Service tokens: `scripts/gen-service-secret.sh <content|assessment|studyroom|vocabulary|document|ai-chat|admin|gateway>` prints the secret
# (that service only) and the hash that goes into auth's SERVICE_CLIENTS.
SERVICE_CLIENTS={"content":"<sha256>","assessment":"<sha256>","studyroom":"<sha256>","vocabulary":"<sha256>","document":"<sha256>","ai-chat":"<sha256>","admin":"<sha256>","gateway":"<sha256>"}
CONTENT_SERVICE_CLIENT_SECRET=<secret>
ASSESSMENT_SERVICE_CLIENT_SECRET=<secret>
STUDYROOM_SERVICE_CLIENT_SECRET=<secret>
VOCABULARY_SERVICE_CLIENT_SECRET=<secret>
AICHAT_SERVICE_CLIENT_SECRET=<secret>
DOCUMENT_SERVICE_CLIENT_SECRET=<secret>
ADMIN_SERVICE_CLIENT_SECRET=<secret>
# Gateway uses it to pull AdminService.GetPageFlags at boot (compose maps it to the gateway's SERVICE_CLIENT_SECRET; optional).
GATEWAY_SERVICE_CLIENT_SECRET=<secret>
# AUTH_JWKS_URL / AUTH_TOKEN_URL are plain http on the INTERNAL network (compose: http://auth:3000/...).
# Never point them at a public http host: whoever controls the JWKS controls who is an admin.
# A public JWKS must be https.
```

Per-service, not here: `REFRESH_TOKEN_ENC_KEY` in `env/auth.env`; `QUIZ_JWT_SECRET` and `QUIZ_AES_KEY` (32 characters
minimum each) in `env/assessment.env`.

#### RabbitMQ Configuration
```bash
# Ops/admin user (management UI only; apps do not connect with it)
RABBITMQ_USER=admin
RABBITMQ_PASS=secure_password_here
# One broker user per service; docker-compose.yml builds each service's RABBITMQ_URL.
# Passwords go into amqp:// URLs: use URL-safe characters (e.g. `openssl rand -hex 24`).
RABBITMQ_AUTH_PASS=...
RABBITMQ_CONTENT_PASS=...
RABBITMQ_ASSESSMENT_PASS=...
RABBITMQ_STUDYROOM_PASS=...
RABBITMQ_DOCUMENT_PASS=...
RABBITMQ_AI_PASS=...
RABBITMQ_GATEWAY_PASS=...
RABBITMQ_AICHAT_PASS=...
```

Broker users and permissions are rendered from `rabbitmq/definitions.template.json` into the gitignored `rabbitmq/definitions.json` by the one-shot `rabbitmq-defs` service. `setup-env.sh` and the deploy workflow run `docker compose run --rm rabbitmq-defs` before `up`; it fails if any password above is missing.

#### AI Service
Phase 15 variables: `DOCUMENT_GRPC_URL` and `AI_GRPC_URL` (content), `DOCUMENT_SERVICE_URL` (gateway), `DOCUMENT_SERVICE_CLIENT_SECRET` (+ the `document` entry in auth `SERVICE_CLIENTS`), `RABBITMQ_DOCUMENT_PASS` and `RABBITMQ_AI_PASS` (broker users `document`, `ai`), `DOCUMENT_DB_PASSWORD` and `AI_DB_PASSWORD`, `R2_ALLOWED_HOSTS` and `GENERATION_JOB_TIMEOUT_MINUTES` (content, default 60, minimum 10). `R2_ALLOWED_HOSTS` is a comma-separated allow-list of hostnames that `ai-worker` may download presigned URLs from (the host of `R2_ENDPOINT`, plus bucket virtual hosts); if it is empty the worker falls back to the host of `R2_PUBLIC_URL`, and with neither set it refuses every download. Downloads must be https and the host must not resolve to a private, loopback or link-local address, so an S3-compatible endpoint on a private network is refused.

Phase 13 variables: `AICHAT_SERVICE_URL` (gateway), `AICHAT_SERVICE_CLIENT_SECRET` (+ the `ai-chat` entry in auth `SERVICE_CLIENTS`), `RABBITMQ_AICHAT_PASS` (broker user `aichat`), `AICHAT_DB_PASSWORD`, and for ai-chat `AI_GRPC_URL`, `DOCUMENT_GRPC_URL`, `R2_GRPC_URL`, `R2_PUBLIC_URL` and `AI_CHAT_DOCUMENT_WAIT_MS` (default 120000: how long one message waits for its documents' OCR). `AI_HTTP_COMPAT`, `AI_SERVICE_URL` and `INTERNAL_SERVICE_TOKEN` no longer exist: ai-service has no HTTP route but `/health`, and no service shares an HTTP secret. If an old `deploy/.env` still carries them, delete the lines and rotate the token.

`GEMINI_API_KEYS`, `GEMINI_MODEL_NAMES` and `AI2_API_KEY` live in `env/ai.env` (ai and ai-worker only). The tunables below
are optional lines in `.env` that compose passes to `ai` (defaults in `compose/ai.yml`).

```bash
# AI2 is used only for quiz/flashcard/content generation.
AI2_BASE_URL=https://ai.fayedark.com/v1
AI2_GENERATION_MODEL_NAMES=oc/deepseek-v4.1-flash-free,oc/nemotron-3.5-lightning-free
AI2_DEFAULT_MODEL=oc/deepseek-v4.1-flash-free
AI2_TIMEOUT_SECONDS=3600
AI2_MAX_TOKENS=4096
DEFAULT_MAX_TOKENS=4096
DEFAULT_MAX_TOKENS_CAP=4096
CHAT_HISTORY_MAX_MESSAGES=4
CHAT_HISTORY_MAX_CHARS=1200

# Gemini is used for OCR/RAG embeddings.
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
```

#### R2 Storage (Cloudflare)
```bash
# env/r2.env (r2 only); R2_ACCOUNT_ID is no longer used
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=examio
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

# .env (compose-level; env/r2.env also carries it)
R2_PUBLIC_URL=https://pub-....r2.dev
R2_ALLOWED_HOSTS=<bucket>.<account_id>.r2.cloudflarestorage.com,<account_id>.r2.cloudflarestorage.com   # ai-worker download allowlist (presigned GETs use the bucket host)
```

The ai-service refuses to download from a private or loopback address even when the host is listed in
`R2_ALLOWED_HOSTS`, unless `R2_ALLOW_PRIVATE_HOSTS=true` is set in `env/ai.env` (private-network stacks only; default false). Link-local
addresses, including `169.254.169.254`, are always refused.

`R2_PUBLIC_URL` is required by auth, content, vocabulary, document and ai-chat (they map a stored URL back to an R2 key; a URL on another host is never deleted). Deleting a record queues its R2 keys in `r2_delete_tasks` in the same transaction, and a worker (`libs/messaging/src/r2-delete`) removes them through r2-service with retries; content, vocabulary and document therefore run `ROLE=api,worker` in `compose/content.yml`, `compose/vocabulary.yml` and `compose/document.yml`. document-service calls r2 as `svc:document` (`UploadFile`, `CreatePresignedDownload`, `DeleteObjects`); r2 has no HTTP upload route and no `INTERNAL_SERVICE_TOKEN` any more.
Use a hostname dedicated to the bucket for `R2_PUBLIC_URL` (e.g. the `r2.dev` host or a custom domain that serves nothing else): any client-supplied image URL on that hostname, on any port or path, must be a key the caller owns, so a shared hostname would also reject unrelated images on it. User-owned objects are stored under `<area>/<ownerUserId>/…`; only those keys are ever deleted on a user's behalf.

#### Admin Bootstrap & Seed
`env/auth.env`:
```bash
# Comma-separated list of SYSTEM_ADMIN emails (synced by auth-service on startup
# and by `yarn bootstrap:admin`; moved from admin-service in phase 04)
ADMIN_EMAILS=admin@kmaedu.fayedark.com
# Default password for newly created admin accounts. ALSO consumed by
# the dev seeds (`yarn run seed:dev:<svc>`) so seeded users
# share the same password as bootstrap-created admins. Override per-run
# with SEED_PASSWORD=<value> yarn run seed:dev.
ADMIN_DEFAULT_PASSWORD=ChangeMe123!
```

> The **seed** service is opt-in (compose profile `seed`): a plain
> `docker compose up -d` never runs it, so a production deploy never gets the dev
> users and passwords. Run it on a dev/staging stack with
> `docker compose --profile seed run --rm seed`. It waits for the
> `*-migrate` services, runs the per-service dev seeds in
> order auth -> admin -> ai-chat -> vocabulary (each with its own role/schema URL, `<SVC>_DATABASE_URL`),
> then exits.
> The script picks up `ADMIN_DEFAULT_PASSWORD` from `deploy/env/auth.env`, so
> seeded users share the same password as admins created by the
> auth-service bootstrap. Idempotent — safe to re-run.
>
> Roles: new accounts are STUDENT; promote with `yarn bootstrap:admin:grant <email> [--teacher]`
> (auth-service CLI).
>
> To re-seed (e.g. after editing a seed file):
> ```bash
> docker compose --profile seed run --rm seed
> ```

#### OAuth Providers (Optional)
Configure Google, Facebook, and GitHub OAuth if needed.

### 3. Build and Start Services

```bash
# Build all services
docker compose build

# Start all services in detached mode
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f gateway-a gateway-b
```

### 4. Verify Deployment

Check service health:

```bash
# Check all containers are running
docker compose ps

# Liveness (process is up) and readiness (redis reachable) of a gateway instance: no host port, so ask the container
docker compose exec gateway-a wget -qO- http://localhost:3000/health/live
docker compose exec gateway-a wget -qO- http://localhost:3000/health/ready

# Check RabbitMQ management (if exposed)
# Access http://your-server:15672 (default: admin/admin)
```

### 5. Database Migration

Each database-owning service has its own one-shot migration container that runs automatically on startup. Check its logs:

```bash
docker compose logs auth-migrate     # or admin-migrate | content-migrate | assessment-migrate | study-room-migrate | vocabulary-migrate | document-migrate
```

Lưu ý quan trọng:
- `auth`, `admin`, `content`, `assessment`, `study-room`, `vocabulary`, `document` phụ thuộc vào `<svc>-migrate` tương ứng với điều kiện `service_completed_successfully`; `ai` và `ai-worker` chờ `ai-migrate` (Alembic, schema `ai`); `gateway` và `r2` không có database nên không chờ migration nào;
- mỗi `<svc>-migrate` dùng cùng image với service (`Dockerfile.node`, `ARG SERVICE`) với `ROLE=migrate`, chạy `prisma migrate deploy --schema apps/<svc>-service/prisma[...]` bằng chính role `<svc>_svc` của service đó (`content` và `assessment` đều dùng một file `schema.prisma`; `study-room` dùng role/schema `studyroom`; `vocabulary` dùng role/schema `vocabulary`; `document` dùng role/schema `document`); `ai-migrate` không dùng Prisma: cùng image ai-service, `ROLE=migrate`, chạy `alembic upgrade head` bằng role `ai_svc`;
- `prisma migrate deploy` áp dụng migration đã commit, không đẩy schema trực tiếp vào DB, nên không chủ động làm mất dữ liệu cũ;
- DB mới (volume rỗng): init script tạo schema/role trước, sau đó từng `<svc>-migrate` tạo bảng; thêm một service DB mới = thêm file `compose/<svc>.yml` + một dòng `include`;
- nếu bạn thay đổi schema, hãy tạo migration chuẩn trước khi deploy để tránh lệch giữa code và DB.

## Images and the two-PR migration contract flow

**Images.** Every Node service is built from one recipe, `deploy/Dockerfile.node`
(`docker build -f deploy/Dockerfile.node --build-arg SERVICE=<apps dir> kmaedu-be`), and the Python
service from `apps/ai-service/Dockerfile` (context `kmaedu-be/`; it regenerates the gRPC stubs from
`proto/`). The image is named `ghcr.io/tgiap04/kmaedu-<key>` and tagged by git SHA (`:main` follows the
last deploy); compose reads the tag from `${<KEY>_TAG:-main}` (`<KEY>` = key upper-cased, `-` to `_`,
e.g. `STUDY_ROOM_TAG`). `deploy/services.json` is the single list of services (key = compose service
name, `dir`, `db`, `worker`, optional `env` / `proto` when the env-file or proto package name differs from
the key, `instances` for the gateway); CI and the deploy script read it.

One image serves every role of a service. The entrypoint reads `ROLE`:

| `ROLE` | What runs |
|---|---|
| `api`, `worker`, `api,worker` (default `api`) | `node dist/apps/<svc>/main` |
| `migrate` | `prisma migrate deploy` for that service's schema, then exit (never `db push`, never `migrate resolve`) |
| `seed` | the service seed; `SEED_PROFILE=prod` (default) = reference data only (admin page flags, word-family categories, ai-chat subjects), `SEED_PROFILE=dev` = dev users and samples |

An unknown `ROLE` exits 64 with a message. The `seed` compose service builds the `seed` target of the same
Dockerfile, which carries every seed.

**Which services does a change touch?** `scripts/changed-services.sh <base> <head>` prints
`{"wave1":[...],"wave2":[...]}`: `apps/<dir>/**`, `deploy/compose/<key>.yml` and `deploy/env/<env>.env.example`
select one service; `libs/**`, `package.json`, `yarn.lock`, `tsconfig*.json`, `nest-cli.json`,
`deploy/Dockerfile.node` and `deploy/docker-entrypoint.sh` select every Node service; `proto/kmaedu/<x>/**`
selects the server of `x` in wave 1 (it ships before any caller); `proto/kmaedu/{common,events}/**` selects
everything. `FORCE_ALL=1` or an unknown base selects everything. Tests: `bash scripts/changed-services.test.sh`.

**Migrations run while the previous image is still serving.** A migration must therefore be backward
compatible (expand), and the destructive half goes in a later PR (contract).

1. **PR 1, expand.** Add the new column or table (nullable, or `NOT NULL` with a `DEFAULT`), add indexes,
   make the code write both shapes or read the new one with a fallback. It deploys normally.
2. **PR 2, contract.** Drop or rename the old column, change a type, set `NOT NULL`. Label the PR
   `migration:contract`. Merge it only after every service that used the old shape runs the image from PR 1
   (check `git log` of the callers and the GHCR tags in `deploy/.tags.env`).

`scripts/lint-migrations.sh <base> <head>` enforces this on the migration files a PR adds
(`apps/*/prisma/migrations/*/migration.sql`, `apps/ai-service/alembic/versions/*.py`). It fails on
`DROP TABLE|COLUMN|TYPE|SCHEMA`, `RENAME`, `ALTER COLUMN .. [SET DATA] TYPE`, `ALTER TYPE`, `SET NOT NULL`,
`ADD COLUMN .. NOT NULL` without `DEFAULT`, and in Alembic `op.drop_*` (not `drop_index` / `drop_constraint`),
`op.rename_*`, `op.alter_column(.. type_= | nullable=False)` and `op.add_column(.. nullable=False)` without
`server_default`. `DROP INDEX|DEFAULT|NOT NULL|CONSTRAINT` pass. CI sets `MIGRATION_CONTRACT=1` from the
`migration:contract` label, which skips the check. Tests: `bash scripts/lint-migrations.test.sh`.

A contract migration cannot be rolled back by redeploying the previous image (it no longer matches the
schema): its rollback is to roll forward.

## Deploying one service

CI (`.github/workflows/deploy.yml`) builds and deploys only what a push changed; the same steps work by hand.

1. **Detect.** `scripts/changed-services.sh <before> <sha>` prints the changed services in two waves. Wave 1 is
   the server of a changed `proto/kmaedu/<x>/` package (new RPCs exist before any caller ships), wave 2 is
   everything else, alphabetical with `gateway` last. A manual run (`workflow_dispatch`) takes `services`
   (`all` or a comma list, `frontend` included) and `force_rebuild`.
2. **Build.** One matrix job per service pushes `ghcr.io/tgiap04/kmaedu-<svc>:<sha>` and `:main`
   (`deploy/Dockerfile.node` for Node, `apps/ai-service/Dockerfile` for ai; layer cache per service in the GHA cache).
3. **Deploy.** One SSH job (concurrency `deploy-production`) checks out the sha on the VPS, runs
   `docker login ghcr.io` with the read-only token `GHCR_READ_TOKEN` (secret; a PAT with `read:packages`,
   optional `GHCR_READ_USER`), renders the RabbitMQ definitions only when `deploy/rabbitmq/**` changed, then calls
   `deploy/deploy-service.sh <svc> <sha>` for each wave-1 service and then each wave-2 service. The first failure
   stops the job. The FE keeps its own step (build on the VPS).

```bash
cd kmaedu-be/deploy
./deploy-service.sh study-room 3f9c2ab            # <svc> is a key of services.json
DRY_RUN=1 ./deploy-service.sh content 3f9c2ab     # print the docker commands, run nothing
```

`deploy-service.sh` pins the image in `deploy/.tags.env` (`<KEY>_TAG=<sha>`, `KEY` = service name upper-cased,
`-` becomes `_`; compose reads it through a second `--env-file`; no entry means `:main`), pulls, then:

- **Migrate gate.** A database service runs `docker compose run --rm --no-deps <svc>-migrate` first. If it fails
  the tag goes back, the service is never recreated (the old container keeps running), Telegram gets an alert
  and the script exits 1.
- **P3009.** The output contains `P3009` when an earlier failed migration is recorded in `_prisma_migrations`.
  The alert then says a manual resolution is required and nothing automatic happens, ever: the script has no
  resolve, no `db push` and no `down`. Inspect the failed migration and the schema, repair by hand if needed,
  then mark it with the prisma CLI the image carries (`apps/<dir>/prisma/schema` is a directory for
  multi-file schemas, `schema.prisma` otherwise):
  `docker compose --env-file .env --env-file .tags.env run --rm --no-deps --entrypoint ./node_modules/.bin/prisma <svc>-migrate migrate resolve --rolled-back <migration_name> --schema apps/<dir>/prisma/schema`
  (`--applied` when the SQL did complete), and re-run the deploy. The previous image keeps serving meanwhile.
- **Recreate.** `up -d --no-deps --wait --wait-timeout 90`. If the new container is not healthy the tag is restored,
  the old image is recreated and the script exits 1 with an alert. A service with `instances` in `services.json`
  (`gateway-a`, `gateway-b`) is rolled one instance at a time, without reloading nginx: the FE upstream
  re-resolves both names every 5 s and retries the other instance on a refused connect (a reload would close
  idle client keep-alive connections). ai also restarts its separate
  `workerService` (`ai-worker`); the other services run the worker in the same container (`ROLE=api,worker`).

Rollback restores the previous image only, never the database, which is safe only while migrations are expand-only
(see the two-PR flow above). After a `migration:contract` deploy, roll forward.

Alerts use `TELEGRAM_TOKEN` and `TELEGRAM_TO` from the environment (the workflow passes the existing secrets); with
either unset they are a no-op. Tests: `bash deploy/deploy-service.test.sh` (fake docker and curl).

**`CUTOVER_DONE` gate.** Production is deployed once, by the cutover runbook, at the final merge of the refactor.
Until the repository variable `CUTOVER_DONE` is `true` the push-main deploy job is skipped (a notice job says so)
and only the images are built. Set it after the cutover smoke passes.

**`deploy/ci-dummy.env.sh`** prints dummy values for every variable in `.env.example` (and, with
`--service-envs`, writes `env/<name>.env` from the templates); CI uses it for `docker compose config`.

## Container Ports and Networks

No backend container publishes a host port (a static check, `compose-topology.spec.cjs`,
fails CI if one comes back). The only way in is the FE nginx (`kmaedu-frontend`, host port `FE_PORT`, default 6368),
which proxies `/api/` and `/ws/` to the two gateway instances `kmaedu-gateway-a` and `kmaedu-gateway-b` over
`kmaedu-edge` (upstream `gw`, re-resolved every 5 s, see `kmaedu-fe/nginx.conf`). The loopback port `6369` of the
build-on-VPS stack is gone; a host-level proxy must target the FE port.

Reach PostgreSQL, Redis and RabbitMQ from the host through the containers:

```bash
# DB access is per role now (the superuser $POSTGRES_USER is break-glass only):
docker compose exec postgres psql -U auth_svc -d "$POSTGRES_DB"     # any <svc>_svc
docker compose exec redis redis-cli -a "$REDIS_PASSWORD"
docker compose exec rabbitmq rabbitmqctl list_queues
```

Networks (`docker-compose.yml`):

| Network | Name | Members | Why |
|---|---|---|---|
| `edge` | `kmaedu-edge` | gateway-a, gateway-b, FE nginx (joins from `kmaedu-fe/docker-compose.yml`) | the only way in |
| `internal` (`internal: true`, no route out) | `kmaedu-internal` | every service, Postgres, Redis, RabbitMQ, `*-migrate`, seed | service-to-service traffic |
| `egress` | `kmaedu-egress` | auth (Google OAuth, SMTP), r2 (Cloudflare R2), ai and ai-worker (Gemini; the worker also downloads presigned R2 URLs) | the only services with a real internet dependency |

`admin` is on `internal` only. If a service gains an internet dependency, add it
to `egress` and to the list in `compose-topology.spec.cjs`.

Building images: on a Docker VM with 8 GB or less, build the images one service
at a time (`docker compose build <svc>`). Building them all in parallel runs
several `yarn install`s at once and can fail with `cannot allocate memory`.
`.dockerignore` excludes every nested `.env`/`.env.*` (`**/.env`), so local
per-service `.env` files never reach an image.

Bring-up order: this stack first (it creates `kmaedu-edge`), then the FE stack.
Verify the split:

```bash
docker compose exec admin wget -qO- -T 3 https://example.com   # fails: no egress
docker compose exec auth  wget -qO- -T 3 https://example.com   # succeeds
```

### Real client IP

Cloudflare → nginx (`kmaedu-fe`) → gateway. nginx takes `CF-Connecting-IP` only
from Cloudflare ranges (`kmaedu-fe/nginx/cloudflare-real-ip.conf`) and
**overwrites** `X-Forwarded-For` with that address; the gateway trusts that one
hop and keys every rate limit on it. Refresh the ranges from
https://www.cloudflare.com/ips-v4 and `/ips-v6` a few times a year (steps are at
the top of the file). Production puts a host reverse proxy (nginx/Caddy) in front:
`kmaedu-frontend` publishes `FE_PORT` on `127.0.0.1` only (`FE_BIND`), and nginx also
trusts the Docker private ranges, where the host proxy's connections arrive from. The host
proxy must accept only Cloudflare addresses and pass `CF-Connecting-IP` through untouched,
or a client could pick its own address and dodge per-IP limits. Check after the cutover:
gateway logs show distinct client addresses, not one bridge or Cloudflare address.

## Data Persistence

Data is persisted in Docker volumes:

- `postgres_data` - PostgreSQL database
- `redis_data` - Redis cache
- `rabbitmq_data` - RabbitMQ data

To backup volumes:

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql

# Restore PostgreSQL
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < backup.sql
```

## Removing finance-service from an existing stack

finance-service (wallets, subscriptions, SePay payments) was removed. A fresh volume never has its
objects; a dev or staging stack that ran an older image still does.

- Preferred (same as the exam-service removal): `docker compose down -v`, then bring the stack up again
  (the init script creates the nine remaining roles and schemas, each `<svc>-migrate` recreates its tables).
- To keep the volume instead: optionally back up first (`pg_dump -n finance`), then as the Postgres superuser
  `DROP SCHEMA finance CASCADE; DROP ROLE finance_svc;`. On the broker: `rabbitmqctl delete_user finance`,
  delete the queues `finance.events`, `finance.retry.30s`, `finance.dlq` and the exchanges `finance.retry`,
  `finance.requeue`, `finance.dead`, and unbind `finance.subscription.changed` from `aichat.events`.
- Remove `FINANCE_DB_PASSWORD`, `RABBITMQ_FINANCE_PASS`, `FINANCE_SERVICE_CLIENT_SECRET`, `FINANCE_TAG` and the
  `finance` entry of `SERVICE_CLIENTS` from `deploy/.env`, delete `env/finance.env`, and delete the GHCR image
  `kmaedu-finance`. A leaked `finance` service secret is useless: auth no longer issues tokens for that client
  once its `SERVICE_CLIENTS` entry is gone, and no audience `finance` exists.

## Useful Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: destroys data!)
docker compose down -v

# Restart a specific service
docker compose restart gateway-a   # then gateway-b; never both at once

# Scaling: every service pins `container_name`, so `--scale` does not work with
# this file. Run extra replicas from a separate project/override without
# container_name (study-room fan-out across study-room instances needs the Redis adapter, already wired: channel key `studyroom`).

# View resource usage
docker compose stats

# Execute command in container
docker compose exec gateway-a sh
docker compose exec postgres psql -U auth_svc -d "$POSTGRES_DB"
docker compose exec redis redis-cli
```

## Accessing PostgreSQL from your machine

PostgreSQL is **not published** on a host port. To connect with a local client, open an SSH tunnel to the container network and forward a local port:

```bash
# Find the postgres container IP on the VPS, then tunnel through SSH
ssh -N -L 5432:$(ssh user@your-server "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' kmaedu-postgres"):5432 user@your-server

# In another terminal
psql "postgresql://auth_svc:$AUTH_DB_PASSWORD@localhost:5432/$POSTGRES_DB"   # own role, own schema
```

For one-off queries on the server itself, use `docker compose exec postgres psql -U <svc>_svc -d kmaedu` (e.g. `-U auth_svc`; prove isolation with `-U content_svc` then `select 1 from auth."User"` -> `permission denied`).

## Troubleshooting

### Services failing to start

1. Check logs: `docker compose logs <service-name>`
2. Verify environment variables in `.env`
3. Ensure all dependencies are healthy: `docker compose ps`

### Database connection issues

1. Verify the service's `<SVC>_DB_PASSWORD` is set and URL-safe (compose builds its `DATABASE_URL` with `postgres` as hostname, not `localhost`)
2. Check PostgreSQL is healthy: `docker compose ps postgres`
3. Test connection: `docker compose exec postgres pg_isready`

### Redis connection issues

1. Verify REDIS_HOST is set to `redis` (not `localhost`)
2. Check Redis is healthy: `docker compose ps redis`
3. Test connection: `docker compose exec redis redis-cli ping`

### Migration failures

1. Check migration logs: `docker compose logs <svc>-migrate`
2. Ensure PostgreSQL is running before migration
3. Manually run migration: `docker compose run --rm <svc>-migrate`

### Container keeps restarting

1. Check logs: `docker compose logs <service-name>`
2. Verify healthcheck endpoint is responding
3. Check resource limits (memory/CPU)

## Security Recommendations

1. **Change all default passwords** in `.env` file
2. **Use strong secrets** for JWT tokens (32+ characters)
3. **Restrict exposed ports** using firewall rules
4. **Enable Redis password** by setting REDIS_PASSWORD
5. **Use SSL/TLS** in production with a reverse proxy (nginx/traefik)
6. **Regular backups** of PostgreSQL data
7. **Monitor logs** for suspicious activity

## Production Checklist

- [ ] All secrets changed from defaults
- [ ] Firewall configured (only expose necessary ports)
- [ ] SSL/TLS enabled via reverse proxy
- [ ] Database backups scheduled
- [ ] Monitoring/alerting configured
- [ ] Log rotation configured
- [ ] Resource limits set on containers
- [ ] Environment variables validated
- [ ] Health checks responding correctly

## Updating Services

To update a service:

```bash
# Pull latest code
git pull

# Rebuild specific service
docker compose build gateway-a

# Zero-downtime gateway rollout: use deploy/deploy-service.sh gateway <sha> (a, then b; no nginx reload)

# Or restart all services
docker compose up -d --build
```

## Support

For issues or questions, please refer to the main project documentation or create an issue in the repository.

## Gateway a/b and memory budget (phase 16)

**Gateway a/b.** `gateway-a` and `gateway-b` are one definition (`compose/gateway.yml`, same image, env and
`env/gateway.env`), both on `edge` + `internal`, `stop_grace_period: 30s`. The gateway keeps no state of its own:
revocation (`gw:revoked:sid:*`), authz versions (`gw:user:*:av`), page flags and rate limits live in Redis, and the
RabbitMQ consumer (`gateway.events`, one durable queue, competing consumers) only writes that same Redis state, so
either instance may serve any request or event. Both carry the network alias `gateway` on `internal`: auth/admin keep
calling `GATEWAY_GRPC_URL=gateway:50051` and reach whichever instance is up (their control calls write Redis too; the
durable event is the backstop for a missed call). nginx retries a request on the other instance only for idempotent
methods on `/api/` (`proxy_next_upstream error timeout http_502 http_503`); WebSocket and SSE connections cut by a
stopping gateway reconnect, an in-flight AI chat stream is re-sent by the user. nginx 1.27.3+ is required for `resolve`
in the upstream (the FE image is `nginx:1.27-alpine`, 1.27.5 today).

**Memory limits (`mem_limit`, hard cap per container).** Measure on the VPS after cutover and tune; collapse nothing yet.

| Container | Limit | Notes |
|---|---|---|
| `gateway-a`, `gateway-b` | 256m each | router only |
| `auth`, `assessment`, `content`, `document`, `ai-chat`, `study-room` | 512m each | NestJS API + worker (`ROLE=api,worker`) |
| `admin`, `vocabulary`, `r2` | 384m each | smaller surface |
| `<svc>-migrate`, `seed` (one-shot) | 512m | `prisma migrate deploy` / seed |
| `ai` | 1536m | gRPC + retrieval |
| `ai-worker` | 2g | OCR (tesseract/opencv) and generation |
| `ai-migrate` | 512m | Alembic |
| `postgres` | 1g | `max_connections=200` |
| `rabbitmq` | 512m | |
| `redis` | 256m | AOF on |
| `rabbitmq-defs` | 128m | renders definitions |

The caps of the long-running containers add up to about 10.5 GB (the typical working set is far lower). The caps
are not reservations: on a VPS under 16 GB, measure `docker compose stats` after cutover and lower the `ai-worker`
and the Node caps (or collapse api/worker) before relying on it.

**Worker liveness.** `ai-worker` has no HTTP port. It touches `/tmp/worker-heartbeat` every 30 s while its broker
connection, outbox relay and purge are alive (`src/backend/messaging/heartbeat.py`); the compose healthcheck is
`find /tmp/worker-heartbeat -mmin -2 | grep -q .`. Node workers run inside the `api,worker` containers, which already
have the HTTP health check (`admin` has no worker code and stays `api`; `study-room` consumes inside its API process).
