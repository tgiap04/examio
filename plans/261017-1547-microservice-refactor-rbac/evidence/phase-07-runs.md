# Phase 07 verification runs (implementer)

All commands run from the cwd named in the row (paths relative to the repo root `/Users/tgiap.dev/devs/kmaedu`). Exit codes are the real `$?` of the command (captured by the runner script `p07run.sh`). Rows that failed are kept: they are RED steps or my own mistakes, each explained under "Notes on rows that are not a clean pass".

SAFETY: every infra-touching command ran under `env -i` with a COMPLETE env (ADMIN_EMAILS, JWT keys, service secrets and every DB/Redis/RabbitMQ key pinned) pointing at local docker containers `p07-pg` (pgvector pg16, 127.0.0.1:57541), `p07-redis` (127.0.0.1:57491), `p07-rmq` (rabbitmq 3.13 with the per-service definitions rendered in phase 05, 127.0.0.1:57783). The env file refuses any DATABASE_URL host other than 127.0.0.1/localhost. No `.env` file was read or printed. Built services and Prisma ran from out-of-repo cwds (`<scratch>/run7`). The browser run blocked every non-localhost request (13 blocked: third-party scripts such as recaptcha/analytics). `docker compose config` was never run. The three `p07-*` containers are removed at the end of the session.

## Tests-first evidence

- RED (unit): new specs written before any implementation: `sharing-list.util.spec.ts`, `quizset-sharing.service.spec.ts`, `quizset-access.spec.ts`, `quiz-practice-scoring.spec.ts`, `quiz-practice.mapper.spec.ts` -> 5 suites failed to compile (modules missing), 0 tests, exit 1 (row "RED unit specs"). GREEN after implementation: 105 tests, exit 0.
- RED (e2e) against the PRE-CHANGE source: `src` changes stashed (`git stash push -u -- kmaedu-be/apps/exam-service/src`, patch md5 `fbf63d45e028a002d9a25a8a03af3b26` identical before and after the pop, 19 untracked files restored), then `test/quiz-practice.e2e-spec.ts`, `test/ownership/{quiz-practice,sharing,demoted-owner}.ownership.e2e-spec.ts`: **4 suites failed, 22 tests failed / 3 passed (the 3 passing are the old demoted-owner tests), exit 1**. Output: `/private/tmp/claude-501/-Users-tgiap-dev-devs-kmaedu/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/red-e2e.log`.
- GREEN: same specs on the new source (rows below).
- Mutation proof: 24 single-line mutants of the new code, every one KILLED by the owning spec after one extra test was added for the one that first survived (see table).

### Mutation table (`mutate7.py`: apply one text replacement, run the owning e2e specs, always restore the file)

| Mutant | Killed by |
|---|---|
| `remove` no longer evicts `codeGrantedIds` (delta SQL) | sharing.ownership: remove of a code-granted user |
| rotate (`generate-code`) keeps `codeGrantedIds` (quiz) | quiz-practice e2e rotate + sharing.ownership |
| pre-submit question view adds the `answer` key | quiz-practice e2e (no answer fields) x2 |
| `unlock` does not remember the user | quiz-practice e2e (7 tests) |
| history list not scoped to the caller | quiz-practice.ownership listAttempts |
| attempt read not owner-scoped | quiz-practice.ownership getAttempt + saveAttempt |
| autosave not owner-scoped | quiz-practice.ownership saveAttempt |
| start skips the grant check | quiz-practice.ownership startAttempt |
| second submit allowed | quiz-practice e2e (double submit 409) |
| disable code keeps `codeGrantedIds` | quiz-practice e2e + sharing.ownership |
| cap check removed (delta) | sharing.ownership (409 SHARE_LIST_FULL) |
| append ignores the cap | sharing.ownership (append at 2000) |
| append ignores the verified code (rotate-during-unlock TOCTOU) | **first SURVIVED**; added test "a code that rotated between the check and the write grants nothing", then KILLED |
| flashcard `with-code` does not remember | sharing.ownership flashcard code memory |
| flashcard rotate keeps grants | sharing.ownership x2 |
| exam `with-code` does not remember | sharing.ownership x2 |
| exam access ignores `codeGrantedIds` | sharing.ownership |
| `PUT /examsessions/:id` keeps grants on code change | sharing.ownership |
| `PUT /examsessions/:id/sharing` keeps grants on code change | sharing.ownership |
| `PUT /examsessions/:id/sharing` no 2000 cap | sharing.ownership |
| exam attempt start does not remember | sharing.ownership |
| exam `generate-code` keeps grants | sharing.ownership |
| score trusted from client (always 10) | quiz-practice e2e (score 3.33) |
| unlock lockout bypass (counter key changes per call) | quiz-practice e2e (5 wrong -> 429) |

