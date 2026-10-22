# Phase 10 runs (cut cross-DB access): temper, static + e2e + live stack

Verdict: **FAIL on acceptance.** Static gates and the ownership/depcruise gates are green. Money retry safety is not met (B2), and the built services cannot boot exam-service or admin-service from `dist/` (B1). Both block the phase. No product code was changed and nothing was committed or pushed.

Raw rows: `evidence/phase-10/temper-raw.json` (70 rows: command, real exit code, summary, ts). Non-zero rows include the failed attempts that were fixed and re-run; each one is kept on purpose.

## Environment and safety

- Throwaway containers on 127.0.0.1 only: `p10-pg` (pgvector:pg16, 58741), `p10-redis` (redis:7-alpine with password, 58791), `p10-rmq` (rabbitmq:3.13-management-alpine, 58993, p09 definitions). A passwordless `p10-redis-open` (58792) was used only for the study-room spec probe. All removed at the end (`containers left: 0`).
- Databases: `examio_p10_{auth,finance,admin,exam,stats,live}`, each migrated with `prisma migrate deploy` (guard: host must be 127.0.0.1:58741).
- Every BE command ran under `env -i` with the local env. `MAIL_TRANSPORT=json`. JWT key and service secrets were generated into scratch (mode 600) and never printed. No `.env` file was read. No `docker compose config` was run.
- Services ran from `dist/` with cwd `scratchpad/p10t/live-run`, not from the repo.
- Browser: puppeteer-core with CDP Fetch; non-local requests were failed (`blockedOutside=6` in the probe; 48 in the matrix, including `www.googletagmanager.com` and `challenges.cloudflare.com`). The blocked requests were never sent.
- Scratch dir: `/private/tmp/claude-501/-Users-tgiap-dev-devs-examio-examio-fe/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/p10t/` (logs under `logs/`).

## A. Static

| check | command | exit | result |
|---|---|---|---|
| proto gen | `yarn proto:gen` | 0 | ok |
| proto lint | `yarn proto:lint` | 0 | ok |
| buf lint (direct) | `node_modules/.bin/buf lint` | 0 | ok |
| buf breaking vs HEAD | `buf breaking --against …/.git#ref=HEAD,subdir=examio-be/proto` | 0 | ok, with the override in `buf.yaml` |
| buf breaking, override removed | scratch config, same ref | 100 | exactly 2 messages and 1 RPC: `UpdateBalance` (negative control, as documented) |
| buf breaking vs main | `…#branch=main` | 1 | main has no `examio-be/proto` (protos are new on this branch), so HEAD is the correct baseline |
| typecheck | `yarn typecheck` (6 services) | 0 | ok |
| ownership strict | `yarn check:ownership` | 0 | `Violations: 0` |
| depcruise | `yarn check:deps` | 0 | 0 errors, 8 warnings (see W1) |
| build | `yarn build:all` | 0 | ok |
| BE unit | `TZ=UTC yarn test` | 0 | 169 suites, 1804 tests pass |
| FE build | `yarn build` | 0 | ok (chunk-size warning) |
| FE lint | `yarn lint` | 0 | 0 errors, 32 warnings |
| FE test | `yarn test` | 0 | 13 files, 104 tests pass |
| grep: UpdateBalance | `grep -rn UpdateBalance apps proto libs` | 0 (no hit) | ok |
| grep: admin foreign Prisma | `(prisma|tx).(wallet|walletTransaction|payment|userSubscription|user|userSession)` in admin | 0 (no hit) | ok |
| grep: exam/gateway user Prisma | `(prisma|tx).(user|userSession)` | 0 (no hit) | ok |
| grep: `email: true` in exam | | 0 (no hit) | ok (see W2 for a leftover DTO field) |
| grep: auth user.repository | `wallet|subscription` | 0 (no hit) | ok |
| grep: FE `user.wallet` / `isAdmin` | | 0 (no hit) | ok |

Positive control: the grep gates were checked against real matches (`prisma.pageFeatureFlag` ×13 and `prisma.adminAudit` ×7 in admin, which are admin-owned models, so they are correctly not flagged).

CI: `.github/workflows/ci.yml:176-179` runs `check-model-ownership --strict` and `depcruise` without `continue-on-error`.

## B. E2E (RabbitMQ up, dedicated DB per suite, fresh migrate before each run)

| suite | result | note |
|---|---|---|
| finance (5 suites, `--runInBand`) | 52/52 pass | includes wallet-money: same-key twice, two parallel same-key calls, parallel distinct keys never overdraw, insufficient, welcome:<id> provisioning, refund twice, unknown key NOT_FOUND |
| auth (11 suites, throwaway JWT key) | 61/61 pass on a clean DB | fails on a second run without DB reset: B4 |
| admin (3 suites) | 27/27 pass | |
| cross-app (`test/cross-app`, 4 suites) | 39/39 pass | needs `RABBITMQ_GATEWAY_URL` (env, fixed) |
| stats-parity (`test/stats-parity`) | 2/2 pass | golden.json reproduced by the legacy service and by the new GetUserStats/GetRevenueStats path, local DB only |
| exam (18 suites) | 208/209 pass | the 1 failure is B5 (study-room spec uses a passwordless Redis client). Against a passwordless Redis, the study-room suite passes 8/8 |
| BE unit (includes libs/messaging and the authz/ownership unit specs) | 1804/1804 | the messaging library has no separate e2e in this repo |

Repeatability: the auth suite passed on a clean DB (run 2) and failed on the next run without a reset (`Expected "1" Received "2"`). The exam run passed with `SERVICE_NAME=exam-service` set. Without that variable the legacy `EventSubscriberService` hits a 403 on `common-queue` (W3).

## C. Live stack (dist services + RabbitMQ relays + vite FE)

Services up: auth 3781, exam 3782, finance 3783, admin 3785, gateway 3780, vite 5273. Real RabbitMQ relays ran in each service.

