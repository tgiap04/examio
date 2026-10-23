# Examio Backend - Docker Deployment Guide

This guide explains how to deploy the Examio backend using Docker with containerized PostgreSQL and Redis databases.

## Architecture Overview

The deployment consists of the following containers:
- **PostgreSQL** (Database)
- **Redis** (Cache)
- **RabbitMQ** (Message Queue)
- **Gateway Service** (YAML-routed streaming proxy; JWT verify, revoke/stale checks, rate limits; no database)
- **Auth Service** (Authentication)
- **Exam Service** (Exam Management)
- **Study-room Service** (study rooms: HTTP + Socket.io `/ws/study`; consumes `auth.user.authz_changed` and `auth.user.updated` inside the API process)
- **Vocabulary Service** (word families + categories: HTTP + gRPC `WordFamilyAdminService`/`WordFamilyService`, plus an R2 delete worker for category images in the same container; calls ai-service for generation)
- **Finance Service** (Payment & Wallet)
- **R2 Service** (File Storage)
- **AI Service** (AI Features)
- **`<svc>-migrate`** (`auth-migrate`, `finance-migrate`, `admin-migrate`, `exam-migrate`, `study-room-migrate`, `vocabulary-migrate`: one `prisma migrate deploy` per service schema, each runs once and exits)

The stack is split by service in `compose/*.yml` (`infra`, `auth`, `finance`, `admin`, `exam`, `study-room`, `vocabulary`, `gateway`, `r2`, `ai`, `seed`) and assembled by the `include:` list in `docker-compose.yml` (needs Docker Compose 2.20+). Run every command from `deploy/`; paths stay relative to it.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.20+ (`include:`)
- At least 4GB RAM available
- 20GB disk space

## Deployment Steps

### 1. Setup Environment File

**Option A: Automatic (Recommended)**

Run the setup script to automatically copy the `.env` file:

```bash
# For Linux/Mac
cd examio-be/deploy
./setup-env.sh

# For Windows (PowerShell)
cd examio-be\deploy
.\setup-env.ps1
```

**Option B: Manual**

```bash
# Copy .env from parent directory
cd examio-be/deploy
cp ../.env .env

# Or create from example
cp ../.env.example .env
# Then edit .env with your configuration
```

### 2. Configure Environment Variables

Edit the `.env` file and update the following critical values:

#### Database Configuration (PostgreSQL Container)
```bash
POSTGRES_USER=examio
POSTGRES_PASSWORD=your_strong_password_here
POSTGRES_DB=examio

# One password per service role (all 11 required; URL-safe, e.g. `openssl rand -hex 24`)
AUTH_DB_PASSWORD=...  FINANCE_DB_PASSWORD=...  ADMIN_DB_PASSWORD=...  EXAM_DB_PASSWORD=...
CONTENT_DB_PASSWORD=...  ASSESSMENT_DB_PASSWORD=...  STUDYROOM_DB_PASSWORD=... (used by study-room)
VOCABULARY_DB_PASSWORD=... (used by vocabulary)  AICHAT_DB_PASSWORD=...  DOCUMENT_DB_PASSWORD=...  AI_DB_PASSWORD=...
```

