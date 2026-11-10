# Phase 08 runs (admin role-management screen)

Every command ran under `env -i` with a COMPLETE local env (`$SCRATCH/p08env.sh`: Postgres/Redis/RabbitMQ on 127.0.0.1:58541/58491/58783 in docker `p08-pg|p08-redis|p08-rmq`, throwaway JWT/service secrets, every outbound-capable key pinned to a local/dummy value), cwd under the repo only where jest needs it (the gitignored `.env` files were never read). Exit codes are real. Containers and services were removed afterwards.

## Safety finding (read this)

The first admin e2e run (row 2-3 below) logged `Failed to send welcome email ... gsmtp` (Gmail 421, then 535 with dummy creds): `libs/common/src/config/mail.config.ts` builds a `service: 'gmail'` nodemailer transport at import time from `EMAIL_USER/EMAIL_PASS`, and Prisma loads the gitignored repo `.env` for keys the shell did not set, so the e2e register flow dialled smtp.gmail.com (first run with the credentials from that `.env`; recipient `*@e2e.test`, undeliverable). The `NODE_OPTIONS --require` nodemailer stub used in phase 07 does NOT work under jest (jest has its own module registry). Fixes from that point: `EMAIL_USER/EMAIL_PASS` and every other outbound key pinned in the env, and the nodemailer transport is mocked inside jest (`jest.mock('nodemailer')` at the top of both new e2e specs; a `--setupFiles` mock for the older auth e2e specs). The same leak very likely applied to the register-driven e2e runs of earlier phases (04-07); worth rotating the mail credential and adding a permanent mock/guard in `libs/common` or the e2e helper.

## Runs

