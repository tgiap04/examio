# Phase 12 tempering runs (study-room-service + vocabulary-service)

Raw rows: `evidence/phase-12/temper-raw.json` (`temper-1:` static rows, `temper-2:` live rows). Scratch logs stay in the tester scratchpad and are deleted at teardown (see Teardown).

## Scope contract

- **Changed:** `apps/study-room-service` (new), `apps/vocabulary-service` (new), exam-service word-family bridge and flashcardset module, gateway routes, compose topology (`deploy/compose/study-room.yml`, `vocabulary.yml`), RabbitMQ definitions, CI workflow (RabbitMQ wait), auth `SERVICE_AUDIENCES` (F1 fix).
- **Impacted:** gateway routing for `/api/v1/word-family`, `/api/v1/studyrooms`, `/ws/study`; exam-to-vocabulary gRPC; service tokens; broker bindings; per-service DB roles; R2 deletes for category images; admin word-family API.
- **Will verify (safety-critical, so full):** migrations and drift for six schemas, service e2e folders, db isolation, compose bring-up from an empty volume, opt-in seed, live auth/permission paths (403 and 401 checks), broker bindings, WS authz and ban, R2 delete drain, browser matrix.
- **Deliberately skipped:** mobile (not in scope), real AI generation (no AI key; reached-and-recorded only), production deploy, `deploy_default` network (not created by this run, left alone).

## Method

- Scratch copy of `kmaedu-be` at `scratchpad/p12t/repo` (rsync, excludes node_modules, dist, every real env file; post-copy check: 0 real env files). Dummy `deploy/.env` generated in the copy only, values never printed.
- Throwaway infra on 127.0.0.1 only, `env -i`, container names `p12t-*`, no volumes for the stage-2 infra.
- Live stack: compose project `p12t`, empty volume, sequential builds (one `docker compose build` at a time), loopback gateway port 6369, s3proxy plus nginx shim as R2 (`kmaedu-p12t` bucket), Turnstile stand-in on the internal network under the real verify hostname, scratch CA mounted into auth only.
- Each step recorded through `rec12` with the real process exit code. Failed rows are kept; re-runs are new labelled rows.
- Seed data used by live checks (word family `run`, one foreign card with the identical question) was inserted with the owning service role. These are scratch rows, destroyed with the stack.

## temper-1 static summary (final code, before live stages)

All exit 0: proto-gen, prisma-generate, typecheck, full unit suite, check:deps, check:ownership, build:all (sequential), compose-topology spec, render-definitions spec, both success-criteria greps. Earlier `ci-prepare-env` exit 1 (Node.js v24 mismatch in the first attempt) was re-run with exit 0.

## RabbitMQ cookie race (why the first temper hung, and the CI fix)

- Root cause: `docker exec <rabbit> rabbitmq-diagnostics ...` run as root before the server has written `/var/lib/rabbitmq/.erlang.cookie` creates the cookie owned by root. The server then dies with `Error when reading /var/lib/rabbitmq/.erlang.cookie: eacces`. Reproduced 6/6 as root, 3/3 OK as `rabbitmq`.
- Fix: `.github/workflows/ci.yml` (RabbitMQ wait, backend e2e job) now calls `docker exec -u rabbitmq rabbitmq rabbitmq-diagnostics -q ping`. The scratch harness uses the same form (`wait-rabbit`).

## Stages

### Stage 2: e2e against throwaway containers (127.0.0.1)

| Step | Exit | Result |
|---|---|---|
| migrate deploy x6 (auth, finance, admin, exam, studyroom, vocabulary) | 0 x6 | all applied |
| migrate diff (drift) x6 | 0 x6 | "No difference detected" x6 (first attempt exit 2 was my harness: diff did not set `DATABASE_URL` like CI; fixed, re-run recorded) |
| study-room e2e folder | 0 | 4 suites, 22/22 |
| vocabulary e2e folder | 0 | 4 suites, 19/19 |
| exam e2e folder as exam_svc | 1, then 0 | first run: 213 failed, all `QUIZ_JWT_SECRET environment variable is required` (harness: CI top-level env missing from my env file). Re-run with the CI env: 18 suites, 213/213 |
| gateway e2e (7 files) | 0 | 7 suites, 60/60 |
| db-isolation, CI=true | 0 | 5 suites, 46/46 (migrations-and-seeds, r2-delete-worker, db-isolation, exam-r2-delete, r2-delete) |

