# Phase 04 verification runs (implementer)

All commands from `/Users/tgiap.dev/devs/kmaedu/kmaedu-be` unless noted. Exit codes are real.

SAFETY: every infra-touching command ran with a COMPLETE env (`env -i` wrapper that exports DATABASE_URL, REDIS_*, RABBITMQ_*, JWT_*, SERVICE_* and refuses any DATABASE_URL host other than localhost/127.0.0.1) against local docker containers `p04-pg` (pgvector pg16, 127.0.0.1:55434), `p04-redis` (:56381), `p04-rmq` (rabbitmq 3.13 with the rendered per-service definitions, :56673). No `.env` file was read or printed. Built services and the CLI were launched with cwd OUTSIDE the repo so `main.ts`/`cli.ts` `dotenv` could not load the gitignored `apps/*/.env` (remote DB). RS256 keys and service secrets for these runs were generated at run time into the scratchpad (never in the repo). Migrations were generated with `migrate dev --create-only` against a throwaway local DB as the deploying role. Containers `p04-*` removed at the end.

## Tests-first evidence (RED then GREEN)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | RED `yarn jest libs/auth-jwt` (permissions.spec before `permissions.ts`) | 1 | module missing |
| 2 | RED `yarn jest libs/auth-jwt/src/verify.spec.ts` before `verify.ts` | 1 | module missing |
| 3 | GREEN `yarn jest libs/auth-jwt` | 0 | permissions snapshot, verify (incl. kid rotation over a live JWKS server), guards, extract-token, service-token client, grpc-metadata, module wiring: 64 tests |
| 4 | RED `yarn jest apps/auth-service/src/token` before keys/token/service-clients | 1 | modules missing |
| 5 | GREEN same | 0 | 14 then 19 tests |
| 6 | RED `yarn jest apps/auth-service/src/roles` before `role-change.service.ts` | 1 | module missing |
| 7 | GREEN same | 0 | 15 tests: self-change 403, DB-rechecked actor 403, last-admin 409, re-apply, log+one event+invalidate after commit, 40P01 retried once then 409 ROLE_CHANGE_CONFLICT |
| 8 | RED `yarn jest apps/finance-service/src/modules/wallet/ensure apps/finance-service/src/events/handlers/user-authz` before impl | 1 | modules missing |
| 9 | GREEN same | 0 | 15 tests |
| 10 | `yarn jest apps/auth-service/test/auth.grpc.contract` (real in-process gRPC server behind the real guards) | 0 | 20 tests |
| 11 | `yarn jest apps/auth-service/test/rpc-guard-table apps/*/test/authz-declarations` | 0 | 30 tests: RPC guard table pinned per handler; every HTTP handler and every @GrpcMethod of auth/exam/finance/admin/r2 carries a declaration |
| 12 | `yarn jest apps/exam-service/test/finance-debit` | 0 | real gRPC exam->finance; UpdateBalance: no metadata UNAUTHENTICATED, admin user token / svc:auth PERMISSION_DENIED, svc:exam passes |

Bugs the tests found (fixed): `exports` local variable shadowing CJS `exports` inside `AuthJwtModule.forRoot` (provider token `undefined`; caught by `auth-jwt.module.spec`); `pg_advisory_xact_lock` returns `void`, `$queryRaw` cannot deserialize it (caught by the real-Postgres e2e; now `$executeRaw`); parallel e2e files sharing one DB demoted each other's admins (auth e2e now `maxWorkers: 1`).

Mutation checks: removing the advisory lock call makes `role-change.e2e-spec` "two concurrent demotions" fail (1 failed), restored -> passes.

## Migration

| # | Command | Exit | Result |
|---|---|---|---|
| 13 | `prisma migrate dev --create-only --name rbac_core` (throwaway DB kmaedu_mig) | 0 | `20261018093802_rbac_core` (BaseRole enum, role/isSystemAdmin/authzVersion, drops isAdmin, RoleChangeLog) |
| 14 | `prisma migrate deploy` on empty DB (baseline + messaging + rbac_core) | 0 | all applied |
| 15 | `prisma migrate diff --from-url <local> --to-schema-datamodel schema.prisma --exit-code` | 0 | No difference detected |
| 16 | `yarn proto:lint && yarn proto:gen` (`UserAuthzChanged` added) | 0 | clean |

## Real-infra e2e