There is no shared `DATABASE_URL`. `postgres/init/01-service-schemas.sh` runs once on an **empty** data volume and creates, for each of `auth finance admin exam content assessment studyroom vocabulary aichat document ai`, the role `<svc>_svc` (own password, `CONNECTION LIMIT 40`), the schema `<svc>` it owns, and a role-level `search_path = <svc>, extensions` (pgvector lives in `extensions`). `PUBLIC` has no privileges on the database or on `public`, so one role cannot read another's schema (`content_svc` selecting from `auth."User"` gets `permission denied`). Compose gives each service `postgresql://<svc>_svc:...@postgres:5432/$POSTGRES_DB?schema=<svc>`; the Python ai-service connects as `ai_svc` (no `?schema=`, it pins `DB_SEARCH_PATH=exam,extensions`, and has a temporary DML grant on `exam` until phase 15). Changing a password or adding a role later needs a volume reset (`down -v`) or a manual `ALTER ROLE`. Per-service variable lists: `env/<svc>.env.example`.

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
JWT_ISSUER=examio-auth
JWT_AUDIENCE=examio
ACCESS_TOKEN_EXPIRATION=15m
# Service tokens: `scripts/gen-service-secret.sh <exam|studyroom|vocabulary|finance|admin|gateway>` prints the secret
# (that service only) and the hash that goes into auth's SERVICE_CLIENTS.
SERVICE_CLIENTS={"exam":"<sha256>","studyroom":"<sha256>","vocabulary":"<sha256>","finance":"<sha256>","admin":"<sha256>","gateway":"<sha256>"}
EXAM_SERVICE_CLIENT_SECRET=<secret>
STUDYROOM_SERVICE_CLIENT_SECRET=<secret>
VOCABULARY_SERVICE_CLIENT_SECRET=<secret>
FINANCE_SERVICE_CLIENT_SECRET=<secret>
ADMIN_SERVICE_CLIENT_SECRET=<secret>
# Gateway uses it to pull AdminService.GetPageFlags at boot (compose maps it to the gateway's SERVICE_CLIENT_SECRET; optional).
GATEWAY_SERVICE_CLIENT_SECRET=<secret>
# AUTH_JWKS_URL / AUTH_TOKEN_URL are plain http on the INTERNAL network (compose: http://auth:3000/...).
# Never point them at a public http host: whoever controls the JWKS controls who is an admin.
# A public JWKS must be https.
REFRESH_TOKEN_SECRET=change_this_to_another_secure_string
REFRESH_TOKEN_EXPIRATION=7d
QUIZ_JWT_SECRET=change_this_to_quiz_secret_32_chars_min
QUIZ_AES_KEY=change_this_to_aes_key_32_chars_min
```

#### RabbitMQ Configuration
```bash
# Ops/admin user (management UI only; apps do not connect with it)
RABBITMQ_USER=admin
RABBITMQ_PASS=secure_password_here
# One broker user per service; docker-compose.yml builds each service's RABBITMQ_URL.
# Passwords go into amqp:// URLs: use URL-safe characters (e.g. `openssl rand -hex 24`).
RABBITMQ_AUTH_PASS=...
RABBITMQ_FINANCE_PASS=...
RABBITMQ_EXAM_PASS=...
RABBITMQ_STUDYROOM_PASS=...
RABBITMQ_AI_PASS=...
RABBITMQ_GATEWAY_PASS=...
```

Broker users and permissions are rendered from `rabbitmq/definitions.template.json` into the gitignored `rabbitmq/definitions.json` by the one-shot `rabbitmq-defs` service. `setup-env.sh` and the deploy workflow run `docker compose run --rm rabbitmq-defs` before `up`; it fails if any password above is missing.

#### AI Service
```bash
# AI2 is used only for quiz/flashcard/content generation.
AI2_BASE_URL=https://ai2.devt.vn/v1
AI2_API_KEY=your_ai2_api_key
AI2_GENERATION_MODEL_NAMES=minimax-m2.5-free,nemotron-3-super-free,trinity-large-preview-free
AI2_DEFAULT_MODEL=minimax-m2.5-free
AI2_TIMEOUT_SECONDS=3600
AI2_MAX_TOKENS=4096
DEFAULT_MAX_TOKENS=4096
DEFAULT_MAX_TOKENS_CAP=4096
TUTOR_FAST_RETRIEVAL_TIMEOUT_SECONDS=0.5
CHAT_HISTORY_MAX_MESSAGES=4
CHAT_HISTORY_MAX_CHARS=1200

# Gemini remains available for content generation selection and uses the same token cap.
GEMINI_API_KEYS=key1,key2
GEMINI_MODEL_NAMES=gemini-2.0-flash,gemini-1.5-flash

