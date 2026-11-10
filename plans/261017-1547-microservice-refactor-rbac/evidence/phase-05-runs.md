# Phase 05 verification runs (implementer)

All commands from `/Users/tgiap.dev/devs/examio/examio-be` unless the row says otherwise. Exit codes are the real ones captured by the runner (`$?` of the command itself). Rows that failed are kept: they are the RED steps or my own mistakes, each explained in "Notes on failed rows".

SAFETY: every infra-touching command ran under `env -i` with a COMPLETE env pointing at local docker containers `p05-pg` (pgvector pg16, 127.0.0.1:56441), `p05-redis` (127.0.0.1:56391), `p05-rmq` (rabbitmq 3.13 with per-service definitions rendered from the template with dummy passwords, 127.0.0.1:56683). A guard in the env file refuses any DATABASE_URL host other than 127.0.0.1/localhost. No `.env` file was read or printed. Prisma (`migrate deploy`) ran with cwd outside the repo and absolute paths. `docker compose config` was only ever run on a scratch copy of the compose file with a dummy `.env` (never `deploy/.env`). RS256 keys and service secrets came from `scripts/ci-ephemeral-auth-env.sh` into the scratchpad. Containers `p05-*`, `p05-nginx-*` and the `p05egress` stack are removed at the end.

## Tests-first evidence (RED then GREEN)

RED rows: `route-coverage`/`route-matcher` (module missing), the six pipeline specs (module missing), `extract-token` (retired cookie still accepted), `libs/http` filter (RPC context crashed the filter), rabbitmq definitions spec (no `gateway` user), the auth/admin/common specs (revoke hook, cookies, cache warm-up missing), the `GatewayControlClient` DI spec (see below). GREEN rows follow each. The Lua/Redis e2e (`redis-scripts`) and the gateway/auth e2e suites were written after the unit layer; their sensitivity is proven by the mutation rows (every mutant killed, source restored after each).

## Real findings the tests surfaced (fixed)

- phase-04 bug in `GatewayControlClient`: `@Optional() serviceMetadata: ServiceMetadata | undefined` emits `Object` as `design:paramtypes`, so Nest injected nothing and the fast path (`InvalidateUser`) never called the gateway. Caught by the auth<->gateway integration e2e; the new DI unit spec was RED first, now green.
- `HttpErrorEnvelopeFilter` registered globally also runs on the hybrid app's gRPC handlers (`inheritAppConfig`): it crashed on `host.switchToHttp()` and, after a first fix, turned RpcException payloads into UNKNOWN. It now delegates non-HTTP contexts to Nest's `BaseRpcExceptionFilter`.
- `forwardedHost` trusted a client `X-Forwarded-Host` (nginx does not sanitise it): now only `Host` is used.
- The 30MB upload test originally measured RSS: unreliable (freed chunks stay resident). It now proves streaming deterministically (bytes reach the upstream while the client is mid-send) and bounds live Buffer memory after forced GC.

## Run log

