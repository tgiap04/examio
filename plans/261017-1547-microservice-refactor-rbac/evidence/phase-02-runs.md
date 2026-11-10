# Phase 02 verification runs (implementer)

All commands from `/Users/tgiap.dev/devs/examio/examio-be` unless noted. Exit codes are real.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `yarn add -D ts-proto@2.15.3 @bufbuild/buf` then pin buf to `1.74.0`, `yarn install` | 0 | ts-proto 2.15.3, buf 1.74.0 locked; `yarn install --immutable` exit 0 |
| 2 | `./node_modules/.bin/buf --version` | 0 | 1.74.0 |
| 3 | `yarn proto:lint` (buf STANDARD) | 0 | clean (SERVICE_SUFFIX ignored for gateway_control.proto only) |
| 4 | `yarn proto:gen` | 0 | 6 TS files in libs/contracts/src/generated (gitignored) |
| 5 | RED: `yarn jest libs/grpc libs/http` before impl | 1 | 4 suites fail on missing modules |
| 6 | GREEN: `yarn jest libs/grpc libs/http` | 0 | 36 tests pass |
| 7 | RED: r2 contract spec with old controller stashed | 1 | 6/6 fail |
| 8 | GREEN: `yarn jest apps/r2-service` | 0 | 7 pass |
| 9 | `yarn jest apps/finance-service` | 0 | 48 pass (wallet contract + existing grpc spec) |
| 10 | `yarn jest apps/auth-service/test/auth.grpc` | 0 | 12 pass |
| 11 | `yarn jest apps/exam-service/test/finance-debit` | 0 | 4 pass (exam FinanceClientService -> finance WalletGrpcController over real gRPC, SUBTRACT 5, insufficient, fail-closed, benefits) |
| 12 | `yarn typecheck` (final) | 0 | 6 services clean |
| 13 | `yarn build:all` (final, includes proto:gen) | 0 | 6 webpack builds OK |
| 14 | `yarn test` (final) | 0 | 42 suites, 347 tests pass |
| 15 | `grep -rn "protos/" apps libs --include='*.ts'` | 1 | no hits |
| 16 | `grep -rn "50053\|50054\|50056" apps/*/src deploy/docker-compose.yml` | 1 | no hits |
| 17 | `grep -rn AsyncLocalStorage libs/grpc` / `grep -rn actor_id proto` | 1 / 1 | no hits |
| 18 | `apps/ai-service: ./scripts/gen_grpc.sh && ./venv/bin/python -c "from src.backend.grpc_generated.examio.r2.v1 import r2_pb2_grpc"` | 0 / 0 | stubs generated with grpcio-tools 1.71.2 (protobuf 5.29.6), import OK |
| 19 | Dist layout: `cd / && node dist/apps/r2-service/main.js` (GRPC_PORT=55054) + proto-loader probe | 0 | GetFileUrl round trip, ListUserFiles = UNIMPLEMENTED(12); proto resolved from `dist/apps/r2-service/proto` (cwd `/`) |
| 20 | `docker build -f deploy/Dockerfile --build-arg SERVICE_NAME=r2-service` | 1 then 0 | first run failed `yarn install --immutable` (stale lockfile after exact-pinning buf, YN0028); fixed with `yarn install`; second run exit 0 (proto:gen runs inside the image) |
| 21 | Container run of that image, host ports 55051->50051, 53000->3000 | 0 | logs "HTTP 3000 / gRPC 50051"; `/health/live` 200; GetFileUrl OK; `dist/apps/r2-service/proto/examio/r2/v1/r2.proto` present |
| 22 | Local infra (docker, ports 55432/56379/55672): `prisma migrate deploy`, boot `dist/apps/finance-service/main.js` (cwd `/`), scripted gRPC (proto-loader) | 0 | seeded user+wallet(20): `UpdateBalance SUBTRACT 5` -> success, newBalance 15; DB balance 15 and one SUBTRACT WalletTransaction; `Debit` -> UNIMPLEMENTED(12); `GetUserBenefits` returns camelCase (tierName, filesPerMonth...) |
| 23 | CI-style health e2e for auth/exam/finance/admin/r2/gateway against that infra | 1 then 0 | first run: 4 services failed `Cannot find module '@examio/contracts'` (per-service jest-e2e.json lacked mappers); added mappers; second run all 6 pass (3/3 each) |

Cleanup: containers `p02-pg`, `p02-redis`, `p02-rmq`, `examio-p02-*` removed; images `examio-p02-r2:test`, `examio-p02-deps:test` removed; no node processes left. Remote DBs and `deploy/.env` untouched.