| item | result | evidence |
|---|---|---|
| C1 money: admin credit with a repeated `Idempotency-Key` (two calls) | PASS. Balance went +5 once per run. Repeated over 3 runs. | `live-api.json` (C6) |
| C1 money: insufficient SUBTRACT | PASS. 400 `INSUFFICIENT_CREDITS`, balance unchanged | C7 |
| C1 money: refund of an unknown payment | PASS. 404 `PAYMENT_NOT_FOUND` | C8 |
| C1 money: tier change | PASS. set-tier 200 | C9 |
| C1 money: admin without finance:admin | PASS. Student gets 403 on `/admin/finance/credit` | C5 |
| C1 money: AI generation debit retried by the client | **NOT MET (B2)**. Static proof, not run live. The exam debit keys are not stable across retries. Live run would need R2 and ai-service, which were not available. | `ai.service.ts:382`, `:481-486` |
| C2 `/auth/me` shape (TEACHER, STUDENT, ADMIN) | PASS. Response is `{user,roles,permissions}`, and `user` has no wallet, subscription or isAdmin key. | C2 |
| C2 `/auth/me` with finance stopped | PASS. 200 | C15 |
| C2 FE ProfilePage: TEACHER balance from `GET /wallet/info` | PASS. Displayed 35 = API 35. One `/wallet/info` call. | `browser-wallet-probe.json` |
| C2 FE ProfilePage: STUDENT no balance, no wallet call | PASS | same |
| C2 "after admin credit + refresh the balance updates" | PARTIAL. Verified by a fresh login after the credit. Not verified as an in-page refresh. | |
| C3 admin overview/series equal pre-phase values | PARTIAL. Verified by the stats-parity e2e against golden.json (local DB). No live before/after snapshot was taken. | |
| C4 profile rename → `auth.user.updated` → exam cache DEL | PASS. The key `exam:cache:user:<id>` was seeded, the admin PATCH changed the name, and the key was gone within 10 s. | `live-api.json` (C11) |
| C4 exam views show the new name, no email for teachers | PARTIAL. Teacher `examrooms/list` returned 200 with no email-like key. The row count was not recorded, so this is weak evidence. An exam view showing the new name was not seeded or checked. | C13 |
| C5 page flags: admin PATCH → gateway `SetPageFlags` → `/config/pages` and Redis | PASS. Redis `config:pages:flags` = `{"ai-tool":false}`; `/config/pages` shows it off. | C10 |
| C5 gateway boot pull (flush + restart) | PASS. The key was repopulated from admin after restart. | `live-pageflags.json` PF.a |
| C5 admin down at gateway boot, then admin up | PASS. Gateway came up and served `/config/pages` with no key. It pulled the flags 2 s after admin returned. | PF.b |
| C6 word-family: exam CUD routes removed | PASS. `POST /word-family/categories` → 404 | C12 |
| C6 admin create/update/delete with image, R2 delete | **NOT VERIFIED**. No R2 or stub. The DeleteCategory R2 call was not observed live. | |
| C7 D9: one denied action → exactly one toast | **NOT VERIFIED**. The matrix has no toast-count check and no deterministic trigger was found. | |
| C8 regression: phase-09 browser matrix | 59 PASS, 4 FAIL, 1 NOTE (`ui-browser-run.json`). The 4 FAILs come from unseeded fixtures (see below). Not the same 64-check set as phase 09. | `ui-browser-run.txt` |
| D admin audit: actor names render | PASS for names (5/5 rows have a name, batched GetUsersByIds). **FAIL** for `actorId` (B3): every row has `actorId: null`. | C14, C14b |

Matrix FAILs, fixture-caused, not verified:
- 6 TEACHER and STUDENT exam session checks: no seeded exam session (`notes-seed.json` was `{}`).
- 7 study room, 2 checks: `room.env` was a placeholder (`none-p10`). The phase-09 run had a seeded room.
- NOTE: "Từ đã lưu" view does not exist in `examio-fe/src` (0 hits), so it cannot be verified as written.

Screenshots: `evidence/phase-10/ui-screens/` was not written (0 files).

## Bugs (ranked, heaviest first)

**B1 (blocker). The built dist cannot boot exam-service or admin-service.**
- Where: `examio-be/nest-cli.json:87-125` (exam-service assets copy only `finance/**` and `r2/**`) and `:126-159` (admin-service assets copy only `auth/**` and `common/**`). The gateway block at `:160` copies only `gateway/**`, and it loads `admin/v1/admin.proto` for the boot pull.
- Repro: `yarn build:all`, then `node dist/apps/admin-service/main.js` from any cwd. Also `node dist/apps/exam-service/main.js`. Both exit on `ENOENT … dist/apps/admin-service/proto/examio/finance/v1/finance_admin.proto` (exam: `…/auth/v1/auth.proto`).
- Expected: each dist bundle carries every proto its clients and servers load (`resolveProtoRoot()` in `libs/grpc/src/proto-paths.ts`).
- Actual: both services fail to start. Unit and e2e pass because they run from source, with `cwd/proto`.
- Workaround used for the live run only: `PROTO_ROOT=<scratch copy of examio-be/proto>`. Nothing in the repo was changed.
- The gateway's `admin` proto is probably affected too. It was not run without the override.

**B2 (blocker, money). AI debit keys are not stable across client retries.**
- Where: `examio-be/apps/exam-service/src/modules/ai/ai.service.ts:382` (`newIdempotencyKey('quick-upload-reuse')`, a fresh UUID per call) and `:481-486` (`const id = this.generateIdService.generateId()` then `quick-upload:${id}`). The `id` is not the persisted `userStorage.id`, so the "once per file" comment is not true.
- Repro (static): the same HTTP request sent twice (client retry) gets two different keys, so `Debit` applies twice.
- Expected (acceptance): "AI generate retried by the client lib → one debit". Keys must be derived from something the client does not change on retry (storage id or a client request id).
- Actual: two debits. Not run live (needs R2 and ai-service). The money RPC itself is correct (finance e2e 52/52).

**B3 (medium). Admin audit `actorId` is always null, and the page shows `#null`.**
- Where: `examio-be/apps/admin-service/src/modules/admin-audit/admin-audit.service.ts:105` (`actorId: Number(r.adminId)`). `adminId` is a cuid string, so the result is NaN. The FE renders it at `examio-fe/src/components/admin/AuditTable.tsx:121-123`. Same line on `main` (pre-existing).
- Repro: `GET /api/v1/admin/audit` → `rows[0].actorId === null`. C14b fails.
- Expected: `actorId` is the admin's id (string), and the page shows the admin name, not `#null`.

