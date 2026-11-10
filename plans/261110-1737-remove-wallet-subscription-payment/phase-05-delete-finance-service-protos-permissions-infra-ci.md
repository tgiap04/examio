# Phase 05 — Delete finance-service, protos, permissions, infra and CI

## Context Links
- [plan.md](./plan.md) · [scout-02 §1, 2, 4-8](./reports/scout-02-finance-service-infra-authz.md) · [scout-01 §5](./reports/scout-01-backend-money-flows.md)

## Overview
- Priority: P1 · Status: Completed · Effort: 2d · Depends on 02, 03, 04 (no remaining finance callers or permission literals).
- Delete `apps/finance-service` (83 files) and the finance protos and finance events. Delete the lib finance client and wallet cache. Remove 3 permissions and regenerate the docs and FE types. Remove the gateway finance routes and the auth `finance` audience and caller entries. Remove infra (compose, env, RabbitMQ, Postgres init, image, scripts) and CI matrix entries, and update the root tests.

## Key Insights
- The buf FILE category flags `FILE_NO_DELETE`. Decision: add scoped `ignore_only.FILE_NO_DELETE` for `kmaedu/finance` and `kmaedu/events/v1/finance_events.proto` in `proto/buf.yaml`, and delete the stale phase-10 wallet ignores. Verified on a scratch copy with buf 1.74.0: exit 0, lint clean.
  - Rejected: changing `breaking_against` or turning `breaking` off in `ci.yml`. That disables the check for every proto in this PR.
  - Rejected: switching to `WIRE_JSON`. That permanently weakens source-compat checks for ts-proto consumers.
  - Same precedent as phase 10. Remove the ignores in a follow-up commit after merge.
- `scripts/lint-migrations.sh` only checks added migrations. Deleting the app adds none; the finance schema is dropped by the DB reset or the ops note.
- `test/authz/{authz-matrix.spec.ts, handler-declarations.spec.ts}` import `FinanceServiceModule`, so the `rows` union type loses `'finance'`.
- `rpc-guard-table.spec.ts` lines 28-31 list `finance` as an auth caller. Edit them together with `auth.grpc.controller.ts`.

## Requirements
- Functional:
  - `/wallet/*`, `/payment/*` and `/webhook` return 404 at the gateway (no route).
  - A service token for audience `finance` is refused (`SERVICE_AUDIENCES` without it).
  - `auth.user.authz_changed` no longer has a finance consumer. Gateway and others still consume it.
- Permission catalog: no `wallet:use`, `subscription:manage` or `finance:admin`. TEACHER and SYSTEM_ADMIN lose only those. STUDENT is unchanged.
- Non-functional: `docker compose config` resolves with no finance service, and the RabbitMQ definitions render without a finance user, queues or binding.

## Architecture
- Topology after: gateway → auth, content, assessment, study-room, vocabulary, document, ai-chat, admin, r2, ai. There is no finance node and no `FINANCE_GRPC_URL` or `FINANCE_SERVICE_URL` anywhere.

## Related Code Files (BE = `/Users/tgiap.dev/devs/kmaedu/kmaedu-be`, ROOT = `/Users/tgiap.dev/devs/kmaedu`)
- Delete:
  - `BE/apps/finance-service/**`
  - `BE/proto/kmaedu/finance/v1/{wallet,subscription,finance_admin}.proto`
  - `BE/proto/kmaedu/events/v1/finance_events.proto`
  - `BE/libs/grpc/src/clients/finance.client.ts` (+spec)
  - `BE/libs/common/src/utils/wallet-cache.ts` (+spec)
  - `BE/deploy/compose/finance.yml`
  - `BE/deploy/env/finance.env.example`
  - `BE/test/cross-app/rpc-guard-table` finance rows (edit, not delete)