Notes
- Python venv (gitignored) gained grpcio 1.71.2, grpcio-tools 1.71.2, grpcio-status 1.71.2, protobuf 5.29.6. First attempt at 1.84.0/7.36.2 (researcher-02 suggestion) was dropped: protobuf 7 conflicts with google-ai-generativelanguage/grpcio-status (<6). `pip check` still reports a pre-existing google-generativeai vs google-ai-generativelanguage mismatch, unrelated to this phase.

## Follow-up (user-approved scope extension)

| # | Command | Exit | Result |
|---|---|---|---|
| 24 | Edit `examio-be/.env.example` and `examio-be/deploy/.env.example`: HTTP URLs -> `:3000`, gRPC -> `<svc>:50051`, `WALLET_GRPC_URL` -> `FINANCE_GRPC_URL`, dead OCR_* lines removed (names only, placeholders untouched) | 0 | `git diff` reviewed |
| 25 | Append `grpcio==1.71.2`, `grpcio-status==1.71.2`, `protobuf==5.29.6` to `apps/ai-service/requirements.txt` | 0 | |
| 26 | `./venv/bin/pip install -r requirements.txt --dry-run` | 0 | resolves |
| 27 | `./venv/bin/pip check` | 1 | only the pre-existing google-generativeai vs google-ai-generativelanguage mismatch |
| 28 | stub import `from src.backend.grpc_generated.examio.r2.v1 import r2_pb2_grpc` | 0 | OK |
| 29 | repo grep (excl. node_modules, venv, .git, plans, journals, dist, .yarn, yarn.lock, `.env`) for `FINANCE_SERVICE_GRPC_URL\|WALLET_GRPC_URL\|50053\|50054\|50056` | 0 | no hits for the two var names; remaining port hits: per-service `.env.example` local-dev ports (r2 50054, finance 50053, exam/auth localhost urls) and stale docs/ + ARCHITECTURE.md + docx/ text |

## Tempering fixes (F1, F2, a-d)