**B4 (medium, test). Auth e2e is not repeatable.**
- Where: `examio-be/apps/auth-service/test/auth-users.e2e-spec.ts:149` (inserts `utmSource: 'e2e-source'`) and `:156` (`toBe('1')`).
- Repro: run the auth suite twice on the same DB. Run 2 fails with `Expected: "1" Received: "2"`.
- Expected: the test owns its data (unique utm per run, or count relative to a baseline), or cleans up.

**B5 (medium, test). Study-room WS spec ignores the app's Redis password.**
- Where: `examio-be/apps/exam-service/test/study-room-ws.e2e-spec.ts:109-111` (`new Redis({ host, port })`, no password).
- Repro: with `REDIS_PASSWORD` set (as in the app and most envs), 1 test fails with `ReplyError: NOAUTH Authentication required` (`a stale token … TOKEN_STALE`). Passwordless Redis: 8/8 pass.
- Expected: use the same Redis config as the app (`REDIS_PASSWORD`).

**W1 (low). depcruise warnings.** `check:deps` exits 0 with 8 warnings. Cross-app imports in exam tests (`test/finance-debit.grpc.spec.ts`, `test/ownership/demoted-owner.ownership.e2e-spec.ts`) and `libs-no-prisma` on `libs/common` (expected until phase 11).

**W2 (low). Leftover email field in exam OpenAPI.** `examio-be/apps/exam-service/src/modules/examroom/dto/examroom-response.dto.ts:19` still declares `email` on `HostSummaryDto`. It is not populated, but the contract still advertises it.

**W3 (low). Legacy event subscriber default queue is not granted.** `examio-be/libs/common/src/events/event-subscriber.service.ts:31` defaults to `common-queue` when `SERVICE_NAME` is unset. No RabbitMQ user has a grant on it (`deploy/rabbitmq/definitions.template.json`), so the consumer gets 403 ACCESS-REFUSED and closes its channel.

**W4 (low, plan drift). Page-flag key name.** The plan says the gateway writes `gw:config:pages`. The code writes `config:pages:flags` (`libs/common/src/constants/cache-keys.ts:158`, `apps/gateway-service/src/services/config.service.ts:61-73`). Behaviour is correct. Only the name differs.

**W5 (low, shared broker noise).** Finance's `auth.user.authz_changed` consumer retried 5 times with an FK error (`Wallet_userId_fkey`). The broker still held messages from the finance e2e DB. That is a test-environment artifact, not a product defect.

**W6 (info). Empty page-flag default.** When the key is missing, `/config/pages` returns `{"pages":[]}`. The plan says the default is "all enabled". Whether the FE treats an empty list as enabled was not checked.

## Not verified (and why)

- C1 AI-path debit with a client retry live (B2): needs R2 and ai-service. Static only.
- C3 pre- vs post-phase overview numbers on the same live DB: no pre-phase snapshot. Stats-parity e2e only.
- C4 exam view showing the new name live: no seeded exam view.
- C6 word-family image create/delete and the R2 object delete: no R2 or stub.
- C7 D9 toast dedupe: no deterministic trigger, no toast-count check.
- Full phase-09 matrix (64 checks) on this stack: fixtures for exam session and study room were not seeded.
- Gateway boot without the `PROTO_ROOT` override (B1).
- Mobile and ai-service Python: out of scope, as declared.

## Concerns

- The phase should not be marked done until B1, B2 and B3 are fixed. B4 and B5 block a green e2e rerun.
- The live run used a `PROTO_ROOT` override and a fixed set of seeded accounts. It is not a clean-room deploy.

## Re-temper 2 (live)

Scratch harness: `scratchpad/p10t2/` (copies of the round-1 scripts, containers `p10t2-*`). All rows are `re-temper-2:` in `evidence/phase-10/temper-raw.json`. Boot had no `PROTO_ROOT` override. The shared live DB is `examio_p10_live` (all dist services point at it, as in round 1).

Setup notes, all disclosed:
- MinIO is not pullable here (`minio/minio` denied on docker.io, `quay.io/minio/minio` 401). `andrewgaul/s3proxy` (S3-compatible, transient backend, dummy local creds) stands in on `127.0.0.1:59000`.
- Two rows in `temper-raw.json` were malformed: my own bad invocation of `rec.sh` (no args, and one missing the prefix). Both were removed before the real rows were recorded. Infra was started once successfully.
- Login is rate-limited (5/min on credential routes). Seeds and checks back off on 429.

### Live results so far