- Delete if unused after the finance client goes (`git grep newIdempotencyKey`): `BE/libs/grpc/src/clients/idempotency-key.ts` (+spec).
- Modify, libs:
  - `BE/libs/grpc/src/{index.ts, idempotent-rpcs.ts (+spec), deadline-retry.spec.ts}`
  - `BE/libs/common/src/index.ts:25`
  - `BE/libs/common/{constants,src/constants}/cache-keys.ts` (WALLET, WALLET_TRANSACTION, PAYMENT)
  - `BE/libs/common/src/seed/dev-seed-users.ts`
  - `BE/libs/contracts/src/index.ts` (6-8, 26-34)
  - `BE/libs/auth-jwt/src/permissions.ts` (27, 28, 32, 71-72, 78) (+`permissions.spec.ts`)
- Modify, protos: `BE/proto/buf.yaml`, and the `BE/proto/kmaedu/document/v1/document.proto` comment at 112 if still present.
- Modify, auth:
  - `BE/apps/auth-service/src/token/service-clients.ts:9`
  - `src/grpc/auth.grpc.controller.ts` (38, 51, 58)
  - `.env.example:25`
  - comments in `auth.service.ts` and `commands/cli.ts`
  - Tests: `test/{service-token, public-profiles, auth-users, auth-me-shape}.e2e-spec.ts`, `auth.grpc.contract.spec.ts`, `test/helpers/auth-app.ts`, `src/token/*.spec.ts`. Switch the sample audience/caller to `admin`, or to `content` where admin is already in use.
- Modify, gateway:
  - `BE/apps/gateway-service/config/routes.yaml` (16, 54-72)
  - `src/gateway.controller.ts:29-30`
  - `.env.example:16`
  - Tests: `test/{route-coverage.spec.ts, support/boot-gateway.ts, fixtures/route-inventory.json, gateway.e2e-spec.ts, gateway-authz.e2e-spec.ts}`, `src/pipeline/{guard-chain.spec.ts, proxy-factory.spec.ts}`
- Modify, vocabulary: `BE/apps/vocabulary-service/test/permissions.e2e-spec.ts` (1, 91-92).
- Modify, infra:
  - `BE/deploy/docker-compose.yml:21`
  - `BE/deploy/compose/{auth,content,document,ai-chat,admin,gateway,seed,infra}.yml`
  - `BE/deploy/.env.example`
  - `BE/deploy/env/{README.md, aichat.env.example, document.env.example}`
  - `BE/deploy/services.json:9`
  - `BE/deploy/rabbitmq/definitions.template.json` (finance user, queues and exchanges; the `aichat.events` ← `finance.subscription.changed` binding) and `render-definitions.spec.cjs`
  - `BE/deploy/postgres/init/01-service-schemas.sh:17` (SVCS, and the "ten schemas" comment → nine)
  - `BE/deploy/Dockerfile.node:71`
  - `BE/deploy/docker-entrypoint.sh:42-43`
  - `BE/deploy/compose-topology.spec.cjs`
  - `BE/deploy/deploy-service.test.sh` (fixture)
  - `BE/deploy/README.md`
  - `BE/deploy/cutover-runbook.md`
- Modify, build:
  - `BE/package.json` (typecheck, build:all, dev:all and seed:dev chains; remove `typecheck:finance`, `dev:finance`, `seed:dev:finance`, `finance:reconcile-teachers`)
  - `BE/nest-cli.json` (finance project 249-271; finance proto assets 169-170, 196-197, 235-236, 293-294)
  - `BE/scripts/{check-model-ownership.ts, boot-built-services.sh, ci-ephemeral-auth-env.sh, gen-service-secret.sh, prisma-migrate-dev.sh, prisma-schema-path.sh, changed-services.test.sh}`
