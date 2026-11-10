# Tester report: Examio -> KMAEdu rebrand runtime verification

Env: local Docker (pgvector/pgvector:pg16, redis:7, rabbitmq:3.13), CI env values from ci.yml exported explicitly; no gitignored env file read. Staged tree, no tracked file modified. `yarn install --immutable` and `proto:gen`/`prisma:generate` not rerun (controller verified); `yarn build:all` was run.

## be-boot (ci.yml job)
| Command | Exit | Result |
|---|---|---|
| yarn build:all | 0 | all services compiled |
| 01-service-schemas.sh (roles/schemas, DB kmaedu_ci) | 0 | 9 roles/schemas |
| prisma migrate deploy x8 (auth admin content assessment studyroom vocabulary document aichat) | 0 each | all applied |
| ./scripts/boot-built-services.sh (BOOT_CWD=scratch dir, rabbit guest) | 0 | 10/10 ok (http live; grpc up on auth content vocabulary document r2 gateway) |
| COMPOSE_DEFAULTS=1 ./scripts/boot-built-services.sh | 0 | 10/10 ok |

## be-e2e (ci.yml job; RabbitMQ from rendered definitions, fresh DB)
| Step | Exit | Tests |
|---|---|---|
| render-definitions.cjs (9 users) + broker ping | 0 | - |
| roles + migrate x8 | 0 | - |
| prisma migrate diff --exit-code x8 (no drift) | 0 each | - |
| db-isolation (CI=true) | 0 | 69/69 |
| health e2e auth / admin / r2 / gateway | 0 | 3/3 each |
| messaging: register-outbox | 0 | 2/2 |
| messaging: libs/messaging | 0 | 1/1 |
| identity+RBAC auth (7 suites) | 0 | 51/51 |
| admin e2e | 0 | 17/17 |
| cross-app admin-roles/ban/admin-users | 0 | 30/30 |
| content (whole folder, 21 suites) | 0 | 180/180 |
| assessment (18 suites) | 0 | 139/139 |
| study-room | 0 | 22/22 |
| vocabulary | 0 | 19/19 |
| ai-chat | 0 | 77/77 |
| document | 0 | 60/60 |
| auth ownership | 0 | 4/4 |
| cross-app demoted-owner + assessment-real-content | 0 | 6/6 |
| study-room redis adapter (real Redis) | 0 | 6/6 |
| gateway e2e (7 suites) | 0 | 62/62 |
| cross-app gateway-integration | 0 | 9/9 |

Total e2e tests: 757 passed, 0 failed. Proves proto paths, exchange `kmaedu.events`, JWT iss/aud `kmaedu-auth`/`kmaedu`, DB `kmaedu_ci`, broker permissions work at runtime.

## ai-service
| Command | Exit | Result |
|---|---|---|
| ROLE=migrate ./venv/bin/python -m src.main (Alembic, ai_svc) | 0 | 0001 baseline applied |
| ./venv/bin/python -m pytest -q (REQUIRE_INTEGRATION=1, AI_TEST_DATABASE_URL, AI_TEST_RABBITMQ_URL against Docker) | 0 | 174 passed, 0 failed, 0 skipped, 12 warnings |
| python -m ruff check (CI module list) | 0 | all checks passed |

venv python works after folder rename; no recreate needed. Source imports resolve to kmaedu-be.

## Deploy config
| Command | Exit | Result |
|---|---|---|
| ci-dummy.env.sh + `docker compose config -q` and `--profile seed` | 0 / 0 | renders. Run in a copy of git-tracked deploy/ (scratchpad) because deploy/.env exists locally and CI step ends with `rm -f .env env/*.env`; real file untouched |
| nginx:1.27-alpine nginx -t (kmaedu-gateway-a/b hosts) | 0 | ok |
| node --test compose-topology.spec.cjs render-definitions.spec.cjs | 0 | 63 pass, 0 fail |
| changed-services.test.sh / lint-migrations.test.sh / deploy-service.test.sh | 0 / 0 / 0 | all passed |
| shellcheck (deploy-scripts job file list) | 0 | clean |

Cleanup: containers kmaedu-t-pg/redis/rabbit removed; 5 anonymous volumes of my containers removed. Not run: buf breaking (intentional), pip install step.

**Status:** DONE_WITH_CONCERNS
**Summary:** be-boot, be-e2e (757 tests), ai-service pytest (174, integration enforced), compose/nginx/topology/deploy-script checks all exit 0 with zero failures; rename holds end to end at runtime.
**Concerns/Blockers:**
1. Local gitignored `apps/*/.env` (admin, ai, auth, gateway, r2) and `deploy/.env` exist; jest e2e runs from apps/<svc> cwd where dotenv/ConfigModule could read them. All DB/Redis/RabbitMQ/JWT vars were exported explicitly (dotenv does not override), so DB access went to local Docker, but unexported vars could not be ruled out.
2. pytest DeprecationWarning paths show stale `examio-be/...` in test_hybrid_retrieval_service.py (stale gitignored __pycache__ co_filename; source imports verified from kmaedu-be). Harmless; clearing __pycache__ removes it.
3. Local env files (`apps/*/.env`, `deploy/.env`) likely still hold old `examio` names (DB name, hosts); not read. User should update them by hand.