# Gemini is used for OCR/RAG embeddings.
GEMINI_EMBEDDING_MODEL=models/text-embedding-004
```

#### R2 Storage (Cloudflare)
```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=examio
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://pub-....r2.dev
```

`R2_PUBLIC_URL` is required by auth, exam and vocabulary (they map a stored URL back to an R2 key; a URL on another host is never deleted). Deleting a record queues its R2 keys in `r2_delete_tasks` in the same transaction, and a worker (`libs/messaging/src/r2-delete`) removes them through r2-service with retries; exam and vocabulary therefore run `ROLE=api,worker` in `compose/exam.yml` and `compose/vocabulary.yml`.
Use a hostname dedicated to the bucket for `R2_PUBLIC_URL` (e.g. the `r2.dev` host or a custom domain that serves nothing else): any client-supplied image URL on that hostname, on any port or path, must be a key the caller owns, so a shared hostname would also reject unrelated images on it. User-owned objects are stored under `<area>/<ownerUserId>/…`; only those keys are ever deleted on a user's behalf.

#### Payment (SePay)
```bash
PAYMENT_SERVICE_SEPAY_KEY=your_sepay_key
PAYMENT_BASE_URL=https://my.sepay.vn
PAYMENT_QR_BANK_ACCOUNT=your_bank_account
PAYMENT_QR_BANK_CODE=your_bank_code
PAYMENT_WEBHOOK_SECRET_KEY=your_webhook_secret
```

#### Admin Bootstrap & Seed
```bash
# Comma-separated list of SYSTEM_ADMIN emails (synced by auth-service on startup
# and by `yarn bootstrap:admin`; moved from admin-service in phase 04)
ADMIN_EMAILS=admin@examio.vn
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
> order auth -> finance -> admin -> exam -> vocabulary (each with its own role/schema URL, `<SVC>_DATABASE_URL`),
> then exits.
> The script picks up `ADMIN_DEFAULT_PASSWORD` from `deploy/.env`, so
> seeded users share the same password as admins created by the
> auth-service bootstrap. Idempotent — safe to re-run.
>
> Roles: new accounts are STUDENT; promote with `yarn bootstrap:admin:grant <email> [--teacher]`
> (auth-service CLI) and run `yarn finance:reconcile-teachers` if a TEACHER wallet is missing.
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
docker compose logs -f gateway
```

### 4. Verify Deployment

Check service health:

```bash
# Check all containers are running
docker compose ps

# Liveness (process is up) and readiness (database/redis reachable) of the gateway
curl http://localhost:6369/health/live
curl http://localhost:6369/health/ready