Stage 2 totals: 360 tests executed in the e2e folders above (plus one red row that was a harness env gap, not a product failure).

### Stage 3: live stack from an empty volume

| Item | Exit | Result |
|---|---|---|
| 16 image builds, sequential | 0 x16 | all built (auth/finance/admin/exam/study-room/vocabulary + migrate images, gateway, r2, ai, seed) |
| `up -d --wait` from an empty volume | 0 | healthy in 36 s |
| ps assertion (`ps-check12.cjs`) | 0 | 20 services, 0 violations: 6 `*-migrate` + `rabbitmq-defs` exit 0, no seed container, APIs healthy |
| `prisma migrate status` x6 | 0 x6 | "Database schema is up to date!" x6 |
| opt-in seed `--profile seed run --rm seed` | 0 | "Seeds complete" |
| counts after seed | 0 | page_flags 9, subject_categories 4, subjects 15, word_family_categories 10 (vocabulary schema), users 8, wallets 7, admin_audit 20 |
| plain `up -d --wait` after seed | 0 | seed not started; counts unchanged; ps check 0 violations |
| isolation probes | see below | |
| broker bindings (`rabbitmqctl list_bindings`, as `rabbitmq`) | 0 | `kmaedu.events` to `exam.events`: `auth.user.updated` only; to `studyroom.events`: `auth.user.authz_changed` and `auth.user.updated`; `finance.events` and `gateway.events` bind authz_changed |

Isolation: studyroom_svc and vocabulary_svc each get `permission denied for schema` on auth and exam (4 expected denials, recorded as exit 1 rows, see Excluded rows). Own schema reads succeed (studyroom 0, vocabulary 10). exam schema has no `StudyRoom`, `UserSavedWordFamily`, or `WordFamilyCategory` (all `to_regclass` null).

### Stage 4: live through the gateway

| Check group | Exit | Result |
|---|---|---|
| prior smoke set (`smoke12.cjs`, adapted from Phase 11, 18 checks) | 0 | 18/18 |
| word-family reads (categories shape, roots, detail, save 201, saved 200), STUDENT generate 403, STUDENT to-flashcard 403 | row `s4-word-family-to-flashcard-admin-image` (exit 1, 18 checks, 2 failed) | 16 PASS. Failing: TEACHER to-flashcard 500 (F1), TEACHER r2/image 500 (harness S3 alias, fixed; passes in the re-run below) |
| TEACHER generate reaches vocabulary, no wallet transaction | same row | reached vocabulary (400 from the AI call, see F3); wallet transactions before 5, after 5 |
| F1 re-check, to-flashcard, RT-15, STUDENT 403 (`tf12.cjs`) | `f1-recheck-to-flashcard-rt15` exit 1 (seed shape defect, mine); `...-after-seed-shape-fix` exit 0 | 9/9 PASS: TEACHER to-flashcard 201, `cardCount` 3, exactly 3 detail rows, foreign identical-question card linked 0, foreign set still 1 card, questions are the three family words, STUDENT 403 |
| admin category image lifecycle with `/r2/image` uploads | `s4-image-lifecycle-*` rows (3 runs, exit 1 each) | see F2 and harness notes |
| admin replace and delete of `word-family/` images, drained by the vocabulary worker (`img12b.cjs`) | 0 | 6/6 PASS: row enqueued (1), object removed after replace, object removed after delete, `r2_delete_tasks` pending 0 |

### Stage 5: study-room live

| Check | Result |
|---|---|
| TEACHER POST studyrooms 201, STUDENT create 403, STUDENT non-host PUT 403, STUDENT join 201 | PASS |
| host and member WS via gateway `/ws/study`, chat both ways (same instance) | PASS |
| banned member gets `auth:reauth`, disconnected 0.45 s after the admin ban (gateway member) | PASS |
| reconnect with the old token refused | PASS |
| second replica (`p12t-study-room-2`, same image and env, `docker run` on kmaedu-internal) healthy | PASS |
| Redis subscriber clients (`CLIENT LIST`, `psub=1`) | 2 (one per replica) |
| cross-replica chat, host on replica 1 to member on replica 2 and back (`xrep12.cjs`, from inside kmaedu-internal) | 6/6 PASS, both directions via the Redis adapter (`studyroom` key) |
| WS run totals (`ws12.cjs`) | 19 checks, 17 PASS, 2 FAIL (below) |

