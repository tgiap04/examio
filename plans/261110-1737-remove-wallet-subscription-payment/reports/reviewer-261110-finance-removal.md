# Review: remove wallet / subscription / payment (finance-service)

Branch `feat/remove-finance` vs `develop`. The review covers the working tree: staged deletions, unstaged edits and untracked new files. It was read-only.

## Scope
- Files reviewed: content-service `modules/ai/*`, the content and document migrations and both `schema.prisma`; document-service `upload/*` (register, upload, queue, processing, query, repository, mapper, grpc controller, worker); ai-chat turn, answer, stream, module and constants; auth grpc controller and service-clients; `libs/auth-jwt` permissions and guard; `libs/grpc` (metadata, document-errors, idempotent-rpcs, index); `proto/buf.yaml`, `document.proto`, the event protos and the Python stubs; gateway `routes.yaml`; deploy (compose, postgres init, rabbitmq template, services.json); `ci.yml`, `package.json`, `nest-cli.json`, `scripts/*`; FE admin api, pages, drawer, audit table and locales.
- Lines: 434 files, +1443 / -21598 (most of it deletions).
- Depth: full on the safety-critical paths. Docs were not reviewed.

## Assessment
The removal is clean and well tested. Every claim I checked against the code holds:

- **Generation submit is atomic.** The job is inserted QUEUED and the outbox row is written in one `$transaction`.
- **The generation lock is released on every path.** That covers the catch in `generateFromFile` and `regenerate`, the early return for a reused PROCESSING document, cancel, the watchdog, and the failed and completed consumers. The completed consumer releases only after its tx commits.
- **Document register and createFromBytes are atomic.** The PENDING row and `document.uploaded` commit in one tx, so the PENDING_CHARGE limbo is gone. That makes dropping the `VISIBLE` filter safe.
- **The defensive `DELETE ... WHERE "chargeFailedAt" IS NOT NULL` orphans no R2 object.** On `develop`, `chargeFailedAt` is set only by `repo.claimFailed`, and its only caller `DocumentChargeService.claimFailed` enqueues the R2 key in the same tx. Those rows never emitted `document.uploaded` either, so ai-service holds no vectors for them.
- **`ListUsers` with `callers: []` denies every service token.** `serviceAllowed` is `!callers || callers.includes(name)`, so an empty array denies. Admin calls it with a forwarded user token (`forwardUser`), which still passes on `user:manage`.
- Assessment reads only `getQuota().fileCount`.
- The Python stubs carry the reserved ranges.
- No route, upstream, permission, broker user, compose include, CI matrix entry or script still points at finance.

No critical findings.

## Critical
None.

## High / Warning

**W1. The new files are untracked, and the change does not build or migrate without them.** Location: `git status`, lines starting `??`.
- `kmaedu-be/apps/document-service/src/modules/upload/document-queue.service.ts` is imported by `document-register.service.ts:7`, `document-upload.service.ts:8` and `document-processing.service.ts`.
- Both contract migrations are untracked: `apps/content-service/prisma/migrations/20261110180000_remove_generation_charge/` and `apps/document-service/prisma/migrations/20261110180000_remove_upload_charge/`.
- The new specs are untracked: `generation-job.service.spec.ts`, `generation-lifecycle.e2e-spec.ts`, `document-register.service.spec.ts`, `document-upload.service.spec.ts`, `test/upload.e2e-spec.ts`, `ai-chat-turn.service.spec.ts`, `no-message-limits.e2e-spec.ts` and FE `permission-groups.test.ts`.

Cost: a commit made with `git commit -a` or `git add -u` compiles red, and the Prisma client would expect columns the DB still has. That is schema drift, and CI's "no drift" step fails. Fix: stage these paths explicitly when committing, and check that `git status --short | grep '^??'` shows only `plans/`.

## Medium

**M1. The ListUsers decorator reads as a service exception that no longer exists.** Location: `apps/auth-service/src/grpc/auth.grpc.controller.ts:59`. `@RequirePermissionsOrService(['user:manage'], { callers: [] })` is correct, but the "or service" form now has an empty allowlist. Fix: `@RequirePermissions('user:manage')`. The guard is identical (user token, verified email, permission) and it says what it means. Check first that `rpc-guard-table.spec.ts` accepts the `permissions` kind for this RPC, and update the spec if it pins the declaration kind.