# Check RabbitMQ management (if exposed)
# Access http://your-server:15672 (default: admin/admin)
```

### 5. Database Migration

Each database-owning service has its own one-shot migration container that runs automatically on startup. Check its logs:

```bash
docker compose logs auth-migrate     # or finance-migrate | admin-migrate | exam-migrate | study-room-migrate | vocabulary-migrate
```

Lưu ý quan trọng:
- `auth`, `finance`, `admin`, `exam`, `study-room`, `vocabulary` phụ thuộc vào `<svc>-migrate` tương ứng với điều kiện `service_completed_successfully`; `ai` chờ `exam-migrate` (bảng vẫn thuộc schema `exam` đến phase 15); `gateway` và `r2` không có database nên không chờ migration nào;
- mỗi `<svc>-migrate` build từ `Dockerfile.migration` (`ARG SERVICE`), chạy `prisma migrate deploy --schema apps/<svc>-service/prisma[...]` bằng chính role `<svc>_svc` của service đó (exam dùng thư mục multi-file `apps/exam-service/prisma/schema`; `study-room` dùng role/schema `studyroom`; `vocabulary` dùng role/schema `vocabulary`);
- `prisma migrate deploy` áp dụng migration đã commit, không đẩy schema trực tiếp vào DB, nên không chủ động làm mất dữ liệu cũ;
- DB mới (volume rỗng): init script tạo schema/role trước, sau đó từng `<svc>-migrate` tạo bảng; thêm một service DB mới = thêm file `compose/<svc>.yml` + một dòng `include`;
- nếu bạn thay đổi schema, hãy tạo migration chuẩn trước khi deploy để tránh lệch giữa code và DB.

## Container Ports and Networks

Only the gateway publishes a host port:

- **127.0.0.1:6369** → Gateway (3000 internally), bound to loopback only; the FE nginx reaches it over `examio-edge`. Phase 16 moves it behind nginx. A host-level proxy on the same machine may use this port.

PostgreSQL, Redis and RabbitMQ publish **no** host port (a static check,
`compose-topology.spec.cjs`, fails CI if one comes back). Reach them from the
host through the containers:

```bash
# DB access is per role now (the superuser $POSTGRES_USER is break-glass only):
docker compose exec postgres psql -U auth_svc -d "$POSTGRES_DB"     # any <svc>_svc
docker compose exec redis redis-cli -a "$REDIS_PASSWORD"
docker compose exec rabbitmq rabbitmqctl list_queues
```

Networks (`docker-compose.yml`):

| Network | Name | Members | Why |
|---|---|---|---|
| `edge` | `examio-edge` | gateway, FE nginx (joins from `examio-fe/docker-compose.yml`) | the only way in |
| `internal` (`internal: true`, no route out) | `examio-internal` | every service, Postgres, Redis, RabbitMQ, `*-migrate`, seed | service-to-service traffic |
| `egress` | `examio-egress` | auth (Google OAuth, SMTP), exam (Turnstile), finance (SePay), r2 (Cloudflare R2), ai (Gemini) | the only services with a real internet dependency |

`admin` is on `internal` only. If a service gains an internet dependency, add it
to `egress` and to the list in `compose-topology.spec.cjs`.

With `NODE_ENV=production`, auth also verifies Cloudflare Turnstile on login and
register (`apps/auth-service/src/auth.controller.ts`): requests without a
`turnstileToken` are rejected and each token is checked against
`challenges.cloudflare.com`. An offline production-mode stack therefore cannot
log in unless Turnstile is reachable.

Building images: on a Docker VM with 8 GB or less, build the images one service
at a time (`docker compose build <svc>`). Building them all in parallel runs
several `yarn install`s at once and can fail with `cannot allocate memory`.
`.dockerignore` excludes every nested `.env`/`.env.*` (`**/.env`), so local
per-service `.env` files never reach an image.

Bring-up order: this stack first (it creates `examio-edge`), then the FE stack.
Verify the split:

```bash
docker compose exec admin wget -qO- -T 3 https://example.com   # fails: no egress
docker compose exec auth  wget -qO- -T 3 https://example.com   # succeeds
```

### Real client IP

Cloudflare → nginx (`examio-fe`) → gateway. nginx takes `CF-Connecting-IP` only
from Cloudflare ranges (`examio-fe/nginx/cloudflare-real-ip.conf`) and
**overwrites** `X-Forwarded-For` with that address; the gateway trusts that one
hop and keys every rate limit on it. Refresh the ranges from
https://www.cloudflare.com/ips-v4 and `/ips-v6` a few times a year (steps are at
the top of the file). If a host-level proxy or Cloudflare Tunnel sits between
Cloudflare and nginx, add its address as another `set_real_ip_from`; confirm the
production topology before the cutover (gateway logs must show distinct client
addresses, not Cloudflare ranges).

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

## Useful Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: destroys data!)
docker compose down -v

# Restart a specific service
docker compose restart gateway

# Scaling: every service pins `container_name`, so `--scale` does not work with
# this file. Run extra replicas from a separate project/override without
# container_name (study-room fan-out across study-room instances needs the Redis adapter, already wired: channel key `studyroom`).

# View resource usage
docker compose stats

# Execute command in container
docker compose exec gateway sh
docker compose exec postgres psql -U auth_svc -d "$POSTGRES_DB"
docker compose exec redis redis-cli
```

## Accessing PostgreSQL from your machine

PostgreSQL is **not published** on a host port. To connect with a local client, open an SSH tunnel to the container network and forward a local port:

```bash
# Find the postgres container IP on the VPS, then tunnel through SSH
ssh -N -L 5432:$(ssh user@your-server "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' examio-postgres"):5432 user@your-server

# In another terminal
psql "postgresql://auth_svc:$AUTH_DB_PASSWORD@localhost:5432/$POSTGRES_DB"   # own role, own schema
```

For one-off queries on the server itself, use `docker compose exec postgres psql -U <svc>_svc -d examio` (e.g. `-U auth_svc`; prove isolation with `-U content_svc` then `select 1 from auth."User"` -> `permission denied`).

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
docker compose build gateway

# Restart service with zero downtime (if using multiple instances)
docker compose up -d --no-deps gateway

# Or restart all services
docker compose up -d --build
```

## Support

For issues or questions, please refer to the main project documentation or create an issue in the repository.
