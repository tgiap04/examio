# Phase 01 verification runs
Every command: real exit code + one-line result. Working dir noted.

## Step 1 — scripts (baseline, before any code change)
- `cd examio-be && yarn typecheck` → exit 0 (all 6 services clean at baseline; no pre-existing type errors)
- injected type error in finance-service then `yarn typecheck:finance` → exit 2 (gate catches it; file removed after)
- `yarn build:all` (6 nest builds, first attempt used `for` loop which yarn-berry shell rejects → rewritten as `&&` chain) → exit 0, 6x webpack compiled successfully
- BASELINE `yarn test` (before any change) → exit 1: 1 failed / 248 passed (27 suites). Failing: `apps/admin-service/src/modules/admin-stats/admin-stats.service.spec.ts` "getSeries queries raw SQL…" — test bug (expects yesterday's row at points[6]; 7d series ends at today so yesterday is points[5]); fails in TZ=UTC and Asia/Ho_Chi_Minh. File is outside phase-01 ownership → LEFTOVER, not edited.

## Step 2 — Prisma bump (pinned prisma + @prisma/client + @prisma/adapter-pg = 6.19.3, pg ^8.16.3, @types/pg dev)
- `yarn install` → exit 0 (network ok; yarn.lock updated)
- `yarn prisma:generate` → exit 0 (prisma-client-js generator kept)
- `yarn typecheck` → exit 0
- `yarn test` → exit 1: same single pre-existing admin-stats failure, 248 passed (unchanged vs baseline → bump introduced no regression)

## Step 4/5 — dead code + builds
- Deleted (git working tree): apps/ocr-service (tracked files), ocr.proto, gateway exam/finance-proxy controllers, session-validation.middleware.ts, FE virtualTeacherApi/genaiTutorKnowledgeApi/useAITeacherStore/useGenAIKnowledgeStore/AITeacherPage, ai-service score/ agent/ streamlit_ui/ evaluate_chatbot.py benchmark_index_service.py seed_benchmark_index.py, benchmark-item.prisma
- `yarn prisma:merge` → exit 0; schema.prisma diff = only BenchmarkItem model removed (-25 lines)
- `yarn prisma:generate` → exit 0
- `yarn typecheck` → exit 0
- `yarn build:all` → exit 0
- Route inventory diff before/after dead-code trim (`diff route-inventory-before.json route-inventory.json`) → only removed: 2 flashcard-study (cards, history) + 4 session routes + 7 quiz-practice-attempts routes (13 lines); nothing else changed
- `cd examio-fe && yarn build` → exit 0 (vite built in ~12s)
- `cd examio-fe && yarn lint` → exit 1: 5 errors / 32 warnings, ALL in files untouched by this phase and outside ownership (src/lib/authRedirect.ts:12 no-control-regex; src/pages/study-flashcard/FlashcardStudyPage.tsx:169,170,173 no-use-before-define; src/templates/ExamRoomDetailTemplate.tsx:81 unicorn/prefer-number-properties) → LEFTOVER
- `cd apps/ai-service && ./venv/bin/ruff check src` → exit 1: 1391 errors after (1725 at HEAD baseline; the 334 removed were in deleted code). Pre-existing style debt (E/D/UP/T201...), not introduced here. `ruff check src --select F821,E9` → 5 pre-existing undefined-name errors (generation_service.py:1140,1151 ModelUnavailableError; graph_retriever.py:264,265,293) identical at baseline → LEFTOVER
- (ai-service greps: see Final criteria section)

## Step 6/7/8 — TDD + observability + guard
- RED proven first: `yarn jest libs/common/src/guard/auth.guard.spec.ts apps/auth-service/test` → exit 1 (TS2307 cannot find allow-unverified.decorator); `yarn jest libs/observability` → exit 1 (TS2307 health.controller/readiness-check missing); `route-inventory.spec.ts` → exit 1 (fixture missing).
- GREEN: auth.guard.spec (9 tests) + allow-unverified-allowlist.spec (1) → exit 0 (11 passed); libs/observability (health.controller 5 + logger 7 = 12 passed) → exit 0; libs/database + libs/redis readiness specs (6 tests incl.) → exit 0; route-inventory spec (2 tests) → exit 0
- Added devDeps for e2e that were missing at HEAD: supertest ^7.1.4, @types/supertest ^6.0.3. New deps: @nestjs/terminus 11.1.1 (12.x is ESM-only, breaks ts-jest/CJS), nestjs-pino 5.3.1, pino 10.4.0, pino-http 11.0.0, ulid 3.0.2.
- `yarn typecheck` → exit 0 (after wiring 6 services)

## Step 9 — baseline migration (local pgvector/pgvector:pg16 on host port 55411, container p01-pg, removed after)
- `prisma migrate dev --create-only --name baseline --schema=libs/database/src/schema.prisma` (DATABASE_URL=localhost:55411 explicitly exported; .env remote URL NOT used) → created 20261017194544_baseline (1180 lines incl. prepended `CREATE EXTENSION IF NOT EXISTS vector; ... "uuid-ossp";`)
- `sh deploy/entrypoint-migration.sh` on empty DB → "All migrations have been successfully applied", 48 public tables, vector 0.8.7 + uuid-ossp present; 2nd run idempotent
- `prisma migrate status` → "Database schema is up to date!"; `prisma migrate diff --from-url <db> --to-schema-datamodel schema.prisma --exit-code` → "No difference detected"

## Step 7 e2e (infra: p01-pg + redis:7-alpine :56379 + rabbitmq:3.13-management-alpine :55672; removed after)
Command per service: `cd apps/<svc>-service && ../../node_modules/.bin/jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (env from CI block: DATABASE_URL, REDIS_*, RABBITMQ_URL, JWT_SECRET, REFRESH_TOKEN_ENC_KEY)
- auth exit 0 (3/3) · exam exit 0 (3/3) · finance exit 0 (3/3) · admin exit 0 (3/3) · r2 exit 0 (3/3) · gateway exit 0 (3/3)
- Plan's literal command `cd apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json` → exit 0 (3/3; also runs fine without --testPathPatterns for auth)
- admin full e2e (incl. pre-existing admin.e2e-spec.ts, never runnable at HEAD: no jest config, no supertest) → exit 1, 5 failed/3 passed → LEFTOVER (CI runs only app.e2e-spec for admin)
- Finding: `app.close()` right after boot can hang on RabbitMQ channel teardown (libs/common events) — seen on auth (1 of 5 runs) and finance (1 of 1). Specs bound close to 5s; jest-e2e.json forceExit:true. Pre-existing shutdown behaviour.

## Step 10/11 — compose (scratch copy of examio-be in scratchpad, own .env with dummy secrets, project p01compose, ai service excluded; deploy/.env with real secrets NOT used)
- `docker compose -p p01compose build migration gateway auth exam finance admin r2` (node:22-alpine) → exit 0
- `docker compose -p p01compose up -d gateway auth exam finance admin r2` on empty volumes → exit 0 (after adding dummy SePay/Google env that the services demand in NODE_ENV=production); examio-migration Exited (0); all 6 services (healthy)
- `wget /health/ready` inside each container: gateway 200 {redis up}; auth/exam/finance/admin 200 {database up, redis up}; r2 200 {}
- Gateway on host :6369: `GET /health/live` 200 with `X-Request-Id: req_<ulid>`; inbound `X-Request-Id: req_mine` echoed
- Logs are JSON; request with `Authorization: Bearer SECRET-TOKEN-123` + `Cookie: token=SECRET-COOKIE` → both logged as "[Redacted]"; grep for the secrets in gateway+auth container logs → 0 hits
- `docker stop examio-redis` → gateway `/health/ready` → HTTP/1.1 503 Service Unavailable; redis restarted afterwards
- `docker compose down -v --remove-orphans` → exit 0; p01compose-* images removed; p01-* containers removed

## Final criteria
- `cd examio-be && yarn typecheck` → exit 0
- `cd examio-be && yarn build:all` → exit 0
- `cd examio-be && yarn test` → exit 1: 277 passed / 1 failed (34 suites). Only failure = pre-existing admin-stats.service.spec.ts (out of ownership; test expects yesterday at points[6], should be [5]). Baseline was 248 passed / 1 failed.
- `cd examio-fe && yarn build` → exit 0
- `cd examio-fe && yarn lint` → exit 1 (5 pre-existing errors in 3 untouched files, see Step 4/5)
- `grep -n '"prisma": "6.19' examio-be/package.json` → 1 hit (line 101, 6.19.3)
- `grep -rn "prisma\|@examio/database" examio-be/libs/observability/src` → no output (grep exit 1)
- `grep -rn "db push" examio-be/deploy` → none (grep exit 1); `grep -n 5411 examio-be/deploy/docker-compose.yml` → none; `grep -rn "node:20" examio-be/deploy` → none
- `grep -rn "BenchmarkItem" examio-be/libs/database examio-be/apps --exclude-dir=node_modules --exclude-dir=venv` → none; `ls examio-be/apps/ai-service/src/score` → No such file or directory; `grep -rnE "src\.score|supervisor_agent|benchmark_index" examio-be/apps/ai-service --exclude-dir=venv --exclude-dir=__pycache__` → none
- ai-service `/health` 200 after boot: NOT RUN (ai-service image not built: heavy ML deps; only import/ruff checks done: `ruff check src --select F821,E9` identical 5 pre-existing errors; main.py parses)
- Spike verdict (plan.md): NOT DONE by design (separate agent)
- "A PR with a type error in finance-service turns CI red": mechanism verified locally (`yarn typecheck:finance` exit 2 with injected error); GitHub Actions run itself NOT executed (no push permitted)

## Pre-existing fixes
Scope extension approved by user for these files only. Nothing committed/pushed.
- `cd examio-be && TZ=UTC yarn test` → exit 0 (34 suites / 278 tests passed; was 277+1 failed)
- `cd examio-be && TZ=Asia/Ho_Chi_Minh yarn test apps/admin-service/src/modules/admin-stats` → exit 0 (12/12). Also TZ=America/Los_Angeles → exit 0 (12/12)
  - Root cause: service is correct (`startOfNDaysAgo(7)`..`startOfToday()` inclusive = 7 UTC days, last = today, yesterday = index 5). Test expected index 6 and used the real clock. Test now pins Date to 2026-03-10T23:30Z (already the 11th in UTC+7) and asserts points[5] = yesterday, points[6] = today.
- `cd examio-be && yarn typecheck` → exit 0
- `cd examio-fe && yarn lint` → exit 0 (0 errors, 32 warnings; was 5 errors). First attempt after the regex rewrite failed with unicorn/number-literal-case (0x1f), fixed to 0x1F.
- `cd examio-fe && yarn build` → exit 0
- `cd examio-be/apps/ai-service && ./venv/bin/ruff check src --select F821` → exit 0 ("All checks passed!"; was 5 errors)
- `./venv/bin/ruff check src --select F821,F811,F841 --statistics` → 15 F841 + 3 F811 remain (style-level, none in the F821 set)
- ai-service unit test (pytest NOT installed in venv; test is stdlib unittest, pytest-collectable): src/backend/tests/test_generation_service_model_unavailable.py → RED before fix (NameError: ModelUnavailableError, 2 errors), GREEN after (2 passed, exit 0). Run through a scratchpad harness that stubs the `src` package because `src/__init__.py` is currently un-importable (see below).
- `./venv/bin/python -c "import src"` → ImportError: cannot import name 'agent' (src/__init__.py:8 `from . import agent, rag, score, llm`; agent/ and score/ deleted in the working tree). NOT FIXED (outside approved files). Blocks real ai-service startup and the "ai-service /health 200" criterion.
- `git ls-files --error-unmatch examio-be/apps/ocr-service/.env` → not tracked (also gitignored); deleted, then empty apps/ocr-service dir removed.
- `grep -rn FlashcardStudySession examio-fe/src` → only the definition; removed.
- examio-be/Dockerfile (root) is unused by deploy/docker-compose.yml (uses deploy/Dockerfile); bumped node:20-alpine → node:22-alpine anyway (2 occurrences).

## Temper fixes
Uncommitted; nothing pushed.
- Seed log leak: `deploy/entrypoint-seed.sh` now uses `describe_secret()` (`[ -n "${1:-}" ]` -> `<set>`/`<unset>`). `grep -rnE ':\+' examio-be/deploy` found no other occurrence.
  - Check: `DATABASE_URL='postgres://u:SECRETDBPW@h/db' ADMIN_DEFAULT_PASSWORD='SECRETADMINPW' ADMIN_EMAILS=a@b.c sh <seed snippet (script up to `cd /app`)>` -> prints `<set>` for both; `grep -c SECRET` on output -> 0. With both vars unset -> `<unset>` for both. (script exit 0)
- Dockerfile HEALTHCHECK -> `/health/ready`. `grep -rn "api/v1/health" . --exclude-dir={node_modules,venv,.git,plans}` -> exit 0 with docs-only hits left (docs/development-roadmap.md:173, docs/project-changelog.md:284, two 2026-06-07 journals); no code, compose, workflow or script caller remains.
- `apps/admin-service/test/jest-e2e.json`: `testRegex` -> `app\\.e2e-spec\\.ts$`; JSON-compatible `"//"` note: admin.e2e-spec.ts excluded until Phase 04 rewrites it (Phase 04 file list already includes it). Spec file kept.
  - `cd examio-be/apps/admin-service && ../../node_modules/.bin/jest --config test/jest-e2e.json --listTests` -> exit 0, lists only `test/app.e2e-spec.ts`
- Removed git-ignored `__pycache__` dirs under `apps/ai-service/src` (all matched `examio-be/.gitignore:28 **/__pycache__/` via `git check-ignore`; 0 remain).
  - `grep -rn "BenchmarkItem" examio-be/libs/database examio-be/apps --exclude-dir=node_modules --exclude-dir=venv` -> no output, exit 1
- Removed `prisma:push` from `examio-be/package.json`, `CLAUDE.md` and `AGENTS.md` (the latter listed the same script).
- `logger.module.spec.ts`: tautological redaction test replaced. Real pino-http (built from new exported `buildPinoHttpOptions(service)`, the same options `LoggerModule.forRoot` uses) behind a real HTTP server, in-memory Writable stream; asserts `[Redacted]` for authorization/cookie/x-internal-service-token/set-cookie and that no secret value appears in raw output. Added malformed `x-request-id` cases (spaces, disallowed punctuation, >128 chars) -> generated `req_<ulid>` echoed in header and logged as `req.id`; control-char case stays in the `generateRequestId` unit cases (Node refuses to send raw control chars). Mutation check: deleting `req.headers.cookie` from REDACTED_PATHS made the suite fail (1 failed); restored.
- Readiness 503: `HealthController.ready()` rethrows terminus' 503 as `{status:'error', checks:{<name>:'up'|'down'}}`; `run()` calls `session.down()` with no message and logs `Readiness check "<name>" failed: <detail>` via Nest `Logger.warn`. Spec asserts exact body, no `ECONNREFUSED`, no prisma/password text, and that the detail is logged.
- `cd examio-be && yarn typecheck` -> exit 0
- `cd examio-be && yarn build:all` -> exit 0
- `cd examio-be && TZ=UTC yarn test` -> exit 0 (34 suites / 283 tests passed; was 278)