### Stage 6: UI browser matrix

Phase 11 matrix (`ui9.cjs`, Puppeteer, Chrome headless, real FE via Vite on 5273 against gateway 6369; external requests not allowed beyond this stack): run on this stack.

- Full run `s6-ui9-browser-matrix`: exit 1, **58 PASS, 3 FAIL, 1 NOTE**. Phase 11 reference: 64/64 clean on rerun.
- Failing checks: see the diagnosis table below.
- Not run (time-box): a separate study-room create/join/timer/chat/playlist sync check across two browser contexts, and an admin word-family CRUD page check. Stage 5 covered study-room sync at the socket level. The UI-level two-context check is open.

## Failure diagnosis

| Row | Check | Observed | Expected | Class |
|---|---|---|---|---|
| `s5-studyroom-ws-gateway-and-replica` | SYSTEM_ADMIN-only token gets WS connect_error | connected (ok) | connect_error | Test premise mismatch. The admin account is `role=STUDENT` with `isSystemAdmin=true` (checked in `auth."User"`). It holds `study_room:join`, so the connect is correct. No SYSTEM_ADMIN-only account exists in the role model, so this case is NOT VERIFIED. Owner decision needed on whether such a test account should be created. |
| `s5-studyroom-ws-gateway-and-replica` | member WS direct to replica 2 connects | `websocket error` | connect | Environment. The `-p 127.0.0.1:6401:3000` mapping is in HostConfig but NetworkSettings.Ports is empty on this Docker VM, so nothing listens on the host port. Replica 2 itself is healthy and listening on 3000. The same check from inside kmaedu-internal passes (6/6). |
| `s6-ui9-browser-matrix` | TEACHER exam session: notice 'Tài khoản giáo viên không thể làm bài thi' | not shown | shown | Fixture. The matrix reads `examSessionId` from a Phase 11 seed file (`notes-seed.json`, id `6adace4b...`). That row does not exist in this fresh database (UPDATE 0). The scenario was never seeded in this stack. |
| `s6-ui9-browser-matrix` | STUDENT (whitelisted) exam session: start button visible | not visible | visible | Same fixture cause. The whitelisted session is absent. The only session here is the smoke-created one (id 6adb2027..., window 09:51 to 10:51 UTC), which is closed by the time the matrix runs. |
| `s6-ui9-browser-matrix` | script error: detached Frame | puppeteer detached-frame error | none | Harness flake. Puppeteer lost a frame during navigation. Not a product error. |
| `s6-ui9-browser-matrix` | NOTE: 'Từ đã lưu' saved-words view | label not in FE src (0 hits) | - | The matrix's own expectation text does not match the FE. Not verifiable as written. Not a defect in the run. |

A targeted re-run with a reseeded exam session was started and then stopped: the session id in the matrix's seed file does not exist here, so the re-run would reproduce the same missing fixture. The aborted run left no recorded row (killed before `rec12` wrote one). Net: the 3 UI failures are fixture and harness, not product.

## Findings