## Run log

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy (baseline state, empty local DB) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| prisma migrate dev --create-only quiz_sharing (local throwaway DB) | `kmaedu-be/node_modules/.bin/prisma migrate dev --create-only --name quiz_sharing --schema=kmaedu-be/libs/database/src/schema.prisma --skip-generate` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| prisma migrate deploy (with quiz_sharing) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| prisma migrate diff --exit-code (drift check) | `kmaedu-be/node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel kmaedu-be/libs/database/src/schema.prisma --exit-code` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| prisma generate | `node_modules/.bin/prisma generate --schema=libs/database/src/schema.prisma` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| RED unit specs (impl modules missing) | `node_modules/.bin/jest apps/exam-service/src/modules/quiz-practice apps/exam-service/src/modules/quizset apps/exam-service/src/modules/common/sharing-list` (cwd kmaedu-be, env -i + local docker env) | 1 | Test Suites: 5 failed, 5 total Tests:       0 total  |
| GREEN unit specs (quiz-practice, quizset, sharing-list, access guard, flashcard access) | `node_modules/.bin/jest apps/exam-service/src/modules/quiz-practice apps/exam-service/src/modules/quizset apps/exam-service/src/modules/common apps/exam-service/src/modules/flashcardset` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 12 passed, 12 total Tests:       105 passed, 105 total  |
| RED/first e2e: quiz-practice + sharing + quiz-practice ownership | `../../node_modules/.bin/jest --config test/jest-e2e.json test/quiz-practice.e2e-spec.ts test/ownership/quiz-practice.ownership.e2e-spec.ts test/ownership/sharing.ownership.e2e-spec.ts` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 2 passed, 3 total Tests:       3 failed, 35 passed, 38 total  |
| e2e: quiz-practice + ownership/{quiz-practice,sharing} | `../../node_modules/.bin/jest --config test/jest-e2e.json test/quiz-practice.e2e-spec.ts test/ownership/quiz-practice.ownership.e2e-spec.ts test/ownership/sharing.ownership.e2e-spec.ts` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 3 passed, 3 total Tests:       38 passed, 38 total  |
| authz specs (handler-declarations, matrix, static rules) | `node_modules/.bin/jest test/authz apps/exam-service/test/authz-declarations.spec.ts` (cwd kmaedu-be, env -i + local docker env) | 1 | Test Suites: 1 failed, 7 passed, 8 total Tests:       1 failed, 249 passed, 250 total  |
| authz static rules | `node_modules/.bin/jest test/authz/static-source-rules.spec.ts` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 1 passed, 1 total Tests:       7 passed, 7 total  |
| yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| yarn test (full unit suite) | `yarn test --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 139 passed, 139 total Tests:       1518 passed, 1518 total  |
| exam-service e2e: whole folder (jest-e2e.json) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 17 passed, 17 total Tests:       193 passed, 193 total  |
| authz specs after final changes | `node_modules/.bin/jest test/authz apps/exam-service/test/authz-declarations.spec.ts --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       250 passed, 250 total  |
| unit specs after util split (exam-service modules) | `node_modules/.bin/jest apps/exam-service/src --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 32 passed, 32 total Tests:       302 passed, 302 total  |
| FINAL yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FINAL yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| FINAL yarn test (full unit suite) | `yarn test --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 139 passed, 139 total Tests:       1519 passed, 1519 total  |
| FINAL exam-service e2e: whole folder | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 17 passed, 17 total Tests:       193 passed, 193 total  |
| FINAL exam-service e2e: quiz-practice + ownership/{quiz-practice,sharing,demoted-owner} (the P07 command) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent test/quiz-practice.e2e-spec.ts test/ownership` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 15 passed, 15 total Tests:       182 passed, 182 total  |
| FINAL authz specs | `node_modules/.bin/jest test/authz apps/exam-service/test/authz-declarations.spec.ts --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       250 passed, 250 total  |
| FINAL prisma migrate diff --exit-code (drift) | `kmaedu-be/node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel kmaedu-be/libs/database/src/schema.prisma --exit-code` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| FINAL prisma migrate deploy on a fresh DB (all 4 migrations) | `docker exec p07-pg psql -U kmaedu -d postgres -c 'DROP DATABASE IF EXISTS kmaedu_fresh' -c 'CREATE DATABASE kmaedu_fresh' >/dev/null && DATABASE_URL=postgresql://kmaedu:kmaedu@127.0.0.1:57541/kmaedu_fresh kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| FINAL kmaedu-fe yarn build | `yarn build` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| FINAL kmaedu-fe yarn lint | `yarn lint` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| manual | built gateway+auth+exam smoke `smoke07.sh` (cwd <scratch>/run7, env -i + local docker env) | 0 | full quiz flow through the REAL gateway, output in `evidence/phase-07/gateway-smoke.txt` (anonymous `access` 401 at the gateway; 5th wrong unlock 429; start response has no answer keys; other student's attempt 404; TEACHER unlock 403; rotate evicts the code-granted student) |
| manual | headless Chrome against vite (5273) + built gateway/auth/exam (3580-3582), `ui7/run.cjs` (21 checks) | 0 (script exits 0 only when every check passed; the exit code was not captured by a wrapper, the 21/21 summary is in the output) | `evidence/phase-07/ui-browser-run.txt`; screenshots in `evidence/phase-07/ui-screens/` |
| manual | same stack, `ui7/run-fc.cjs` flashcard share dialog on the delta API (5 checks) | 0 (same note) | `evidence/phase-07/ui-browser-run-flashcard.txt` |
| grep | `grep -rn "Math.random" kmaedu-be/apps/exam-service/src/modules/{flashcardset,examsession,quizset}` | 1 (no match) | none |

## Notes on rows that are not a clean pass

- "RED unit specs": exit 1 is the expected RED (modules missing).
- "RED/first e2e": 3 failures were mistakes in my own test (whitelist expectation after `removeUserIds` also removes from the whitelist by design; the cap test used ids that are not real users and the server drops those). Fixed in the specs, then green.
- "authz specs (handler-declarations, matrix, static rules)" exit 1: the phase-06 static rule asserted that `generateAccessCode()` lived in the flashcard/exam services with `randomInt(100000, 1000000)`. The generator now lives once in `access-code-guard.ts` (`randomInt(0, 1_000_000)` zero-padded); the rule was rewritten to assert one generator, no `Math.random` in the three sharing modules, and the services calling it. Next row is green.
- The browser run needed a 65 s pause (and a login retry) because the gateway limits `GET /auth/me` to 100/min and logins per client; without it the FE's 429 on `/auth/me` sends the page to `/login` (pre-existing FE behaviour on a 429, P09 may want to treat it differently).
- Interim e2e/jest runs not wrapped by `p07run.sh` (the mutation runs, the RED stash run and the four first e2e checks) are recorded in `/private/tmp/claude-501/-Users-tgiap-dev-devs-kmaedu/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/mutations7.log` (batch 2 only: the first batch of 8 was overwritten by my own `: >` reset, its KILLED lines are in the table above) and `/private/tmp/claude-501/-Users-tgiap-dev-devs-kmaedu/7ab92c2f-a17b-4d9b-bd0b-11e5945d7f4b/scratchpad/red-e2e.log`.


## Addendum: gateway routes.yaml change (coordinator-approved)

Change: `quizset-user-search` rate limit (GET /api/v1/quizsets/users/search, 30 per 60 s, keyed like the other users/search limits) and a `public` entry on the `quiz-practice` route for `GET /api/v1/quiz-practice/sets/[^/]+/access` only (the real path is `/quiz-practice/sets/:id/access`, not `/quiz-practice/:id/access`); all other quiz-practice paths stay `auth: required`. Tests first: `route-coverage.spec.ts` (new rate-limit row + auth-optional/required matrix) was RED (2 failed) before the yaml edit, and `gateway-authz.e2e-spec.ts` has a new test (garbage token on `access` is stripped and answers 200, anonymous 200, `sets` and `attempts/:id` stay 401); against the OLD yaml it fails (row "RED gateway e2e"). Containers were recreated (`p07-*`, same ports) and removed again afterwards.

| Step | Command | Exit | Result |
|---|---|---|---|
| prisma migrate deploy (fresh DB, 4 migrations, round 2) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| gateway unit: route-coverage + route-inventory (incl. new rows) | `node_modules/.bin/jest apps/gateway-service/test/route-coverage.spec.ts apps/gateway-service/test/route-inventory.spec.ts --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 2 passed, 2 total Tests:       234 passed, 234 total  |
| gateway-service e2e: whole folder (jest-e2e.json, broker user gateway) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/gateway-service, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       62 passed, 62 total  |
| RED gateway e2e gateway-authz against the OLD routes.yaml (expected failure) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent test/gateway-authz.e2e-spec.ts` (cwd kmaedu-be/apps/gateway-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 1 total Tests:       1 failed, 8 passed, 9 total  |
| exam-service e2e: whole folder (after routes.yaml change) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 17 passed, 17 total Tests:       193 passed, 193 total  |
| yarn typecheck (after routes.yaml change) | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| yarn test (unit, after routes.yaml change) | `yarn test --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 139 passed, 139 total Tests:       1521 passed, 1521 total  |
| prior | route-coverage RED before the yaml edit | 1 | Tests: 2 failed, 232 passed (run in the session before the edit, not wrapper-logged) |


