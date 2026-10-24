# Phase 15 tempering runs (document-service, ai-service schema/gRPC/messaging, exam GenerationJob)

Raw rows: `evidence/phase-15/temper-raw.json` (`temper-1:` static and earlier live rows, `temper-2:` rows from this run, `temper-3:`/`temper-4:` from the earlier lost run). Check-level rows carry `#NNN` = 1-based position in the scratch `results.json` (228 entries; several checks were re-run, so an id can appear more than once).

## Scope contract

- **Changed:** `apps/document-service` (new), `apps/ai-service` (Alembic `ai` schema, gRPC `AiService`, Python messaging), `apps/exam-service/src/modules/ai` (GenerationJob, charge/refund, reaper, consumers), r2 (`internal/upload` removed, service-token gRPC), gateway `routes.yaml`, compose/RabbitMQ/CI wiring, carve-outs in ai-chat and examattempt.
- **Impacted:** every upload and AI generation flow (money), ai-chat document links, quota, r2 uploads, RabbitMQ users and bindings, DB grants.
- **Will verify:** the acceptance criteria in `evidence/phase-15/study-context.json` on the final working-tree code: stages 1-3 (already passed, re-used), then stage 4 (live money and data flows through the gateway, per case a-k) and stage 5 (FE AI pages).
- **Deliberately skipped:** product code edits (none made); mobile; AI_FREE_MODE path (no finance call, not run live); the plan's "same POST retried → one debit" gRPC-retry test (only unit-level in plan, not re-run here); the full 64-check ui9 matrix (script not available in the tester scratchpad, see F10); production deploy.

## Method

- Scratch copy of `examio-be` (rsync, excluding `node_modules`, `dist`, `venv`, `__pycache__`, every real `.env*` except `*.env.example`; post-copy check: 0 real env files). Dummy `deploy/.env` written in the copy only, values never printed.
- Compose project `p15t2`, empty volume, sequential image builds (19 build targets, one at a time), gateway on `127.0.0.1:6369`.
- Stand-ins: s3proxy (`s3backend`) plus an nginx TLS, virtual-host-to-path-style shim (`examio-p15t.s3shim:8443`) as R2; a Turnstile stand-in on `challenges.cloudflare.com` on the internal network with a scratch CA trusted by auth (`NODE_EXTRA_CA_CERTS`), r2 and ai-worker only. Turnstile is required in `NODE_ENV=production` for login; the stand-in answers `success:true`.
- Money checks read the live DB (`finance."WalletTransaction"` keyed by `idempotencyKey`, `exam."GenerationJob"`, `document."UserStorage"`). Fake AI events were published as broker user `ai` (`source=ai`, `evt_*`, `version 1`, `correlationId`); the content request was captured as the RabbitMQ admin.
- Each step was recorded with its real process exit code; failed rows are kept.

## Stages 1-3 (summary from the `temper-1:` and earlier `temper-2:`/`temper-3:` rows)

| Stage | Result |
|---|---|
| Static (temper-1) | proto-lint, buf breaking, proto-gen, prisma generate (all services), typecheck, full unit suite, check:deps (929 modules), check:ownership (0 violations), build-all, compose-topology spec, ruff CI gate, 4 greps: all exit 0. |
| Static, ai-service pytest (temper-1) | exit 1: 3 failed, 79 passed, 49 errors. Cause: the Gemini key and `load_dotenv` leak (plan "Fixed while tempering" F1). |
| F1 re-verified on final code (`temper-2: ai-service-pytest-unit-final-code`) | exit 0: 80 passed, 51 skipped (integration tests need the live DB). |
| Integration (earlier temper-2) | first exit 1 (1 failed, 130 passed), re-run exit 0 (131 passed). Exam e2e (whole folder and generation-only), document, study-room, vocabulary, gateway, messaging, db-isolation (CI=true): all exit 0 on re-run. |
| Infra and migrations (earlier) | 8 migrate deploy exit 0; drift check "No difference" x8; ai Alembic baseline on an empty schema exit 0. |
| Broker and gRPC permissions (earlier temper-3) | `ai` may not publish `document.uploaded` (ACCESS_REFUSED); `ai` publish `ai.document.processed` OK; exam publish `content.generation.requested` OK; exam publish `ai.x` refused; document read `ai.events` refused. gRPC: no token → UNAUTHENTICATED; `svc:document` → PERMISSION_DENIED; `aud=exam` → UNAUTHENTICATED; `alg=none` → UNAUTHENTICATED; `svc:exam` → ListModels OK. |
| Isolation (earlier temper-3) | ai_svc denied on `exam."UserStorage"`, `auth."User"`, `exam."HistoryGeneratedQuizz"`; document_svc denied on auth, exam and ai schemas; grants on exam for ai_svc are zero (earlier temper-3 rows). |