| # | Command (cwd) | Exit | Result |
|---|---|---|---|
| 17 | `jest --config test/jest-e2e.json` (apps/auth-service, all) | 0 | 6 suites / 38 tests: token (JWKS verify with kid/typ/claims incl av, register STUDENT without subscription/wallet, /auth/me no isAdmin, unverified deny + allow list + verifyAccount re-issue, refresh after role change gives new roles and higher av, banned refresh/login 401 ACCOUNT_DISABLED + session revoked, logout by sid, password change/reset bump av + exactly one authz_changed), service-token (valid/wrong secret/unknown audience/unknown client/malformed, JWKS verify, 403 on user route), public-profiles (no email key, STUDENT denied GetUsersByIds, svc:admin allowed, SetUserRole by real admin token), role-change (demotion keeps content/ownership/open session/wallet, log + one event, re-apply, last admin 409, concurrent last-two-admins exactly one wins x5, demotion racing refresh never mixes roles/av x25), register-outbox, health |
| 18 | `jest --config test/jest-e2e.json` (apps/finance-service, all) | 0 | 14 tests: promote -> wallet 20 + Free sub, STUDENT nothing, demote + re-promote still 20, duplicate event no-op, forced re-apply recreates deleted wallet, forged source -> DLQ, lazy ensure on GET /wallet/info and /details, STUDENT 404, 4 racing ensureWallet -> 1 wallet 1 welcome tx (x5), reconcile-teachers creates exactly 2 |
| 19 | `jest --config test/jest-e2e.json` (apps/admin-service, all) | 0 | 13 tests: real guards with test-signed RS256 tokens (admin, TEACHER+ADMIN ok; STUDENT/TEACHER/unverified/service/missing/wrong-aud refused) |
| 20 | health e2e exam / r2 / gateway (`--testPathPatterns app.e2e-spec`) | 0 each | 3/3 each |
| 21 | `jest --config test/jest-e2e.json` (libs/messaging) | 0 | 1 test |
| 22 | boot every built service from dist (mirror of `scripts/boot-built-services.sh`, out-of-repo cwd, complete local env) | 0 | ok auth, exam, finance, admin, r2, gateway (http + grpc where applicable) |

## Manual (real processes: auth :3001 api+worker, finance :3002 api+worker, shared local DB/broker)