| item | result | evidence |
|---|---|---|
| boot, 6 dist services, no PROTO_ROOT | PASS, all 6 ports open, no ENOENT | `t2-start-all` |
| C1 money (admin credit repeated key once, insufficient, unknown refund, tier, student 403) | PASS, credit 20 -> 25 once, 400 INSUFFICIENT_CREDITS, 404 PAYMENT_NOT_FOUND, set-tier 200, student 403 | `live-api-retemper2.json` |
| C2 /auth/me shape, finance down | PASS, 200 with finance stopped | `live-api-retemper2.json` |
| C4 rename -> exam cache DEL | PASS (`seeded=1`, cache deleted via event) | `live-api-retemper2.json` |
| C5 page flags: PATCH -> gateway, boot pull, admin down then up | PASS 4/4 | `live-pageflags-retemper2.json` |
| C14b audit actorId numeric | FAIL, but a stale expectation. The B3 fix makes `actorId` the admin's string id (`p10adm...`), which is correct. Re-checked under item f. | `live-api-retemper2.json` |
| a stats: live `/admin/stats` (overview, 9 series, 4 source breakdowns) vs the legacy SQL oracle run on the same live DB at the same instant | PASS 14/14 equal | `stats-live-parity.json` |
| b rename, exam teacher views | new name shown in room detail and session GET; sharing views and session list have no email. See B6 below. | `rename-exam-views-retemper2.json` |
| c word-family image (create, replace, delete) via `/admin/word-family` -> exam -> r2 -> stand-in | PASS 13/13. Object A present after upload, A deleted on replace, B present, B deleted on category delete. Exam reads `R2_PUBLIC_URL`, the same name as r2. | `wordfamily-image-retemper2.json` |
| d D9: one denied call through the app's `api` client (real 403 PERMISSION_DENIED) | PASS, 1 toast node, text = the denied message. | `d9-toast-retemper2.json` |
| e phase-09 matrix (`ui9.cjs`) with fixtures: exam session, study room, word-family category | PASS 64/64 checks (`pass=64 fail=0 note=1`). The one note is the pre-existing "Từ đã lưu" view, which does not exist in FE src. First run had 2 fails from a fixture name mismatch (the matrix hardcodes "P09 socket room"); the room was recreated under that name, then re-run green. | `ui-browser-run-retemper2.txt` |
| f audit: actor labels, adminId filter (API) | PASS. Filter for admin1 returned 16 rows, none foreign. Filter for admin2 returned 2 rows, none foreign. Labels are the admin usernames (see note). | `audit-filter-retemper2.json` |
| f audit page in browser (labels, `#null`, filter select) | PASS. No `#null`. Select "Admin Two" leaves only admin2 rows. | `audit-page-retemper2.json` |
| FE ProfilePage wallet probe (teacher shows the `/wallet/info` balance; student shows none) | PASS 6/6. Teacher `/wallet/info` count is 2, not round 1's 1. Likely Vite dev StrictMode double effect (not verified). | `browser-wallet-probe-retemper2.json` |
| B2 retry key (AI debit) | Not verified live (needs ai-service and R2 generation path). Static: `libs/grpc/src/deadline-retry.ts:45-52` re-invokes the same closure per attempt, so a retry re-sends the request built outside the loop. `deadline-retry.spec.ts` passes but asserts retry count, not key identity. `deadline-retry.spec.ts` + `idempotent-rpcs.spec.ts`: 18/18. | `t2-b2-grpc-retry-specs` row |
| RabbitMQ relays and consumers | PASS. Broker shows auth, exam (x4 channels across 2 instances), finance, gateway connections. Consumers on `finance.events`, `gateway.events`, `exam.events`, `exam-service`. No AMQP error lines in any service log. | broker `list_connections`, `list_consumers` |

### Item 3: `[StudyRoom Redis sub] error: Connection in subscriber mode` (finding N1)

Trigger, from a traced exam boot (`--require` preload that logs `sendCommand` and connection lifecycle on the sub client only):
- `apps/exam-service/src/modules/study-room/redis-io.adapter.ts:37-41` builds `sub` (`maxRetriesPerRequest: null`). `:45-46` only logs its `error` event. `:70-74` calls `createAdapter(pub, sub)` before the connection is ready.
- `@socket.io/redis-adapter@8.3.0` (`node_modules/@socket.io/redis-adapter/dist/index.js:89-106`, ioredis branch) sends `psubscribe(socket.io#/#*)` and `subscribe(socket.io-request#/#, ...)` on `sub` at construction.
- Trace order: `connect` -> `psubscribe` + `subscribe` sent -> ioredis on-connect `client SETINFO` (`ioredis/built/redis/event_handler.js:65`) and ready-check `info` (`Redis.js:700`) are sent while `condition.subscriber` is set -> rejected by `Redis.js:338` ("Connection in subscriber mode") -> the rejection is the logged error -> ioredis closes and reconnects -> the subscribe commands are not replayed -> `ready`.
- Result: `PUBSUB NUMPAT` = 0. No exam instance holds the `socket.io#/#*` subscription. Same after a Redis restart.
- Committed HEAD: `redis-io.adapter.ts` is identical to HEAD (0 diff lines). The defect is on HEAD.

Functional impact (two exam instances, 3782 and 3788, one Redis; `xi-test.cjs`):

| check | cross-instance (teacher@3782, student@3788) | same-instance control | 
|---|---|---|
| presence on join | FAIL, 0 events, before and after restart | PASS |
| chat | FAIL, 0 events, before and after restart | PASS |
| media:set | FAIL, 0 events, before and after restart | PASS |

Redis restart (`docker restart p10t2-redis`): both instances reconnect (`[Redis] Connected`), and the adapter is still not subscribed. Rows: `t2-xi-before-2`, `t2-xi-after-restart`, `t2-xi-control-*`, `t2-redis-pubsub-*`. Evidence: `study-room-cross-instance-retemper2.json`.

The `error` handler at `redis-io.adapter.ts:45-46` logs and hides the broken subscription, so nothing alerts. The first boot line is the only symptom.

Fix direction (not applied, not verified): await `sub` `ready` before `createAdapter` (or subscribe after `ready`), and/or give `sub` `enableReadyCheck: false` and `disableClientInfo: true`. Acceptance: `PUBSUB NUMPAT` = 2 with two instances, and `xi-test.cjs` 3/3 cross-instance.

### Other findings from this round

- N2 (low to medium, pre-existing on HEAD): teacher room detail is served stale after a session edit. `apps/exam-service/src/modules/examroom/examroom.service.ts:97` (`getExamRoomById`, `cache: true`, nested `examSessions`) is not invalidated by `examsession.service.ts` update (`:338-362`). TTL is 5 min (`libs/common/src/repositories/base.repository.ts:24`). Observed the old whitelist about 2 and 3 min after a `PUT examsessions/:id`. Repro: PUT whitelist, GET `examrooms/detail/:id`. The session list and session GET were fresh.
- N3 (low): session `whitelist` accepts any string (`apps/exam-service/src/modules/examsession/dto/create-examsession.dto.ts:30`, `sharing.dto.ts:10`). Seeding an email was accepted and echoed in room detail, sessions and session GET. The FE whitelist search returns user ids, so the real flow does not leak. Validation is still missing.
- N4 (low, design): audit actor label is `username` (`apps/admin-service/src/modules/admin-audit/admin-audit.service.ts` `actorNames`, `u.username`). The filter dropdown labels `name || username`. The same admin shows as two identities. Not a defect, but the label does not follow the display name.
- Stats: live `/admin/stats` (14 keys) equals the legacy SQL oracle run on the same live DB at the same instant. The frozen golden is reproduced only by the stats-parity e2e (fake Date); the live clock cannot be frozen.

### Re-temper 2 verdict

Items closed live: boot without `PROTO_ROOT` (B1), audit actor id and label (B3), C1 money, C2 `/auth/me` and ProfilePage wallet, C4 rename cache DEL, C5 page flags (boot pull, admin down then up), stats (14/14 against the legacy SQL oracle on the same live DB), word-family image create/replace/delete (13/13), D9 single toast, phase-09 matrix (64/64, 1 pre-existing note), audit page and admin filter, RabbitMQ relays.