**M2. Generation leaves an unused free upload behind when `submit` fails.** Location: `apps/content-service/src/modules/ai/ai.service.ts:103-106`. `develop` deleted a just-created document only when the charge was refused. Now nothing is refused, so a DB or outbox failure in `submit` keeps the new upload. It is visible in recent-uploads, and `reuseDuplicate` picks it up on retry, so it is not a leak in practice. I note it because the plan asked for this path to be checked. Optional fix: track `createdDocumentId` as `develop` did, and call `documents.deleteDocuments([id], metadata)` best-effort in the catch when `!upload.reused`.

## Low / Suggestion

**S1. `POST /ai/upload` no longer cleans up the client's R2 object when signing fails.** Location: `apps/document-service/src/modules/upload/document-register.service.ts:30`. On `develop`, an r2 signing failure after insert went through `failQuietly` → `claimFailed` → `r2Deletes.enqueue`. Now the 503 happens before any row exists, and the object under `keyR2` stays until the client registers again. The FE does not call this route (`git grep` finds no `POST /ai/upload` in `kmaedu-fe/src`), so the impact is minimal. Option: on a sign failure, `r2Deletes.enqueue(tx, [ownedR2Key(dto.keyR2, AI_UPLOAD_AREAS, userId)])` before rethrowing.

**S2. ai-chat keeps Redis it no longer uses.** Locations: `apps/ai-chat-service/src/ai-chat-service.module.ts:5,14,17`, `src/main.ts:11,38`, `deploy/compose/ai-chat.yml:32-34`. The only Redis use, the benefits cache, is gone. `RedisReadinessCheck` now makes ai-chat unready whenever Redis is down, although no request needs Redis. Fix: drop `RedisModule`, `RedisReadinessCheck`, `RedisUnavailableFilter` and the compose `REDIS_*` env. Alternatively, keep it and write down why.

**S3. Test setups still clear `FINANCE_GRPC_URL`.** Locations: `apps/ai-chat-service/test/support/ai-chat-test-app.ts:74-75`, `apps/document-service/test/support/document-test-app.ts:61-62` and `apps/content-service/test/worker.e2e-spec.ts:32`. These lines are now no-ops. Delete them.

**S4. The FE still ships a `currency-vnd` formatter that nothing uses.** Locations: `kmaedu-fe/src/components/admin/KpiCard.tsx:4,16-26`, `MiniChartCard.tsx:19,41,57,66` and `StatChart.tsx:20,39,55,70`. No caller passes `format="currency-vnd"` any more. Remove the variant and the `vndFormatter` instances.

**S5. A dead `userSubscription` mock remains.** Location: `apps/auth-service/src/auth.service.register-outbox.spec.ts:17,34,104,147`. The `not.toHaveBeenCalled` assertions can never fail now, because auth has no such model. Drop the mock and those assertions.

**S6. The buf `ignore_only` entries are temporary.** Location: `proto/buf.yaml:19-34`. They are correct and scoped (`FILE_NO_DELETE` covers `kmaedu/finance` and `finance_events.proto`; `FIELD_NO_DELETE` and `ENUM_VALUE_NO_DELETE` cover `document.proto` only). Make sure the follow-up commit that removes them after the merge is tracked, as the plan says.

**S7. A stale `finance` entry in `SERVICE_CLIENTS` would still mint tokens.** Location: `apps/auth-service/src/token/service-clients.ts:39-60`. `parseServiceClients` accepts any well-formed name. An operator who forgets to remove the `finance` entry leaves a client that can mint `svc:finance` tokens for the remaining audiences. Every allowlist now excludes `finance`, but RPCs declared with no `callers` would accept such a token. `deploy/README.md:472` documents the removal. Optional: warn at boot about a client that no audience or allowlist uses.