| Step | Result |
|---|---|
| `POST /auth/register` then `GET /auth/me` | roles `["STUDENT"]`, 6 STUDENT permissions, `wallet:null`, `subscription:null`, `user.isSystemAdmin:false`, no `isAdmin` key |
| `bootstrap:admin grant a@x.io --teacher` (same ts-node entry as `yarn bootstrap:admin:grant`, run from an out-of-repo cwd with the local env) exit 0 | RoleChangeService applied `{isSystemAdmin:true, role:TEACHER}` |
| login after grant | roles `["TEACHER","SYSTEM_ADMIN"]`, `word_family:save` and `role:assign` present, `user.isSystemAdmin:true` |
| finance `GET /wallet/info` with that token (verified by finance through auth's real JWKS over HTTP) | balance 20; `Wallet` row 20, exactly 1 `WalletTransaction`; finance worker log shows one ensureWallet from the outbox event |

## Final gates (after the last edit)

| # | Command | Exit | Result |
|---|---|---|---|
| 23 | `yarn proto:lint && yarn proto:gen` | 0 | clean |
| 24 | `yarn prisma:merge` then diff against the working `schema.prisma` | 0 | identical (schema.prisma is in sync with models) |
| 25 | `TZ=UTC yarn typecheck` | 0 | 6 services clean |
| 26 | `TZ=UTC yarn build:all` | 0 | 6 webpack builds (jose 5.10.0 bundles under CJS) |
| 27 | `TZ=UTC yarn test` | 0 | 82 suites, 604 tests |
| 28 | `grep -rn "AuthGuard\b\|AdminGuard\|OptionalAuthGuard\|JWT_SECRET" apps libs --include=*.ts` minus legitimate names | 1 (no residue) | only `GoogleAuthGuard`/passport `AuthGuard` import, `AuthStrictThrottlerGuard`, `JwtAuthGuard` (the mandated new name; the plan's `AuthGuard\b` regex matches it as a substring) and `QUIZ_JWT_SECRET` (unrelated quiz AES secret) |
| 29 | `grep -rni "userSession\|prisma" libs/auth-jwt` | 1 | no hits |
| 30 | `grep -rn "UseGuards(" apps/*/src --include=*.controller.ts` (excluding gateway, Throttler, Google) | 1 | none |
| 31 | `docker compose config -q` (deploy, dummy complete env) | 0 | valid with the new required JWT/service-client vars |
| 32 | `python3 -c yaml.safe_load(ci.yml)` | 0 | valid; be-boot/be-e2e now generate an ephemeral key via `scripts/ci-ephemeral-auth-env.sh` |

## Temper fix: gRPC IDOR (GetWallet and siblings) and coverage gaps

Same SAFETY rules (complete local env wrapper, local DB host guard, containers p04-pg/p04-redis/p04-rmq re-created and removed afterwards, no .env read).

Finding: finance `GetWallet` (`@RequirePermissionsOrService([])`) returned `data.userId`'s wallet to any verified user. Fix: new `assertSelfOrService(metadata, userId)` in `@kmaedu/auth-jwt`: a USER principal may only name its own `sub` (empty id never matches; no principal is denied), an allowlisted SERVICE principal may name anyone. Applied to every user-callable RPC that takes a user id in the body: finance `GetWallet`, finance `GetUserBenefits`, r2 `ListUserFiles`. Audit of the rest: auth `GetUser/GetUsersByIds/FindUserByEmail/ListUsers` need `user:manage` (privileged by design) or an allowlisted service; `SetUserRole/SetSystemAdmin/ListRoleChanges` need `role:assign` and take the actor from the token; `GetPublicProfilesByIds` is the no-email projection; r2 `GetFileUrl` is keyed by storage key (no user id); all other writes are `@ServiceOnly`.

| # | Command | Exit | Result |
|---|---|---|---|
| 33 | `yarn jest apps/finance-service/test/wallet.grpc` (real guards) | 0 | 15 tests: STUDENT/TEACHER other user's wallet and benefits PERMISSION_DENIED (no DB query), empty id denied, own OK, svc:exam/admin/auth OK, no metadata UNAUTHENTICATED |
| 34 | mutation: comment out the `assertSelfOrService` call in `getWallet`, same command | 1 | 3 regression tests fail; restored, passes |
| 35 | `yarn jest apps/r2-service/test/r2.guards apps/auth-service/test/rpc-guard-table` | 0 | r2 ListUserFiles IDOR denied / own+service pass the guard; table spec now also pins the exact "open to any user" RPC set and that each user-scoped one calls `assertSelfOrService` (30 tests) |
| 36 | new unit specs: `libs/auth-jwt/src/principal.spec.ts`, `apps/auth-service/src/token/service-token.controller.spec.ts` (wrong secret 401, unknown aud 401, malformed 400, fail-fast config), `apps/finance-service/test/auth-client.grpc.spec.ts` (listUsers paging + service token for aud `auth` against an in-process gRPC server; reconcile pages 1..3), `apps/auth-service/src/roles/role-change.repository.spec.ts` (advisory lock / FOR UPDATE / active-admin count SQL, 40P01/40001/P2034 retried once then 409 through the real repository), `authz-changed.publisher.spec.ts` (type, source auth, version = authzVersion) | 0 | included in the full run below |
| 37 | Real bug found while testing: `ReconcileTeachers` stopped paging by its own page size even if auth caps lower; now uses the page size the server applied | - | covered by 36 |
| 38 | `yarn prisma:merge && yarn proto:gen`, hashes of schema.prisma / auth_events.ts / auth_events.proto before and after | 0 | identical (no diff) |
| 39  yarn typecheck | 0 |  |
| 40  yarn build:all | 0 |  |
| 41  TZ=UTC yarn test | 0 | Test Suites: 88 passed, 88 total Tests:       661 passed, 661 total  |
| 42  finance e2e (all, apps/finance-service) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |
| 43  auth e2e (all, apps/auth-service) | 0 | Test Suites: 6 passed, 6 total Tests:       38 passed, 38 total  |
| 44  admin e2e (all) | 0 | Test Suites: 2 passed, 2 total Tests:       13 passed, 13 total  |
| 45  prisma migrate diff drift | 0 | No difference detected.  |

## Inspection rework

Same SAFETY rules (complete local env wrapper with DATABASE_URL host guard; local containers p04-pg/p04-redis/p04-rmq re-created and removed afterwards; seed and CLI run with an out-of-repo cwd). Note: Prisma's runtime itself loads the repo-root `.env` for variables that are NOT already set; DATABASE_URL, REDIS_*, RABBITMQ_* are always set explicitly by the wrapper, so every connection stayed local (verified in the local DB contents).

1. HIGH last-admin bypass: `isSystemAdmin` removed from `MUTABLE_FIELDS` and from the (`.strict()`) PATCH body, so PATCH with it is a 400. `grantAdmin`/`revokeAdmin` now call auth `SetSystemAdmin` through a new admin `AuthClient` (`apps/admin-service/src/clients/auth.client.ts`, gRPC via `@kmaedu/grpc`, `AUTH_GRPC_URL`) with the calling admin's token forwarded as metadata (`forwardUser(req)`); no actor in the body. Auth errors map to HTTP (LAST_SYSTEM_ADMIN/ROLE_CHANGE_CONFLICT 409, CANNOT_CHANGE_OWN_ROLE 403, ...). AdminAudit rows are kept. `AUTH_GRPC_URL` added to compose (admin), admin `.env.example`, CI be-boot/be-e2e env; nest-cli proto assets for admin-service; CI runs the new e2e.
2. r2 `GetFileUrl`: no caller exists in exam/auth/document code, so it is now `@ServiceOnly('exam', 'auth')` (like the other r2 RPCs); rpc-guard-table and r2 guard specs updated (user token, admin user token and svc:finance denied; svc:exam allowed).
3. `libs/database/prisma/seed-dev.ts`: removed the obsolete raw-SQL/remote-schema fallback that wrote `isAdmin`; admin = `isSystemAdmin: true`, dev users = `role: TEACHER` (they own wallets), no wallet for the admin.
4. `verify.ts`: `requiredClaims: ['exp', 'iat']`.
5. Deleted orphan `libs/common/utils/sanitize-user.ts` (nothing imports it; `libs/common/src/utils/sanitize-user.ts` is the live one).
6. Public `http://` JWKS: documented in `deploy/README.md` (internal http only, public must be https); no code.

| # | Command | Exit | Result |
|---|---|---|---|
| 46 | RED `yarn jest apps/admin-service/src/clients` before `auth.client.ts` | 1 | module missing |
| 47 | RED admin `test/admin-roles.e2e-spec.ts` before the change | 1 | 5 failed (PATCH accepted isSystemAdmin, grant/revoke bypassed auth) |
| 48 | GREEN `yarn jest apps/admin-service/src/clients` | 0 | 8 tests (token forwarded, no actor in body, error mapping 409/403/404/401, 503 not retried) |
| 49 | GREEN admin e2e (all: `jest --config test/jest-e2e.json`, apps/admin-service) | 0 | 3 suites / 20 tests; `admin-roles.e2e-spec` boots the real auth app (HTTP + gRPC) and the real admin app on one Postgres: PATCH isSystemAdmin 400; sole admin revoke self 403 CANNOT_CHANGE_OWN_ROLE and still admin; two admins revoking each other concurrently: one 200 + one 403/409, never zero admins (x3); grant writes RoleChangeLog (actor from token) + authzVersion+1 + one authz_changed + AdminAudit; revoke likewise; banned/unknown/non-admin refused. 409 LAST_SYSTEM_ADMIN is only reachable for the system actor (CLI) or under races; it is covered by the auth role-change e2e |
| 50 | RED `yarn jest libs/auth-jwt/src/verify` (token signed without exp/iat) | 1 | 1 failed |
| 51 | GREEN same after `requiredClaims` | 0 | 69 auth-jwt tests |
| 52 | `yarn jest apps/r2-service apps/auth-service/test/rpc-guard-table` | 0 | 41 tests |
| 53 | `yarn seed:dev` equivalent (`jiti libs/database/prisma/seed-dev.ts`, out-of-repo cwd) on a fresh migrated local DB kmaedu_seed | 0 | seeded; `togiap.admin` STUDENT + isSystemAdmin, dev users TEACHER, 0 wallets for the admin |
| 54  yarn proto:lint && yarn proto:gen | 0 |  |
| 55  yarn typecheck | 0 |  |
| 56  yarn build:all | 0 |  |
| 57  TZ=UTC yarn test | 0 | Test Suites: 89 passed, 89 total Tests:       669 passed, 669 total  |
| 58  auth e2e (all) | 0 | Test Suites: 6 passed, 6 total Tests:       38 passed, 38 total  |
| 59  admin e2e (all incl. admin-roles cross-service) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| 60  finance e2e (all) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |
| 61  boot every built service from dist, env -i complete CI-style env (out-of-repo cwd) | 0 | ok   auth (http 3000, grpc up) ok   exam (http 3000, grpc n/a) ok   finance (http 3000, grpc up) ok   admin (http 3000, grpc n/a) ok   r2 (http 3000, grpc up) ok   gateway (http 3000, grpc n/a)  |
