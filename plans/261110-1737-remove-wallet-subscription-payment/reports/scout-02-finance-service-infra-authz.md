# Scout 02 — finance-service, proto, admin/auth/gateway, permissions, infra, CI, docs

Source: Explore agent, 2026-11-10 (read-only; saved by orchestrator). Paths under `examio-be/` unless absolute.

## 1. finance-service — delete whole `apps/finance-service` (83 tracked files)
- API: Wallet, SePay, FinanceAdmin, FinanceStats modules. Worker: `auth.user.authz_changed` handler (teacher wallet), outbox relay, subscription-expiry sweeper publishing `finance.subscription.changed`. CLI `src/commands/{cli,reconcile-teachers}.ts`.
- HTTP: `/wallet/{info,details}`, `/payment/{create,status/:id,history,cancel/:id,subscription,subscription/plans}`, `POST /webhook` (SePay). Schema: Wallet, WalletTransaction, Payment, UserSubscription, outbox_events, processed_events.
- Still needed elsewhere → must replace/drop: `GetRevenueStats` (admin overview proCount/vipCount/revenue30d, `revenue` series), `GetUserFinance` (admin user detail), `GetUserBenefits` (document monthly quota, ai-chat limits; free tier filesPerMonth 5 / messagesPerMinute 5 / chatMessagesLimit 30 at `src/types/subscription.ts:40-46`), Debit/Refund (content, document).

## 2. Proto
- Delete `proto/examio/finance/v1/{wallet,subscription,finance_admin}.proto`, `proto/examio/events/v1/finance_events.proto`.
- Edit `proto/examio/document/v1/document.proto:112` comment; `proto/buf.yaml:19-26` stale wallet ignores; `libs/contracts/src/index.ts:6-8,26-34`.
- RISK: CI `buf` job (`.github/workflows/ci.yml:20-37`) breaking category FILE → `FILE_NO_DELETE` trips. No precedent of deleting a proto file. Add ignores in buf.yaml or accept; verify locally.

## 3. admin-service
- Delete `src/clients/finance.client.ts`, `src/modules/admin-finance/**` (`POST /admin/finance/{refund,credit,set-tier,tier}`), `test/admin-finance.e2e-spec.ts`, `AdminFinanceModule` in `src/admin-service.module.ts:12,50`.
- Edit admin-stats (`admin-stats.module.ts:10-26`, `admin-stats.service.ts:48-58,132-134`, `admin-stats.types.ts:6,14-16`, `dto/series.query.ts`, `admin-stats-fe-routes.controller.ts:17`, `admin-stats.controller.ts:33`): drop revenue/proCount/vipCount/revenue30d. admin-users (`admin-users.module.ts:7-21`, `admin-users.service.ts:25-37,104-135`, `admin-users.controller.ts:49`): drop wallet/subscription/financeUnavailable. `admin-audit.service.ts:31-41` `admin.finance.*`→payment mapping (keep or drop). `prisma/seed.ts:39-43` finance audit samples.
- Tests: `admin.e2e-spec.ts:17,62,78,237`, `admin-stats.service.spec.ts`, `admin-users.service.queries.spec.ts`, `admin-finance.service.spec.ts`.

## 4. auth-service
- `src/token/service-clients.ts:9` drop `'finance'` from SERVICE_AUDIENCES; `src/grpc/auth.grpc.controller.ts:38,51,58` drop `finance` from callers (keep RPCs); `.env.example:25`; comments `auth.service.ts:207,704-705`, `commands/cli.ts:31`.
- Tests using finance as sample audience/caller → switch to another service: `service-token.e2e-spec.ts:22-67`, `public-profiles.e2e-spec.ts:79-85`, `auth-users.e2e-spec.ts:181-205`, `auth.grpc.contract.spec.ts:174,206`, `test/helpers/auth-app.ts:15`, `token/*.spec.ts`, `auth-me-shape.e2e-spec.ts:13-18`.