## Addendum 2: spec-required unit tests, coverage, FE lint attribution

New specs (all passed on the first run, 81 tests in 9 suites for the touched dirs): `quiz-practice.service.spec.ts` (start/resume, no grant 404, owner, owner-or-`quiz:practice` declaration + TEACHER lacks the permission, unlock delegates to the lockout guard and remembers only on success, access reasons, listSets query shape), `quiz-practice-attempt.service.spec.ts` (autosave guard: owner + `isSubmitted:false` in the where, 404 vs 409 ALREADY_SUBMITTED, submit under row lock scoring from stored answers with unknown ids ignored, double submit 409, no answer keys pre-submit, history scoped to the caller), `quiz-practice.repository.spec.ts`, `quizset-owner.resolver.spec.ts`, `sharing-view.util.spec.ts` (no email, four-field select, one batch query). The pre-submit mapper spec already existed.

Coverage (focused `--collectCoverageFrom`, TZ=UTC): quiz-practice.service.ts 100% lines, quiz-practice-attempt.service.ts 100%, quizset-owner.resolver.ts 100%, quiz-practice.repository.ts 100%, sharing-view.util.ts 100%, quizset-sharing.service.ts 100%, quizset-access.ts 100%, sharing-list.util.ts 97.4%, quiz-practice.controller.ts 92.6%; all files 98.8% lines.

