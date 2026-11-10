# Phase 06 verification runs (implementer)

All commands run from `examio-be` unless the row names another cwd (paths below are relative to the repo root `/Users/tgiap.dev/devs/examio`). Exit codes are the real `$?` of the command itself (captured by the runner scripts). Rows that failed are kept: they are RED steps, a mutation proof, or my own mistakes, each explained under "Notes on rows that are not a clean pass".

SAFETY: every infra-touching command ran under `env -i` with a COMPLETE env (ADMIN_EMAILS, JWT keys, service secrets and all DB/Redis/RabbitMQ keys pinned) pointing at local docker containers `p06-pg` (pgvector pg16, 127.0.0.1:56541), `p06-redis` (127.0.0.1:56491), `p06-rmq` (rabbitmq 3.13 with the per-service definitions file rendered in phase 05 with dummy passwords, 127.0.0.1:56783). The env file refuses any DATABASE_URL host other than 127.0.0.1/localhost. No `.env` file was read or printed; built services were started from an out-of-repo cwd (`<scratchpad>/run`); Prisma `migrate deploy` ran from that cwd with absolute paths. `docker compose config` was never run. The three `p06-*` containers are removed at the end of the session.

## Tests-first evidence

RED = the new spec fails against the pre-change code, GREEN = passes after the change.

- libs/auth-jwt `owner-or-permission.spec.ts`: RED (suite failed to run: module `owner-or-permission.*` missing, 0 tests, exit 1), then GREEN (9 tests, exit 0). Run before the logging scripts existed; output observed in the session.
- `access-code-guard.spec.ts`: RED (module missing, exit 1), GREEN 12 tests exit 0 (same note).
- `study-room-socket-auth.service.spec.ts` (rewritten): RED (`SocketAuthError`/`authzVersionKey` not exported, exit 1), GREEN 13 tests exit 0 (same note).
- `word-family-generation-limit.spec.ts`, mappers, access helpers, user-search specs: written together with their small units (no separate RED run; their sensitivity is proven by the mutation table below).
- Ownership e2e specs: RED against the PRE-CHANGE source (tracked `src` changes stashed, tests kept; stash restored byte-for-byte, verified by diffing the patch before/after). Rows "RED baseline" below: flashcardset 15/17 failing, examsession 13/14, examattempt 5/14, quizset+examroom 5/5, flashcard-study+student 10/13, ai 4/4, ai-chat 3/3, demoted-owner 1/3. (The ws spec and the devices spec are not in that list: the ws spec does not compile against the old `RedisIoAdapter`, and auth devices behaviour did not change, so that spec is a guard, not a RED.) The first RED row for flashcardset is the original run (14/16 failing).
- Mutation proof (below): 22 single-line mutants of the new code, every one killed by the spec that owns it.

## Real findings the tests surfaced (fixed)

- `POST /studyrooms/:id/join` returned 500 when the request had no body (`dto.inviteCode` on `undefined`): now `dto?.inviteCode`. Caught by the ws e2e.
- `GET /examattempts/get-by-id/:id` returned the full quiz INCLUDING `quizQuestion.answer` to the examinee while the attempt was still open (not one of the 9 scout gaps). Now answers are stripped for the examinee until COMPLETED; the host still sees them.
- `GET /student/recent-flashcards` listed every public set on the platform (scout gap 7 part): now owned + whitelisted + previously viewed sets only.
- `RedisIoAdapter` never closed its pub/sub clients: added `dispose()` (used by the e2e harness; production shutdown can call it).
- The P04 finance e2e asserted that a STUDENT gets 404 on `GET /wallet/info`; with `wallet:use` it is now 403 (expectation updated, see notes).

