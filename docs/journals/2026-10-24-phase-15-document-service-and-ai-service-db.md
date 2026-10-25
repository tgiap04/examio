# Phase 15: document-service split out, ai-service owns schema `ai`, and a money bug caught in review before merge

**Date**: 2026-10-24 20:43
**Severity**: high
**Component**: examio-be document-service (new), ai-service (schema, gRPC, messaging), exam-service modules/ai (GenerationJob), r2-service, gateway routes.yaml, deploy/compose, RabbitMQ definitions, .github/workflows/ci.yml
**Status**: resolved

## What Happened

Phase 15 is 13 commits, `8c645bd..0c5c1a9`, from the protos (`099b9ff`) through the plan sync (`0c5c1a9`). What shipped:

- **document-service** (`0a8de20`) owns upload metadata, the monthly quota and processing status. Uploads charge in three steps: insert `PENDING_CHARGE`, `Debit(debit:doc:<id>)`, then flip to `PENDING` and enqueue the outbox event.
- **ai-service** (`db211a5`) owns schema `ai` through an Alembic baseline. It serves gRPC `AiService` on :50051 behind a service-token interceptor, and has Python messaging that mirrors `libs/messaging`: one 30 s retry tier, DLQ at 5, source validation.
- **exam GenerationJob** (`d40d2f9`) charges upload and generation in one `Debit`, refunds on cancel, failure and timeout, and runs a reaper, a watchdog and a refund sweeper.
- Smaller pieces: `ListDocuments` for recent-uploads parity, `alsoPublishes` in libs/messaging (`de2077a`), r2 `internal/upload` removed (`7eda683`), temporary `ai_svc` grants on exam revoked.

## The Brutal Truth

The worst find was in review, not in the suites. The first version of the document charge compensated an ambiguous `Debit` immediately, and a debit that committed late was never refunded. Money would have been taken with no receipt. Review round 1 (H1) caught it, and the fix took a whole round.

Tempering was also rough. The lost run stopped at temper stage 4. Per the session account, the host hit fork exhaustion, with about 5,600 zombie children under the claude process, and a stale stack came back when Docker restarted. The repo record does not show the zombies or the restart. It does show three leftover `p15t` networks from the lost run, which I removed before the rerun.

## Technical Details

- **F1** (temper stage 1): `apps/ai-service` pytest exited 1, with 3 failed, 79 passed, 49 errors. Causes: a test called the real Gemini embedding API (`No Gemini API key configured for embeddings`), and `src/llm/{config,model_manager}.py` call `load_dotenv()` at import, so a developer's real `.env` could reach pytest. Fix: `conftest.py` makes `dotenv.load_dotenv` a no-op for the session. After the fix: exit 0, 80 passed, 51 skipped.
- **Review H1**: claim-then-refund. An ambiguous debit first moves the row `PENDING_CHARGE -> FAILED` (R2 key queued, one tx), then refunds. The grace-gated sweeper retries open refunds. A NOT_FOUND refund settles only after `REFUND_SWEEP_GRACE_MS` (2 min). Still answers 403 `CHARGE_UNAVAILABLE`.
- **Stage 4 money invariant**: every charged job and document has exactly one debit. Refunds appear only on FAILED or CANCELLED.
- **Final suites** (coordinator-reported): unit 2179, ai-service integration 139, document e2e 71, exam e2e 269 (generation 63), db-isolation 57. Verdict `SEALED`, score 8, 0 critical.
- **Open live gap**: real OCR and real generation never ran end to end. The stack has no Gemini key and no public R2 host. The ai-worker refused the stand-in host with `DOWNLOAD_REJECTED` at `ocr_service.py:131` (F3).

## What We Tried

- **Review M1**: a free retry on reused FAILED/PENDING documents stacked on the new refunds, so a successful run cost nothing. Rejected. Reuse now always charges 5.
- **Review M2**: generation failed under an OCR backlog. Fixed with `DocumentService.GetDownloadUrl` (1 h presigned URL) and inline processing in ai-service `generation_handler`.
- **Review M3**: ai-chat stopped waiting for OCR. Restored a bounded poll of `GetDocumentsByIds` (2 s, x1.5, cap 8 s), controlled by `AI_CHAT_DOCUMENT_WAIT_MS` (default 120000).
- **Watchdog**: the brief ties it to a QUEUED-forever charged job. The repo record shows the watchdog (`GENERATION_TIMEOUT`, default 60 min, clamped to >= 10) and its live test (stage 4f), but not the originating incident.
- **RabbitMQ cookie race**: the session account says it recurred in the harness. No repo artifact confirms that.
- **git-manager scan-regex slip**: the session account says it hit the first three commits (`099b9ff`, `de2077a`, `0a8de20`) and that a re-scan came back clean. No repo artifact confirms it.

## Root Cause Analysis

H1 came from treating a `Debit` timeout as a definite failure. An ambiguous result means the debit may still commit, so the compensation has to be claim-first and must outlive a late commit. M1 came from stacking two rules, free retry and refund-on-failure, without asking what they add up to. The fork exhaustion is a host-side problem in the session account. The repo record does not show what triggered it.

## Lessons Learned

- Any compensating refund on an ambiguous money call needs a claim step and a time-bounded sweeper. Do not refund in the same breath as the timeout.
- Before you add a new refund or retry rule, write out the money for the worst path. Two individually sane rules can make a free job.
- Tear down the previous stack and check for leftover networks and processes before a new temper run. Do not trust the rerun to clean up.
- Use the pytest `conftest` to stop environment loads at the source, not in each test.

## Next Steps

- **F3** (private-host SSRF guard, `ocr_service.py:131`): owner decision, keep or allow a configured internal host. Phase 16.
- **F5** (CI deploy-config variable list omits `PAYMENT_*` and OAuth client vars, so a CI-green stack fails boot). Phase 16.
- **F10** (ui9 64-check matrix script missing from evidence). Restore it or drop the claim. Phase 16.
- **ai-worker healthcheck** (liveness is only `State=running`). Phase 16.
- **Deferred**: `poetry.lock` not regenerated; the 2 min refund grace bound (a debit committing later is missed); doc debt to phase 19.
- **F6 / F7**: the R2 key enqueue on the reaper path was not observed live (the in-process worker drained it first) but is asserted by `apps/document-service/test/upload-money.e2e-spec.ts:151`; `DOWNLOAD_REJECTED` is retried through the 30 s tier before the DLQ, which looks wrong.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 15 is sealed with the H1 money fix and the M1–M3 rework in place, and the live money paths checked out. Real OCR and generation end to end remain unproven in this environment, and several incident details come from the session account, not the repo record.