| # | Where | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | `kmaedu-be/apps/auth-service/src/token/service-clients.ts:7-14` (SERVICE_AUDIENCES lacked `vocabulary`) | exam's service-token request for audience `vocabulary` got HTTP 401 from auth (`/internal/token`). TEACHER `POST /api/v1/word-family/:id/to-flashcard` returned 500 `INTERNAL`. Exam log: `Service token request for "vocabulary" failed with HTTP 401`. | High | **Fixed** by coordinator (`'vocabulary'` added; regression spec `test/cross-app/service-audiences.spec.ts` red before, green after). Live re-verified: `f1-recheck-to-flashcard-rt15-after-seed-shape-fix` 9/9, to-flashcard 201, 3 cards, RT-15 holds, STUDENT 403. |
| F2 | `kmaedu-be/apps/vocabulary-service/src/modules/word-family/word-family-admin.service.ts:167-183` (`imageKeysToDelete`, prefix `word-family/`); upload path `/api/v1/r2/image` writes `images/<userId>/...` | Category image uploaded via `/r2/image` is never deleted when the category image is replaced or deleted. Vocabulary logs `outside word-family/; not deleted`. Observed: old object still present after PUT and DELETE (`img12`, `oldKeyExists=true`). The admin page only takes a free-text image URL, so the app's own uploads orphan objects. | Medium | **By design (coordinator), pending review.** Phase 11 limits deletion to `word-family/` keys to prevent cross-feature and cross-user deletes. The `word-family/` replace and delete path itself works (`img12b` 6/6). |
| F3 | vocabulary `word-family.controller.ts` generate → AI call | TEACHER `POST word-family/generate` reaches vocabulary and returns 400 `Request failed with status code 400` (message from the upstream AI call, surfaced generically). No wallet transaction. | Low | Open, observation. Needs an AI key to judge; not a verified defect. |
| F4 | Test premise (`ws12.cjs`) | The "SYSTEM_ADMIN-only token gets connect_error" check cannot be built with the current role model (admin has role STUDENT plus isSystemAdmin). | Info | Open: owner to decide whether a non-student admin fixture should exist. |
| F5 | Docker VM port publish (`p12t-study-room-2`) | Host-side loopback port for the replica is not published at runtime. | Env | Not a product issue. Replica verified from the internal network. |
| F6 | Harness: CI top-level env (`QUIZ_JWT_SECRET` etc.) | First exam e2e run 213 failed (env gap). | Harness | Resolved in the harness. Re-run 213/213. |
| F7 | Harness: drift check did not set `DATABASE_URL` | Drift exit 2 on five schemas. | Harness | Resolved. Drift 6/6 exit 0. |
| F8 | Harness: s3proxy missing `s3backend` network alias | R2 upload returned nginx 502 `s3backend could not be resolved`. | Harness | Resolved. Upload 201. |
| F9 | Harness: word-family seed row `data` lacked `rootWord` | to-flashcard 400 `Dữ liệu word family không hợp lệ` (vocabulary FAILED_PRECONDITION). | Harness | Resolved (seed shape corrected to the FE type). |
| F10 | Harness: admin role lacks `word_family`/`r2/image` permission (403); category slug reuse (409) | First image runs. | Harness | Resolved (teacher uploads; unique slugs). |
| F11 | Study-room adapter (memory note: sub never subscribes on HEAD) | Phase 12 `redis-io.adapter.ts` sets `enableReadyCheck: false` and `disableClientInfo: true` on sub. Live: 2 subscriber clients, cross-replica chat passes. `PUBSUB NUMPAT` returns unique patterns (1), so it is not a per-client count. | Info | Closed for this phase. Memory note needs its count method corrected. |

## Excluded or expected-failure rows

| Row(s) | Exit | Why excluded |
|---|---|---|
| `s3-iso-studyroom-denied-auth-user`, `...-denied-exam-quizset`, `s3-iso-vocabulary-denied-exam-subject`, `...-denied-auth-user` | 1 x4 | Expected: each is a `permission denied for schema auth/exam` error from the isolation probe. The aggregate isolation result is PASS. |
| `s2-exam-e2e-folder-as-exam-svc` | 1 | Harness env gap (F6). Superseded by the re-run row with exit 0. Kept in the raw file. |
| `f1-recheck-to-flashcard-rt15` | 1 | Seed-shape defect in my scratch data (F9). Superseded by the `...-after-seed-shape-fix` row, exit 0. |
| `s4-word-family-to-flashcard-admin-image` | 1 | Real run record: 2 failed (F1 before fix; harness S3 alias). Not overwritten. |
| `s4-image-lifecycle-admin`, `s4-image-lifecycle-teacher-upload-admin-crud` | 1 | Harness: admin lacks `r2/image` (403); slug reuse (409). Not overwritten. |
| `s4-image-lifecycle-rerun-unique-slug` | 1 | F2 (by design, pending review). The two failing checks are the replace and delete orphan expectations. |
| `s5-studyroom-ws-gateway-and-replica` | 1 | 2 failing checks (diagnosis table: premise mismatch; environment port publish). |
| `s5-cross-replica-chat-internal-net` (first attempt) | 1 | Harness module mount path. Superseded by the exit 0 row. |
| `s6-ui9-browser-matrix` | 1 | 3 fixture and harness failures (diagnosis table). |