## Stage 3b: bring-up (this run)

- 19 image builds, one at a time: all exit 0 (auth, finance, admin, exam, study-room, vocabulary, r2, document, gateway, ai, plus 9 migrate images and seed).
- `up -d --wait` from an empty volume: exit 0 on the 3rd attempt. Attempts 1-2 exit 1, both scratch `.env` gaps (not product defects): (1) `PAYMENT_*` SePay settings missing, finance went unhealthy; (2) `GOOGLE_/FACEBOOK_/GITHUB_CLIENT_*` missing, auth `OAuth2Strategy requires a clientID`. Then login needed the Turnstile stand-in (a request-time failure, not a boot failure; see F5); a 4th `up` (exit 0) applied it.
- One-shots: `auth/finance/admin/exam/study-room/vocabulary/document/ai-migrate` and `rabbitmq-defs`: exit code 0 each (inspected).
- R2 bucket created on the stand-in (HTTP 200); virtual-host alias resolves on `examio-internal`.
- Opt-in seed (`--profile seed run --rm seed`): exit 0. Counts: users 8, wallets 7, subjects 15, word-family categories 10 (same as Phase 12).
- Not run: a plain `up -d --wait` after the seed (Phase 12 did this).

## Stage 4: live money and data flows through the gateway

Accounts: teachers `user1` (quota exhausted after 5 files this month), `user3` (quota exhausted), `user6` (used for the watchdog and PENDING_CHARGE cases, then for 4h2). Every case reads balance and ledger rows before and after.