Not closed or not verifiable here:
- B2 (AI debit retry key) live: needs ai-service and R2 generation. Static and spec evidence only (see table above).
- M1 (exam AI reuse path fails closed on a refused debit): not re-run live, same reason.
- MinIO itself: not pullable. The S3-compatible stand-in (`andrewgaul/s3proxy`) was used. Object semantics were verified against it, not against MinIO or Cloudflare R2.
- C3 pre-phase snapshot: the live check is against the legacy SQL oracle at the same instant. The frozen golden was reproduced only by the stats-parity e2e (fake Date).
- W3 (unset `SERVICE_NAME`): every service ran with `SERVICE_NAME` set. Not re-tested without it.
- W6 (empty page flags = all enabled, FE side): not re-checked.

Defects in this round (no product code changed, nothing committed):
- N1 (medium-high, pre-existing on HEAD): study-room cross-instance fan-out is dead. Root cause and repro above. Fix direction is unverified.
- N2 (low-medium, pre-existing on HEAD): teacher room detail is served stale for minutes after a session edit (`examroom.service.ts:97`, 5-minute TTL).
- N3 (low): session whitelist accepts non-id strings.
- N4 (low, design): audit label is the username, while the admin dropdown shows the display name.
- Harness only: C14b in `live-api-retemper2.json` expects a numeric `actorId`, which was the pre-fix contract. The fixed string id is correct. Corrected in the f checks.

Harness notes (for the next round): `svc.sh start exam2` does not check for a busy port, so a second start of an instance already running leaves an orphan. Stop by pid, and confirm the port is closed before starting. Malformed `rec.sh` calls added two bad rows that were removed before the real ones were recorded.

## Re-temper 3 (live, after review fixes)

Verdict: **FAIL on acceptance.** Static gates, N1 (cross-instance fan-out), N2, L2, L8, H1 and H2 (analytics, manage list, study-room ranks) pass live. Three blockers stay open:
- **C1 (new, blocker): an exam instance crashes the whole process** when another instance runs an authz-change fan-out (`fetchSockets`). Reproduced in 1 of 3 valid runs. Same code path exists on HEAD.
- **F1 (blocker, money): the admin credit modal cannot succeed.** Every credit returns 400 `Validation failed`, so "one click → one tx" cannot pass.
- **B2-upload (blocker, money): the upload debit is not retry-safe.** The same `POST /ai/upload` sent twice debits twice.

Raw rows: `evidence/phase-10/temper-raw.json`, rows prefixed `re-temper-3:` (78 rows). Non-zero rows are kept on purpose: harness mistakes I fixed and re-ran are included with their real exit codes, and the summary of each row says what happened. Per-check JSON: `money-r3.json`, `fe-finance-r3.json`, `h1-r3.json`, `h2-browser-r3.json`, `l8-l2-r3.json`, `n2-session-whitelist-retemper3.json`, `study-room-cross-instance-retemper3.json`, `live-api-retemper3.json`, `ui-browser-run-retemper3.{json,txt}`.

Scratch harness (not in repo): `scratchpad/p10t3/` (copies of the round-2 scripts, retargeted to `p10t3-*`). Round-2 scripts were copied, not edited. Containers `p10t3-pg|redis|rmq|s3`, all removed. Teardown `processes left 0; containers left 0; ports none` (row `teardown-r3`).

### Environment

- Infra: postgres pgvector:pg16, redis 7 with password, rabbitmq 3.13 (`--user rabbitmq` needed, see harness notes), s3proxy stand-in on 127.0.0.1 only.
- DBs: `examio_p10_{auth,finance,admin,exam,live}`, each `prisma migrate deploy` from scratch (all six migration dirs, both new ones applied). Every DB command ran under `env -i` through `with-env.sh`, and the guard refused anything not on 127.0.0.1:58741.
- Boot: 6 dist services plus a second exam instance (3788), no `PROTO_ROOT`. Vite 5273 proxies to the gateway 3780.
- `MAIL_TRANSPORT=json`, dummy/local keys only. No `.env` read, no `docker compose config`, no JWT or password written to evidence.

### Results per item