## Stage 6b: UI gaps closed (criterion 9)

Scope: the UI checks Stage 6 did not run. Same scratch stack (project `p12t`), rebuilt from an empty volume.

### Stack and build

- Network outage during the rebuild: `s6b-build-admin-migrate` and `s6b-build-exam-migrate` exited 1 with `getaddrinfo ENOTFOUND registry.yarnpkg.com` at the yarn fetch step. Not a Dockerfile or code error. Both were retried once (`s6b-build-retry-*`), exit 0. The `dur` values on the first attempts (17671 s, 3142 s) are inflated by the outage and a clock change. The retry set rebuilt the 16 images one at a time, each with a 900 s deadline. All 16 exit 0.
- `up -d --wait` from an empty volume: exit 0 (39 s). ps assertion exit 0 (20 services, 0 violations). Opt-in seed exit 0 (`Seeds complete`), counts unchanged.

### Fixture (`s6b-fixture-open-exam-session-and-p09root`)

- First attempt exit 1: `room 400 session 400`. Harness: the quiz id was not read from the nested response. Fixed with a recursive id read. Retry exit 0.
- Created: quiz, exam room, exam session whitelisting the STUDENT account, start moved into the past (now minus 10 minutes), end in 3 hours (scratch SQL on `exam_svc`, fixture data only). Word family `p09root` in `announcement-advertising` (vocabulary schema). `notes-seed.json` written for the matrix.
- The Stage 6 matrix fixture never created the whitelisted session in this stack. That was the cause of the two exam-session fails in Stage 6 (UPDATE 0 on the Phase 11 session id). It now exists, and both checks pass.

### Browser runs

| Run | Result | Notes |
|---|---|---|
| run 1 `s6b-ui-study-room-2ctx-admin-crud-student-wf` | exit 2 | Crashed at the chat input: join failed because the room had no invite code. |
| runs 2 to 7 | exit 2 or 1 | Each run fixed one thing: the Select selectors, the cookie origin (`localhost` vs `127.0.0.1`), and the matrix copy's missing `accounts.json` and `room.env`. |
| run 8 | exit 1, 38 checks, 3 FAIL | Code-room fallback works (API 201, code `356937`). Playlist ID was 12 characters, which YouTube IDs never are. |
| run 9 | exit 1, 38 checks, 2 FAIL | Playlist ID fixed to 11 characters. Soft-delete check corrected. Matrix copy at 49 PASS, 14 FAIL: the STUDENT account was TEACHER (F13). |
| run 10 (final) | `s6b-ui-…-run10` exit 1, 36 PASS, 1 FAIL; `s6b-ui9-matrix-full-run10` exit 0, **64 PASS, 0 FAIL, 1 NOTE** | Final. |

Final study and admin script `s6b-ui-study-room-2ctx-admin-crud-student-wf-run10`: 38 checks, 36 PASS, 1 FAIL. The FAIL is the UI access-mode select (F14). The API fallback was used, and the join, chat, timer, playlist, admin CRUD, and student pages all pass. Blocked outside hosts (as designed): `www.googletagmanager.com` and the Cloudflare challenge host.

Final matrix `s6b-ui9-matrix-full-run10`: 64 PASS, 0 FAIL, 1 NOTE (`'Từ đã lưu' saved-words view`, F15). The Detached Frame script error did not recur. The run was the full matrix, not only the two exam checks: the matrix is one process, so the exam checks and the detached-frame check come from the same run. Both exam-session checks pass: TEACHER notice shown, STUDENT whitelisted start button visible.

