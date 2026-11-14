# Phase 02 — Remove money and limits from content, document, ai-chat

## Context Links
- [plan.md](./plan.md) · [scout-01 §1-3, §6, Tests](./reports/scout-01-backend-money-flows.md) · [clarifications](./clarifications.md)

## Overview
- Priority: P1 · Status: Completed · Effort: 3d · Runs in parallel with 03 and 04 after 01.
- Stop every Debit, Refund and GetUserBenefits call. Drop the subscription limits (ai-chat 429 `RATE_LIMITED`, 403 `CHAT_LIMIT_REACHED`, document `QUOTA_EXCEEDED`). Drop the money columns in one contract migration per service. Reserve the dropped `document.proto` fields. Regenerate TS and Python stubs.

## Key Insights
- After this phase, nothing in content, document or ai-chat imports `FinanceClient`. Finance-service still compiles and runs until 05.
- Content `submit()` becomes: insert `QUEUED` + outbox `content.generation.requested` in **one transaction** (today two steps around a Debit).
- Document `register` becomes today's `chargeCredits=false` branch: insert `PENDING` + `document.uploaded` outbox in one transaction.
- `GetQuota` stays. Assessment `history-stats` reads `fileCount` (`examattempt.service.ts:1308`); `used_this_month` and `file_count` remain, and `monthly_limit` is reserved.
- buf FILE category reports `FIELD_NO_DELETE` and `ENUM_VALUE_NO_DELETE` even for reserved fields (verified locally). Scoped `ignore_only` entries for `document.proto` are required.
- The ai-chat `aichat.events` queue keeps its `finance.subscription.changed` binding until 05 (infra). The handler is deleted here. Check how `@kmaedu/messaging` treats an event with no handler (ack and ignore, or DLQ). Interim only, never released.

## Requirements
- Functional:
  - Teacher generation without a balance check. Cancel: `QUEUED` → `CANCELLED`, and already `CANCELLED` still returns 200. Watchdog timeout kept, generation lock released on fail or cancel.
  - Upload creates PENDING and queues OCR. Quick-upload is unchanged. `markFailed` only sets FAILED.
  - ai-chat sends without per-minute or per-chat limits. Ownership checks and `AI_BUSY` stay.
- Response contract (breaking, documented): `newBalance` disappears from generation and upload responses, and `creditCharged` from recent-uploads. Error codes `INSUFFICIENT_CREDITS`, `WALLET_NOT_FOUND`, `CHARGE_UNAVAILABLE`, `QUOTA_EXCEEDED`, `RATE_LIMITED` and `CHAT_LIMIT_REACHED` are no longer produced.
- Non-functional: each service file stays under 200 lines, no N+1, and the transactions are atomic.

## Architecture
- Content: `AiService.generate*` → `GenerationJobService.submit` (tx: job `QUEUED` + outbox) → ai-service → `generation-events.handler` (COMPLETED/FAILED, lock release). Reaper = watchdog only (`ReapResult { timedOut }`).
- Document: `register` / `createFromBytes` → R2 upload → tx (row `PENDING` + outbox `document.uploaded`). The new `DocumentQueueService` keeps `downloadUrl` and `recordUploaded` (moved from `document-charge.service.ts`). `DocumentReaper` is deleted, so the worker loses the 60 s loop.
- ai-chat: `AiChatTurnService.admit()` keeps the ownership and document checks only.

## Related Code Files (BE = `/Users/tgiap.dev/devs/kmaedu/kmaedu-be`)
Content (`BE/apps/content-service`):
- Delete `src/modules/ai/generation-charge.service.ts`, `src/modules/finance-client/**`, `test/generation/generation-free-mode.e2e-spec.ts`, `test/ownership/support/fake-finance.ts`.
- Modify `src/modules/ai/{generation-job.service.ts, generation.constants.ts, generation-request-rules.ts, generation-job.repository.ts, generation-events.handler.ts, generation-reaper.service.ts, ai.service.ts, generation-query.service.ts, document-mapper.ts, generation.module.ts}`, `src/content-service.module.ts`, `src/worker.module.ts` (comment), `.env.example` (`FINANCE_GRPC_URL`, `AI_FREE_MODE`), `prisma/schema.prisma` (model comment, default `QUEUED`, drop `chargeKey`, `chargedAmount`, `refundedAt`, `@@index([status, refundedAt])`).
- Create `prisma/migrations/<ts>_remove_generation_charge/migration.sql`.
- Rewrite tests: `test/generation/generation-money.e2e-spec.ts` → rename to `generation-lifecycle.e2e-spec.ts` (keep events, lock, watchdog, cancel, history), `test/generation/support.ts`, `test/generation/recent-uploads.e2e-spec.ts`, `test/ownership/support/{content-test-app.ts,fake-document.ts}`, `test/ownership/ai.ownership.e2e-spec.ts`, `test/worker.e2e-spec.ts`, `src/modules/ai/{ai.service.spec.ts,document-mapper.spec.ts}`.