FE lint attribution (baseline = `git show HEAD:<file> | eslint --stdin`): ManageQuizSetDetailPage.tsx has the same 4 warnings at HEAD (`updateQuestion` unused, 3x missing `invalidateLabelQuestionsCache` dep; only line numbers moved by my 2 added lines), MyMaterialsPage.tsx has the same 1 warning at HEAD (`flashcardsLoading` unused, line 376 -> 231 after I removed the ShareDialog). Phase 07 introduced none, so they are left alone (unrelated code, out of scope). Total stays 32 warnings, 0 errors.

| Step | Command | Exit | Result |
|---|---|---|---|
| TZ=UTC yarn test:cov (focused collectCoverageFrom on the P07 files) | `TZ=UTC yarn test:cov --silent --coverageDirectory=<scratch>/cov7 --collectCoverageFrom='apps/exam-service/src/modules/quiz-practice/*.ts' --collectCoverageFrom='apps/exam-service/src/modules/quizset/quizset-owner.resolver.ts' --collectCoverageFrom='apps/exam-service/src/modules/quizset/quizset-access.ts' --collectCoverageFrom='apps/exam-service/src/modules/quizset/quizset-sharing.service.ts' --collectCoverageFrom='apps/exam-service/src/modules/common/sharing-*.ts' --collectCoverageFrom='!**/*.spec.ts' --collectCoverageFrom='!**/*.module.ts' --collectCoverageFrom='!**/dto/**'` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 144 passed, 144 total Tests:       1563 passed, 1563 total  |
| kmaedu-fe yarn build (coverage round) | `yarn build` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| kmaedu-fe yarn lint (coverage round) | `yarn lint` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |


## Addendum 3: inspection REWORK fixes

Fixed (tests first, RED recorded below):
1. HIGH: an OPEN attempt now needs the grant to still hold (`QUIZ_SET_ACCESS_SELECT` + `accessKindOf`, else 404) on get, save and submit (submit checks inside the row-locked transaction). Submitted attempts stay readable. e2e: code rotated, code disabled, whitelist removal, public made private -> GET/PUT/submit 404, no key in any body, row untouched; submitted attempt still readable after access is lost.
2. MEDIUM: `unlock` still checks the code (lockout) but mints no code grant when the caller already has access (owner/public/whitelist). New delta field `removeCodeGrantedIds` removes from the code-granted list ONLY; `removeUserIds` keeps its old meaning (whitelist and code list). FE `sharing-delta.ts` sends the code-list removals through the new field.
3. MEDIUM: submit freezes the per-question result in a new `QuizPracticeAttempt.resultSnapshot Json?` column (question text, options, pick, key, verdict); `GET attempt` serves the snapshot (legacy rows without one fall back to re-scoring). Because the previous migration was never committed I regenerated it in place: `20261020132225_quiz_sharing` now includes `resultSnapshot` (fresh-DB deploy and drift check are in the table).
4. LOW: anonymous `GET sets/:id/access` on a code-protected set returns only `{ canAccess:false, requiresCode:true, reason:null }`.
5. LOW: a single-letter stored key is a position (letter-first matching for key and pick, FE result view the same). Note: for pickers that send letters (the page) scoring outcomes are unchanged; the change removes the ambiguity when an option text is itself a single letter.
6. LOW: the allowlist comment now says `startAttempt` is `@RequireOwnerOrPermission` (owner or `quiz:practice` plus a grant) and the other four are plain `@Authenticated()` + owner-in-where + still-granted; the entry set was already right (handler-declarations passes).