| Area | Check | Result |
|---|---|---|
| Study room, 2 contexts | TEACHER creates a room in `/k/study-room` (create modal, `Tạo phòng`) | PASS (route `/k/study-room/:id`) |
| | TEACHER selects access mode `Mã số` in the create modal | FAIL in the UI (F14). Fallback: API create with `accessType=1` (201) |
| | STUDENT joins with the 6-digit code (`Nhập mã`) | PASS (lands in the same room) |
| | Chat both ways | PASS |
| | Pomodoro: host starts, student sees clock move (30:00 to 29:57) | PASS |
| | Pomodoro: host pauses, student sees clock frozen 3 s (29:56 both) | PASS |
| | Playlist: host adds a YouTube item, student sees it | PASS (after the 11-character ID fix) |
| Admin word-family CRUD | Create category with a `word-family/` image URL | PASS (201, row in the list) |
| | Edit: replace image | PASS (API shows the new `imageUrl`) |
| | Replaced object drained from s3 stub | PASS (`keyA=false`) |
| | Delete (Popconfirm `Xóa`) | PASS as a soft delete: the row stays with `isActive=false`, `imageUrl=null` (F16) |
| | Deleted object drained from s3 stub | PASS (`keyB=false`) |
| STUDENT word-family pages | `/k/word-family` categories list | PASS (API lists `announcement-advertising`) |
| | Roots view shows `p09root` | PASS |
| | Detail: `Lưu` then `Đã lưu` | PASS |
| | Saved list (API `GET word-family/saved`) contains the family | PASS (count 1). No FE view renders it (F15) |

Screenshots (scratch, not kept): `ui/shots/` in the tester scratchpad (01 to 11: create modal, teacher room, student room, chat, timer paused, playlist, admin created, admin after delete, categories, roots, saved).

### Stage 6b findings

| # | Where | Finding | Status |
|---|---|---|---|
| F13 | Seed: `auth."User"` for `user2@kmaedu.fayedark.com` | The seed gives the STUDENT test account the TEACHER role. Phase 11 smoke demotes it to STUDENT before the matrix (`PUT /api/v1/admin/roles/users/:id/role`). Skipping smoke leaves it TEACHER, and the matrix failed 14 checks (run 9). | Harness ordering. Resolved by running the same demotion (`s6b-demote.cjs`, 200). Owner may want the seed to set STUDENT directly. |
| F14 | Create-room modal, Ant Design select (`.ant-select-selector` inside `[role=dialog]`) | UI access-mode selection not automated: the select did not open on real pointer clicks in the attempts made. The API fallback (`accessType=1`) was used. | Open (test automation gap). The `Mã số` selection needs a manual UI check. |
| F15 | FE word-family pages | No saved-list view and no `Từ đã lưu` label. Only the `Đã lưu` button state uses `savedIds`. The API `GET word-family/saved` works. | Open. Owner to confirm whether a saved-list page is in scope for phase 12. |
| F16 | `kmaedu-be/apps/vocabulary-service/src/modules/word-family/word-family-admin.service.ts` (delete sets `isActive:false, imageUrl:null`) | Admin delete of a category is a soft delete. The row stays in the admin list. The image object is still drained. This matches the service; the list keeps the row. | Open, pending owner decision (soft delete by design vs. hard delete). |
| F17 | Playlist add | Initial failure was the test's 12-character video ID. The study-room service has no outbound YouTube calls. | Closed (harness). |
| F18 | Build outage | DNS for `registry.yarnpkg.com` failed for two builds. The retry passed. | Closed (environmental). |

F2 (category image orphaned from `/r2/image` uploads) is unchanged: by design (coordinator), pending review.

## Teardown (Stage 6b, final)