| step | command | exit | result |
|---|---|---|---|
| prisma migrate deploy (empty local DB) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd $SCRATCH/run8, env -i + local docker env) | 0 | n/a |
| admin e2e: admin-roles + ban (RED/GREEN first run) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 1 | Test Suites: 2 failed, 2 total Tests:       0 total  |
| admin e2e: admin-roles + ban (first run) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 passed, 2 total Tests:       1 failed, 19 passed, 20 total  |
| admin e2e: admin-roles + ban (stubbed smtp) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 1 | Test Suites: 2 failed, 2 total Tests:       2 failed, 18 passed, 20 total  |
| admin e2e: admin-roles + ban (nodemailer mocked) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 1 | Test Suites: 2 failed, 2 total Tests:       2 failed, 18 passed, 20 total  |
| admin e2e: admin-roles + ban (maxWorkers 1) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       20 passed, 20 total  |
| admin e2e: admin-roles + ban (+ban/revoke race) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       21 passed, 21 total  |
| yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| yarn test (full unit suite) | `yarn test` (cwd kmaedu-be, env -i + local docker env) | 1 | Test Suites: 1 failed, 146 passed, 147 total Tests:       20 failed, 1627 passed, 1647 total  |
| yarn test (full unit suite, after contract spec fix) | `yarn test` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 147 passed, 147 total Tests:       1653 passed, 1653 total  |
| auth e2e (token, service-token, role-change, public-profiles) with nodemailer setupFile mock | `../../node_modules/.bin/jest --config test/jest-e2e.json --setupFiles $SCRATCH/p08/mock-nodemailer.js test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 1 | n/a |
| auth e2e retry | `../../node_modules/.bin/jest --config test/jest-e2e.json --setupFiles $SCRATCH/p08/mock-nodemailer.js test/token.e2e-spec.ts` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 1 | n/a |
| auth e2e (token, service-token, role-change, public-profiles; nodemailer setupFile mock) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts --setupFiles $SCRATCH/p08/mock-nodemailer.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 1 | Test Suites: 4 failed, 4 total Tests:       0 total  |
| auth e2e debug | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts --setupFiles $SCRATCH/p08/mock-nodemailer.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       0 total  |
| auth e2e (token, service-token, role-change, public-profiles; nodemailer setupFile mock) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts --setupFiles $SCRATCH/p08/mock-nodemailer.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 4 passed, 4 total Tests:       33 passed, 33 total  |
| FINAL yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FINAL yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FINAL yarn test | `yarn test` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 147 passed, 147 total Tests:       1653 passed, 1653 total  |
| FINAL admin e2e (CI trio: admin + admin-roles + ban) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin.e2e-spec.ts test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       36 passed, 36 total  |
| FINAL auth e2e CI set (nodemailer setupFile mock) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/register-outbox.e2e-spec.ts --setupFiles $SCRATCH/p08/mock-nodemailer.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 5 passed, 5 total Tests:       35 passed, 35 total  |
| FINAL FE yarn build | `yarn build` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| FINAL FE yarn lint | `yarn lint` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |

## Runs executed outside the wrapper (same env, exit codes as observed)

| step | command | exit | result |
|---|---|---|---|
| proto lint | `yarn proto:lint` (kmaedu-be) | 0 | clean |
| proto gen | `yarn proto:gen` | 0 | `targetEmail/actorEmail/source` appear in generated `auth.ts` (generated dir is gitignored) |
| buf breaking | `buf breaking proto --against '/Users/tgiap.dev/devs/kmaedu/.git#ref=HEAD,subdir=kmaedu-be/proto'` | 0 | additive change only |
| unit specs (user-status + rpc guard table) | `jest apps/auth-service/src/user-status apps/auth-service/test/rpc-guard` | 0 | 40 passed (user-status spec was written before the service; RED = module missing) |
| unit specs (admin roles/users/client) | `jest apps/admin-service/src` | 0 | 68 passed at the time; final count inside the 1653 |
| admin.e2e (real guards, faked prisma) | `jest --config test/jest-e2e.json test/admin.e2e-spec.ts` (apps/admin-service) | 0 | 15 passed (grant-admin test replaced) |
| authz matrix + declarations | `jest test/authz apps/admin-service/src` | 0 | 348 passed, new rows for ban/unban and 5 `/admin/roles` routes |
| auth gRPC contract spec | `jest apps/auth-service/test/auth.grpc.contract.spec.ts` | 0 | 26 passed (was 20 failing after the real UserStatusService became a controller dependency; UNIMPLEMENTED test replaced by 7 SetUserStatus tests) |
| mutation proof | `python3 $SCRATCH/mutate8.py` (11 single-line mutants of user-status.service, admin-roles, admin-users; each runs the owning jest folder, file always restored) | n/a | 11/11 KILLED (no lock, no self check, no last-admin guard, sessions not revoked, no authz event, no actor re-check, no-op writes, audit on no-op, no forwarded token, direct User write on ban, audit before RPC). KILLED = spec failed or did not compile |
| live gateway probe (built dist: auth + admin + gateway, GATEWAY_CONTROL_ENABLED=true) | `node $SCRATCH/p08/live/probe.cjs` | 0 | 16/16 PASS, `evidence/phase-08/gateway-probe.json`: promote -> old token 401 TOKEN_STALE -> refresh returns TEACHER; ban -> next request 401 SESSION_REVOKED, refresh 401; self role/ban 403 |
| headless browser (puppeteer-core + Chrome, FE vite :5273 -> gateway) | `node $SCRATCH/p08/live/ui.cjs` | 0 | 27/27 PASS, `evidence/phase-08/ui-browser-run.txt|json`, screenshots in `ui-screens/`; no request left localhost. NOTE: a CDP shim adds the deprecated `user.isAdmin` to /auth responses because `AdminRoute.tsx` (phase 09) still reads it |
| grep: grant-admin/revoke-admin/grantAdminApi in kmaedu-be/apps, kmaedu-fe/src | `grep -rn ...` | 1 (no match) | none left |
| grep: isAdmin in adminApi.ts, components/admin, useAdminStore.ts, admin-service/src | `grep -rn isAdmin ...` | 1 (no match) | none left |
| grep: InvalidateUser/invalidateUser/gateway-control in admin-service/src | `grep -rn ...` | 1 (no match) | none |
| grep: prisma.user.update / tx.user.update in admin-users.service.ts | `grep -n ...` | 0 | only line 217, the profile `updateUser` (name/bio/isVerified) |

## Mail made impossible from tests at the source (coordinator follow-up)

Change: `libs/common/src/config/mail.config.ts` now builds the transport lazily on first send (`getMailTransporter()`; `mailTransporter.sendMail` is a thin lazy facade, so existing spies keep working). `NODE_ENV=test` or `MAIL_TRANSPORT=json` -> nodemailer `{ jsonTransport: true }` whatever `EMAIL_USER/EMAIL_PASS` hold; `NODE_ENV=production` without both creds throws `EMAIL_USER and EMAIL_PASS are required in production ...`. `kmaedu-be/test/jest-env.setup.js` (sets `NODE_ENV=test`, `MAIL_TRANSPORT=json`) is a `setupFiles` entry of `jest.config.js` and of every `apps/*/test/jest-e2e.json` and `libs/messaging/test/jest-e2e.json`. CI already sets `NODE_ENV: test` on both test jobs. Removed: the `jest.mock('nodemailer')` in the two new admin e2e specs and the `mailTransporter` spy in `gateway-integration.e2e-spec.ts`. Unit spec `mail.config.spec.ts` (7 tests: no transport at import, JSON transport with `{jsonTransport:true}` and zero `net/tls` connects, built once, production without creds throws, production with creds = gmail service); 2 mutants (drop the test branch, drop the production check) KILLED. RED was observed first (module had no `getMailTransporter`).

The runs below used an env WITHOUT `EMAIL_USER/EMAIL_PASS` and without the nodemailer `NODE_OPTIONS` stub (so Prisma's dotenv may fill the real credentials). A scratch jest setupFile (`$SCRATCH/p08/net-spy.js`) logged every `net.Socket.connect`, `tls.connect` and `dns.lookup`: only 127.0.0.1:58541 (local Postgres), port-only localhost sockets and DNS for 127.0.0.1/0.0.0.0 occurred; no smtp.gmail.com or any non-local name.

| step | command | exit | result |
|---|---|---|---|
| prisma migrate deploy (fresh DB 2) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd $SCRATCH/run8, env -i + local docker env) | 0 | n/a |
| MAIL: yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| MAIL: yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| MAIL: TZ=UTC yarn test | `TZ=UTC yarn test` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 148 passed, 148 total Tests:       1660 passed, 1660 total  |
| MAIL: admin e2e trio, EMAIL_* UNPINNED, net-connect spy | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin.e2e-spec.ts test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       36 passed, 36 total  |
| MAIL: auth e2e CI set + register-outbox, EMAIL_* UNPINNED, net-connect spy | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/register-outbox.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 5 passed, 5 total Tests:       35 passed, 35 total  |
| MAIL: admin ban+roles e2e again with dns+net spy (EMAIL_* unpinned) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       21 passed, 21 total  |
| MAIL: auth register-outbox e2e with dns+net spy | `../../node_modules/.bin/jest --config test/jest-e2e.json test/register-outbox.e2e-spec.ts test/token.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |

## Follow-ups (last-admin pin, e2e hygiene, VALIDATION_ERROR, coverage, render-definitions)

1. Last-admin 409 pinned deterministically in `role-change.service.spec.ts` (SetSystemAdmin false) and `user-status.service.spec.ts` (SetUserStatus ban): actor and target are different accounts, the locked count returns 1, call order is exactly `lock, findActor, findTarget, count`, and no write/event/gateway call happens. The gRPC mapping to ABORTED + `LAST_SYSTEM_ADMIN` was already in `auth.grpc.contract.spec.ts`. The concurrent e2e invariants are unchanged.
2. e2e hygiene (`test/helpers/real-auth-admin.ts`): `bootHarness` first demotes every pre-existing admin; `close()` deactivates what the suite created (sessions inactive, `isSystemAdmin=false`, `deletedAt` set, quiz sets deleted). Two consecutive runs on the same DB are green. `admin.e2e-spec.ts` uses a faked Prisma and creates nothing.
3. `/admin/users*` now uses the same `AdminValidationPipe` (renamed from `RolesValidationPipe`): PATCH with `isBanned`/`isSystemAdmin`/`role` is `400 VALIDATION_ERROR`; asserted in `admin.e2e-spec.ts` and `ban.e2e-spec.ts` (RED seen first).
4. New specs: `admin-users.service.queries.spec.ts` (list/detail/update) and `user-status.repository.spec.ts`. Coverage of the phase-08 subset (unit run only; controllers, modules and DTOs are exercised by the e2e suites, not counted here): admin-users.service 100% lines / 89% branches, user-status.repository 100/100, user-status.service 100 / 93, admin-roles.service 93.5 / 76, admin-roles.mapper 100 / 90, auth.client 86 / 100, mail.config 100/100, update-user.body and user-select.safe 100.
5. `deploy/rabbitmq/render-definitions.cjs`: without `--out` the file now goes to `<os.tmpdir()>/definitions.json` and the printed path is absolute; it never writes into the repo tree (new test, RED seen first; 8/8 node tests). The two callers that relied on the old default now pass `--out`: `deploy/docker-compose.yml` (`--out /defs/definitions.json`) and `.github/workflows/ci.yml` (`--out "$PWD/deploy/rabbitmq/definitions.json"`). `docs/system/architecture.md` still describes the old default (doc-writer).

| step | command | exit | result |
|---|---|---|---|
| FU: prisma migrate deploy (fresh DB 3) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd $SCRATCH/run8, env -i + local docker env) | 0 | n/a |
| FU: yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FU: TZ=UTC yarn test | `TZ=UTC yarn test` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 150 passed, 150 total Tests:       1673 passed, 1673 total  |
| FU: node --test deploy/rabbitmq/render-definitions.spec.cjs | `node --test deploy/rabbitmq/render-definitions.spec.cjs` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FU: admin e2e trio (+net/dns spy, EMAIL_* unpinned) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin.e2e-spec.ts test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       36 passed, 36 total  |
| FU: admin e2e trio, 2nd run on the same DB (hygiene: no dependence on leftovers) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin.e2e-spec.ts test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       36 passed, 36 total  |
| FU: auth e2e CI set + register-outbox (+net/dns spy) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/register-outbox.e2e-spec.ts --setupFiles kmaedu-be/test/jest-env.setup.js $SCRATCH/p08/net-spy.js` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 5 passed, 5 total Tests:       35 passed, 35 total  |
| coverage (unit subset) | `jest apps/admin-service/src apps/auth-service/src/user-status libs/common/src/config --coverage --collectCoverageFrom=<phase-08 files>` (kmaedu-be) | 0 | table above |

## Review fixes (best-effort audit, SetUserStatus permission)

1. `AdminUsersService.setBanned` and both `AdminRolesService` writes now go through `writeAuditBestEffort` (`modules/admin-roles/best-effort-audit.ts`): after the committed auth RPC, an AdminAudit failure is caught and logged with `userId`, `action` and `admin`, and the committed result is returned (auth's RoleChangeLog is the durable record). The synchronous `updateUser` audit (same transaction as the write) is unchanged. Unit tests (failed first, 3 red): ban with a throwing audit returns the banned user and logs once; setRole/setSystemAdmin log once each.
2. `AuthGrpcController.setUserStatus`: `user:manage` -> `role:assign`. `rpc-guard-table.spec.ts` now pins the row (`setUserStatus`, permissions `role:assign`); the contract spec uses SYSTEM_ADMIN tokens (hold both permissions) so needed no change. The admin-service `POST /admin/users/:id/ban|unban` routes stay `user:manage` at the HTTP guard.

| step | command | exit | result |
|---|---|---|---|
| RF: prisma migrate deploy (fresh DB 4) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd $SCRATCH/run8, env -i + local docker env) | 0 | n/a |
| RF: yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| RF: TZ=UTC yarn test | `TZ=UTC yarn test` (cwd kmaedu-be, env -i + local docker env) | 1 | Test Suites: 1 failed, 149 passed, 150 total Tests:       1 failed, 1675 passed, 1676 total  |
| RF: admin e2e ban + admin-roles (+admin.e2e) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/admin.e2e-spec.ts test/admin-roles.e2e-spec.ts test/ban.e2e-spec.ts` (cwd kmaedu-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       36 passed, 36 total  |
| RF: auth e2e CI set | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/register-outbox.e2e-spec.ts` (cwd kmaedu-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 5 passed, 5 total Tests:       35 passed, 35 total  |
| RF: TZ=UTC yarn test (re-run) | `TZ=UTC yarn test` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 150 passed, 150 total Tests:       1676 passed, 1676 total  |

Note on the `RF: TZ=UTC yarn test` row with exit 1 above: one suite failed (`apps/auth-service/src/admin-bootstrap/admin-bootstrap.service.spec.ts`, 1 test) while three docker containers were still starting; the same spec passes alone (11/11, 10.6 s) and the full re-run is 150/150 suites, 1676 tests, exit 0. Treated as a load-sensitive timing flake of an untouched phase-04 spec, not a regression; it did not recur in two further full runs.