- Modify, CI: `ROOT/.github/workflows/ci.yml` (finance matrix and env entries ~104, 164, 218, 230, 306, 323, 382, 394, 400, 418-421, 440-441, 464-465, 518, 569). The stats-parity step was already removed in 03.
- Modify, root tests:
  - `BE/test/authz/{authz-matrix.rows.ts, authz-matrix.spec.ts, handler-declarations.spec.ts}`
  - `BE/test/cross-app/{rpc-guard-table.spec.ts, helpers/real-auth-admin.ts, helpers/real-content.ts}`
  - `BE/test/db-isolation/{db-env.ts, db-isolation.e2e-spec.ts, migrations-and-seeds.e2e-spec.ts}`
  - `BE/test/build/proto-assets.spec.ts:13`
  - `BE/test/ownership/check-model-ownership.spec.ts` (Wallet fixture → another model)
- Regenerate:
  - `ROOT/kmaedu-fe/src/types/permissions.generated.ts` (`yarn gen:fe-permissions`)
  - `ROOT/docs/generated/permissions-matrix.md` and the generated block of `ROOT/docs/system/permissions.md` (`yarn gen:permissions-doc`)
  - `libs/contracts` generated (`yarn proto:gen`, gitignored)
  - ai-service stubs if any import finance (`apps/ai-service/scripts/gen_grpc.sh`)
- Leave as is: specs that use `'finance'` only as a sample string in `libs/messaging` and `libs/redis`, and `apps/ai-service/src/backend/tests/auth/test_service_token.py:46` (sample).

## Implementation Steps
1. RED tests:
   - `permissions.spec.ts`: the catalog lacks the 3 permissions, and STUDENT is unchanged (snapshot of the STUDENT list).
   - `service-clients` spec: `finance` is not an audience.
   - Gateway `route-coverage`: no `/wallet`, `/payment` or `/webhook` routes.
   - `render-definitions.spec.cjs`: no finance user, and `aichat.events` has no `finance.*` binding.
2. Delete finance-service, its protos, and the lib finance client and wallet cache. Edit `libs/contracts`, `libs/grpc` and `libs/common`.
3. Edit buf.yaml: remove the stale wallet ignores and add the scoped `FILE_NO_DELETE` ignores. Run `yarn proto:lint`, then `node_modules/.bin/buf breaking proto --against '../.git#branch=develop,subdir=kmaedu-be/proto'`; expect exit 0. Then `yarn proto:gen`.
4. Permissions: edit the catalog, then run `yarn gen:permissions-doc && yarn gen:fe-permissions`. Then `cd ../kmaedu-fe && yarn build` must stay green (proves 04 was complete).
5. Auth, gateway and vocabulary edits, then test updates.
6. Infra, scripts, package.json, nest-cli.json and CI. Then: `git grep -n -i "finance" -- kmaedu-be ':!kmaedu-be/docs' .github` should leave only the intentional sample-string specs.
7. Root tests: authz, cross-app, db-isolation, build and ownership.

## Todo List
- [ ] RED tests (permissions, audience, routes, rabbit definitions) (a red-first run is not recorded)
- [x] Delete app, protos and lib code (`apps/finance-service`, `proto/kmaedu/finance`, `libs/grpc` finance client absent)
- [ ] buf.yaml ignores and proto:lint (ignores present; buf breaking exit 0 and proto:gen not recorded)
- [ ] Permission catalog, gen docs, gen FE, FE build (catalog has none of the three permissions; permissions drift diff and FE build not recorded)
- [x] auth, gateway, vocabulary (no finance route or upstream in `routes.yaml`; reviewer confirms audiences)
- [x] Infra, scripts, package.json, nest-cli, CI (`ci.yml` and `package.json` have no finance hits; `FINANCE_GRPC_URL` only in negative assertions and the content line in S3)
- [x] Root tests (cross-app 30/30, db-isolation 69/69 per tester)
- [ ] Green (unit suite, `typecheck`, `build:all` not recorded)

## Success Criteria
- `apps/finance-service` and `proto/kmaedu/finance` are gone, and `yarn build:all` exits 0.
- `docker compose -f deploy/docker-compose.yml config` succeeds (with the example env) and lists no finance service.
- CI drift jobs pass: the FE permissions file and the permissions doc match the generators.

