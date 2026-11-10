# Scout 01 — Backend money & benefit flows (content, document, ai-chat, libs)

Source: Explore agent, 2026-11-10 (read-only; saved by orchestrator). Paths under `examio-be/`.

## 1. content-service — AI generation charging
Today:
- `src/modules/ai/generation-job.service.ts`: `submit()` 106-140 = insert `PENDING_CHARGE` (chargeKey `gen:<id>`, chargedAmount 108-119) → `charge.debit` 122-133 → `queue()` 143-161 (`PENDING_CHARGE→QUEUED` + outbox `content.generation.requested`). `ChargeRefusedException`/`ChargeUnknownException` 57-73, `jobCancelled` 76. `cancel()` 167-176 refunds via `settleRefund`. `reap()` 179-206: cancel stuck PENDING_CHARGE 183-190, watchdog GENERATION_TIMEOUT 194-200, refund sweeper 201-204.
- `generation-charge.service.ts` (whole file): debit/refund, `AI_FREE_MODE` 77, markRefunded.
- `generation.constants.ts`: PENDING_CHARGE 5, OPEN_STATUSES 15, REFUNDABLE_STATUSES 19, GENERATE_CREDITS/BYTES_PER_UPLOAD_CREDIT/ITEMS_PER_REGENERATE_CREDIT 24-26, PENDING_CHARGE_TIMEOUT_MS 37, REFUND_SWEEP_GRACE_MS 39.
- `generation-request-rules.ts`: uploadCredits 18, regenerateCredits 21, ChargePlan/chargePlan 34-48.
- `generation-job.repository.ts`: NewJob.chargeKey/chargedAmount 14-15, markRefunded 94-99, findStuckPending 102-108, findUnrefunded 120-131.
- `generation-events.handler.ts`: charge service injected 63; `fail()` refunds 138-142.
- `generation-reaper.service.ts`: ReapResult.refunded + log.
- `ai.service.ts`: GenerationStarted.newBalance 24; chargePlan/amount/reason 96,108-109,157-158; newBalance 116,164; discard new upload on charge fail 120-124,194-201; `chargeCredits:false` to CreateUpload 78.
- `generation-query.service.ts:112-113` PENDING_CHARGE→'pending'. `document-mapper.ts:6,32` proto PENDING_CHARGE + `creditCharged` in recent-uploads HTTP response.
- `modules/finance-client/finance-client.module.ts` (whole) imported in `content-service.module.ts:9,29`, `generation.module.ts:5,17`; `worker.module.ts:16` comment; `.env.example` 29,34 (FINANCE_GRPC_URL), 44-45 (AI_FREE_MODE).
- No benefits checks; generation gated by `ai:generate` (TEACHER) in `ai.controller.ts`.

Replacement: `submit()` inserts `QUEUED` + outbox in ONE transaction. Delete charge exceptions, jobCancelled, GenerationChargeService, FinanceClientModule, chargePlan/credit helpers, newBalance. `cancel()` = plain conditional transition (keep "already CANCELLED → 200"). `reap()` = watchdog only (`ReapResult {timedOut}`). `fail()` keeps transition + lock release. ai.service catch keeps lock release (optionally clean up new upload when submit fails). Drop PENDING_CHARGE from JobStatus/OPEN_STATUSES; delete REFUNDABLE_STATUSES.