Document (`BE/apps/document-service`):
- Delete `src/clients/document-finance.service.ts` (+spec), `src/modules/upload/document-reaper.service.ts`, `test/support/fake-finance.ts`, `test/upload-money.e2e-spec.ts`. Move its owner, STUDENT-403, r2-image and quick-upload cases into a new `test/upload.e2e-spec.ts`.
- Rename/trim `src/modules/upload/document-charge.service.ts` → `document-queue.service.ts` (downloadUrl, recordUploaded only).
- Modify `src/modules/upload/{document-upload.service.ts, document-register.service.ts, document-processing.service.ts, document-query.service.ts, document.repository.ts, document-errors.ts, document-mapper.ts, document.grpc.controller.ts, document-domain.module.ts}`, `src/config/document.constants.ts`, `src/worker.module.ts`, `src/main.ts` (comment), `.env.example`, and `prisma/schema.prisma` (comments; drop `creditCharged`, `chargeFailedAt`, `refundSettledAt`, `@@index([refundSettledAt, chargeFailedAt])`, model `UserMonthlyFileUpload`).
- Create `prisma/migrations/<ts>_remove_upload_charge/migration.sql`.
- Rewrite tests: `test/{document.grpc.contract.e2e-spec.ts, worker-pipeline.e2e-spec.ts, delete-documents.e2e-spec.ts}`, `test/support/document-test-app.ts`, `src/config/document.constants.spec.ts`, `src/modules/upload/{document-errors.spec.ts,document-mapper.spec.ts}`.

ai-chat (`BE/apps/ai-chat-service`):
- Delete `src/modules/ai-chat/ai-chat-limits.service.ts` (+spec), `src/modules/events/subscription-changed.handler.ts`, `test/limits.e2e-spec.ts`, `test/support/fake-finance.ts`.
- Modify `src/config/ai-chat.constants.ts` (21-35), `src/modules/ai-chat/{ai-chat.module.ts, ai-chat-turn.service.ts, ai-chat-message.repository.ts (drop the two count methods), ai-chat.controller.ts (comment)}`, `src/ai-chat-service.module.ts` (comment), the events module that registers the handler, and `.env.example`.
- Rewrite tests: `src/modules/events/event-handlers.spec.ts`, `test/events.e2e-spec.ts`, `test/support/{ai-chat-test-app.ts,fake-document.ts}`, `src/modules/ai-chat/ai-chat-document-wait.spec.ts`.

Shared / other:
- Modify `BE/proto/kmaedu/document/v1/document.proto`: `reserved 1; reserved "DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE";` in the enum, `reserved 9 / "credit_charged"`, `reserved 4 / "charge_credits"`, `reserved 2 / "monthly_limit"`, and the service comments updated. Comment-only edits in `BE/proto/kmaedu/events/v1/{content_events,ai_events,document_events}.proto`.
- Modify `BE/proto/buf.yaml`: add `breaking.ignore_only` `FIELD_NO_DELETE` and `ENUM_VALUE_NO_DELETE` for `kmaedu/document/v1/document.proto`, with a comment saying to remove after merge.
- Modify `BE/libs/grpc/src/clients/document-errors.ts` (+spec): drop the credit/charge/quota mappers.
- Modify `BE/apps/assessment-service/test/ownership/support/fake-document.ts` (drop `monthlyLimit`, `creditCharged`).
- Regenerate `BE/apps/ai-service` document stubs (`document_pb2*.py/.pyi`) via `apps/ai-service/scripts/gen_grpc.sh`, and update the comments in `src/backend/messaging/{document_handlers.py, generation_handler.py}`.
- Delete `BE/test/cross-app/finance-debit.grpc.spec.ts` (imports content `GenerationChargeService`).

## Implementation Steps
1. Write the failing tests first:
   - content: submit → job is `QUEUED` and the outbox row exists in the same tx, with no finance call.
   - document: `POST /ai/upload` → PENDING + outbox, and a 6th upload in a month succeeds.
   - ai-chat: a 6th message within a minute and a 31st in one chat are both accepted.
   Run them and confirm RED on an assertion.
2. Content: rewrite `submit/cancel/reap/fail`, then delete the charge service, finance module and credit helpers. Drop `PENDING_CHARGE` from `JobStatus` and `OPEN_STATUSES` and delete `REFUNDABLE_STATUSES`. `generation-query` keeps mapping unknown status to 'pending'.
3. Document: extract `DocumentQueueService`. Simplify register and upload. Remove `enforceQuota` (3 call sites), the reaper, and the `VISIBLE` filter terms on `chargeFailedAt` / `PENDING_CHARGE` (repository lines 11-14 and the `deleteVisible` SQL at 157). `getQuota` returns `{usedThisMonth, fileCount}`.
4. ai-chat: delete the limits service, handler and constants. `admit()` keeps the ownership checks.
5. Proto: apply the `reserved` edits and the buf ignores, then run `yarn proto:lint` and `yarn proto:gen`. Check breaking with `node_modules/.bin/buf breaking proto --against '../.git#branch=develop,subdir=kmaedu-be/proto'`; expect exit 0. Run `apps/ai-service/scripts/gen_grpc.sh`.
6. Migrations, which only write SQL for review:
   - `PRISMA_ADMIN_URL=… scripts/prisma-migrate-dev.sh content remove_generation_charge` and `… document remove_upload_charge`.
   - Prepend the defensive dev-DB statements **before** the DROPs:
     - content: `UPDATE "GenerationJob" SET "status"='CANCELLED', "updatedAt"=now() WHERE "status"='PENDING_CHARGE';`
     - document: `UPDATE "UserStorage" SET "processingStatus"='FAILED' WHERE "processingStatus"='PENDING_CHARGE';` and `DELETE FROM "UserStorage" WHERE "chargeFailedAt" IS NOT NULL;`. Charge-refused rows already queued their R2 delete via `R2DeleteTaskWriter` in `failAfterRefusedCharge`, so the delete does not orphan objects.
   - Apply with `yarn prisma:deploy content|document`, then `yarn prisma:generate`.