## Edge cases checked
- **Migrations.** Content: PENDING_CHARGE → CANCELLED runs before the drops. Document: PENDING_CHARGE → FAILED, still visible to its owner and re-queueable with EnsureProcessed. The `chargeFailedAt` rows are deleted, their R2 keys were already queued on `develop`, and they had no ai-service footprint. Both orderings are correct (the UPDATE and DELETE run before the columns are dropped).
- **`markFailed`** is now a conditional `updateMany` that skips COMPLETED. A replay is idempotent, and a deleted row is a no-op.
- **`generation-query`.** An unknown or unspecified status, including a stale proto value 1, maps to `'pending'`, so a document-only lookup does not break.
- **Cancel race.** It is a conditional transition, and an already-CANCELLED job answers 200 again.
- **Watchdog vs a late result.** Both use conditional transitions, so a late event writes no history.
- **ai-chat regenerate.** `admit()` no longer takes `replacesFrom`. Deletion still happens only after the answer is in hand, and both call sites are updated (`ai-chat-answer.service.ts:28`, `ai-chat-stream.service.ts:60`).
- **RabbitMQ.** The template has no static bindings, because consumers declare them at runtime. With the handler gone, `finance.subscription.changed` is no longer bound on fresh brokers, and the README covers unbinding on old ones.
- **FE locales.** Every removed key in `admin`, `common` and `landing` (vi/en/ja) has no remaining literal use in `src`. `kpi.active30d` exists in vi and en; ja has no `admin.json`, which was already the case.

## Done well
- `submit` is one tx with RED tests for both rows and for rollback (unit and e2e), and the lock is released only after the consumer commits.
- The `DocumentQueueService` extraction keeps the files small, and `recordUploaded` runs in the caller's tx everywhere.
- The defensive migration SQL documents why the DELETE is safe, and the code confirms it.
- The proto uses `reserved` with names and numbers, and the regenerated Python stubs match.
- The negative tests pin the removal: gateway 404 routes, compose-topology, rabbitmq render, service audiences, auth refusing `svc:finance`, and "no finance upstream".
- `GrpcMetadataAttacher` moved into `libs/grpc/metadata.ts` without an auth-jwt dependency.

## Actions in order
1. W1: stage the untracked files explicitly when committing.
2. M1: switch ListUsers to `@RequirePermissions('user:manage')`, or comment the empty allowlist.
3. M2 (optional): best-effort delete of a just-created upload when `submit` fails.
4. S2–S5: remove the dead Redis wiring, the test env deletes, the VND formatter and the subscription mock.
5. After merge: drop the buf `ignore_only` entries (S6).

## Numbers
- Type coverage: not measured. `yarn typecheck` and the FE build pass per the tester report.
- Test coverage: not measured (tester report, line 80).
- Lint findings: not run. Lint is not requested by repo hooks.

## Still unresolved
- The browser/UI pass for the admin overview, user drawer and profile page is still owed (tester report, line 114).
- ai-service `pytest` was not run against the regenerated `document_pb2`. The stubs look consistent, but they are untested.
- The PR must carry the `migration:contract` label, or `lint-migrations.sh` fails.

## Re-review after fixes (2026-11-10)
- M1 is fixed. `auth.grpc.controller.ts:58-62` now uses `@RequirePermissions('user:manage')`. The guard's `permissions` kind refuses any non-user principal and accepts a verified user token that holds `user:manage`. The tests prove both directions:
  - `public-profiles.e2e-spec.ts:84-95` accepts the admin user token and refuses the svc `exam`, `admin` and `content` tokens.
  - `auth.grpc.contract.spec.ts:216` refuses `svc:finance`.
  - `rpc-guard-table.spec.ts:27` now expects the `permissions` kind.
  - Admin calls ListUsers with `forwardUser(req)`, so the admin UI path is unaffected.
- S3 is fixed in the ai-chat and document test apps; only a comment remains. The guard in the content worker spec is kept on purpose.
- No other regression: the change is limited to these 4 files.
- New low finding, deferred: `docs/system/overview.md:11` says "11 services" but lists 10.
- The verdict is written to `evidence/inspection-verdict.json`: decision SEALED, contractStatus CHANGED, `riskGate.signoffRequired: true`. The evidence gate (hard stage) blocks only on the missing human sign-off, as intended.