| # | Command | Exit | Result |
|---|---|---|---|
| 30 | Audit nest-cli proto assets vs registered clients/servers (auth, exam, finance, r2, admin, gateway) | 0 | only gap: auth-service lacked `examio/r2` (profile.module registers the r2 client); added. exam (finance, r2), finance (finance), r2 (r2) already complete; admin/gateway register no gRPC |
| 31 | `yarn build:all` then `find dist/apps/*-service -name '*.proto'` | 0 | auth: auth, common, r2; exam: finance x2, r2; finance: finance x2; r2: r2 |
| 32 | New `scripts/boot-built-services.sh` + CI job `be-boot` (build:all, migrate, boot each dist service, curl /health/live, check gRPC port for auth/finance/r2) | 0 | workflow YAML parses |
| 33 | Local infra (docker pg/redis/rabbit on 55432/56379/55672): `PORT=53000 GRPC_PORT=55051 ./scripts/boot-built-services.sh` | 0 | ok for auth(grpc up), exam, finance(grpc up), admin, r2(grpc up), gateway |
| 34 | Negative: delete `dist/apps/auth-service/proto/examio/r2`, run script with `SERVICES=auth` | 1 | FAIL printed with the ClientGrpcProxy proto-load stack (check catches F1) |
| 35 | Same script re-run for auth WITHOUT exporting the infra env (shell state did not persist between calls) | 1 | auth loaded its gitignored `apps/auth-service/.env` and tried to reach the remote dev DB host; failed at connect (P1001) in `onModuleInit`, no query was issued. Re-verified in #36 with the env exported |
| 36 | Final: `yarn proto:lint`, `proto:gen`, `typecheck`, `build:all` | 0, 0, 0, 0 | |
| 37 | Boot script again on local infra (env exported in the same command) | 0 | all 6 ok |
| 38 | `TZ=UTC yarn test` (first) | 1 | 1 failure: ai.service.spec expected `deleteFile(key)`; now `deleteFile(key, Metadata)` because metadata is required |
| 39 | Updated that assertion; `yarn typecheck` / `TZ=UTC yarn test` | 0 / 0 | 46 suites, 369 tests pass (includes tester's ai-chat.limits.spec.ts and ai-file-quota.spec.ts, kept) |
| 40 | Python `from src.backend.grpc_generated.examio.r2.v1 import r2_pb2_grpc` | 0 | |
| 41 | greps: `protos/`, `50053\|50054\|50056` in apps/*/src + compose, `AsyncLocalStorage` in libs/grpc, `double` in proto/finance | 1,1,1,1 | no hits |

Changes behind these: exam `R2Client.{uploadFile,deleteFile,deleteObjects}` take required `Metadata` (spec uses `@ts-expect-error` so tsc rejects omission); all exam callers pass `buildMetadata()`; the client logs RPC failures with `redactMetadata`; `metadata.spec.ts` covers build/redact. r2 `deleteObjects` returns the S3 `Deleted` count; new tests for >10000 keys (INVALID_ARGUMENT), dedupe, partial Errors (INTERNAL), Deleted-count. Finance money fields (balance, amount, initial_balance, balance_after, new_balance) are `int32` (Postgres `Int`, maps to `number`, no Long option needed); UpdateBalance and CreateWallet reject non-integers, with tests. Cleanup: p02-* containers removed, no dist processes left.

## Re-temper fixes (money truncation guard, be-boot env)

| # | Command | Exit | Result |
|---|---|---|---|
| 42 | `yarn jest apps/exam-service/src/clients` (new `finance.client.spec.ts`: 5.5, 0.1, -5, 0, NaN, Infinity, 2^31 rejected with 400 `INVALID_AMOUNT`, `wallet.updateBalance` never called; whole amount passes) | 0 | 14 pass (first run 7 failed because `updateBalance` threw synchronously; made it `async`) |
| 43 | `yarn jest apps/exam-service/test/finance-debit` (+ `deductCredits(.., 5.5)` -> Forbidden, no DB read/write) | 0 | 5 pass |
| 44 | Audit of finance-money callers: only exam `FinanceClient.updateBalance` calls wallet RPCs; auth/admin/gateway have none (grep `updateBalance|createWallet|WalletService|WALLET_SERVICE`). No Debit/Credit/createWallet wrappers exist yet, so none to guard | 0 | |
| 45 | Isolation harness: copy of `dist` + `node_modules` (symlinks except copied `@prisma`, `.prisma`) in a scratch dir, run under `env -i` with only the CI job env + local infra URLs (docker pg/redis/rabbit 55432/56379/55672, ports 53000/55051). Reason: Prisma client auto-loads `examio-be/.env` and `apps/*/.env` are loaded from cwd, which hid missing vars in earlier local boots | | trace preload confirmed 0 reads of the real `examio-be/.env` |
| 46 | Boot script with the OLD job env | 1 | auth FAIL `OAuth2Strategy requires a clientID option`, finance FAIL (SePay config) - reproduces the CI failure |
| 47 | Add `GOOGLE_CLIENT_ID/SECRET`, `PAYMENT_SERVICE_SEPAY_KEY`, `PAYMENT_QR_BANK_ACCOUNT`, `PAYMENT_QR_BANK_CODE` (`ci-dummy`) | 1 | exam FAIL `QUIZ_JWT_SECRET environment variable is required` (crypto.service also needs `QUIZ_AES_KEY`, secret >= 32 chars) |
| 48 | Add `QUIZ_JWT_SECRET`, `QUIZ_AES_KEY` dummies; final isolated run of `scripts/boot-built-services.sh` with exactly the be-boot env | 0 | ok: auth(grpc up), exam, finance(grpc up), admin, r2(grpc up), gateway |
| 49 | `.github/workflows/ci.yml` be-boot env now has the 7 added keys; YAML parses | 0 | keys: DATABASE_URL FRONTEND_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET JWT_SECRET NODE_ENV PAYMENT_QR_BANK_ACCOUNT PAYMENT_QR_BANK_CODE PAYMENT_SERVICE_SEPAY_KEY QUIZ_AES_KEY QUIZ_JWT_SECRET RABBITMQ_URL REDIS_HOST REDIS_PORT REFRESH_TOKEN_ENC_KEY |
| 50 | `yarn typecheck` / `yarn build:all` / `TZ=UTC yarn test` | 0 / 0 / 0 | 47 suites, 379 tests |

Boot-time env audit per service (source of each requirement): auth = JWT_SECRET, REFRESH_TOKEN_ENC_KEY, GOOGLE_CLIENT_ID/SECRET (GoogleStrategy ctor); exam = JWT_SECRET, QUIZ_JWT_SECRET, QUIZ_AES_KEY (CryptoService ctor); finance = JWT_SECRET, PAYMENT_SERVICE_SEPAY_KEY, PAYMENT_QR_BANK_ACCOUNT, PAYMENT_QR_BANK_CODE (SePayService ctor); admin, gateway = JWT_SECRET; r2 = none. Safety: all boots used local docker infra only; nothing connected to the remote DB. Cleanup: p02-* containers and the scratch harness removed, no dist processes left.
