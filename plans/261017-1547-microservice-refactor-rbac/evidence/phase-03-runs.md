# Phase 03 verification runs (implementer)

All commands from `/Users/tgiap.dev/devs/kmaedu/kmaedu-be` unless noted. Exit codes are real. Every infra-touching command ran with a COMPLETE env (env -i + explicit vars) pointing at local docker containers (Postgres 127.0.0.1:55433, Redis :56380, RabbitMQ :56672/56673); a wrapper refused any non-local DATABASE_URL. No .env file was read or printed; the manual run used cwd outside the repo so main.ts did not load apps/*/.env.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | RED: `yarn jest libs/messaging` before impl | 1 | 4 suites fail (missing modules) |
| 2 | RED: `node --test deploy/rabbitmq/render-definitions.spec.cjs` before impl | 1 | module missing |
| 3 | GREEN: `yarn jest libs/messaging` | 0 | envelope, consumer, relay, purge, role, relay-pool unit tests pass (30 tests) |
| 4 | `node --test deploy/rabbitmq/render-definitions.spec.cjs` | 0 | 5 pass; hash equals RabbitMQ doc reference (salt 908DC60A, test12); missing password exits 1, writes nothing |
| 5 | `prisma migrate dev --create-only --name messaging` (throwaway local DB, role kmaedu) | 0 | created 20261018065200_messaging; partial index hand-edited |
| 6 | `prisma migrate deploy` on empty DB (baseline + messaging) | 0 | both applied |
| 7 | `prisma migrate diff --from-url <local> --to-schema-datamodel schema.prisma --exit-code` | 0 | No difference detected (first attempt with a Prisma `@@index` next to the partial index exited 2, so the index is declared only in migration SQL) |
| 8 | `yarn proto:lint` / `yarn proto:gen` | 0 / 0 | auth_events.proto (UserRegistered) clean |
| 9 | `yarn jest apps/auth-service/src/auth.service` | 0 | 13 pass; mutation check (remove outbox.add from register) -> 3 fail, restored -> pass |
| 10 | `yarn jest apps/finance-service/src/events` | 0 | RED first (module missing), then 4 pass |
| 11 | Local broker: rendered definitions mounted; `rabbitmqctl list_users` / `list_topic_permissions` | 0 | users admin, auth, finance, exam, ai; finance write `^finance\.` read `.*` on kmaedu.events |
| 12 | `jest --config test/jest-e2e.json test/user-registered.e2e-spec.ts` (apps/finance-service) | 1 then 0 | first runs found two real bugs (provider getter scan; shutdown hang closing connection under a closing channel), fixed; final: 4 pass (dedupe 1 wallet + 1 welcome tx, retry ~30s across consumer restart credits once, source mismatch -> finance.dlq, ACCESS_REFUSED 403 on foreign publish and on consuming auth.events) |
| 13 | `jest --config test/jest-e2e.json test/register-outbox.e2e-spec.ts` (apps/auth-service) | 0 | 2 pass (register 201 -> one outbox row source auth; relay publishes; future lock skipped, expired lock re-claimed) |
| 14 | `jest --config test/jest-e2e.json` (libs/messaging) | 0 | purge e2e: 8d-published and 15d-processed deleted, newer/unpublished kept |
| 15 | Health e2e for auth/exam/finance/admin/r2/gateway against the rendered-definitions broker (per-service RABBITMQ_URL, SERVICE_NAME) | 0 each | 3/3 each |
| 16 | Manual: stop RabbitMQ; boot dist auth+finance (ROLE default api,worker); POST /api/v1/auth/register | - | HTTP 201; outbox row unpublished; wallet 0 |
| 17 | Manual: start RabbitMQ | - | auth reconnected 07:10:21.23, outbox published 21.75, wallet(20) + 1 welcome tx at 22.19 (about 1 s after broker accepted connections); queues finance.events/retry.30s/dlq present |
| 18 | `docker compose config` + `docker compose run --rm rabbitmq-defs` (all RABBITMQ_*_PASS set / one missing) | 0 / 1 | renders definitions.json (gitignored, removed afterwards); missing var fails before anything starts |
| 19 | `yarn typecheck` (final) | 0 | 6 services clean |
| 20 | `yarn build:all` (final) | 0 | 6 webpack builds |
| 21 | `yarn test` (final) | 0 | 55 suites, 418 tests pass |
| 22 | `grep -rn USER_CREATED kmaedu-be/apps kmaedu-be/libs` | 1 | no hits |
| 23 | `grep -rn "traceparent\|amq.default" kmaedu-be/libs/messaging/src` | 1 | no hits |
| 24 | `git -C kmaedu-be check-ignore deploy/rabbitmq/definitions.json` | 0 | prints the path |

Cleanup: containers p03-pg, p03-redis, p03-rmq and the compose one-shot removed; no node processes left; rendered definitions.json deleted; remote DBs untouched.

## Temper-finding fixes (coordinator follow-up)

Same SAFETY rule: local docker only (Postgres 127.0.0.1:55433, Redis :56380, RabbitMQ :56672), complete env via env -i wrapper, DATABASE_URL host verified local.

| # | Command | Exit | Result |
|---|---|---|---|
| 25 | BEFORE: `yarn test:cov --collectCoverageFrom='libs/messaging/src/**/*.ts' libs/messaging` | 0 | libs/messaging/src 61.0% lines (stmts 60.5, branch 59.8, funcs 48.4); amqp-connection 19.4, topology 38.9, consumer 70.9, relay 71.2, purge 84, module 0, outbox.service 0 |
| 26 | Fix 1: `RelayPoolCloser` (onApplicationShutdown -> pool.end()); relay loop and purge cron now stop in beforeApplicationShutdown so no query is in flight when the pool closes; registered in MessagingModule relay form | - | covered by relay-pool.spec + messaging.module.spec |
| 27 | Fix 2: state suffix regex -> `/\.(updated\|(?:[a-z0-9]+_)*changed)$/`; `state-event-types.spec.ts` (authz_changed -> authzVersion, x.updated/changed/role_changed -> version, x.created / unchanged -> fact) | - | matches `*.authz_changed`, not `unchanged` |
| 28 | Fix 3: deploy/docker-compose.yml rabbitmq image -> `rabbitmq:3.13-management-alpine` | - | matches CI. Erlang-cookie workaround NOT added: compose uses a named volume (`rabbitmq_data`), the gotcha only hits bind-mounted data dirs on Docker Desktop |
| 29 | `yarn jest libs/messaging` | 0 | 13 suites, 62 tests pass (new: amqp-connection, topology, purge lifecycle, relay stale alert/loop/publish timeout, consumer bootstrap/discovery/no-handler/closed-channel, outbox.service, module, state types, pool closer) |
| 30 | AFTER: `yarn test:cov --collectCoverageFrom='libs/messaging/src/**/*.ts' libs/messaging` | 0 | 96.31% lines (stmts 96.73, branch 94.39, funcs 98.43); amqp-connection, topology, consumer, outbox.service 100%; only index.ts (barrel, 0%) and a few defensive branches uncovered |
| 31 | e2e `register-outbox.e2e-spec.ts` on a fresh broker | 1 then 0 | failed: the test's capture queue bound `kmaedu.events` before any service declared it (test ordering, not lib); test now asserts the exchange first; passes twice |
| 32 | e2e `user-registered.e2e-spec.ts` (finance) and `libs/messaging` purge e2e after the shutdown-order change | 0 / 0 | 4 pass / 1 pass |
| 33 | `TZ=UTC yarn typecheck` | 0 | 6 services clean |
| 34 | `TZ=UTC yarn build:all` | 0 | 6 webpack builds |
| 35 | `TZ=UTC yarn test` | 0 | 62 suites, 450 tests pass |

Cleanup: containers p03-pg, p03-redis, p03-rmq removed; no node processes left; rendered definitions stayed in the scratchpad (not in the repo).