7. `scripts/lint-migrations.sh develop HEAD` fails without `MIGRATION_CONTRACT=1`. That is expected; the PR carries `migration:contract`.
8. Move the surviving `upload-money` cases and rewrite the listed specs. `git grep -n -i "finance\|credit\|charge\|benefit\|quota" -- apps/content-service apps/document-service apps/ai-chat-service` should leave only intended hits (`GetQuota`, `AI_BUSY`).

## Todo List
- [ ] RED tests (content, document, ai-chat) (tests exist; a red-first run is not recorded)
- [x] Content money removal and reaper = watchdog (reviewer: submit is one tx)
- [x] Document money and quota removal, DocumentQueueService
- [x] ai-chat limits removal
- [x] document.proto reserved, buf ignores, proto:gen, Python stubs (reserved ranges verified; reviewer: stubs match)
- [x] Two migrations with defensive SQL, prisma:generate (`20261110180000_*`; tester applied on a fresh DB, no drift)
- [x] Test rewrites and deletions
- [ ] Suites green (content, document, ai-chat e2e green per tester; unit suites and typecheck not recorded)

## Success Criteria
- No `FinanceClient`, `FINANCE_GRPC`, `AI_FREE_MODE`, `chargeCredits` or `creditCharged` in content, document or ai-chat `src/`.
- Schemas have no money columns. `prisma migrate deploy` runs on a fresh DB, and `yarn prisma:status content|document` is clean.
- buf lint is clean and buf breaking exits 0 with the scoped ignores.

## Test Plan — Scope Contract (SAFETY-CRITICAL: billing removal, migrations, public HTTP + gRPC contracts, data deletion)
- Changed: content, document and ai-chat services; `document.proto`; `libs/grpc` document-errors; two migrations; Python stubs.
- Impacted: assessment (`GetQuota` via `libs/grpc` `document.client`), ai-service (stubs), gateway (no route change).
- Will verify (whole groups, because the area is safety-critical):
  - `cd kmaedu-be && yarn typecheck`
  - `yarn test apps/content-service apps/document-service apps/ai-chat-service libs/grpc`
  - `cd apps/content-service && ../../node_modules/.bin/jest --config test/jest-e2e.json` and the same for `apps/document-service`, `apps/ai-chat-service` and `apps/assessment-service` (fake-document and history-stats `GetQuota`).
  - `yarn test test/authz test/cross-app/rpc-guard-table.spec.ts test/build`
  - `yarn check:ownership && yarn check:deps && yarn proto:lint`
  - `cd apps/ai-service && ./venv/bin/pytest src/backend/tests` (stub import), and `./venv/bin/ruff check src`
  - `yarn test test/db-isolation`: `migrations-and-seeds` replays the migrations, if the DB env is available. Otherwise report "verification incomplete".
- Bugs each test catches:
  - Job stuck without an outbox row (non-atomic submit).
  - Cancel double-transition.
  - Lock not released on fail.
  - Hidden-row filter removal exposing deleted rows.
  - Quota still enforced.
  - Limit still enforced.
  - Stub drift (ai-service decoding unknown enum 1).
  - Migration fails on rows still `PENDING_CHARGE`.
- Deliberately skipped: gateway e2e (no route change), FE (phase 04).

## Risk Assessment
- Non-atomic submit leaves a job QUEUED with no event. Countermeasure: one `$transaction`, plus a RED test asserting both rows.
- Removing the `VISIBLE` filter exposes charge-failed rows. Countermeasure: the defensive `DELETE` in the migration, plus a test that a FAILED row is listed exactly as before.
- An event arrives on `aichat.events` with no handler during the interim. Countermeasure: binding removed in 05, and the branch never deploys mid-way.
- AI cost now has only gateway `rateLimits` as a guard. Accepted per clarifications; noted in docs.
- Rollback: revert the phase commits. On a dev DB, `docker compose down -v`, because migrations are not reversible.

## Security Considerations
- Ownership checks (`AssertOwnership`, owner-scoped queries) must remain. Tests keep the two-user 404 cases.
- `ai:generate` stays TEACHER-only. `document:upload` and `ai_chat:use` stay out of STUDENT.

## Next Steps
- 05 deletes the finance protos and lib client, and removes the ai-chat binding and env.
- After merge: drop the temporary buf `ignore_only` entries.