Mutation retest of the new behaviour (all KILLED): submit/save/get skip the still-granted check, snapshot ignored (first attempt at that mutant only failed to compile, redone so that it compiles), unlock mints code grants for whitelisted users, `removeCodeGrantedIds` also strips the whitelist, anonymous access leaks the title.

RED before the fix (same specs, unfixed source): quiz-practice e2e 1 failed (snapshot), sharing.ownership 3 failed, quiz-practice.ownership 5 failed (4 revoked-access scenarios + anonymous access); output in the session, e2e row "rework RED" below (4 failed there because the ownership spec did not compile until a type fix; the second run showed the 5).

| Step | Command | Exit | Result |
|---|---|---|---|
| rework: migrate deploy of the 3 committed migrations (fresh DB) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| rework: prisma migrate dev --create-only quiz_sharing (regenerated, now with resultSnapshot) | `kmaedu-be/node_modules/.bin/prisma migrate dev --create-only --name quiz_sharing --schema=kmaedu-be/libs/database/src/schema.prisma --skip-generate` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| rework: migrate deploy (with regenerated quiz_sharing) | `kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| rework: prisma generate | `node_modules/.bin/prisma generate --schema=libs/database/src/schema.prisma` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| rework RED: new e2e against the unfixed source (expected failures) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent test/quiz-practice.e2e-spec.ts test/ownership/quiz-practice.ownership.e2e-spec.ts test/ownership/sharing.ownership.e2e-spec.ts` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 3 failed, 3 total Tests:       4 failed, 31 passed, 35 total  |
| rework: exam-service e2e whole folder (one process) | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 1 | Test Suites: 1 failed, 16 passed, 17 total Tests:       182 passed, 182 total  |
| rework: yarn typecheck | `yarn typecheck` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| rework: yarn build:all | `yarn build:all` (cwd kmaedu-be, env -i + local docker env) | 0 | n/a |
| rework: exam-service e2e whole folder (one process), run 2 | `../../node_modules/.bin/jest --config test/jest-e2e.json --silent` (cwd kmaedu-be/apps/exam-service, env -i + local docker env) | 0 | Test Suites: 17 passed, 17 total Tests:       203 passed, 203 total  |
| rework: TZ=UTC yarn test (full unit suite) | `TZ=UTC yarn test --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 144 passed, 144 total Tests:       1578 passed, 1578 total  |
| rework: yarn test test/authz | `yarn test test/authz --silent` (cwd kmaedu-be, env -i + local docker env) | 0 | Test Suites: 8 passed, 8 total Tests:       250 passed, 250 total  |
| rework: prisma migrate diff --exit-code (drift) | `kmaedu-be/node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel kmaedu-be/libs/database/src/schema.prisma --exit-code` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| rework: prisma migrate deploy on a fresh DB (4 migrations) | `docker exec p07-pg psql -U kmaedu -d postgres -c 'DROP DATABASE IF EXISTS kmaedu_fresh2' -c 'CREATE DATABASE kmaedu_fresh2' >/dev/null && DATABASE_URL=postgresql://kmaedu:kmaedu@127.0.0.1:57541/kmaedu_fresh2 kmaedu-be/node_modules/.bin/prisma migrate deploy --schema=kmaedu-be/libs/database/src/schema.prisma` (cwd <scratch>/run7, env -i + local docker env) | 0 | n/a |
| rework: kmaedu-fe yarn build | `yarn build` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| rework: kmaedu-fe yarn lint | `yarn lint` (cwd kmaedu-fe, env -i + local docker env) | 1 | n/a |
| rework: kmaedu-fe yarn build (after lint fix) | `yarn build` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| rework: kmaedu-fe yarn lint (after lint fix) | `yarn lint` (cwd kmaedu-fe, env -i + local docker env) | 0 | n/a |
| grep | `grep -rn "Math.random" kmaedu-be/apps/exam-service/src/modules/{flashcardset,examsession,quizset}` | 1 (no match) | none |