## 5. gateway-service
- `config/routes.yaml:16` finance upstream; `:54-72` routes wallet, payment (public `GET /payment/subscription/plans`), webhook-sepay; `src/gateway.controller.ts:29-30` FINANCE_SERVICE_URL; `.env.example:16`. No page flag on finance.
- Tests: `test/route-coverage.spec.ts:21,58,230-231,274-281`, `test/support/boot-gateway.ts:24-115`, `test/fixtures/route-inventory.json`, `gateway.e2e-spec.ts`, `gateway-authz.e2e-spec.ts`, other e2e, `guard-chain.spec.ts`, `proxy-factory.spec.ts`.

## 6. Permissions (`libs/auth-jwt/src/permissions.ts`)
- Remove WALLET_USE (:27), SUBSCRIPTION_MANAGE (:28) + TEACHER entries (:71-72); FINANCE_ADMIN (:32) + SYSTEM_ADMIN entry (:78).
- Student AI chat: all `/ai-chat/*` need `ai_chat:use` (gateway `routes.yaml:122-134`, `ai-chat.controller.ts:34`). Attachments need `document:upload` (ai-chat forwards user token to GetDocumentsByIds/AssertOwnership/EnsureProcessed/DeleteDocuments, all `document:upload`, `document.grpc.controller.ts:51-146`). Upload routes `/ai/upload*`, `/ai/quick-upload`, `/ai/upload-image` (`upload.controller.ts`), `/r2/image` (`r2-image.controller.ts:25`), `/ai/recent-uploads` (content `ai.controller.ts:79`) need `document:upload`. Gateway `ai-upload` has `pageFlag: ai-tool` (`routes.yaml:107-114`).
- Pinning tests: `libs/auth-jwt/src/permissions.spec.ts:10-60`; `test/authz/authz-matrix.rows.ts` (union :18, document rows :420-453 + ai-chat :455-465 expect STUDENT 403, finance rows :472-518, admin finance :610); `test/authz/authz-matrix.spec.ts:14,130`; `handler-declarations.spec.ts:10,29,46`; `test/cross-app/rpc-guard-table.spec.ts:43-51`; `apps/ai-chat-service/test/ownership.e2e-spec.ts:90`, `apps/document-service/test/upload-money.e2e-spec.ts:405` (STUDENT 403).
- Regenerate: `yarn gen:permissions-doc` (→ docs/generated/permissions-matrix.md + docs/system/permissions.md block), `yarn gen:fe-permissions` (→ examio-fe/src/types/permissions.generated.ts). CI drift jobs `ci.yml:642-681`.