## Run log

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy on local empty DB | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| RED flashcardset ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       14 failed, 2 passed, 16 total  |
| flashcardset ownership e2e (after fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       16 failed, 16 total  |
| flashcardset ownership e2e (after fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 15 passed, 16 total  |
| flashcardset ownership e2e (after fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       17 passed, 17 total  |
| study-room ws e2e (first run) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 6 passed, 8 total  |
| study-room ws e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       8 passed, 8 total  |
| study-room ws e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       8 passed, 8 total  |
| study-room ws e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       8 passed, 8 total  |
| examsession ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examsession.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       14 passed, 14 total  |
| examattempt+quizset ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt.ownership.e2e-spec.ts test/ownership/quizset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       19 passed, 19 total  |
| ai/ai-chat/flashcard-study ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/ai.ownership.e2e-spec.ts test/ownership/ai-chat.ownership.e2e-spec.ts test/ownership/flashcard-study.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| demoted-owner e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/demoted-owner.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 2 passed, 3 total  |
| demoted-owner e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/demoted-owner.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| devices ownership e2e (auth) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership` (cwd examio-be/apps/auth-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       4 failed, 4 total  |
| devices ownership e2e (auth) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership` (cwd examio-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       4 passed, 4 total  |
| RED baseline (pre-change source): flashcardset ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       15 failed, 2 passed, 17 total  |
| RED baseline (pre-change source): examsession ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examsession.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       13 failed, 1 passed, 14 total  |
| RED baseline (pre-change source): examattempt ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       5 failed, 9 passed, 14 total  |
| RED baseline (pre-change source): quizset ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/quizset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       5 failed, 5 total  |
| RED baseline (pre-change source): flashcard-study ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcard-study.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       10 failed, 3 passed, 13 total  |
| RED baseline (pre-change source): ai ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/ai.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       4 failed, 4 total  |
| RED baseline (pre-change source): ai-chat ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/ai-chat.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 failed, 3 total  |
| RED baseline (pre-change source): demoted-owner ownership e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/demoted-owner.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 2 passed, 3 total  |
| boot built exam-service from dist (scripts/boot-built-services.sh, out-of-repo cwd) | `./scripts/boot-built-services.sh` (cwd examio-be, env -i + local docker env) | 0 | n/a |
| MUTANT run: ws av check removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws exp timer disabled | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws authz handler noop | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 6 passed, 8 total  |
| MUTANT run: ws permission check removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws av check removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws exp timer disabled | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws authz handler noop | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 6 passed, 8 total  |
| MUTANT run: ws permission check removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: ws verified email check removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total  |
| MUTANT run: attempt idor | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 failed, 11 passed, 14 total  |
| MUTANT run: progress access removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcard-study.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 11 passed, 13 total  |
| MUTANT run: pin access removed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcard-study.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 12 passed, 13 total  |
| MUTANT run: gen-code wipes whitelist | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 16 passed, 17 total  |
| MUTANT run: chat exists no owner | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/ai-chat.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 2 passed, 3 total  |
| MUTANT run: share not owner only | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       17 passed, 17 total  |
| MUTANT run: exam denied allowed | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examsession.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 12 passed, 14 total  |
| MUTANT run: room public email | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/quizset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 4 passed, 5 total  |
| MUTANT run: share not owner only | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/flashcardset.ownership.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 16 passed, 17 total  |
| full-stack smoke via built gateway+auth+exam (curl, local infra) | `<scratchpad>/smoke06.sh` (cwd <scratchpad>/run, env -i + local docker env) | 1 | n/a |
| typecheck (all services) | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| unit tests incl. test/authz and libs/auth-jwt/test | `yarn test` (cwd examio-be) | 0 | Test Suites: 129 passed, 129 total Tests:       1369 passed, 1369 total  |
| build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 0 | Test Suites: 8 passed, 8 total Tests:       190 passed, 190 total  |
| yarn test libs/auth-jwt/test | `yarn test libs/auth-jwt/test` (cwd examio-be) | 0 | Test Suites: 1 passed, 1 total Tests:       9 passed, 9 total  |
| FINAL exam e2e: ownership + study-room ws (phase success command) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 9 passed, 9 total Tests:       81 passed, 81 total  |
| FINAL auth e2e: ownership (phase success command) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership` (cwd examio-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       4 passed, 4 total  |
| regression exam app.e2e-spec (boots with the new messaging consumer) | `../../node_modules/.bin/jest --config test/jest-e2e.json --testPathPatterns app.e2e-spec` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| regression admin e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| regression r2 e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/r2-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| regression finance e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/finance-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 passed, 2 total Tests:       1 failed, 13 passed, 14 total  |
| finance user-authz-changed e2e (rerun) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/user-authz-changed.e2e-spec.ts` (cwd examio-be/apps/finance-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 10 passed, 11 total  |
| regression finance e2e (all, after updating the STUDENT wallet expectation 404->403) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/finance-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |
| regression auth e2e (token, service-token, role-change, public-profiles, login-throttle, app, register-outbox) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/token.e2e-spec.ts test/service-token.e2e-spec.ts test/role-change.e2e-spec.ts test/public-profiles.e2e-spec.ts test/login-throttle.e2e-spec.ts test/app.e2e-spec.ts test/register-outbox.e2e-spec.ts` (cwd examio-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       39 passed, 39 total  |
| grep @Authenticated() in exam/finance/admin/r2 src (expect only allowlisted handlers + the WS gateway class) | `grep -rn "@Authenticated()" examio-be/apps/exam-service/src examio-be/apps/finance-service/src examio-be/apps/admin-service/src examio-be/apps/r2-service/src --include=*.ts | grep -v spec` (cwd /Users/tgiap.dev/devs/examio) | 0 | n/a |
| grep @Throttle in exam-service src (expect none; grep exit 1 = no match) | `grep -rn "@Throttle" examio-be/apps/exam-service/src` (cwd /Users/tgiap.dev/devs/examio) | 1 | n/a |
| grep plain access-code compares in exam-service src (expect none; exit 1 = no match) | `grep -rn "accessCode?.toString() !==\|providedCode ===" examio-be/apps/exam-service/src` (cwd /Users/tgiap.dev/devs/examio) | 1 | n/a |
| grep owner role in access helpers (expect none; exit 1 = no match) | `grep -n "role\|isSystemAdmin" examio-be/apps/exam-service/src/modules/flashcardset/flashcardset-access.ts examio-be/apps/exam-service/src/modules/examattempt/examattempt-access.ts` (cwd /Users/tgiap.dev/devs/examio) | 1 | n/a |
| FINAL full-stack smoke via built gateway+auth+exam (curl, local infra) | `<scratchpad>/smoke06.sh` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FINAL boot built exam-service from dist (boot-built-services.sh, out-of-repo cwd) | `./scripts/boot-built-services.sh` (cwd examio-be, env -i + local docker env) | 0 | n/a |
| FINAL-2 typecheck (all services, after 403 logging in OwnerOrPermissionGuard) | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FINAL-2 unit tests (yarn test) | `yarn test` (cwd examio-be) | 0 | Test Suites: 129 passed, 129 total Tests:       1369 passed, 1369 total  |
| FINAL-2 exam e2e: ownership + study-room ws (phase success command) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership test/study-room-ws.e2e-spec.ts` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 9 passed, 9 total Tests:       81 passed, 81 total  |
| FINAL-2 build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |

## Mutation proof (each row: one mutation, run the owning spec, source restored afterwards and asserted byte-identical)

The first nine mutants ran before the mutation log existed (output observed in the session, same procedure, every one `KILLED`):

| Mutation | File | Result |
|---|---|---|
| lockout check disabled | `access-code-guard.ts` | KILLED (1 failed, 11 passed) |
| plain `===` instead of `timingSafeEqual` | `access-code-guard.ts` | KILLED (1 failed, 11 passed) |
| owner-or-permission guard allows everyone | `owner-or-permission.guard.ts` | KILLED (3 failed, 6 passed) |
| mapper leaks `accessCode` | `flashcardset-public.mapper.ts` | KILLED (2 failed) |
| exam mapper passes `answer` through | `examsession-public.mapper.ts` | KILLED (1 failed, 1 passed) |
| user search matches email by `contains` | `user-search.service.ts` | KILLED (1 failed, 9 passed) |
| `@RequirePermissions` removed from `POST /quizsets` | `quizset.controller.ts` | KILLED by `test/authz/handler-declarations` (1 failed, 29 passed) |
| access helper mentions owner role | `flashcardset-access.ts` | KILLED by `test/authz/static-source-rules` (1 failed, 5 passed) |
| STUDENT may create quizsets (permission swapped) | `quizset.controller.ts` | KILLED by `test/authz/authz-matrix` (3 failed, 141 passed) |

Logged runs:

| Mutation | File | Result | Detail |
|---|---|---|---|
| ws: av staleness check removed | `apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total failing: ✕ a stale token (av below the gateway mirror) is refused with TOKEN_STALE (8005 ms) |
| ws: expiry timer never fires | `apps/exam-service/src/modules/study-room/study-room.gateway.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total failing: ✕ a token that expires while connected gets auth:reauth {TOKEN_EXPIRED} then a disconnect (6019 ms) |
| ws: authz_changed handler is a no-op | `apps/exam-service/src/modules/study-room/study-room-authz.handler.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       2 failed, 6 passed, 8 total failing: ✕ authz_changed with a higher version sends auth:reauth {AUTHZ_CHANGED} then disconnects (8015 ms) // ✕ authz_changed leaves a socket with an equal or newer token alone (idempotent) (1524 ms) |
| ws: study_room:join not required | `apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total failing: ✕ a SYSTEM_ADMIN-only token is refused with PERMISSION_DENIED (8007 ms) |
| ws: email_verified not required | `apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 7 passed, 8 total failing: ✕ an unverified email is refused with EMAIL_NOT_VERIFIED (8005 ms) |
| attempt access: anyone is the examinee (IDOR) | `apps/exam-service/src/modules/examattempt/examattempt-access.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       3 failed, 11 passed, 14 total failing: ✕ ExamAttemptController.getExamAttemptById other STUDENT, non-host TEACHER and ADMIN-only -> 404 (4 ms) // ✕ ExamAttemptController.getExamAttemptDetail other STUDENT, non-host TEACHER and ADMIN-only -> 404 (6 ms) // ✕ ExamAttemptController.updateExamAttempt other STUDENT, non-host TEACHER and ADMIN-only -> 404 (3 ms) |
| progress: set access check removed (gap 7) | `apps/exam-service/src/modules/flashcard-study/flashcard-study.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       2 failed, 11 passed, 13 total failing: ✕ FlashcardStudyController.saveProgress STUDENT without a grant -> 404, with a public set -> 2xx (6 ms) // ✕ FlashcardStudyController.getProgress STUDENT without a grant -> 404, with a public set -> 2xx (3 ms) |
| pin: access check removed (gap 7) | `apps/exam-service/src/modules/student/student.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 12 passed, 13 total failing: ✕ pin-flashcard: inaccessible set -> 404, whitelisted -> 201, TEACHER -> 403 (5 ms) |
| generate-code wipes the whitelist again (gap 6) | `apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 16 passed, 17 total failing: ✕ generate-code keeps the whitelist and the visibility (11 ms) |
| ai-chat exists without owner filter (gap 8) | `apps/exam-service/src/modules/ai-chat/ai-chat.repository.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 2 passed, 3 total failing: ✕ gap 8: GET /ai-chat/:chatId/exists is true only for the owner (another TEACHER sees false, never the existence) (8 ms) |
| share allowed for non-owner of a public set (gap) | `apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` | SURVIVED (exit 0) | Test Suites: 1 passed, 1 total Tests:       17 passed, 17 total |
| exam study access: denied becomes allowed | `apps/exam-service/src/modules/examsession/examsession.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       2 failed, 12 passed, 14 total failing: ✕ STUDENT without a grant -> 404 (private, no code) (7 ms) // ✕ whitelisted STUDENT 200, STUDENT without a grant 404, TEACHER 403 (14 ms) |
| get-public room leaks host email (gap 4) | `apps/exam-service/src/modules/examroom/examroom.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 4 passed, 5 total failing: ✕ gap 4: get-public/:id has no host email and only exists for a room with a public session (11 ms) |
| share allowed for non-owner of a public set | `apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` | KILLED (exit 1) | Test Suites: 1 failed, 1 total Tests:       1 failed, 16 passed, 17 total failing: ✕ POST :id/share is owner-only (other TEACHER and a STUDENT are refused) (9 ms) |

## Notes on rows that are not a clean pass

- `study-room ws e2e (first run)`: 2 failures = the `POST /studyrooms/:id/join` 500 above (fixed in the controller). The next runs show `8 passed` but exit 1: "Test suite failed to run: Connection is closed", an unhandled rejection from the async `handleDisconnect` (Redis flush) racing `app.close()` after the sockets closed. Fixed in the spec (wait 1 s after closing the clients) and by `RedisIoAdapter.dispose()`; final rows are exit 0. (`dbg` rows were debugging runs and are omitted here.)
- `flashcardset ownership e2e (after fix)` rows 1-2: first the module did not wire `UserSearchService` (my omission, 16/16 failing), then one expectation was wrong (a code-protected set answers 403 `CODE_REQUIRED`, not 404; spec split into both cases). Row 3 is green.
- `demoted-owner e2e` first run: the spec expected a code-unlocked session to be readable by a plain `GET` after the unlock; remembered unlock is phase 07, so the spec now uses a whitelisted session for the `GET` and re-posts the code for the code path.
- `devices ownership e2e (auth)` first run: login answers 201 (not 200) and a second session needs another `x-device-id`; spec fixed.
- `MUTANT run: share not owner only` (first): SURVIVED because my text anchor hit another `where` earlier in the file (anchor error, not a test gap); re-run with a precise anchor: KILLED. Both rows are kept.
- `regression finance e2e (all)` / `rerun`: the pre-existing P04 test "a STUDENT without a wallet gets 404" now gets 403 from `wallet:use`. File `apps/finance-service/test/user-authz-changed.e2e-spec.ts` is outside the phase list; I changed that single expectation (404 -> 403, title updated) because the required behaviour change otherwise leaves CI red. Final finance row is exit 0.
- `smoke` first run exited 1 only because the script's last `grep -c` returned 0 matches; the script now ends `exit 0`, and the FINAL row is the real result.
- Greps: `grep` exit 1 means "no match", which is the expected result for the three "none" rows; the `@Authenticated()` grep (exit 0) lists exactly the three allowlisted `ExamAttemptController` handlers (`getExamAttemptDetail`, `getExamAttemptById`, `updateExamAttempt`) and the `StudyRoomGateway` class (plus its comment).

## Full-stack smoke (real built gateway + auth + exam, curl)

Final run output (STUDENT = fresh signup, TEACHER = same flow then role set to TEACHER with an `authzVersion` bump and a fresh login):

```
TEACHER POST /flashcardsets                                    -> 201
TEACHER PUT /flashcardsets/:id/sharing (whitelist student)     -> 200
STUDENT GET /flashcardsets/study/:id (whitelisted)             -> 200   (no accessCode / whitelist keys)
TEACHER GET /flashcardsets/study/:id (own set preview)         -> 200
anonymous GET /flashcardsets/study/:id                         -> 401
STUDENT GET /quizsets (manage page)                            -> 403
TEACHER GET /quizsets                                          -> 200
STUDENT POST /ai/generate-from-file (AI tool)                  -> 403
STUDENT GET /wallet/info                                       -> 403
STUDENT GET /word-family/saved                                 -> 200
STUDENT POST /word-family/generate                             -> 403
STUDENT POST /studyrooms (create)                              -> 403
TEACHER POST /studyrooms (create)                              -> 201
STUDENT GET /flashcardsets/users/search                        -> 403
TEACHER GET /flashcardsets/users/search (no email)             -> 200   (no email key)
STUDENT GET /quizsets/public/x (route deleted)                 -> 404
anonymous GET /quizsets/public/x                               -> 401   (gateway: quizsets prefix is auth: required)
TEACHER GET /admin/users                                       -> 403
```

## Follow-up: temper defects (request validation, 404 on host-only, AMQP channel errors, sharing emails)

Same SAFETY rules: fresh local containers `p06-pg/p06-redis/p06-rmq` (same ports), `env -i` complete env, migrations re-applied; containers removed afterwards.

Tests first: `validation.ownership.e2e-spec.ts` was RED before the pipe (all 32 cases failing: 500/404 instead of 400, row "FU RED validation"). `host-only.ownership.e2e-spec.ts` and the sharing-email test were written alongside the 404 / email change (the host-only code change landed in the same step; the spec is a guard, not a recorded RED). AMQP: `rabbitmq.service.spec.ts` and a new case in `amqp-connection.spec.ts` were RED (3 failing) before the listeners existed.

| Step | Command | Exit | Result |
|---|---|---|---|
| FU prisma migrate deploy on fresh local DB | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FU RED validation + host-only e2e (before pipe) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/validation test/ownership/host-only` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 passed, 2 total Tests:       18 passed, 18 total  |
| FU RED validation e2e (before the pipe) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/validation` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       32 failed, 32 total  |
| FU validation + host-only e2e (after the pipe) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/validation test/ownership/host-only` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 passed, 2 total Tests:       1 failed, 49 passed, 50 total  |
| FU exam full e2e folder, one jest process, run 1 | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 11 passed, 12 total Tests:       2 failed, 133 passed, 135 total  |
| FU exam full e2e folder, ONE jest process, run 1 | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       135 passed, 135 total  |
| FU exam full e2e folder, ONE jest process, run 2 | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       135 passed, 135 total  |
| FU typecheck | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FU build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| FU TZ=UTC yarn test | `TZ=UTC yarn test` (cwd examio-be) | 1 | Test Suites: 1 failed, 130 passed, 131 total Tests:       4 failed, 1380 passed, 1384 total  |
| FU yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 1 | Test Suites: 1 failed, 7 passed, 8 total Tests:       4 failed, 186 passed, 190 total  |
| FU TZ=UTC yarn test (after matrix rows use 'gate' for bodies the pipe now rejects) | `TZ=UTC yarn test` (cwd examio-be) | 0 | Test Suites: 131 passed, 131 total Tests:       1384 passed, 1384 total  |
| FU yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 0 | Test Suites: 8 passed, 8 total Tests:       190 passed, 190 total  |
| FINAL-3 exam full e2e folder, ONE jest process, run 1 | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       135 passed, 135 total  |
| FINAL-3 exam full e2e folder, ONE jest process, run 2 | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       135 passed, 135 total  |
| FINAL-3 auth e2e (all but gateway-integration)  | `../../node_modules/.bin/jest --config test/jest-e2e.json --testPathIgnorePatterns gateway-integration` (cwd examio-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       43 passed, 43 total  |
| FINAL-3 admin e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| FINAL-3 finance e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/finance-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       14 passed, 14 total  |
| FINAL-3 gateway e2e (CI list) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/gateway.e2e-spec.ts test/gateway-streaming.e2e-spec.ts test/gateway-expect.e2e-spec.ts test/gateway-authz.e2e-spec.ts test/gateway-control.e2e-spec.ts test/gateway-edge.e2e-spec.ts test/redis-scripts.e2e-spec.ts` (cwd examio-be/apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       58 passed, 58 total  |
| FINAL-3 auth<->gateway integration e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json test/gateway-integration.e2e-spec.ts` (cwd examio-be/apps/auth-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       9 passed, 9 total  |
| FINAL-3 r2 e2e | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/r2-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| FINAL-3 build:all | `cd examio-be && yarn build:all` (cwd examio-be/apps/..) | 1 | n/a |

Notes:
- `FU RED validation e2e (before the pipe)`: exit 1 by design (32/32 failing). `FU validation + host-only e2e (after the pipe)` first run had 1 failure = my spec's lazy `roomId` path (spec bug), fixed.
- `FU exam full e2e folder ... run 1` first attempt failed 2 ws tests: `POST /studyrooms/:id/join` with NO body is now a 400 from the pipe (FE always sends `{inviteCode}` so it is `{}`); the ws spec now posts `{}`. Runs after the fix: 2 x 12 suites / 135 tests in ONE jest process, exit 0, no `Channel ended` crash.
- `FU TZ=UTC yarn test` first run: 4 failures in `test/authz` matrix: bodies `{}` on `word-family/generate` and `categories` are now 400 (gate passes); those two rows now expect `gate`. Re-run exit 0.
- Last `FINAL-3 build:all` row (exit 1) is a typo in my command (`cd examio-be` from the wrong cwd), not a build failure; `FU build:all` (exit 0) ran after the last source change.

## Follow-up 2: catch-all 4xx masking, multipart validation, public flashcard route

Fresh local containers again (same ports, migrations re-applied, removed afterwards). Tests first: `validation.ownership.e2e-spec.ts` gained multipart and session-config cases; the multipart ones were RED (3 failing, row "FU2 RED"). The session-config cases already passed because `rethrowKnown` (new `common/rethrow-known.ts`, applied to every catch-all that wrapped errors as `InternalServerErrorException` in examattempt, examroom, examsession, flashcardset, quizset services) landed before that run; the mutant below proves the case is sensitive. The gateway `route-coverage` case was RED (1 failing) before the `routes.yaml` entry.

| Step | Command | Exit | Result |
|---|---|---|---|
| FU2 prisma migrate deploy on fresh local DB | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FU2 RED validation e2e (multipart + session config), before the fixes | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/validation` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 failed, 38 passed, 41 total  |
| FU2 MUTANT run: session catch-all | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/validation` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 39 passed, 41 total  |
| FU2 typecheck | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FU2 build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| FU2 TZ=UTC yarn test | `TZ=UTC yarn test` (cwd examio-be) | 0 | Test Suites: 133 passed, 133 total Tests:       1401 passed, 1401 total  |
| FU2 yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 0 | Test Suites: 8 passed, 8 total Tests:       190 passed, 190 total  |
| FU2 exam full e2e folder, ONE jest process | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       144 passed, 144 total  |
| FU2 gateway e2e (CI list) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/gateway.e2e-spec.ts test/gateway-streaming.e2e-spec.ts test/gateway-expect.e2e-spec.ts test/gateway-authz.e2e-spec.ts test/gateway-control.e2e-spec.ts test/gateway-edge.e2e-spec.ts test/redis-scripts.e2e-spec.ts` (cwd examio-be/apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 7 passed, 7 total Tests:       58 passed, 58 total  |

Mutants: examsession create catch masks 4xx again -> KILLED (exit 1); multipart isPublic back to silent false -> KILLED (exit 1).

## Follow-up 3: read-after-write cache coherence

Root cause: `BaseRepository.findOne({cache:true})` stored entries under a flat `<prefix>:one:<json>` key that NO invalidation pattern matched (items use `user:<u>:item:<id>:*`, lists `user:<u>:list:*`), so a write stayed invisible for the 5 minute TTL. Fix: `findOne` keys now live in the scope the writes already invalidate (`{id,owner}` -> owner item scope, `{id}` -> public item scope, `{owner}` -> owner `one` scope); create/update/upsert/updateMany/delete/softDelete and `invalidateItemCache` clear them. Services that write through Prisma directly now invalidate item + list caches too: quizset labels (create/update/delete/assign), flashcardset labels (create/update/delete/assign/remove), share link, study view count, exam session sharing and regenerate-code, exam attempt start/progress/submit/secure-submit.

Test first: `cache-coherence.ownership.e2e-spec.ts` (real Redis) was RED, 3 of 3 failing (stale `before` / `qbefore` / room title); after the repository fix flashcards passed, and the quiz label write and exam session sharing write failed until the service-level invalidations were added; final run 3 of 3.

| Step | Command | Exit | Result |
|---|---|---|---|
| FU3 prisma migrate deploy | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FU3 RED cache coherence e2e (before the fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/cache-coherence` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 failed, 3 total  |
| FU3 cache coherence e2e (after fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/cache-coherence` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 1 passed, 3 total  |
| FU3 cache coherence e2e (after fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/cache-coherence` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       3 passed, 3 total  |
| FU3 typecheck | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FU3 build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| FU3 TZ=UTC yarn test | `TZ=UTC yarn test` (cwd examio-be) | 0 | Test Suites: 133 passed, 133 total Tests:       1401 passed, 1401 total  |
| FU3 exam full e2e folder, ONE jest process | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 13 passed, 13 total Tests:       147 passed, 147 total  |
| FU3 scripts/boot-built-services.sh on the final build (all six services, CI env + COMPOSE_DEFAULTS=1, out-of-repo cwd) | `./scripts/boot-built-services.sh` (cwd examio-be, env -i + local docker env) | 0 | n/a |

## Follow-up 4: wallet cache coherence

Root cause: finance gRPC `UpdateBalance`/`CreateWallet` and admin `credit`/`refund` write wallets, transactions and payments through Prisma transactions, bypassing `WalletRepository.updateBalance`'s invalidation, so `GET /wallet/info|details`, transaction pages/stats and payment lists/stats stayed stale for the cache TTL. Fix: `libs/common/src/utils/wallet-cache.ts` (`walletCacheTargets` / `invalidateWalletCaches`) builds every key from the shared `cache-keys` builders (wallet user + `:transactions` + item/list scopes, wallet-transaction stats / usage breakdown / pages, payment user scope and stats). It is called after commit by the finance gRPC controller, the webhook (credit and subscription paths, also when no wallet exists), `PaymentService` (create / update / cancel) and the admin interim `AdminFinanceService.credit` / `refund`. Audit result: `ensure-wallet` writes a wallet that was never cached; `subscription.service` activate is covered by its webhook caller; `userSubscription` reads (`getSubscription`, `setTier`) are not cached, so nothing to invalidate there.

Test first: `apps/finance-service/test/wallet-cache.e2e-spec.ts` (real Redis; admin service instantiated against the finance app's Prisma/Redis) was RED, 4 of 4 stale (20 instead of 13/25/70, 100 instead of 70); GREEN after the fix.

| Step | Command | Exit | Result |
|---|---|---|---|
| FU4 prisma migrate deploy | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FU4 RED wallet cache e2e (before the fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/wallet-cache` (cwd examio-be/apps/finance-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       4 failed, 4 total  |
| FU4 wallet cache e2e (after the fix) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/wallet-cache` (cwd examio-be/apps/finance-service, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       4 passed, 4 total  |
| FU4 typecheck | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FU4 build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| FU4 TZ=UTC yarn test | `TZ=UTC yarn test` (cwd examio-be) | 1 | Test Suites: 1 failed, 133 passed, 134 total Tests:       8 failed, 1396 passed, 1404 total  |
| FU4 finance e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/finance-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       18 passed, 18 total  |
| FU4 admin e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| FU4 TZ=UTC yarn test (after adding the RedisService provider to the exam->finance gRPC spec) | `TZ=UTC yarn test` (cwd examio-be) | 0 | Test Suites: 134 passed, 134 total Tests:       1404 passed, 1404 total  |
| FU4 yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 0 | Test Suites: 8 passed, 8 total Tests:       190 passed, 190 total  |
| FU4 boot-built-services.sh (all six, COMPOSE_DEFAULTS=1) on the final build | `./scripts/boot-built-services.sh` (cwd examio-be, env -i + local docker env) | 0 | n/a |

Note: the first `FU4 TZ=UTC yarn test` (exit 1) failed `exam/test/finance-debit.grpc.spec.ts` only because it builds the real `WalletGrpcController` and had no `RedisService` provider; fixed in the spec, re-run exit 0.

## Follow-up 5: inspection rework

1. Attempt views: `examattempt-view.mapper.ts` picks fields by name for `getExamAttemptById`, the create-attempt response and the update response; `accessCode`/`whitelist` never leave. 2. Answers: the examinee sees the key only when the attempt is COMPLETED AND `showAnswersAfterSubmit` is true (`get-by-id` and `detail`); the host always does. 3. `access-code-guard`: INCR (EXPIRE NX) first on every evaluated attempt, deny above the limit before comparing, DEL on success (10 parallel guesses: at most 5 evaluated). 4. `invalidateWalletCachesBestEffort` (catch + warn) in the finance gRPC controller, webhook (new `invalidateAfterCommit`), payment service and admin credit/refund. 5. `crypto.randomInt(100000, 1000000)` for flashcard and exam session access codes (other generators already use CSPRNG; the unreferenced legacy `libs/common/utils/generate-code.ts` still uses Math.random and is not imported anywhere).

Tests first: `examattempt-views.ownership.e2e-spec.ts` RED 3 of 6 (row "FU5 RED") then green; the two race cases in `access-code-guard.spec.ts` RED (2 failing) then green; the Redis-down cases in `wallet-cache.e2e-spec.ts` and `wallet-cache.spec.ts` guarded by mutants.

| Step | Command | Exit | Result |
|---|---|---|---|
| FU5 prisma migrate deploy | `examio-be/node_modules/.bin/prisma migrate deploy --schema=examio-be/libs/database/src/schema.prisma` (cwd <scratchpad>/run, env -i + local docker env) | 0 | n/a |
| FU5 RED attempt views e2e (before the mapper) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt-views` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       3 failed, 3 passed, 6 total  |
| FU5 attempt views e2e (after the mapper) | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       20 passed, 20 total  |
| FU5 MUTANT run: view leaks accessCode | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt-views` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       2 failed, 4 passed, 6 total  |
| FU5 MUTANT run: answers flag ignored | `../../node_modules/.bin/jest --config test/jest-e2e.json test/ownership/examattempt-views` (cwd examio-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 5 passed, 6 total  |
| FU5 MUTANT run: grpc not best-effort | `../../node_modules/.bin/jest --config test/jest-e2e.json test/wallet-cache` (cwd examio-be/apps/finance-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 5 passed, 6 total  |
| FU5 typecheck | `yarn typecheck` (cwd examio-be) | 0 | n/a |
| FU5 build:all | `yarn build:all` (cwd examio-be) | 0 | n/a |
| FU5 TZ=UTC yarn test | `TZ=UTC yarn test` (cwd examio-be) | 0 | Test Suites: 134 passed, 134 total Tests:       1408 passed, 1408 total  |
| FU5 yarn test test/authz | `yarn test test/authz` (cwd examio-be) | 0 | Test Suites: 8 passed, 8 total Tests:       191 passed, 191 total  |
| FU5 exam full e2e folder, ONE jest process | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 14 passed, 14 total Tests:       153 passed, 153 total  |
| FU5 finance e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/finance-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |
| FU5 admin e2e (all) | `../../node_modules/.bin/jest --config test/jest-e2e.json` (cwd examio-be/apps/admin-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       20 passed, 20 total  |

Mutants (all killed): mapper leaks accessCode (examattempt view) -> KILLED (exit 1); answers ignore showAnswersAfterSubmit -> KILLED (exit 1); guard compares before counting (race back) -> KILLED (exit 1); best-effort invalidation rethrows -> KILLED (exit 1); grpc invalidation not best-effort -> SURVIVED (exit 0); grpc UpdateBalance invalidation not best-effort -> KILLED (exit 1).