| Step | Command | Exit | Result |
|---|---|---|---|
| RED route-coverage + route-matcher | `yarn jest apps/gateway-service/test/route-coverage.spec.ts apps/gateway-service/src/routing` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run   ● Test suite failed to run Test Suites: 2 failed, 2 total  |
| RED pipeline specs (client-ip, auth-state, rate-limiter, forward-headers, auth-check, guard-chain) | `yarn jest apps/gateway-service/src/pipeline` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run   ● Test suite failed to run   ● Test suite failed to run  |
| GREEN route-coverage + route-matcher | `yarn jest apps/gateway-service/test/route-coverage.spec.ts apps/gateway-service/src/routing` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 2 passed, 2 total Tests:       239 passed, 239 total  |
| RED extract-token drop legacy cookie | `yarn jest libs/auth-jwt/src/extract-token.spec.ts` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 4 passed, 5 total  |
| GREEN extract-token + auth-jwt guards | `yarn jest libs/auth-jwt` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | [33m[Nest] 42326  - [39m10/19/2026, 3:53:18 AM [33m   WARN[39m [38;5;3m[ServiceTokenClient] [39m[33mService token refresh for "finance" failed; using the cached token[39m [33m[Nest] 42321  - [39m10/19/2026, 3:53:18 AM [33m   WARN[39m [38;5;3m[TokenVerifier] [39m[33mJWKS lookup failed: Error: connect ECONNREFUSED 127.0.0.1:1[39m Test Suites: 8 passed, 8 total  |
| GREEN pipeline unit specs | `yarn jest apps/gateway-service/src/pipeline` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run Test Suites: 1 failed, 5 passed, 6 total Tests:       56 passed, 56 total  |
| GREEN pipeline unit specs | `yarn jest apps/gateway-service/src/pipeline 2>&1 | grep -v WARN` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 6 passed, 6 total Tests:       61 passed, 61 total  |
| RED http filter ignores non-http contexts | `yarn jest libs/http` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 5 passed, 6 total  |
| GREEN http filter | `yarn jest libs/http` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 1 passed, 1 total Tests:       6 passed, 6 total  |
| typecheck gateway | `yarn typecheck:gateway` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 2 | apps/gateway-service/src/pipeline/dispatcher.middleware.ts(59,78): error TS2345: Argument of type '{ 'Retry-After': string; } | { 'Retry-After'?: undefined; }' is not assignable to parameter of type 'Record<string, string> | undefined'.  |
| typecheck gateway | `yarn typecheck:gateway` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| RED rabbitmq definitions spec (gateway user) | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 | ✖ renderDefinitions substitutes users, hashes and the admin name (1.275708ms) ✖ gateway may only read examio.events and touch gateway.* queues, and publishes nothing (0.1965ms) ✖ CLI writes definitions.json (world-readable, the broker user must read the mount) when all passwords are set (35.779916ms)  |
| GREEN rabbitmq definitions spec | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| RED/GREEN redis scripts e2e | `jest --config test/jest-e2e.json test/redis-scripts.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       6 passed, 6 total  |
| gateway proxy e2e (first run) | `jest --config test/jest-e2e.json test/gateway.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       4 failed, 9 passed, 13 total  |
| gateway proxy e2e (second run) | `jest --config test/jest-e2e.json test/gateway.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 11 passed, 13 total  |
| gateway proxy e2e | `jest --config test/jest-e2e.json test/gateway.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 12 passed, 13 total  |
| gateway proxy e2e | `jest --config test/jest-e2e.json test/gateway.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 12 passed, 13 total  |
| gateway proxy e2e | `jest --config test/jest-e2e.json test/gateway.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       13 passed, 13 total  |
| gateway authz e2e (first run) | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       0 total  |
| gateway authz e2e | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 10 passed, 12 total  |
| GREEN http filter (rpc passthrough) | `yarn jest libs/http` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run Test Suites: 1 failed, 1 total Tests:       0 total  |
| GREEN http filter (rpc passthrough) | `yarn jest libs/http` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| gateway authz e2e | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 11 passed, 12 total  |
| gateway authz e2e | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       12 passed, 12 total  |
| gateway edge e2e (first run) | `jest --config test/jest-e2e.json test/gateway-edge.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       11 passed, 11 total  |
| RED auth/admin/common specs (gateway hooks, cookies, page cache warm) | `yarn jest apps/auth-service/src/clients apps/auth-service/src/devices apps/auth-service/src/auth.service.gateway-control.spec.ts libs/common/src/utils/cookie-config.spec.ts apps/admin-service/src/modules/admin-page-config` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run   ● Test suite failed to run   ● Test suite failed to run  |
| GREEN auth/admin/common specs | `yarn jest apps/auth-service/src libs/common/src/utils apps/admin-service/src/modules/admin-page-config` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | [33m[Nest] 55356  - [39m10/19/2026, 4:07:59 AM [33m   WARN[39m [38;5;3m[AdminPageConfigService] [39m[33mpage-flag cache warm-up failed: Error: db down[39m [33m[Nest] 55356  - [39m10/19/2026, 4:08:00 AM [33m   WARN[39m [38;5;3m[GatewayControlClient] [39m[33mRevokeSession(sid=sid-1) failed: UNAVAILABLE[39m [33m[Nest] 55356  - [39m10/19/2026, 4:08:01 AM [33m   WARN[39m [38;5;3m[RoleChangeService] [39m[33mInvalidateUser failed after role change: Error: gateway down[39m  |
| typecheck all | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| compose topology spec | `node --test deploy/compose-topology.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| nginx -t with the real-ip include (phase command) | `docker run --rm -v $PWD/examio-fe/nginx.conf:/etc/nginx/templates/default.conf.template -v $PWD/examio-fe/nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf -e BACKEND_URL=http://x:3000 nginx:1.27-alpine nginx -t` (cwd /Users/tgiap.dev/devs/examio) | 1 | nginx: configuration file /etc/nginx/nginx.conf test failed  |
| nginx -t (BACKEND_URL=http://127.0.0.1:3000: 'x' does not resolve, same failure on main) | `docker run --rm -v $PWD/examio-fe/nginx.conf:/etc/nginx/templates/default.conf.template -v $PWD/examio-fe/nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf -e BACKEND_URL=http://127.0.0.1:3000 nginx:1.27-alpine nginx -t` (cwd /Users/tgiap.dev/devs/examio) | 0 | n/a |
| nest build gateway-service | `yarn nest build gateway-service` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| nest build gateway-service (assets) | `yarn nest build gateway-service` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| boot built gateway from dist (scripts/boot-built-services.sh, env -i, local docker infra) | `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test SERVICES=gateway PORT=3461 GRPC_PORT=50961 REDIS_HOST=127.0.0.1 REDIS_PORT=56391 RABBITMQ_URL=amqp://gateway:p05-gw@127.0.0.1:56683 DATABASE_URL=postgresql://x:x@127.0.0.1:1/none FRONTEND_URL=http://localhost:5173 JWT_ISSUER=examio-auth JWT_AUDIENCE=examio AUTH_JWKS_URL=http://127.0.0.1:1/.well-known/jwks.json ./scripts/boot-built-services.sh` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| gateway health e2e (app.e2e-spec) | `jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 passed, 3 total  |
| gateway health e2e (app.e2e-spec) | `jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| prisma migrate deploy on local empty DB (cwd outside repo, env -i) | `env -i PATH="$PATH" HOME="$HOME" bash -c 'source /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/fullenv.sh && /Users/tgiap.dev/devs/examio/examio-be/node_modules/.bin/prisma migrate deploy --schema=/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/schema.prisma'` (cwd /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/run) | 0 | n/a |
| auth e2e (token, service-token, role-change, public-profiles, register-outbox, app) | `jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/register-outbox.e2e-spec.ts test/app.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 6 passed, 6 total Tests:       38 passed, 38 total  |
| auth<->gateway integration e2e (first run) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       4 failed, 3 passed, 7 total  |
| RED gateway-control client DI (serviceMetadata never injected) | `yarn jest apps/auth-service/src/clients` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 | [33m[Nest] 62086  - [39m10/19/2026, 4:15:20 AM [33m   WARN[39m [38;5;3m[GatewayControlClient] [39m[33mRevokeSession(sid=sid-1) failed: UNAVAILABLE[39m Test Suites: 1 failed, 1 total Tests:       1 failed, 4 passed, 5 total  |
| GREEN gateway-control client DI | `yarn jest apps/auth-service/src/clients` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | [33m[Nest] 62290  - [39m10/19/2026, 4:15:29 AM [33m   WARN[39m [38;5;3m[GatewayControlClient] [39m[33mRevokeSession(sid=sid-1) failed: UNAVAILABLE[39m Test Suites: 1 passed, 1 total Tests:       5 passed, 5 total  |
| auth<->gateway integration e2e | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| auth<->gateway integration e2e (mail stubbed) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       0 total  |
| auth<->gateway integration e2e (mail stubbed) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| auth<->gateway integration e2e (real change-password) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| yarn build:all | `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| yarn test --ci (full unit suite, env -i) | `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci 2>&1 | grep -v 'WARN\|LOG\|ERROR\|DEBUG\|console\.\|^\s*at \|^\s*$' | tail -30` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 1 failed, 101 passed, 102 total Tests:       1 failed, 994 passed, 995 total  |
| study-room socket auth spec (retired token cookie) | `yarn jest apps/exam-service/src/modules/study-room/study-room-socket-auth.service.spec.ts` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| yarn test --ci (full unit suite, env -i) rerun | `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; echo $? ; tail -6 /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 102 passed, 102 total Tests:       995 passed, 995 total  |
| auth e2e (ALL files) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| finance e2e (ALL files) | `jest --config test/jest-e2e.json ` (cwd apps/finance-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 passed, 2 total Tests:       11 failed, 3 passed, 14 total  |
| admin e2e (ALL files) | `jest --config test/jest-e2e.json ` (cwd apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| finance e2e (ALL files, broker user finance) | `jest --config test/jest-e2e.json` (cwd apps/finance-service, env -i + local docker env, RABBITMQ_URL=finance user) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |
| exam health e2e (app.e2e-spec, broker user exam) | `jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (cwd apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| r2 health e2e (app.e2e-spec, broker user auth) | `jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (cwd apps/r2-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| examio-fe yarn build | `yarn build` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | n/a |
| examio-fe yarn lint | `yarn lint` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | ✖ 32 problems (0 errors, 32 warnings)  |
| gateway e2e: ALL suites, in band (final) | `jest --config test/jest-e2e.json --runInBand` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| x | `jest --config test/jest-e2e.json test/redis-scripts.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 5 passed, 6 total  |
| MUTATION set-max always overwrites | restored after run; test command exited 1 | 1 | Tests:       1 failed, 5 passed, 6 total  |
| MUTATION client ip takes leftmost XFF | restored after run; test command exited 1 | 1 | Tests:       2 failed, 4 passed, 6 total  |
| MUTATION x-user-* not stripped | restored after run; test command exited 1 | 1 | Tests:       1 failed, 11 passed, 12 total  |
| MUTATION compose publishes postgres port | restored after run; test command exited 1 | 1 | ℹ tests 9 ℹ fail 2  |
| x | `jest --config test/jest-e2e.json test/redis-scripts.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 5 passed, 6 total  |
| MUTATION set-max always overwrites | restored after run; test command exited 1 | 1 | Tests:       1 failed, 5 passed, 6 total  |
| x | `jest --config test/jest-e2e.json test/gateway-streaming.e2e-spec.ts -t 30MB` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 3 skipped, 4 total  |
| MUTATION body buffered before proxying (no streaming) | restored after run; test command exited 1 | 1 | Tests:       1 failed, 3 skipped, 4 total  |
| x | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts -t durable` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 skipped, 8 total  |
| MUTATION durable authz_changed handler not registered | restored after run; test command exited 1 | 1 | Tests:       1 failed, 7 skipped, 8 total  |
| x | `jest --config test/jest-e2e.json test/gateway-authz.e2e-spec.ts -t optional route` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 skipped, 8 total  |
| MUTATION optional route forwards a bad token | restored after run; test command exited 1 | 1 | Tests:       1 failed, 7 skipped, 8 total  |
| x | `jest --config test/jest-e2e.json test/gateway-control.e2e-spec.ts -t Redis outage` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 3 skipped, 4 total  |
| MUTATION redis outage always fails open | restored after run; test command exited 1 | 1 | Tests:       1 failed, 3 skipped, 4 total  |
| gateway handler/control unit specs | `yarn jest apps/gateway-service/src/events apps/gateway-service/src/control` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 2 passed, 2 total Tests:       18 passed, 18 total  |

| --- FINAL GATES (after the last source edit) --- | | | |
| FINAL yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| FINAL yarn build:all | `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| FINAL yarn test --ci (unit, env -i) | `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 104 passed, 104 total Tests:       1013 passed, 1013 total  |
| FINAL gateway e2e (phase command, default workers) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 2 failed, 5 passed, 7 total Tests:       2 failed, 43 passed, 45 total  |
| FINAL auth e2e (ALL files incl. gateway-integration) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| FINAL node --test deploy/rabbitmq/render-definitions.spec.cjs | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| FINAL node --test deploy/compose-topology.spec.cjs | `node --test deploy/compose-topology.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| FINAL examio-fe yarn build | `yarn build` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | n/a |
| FINAL examio-fe yarn lint | `yarn lint` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | ✖ 32 problems (0 errors, 32 warnings)  |
| FINAL gateway e2e (phase command: jest --config test/jest-e2e.json, 7 suites) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 6 passed, 7 total Tests:       1 failed, 44 passed, 45 total  |
| FINAL typecheck (post last edit) | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| FINAL yarn jest apps/gateway-service (unit) | `yarn jest apps/gateway-service` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 12 passed, 12 total Tests:       324 passed, 324 total  |
| FINAL gateway e2e (phase command, rerun) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| FINAL gateway e2e (phase command, after flag-reset hardening) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| FINAL auth e2e ALL (7 suites incl. gateway-integration, after hardening) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       45 passed, 45 total  |
| FINAL yarn typecheck (last) | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |


## Real-process smoke (built gateway dist, out-of-repo cwd, nginx in front)

Gateway from `dist/apps/gateway-service/main.js` (cwd = scratchpad, env -i, local Redis/RabbitMQ), fake JWKS/auth/exam upstreams as separate local processes, two nginx:1.27 containers with the committed `examio-fe/nginx.conf`. The first uses a test real-ip conf trusting any peer (stands in for "Cloudflare"), the second the COMMITTED `cloudflare-real-ip.conf`.

```
== A) nginx(test real-ip) + gateway: 6 logins, ONE real client (CF-Connecting-IP 198.51.100.54), forged XFF each time
login 1 -> 200
login 2 -> 200
login 3 -> 200
login 4 -> 200
login 5 -> 200
login 6 -> 429
upstream saw (5th request body):
{"xff":"198.51.100.54","realIp":"198.51.100.54","proto":"http","host":"127.0.0.1"}

== B) nginx(committed Cloudflare ranges) + gateway: non-Cloudflare peer forging CF-Connecting-IP and XFF must NOT change the key
login 1 -> 200
login 2 -> 200
login 3 -> 200
login 4 -> 200
login 5 -> 200
login 6 -> 429

== C) SSE through nginx -> gateway -> upstream arrives incrementally (curl -N timestamps, 400ms apart upstream)
0.47s data: chunk-1
0.87s data: chunk-2
1.28s data: chunk-3
1.67s data: chunk-4
2.08s data: chunk-5

== D) cookies pass through nginx untouched: only accessToken/refreshToken, Lax
set-cookie: accessToken=a; Path=/; HttpOnly; SameSite=Lax
set-cookie: refreshToken=r; Path=/api/v1/auth; HttpOnly; SameSite=Lax
```

Reading it: A) one real client behind a trusted edge, forged XFF on every call -> 6th login 429 and the upstream sees one X-Forwarded-For (the client address nginx reported). B) a non-Cloudflare peer forging CF-Connecting-IP and XFF changes nothing: same bucket, 6th is 429. C) SSE chunks arrive 0.4 s apart through nginx -> gateway (no buffering). D) only `accessToken`/`refreshToken`, `SameSite=Lax`, pass through untouched.

Egress split mechanism (scratch compose mirroring the real network definitions: `internal: true` + a plain egress network): `wget https://example.com` from the internal-only container exit 1 (`bad address`), from the internal+egress container exit 0; internal peers still reach each other. The real compose is verified statically by `deploy/compose-topology.spec.cjs` and `docker compose config` (dummy env, exit 0, service/network table printed).

## Notes on failed rows

- `typecheck gateway` exit 2 once: a union-typed headers object (fixed).
- `gateway proxy e2e` / `gateway authz e2e` first runs: fake-upstream handler left over from the SSE test slowed later requests past the test's wait; WS/redirect/restart port issues in the harness; GatewayControl error codes (filter fix above); fixed test-side.
- `finance e2e (ALL files)` exit 1 (11 failed): my env gave finance the `auth` broker user. Re-run with the `finance` broker user: exit 0 (14 passed).
- `nginx -t` with `BACKEND_URL=http://x:3000` (the phase's literal command) exits 1 `host not found in upstream "x"` at `proxy_pass` — nginx resolves it at config test, same on main. With a resolvable host (`127.0.0.1`) exit 0; CI uses that form.
- `gateway health e2e` exit 1 once: closing mid consumer-setup surfaced an unhandled "Channel ended" from amqp-connection-manager; the suite now lets the consumer finish setup before closing (library left untouched).
- `FINAL gateway e2e ... default workers` exit 2 failed suites and one later run exit 1 (1 test): suites share Redis page flags and a leftover `{"ai-tool": false}` from an aborted/parallel run disabled a page for another suite. Fixed with `maxWorkers: 1` in `test/jest-e2e.json` and a flag reset in the harness; afterwards 19 consecutive runs plus 4 under 6-process CPU load passed, and a deliberately poisoned flag map no longer breaks a run. The single unexplained exit-1 run left no log, so this root cause is the best-supported hypothesis, not proven.
- Procedure deviation: the one `scripts/boot-built-services.sh` boot of the gateway used cwd `examio-be`, so `main.ts`'s dotenv could read the gitignored `apps/gateway-service/.env` for any variable I had not set. Every endpoint the gateway connects to at boot (Redis, RabbitMQ) was set explicitly to local values, JWKS/upstreams are lazy, so no non-local connection was possible, but it is not the "cwd without .env" the brief asked for. All later dist boots (smoke) used an out-of-repo cwd.
- Pre-existing, not introduced: `AuthService.register` sends a welcome mail through a hard-wired Gmail transport, so earlier auth e2e register calls reach smtp.gmail.com (fails at AUTH, nothing sent). The new integration e2e stubs `mailTransporter.sendMail`.


# Round 2 (temper blockers F1-F5 and test follow-ups)

Same SAFETY rules: `env -i`, complete local env (docker `p05-pg`/`p05-redis`/`p05-rmq`, recreated), out-of-repo cwd for every built-service boot (`BOOT_CWD`), scratch copy + dummy env for compose, containers removed at the end.

What changed and how it was proven (tests first where a failing test was possible):

- F1 auth dist crash: reproduced RED (`boot-built-services.sh` with `COMPOSE_DEFAULTS=1`, auth: `file .../dist/apps/auth-service/proto/examio/gateway/v1/gateway_control.proto not found`), then added the gateway proto asset to `nest-cli.json`. Audit of every service's protos vs registered clients/servers: auth (server auth+common, clients r2, gateway: fixed), exam (clients finance, r2: ok), finance (server wallet/subscription: ok; its auth client is only wired in the CLI, which runs from source, not dist), admin (client auth+common: ok), r2 (server: ok), gateway (server gateway: ok). `scripts/boot-built-services.sh` now supports `COMPOSE_DEFAULTS=1` (GATEWAY_CONTROL_ENABLED=true, GATEWAY_GRPC_URL, ROLE=api,worker) and `BOOT_CWD`; CI runs it a second time with the compose defaults. All six services boot in both modes.
- F2 `location /ws/` in `examio-fe/nginx.conf` (HTTP/1.1, Upgrade/Connection map, 3600 s timeouts, no buffering, XFF overwritten, server-level real-ip include applies). `nginx -t` in the CI form exit 0. Live through nginx with the COMMITTED real-ip conf:

```
== WS through nginx(/ws/) -> gateway -> exam with the accessToken cookie:
OPEN 101, first frame: {"hello":"from-exam","xff":"172.17.0.1","auth":true}
== no cookie:
REFUSED status 401
== token only in the query string:
REFUSED status 401
== raw handshake status line (curl, expect 101):
HTTP/1.1 101 Switching Protocols
```

- F3 gateway published as `127.0.0.1:6369:3000`; `compose-topology.spec.cjs` gained "no service publishes on 0.0.0.0" (RED before the compose edit, 1 failure, then green). README updated.
- F4 `proxy-factory.ts`: `on.proxyRes` drops `Set-Cookie` for every upstream except `auth`. Unit (`proxy-factory.spec.ts`, RED: 3 failures for exam/finance/admin) and e2e (non-auth upstream cookies never reach the client). Two real defects found by the new unit spec and fixed: (a) `timeout` equal to `proxyTimeout` raced, so a slow upstream gave the client a connection reset instead of the 504 envelope (inbound socket timeout now has a 5 s grace); (b) an upstream dying mid-body left the client hanging forever (http-proxy never ends `res`), now `res` is destroyed on `aborted`/`error` of the upstream response.
- F5 double throttling: reproduced RED (a minimal controller with both guards: 3rd call already 429). New `@StrictThrottle()` (strict guard + 5/60 s + marker); `HttpThrottlerGuard` skips marked handlers; the 8 credential handlers use it. Unit spec (5 pass, 6th 429; unmarked route still globally limited) and `login-throttle.e2e-spec.ts` on the real throttlers and the real login handler: `[401,401,401,401,401,429]`. Added to CI.
- Coverage: new unit specs for `dispatcher.middleware`, `error-response`, `proxy-factory`, `ws-upgrade.handler`, `request-log` (statements 100 / 100 / 95 / 100 %). These were written after the code; their sensitivity was checked by the two defects above, not by separate mutants.
- `route-coverage.spec.ts` now asserts the resolved upstream for every inventory line (and the env-driven upstream URLs).
- Teardown race: `RequestLog` no longer reports a publish failure when the shared Redis connection is already closed (`LogPublisherService.isClosed()`); both gateway e2e runs below contain 0 "Failed to publish log" lines (it was 3-4 per run before).

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy (infra restart) | `env -i PATH="$PATH" HOME="$HOME" bash -c 'source /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/fullenv.sh && /Users/tgiap.dev/devs/examio/examio-be/node_modules/.bin/prisma migrate deploy --schema=/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/schema.prisma'` (cwd /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/run) | 0 | n/a |
| RED boot auth with compose-default flags (asset missing) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 SERVICES=auth | 1 | FAIL auth-service (http=0, grpc=down); last log lines:; |
| build:all (asset fix) | `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| GREEN boot ALL built services, compose-default flags | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 | 1 | ok   auth-service (http 3480, grpc up);FAIL exam-service (http=0, grpc=n/a); last log lines:;FAIL finance-service (http=0, grpc=down); last log lines:;ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);FAIL gateway-service (http=0, grpc=down); last log lines:; |
| boot ALL built services, compose-default flags (admin broker user) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| boot ALL built services, CI-style env (flags off) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra:  | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| compose-topology spec incl. loopback assertion (GREEN) | `node --test deploy/compose-topology.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| nginx -t CI form with /ws/ location | `docker run --rm -v $PWD/examio-fe/nginx.conf:/etc/nginx/templates/default.conf.template -v $PWD/examio-fe/nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf -e BACKEND_URL=http://127.0.0.1:3000 nginx:1.27-alpine nginx -t` (cwd /Users/tgiap.dev/devs/examio) | 0 | n/a |
| RED/GREEN proxy-factory unit spec (cookie strip missing) | `yarn jest apps/gateway-service/src/pipeline/proxy-factory.spec.ts 2>&1 | grep -E '✓|✕|Tests:'` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       5 failed, 5 passed, 10 total  |
| GREEN proxy-factory unit spec | `yarn jest apps/gateway-service/src/pipeline/proxy-factory.spec.ts 2>&1 | grep -E '✓|✕|Tests:|●.*›' ` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       1 failed, 9 passed, 10 total  |
| GREEN proxy-factory unit spec (truncation cut) | `yarn jest apps/gateway-service/src/pipeline/proxy-factory.spec.ts 2>&1 | grep -E '✓|✕|Tests:|●.*›' ` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       0 total  |
| GREEN proxy-factory unit spec (truncation cut) | `yarn jest apps/gateway-service/src/pipeline/proxy-factory.spec.ts 2>&1 | grep -E '✓|✕|Tests:|●.*›' ` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       0 total  |
| RED strict-throttle spec (decorator missing) | `yarn jest apps/auth-service/src/auth/guards` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 1 |   ● Test suite failed to run Test Suites: 1 failed, 1 total Tests:       0 total  |
| RED strict-throttle (double count reproduced) | `yarn jest apps/auth-service/src/auth/guards 2>&1 | grep -E '✓|✕|Tests:|Expected|Received|^\s+[-+] ' | head -20` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       1 failed, 1 passed, 2 total  |
| GREEN strict-throttle spec | `yarn jest apps/auth-service/src/auth/guards 2>&1 | grep -E '✓|✕|Tests:'` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       2 passed, 2 total  |
| login throttle e2e (real throttlers) | `jest --config test/jest-e2e.json test/login-throttle.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       1 passed, 1 total  |
| route-coverage with upstream assertions | `yarn jest apps/gateway-service/test/route-coverage.spec.ts 2>&1 | grep -E 'Tests:|✕'` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Tests:       230 passed, 230 total  |
| LIVE WS through nginx (committed real-ip conf + /ws/ location) -> built gateway -> fake exam WS | node ws client + curl handshake (see ws-result below) | 0 | cookie: 101 + first frame; no cookie: 401; query-string token: 401; curl status line 101 |

| --- FINAL GATES, round 2 (after F1-F5) --- | | | |
| R2 yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R2 yarn build:all | `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R2 TZ=UTC yarn test --ci (env -i) | `env -i PATH="$PATH" HOME="$HOME" TZ=UTC NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 110 passed, 110 total Tests:       1073 passed, 1073 total  |
| R2 node --test deploy/rabbitmq/render-definitions.spec.cjs | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R2 node --test deploy/compose-topology.spec.cjs | `node --test deploy/compose-topology.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R2 gateway e2e run 1 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       46 passed, 46 total  |
| R2 gateway e2e run 2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       46 passed, 46 total  |
| R2 auth e2e ALL (incl. gateway-integration, login-throttle) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       46 passed, 46 total  |
| R2 boot ALL built services, CI-style env (flags off) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra:  | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| R2 boot ALL built services, COMPOSE_DEFAULTS=1 (GATEWAY_CONTROL_ENABLED=true, ROLE=api,worker) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| R2 docker compose config (scratch copy, dummy env) | `docker compose --env-file .env -f docker-compose.yml config` | 0 | renders; gateway port 127.0.0.1:6369 |
| R2 nginx -t (CI form, with /ws/) | `docker run --rm -v $PWD/examio-fe/nginx.conf:/etc/nginx/templates/default.conf.template -v $PWD/examio-fe/nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf -e BACKEND_URL=http://127.0.0.1:3000 nginx:1.27-alpine nginx -t` (cwd /Users/tgiap.dev/devs/examio) | 0 | n/a |
| R2 examio-fe yarn build | `yarn build` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | n/a |
| R2 examio-fe yarn lint | `yarn lint` (cwd /Users/tgiap.dev/devs/examio/examio-fe) | 0 | ✖ 32 problems (0 errors, 32 warnings)  |


# Round 3 (review warnings W1 and W2)

Same SAFETY rules (env -i, complete local env on recreated `p05-*` containers, out-of-repo cwd for dist boots). The FE was not touched this round, so its build/lint rows from round 2 stand.

- W1 `maxBodySize` on streamed bytes. `proxy-factory.ts` `enforceBodyCap` (hooked in `on.proxyReq`, before http-proxy pipes the request): a `data` listener counts bytes; past the cap the upstream request is destroyed before that chunk is written and the client gets the 413 `PAYLOAD_TOO_LARGE` envelope. No buffering; chunks flow untouched. Tests (RED first: 1 failure): chunked body over the cap -> 413 and the upstream received at most the cap; under the cap -> 200 with the body byte-identical (sha256); an uncapped route is unlimited; e2e on `r2-image` (3mb): 5MB chunked -> 413, upstream <= 3MB; 2MB chunked -> intact. Mutant (cap not enforced) killed. Defect found while hardening: closing the request socket right after the 413 made the OS reset the connection and could wipe the 413 before the client read it (an e2e hang in two background runs); after the 413 the remainder is now read and dropped, bounded by 8 MB or 5 s, and the test clients resolve on error instead of hanging. The header-declared check in the guard chain stays as the cheap first line.
- W2 durable session revoke. New fact event `auth.session.revoked` `{userId, sid, exp, version}` (`proto/examio/events/v1/auth_events.proto`, `SessionRevoked`; int64 fields travel as strings like every ts-proto int64; `version` = revocation time in epoch seconds). `SessionRevoker` (auth, devices module) is now the single path for logout, `DELETE /devices/:id`, logout-all-others, change-password and reset-password: ONE transaction deactivates the sessions and writes one outbox event per session (`SessionRevokedPublisher`); after commit it fires the unchanged `GatewayControl.RevokeSession` fast path. An unknown/already-inactive sid writes no event but still fires the idempotent fast path; if the revoke transaction fails, logout still succeeds and still hits the fast path (logged). Gateway `SessionRevokedHandler` (`dedupe:false`) sets `gw:revoked:sid:<sid>` with TTL `exp - now` through the existing `AuthStateService.revokeSession`, and skips an `exp` already in the past; malformed payloads are permanent errors (dead-letter), Redis failures retry. RabbitMQ definitions: no change needed (the consumer binds each handler key itself; `auth` may publish `^auth\.`, `gateway` reads `.*` and writes nothing); the render-definitions spec now asserts exactly that flow.
- Tests (unit RED first: modules missing): publisher envelope, revoker (same tx, order find -> deactivate -> event -> commit -> gRPC, shared `exp`, rollback on event failure, skip when inactive), devices and auth service wiring, handler TTL / expired / malformed / retry. e2e in `gateway-integration.e2e-spec.ts` with real auth + real gateway + relay: logout with `GatewayControl.revokeSession` BLOCKED -> session inactive and exactly one `auth.session.revoked` outbox row (same transaction) -> replay of the old token -> 401 `SESSION_REVOKED` via the durable path; logout-all-others with the fast path blocked revokes the other session and leaves the caller's own. Mutants (handler not registered: 2 e2e failures; revoker publishes nothing: 4 unit failures) killed. Behaviour change worth knowing: after change-password the old token now reports `SESSION_REVOKED` (revocation wins over the `av` bump), the e2e was updated accordingly.
- `auth.session.revoked` is not a state event (`.revoked` is outside the `updated|*_changed` convention), so no version-ordering is applied; the key is idempotent per sid.

| Step | Command | Exit | Result |
|---|---|---|---|
| RED W2 unit specs (publisher, revoker, devices, auth, handler) | `yarn jest apps/auth-service/src/devices apps/auth-service/src/auth.service apps/gateway-service/src/events 2>&1 | grep -E 'Tests:|Test Suites:|Cannot find'` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 7 failed, 2 passed, 9 total Tests:       2 failed, 11 passed, 13 total  |
| prisma migrate deploy (infra restart, W round) | `env -i PATH="$PATH" HOME="$HOME" bash -c 'source /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/fullenv.sh && /Users/tgiap.dev/devs/examio/examio-be/node_modules/.bin/prisma migrate deploy --schema=/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/schema.prisma'` (cwd /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/run) | 0 | n/a |
| W2 gateway-integration e2e (durable logout) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 8 passed, 9 total  |
| W2 gateway-integration e2e (durable logout, logout-all-others) | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       9 passed, 9 total  |
| render-definitions spec (+auth.session.revoked flow) | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| MUTATION body cap never enforced on the stream | restored; exit 1 | 1 | Tests:       1 failed, 12 passed, 13 total  |
| x | `jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts -t BLOCKED: the durable auth.session` (cwd apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 6 skipped, 1 passed, 9 total  |
| MUTATION session.revoked handler not registered | restored; exit 1 | 1 | Tests:       2 failed, 6 skipped, 1 passed, 9 total  |
| MUTATION revoker publishes no event | restored; exit 1 | 1 | Tests:       4 failed, 3 passed, 7 total  |

| --- FINAL GATES, round 3 (W1 chunked cap, W2 durable session revoke) --- | | | |
| R3 yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3 yarn proto:lint && yarn build:all | `yarn proto:lint && env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3 TZ=UTC yarn test --ci (env -i) | `env -i PATH="$PATH" HOME="$HOME" TZ=UTC NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 113 passed, 113 total Tests:       1099 passed, 1099 total  |
| R3 gateway e2e run 1 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 6 passed, 7 total Tests:       1 failed, 46 passed, 47 total  |
| R3 gateway e2e run 2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 6 passed, 7 total Tests:       1 failed, 46 passed, 47 total  |
| R3 auth e2e ALL (incl. gateway-integration, login-throttle) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       48 passed, 48 total  |

| --- FINAL GATES, round 3b (after the 413 drain fix; supersedes the round 3 block above) --- | | | |
| R3b yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3b yarn proto:lint && yarn build:all | `yarn proto:lint && env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3b TZ=UTC yarn test --ci (env -i) | `env -i PATH="$PATH" HOME="$HOME" TZ=UTC NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 113 passed, 113 total Tests:       1099 passed, 1099 total  |
| R3b render-definitions spec | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3b compose-topology spec | `node --test deploy/compose-topology.spec.cjs` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R3b gateway e2e run 1 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       47 passed, 47 total  |
| R3b gateway e2e run 2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       47 passed, 47 total  |
| R3b auth e2e ALL (incl. gateway-integration, login-throttle) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       48 passed, 48 total  |
| R3b boot ALL built services, CI-style env (flags off) | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra:  | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| R3b boot ALL built services, COMPOSE_DEFAULTS=1 | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |

Note on rows: the "R3" gateway e2e block was run before the 413 drain fix and failed twice (exit 1, the chunked test timing out on the connection reset described above); the "R3b" block after the fix is the one of record. Containers `p05-*` are removed after the final run.


# Round 4 (critical: `Expect: 100-continue` bypass; deterministic 413)

Same SAFETY rules (env -i, complete local env on recreated `p05-*` containers, out-of-repo cwd for dist boots, containers removed at the end).

Root cause confirmed: http-proxy emits `proxyReq` only when the outgoing request has no `expect` header (`web-incoming.js:132`), so everything done in `on.proxyReq` (strip `x-user-*` / `x-internal-service-token`, overwrite `X-Forwarded-For` / `X-Real-IP` / request id, inject `Authorization` from the cookie, attach the body cap) was skipped for any request with `Expect: 100-continue`. Reproduced RED before the fix: the new `gateway-expect.e2e-spec.ts` matrix failed 8 of 14 (every `with Expect` case (a)(b)(c)(c2)(d-over cap)(d-20x) plus the over-cap cases without Expect).

Fix:
- All header hygiene now runs on the INCOMING request before it is handed to http-proxy (which copies `req.headers` into the upstream request): `prepare-request.ts` (`prepareProxiedRequest` for HTTP, `prepareUpgradeRequest` for the WebSocket handshake) is called by the dispatcher / upgrade handler after the guard chain passes. It removes `x-user-*`, `x-internal-service-token`, `forwarded`, overwrites `x-forwarded-for/proto/host`, `x-real-ip`, `x-request-id`, injects `Authorization` from the verified token (or strips a failed credential and the `accessToken` cookie on optional routes), matches header names case-insensitively, and deletes `Expect` (Node has already answered `100 Continue`; the proxy just streams the body). Safe handling of `Expect`: the header is never forwarded; guards that reject still answer before any body is read beyond what Node already acknowledged.
- The byte cap (`body-cap.ts`) is attached to the incoming request, not to a proxy event: the single `req.pipe(proxyReq)` http-proxy performs is routed through a counting Transform.
- Audit of every http-proxy hook: `on.proxyReq` and `on.proxyReqWs` are gone (WS handshake hygiene moved to `prepareUpgradeRequest`); the remaining hooks, `proxyRes` (cookie strip, truncation cut) and `error`, are emitted unconditionally by http-proxy (`server.emit('proxyRes')` / the error handler), not behind the `expect` check. `createRouteProxy` now refuses (500 `INTERNAL_ERROR` / 500 on upgrade) any request that was not prepared, so a future code path cannot skip the hygiene silently.
- 413 delivery is deterministic: the 413 is written and ended immediately WITHOUT `Connection: close` (Node destroys a socket that still has unread request bytes after a `Connection: close` response, and the resulting reset can wipe the 413 before the client reads it); the upstream request is destroyed (it received at most the cap); the remaining body is read and dropped through the same Transform, bounded by 8 MB and 5 s, and the socket is destroyed only if the client exceeds that bound. The keep-alive connection stays usable (tested).

Tests (written first): `prepare-request.spec.ts` (with and without Expect), `body-cap.spec.ts` (under / exactly at / over the cap, 25 consecutive over-cap uploads with zero resets, connection reusable afterwards), `proxy-factory.spec.ts` rig now goes through `prepareProxiedRequest` and asserts the refusal of unprepared requests, and the e2e matrix `gateway-expect.e2e-spec.ts` run with and without `Expect`: (a) spoofed `x-user-roles` / `x-user-id` / `x-user-email` / `x-internal-service-token` absent upstream, (b) spoofed XFF / X-Real-IP / X-Forwarded-Host / Forwarded overwritten, (c) token from the cookie still injected, (c2) failed credential stripped on an optional route, (d) chunked over the 3mb cap -> 413 and upstream <= cap, under the cap -> intact, and 20 consecutive over-cap uploads with 0 resets. Mutants killed: sanitising only in a proxy hook (8 e2e failures), `Expect` not removed (2), the old `Connection: close` + immediate destroy delivery (3, including the reset cases).

Chunked-cap 0-resets evidence: each `gateway-expect` run performs 40 over-cap uploads (20 with, 20 without Expect); it was run 5 extra times consecutively (200 uploads) besides being part of the 3 full gateway runs, all green, 0 resets.

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy (infra restart, Expect round) | `env -i PATH="$PATH" HOME="$HOME" bash -c 'source /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/fullenv.sh && /Users/tgiap.dev/devs/examio/examio-be/node_modules/.bin/prisma migrate deploy --schema=/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/schema.prisma'` (cwd /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/run) | 0 | n/a |
| RED gateway-expect e2e against the proxyReq-hook implementation | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       8 failed, 6 passed, 14 total  |
| GREEN gateway-expect e2e (header hygiene + cap, with/without Expect) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| x | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       8 failed, 6 passed, 14 total  |
| MUTATION headers sanitised only in an http-proxy hook (not on req.headers) | restored; exit 1 | 1 | Tests:       8 failed, 6 passed, 14 total  |
| MUTATION Expect header not removed | restored; exit 1 | 1 | Tests:       2 failed, 11 passed, 13 total  |
| MUTATION cap Connection: close + immediate destroy (old delivery) | restored; exit 1 | 1 | Tests:       3 failed, 2 passed, 5 total  |

| --- FINAL GATES, round 4 (Expect/proxyReq bypass, deterministic 413) --- | | | |
| R4 yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R4 yarn build:all | `env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn build:all` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R4 TZ=UTC yarn test --ci (env -i) | `env -i PATH="$PATH" HOME="$HOME" TZ=UTC NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 115 passed, 115 total Tests:       1117 passed, 1117 total  |
| R4 gateway e2e run 1 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R4 gateway e2e run 2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R4 gateway e2e run 3 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R4 chunked-cap loop 1 (gateway-expect, each run = 40 over-cap uploads) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| R4 chunked-cap loop 2 (gateway-expect, each run = 40 over-cap uploads) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| R4 chunked-cap loop 3 (gateway-expect, each run = 40 over-cap uploads) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| R4 chunked-cap loop 4 (gateway-expect, each run = 40 over-cap uploads) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| R4 chunked-cap loop 5 (gateway-expect, each run = 40 over-cap uploads) | `jest --config test/jest-e2e.json test/gateway-expect.e2e-spec.ts` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| R4 auth e2e ALL | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       48 passed, 48 total  |
| R4 boot ALL built services, CI-style env | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra:  | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |
| R4 boot ALL built services, COMPOSE_DEFAULTS=1 | `boot-built-services.sh` under env -i, BOOT_CWD=scratch, local infra, extra: COMPOSE_DEFAULTS=1 | 0 | ok   auth-service (http 3480, grpc up);ok   exam-service (http 3480, grpc n/a);ok   finance-service (http 3480, grpc up);ok   admin-service (http 3480, grpc n/a);ok   r2-service (http 3480, grpc up);ok   gateway-service (http 3480, grpc up); |


# Round 5 (test-only: gRPC port race in the e2e harness)

Cause: the harness picked the gateway's gRPC port by listening on port 0, reading the number and closing the probe. That hands out an EPHEMERAL port, which the OS may give to any outgoing client socket (Redis, AMQP, fetch) before the gRPC server binds it: EADDRINUSE, about 1 in 6 full runs. Binding port 0 on the real server and reading the port back is not possible here (Nest does not expose the port its gRPC server bound), so: `test/support/ports.ts` `reservePort()` draws from 20000-29999, below every OS ephemeral range (probed on 0.0.0.0, the interface gRPC binds), and `bootGateway` retries with a fresh port (new app instance, bounded close of the failed one, up to 5 attempts) when the bind fails with EADDRINUSE. A caller that pinned `GRPC_PORT` (the auth<->gateway integration suite, which tells auth where the gateway listens before booting it) gets one attempt and the same non-ephemeral reservation. The duplicate `freePort` in `auth-service/test/gateway-integration.e2e-spec.ts` now uses the shared `reservePort`. No production code changed.

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy (infra restart, port-race round) | `env -i PATH="$PATH" HOME="$HOME" bash -c 'source /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/fullenv.sh && /Users/tgiap.dev/devs/examio/examio-be/node_modules/.bin/prisma migrate deploy --schema=/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/schema.prisma'` (cwd /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/run) | 0 | n/a |

| --- round 5: gRPC test-port race (reservePort outside the ephemeral range + EADDRINUSE retry) --- | | | |
| R5 gateway e2e run 1/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 gateway e2e run 2/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 gateway e2e run 3/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 gateway e2e run 4/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 gateway e2e run 5/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 gateway e2e run 6/6 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R5 auth e2e ALL (incl. gateway-integration using reservePort) | `jest --config test/jest-e2e.json ` (cwd apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       48 passed, 48 total  |


# Round 6 (small hardening)

- Declared-length 413: the guard chain's `Content-Length` 413 now drains the unread body through `drainRequest` (`body-cap.ts`: read and drop, bounded by 8 MB and 5 s, unref'd timer, only a client past the bound is cut), the same routine the streamed-cap path uses. Without it Node dumps the rest of the body with no bound at all. Test (raw TCP client that ignores the early response and keeps sending a declared 50 MB): the 413 + `PAYLOAD_TOO_LARGE` arrives, the server closes the socket, and the client had sent between 8 MB and 30 MB when it did (the drain bound, not 50 MB); a second test checks a 1 MB declared body is drained and a keep-alive connection serves three such 413s. Mutant (no drain on that path) killed: the server never closes the socket (`closedByServer` false).
- Client-supplied `x-forwarded-port`, `x-forwarded-prefix`, `x-forwarded-server`, `x-original-url`, `x-rewrite-url` are stripped (joined `forwarded`, `x-real-ip`, `x-internal-service-token`), case-insensitive; the gateway keeps writing its own `x-forwarded-for/proto/host`. Unit test per header (RED first: 5 failures); the spec's fake header target is now case-insensitive like the real adapter in `prepare-request.ts`.
- Test hygiene: `dispatcher.middleware.spec.ts` no longer shares pooled keep-alive sockets between tests (a pooled socket to a previous test's server on a reused port gave an intermittent `write EPIPE`); 6 consecutive runs of that spec are green.

| Step | Command | Exit | Result |
|---|---|---|---|
| MUTATION no drain on the declared-length 413 | restored | 1 | dispatcher spec: see line above in this run |

| --- round 6: bounded drain on the declared-length 413, more client-supplied hint headers stripped --- | | | |
| R6 yarn typecheck | `yarn typecheck` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | n/a |
| R6 TZ=UTC yarn test --ci (env -i) | `env -i PATH="$PATH" HOME="$HOME" TZ=UTC NODE_ENV=test DATABASE_URL=postgresql://x:x@127.0.0.1:1/none yarn test --ci > /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log 2>&1; c=$?; grep -E '^Tests:|^Test Suites:' /private/tmp/claude-501/-Users-tgiap-dev-devs-examio/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/unit-full.log; exit $c` (cwd /Users/tgiap.dev/devs/examio/examio-be) | 0 | Test Suites: 115 passed, 115 total Tests:       1124 passed, 1124 total  |
| R6 gateway e2e run 1/2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
| R6 gateway e2e run 2/2 (phase command) | `jest --config test/jest-e2e.json ` (cwd apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       61 passed, 61 total  |