## 7. Infra / CI
- Delete `deploy/compose/finance.yml`, `deploy/env/finance.env.example`.
- Edit: `deploy/docker-compose.yml:21`; `compose/auth.yml:58` (depends_on finance); `compose/content.yml:43-46,76`; `compose/document.yml:38-41,61`; `compose/ai-chat.yml:35-57`; `compose/admin.yml:45-46`; `compose/gateway.yml:42,82`; `compose/seed.yml:19,40,50`; `compose/infra.yml:57,83,140`; `deploy/.env.example:26,44,69`; `deploy/env/README.md:15,29`; `deploy/env/{aichat,document}.env.example:6`; `deploy/services.json:9`.
- Broker/DB: `deploy/rabbitmq/definitions.template.json:18-19,87-91,152-156`; `deploy/rabbitmq/render-definitions.spec.cjs:16,43,50-60,217-240`; `deploy/postgres/init/01-service-schemas.sh:17` (SVCS + "ten schemas" comment).
- Image: `deploy/Dockerfile.node:71`, `deploy/docker-entrypoint.sh:42-43`.
- Deploy tests/docs: `deploy/compose-topology.spec.cjs:22-23,74,222,231,309,333,338,375,411-414,499`; `deploy/deploy-service.test.sh:86-90` (fixture, optional); `deploy/README.md` (~24); `deploy/cutover-runbook.md:48,131-135`.
- `package.json`: typecheck:finance (:20) + use (:24), build:all (:25), dev:finance (:39) + dev:all (:44), seed:dev:finance (:54) + seed:dev (:58), finance:reconcile-teachers (:64).
- `nest-cli.json`: finance-service project (:249-271); finance proto assets for document (:169-170), ai-chat (:196-197), content (:235-236), admin (:293-294).
- Scripts: `check-model-ownership.ts:21,26,48-49`; `boot-built-services.sh:22-23`; `ci-ephemeral-auth-env.sh:7,22`; usage text `gen-service-secret.sh:11`, `prisma-migrate-dev.sh:5,14`, `prisma-schema-path.sh:3,7`; `changed-services.test.sh:10-11,86-87`.
- libs: `libs/grpc/src/clients/finance.client.ts` (+spec), `index.ts:7` — move GrpcMetadataAttacher/GRPC_METADATA_ATTACHER (:15-18) first (used by public-profile.client.ts:16 and ai-chat/content/document modules); `idempotent-rpcs.ts:18-31` (+spec), `deadline-retry.spec.ts`; `libs/common/src/utils/wallet-cache.ts` (+spec), `index.ts:25`; cache-keys WALLET/WALLET_TRANSACTION/PAYMENT in `libs/common/src/constants/cache-keys.ts` and `libs/common/constants/cache-keys.ts`; `libs/common/src/seed/dev-seed-users.ts:4-5,37`. Sample-name-only specs may stay.
- CI `.github/workflows/ci.yml`: 104, 164, 218, 230, 306, 323, 382, 394, 400, 418-421, 440-441, 464-465, 487-490 (stats-parity), 518, 569.
- Root tests: `test/stats-parity/*` (rework/delete); `test/cross-app/finance-debit.grpc.spec.ts` (delete); `test/cross-app/admin-users-real-auth.e2e-spec.ts:3-91`; `helpers/real-auth-admin.ts:111`; `helpers/real-content.ts:52`; `test/db-isolation/db-env.ts:4-16`, `db-isolation.e2e-spec.ts:6,47`, `migrations-and-seeds.e2e-spec.ts:98-121`; `test/build/proto-assets.spec.ts:13`; `test/ownership/check-model-ownership.spec.ts` (Wallet fixture → swap); `apps/ai-service/src/backend/tests/auth/test_service_token.py:46` (sample).

## 8. Dropping finance schema/role
- `scripts/lint-migrations.sh` only checks ADDED migration files; deleting the app adds none.
- Precedent: exam-service removal (`6b008c4`, `bd3ed4c`, `b9e2674`): removed from SVCS, devs ran `docker compose down -v`; runbook relied on fresh broker volume. No SQL in repo drops schema/role/broker user.
- Ops step (if a DB with finance exists): `pg_dump -n finance`; superuser `DROP SCHEMA finance CASCADE; DROP ROLE finance_svc;`; `rabbitmqctl delete_user finance`; delete queues `finance.events`, `finance.retry.30s`, `finance.dlq`, exchanges `finance.retry`, `finance.requeue`, `finance.dead`; unbind `finance.subscription.changed` from `aichat.events`; drop GHCR image + FINANCE_TAG.

## 9. Docs
- CLAUDE.md (32 mentions), AGENTS.md (mirror), ARCHITECTURE.md (65), README.md, architecture-overview.mmd.
- `docs/system/{architecture,overview,business-rules,glossary,permissions}.md`.
- `docs/generated/*`: permissions-matrix via `yarn gen:permissions-doc`; others (route-list, api-map, entities, feature-list, behavior-logic, screen-list, screen-flow, user-stories) from rebuild-spec skill → hand edit or re-run.
- `docs/features/F005_Finance/*`, `docs/flows/FLOW001`/`FLOW002`/`FLOW006`, `docs/screens/SCR015_SubscriptionPage/*`; minor in F006, F007, F010, F014, SCR001, SCR013, SCR024, `docs/index.md`, `docs/development-roadmap.md`.