| # | item | result | evidence / note |
|---|---|---|---|
| 1 | static: proto:gen, typecheck, build:all, `TZ=UTC yarn test`, check:ownership, check:deps | PASS. proto 0, typecheck 0, build 0, BE 173 suites (1 skipped), 1858 pass, 4 skipped, ownership 0 violations, deps 0 errors / 2 warnings | rows `s-*` |
| 1 | migrate deploy on a fresh DB, both new migrations (`20261022090000_wallet_idempotency`, `20261023090000_payment_refund_key`) | PASS, applied in order | `logs/migrate-live.log` |
| 1 | `prisma migrate diff --exit-code` schema vs DB, 5 DBs | PASS, "No difference detected" on all 5 | rows `s-drift-*` |
| 1 | FE build, lint, test | PASS. build 0, lint 0 errors / 32 warnings, test 118 pass | rows `s-fe-*` |
| 2 | boot 6 dist services + vite, no PROTO_ROOT | PASS (7 ports open). Caveat: the exam dist was missing once mid-run, see U1 | rows `boot-*` |
| 3 | N1: `PUBSUB NUMPAT` ≥ 1 and NUMSUB on request channel = 2 | PASS. NUMPAT 1 (unique patterns), NUMSUB 2, before and after `docker restart` | `n1-pubsub-*` |
| 3 | N1: teacher@3782 + student@3788, presence / chat / media cross | PASS 3/3 before restart, 3/3 after restart. Control (same instance) 3/3 | `n1-xi-*`, `study-room-cross-instance-retemper3.json` |
| 3 | N1: no `[StudyRoom Redis sub] error` | PASS, 0 lines in both exam logs | `n1-sub-error-grep-before` (exit 1 = grep found no line) |
| 4 | N2: PUT whitelist → room detail immediately | PASS, 2/2 transitions | `n2-session-whitelist-live`, `n2-session-whitelist-retemper3.json` |
| 5a | teacher with no wallet, upload through exam → finance with user token | PASS. wallet minted (welcome +20), one debit of 2, balance 18 | `money-r3-api-3` M6 |
| 5a | the same request sent again (client retry) | **FAIL (B2-upload)**. second debit, balance 18 → 16 | `money-r3-api-3` M6b |
| 5a | STUDENT upload (no wallet) | PASS. 403 `PERMISSION_DENIED`, no storage row, no tx. Note: the wallet-missing 403 is not reachable this way, because students lack `document:upload` | M7 |
| 5b | FE FinanceActionModal credit, single click | **FAIL (F1)**. 400 `Validation failed`, 0 tx, toast "Thao tác thất bại: Validation failed". The request does carry an `Idempotency-Key` | `fe-finance-r3.json` |
| 5b | double click on "Tiếp tục" (credit) | not verifiable: credit is blocked (F1). Only one confirm dialog appeared for a double click in the refund flow | |
| 5b | CORS preflight allows `Idempotency-Key` | PASS for `http://localhost:5173` (echoed allow-origin). `http://127.0.0.1:5273` gets no allow-origin, which is fine because dev is same-origin through the vite proxy | rows `m2-cors-*` |
| 5c | same key, different amount → 409 `IDEMPOTENCY_KEY_REUSED` | PASS, balance unchanged | M3 |
| 5d | refund a subscription payment twice, same key | PASS on effect: payment status 4, one audit row, key stored as `refund-payment:<key>`. Gap: the 2nd response is 200 with the same body and no `alreadyApplied` flag (see M1) | M5 |
| 5d | FE refund single and double click | PASS. single click 200, status 4. double click: one confirm dialog, one request, one effect | `fe-finance-r3.json` |
| 5e | insufficient SUBTRACT → 400, no tx row | PASS, `INSUFFICIENT_CREDITS`, balance and tx count unchanged | M4 |
| 6 | L8: finance down → admin user detail | PASS. 200, `financeUnavailable: true`, `wallet: null`, `subscription: null`, auth part present. After restart: 200, `false` | `l8-l2-r3.json`, `l8-detail-shape` |
| 7 | L2: flush `config:pages:flags` at runtime | PASS. key re-pulled after 21 s (watcher ≤ 60 s). `/config/pages` shows admin value | `l8-l2-r3.json` |
| 8 | H1: 520-id quiz whitelist, sharing view | PASS. 200, 520/520 names, 0 placeholders. Postgres statement log shows 2 `User IN` queries with 500 and 20 ids (cold cache, forced) | `h1-r3.json` |
| 9 | H2: soft-deleted student with attempt; analytics, manage list, study-room ranks | PASS for 3 pages: label "Người dùng đã xóa", no deleted email or id, no crash. Caveat: the label appeared only after the exam profile cache for that user was dropped (F2). Manage detail page: no student rows, so the label check does not apply (harness expectation was wrong, not the product) | `h2-browser-r3.json` |
| 10 | phase-09 matrix copy (`ui9-r3.cjs`, outputs in phase-10 dir) | PASS 64/64, 1 note (pre-existing: the "Từ đã lưu" view is absent in FE src) | `ui-browser-run-retemper3.txt` |
| 10 | round-2 live C1–C15 | PASS 20/21 on the final run. C14b fails as a stale expectation: it wants a numeric `actorId`, the fixed contract is the admin string id (`p10adm…`). Passed in round 2 only because the old contract was pinned | `live-api-retemper3.json` |

### Bugs (ranked, heaviest first)

**C1 (blocker). An exam instance dies on a cross-instance `fetchSockets`.**
- Where: the response builder in `examio-be/node_modules/@socket.io/redis-adapter/dist/index.js:264` (`REMOTE_FETCH`, `JSON.stringify` of `socket.data`). The unsafe field is `socket.data.expTimer`, a Node `Timeout`, set at `examio-be/apps/exam-service/src/modules/study-room/study-room.gateway.ts:158-162`. Callers that reach it: `study-room-broadcaster.service.ts:31` (`reauthStaleSockets`, triggered by authz changes) and `study-room.gateway.ts:671`.
- Repro (`crash-repro-r3.cjs`): two exam instances (3782, 3788) on one Redis. A student socket is on 3788 and has joined a room. An admin bans the student (`POST /admin/users/:id/ban`). The event is consumed on 3782, which calls `fetchSockets` on the user room. Instance 3788 then throws `TypeError: Converting circular structure to JSON` (`--> starting at object with constructor 'Timeout' … property '_idleNext' closes the circle`) and exits. Repeated: runs 3 and 4 pass, run 5 crashes (runs 1–2 failed on a harness path bug and are not counted). Outcome depends on which instance consumes the event.
- Expected: a remote fetch returns only safe fields, and the process stays up.
- Actual: uncaught rejection in `RedisAdapter.onrequest`, process exit. A restart is needed. There is no restart policy in the harness.
- Pre-existing on HEAD: `git show HEAD:…study-room.gateway.ts` has `expTimer` 3 times and `fetchSockets` once. Fix direction: store the timer id or a plain number, not the `Timeout`; pick only safe fields in any `fetchSockets` consumer; add a guard so an adapter failure cannot kill the process.

**F1 (blocker, money). The admin credit modal sends a body the BE always rejects.**
- Where: FE `examio-fe/src/apis/adminApi.ts:96-100` (`CreditBody { userId: number; amount; reason }`, no `direction`) and `:181-184`. The modal negates `amount` for SUBTRACT at `examio-fe/src/components/admin/FinanceActionModal.tsx:89-91`, and takes `userId` from an `InputNumber` at `:156-162`. BE: `examio-be/apps/admin-service/src/modules/admin-finance/dto/credit.body.ts` (`userId` string, `amount` `.positive()`, `direction` ADD|SUBTRACT).
- Repro: API probe `M0` (body without `direction`, numeric `userId`) → 400. Browser (`fe-finance-r3.cjs`): Điều chỉnh credits → ID 1, amount 5, reason → Tiếp tục → Xác nhận → toast "Thao tác thất bại: Validation failed", 0 tx.
- Expected: one tx, balance +5. Actual: 400, 0 tx. Also, real user ids are strings, so an `InputNumber` cannot address any real user. SUBTRACT would fail the same way (negative amount vs `.positive()`); this part is from reading the code, not run live.

