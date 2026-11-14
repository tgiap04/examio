# Phase 01 — Guardrails & Cleanup

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (boundaries §01, decisions 1, 13, 15)
- Red team: [reports/red-team-changes.md](./reports/red-team-changes.md) RT-11, RT-14 (authoritative over this file's earlier text)
- Current state: [reports/scout-current-state-report.md](./reports/scout-current-state-report.md) (Deploy/CI, Gateway, gRPC)
- ARCHITECTURE.md §10.1 (health), §12 P0 row

## Overview
- Priority: P1 · Status: Completed (2026-10-18) · Effort: 2.25d <!-- Red Team: RT-11, RT-14 (was 1.5d: −depcruise −FE vitest, +Prisma bump + 0.5d spike) --> <!-- Updated: Validation Session 1 - ai-service score/benchmark removal (+0.25d) --> · Depends on: —
- Put a CI gate in front of every later phase. Remove dead code so later phases do not have to carry it. Replace `prisma db push` with one baseline migration. Fix the unverified-user guard bug. Bump Prisma and run the Prisma/bundling go/no-go spike that gates phase 11. <!-- Red Team: RT-14 -->

## Key Insights
- No CI quality gate today: `/.github/workflows/deploy.yml` builds and ships on push to main with no tests or lint (verified).
- `yarn build` = `nest build` with no project arg, so it only builds the default project `exam-service` (`nest-cli.json` `sourceRoot`). Other services are never compiled in CI.
- BE has no ESLint. Lint gate = `tsc --noEmit` per service (KISS, no new lint config churn).
- Existing e2e specs (`apps/*/test/app.e2e-spec.ts`) are Nest boilerplate (`GET /` → "Hello World!") that boot full modules (DB/Redis/RabbitMQ). Replace them with `/health/live` checks.
- `deploy/entrypoint-migration.sh` = `db push` + `migrate resolve --applied` over 3 dirs (`20260513100000_remove_user_role`, `20260710120000_money_float_to_int`, `20260724120000_add_user_utm_source`). DB reset (decision 1) → delete them, generate one `baseline`.
- `deploy/docker-compose.yml:375` publishes `5411:5432`. `deploy/entrypoint-seed.sh:5` echoes `DATABASE_URL`.
- Dockerfiles use `node:20-alpine` (`deploy/Dockerfile:15,62`, `Dockerfile.migration:3`, `Dockerfile.seed:4`).
- Guard bug: `libs/common/src/guard/auth.guard.ts` throws `ForbiddenException('Email not verified')` inside `try`, so the `catch` rewrites it as 401 → FE refresh loop. Unverified users also cannot reach `/auth/sendVerificationEmail`, `/auth/verifyAccount`, `/auth/me` (`auth.controller.ts:396,409,621`).
- Prisma is pinned `6.16.2` (`kmaedu-be/package.json:59,89`); generator is `prisma-client-js` (`libs/database/src/schema.prisma:3-4`). The authoritative schema is `libs/database/src/models/*.prisma` (merged into `schema.prisma`); `libs/database/prisma/` is a stale copy (P11 deletes it). <!-- Red Team: RT-14 -->
- Dead code (verified with grep):
  - `apps/ocr-service/` (gRPC 50053 collides with finance). Also `nest-cli.json` project, `package.json` `dev:ocr*`, compose service, `libs/common/src/protos/ocr.proto`.
  - `apps/gateway-service/src/controllers/{exam,finance}-proxy.controller.ts` are not in `gateway.module.ts:78+`.
  - `libs/common/src/middleware/session-validation.middleware.ts` (no importer). `GrpcClientsModule.registerAuthClient` (`grpc-clients.module.ts:80`, no caller).
  - Gateway `FlashcardStudyProxyController` routes `session*`, `cards/:id`, `history/:id` (`ai-study-proxy.controller.ts:626-770`). The backend only has `progress/:id` (`flashcard-study.controller.ts:13,34`). `QuizPracticeProxyController` (`:789+`) has no backend. Phase 07 re-adds practice endpoints.
  - FE `src/apis/virtualTeacherApi.ts` → only `src/stores/useAITeacherStore.ts` → only `src/pages/k/AITeacherPage.tsx` (unrouted). `src/apis/genaiTutorKnowledgeApi.ts` → only `src/stores/useGenAIKnowledgeStore.ts` (no importer). FE `flashcardStudyApi.ts` session/cards/history functions have no caller.
  - `admin-service/src/main.ts:37-55` `ENABLE_ADMIN_GRPC` block references the missing `admin.proto`.
  - <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> ai-service legacy (decisions.md 2026-10-18: delete both, no reload):
    - `apps/ai-service/src/score/` (`database.py` reads `students`/`subjects`/`scores`; incl. `test_score_tool.py`). Only importer: `src/agent/supervisor_agent.py:15`.
    - Dev ReAct agent `src/agent/` (`supervisor_agent.py`, `reactgraph.py`, `example_conversation.py`, `state.py`, `prompts/`) and its only consumers `src/evaluate_chatbot.py:8`, `src/streamlit_ui/` (`streamlit_app.py:277`, `file_upload_handler.py:13`). Nothing under `src/backend` or `src/evaluation` imports them (grep verified). `pyproject.toml:63-71` lists `agent`, `score`, `streamlit_ui` packages.
    - `src/backend/services/benchmark_index_service.py` (runtime DDL `CREATE TABLE "BenchmarkItem"` `:68-86`). It has no HTTP route; importers are the lifespan block `src/backend/main.py:58-65` and `src/evaluation/scripts/seed_benchmark_index.py:12-16` (+ `src/evaluation/README.md:121-135`). The HumanEval `evaluation/pipeline` does not use it.
    - Prisma `libs/database/src/models/benchmark-item.prisma` (`model BenchmarkItem`, merged into `schema.prisma:82-102`).

## Requirements
- Functional: CI runs on PR + push main and blocks deploy on failure. Each Node service has `/health/live` + `/health/ready`. Request logs are JSON (pino) with a `requestId` that is echoed in the `X-Request-Id` response header. Fresh DB comes up via `migrate deploy`. Unverified users can call verification endpoints and `/auth/me`.
- Prisma bumped to `6.19.x` (`prisma` + `@prisma/client`), plus `@prisma/adapter-pg` + `pg` added. The 0.5d spike result (go/no-go) is recorded in `plan.md` before phase 11 starts. <!-- Red Team: RT-14 -->
- <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> ai-service boots without `score`, the dev agent or the benchmark index; the baseline migration has no `BenchmarkItem` table.
- Non-functional: no behaviour change for verified users. Dead-code removal must not change any routed endpoint except the removed dead proxies (snapshot proves it). `libs/observability` imports no Prisma. <!-- Red Team: RT-14 -->

## Architecture
- CI (`/.github/workflows/ci.yml`, also `workflow_call`):
  - `be-check`: matrix over `[auth, exam, finance, admin, r2, gateway]`. Each job runs `yarn install --immutable`, then `yarn prisma:generate`, `yarn typecheck:<svc>`, `nest build <svc>-service`.
  - `be-unit`: `yarn test`.
  - `be-e2e`: service containers `pgvector/pgvector:pg16`, `redis:7`, `rabbitmq:3.13`. Steps: `prisma migrate deploy`, then the per-service e2e.
  - `fe`: `yarn build`, `yarn lint`. FE `yarn test` (vitest) is added by phase 09. <!-- Red Team: RT-11 -->
  - No `depcruise` job here: dependency-cruiser lands enforced (not report-only) in phase 10. <!-- Red Team: RT-11 -->
  - `deploy.yml` gains `quality: uses: ./.github/workflows/ci.yml`. Every deploy job `needs: quality`.
- `libs/observability` (new lib, created here; extended in 16):
  - `HealthModule.forRoot({ checks: ReadinessCheck[] })`: terminus. `live` = process up. `ready` = every injected `ReadinessCheck { name, check(): Promise<void> }` passes, else 503. The lib has no Prisma/Redis/AMQP import; checks come from `libs/database` (`SELECT 1`), `libs/redis` (ping), and later `libs/messaging`. <!-- Red Team: RT-14 -->
  - `LoggerModule`: `nestjs-pino`. `genReqId` = incoming `x-request-id` or a new `req_<ulid>`. Sets response header `X-Request-Id`. Redacts `authorization`, `cookie`, `set-cookie`.
- Guard fix: new `@AllowUnverified()` decorator in `libs/common/src/decorators/`. `AuthGuard` reads it via `Reflector`. In the `catch`, rethrow when `err instanceof HttpException`. (Interim: phase 04 moves the decorator into `libs/auth-jwt` with an extended list.)
- Route snapshot: a jest spec reads Nest `PATH_METADATA`/`METHOD_METADATA` from every controller registered in `GatewayModule`. It writes sorted `METHOD /api/v1/path` lines to `apps/gateway-service/test/fixtures/route-inventory.json`. Phase 05 YAML must cover every line.
- Prisma spike (0.5d, throwaway branch; only the result is kept) <!-- Red Team: RT-14 -->:
  1. `generator client { provider = "prisma-client" output = "<per-service dir>" engineType = "client" }` + `@prisma/adapter-pg`.
  2. `nest build --webpack <svc>-service` bundles the generated client and runs (no native engine in the image).
  3. `prisma migrate deploy` against `DATABASE_URL=...?schema=<svc>` with `search_path` set; a query through the adapter hits the right schema.
  4. Go = all three work in the Docker image → phase 11 uses `prisma-client` + adapter-pg. No-go → fallback: classic `prisma-client-js` with per-service `output`. Record the decision + evidence (commands, exit codes, image size) in `plan.md`.

## Related Code Files
File ownership (globs): `/.github/workflows/**`, `kmaedu-be/deploy/**`, `kmaedu-be/libs/observability/**`, `kmaedu-be/libs/database/src/{migrations/**,readiness.check.ts,index.ts}`, `kmaedu-be/libs/redis/src/{readiness.check.ts,index.ts}`, `kmaedu-be/libs/common/src/{guard/auth.guard.ts,decorators/**,middleware/**,grpc/grpc-clients.module.ts,protos/ocr.proto,index.ts}`, `kmaedu-be/apps/ocr-service/**`, `kmaedu-be/apps/*/src/main.ts`, `kmaedu-be/apps/*/src/*-service.module.ts`, `kmaedu-be/apps/*/src/*-service.controller.ts`, `kmaedu-be/apps/*/test/**`, `kmaedu-be/apps/gateway-service/src/{gateway.module.ts,controllers/exam-proxy.controller.ts,controllers/finance-proxy.controller.ts,controllers/ai-study-proxy.controller.ts,gateway.controller.ts}`, `kmaedu-be/{package.json,nest-cli.json,tsconfig.json,jest.config.js}`, `kmaedu-fe/src/apis/{virtualTeacherApi,genaiTutorKnowledgeApi,flashcardStudyApi}.ts`, `kmaedu-fe/src/stores/{useAITeacherStore,useGenAIKnowledgeStore}.ts`, `kmaedu-fe/src/pages/k/AITeacherPage.tsx`, `kmaedu-be/apps/auth-service/src/auth.controller.ts` (decorator lines only), `kmaedu-be/apps/ai-service/{pyproject.toml,README.md,src/score/**,src/agent/**,src/streamlit_ui/**,src/evaluate_chatbot.py,src/backend/main.py (lifespan benchmark block only),src/backend/services/benchmark_index_service.py,src/evaluation/scripts/seed_benchmark_index.py,src/evaluation/README.md}`, `kmaedu-be/libs/database/src/models/benchmark-item.prisma` <!-- Updated: Validation Session 1 - ai-service score/benchmark removal -->, `plans/261017-1547-microservice-refactor-rbac/plan.md` (spike result section only). <!-- Red Team: RT-11, RT-14 -->

- Create:
  - `/Users/tgiap.dev/devs/kmaedu/.github/workflows/ci.yml`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/observability/src/{index.ts,health/health.module.ts,health/health.controller.ts,health/readiness-check.ts,logger/logger.module.ts}` <!-- Red Team: RT-14 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/readiness.check.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/redis/src/readiness.check.ts` <!-- Red Team: RT-14 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/decorators/allow-unverified.decorator.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/migrations/<ts>_baseline/migration.sql`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/test/route-inventory.spec.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/test/fixtures/route-inventory.json`
- Modify:
  - `/Users/tgiap.dev/devs/kmaedu/.github/workflows/deploy.yml`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/{package.json,nest-cli.json,tsconfig.json,jest.config.js}` (`package.json` also: Prisma `6.19.x`, `@prisma/adapter-pg`, `pg`) <!-- Red Team: RT-14 -->
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/deploy/{Dockerfile,Dockerfile.migration,Dockerfile.seed,docker-compose.yml,entrypoint-migration.sh,entrypoint-seed.sh}`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/guard/auth.guard.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/grpc/grpc-clients.module.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/index.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/services/refresh-token-cipher.service.ts` (comment only)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/auth-service/src/auth.controller.ts` (`@AllowUnverified()` on sendVerificationEmail, verifyAccount, me, logout)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/{auth,exam,finance,admin,r2,gateway}-service/src/main.ts` + root module (logger + health). Remove static `health` handlers in `*-service.controller.ts`, `gateway.controller.ts`.
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/admin-service/src/main.ts` (drop `ENABLE_ADMIN_GRPC` block)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/src/gateway.module.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/*/test/app.e2e-spec.ts` (→ health e2e)
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/apis/flashcardStudyApi.ts`
  - <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/ai-service/{pyproject.toml (drop `agent`/`score`/`streamlit_ui` packages),README.md (score/agent/streamlit/benchmark-index sections),src/backend/main.py (delete lifespan block `:58-65`),src/evaluation/README.md (drop seed-benchmark-index section)}`
- Delete:
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/ocr-service/`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/protos/ocr.proto`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/gateway-service/src/controllers/{exam-proxy,finance-proxy}.controller.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/common/src/middleware/session-validation.middleware.ts`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/migrations/{20260513100000_remove_user_role,20260710120000_money_float_to_int,20260724120000_add_user_utm_source}/`
  - <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/apps/ai-service/src/{score/,agent/,streamlit_ui/,evaluate_chatbot.py,backend/services/benchmark_index_service.py,evaluation/scripts/seed_benchmark_index.py}`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/database/src/models/benchmark-item.prisma`
  - `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/apis/{virtualTeacherApi,genaiTutorKnowledgeApi}.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/stores/{useAITeacherStore,useGenAIKnowledgeStore}.ts`, `/Users/tgiap.dev/devs/kmaedu/kmaedu-fe/src/pages/k/AITeacherPage.tsx`

## Implementation Steps
1. Add BE scripts:
   - `typecheck:<svc>` = `tsc --noEmit -p apps/<svc>-service/tsconfig.app.json` for each service.
   - `typecheck` runs all of them.
   - `build:all` = `for s in auth exam finance admin r2 gateway; do nest build $s-service || exit 1; done`.
   Run `yarn typecheck` locally and fix any existing type errors. Do not suppress them.
2. Prisma bump: `prisma` + `@prisma/client` `6.16.2 → 6.19.x`, add `@prisma/adapter-pg` + `pg`. Keep the `prisma-client-js` generator for now. Run `yarn prisma:generate && yarn typecheck && yarn test`. <!-- Red Team: RT-14 -->
3. Prisma spike (0.5d, time-boxed) per Architecture. Write the go/no-go result into `plan.md`. Do not merge spike code. <!-- Red Team: RT-14 -->
4. Delete dead code (list above). Remove the `registerAuthClient` method, the `ocr-service` project from `nest-cli.json`, `dev:ocr*` from `package.json`, the ocr compose service, and dead exports from `libs/common/src/index.ts`. Trim the `FlashcardStudyProxyController` dead routes. Remove `QuizPracticeProxyController` and unregister it. Remove the FE dead functions.
   <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> ai-service: delete `src/score/`, `src/agent/`, `src/streamlit_ui/`, `src/evaluate_chatbot.py`, `benchmark_index_service.py`, `seed_benchmark_index.py`; drop the lifespan benchmark block in `main.py`; update `pyproject.toml` packages + READMEs. Delete `benchmark-item.prisma` before `prisma:merge` (step 9). Re-grep `grep -rnE "src\.score|supervisor_agent|benchmark_index" kmaedu-be/apps/ai-service/src` → none; `./venv/bin/ruff check src` passes.
5. Run `yarn build:all` and `cd kmaedu-fe && yarn build && yarn lint`. Both must pass.
6. Write the route-inventory spec. Generate `route-inventory.json` after step 4. Commit it as the phase 05 contract.
7. Create `libs/observability`. Add the path alias `@kmaedu/observability` in `tsconfig.json` and `jest.config.js`. Add `readiness.check.ts` to `libs/database` and `libs/redis`. Wire `LoggerModule` and `HealthModule.forRoot({ checks })` into the 6 Node services (gateway: Redis only). Use `app.useLogger(app.get(Logger))`. Delete the static `{status:'ok'}` handlers. <!-- Red Team: RT-14 -->
8. Guard fix: add `@AllowUnverified()`. In `AuthGuard`, skip the `isVerified` check when the metadata is set, and rethrow `HttpException`. Apply the decorator to `logout`, `sendVerificationEmail`, `verifyAccount`, `me`.
9. Baseline migration:
   - Delete the 3 old dirs.
   - On an empty local DB, run `yarn prisma:merge && prisma migrate dev --create-only --name baseline --schema=libs/database/src/schema.prisma`.
   - Prepend `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`.
   - Replace the body of `entrypoint-migration.sh` with `npx prisma migrate deploy --schema=$SCHEMA`.
10. Deploy hygiene:
    - Remove `ports: - '5411:5432'` and document SSH-tunnel access in `deploy/README.md`.
    - Remove the `DATABASE_URL` echo.
    - Bump all `FROM node:20-alpine` → `node:22-alpine`.
    - Compose healthchecks use `/health/ready`.
11. CI: write `ci.yml` (on `pull_request`, `push: main`, `workflow_call`). In `deploy.yml`, add the `quality` job and `needs: quality`. No FE test job, no depcruise job (phases 09 / 10). <!-- Red Team: RT-11 -->

## Tests
- Write first:
  - `libs/common/src/guard/auth.guard.spec.ts`: an unverified user on an `@AllowUnverified` route → passes. An unverified user elsewhere → 403, not 401. A banned user → 401.
  - `libs/observability/src/health/health.controller.spec.ts`: one injected check rejects → 503 naming the check; all pass → 200. <!-- Red Team: RT-14 -->
- `apps/*/test/app.e2e-spec.ts`: `GET /health/live` 200. `GET /health/ready` 200 with containers up.
- `route-inventory.spec.ts`: fails if the generated inventory differs from the committed JSON (update via `UPDATE_ROUTE_INVENTORY=1 yarn test apps/gateway-service/test/route-inventory.spec.ts`).

## Todo List
- [x] BE scripts typecheck/build:all + fix type errors
- [x] Prisma 6.19.x + adapter-pg + pg; spike go/no-go recorded in plan.md <!-- Red Team: RT-14 -->
- [x] Dead code removed (BE + FE)
- [x] ai-service score/ + dev agent + streamlit UI + benchmark index + `BenchmarkItem` model deleted <!-- Updated: Validation Session 1 - ai-service score/benchmark removal -->
- [x] Route inventory snapshot committed
- [x] libs/observability health (injected ReadinessCheck[]) + pino wired into 6 services
- [x] @AllowUnverified + guard rethrow fix
- [x] Baseline migration + migrate deploy entrypoint
- [x] Compose: no 5411, no URL echo, Node 22, ready healthchecks
- [x] ci.yml + deploy.yml needs quality

## Success Criteria
- `cd kmaedu-be && yarn typecheck && yarn build:all && yarn test`: exit 0.
- `cd kmaedu-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json` (with local compose infra): exit 0.
- `cd kmaedu-fe && yarn build && yarn lint`: exit 0. <!-- Red Team: RT-11 -->
- `grep -n '"prisma": "6.19' kmaedu-be/package.json` → 1 hit. `grep -rn "prisma\|@kmaedu/database" kmaedu-be/libs/observability/src` → none. `plan.md` holds a dated spike verdict (go | no-go + fallback). <!-- Red Team: RT-14 -->
- `grep -rn "db push" kmaedu-be/deploy` → none. `grep -n "5411" kmaedu-be/deploy/docker-compose.yml` → none. `grep -rn "node:20" kmaedu-be/deploy` → none.
- Fresh `docker compose up` on an empty volume: migration container exits 0 and every service reports `/health/ready` 200.
- <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> `grep -rn "BenchmarkItem" kmaedu-be/libs/database kmaedu-be/apps --exclude-dir=node_modules --exclude-dir=venv` → none; `ls kmaedu-be/apps/ai-service/src/score` → no such dir; ai-service `/health` 200 after boot (no benchmark log line).
- A PR with a type error in `finance-service` turns the CI check red.

## Risk Assessment
- Existing type errors surface in services that were never built → Medium/Medium. Fix them in this phase; time-box 0.5d and list leftovers to the lead (do not `// @ts-ignore`).
- Prisma 6.16 → 6.19 minor bump changes generated types or query behaviour → Low/Medium. Full unit + e2e suite runs after step 2; revert the bump commit alone if red. <!-- Red Team: RT-14 -->
- Spike no-go (adapter-pg / `engineType=client` not bundling) → Medium/High for P11. Countermove: the fallback (`prisma-client-js` per-service output) is already defined; P11 does not start until the verdict is recorded. <!-- Red Team: RT-14 -->
- `migrate dev` drift on dev DBs that hold ai-service runtime tables (`UserStorageGraph*`; `BenchmarkItem` is deleted in this phase <!-- Updated: Validation Session 1 - ai-service score/benchmark removal -->) → generate the baseline on an empty DB only. `migrate deploy` ignores unknown tables.
- <!-- Updated: Validation Session 1 - ai-service score/benchmark removal --> Deleting the dev agent/streamlit UI removes a local-only tool someone may still run → Low/Low. Not deployed (no Dockerfile/compose reference); git history keeps it.
- Baseline misses the `vector` extension or `Unsupported` columns → run CI e2e against an empty pgvector container.
- Node 22 native deps (opencv, bcrypt) → Low. `bcryptjs` is pure JS. Verify the image build in CI.
- Deleting `AITeacherPage` removes unrouted UI → none user-facing. Note in the changelog (phase 19).

## Rollback
- Each step is an independent commit. Revert the commit.
- Prisma bump: revert the `package.json`/`yarn.lock` commit (no schema change). <!-- Red Team: RT-14 -->
- Baseline: restore the old `entrypoint-migration.sh` (DB is reset, so no data risk).
- CI: remove the `needs: quality` line to unblock an urgent deploy (requires lead sign-off).

## Security Considerations
- Closes the published Postgres port and the `DATABASE_URL` log leak.
- The pino redact list must include `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`.
- The guard fix must not widen access. `@AllowUnverified` is only allowed on the 4 listed auth handlers. A unit test asserts that list.

## Next Steps
- Unblocks 02 (contracts) and every later phase (CI gate). `route-inventory.json` feeds 05. Spike verdict gates 11. <!-- Red Team: RT-14 -->
- [CROSS-PHASE] `libs/observability` is created here (not in 02) because health and pino need a home now. Phase 02 only adds `libs/{contracts,grpc,http}`. Phase 17 (deferred) extends observability. <!-- Reconcile: X9 -->
- [CROSS-PHASE] dependency-cruiser → phase 10 (enforced). FE vitest (`vitest.config.ts` with `mergeConfig`) → phase 09. <!-- Red Team: RT-11 -->
- [CROSS-PHASE] Phase 11 deletes the stale `libs/database/prisma/` tree after re-inventorying the real seeds (`libs/database/prisma/seed.ts`, `seed-dev.ts`, `libs/database/src/seed/*.seed.ts`). Phase 01 does not touch it. <!-- Red Team: RT-14 -->
- Deferred (carried from phase 01 inspection and temper; none block P02):
  - amd64 Prisma bundle confirmation in CI (spike was arm64 only). Must pass before P11.
  - Add `.DS_Store` to `.gitignore` (untracked, do not commit).
  - RabbitMQ `app.close()` can hang on channel teardown in `libs/common` events (seen on auth and finance e2e). `jest-e2e.json` uses `forceExit`.
  - ai-service ruff style debt: ~1391 errors (E/D/UP/T201 etc.). Not introduced here. Address in a dedicated lint pass.
  - r2-service readiness has no checks (`/health/ready` returns 200 with `{}`).
- [CROSS-PHASE] ARCH P0 also lists "daily DB backup + tested restore". Not in the brief's 01 boundary. Covered for the reset by the phase-16 cutover runbook (pre-cutover `pg_dump`, kept off-host, restore rehearsed); recurring daily backups stay a follow-up. <!-- Updated: Validation Session 1 - cutover runbook -->