## 2. document-service — upload charging, quota
Today:
- `src/clients/document-finance.service.ts` (whole): `filesPerMonth` via GetUserBenefits, fallback FREE_TIER_FILES_PER_MONTH=5 (46-54); debit, refund, classify (WALLET_NOT_FOUND, INSUFFICIENT_CREDITS, CHARGE_UNAVAILABLE).
- `modules/upload/document-charge.service.ts`: chargeAndQueue 64-108, failAfterRefusedCharge 119-135, claimFailed 141-147, failStuck 150-154, settleRefund 161-174. KEEP & move: `downloadUrl` 43-50, `recordUploaded` 53-61.
- `document-upload.service.ts`: chargeCredits option 19-20, newBalance 28, charged branch 77-84, enforceQuota 51,73.
- `document-register.service.ts` (`POST /ai/upload`): insert PENDING_CHARGE 42, chargeAndQueue 51,64, chargeFailedAt resume 60-66, newBalance 74-76.
- `document-reaper.service.ts` (whole): 60s; stuck rows + refund sweep only.
- `document-processing.service.ts`: markFailed refunds when creditCharged 75-90 (DocumentFinance injected 19); markProcessed filters `chargeFailedAt:null` 58.
- `document-query.service.ts`: getQuota 51-58, enforceQuota 61-72 (read finance.filesPerMonth).
- `document.repository.ts`: VISIBLE filter 11-14 and deleteVisible SQL 157 exclude chargeFailedAt/PENDING_CHARGE; countSince 73-77, confirmCharge 84-90, claimFailed 110-120, markRefundSettled 123-125, findOpenRefunds 128-134, findStuckCharges 137-143.
- `config/document.constants.ts`: PENDING_CHARGE 5, BYTES_PER_CREDIT 21, timeouts 27,32, FREE_TIER_FILES_PER_MONTH 40, uploadCredits/docChargeKey 49-50.
- `document-errors.ts`: QUOTA_EXCEEDED, INSUFFICIENT_CREDITS, WALLET_NOT_FOUND, CHARGE_UNAVAILABLE (7-11, 25-28).
- `document-mapper.ts`: PENDING_CHARGE 6, creditCharged 25,45. `document.grpc.controller.ts`: chargeCredits 64, getQuota 96-100.
- `document-domain.module.ts` FinanceClient wiring 4-9,30,34-36,42,52; `worker.module.ts:10,32` reaper; `main.ts:17` comment; `.env.example` 22-27.
- Quota IS subscription-based (`filesPerMonth` from GetUserBenefits, fallback 5); counts this month's UserStorage rows. `UserMonthlyFileUpload` has NO reader/writer (`schema.prisma:54-66`).