**B2-upload (blocker, money). The upload debit is not retry-safe.**
- Where: `examio-be/apps/exam-service/src/modules/ai/ai.service.ts:1029-1030` (`const id = this.generateIdService.generateId()` per call, with a comment that says "once per file"). The debit key `upload:${id}` follows. The R2 key (`keyR2`) is the stable identity of the file and is not used.
- Repro (`money-r3.cjs` M6b): the same `POST /ai/upload` body twice → second 201, two `debit:upload:*` rows, balance 18 → 16.
- Expected: one debit per file. Actual: two. Suggested key: derive from `keyR2` (or a client-supplied id). This is the same class as the round-1 B2 for AI generation, which is still open.

**M1 (low, money contract). Refund replay looks like the first call.**
- Where: `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.service.ts:87-93` builds `RefundResult` without `alreadyApplied`. The controller returns `{success, data}` only.
- Repro: M5. Both calls return 200 with the same body shape. The caller cannot tell "already_applied". The effect is correct (one audit row, status 4).

**F2 (low). Deleted user's name is served from the exam profile cache until it expires.**
- Where: `examio-be/apps/exam-service/src/clients/auth.client.ts:46` (`exam:cache:user:<id>`). Auth itself excludes deleted users: `examio-be/apps/auth-service/src/grpc/users-query.service.ts:66,78` (`deletedAt: null`).
- Repro: H2. The name "P10 H2 student" was still shown after the soft delete. After `DEL exam:cache:user:*`, the label appeared. Note: no product path in this repo sets `deletedAt` (grep found none), so the soft delete was done in SQL. The TTL was not measured.

**U1 (concern, unexplained). The exam dist folder disappeared during the run.**
- `examio-be/dist/apps/exam-service` was gone at about 20:06 UTC, while the other five service dirs stayed. The restart failed with `Cannot find module …/dist/apps/exam-service/main.js`. `nest build exam-service` restored it. A full `yarn build:all` afterwards produced all six dirs, so I could not reproduce the loss. Cause not found. Root `nest-cli.json` has `deleteOutDir: true` (unchanged from HEAD) and applies to every project. Watch this in CI.

**Harness notes (not product defects, all disclosed):**
- `xi-test.cjs` presence check is weak: `some((p) => JSON.stringify(p).includes(""))` is always true, so presence is checked by count only.
- Early failing rows that were fixed and re-run: `seed-live-accounts` (env not passed through `with-env`), `xi-test` (student was not a room member, so `room:join` returned FORBIDDEN; the harness did not count student errors), `room-join` (502 while exam was down), `crash-repro` (double `/api/v1` prefix in the admin helper, and a missing ban `reason`), `live-checks` (ran into the login 429 window, rerun after 70 s), `money-r3` (wrong login password, wrong ledger key prefix `debit:`). Each one is a row in `temper-raw.json`.
- Hosts blocked by CDP in the browser runs: `www.googletagmanager.com`, `challenges.cloudflare.com` (never sent).

### Not verifiable here (and why)

- N1 degraded boot when Redis is down: not run.
- F1 double click on the credit "Tiếp tục": blocked by F1.
- B2 for AI generation (ai-service, R2): not run, still open from round 1/2.
- C1 crashed in 1 of 3 valid runs. A longer loop would give a real rate; I did not run one.
- `flashcard` sharing list (the task says flashcard/quiz): only the quiz path was measured. Both use the same `sharing-list.util` code, but flashcard was not run.
- W3 (unset `SERVICE_NAME`), W6 (empty page flags on the FE side): not re-checked.
- Mobile and ai-service Python: out of scope.

### Concerns

- C1 is a process-level crash in a shared path. It needs a fix before this phase can be marked done, and the fix should also cover the adapter error path. A restart policy alone hides it.
- F1 and B2-upload must be fixed before the money acceptance can pass. Without F1, admin credit is dead on the FE.

### Ranked next steps

1. C1: stop serialising `socket.data.expTimer`; guard the adapter response path; re-run the crash repro 10 times with zero crashes.
2. F1: align `adminApi.ts` `CreditBody` with the BE schema (string id, `direction`, positive amount); add a browser check for a successful credit and SUBTRACT.
3. B2-upload: key the debit on `keyR2` (or a client id); re-run M6b to expect one debit.
4. M1: return `alreadyApplied` in the refund response.
5. F2: invalidate the exam profile cache on user delete, or accept the TTL and document it.
6. U1: find what removed `dist/apps/exam-service` and make the build fail when any service output is missing.

## Re-temper 4 (final, targeted)

Verdict: **C1 and F1 pass live. One new low-severity bug found (word-family duplicate name → 500). Phase 10 can close on the targeted scope once that bug is either fixed or accepted.** Raw rows: `evidence/phase-10/temper-raw.json`, prefix `re-temper-4:`. Per-check JSON: `fe-finance-r4.json`, `kick-r4.json`, `n6-wordfamily-r4.json`. Scratch harness `scratchpad/p10t4/` (copies of round-3 scripts, retargeted to `p10t4-*`). Containers `p10t4-*` removed (teardown row `teardown-r4`: processes 0, containers 0, ports none).

### Build and boot

- Static (one `build:all`, then copied to `scratchpad/p10t4/dist-copy`, all services ran from that copy with `NODE_PATH` pointing at `examio-be/node_modules`, so no reviewer `nest build` can wipe what ran): typecheck exit 0; `build:all` exit 0 (6 services); BE `TZ=UTC yarn test`: 174 suites pass, 1 skipped, 1864 tests pass, 5 skipped; `check:ownership` 0 violations; FE build 0, lint 0 errors / 29 warnings, test 124 pass.
- Boot: 6 services plus a second exam (3788), no PROTO_ROOT, vite 5273. Infra `p10t4-pg|redis|rmq|s3`, fresh migrations on all five DBs.
- One infra fix (not product): the S3 stand-in accepts only `p10nlocal`. The services' R2 env had another identity, so R2 deletes returned `Forbidden` (seen in `exam.log`). I changed the round-4 service env to the stand-in identity and restarted exam, exam2 and r2 only. The round-2/3 word-family claims were made with a different credential pair and should be treated as unverified until re-run; the N6 result below is with the aligned credentials.

### Results