- `s6b` teardown: `docker rm -f p12t-s3backend p12t-shim p12t-study-room-2` (named, this run's containers). `docker network rm p12t-stubnet`. `docker compose -p p12t ... down -v --rmi local --remove-orphans` in the scratch copy: exit 0.
- Vite on 5273: stopped by PID after checking the command line (`vite --host 127.0.0.1 --port 5273`). Port closed.
- Scratch secrets deleted: TLS key and cert, scratch `deploy/.env`, rabbit `definitions.json`, `ui/room.env`, replica env file.
- Final check: `docker ps -a` lists no containers. No `p12t`/`kmaedu` volumes, no `p12t-*` images, no `p12t` networks. `deploy_default` and `meetio_default` networks remain, not touched.
- **Concern (not caused by these commands):** `docker info` reports 0 containers in total. The `meetio-postgres-1` and `meetio-redis-1` containers were up at the start of this stage and are no longer present. The volumes `meetio_postgres-data` and `meetio_redis-data` still exist. None of the commands run in this stage target `meetio-*`. Cause unconfirmed (the daemon may have restarted during the network outage). Not restarted by this run. Owner to check.

## Teardown (Stage 6, earlier)

- Removed: `p12t-study-room-2`, `p12t-shim`, `p12t-s3backend` (`docker rm -f`), network `p12t-stubnet`.
- `docker compose -p p12t ... down -v --rmi local --remove-orphans` in the scratch copy: exit 0. Removed compose containers, `p12t_*` volumes, the `kmaedu-*` networks, and the local `p12t-*` images.
- Scratch secrets: S3/Turnstile TLS key and cert, scratch `deploy/.env`, generated rabbit `definitions.json`, replica env file: deleted. The Vite dev server on 5273 was stopped.
- Scratch logs and the repo copy remain in the tester scratchpad (no secrets kept there by design; ci-env values are CI-only dummy strings).
- Final check: `docker ps -a` shows only `meetio-postgres-1` and `meetio-redis-1` (not touched). No `p12t`/`kmaedu` volumes or networks remain.
- Not touched: network `deploy_default` (id 2a7bee7cbf45) is still present. This run did not create it and did not remove it. Its owner is unknown; flagged for the owner.

## Final verification set (gate input)

`temper-raw.json` keeps every row, failures included. `temper-results.json` is built from `temper-final.json`, which holds:
- the `final:` rows the coordinator ran on the FINAL code, after the F1 fix and the review L1–L3 fixes: typecheck, `TZ=UTC yarn test` (2019 passed), check:deps, check:ownership, build:all, the compose-topology + render-definitions specs (32/32), both success-criteria greps, and the F1 regression spec `test/cross-app/service-audiences.spec.ts` (RED before the fix, GREEN after);
- every `temper-2:` row with exit 0 (stages 2–6b).

These take the place of the `temper-1:` static rows, which ran before the F1 and L1–L3 fixes.

Excluded rows, each with its reason (detail in the sections above):
- **Expected denials:** `s3-iso-*-denied-*` (4 rows). These are deliberate `permission denied for schema` probes; the matching own-table rows pass.
- **Harness/env rows, each followed by a passing re-run:**
  - `temper-1: ci-prepare-env`
  - `s2-exam-e2e-folder-as-exam-svc`, first run, missing CI env `QUIZ_JWT_SECRET`
  - `s5-cross-replica-chat-internal-net`, first run, node path
  - `s6b-build-admin-migrate` and `s6b-build-exam-migrate`, `ENOTFOUND registry.yarnpkg.com` during the network outage
  - `s6b-fixture-*`, first fixture attempt
  - `s6b-ui-…-run1..9` and `s6b-ui9-matrix-full-rerun/run2..9`, harness iterations
- **Superseded by a fix that was then re-verified:**
  - `s4-word-family-to-flashcard-admin-image` and `f1-recheck-to-flashcard-rt15`: F1, re-verified 9/9 by `f1-recheck-to-flashcard-rt15-after-seed-shape-fix`.
  - `s4-image-lifecycle-*`: harness 403/409, plus F2, which is by design and deferred as M2.
  - `s6-ui9-browser-matrix` (58/3/1): fixture and flake, re-verified 64/0/1 by `s6b-ui9-matrix-full-run10`.
- **Accepted premise/environment gaps:** `s5-studyroom-ws-gateway-and-replica` (17/19).
  - The SYSTEM_ADMIN-only premise cannot be built, because no such account exists in the role model (F4, proven at service level in `ws-auth.e2e-spec.ts`).
  - The replica host-port publish failed on this VM; the same check passes 6/6 from inside `kmaedu-internal`.
- **Partial pass:** `s6b-ui-study-room-2ctx-admin-crud-student-wf-run10` (38 checks, 1 FAIL).
  - Every two-context study-room check, the admin CRUD page and the STUDENT word-family pages pass.
  - The one failure is F14: the Ant Design access-mode select did not open under automation. The FE is unchanged in this phase, room creation is proven with the same payload through the API, and the gap is deferred as Low.

The final reviewer verdict is SEALED, score 9, with criterion 9 covered by the Stage 6b evidence.
Human sign-off: given 2026-10-24 ("Ký duyệt + commit"); F2 kept as is ("Giữ như hiện tại, làm sau"). riskGate.humanSignedOff=true, hard gate re-run exit 0.