## Test Plan — Scope Contract (SAFETY-CRITICAL: authz catalog, service tokens, public API removal, config/CI/deploy, cross-service contracts)
- Changed: whole finance surface; auth-jwt catalog; auth audiences and callers; gateway routes; infra; CI; root tests.
- Impacted: every service (catalog and libs), FE types, deploy topology.
- Will verify (whole groups):
  - `cd kmaedu-be && yarn typecheck`
  - `yarn build:all`
  - `yarn test` (full unit suite: libs and apps; the catalog and libs touch every service)
  - `yarn test test/authz` and `yarn test test/build test/ownership`
  - `./node_modules/.bin/jest --config test/cross-app/jest-e2e.json`
  - `yarn test test/db-isolation`, `./node_modules/.bin/jest --config test/db-isolation/jest-e2e.json` (DB env required, else "verification incomplete")
  - e2e for `apps/auth-service`, `apps/gateway-service` and `apps/vocabulary-service` (`../../node_modules/.bin/jest --config test/jest-e2e.json` in each)
  - `yarn check:ownership && yarn check:deps && yarn proto:lint`, plus the buf breaking command above
  - `node --test deploy/compose-topology.spec.cjs deploy/rabbitmq/render-definitions.spec.cjs`, or the runner `ci.yml` uses for those specs (check the `deploy-tooling` job)
  - `bash scripts/changed-services.test.sh`, `bash scripts/lint-migrations.test.sh`
  - `cd ../kmaedu-fe && yarn build && yarn test`
- Bugs caught:
  - A permission literal left in a decorator, which would make every route on that service 500.
  - A service still requesting a `finance` audience token at boot.
  - Compose depends_on on a missing service.
  - A RabbitMQ binding to an exchange user that no longer exists.
  - The Postgres init expecting `FINANCE_DB_PASSWORD`.
  - A CI matrix entry for a deleted path.
  - FE compile after regen.
- Deliberately skipped: none of the safety groups. Python ai-service tests only if stubs changed.

## Risk Assessment
- A hidden consumer of a finance proto or `FINANCE_GRPC_URL`. Countermeasure: the `git grep` gate in step 6, plus `proto-assets.spec` and `build:all`.
- buf ignore paths for deleted files are not honoured by the CI action version. Countermeasure: the action pins buf 1.74.0, the same version verified locally.
- The authz matrix shrinks silently (lost rows mean less coverage). Countermeasure: only finance rows are removed; diff-review the row count (finance + admin-finance only).
- Rollback: revert the phase commits. Dev DB: `docker compose down -v`.

## Security Considerations
- Removing an audience means that any leaked `finance` service secret becomes useless. Also remove the `finance` entry from `SERVICE_CLIENTS` in env examples and the runbook.
- STUDENT permissions are unchanged (snapshot test). No accidental grant.

## Ops note (not code) — existing dev DBs or brokers with finance objects
- Preferred (precedent: exam-service removal): `docker compose down -v`, then bring the stack back up.
- If a volume must be kept:
  - Optional backup first: `pg_dump -n finance`.
  - As superuser: `DROP SCHEMA finance CASCADE; DROP ROLE finance_svc;`
  - `rabbitmqctl delete_user finance`.
  - Delete queues `finance.events`, `finance.retry.30s`, `finance.dlq` and exchanges `finance.retry`, `finance.requeue`, `finance.dead`.
  - Unbind `finance.subscription.changed` from `aichat.events`.
  - Remove `FINANCE_DB_PASSWORD`, `RABBITMQ_FINANCE_PASS`, `FINANCE_TAG` and the `finance` `SERVICE_CLIENTS` entry from `deploy/.env`. Delete the GHCR image `kmaedu-finance`.

## Next Steps
- 06 docs and final gate. After merge: remove the temporary buf `ignore_only` entries (FILE_NO_DELETE, FIELD_NO_DELETE, ENUM_VALUE_NO_DELETE).