| # | item | result | evidence |
|---|---|---|---|
| 2 | C1 authz-change repro ×10 (student socket on B, ban consumed on A or B) | PASS 10/10. 0 crashes, reauth `AUTHZ_CHANGED` delivered 10/10, 0 `Converting circular` lines in either log. Caveat: which instance consumes the event is RabbitMQ-assigned and not controllable, so "consumed on A" was not forced. Earlier round-3 crash (1 of 3 valid runs) was on the old code | `c1-authz-loop-10x-r4` (`c1-loop.sh`) |
| 2 | kickUser across instances (teacher on A bans student on B) | PASS. student got `room:kicked`, socket disconnected by the server, teacher still connected, both instances up. Then `member:unban` | `kick-r4.json` |
| 2 | harness sensitivity: old behaviour crashes, new does not | PASS. Standalone `socket.io` + `@socket.io/redis-adapter` on the throwaway Redis. Old (Timeout in `socket.data`): holder exits 1 with the circular-JSON TypeError. New (numeric only): holder alive, fetch returns 1 socket | `c1-control-old-r4` (exit 0, control shows B crashed), `adapter-control.cjs` |
| 3 | F1 credit ADD, one click | PASS. 1 request with `Idempotency-Key`, 200, tx +1, balance +4 (20→24) | `fe-finance-r4.json` |
| 3 | F1 credit SUBTRACT, one click | PASS. 200, tx +1, balance −2 (24→22) | same |
| 3 | F1 credit double click on "Tiếp tục" | PASS. one confirm dialog, one request, one key, tx +1, balance +3 (22→25) | same |
| 3 | F1 set-tier with billing cycle | PASS. `UserSubscription` tier 1 / yearly; response 200; audit +1 | same |
| 3 | F1 identical resubmit | PASS. response 200 with `alreadyApplied: true`, no new audit row, subscription unchanged. The resubmit is a new click, so it has a new key; `alreadyApplied` came from the no-op tier/cycle rule (N4), not the key | same |
| 3 | F1 refund once (UI) | PASS. payment 4, 200 | same |
| 3 | F1 refund twice (UI, two clicks) | PASS on effect. 200 then **409 `PAYMENT_ALREADY_REFUNDED`**; one audit row, status 4. Note: two UI clicks get two keys, so the second is rejected by state, not by key replay | same |
| 4 | N6 replace: old `word-family/` object deleted, new kept | PASS | `n6-wordfamily-r4.json` |
| 4 | N6 delete category: current object deleted | PASS | same |
| 4 | N6 URL outside `word-family/`: object kept, log line | PASS. object `other-n6/…` still present after delete; log `category image other-n6/… is outside word-family/; not deleted` | same |
| 5 | N1 cross-instance presence/chat/media 3/3 before and after Redis restart | PASS. NUMPAT 1 and NUMSUB 2 before and after; 0 `StudyRoom Redis sub] error` lines | `n1-*-r4` rows |
| 5 | ui9 matrix (64) | PASS 64/64, 1 note (pre-existing) | `ui-browser-run-retemper4.txt` |
| 5 | live C1–C15 (includes C4/C5 money quick set) | PASS 20/21. C14b is the known stale expectation (numeric `actorId`; the fixed contract is the string id `p10adm…`) | `live-api-retemper4.json` |

### Bugs found this round

**W1 (low). A duplicate category name returns 500 instead of a 4xx.**
- Where: `examio-be/apps/exam-service/src/modules/word-family/word-family-admin.service.ts:112-124`. There is a slug pre-check (`ALREADY_EXISTS`), but no name check. `examio-be/apps/exam-service/src/modules/word-family/word-family.repository.ts:48` (`createCategory`) hits Prisma's unique constraint on `name`.
- Repro: create a category with name "P10 N6 x", then create another category with the same name and a different slug. Observed: `500 UNKNOWN` (`exam.log`: `PrismaClientKnownRequestError … Unique constraint failed on the fields: (name)`, `RpcExceptionsHandler`).
- Expected: 409 (or 400) with a clear message, as the slug case does. Actual: 500.

**I1 (info, harness). Word-family R2 credentials.** See build section: services must use the S3 stand-in's identity. Not a product defect, but it means the earlier word-family evidence was not reproduced with the same credentials.

### Not verified in round 4

- N2 (profile cache SET Lua-guarded by tombstone), N3 (wallet store generation guard), N5 (creator nullable): no dedicated live check. N4 and M1 are seen through F1 (no-op replay, `alreadyApplied` in bodies).
- C1 with the ban consumed on A specifically: not controllable (see row 2).
- F1 SUBTRACT with a negative amount is not sent (the modal now sends a positive amount with `direction`); the old negation path is gone.
- Redis-down degraded boot (N1): not run in this round.

### Concerns

- The C1 fix is verified against this harness's consumer assignment (10/10) and a standalone control. A longer soak under real load was not run.
- W1 is a 500 on a user-input collision; low severity but it is a visible error path.

## Final verification set (gate input)

`temper-raw.json` keeps every round (rounds 1-4, including the failed runs that found B1, B3-B5, N1, N2, C1, F1, W1). `temper-results.json` is built from `temper-final.json`: the `final:` static rows run by the coordinator on the FINAL code (after fix round 3: proto:gen, typecheck, build:all, BE unit 1869 passed, check:ownership 0 violations, check:deps 0 errors, FE build/lint/test 125, CI YAML) plus every passing `re-temper-4:` row (C1 reauth loop 10/10, cross-instance kick, harness control, F1 browser finance actions, N6 word-family R2, N1 cross-instance 3/3 before/after Redis restart, phase-09 matrix 64/64). Excluded round-4 rows: 239/240 (kick harness, superseded by 241 PASS), 243/244/246 (N6 harness credentials and fixture name, superseded by 247 PASS), 255 (live C1-C15 20/21: the one fail is C14b, a stale harness expectation of a numeric audit actorId; the fixed contract returns the admin's string id).
Fix round 3 (ChangeTier isActive no-op, kickUser local fallback, FE reason trim, W1 duplicate name -> 409) is covered by unit/e2e specs and the final static run, not by a further live round.
- Human sign-off: user approved "Ký duyệt + commit" on 2026-10-23, including the B2 interim AI debit keys until phase 15 (riskGate.humanSignedOff=true).