Replacement: delete enforceQuota (3 call sites), DocumentFinance, DocumentReaper, money half of DocumentChargeService; move downloadUrl/recordUploaded into small `DocumentQueueService`. `register` inserts PENDING + `document.uploaded` outbox in one tx (= today's chargeCredits=false branch); resume path keeps only same-owner return/ensureProcessed. `createFromBytes` always non-charging. `markFailed` only sets FAILED. `getQuota` keeps usedThisMonth/fileCount with `monthlyLimit=-1` (or reserved) — assessment calls GetQuota for fileCount (`apps/assessment-service/.../examattempt.service.ts:1308`).

## 3. ai-chat-service — benefit limits
- `src/modules/ai-chat/ai-chat-limits.service.ts` (whole): assertCanSend → 429 RATE_LIMITED (messagesPerMinute), 403 CHAT_LIMIT_REACHED (chatMessagesLimit); cache `aichat:benefits:<id>` + invalidated-at marker.
- `config/ai-chat.constants.ts:21-35` BENEFITS_CACHE_*, FREE_TIER_BENEFITS (5/min, 30/chat).
- `modules/events/subscription-changed.handler.ts` (whole).
- `ai-chat.module.ts` wiring 6-8,20,25,34,37-38,46,53; `ai-chat-turn.service.ts:26,39` admit(); `ai-chat-message.repository.ts:52-64` countUserMessagesSince/countUserMessagesInChat (limits only); comments `ai-chat-service.module.ts:21`, `ai-chat.controller.ts:24`; `.env.example` 16,22,28,32.
- `AI_BUSY` 429 (`clients/ai-errors.ts:40`) is from ai-service — KEEP. No money Prisma columns.
- Replacement: delete limits service, handler, constants, two count methods, FinanceClient wiring; admit() keeps ownership checks. Queue binding `finance.subscription.changed` lives in infra (`deploy/rabbitmq`, `deploy/compose/ai-chat.yml`).
- STUDENT lacks `ai_chat:use` and `document:upload` (`libs/auth-jwt/src/permissions.ts:46-53`). Controller requires `ai_chat:use` (`ai-chat.controller.ts:34`); chat attachments use document RPCs gated by `document:upload`; quick-upload and r2 image too.

## 4. vocabulary / study-room / ai-service
- vocabulary: no finance. `word-family-generation-limit.ts:4` WORD_FAMILY_DAILY_LIMIT=20 is abuse cap — keep. `test/permissions.e2e-spec.ts:1,91-92` imports FinanceClient (asserts absence) → fix import.
- study-room: FOCUS_CREDIT = study time, unrelated.
- ai-service: comments only (`messaging/document_handlers.py:7`, `generation_handler.py:13,18`); generated `document_pb2*.py/.pyi` contain PENDING_CHARGE/credit_charged/charge_credits → regenerate (`apps/ai-service/scripts/gen_grpc.sh`) if proto changes.

## 5. Shared libs
- `libs/grpc/src/clients/finance.client.ts` (whole): FinanceClient, resolveFreeMode, assertWholeCredits, FINANCE_GRPC_REGISTRATION. COUPLING: `GrpcMetadataAttacher`/`GRPC_METADATA_ATTACHER` (15-18) defined here, imported by `public-profile.client.ts:16` → move to `metadata.ts` first. admin-service imports `assertWholeCredits` (`admin-finance.service.ts:3`).
- `libs/grpc/src/index.ts:7` export. `clients/document-errors.ts`: insufficientCredits, walletNotFound, chargeForbidden, chargeInvalid, chargeUnavailable 23-36; mapping 52-59 (QUOTA, FAILED_PRECONDITION), 69-70. `clients/idempotency-key.ts:13-18` newIdempotencyKey unused outside lib. `idempotent-rpcs.ts:18-31` finance RPCs (spec checks entries exist in protos).
- `libs/common`: `src/utils/wallet-cache.ts` (+spec) finance-only; `index.ts:25`; WALLET/WALLET_TRANSACTION/PAYMENT in `constants/cache-keys.ts` and `src/constants/cache-keys.ts` (13-14, 27-28).
- `libs/contracts/src/index.ts`: 6-8 (walletV1, subscriptionV1, financeAdminV1), 26-33 (PROTO_FILES).
- libs/messaging, libs/redis: only 'finance' as sample name in specs.
- `libs/auth-jwt/permissions.ts`: WALLET_USE, SUBSCRIPTION_MANAGE, FINANCE_ADMIN (27-32, 71-72, 78); spec 41, 53.

## 6. Schemas / migrations / protos
- content `prisma/schema.prisma`: comment 325-335; `status @default("PENDING_CHARGE")` 345; `chargeKey @unique` 347; `chargedAmount` 349; `refundedAt` 350; `@@index([status, refundedAt])` 362. Migration `20261025044727_init` 247-250, 380, 389.
- document `prisma/schema.prisma`: comment 18; `creditCharged` 31; `chargeFailedAt` 34; `refundSettledAt` 39; `@@index([refundSettledAt, chargeFailedAt])` 51; `UserMonthlyFileUpload` 54-66 (unused). Migrations `20261023195111_init` 11-12, 22-30, 84, 87; `20261024100000_refund_settled_at`.
- ai-chat: nothing.
- `proto/examio/document/v1/document.proto`: `DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE = 1` (44), `credit_charged = 9` (66), `charge_credits = 4` (81), `monthly_limit = 2` (112), comments 11-13. Use `reserved`, never renumber. Comment-only: `content_events.proto:17-19`, `ai_events.proto:14`, `document_events.proto:7`.

## Risks
1. In-flight rows at cutover (PENDING_CHARGE jobs/uploads, unrefunded jobs, chargeFailedAt uploads): refunds moot once wallets abolished — state explicitly.
2. Expand→contract: Release 1 stops creating PENDING_CHARGE, keeps columns (chargeKey NOT NULL UNIQUE → keep populating or make nullable first), DB default → 'QUEUED'; data migration: PENDING_CHARGE jobs → CANCELLED (locks TTL 30 min); PENDING_CHARGE uploads → FAILED + R2 delete (or PENDING + outbox); delete chargeFailedAt uploads (R2 keys already queued). Release 2 drops columns/index/table/proto fields. VISIBLE filter must stay until chargeFailedAt rows are gone.
3. Proto removals = contract; regenerate all TS + Python consumers (content, ai-chat, assessment fakes, ai-service pb2) together. Old client reading value 1 → UNSPECIFIED → content maps 'PENDING'.
4. Rolling deploy: finance-service must outlive last old content/document pod.
5. HTTP contract: `newBalance`, `creditCharged`, error codes INSUFFICIENT_CREDITS/WALLET_NOT_FOUND/CHARGE_UNAVAILABLE/QUOTA_EXCEEDED/RATE_LIMITED/CHAT_LIMIT_REACHED disappear.
6. With all limits gone, only gateway rate limit protects AI cost.

## Tests
Delete: content `test/generation/generation-free-mode.e2e-spec.ts`, `test/ownership/support/fake-finance.ts`; document `src/clients/document-finance.service.spec.ts`, `test/support/fake-finance.ts`, `test/upload-money.e2e-spec.ts` (move its owner/STUDENT/r2-image/quick-upload cases); ai-chat `src/modules/ai-chat/ai-chat-limits.service.spec.ts`, `test/limits.e2e-spec.ts`, `test/support/fake-finance.ts`; libs `libs/grpc/src/clients/finance.client.spec.ts`, `libs/common/src/utils/wallet-cache.spec.ts`; root `test/cross-app/finance-debit.grpc.spec.ts`.
Rewrite: content `test/generation/generation-money.e2e-spec.ts` (keep events/lock/watchdog/cancel/history), `test/generation/support.ts:15-18`, `test/ownership/support/content-test-app.ts:26,48-49,77,90-96,139,182-183`, `test/ownership/ai.ownership.e2e-spec.ts:58,70`, `src/modules/ai/ai.service.spec.ts` 4-5,18,25-40,72,85-125, `document-mapper.spec.ts`, `test/generation/recent-uploads.e2e-spec.ts:56`, `test/ownership/support/fake-document.ts:17,71,104`, `test/worker.e2e-spec.ts`; document `test/document.grpc.contract.e2e-spec.ts` 28-115,164-187, `test/worker-pipeline.e2e-spec.ts:66-227`, `test/delete-documents.e2e-spec.ts:130-133`, `test/support/document-test-app.ts`, `src/config/document.constants.spec.ts`, `src/modules/upload/document-errors.spec.ts`, `src/modules/upload/document-mapper.spec.ts`; ai-chat `src/modules/events/event-handlers.spec.ts:43-60`, `test/events.e2e-spec.ts:27,116-150,165`, `test/support/ai-chat-test-app.ts:20,44-45,74-77,121,130`, `ai-chat-document-wait.spec.ts:21`, `test/support/fake-document.ts:61`; assessment `test/ownership/support/fake-document.ts:17,71,104`; libs `libs/grpc/src/deadline-retry.spec.ts:5,43-46,70`, `idempotent-rpcs.spec.ts`, `clients/document-errors.spec.ts:12,28`, `libs/auth-jwt/src/permissions.spec.ts:41,53`; root `test/authz/*`, `test/cross-app/rpc-guard-table.spec.ts`, `test/build/proto-assets.spec.ts`; vocabulary `test/permissions.e2e-spec.ts:1,91-92`.