| Case | Final passing evidence | Result |
|---|---|---|
| a. Charged upload, real ai-worker, no model keys | Final run (`user3`, #065-#068 superseded): `debit:doc:<id>` x1 (1 credit), document FAILED, `refund:doc:<id>` x1, balance 50000 -> 49999 -> 50000. Reason recorded: `DOWNLOAD_REJECTED` (ai-worker SSRF guard refused the stand-in host, see F3). | PASS. The "no model keys" branch itself is not reached, because of F3. |
| b. Success path, fake ai | `ai.document.processed` published as `ai`; COMPLETED; `debit:doc:<id>` x1; no refund; balance -1. | PASS |
| c. generate-from-file, new file | One combined `debit:gen:<job>` = 6 (1 upload + 5 generation); no `debit:doc:` row for the new storage (CreateUpload with `charge_credits=false`); captured `content.generation.requested`: `source=content`, `version=1`, `evt_*`; fake completion: job COMPLETED, `HistoryGeneratedQuizz` 1 row, debited once. Reuse COMPLETED: `debit:gen` 5, no doc debit. Reuse FAILED: job QUEUED, 0 debits (#098-#100). | PASS (reuse-FAILED after the lock is released: #039 superseded) |
| d. Cancel | QUEUED: 200, CANCELLED, `refund:gen` x1 (5); cancel again: 200, still one refund; COMPLETED: 409 `JOB_NOT_CANCELLABLE`. The reuse-FAILED job (0 charge) cancelled: no refund row. | PASS |
| e. `ai.generation.failed` | Job FAILED `OCR_FAILED`, `refund:gen` x1 (6), balance restored. | PASS |
| f. Watchdog (exam `GENERATION_JOB_TIMEOUT_MINUTES=10` via scratch override, reverted after) | QUEUED job backdated 11 min: FAILED `GENERATION_TIMEOUT`, one refund (6), balance restored; late `ai.generation.completed`: 0 history rows, status unchanged, still one refund. | PASS (#116 quota fail superseded) |
| g. PENDING_CHARGE document reaper | Row backdated 11 min inserted as superuser: reaped to FAILED within 2 polls; no ledger rows (never charged, so the refund is the NOT_FOUND path). R2 key enqueue: see the note below. | PASS on status and ledger; enqueue NOT observed live (#127, #129, see note) |
| h. Delete upload (h2 rerun, clean shim keys) | Generation to COMPLETED with history, object present (HEAD 200), fixture vector inserted, worker restarted, `DELETE /ai/upload/:id` 200: vectors 0, object 404 within 1 min, row removed, `HistoryGeneratedQuizz.userStorageId` nulled, no refund. | PASS (#131 superseded, F2) |
| i. ai-chat carve-out | Attach, list, `clear(deleteFiles=true)`: `deletedFiles` returned, document row gone, object 404 within 1 min. Document-service stopped: clear -> 503 `SERVICE_UNAVAILABLE`, chat kept, attachment kept. Restart, retry: 201. | PASS |
| j. recent-uploads | 200; keys unchanged from the FE field set (`quizHistory`/`flashcardHistory` summary present on the generated file, `quizCount` 1). No pre-change capture exists to diff against. | PASS (shape check, no baseline diff) |
| k. Gateway smoke (rebuilt compact set; Phase 11 smoke file not in scratch) | 14 PASS: auth/me TEACHER, wallet, anon 401 x3, foreign doc GET/DELETE 404 (kept), foreign keyR2 400, quota gate 403 `QUOTA_EXCEEDED`, ai/models 200, vocabulary categories 200, ai-chat list 200, unknown job 404, r2/image 201 and object present. Studyroom check fixed to `GET /studyrooms/mine` (#182 superseded by #187). | PASS |

**Money invariant (end of stage 4, before stage 5):** every charged generation job and every charged document has exactly one debit. Refunds appear only for FAILED or CANCELLED; COMPLETED has none. Gen: CANCELLED charged 2 (1 debit, 1 refund each), CANCELLED uncharged 1 (0/0), COMPLETED charged 3 (1 debit, 0 refund), FAILED charged 3 (1 debit, 1 refund). Doc: COMPLETED charged 1 (1 debit, 0 refund), FAILED charged 3 (1 debit, 1 refund), FAILED uncharged 5 (0/0). Orphan ledger rows: 0. A stale `ai.generation.completed` for an already COMPLETED job (sent by the first Stage 5 run) created no history: the handler transitions the job first and writes history only on success.

**Duplicate-refund check:** after the worker restart, the real worker processed a backlog of `document.uploaded` events for two COMPLETED charged documents. Both stayed COMPLETED and wrote no refund. The fake completions were not replayed as failures; this is the real worker's late failure path, not a synthetic replay.

### Note on 4g #127 and #129 (enqueue not observed live)

- The reaper settles the row and enqueues the R2 key in the same transaction (`document-charge.service.ts:114-122`, `settleFailed`). document-service runs `ROLE=api,worker`, so the in-process R2 worker drains the task quickly.
- Observed: the document log line `Settled 1 stuck PENDING_CHARGE upload(s)` and, in the same second, one S3 stand-in access-log line `POST /?delete= 200 227` (a `DeleteObjects`). The request body is not logged, so the key content is not observed.
- The task row was not present on the first query after the reaper settled (`rows=0`), which is consistent with the drain.
- Status: **not observed live as a key; drain inferred from timing.** The e2e level is covered by the document e2e folder (exit 0 in the earlier temper-2 run); I did not inspect which case asserts the enqueue, so the e2e claim is taken from the plan's test list, not checked here.
- #129 failed because my check looked for the row id in the reaper log, which logs only a count. Harness check defect, not a product result.

## Stage 5: FE (Vite on 5273, playwright-core on system Chrome 155, external hosts blocked)

Scope actually run: the teacher AI tool page, the history and flashcard routes (not refused), the upload -> generate -> result -> recents badge -> delete flow, and the STUDENT 403. This is **not** the full ui9 matrix (see F10).

- Final run (`ui/ui5-run2.log`): **20 PASS, 0 FAIL**. Covered: AI tool page renders; history and flashcard pages not refused; the PDF is selected; `POST /ai/generate-from-file` 201 and a new job QUEUED; fake completion published for that job; job COMPLETED in DB; the question text is visible in the UI; recents list shows the file with the `1Q` badge; object present (200) before delete; delete 200; row and object gone within 1 min; no refund on delete; file removed from recents; no page JS errors; STUDENT (`user5`, demoted through the admin role API) redirected to `/403`; `user5` restored to TEACHER (200).
- Upload is part of generation in the FE (the TestGenerator sends the file with `generate-from-file`; there is no standalone upload step), so "upload a file" is covered by the generate step.
- First run (`ui/ui5-run1.log`, 11 PASS / 10 FAIL, results `#188-#203`): harness failures, superseded. (1) A first-visit driver.js tour overlay blocked the generate click (fixed by presetting the tour key `examio:tour:ai-tool:v1`); (2) the job lookup fell back to the latest job of the user, which was an old COMPLETED job, so the completion was published for a job that was not in flight (ignored by the handler, see invariant note); (3) the delete controls were never reached. The #192 timeout, #193, #196-#198, #199-#203 are all downstream of (1) and (2).

## Findings

| # | Where | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | `apps/ai-service` unit pytest, `conftest.py` (plan "Fixed while tempering" F1) | Real Gemini key and `load_dotenv` leak into pytest. Temper-1 exit 1 (3 failed, 49 errors). | High (CI red) | Closed. Final code: exit 0, 80 passed, 51 skipped (`temper-2: ai-service-pytest-unit-final-code`); integration rerun exit 0 (131 passed). |
| F2 | Plan "Delivered beyond plan / deviations" (accepted) | AiService with a USER token (`aud=examio`) returns UNAUTHENTICATED, not PERMISSION_DENIED (the `aud=ai` check runs first). Re-observed in temper-3 (`grpc-user-token-observed-expect-permission-denied` exit 1, recorded as the accepted deviation). | Info | Accepted by the plan. Note: the plan file names no other F2/F3; this is the only other item it lists. |
| F3 | `apps/ai-service/src/backend/services/ocr_service.py:131` | The presigned-download guard refuses any host that resolves to a private, loopback, link-local or reserved address, with no configuration switch. An S3-compatible endpoint on a private network (self-hosted MinIO, a Docker-internal stand-in) fails every download with `DOWNLOAD_REJECTED` (FAILED + refund, so money is correct). The real "no model keys" OCR failure cannot be reached on a private-network stack. | Medium for self-hosted deployments (by design for public R2) | Open: owner decision (keep, or allow a configured internal host). Found during 4a. |
| F4 | Plan text vs code (ledger keys) | Ledger keys are `debit:doc:<id>`, `refund:doc:<id>`, `debit:gen:<id>`, `refund:gen:<id>`; the plan writes `doc:<id>` / `gen:<id>`. Keys are deterministic per id, so retries stay idempotent; the prefixes keep the debit and refund rows apart under `unique(walletId, idempotencyKey)`. | Info | Open: align the plan text. |
| F5 | `.github/workflows/ci.yml` deploy-config variable list vs boot requirements | The CI list (which only runs `docker compose config`) omits `PAYMENT_*` (finance SePay throws at boot) and `GOOGLE_/FACEBOOK_/GITHUB_CLIENT_ID/SECRET/CALLBACK` (auth OAuth2Strategy throws at boot). A stack built from the CI list passes CI and fails to start. Production login also needs a reachable Cloudflare Turnstile `siteverify`. | Medium (CI gap) | Open. |
| F6 | r2 drain / reaper (#127, #129) | Enqueue of the R2 key on the reaper path is not observed live. Drain inferred from timing (see the stage 4 note). | Info (evidence gap) | Open: a live check needs an R2 access log with keys, or a debited-then-crashed fixture. |
| F7 | `ai-worker` content request path | `content.generation.requested` whose document download was refused was logged `Retry 1/5` and `Retry 2/5` through the 30 s tier before the DLQ. A download refusal looks permanent. | Low | Open: confirm whether DOWNLOAD_REJECTED should be permanent. |
| F8 | `document.dlq` | My malformed `ai.document.processed` (no `storageId`, from an earlier failed harness attempt) was dead-lettered as `INVALID_DATA`. Behaviour is correct; no alert was checked. | Info | Closed (behaviour). |
| F9 | Harness only | The fake completion does not mark the source document processed, so generated documents stay PENDING. The real worker publishes `ai.document.processed` first. | Info | Closed (harness limit). |
| F10 | Stage 5 coverage | The ui9 64-check matrix script is not in the tester scratchpad (Phase 11/12 copies lost). Stage 5 ran the targeted FE AI checks above (20 PASS) and did not run the matrix. | Gap | Open: restore the ui9 script into evidence before claiming the matrix. |
| F11 | Harness: R2 stand-in (scratch only) | The first nginx rewrite placed `?x-id=PutObject` inside object keys, so HEAD and DELETE checks on those keys were invalid until the shim forwarded args (`resolver` added). Not a product defect. | Harness | Closed (4h2 rerun on clean keys). |

## Excluded and expected-failure rows

Every row below is kept in `temper-raw.json` with its real exit code. None is hidden.

**Stage 3b scratch-env gaps (exit 1, then fixed):** `up` attempt 1 (SePay `PAYMENT_*` missing, finance unhealthy); attempt 2 (OAuth client IDs missing, auth unhealthy); Turnstile login 400 "Captcha verification required" (fixed by the stand-in and `NODE_EXTRA_CA_CERTS`; not a boot failure). Stand-in set-up attempts: the `alpine/openssl` entrypoint was `openssl`, so `sh -c` failed once (`stage4-setup-turnstile-scratch-ca`, exit 1), then re-run with `--entrypoint sh` (exit 0). A shell-level removal attempt was blocked by the safety check and not run; the cleanup was re-done with literal paths.

**Stage 4 superseded rows (each with the passing rerun named):**
- **4a `#003`, `#004`, `#006` (user1, first run):** ledger query used `doc:<id>%`, but the keys are `debit:`/`refund:`-prefixed (harness artefact; the debit and balance were right). Superseded by the later 4a runs on user3, which pass (rows after `#068`).
- **4a `#065`-`#068` (user3, worker still stopped from 4b):** document stayed PENDING because the real worker was stopped; the rerun after `docker start examio-ai-worker` (4a PASS, reason `DOWNLOAD_REJECTED`) supersedes them.
- **4b/4c `QUOTA_EXCEEDED` (user1, then user3):** `TEACHER` monthly limit of 5 files (`403 QUOTA_EXCEEDED`), an enforced product rule; the cases were re-run on `user3` and `user6` (4b, 4c, 4e: PASS).
- **4c `#039` (reuse-FAILED, 409 lock):** the reuse-COMPLETED job was still open, so the per-user, per-type generation lock (`409` "job sinh quiz chưa hoàn tất") refused a second job. Reordered so the reuse-FAILED check runs after the cancel; rerun `#098`-`#100` PASS (job QUEUED, 0 debits).
- **4f `#116` (quota on user3):** superseded by the user6 run (PASS, watchdog `GENERATION_TIMEOUT`).
- **4h `#131` (object present before delete = 404):** the R2 stand-in stored keys with the query string (F11). Superseded by h2 (object 200 before, 404 after), on clean keys.
- **4k `#182` (studyroom 404):** probe used `GET /studyrooms` (no route); the route is `GET /studyrooms/mine`. Fixed in `#187` (200).

**Stage 4 open checks (no pass row):** `#127` (`r2_delete_tasks rows=0`): the task was drained (not observed as a key; see the stage 4 note, F6). `#129` (reaper log lookup by id): harness check defect (the reaper logs a count only).

**Stage 5 first run `#188`-`#203` (11 PASS / 10 FAIL in log):** harness failures (first-visit tour overlay blocking the generate click, and a fallback to a stale completed job). Superseded by the final run (20 PASS, 0 FAIL). The stale completion published for a COMPLETED job is ignored by the handler (see the invariant note).

**Expected denials (PASS by design):** foreign document GET and DELETE 404 with the row kept (#k); quota 403 `QUOTA_EXCEEDED`; foreign `keyR2` 400; ai-chat clear with document-service down 503 (chat kept).

## Teardown

- `docker compose -p p15t2 ... down -v --rmi local --remove-orphans` from the scratch deploy directory: exit 0 (the stubs `p15t2-s3backend`, `p15t2-s3shim`, `p15t2-turnstile` were in the project and removed with it). Recorded as `temper-2: teardown-compose-down-v-rmi-local`.
- Re-checked at the end: `docker ps -a` lists 0 containers; 0 volumes matching `p15t`/`examio`; 0 networks matching `examio-(edge|egress|internal)`/`p15t`; 0 local `p15t2` images.
- Earlier, before any run, I removed three leftover `examio-edge`, `examio-egress`, `examio-internal` networks. Their compose labels showed project `p15t` (from the lost earlier run) and they had 0 attached containers. `meetio_*` volumes and `deploy_default` were not touched.
- Scratch secrets deleted: the copy's `deploy/.env`, the rendered `rabbitmq/definitions.json`, the JWT output, the TLS keys and certificates, the cached login cookies. The repo copy (`scratchpad/p15t2/repo`) is removed. Logs, `results.json`, `rows.tsv` and the UI screenshots remain in `scratchpad/p15t2` (no secrets).
- Process check: the Vite dev server (pid 29720) was stopped by PID after confirming its command line; no `vite`, `pytest`, `ui5`, `playwright` or `docker compose` processes of this run remain; the user's process count is 579 (system-wide `ps` is not the test's responsibility).
- The real `examio-be` tree was not modified, and its `deploy/.env` and `apps/*/.env` were never read.

## Final verification set (gate input, coordinator)
`temper-results.json` is built from `temper-final.json`: every passing `temper-2:` row (stages 2–5 of the resumed run), the `final:` static rows run by the coordinator on the FINAL code after review round 1 (proto lint/breaking, typecheck, unit 2179, check:deps, check:ownership 0, build:all, topology/rabbit 40/40, ai-service unit pytest + ruff gate, the three success-criteria greps), and the `fix-round` rows (implementer runs on the final code against throwaway infra: ai-service integration pytest 139, document e2e 71, exam e2e 269 incl. generation 63, db-isolation 57). Excluded: all `temper-1:` rows (pre-fix code; superseded) and every non-zero `temper-2:` row, each explained in "Excluded or expected-failure rows" above (harness/env gaps, ordering/quota artefacts with passing reruns, expected isolation denials, the stage-5 first run, 4g #127/#129 proven at e2e level `test/upload-money.e2e-spec.ts:151`).
Review: round 1 REWORK (H1, M1–M4, L1–L8) → fix round → re-review SEALED 8/10. Real OCR / real generation end to end is an environmental Defer (Gemini key + public R2; F3 carried to phase 16).
Human sign-off: given 2026-10-24 ("Ký duyệt + commit", incl. the no-free-retry rule); riskGate.humanSignedOff=true, hard gate re-run exit 0.
