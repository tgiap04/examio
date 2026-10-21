# Phase 09 runs (frontend RBAC): static gates, live 3-account matrix, findings

Temper result: **FAIL on acceptance items 5 and 7** (live). Static gates pass. Two product defects block the phase: a refresh-cookie gap in auth (causes a forced logout) and a duplicate refresh in the FE `getUser` path. Both are detailed below with file:line.

## Environment and safety

- Local only. Postgres (`pgvector/pgvector:pg16`), Redis (`redis:7-alpine`) and RabbitMQ (`rabbitmq:3.13-management-alpine`) ran in throwaway containers `p09-pg|p09-redis|p09-rmq`, bound to `127.0.0.1` (58641 / 58591 / 58883). All removed at the end.
- Every BE command ran under `env -i` with a complete local env (`$SCRATCH/p09/p09env.sh`). Every outbound-capable key is pinned to a dummy or `127.0.0.1:9`. `MAIL_TRANSPORT=json`. The guard refuses any non-local `DATABASE_URL`. Prisma printed `127.0.0.1:58641/examio_p09`.
- No `.env` file was read or printed. No `docker compose config` was run. Services ran from an out-of-repo cwd (`$SCRATCH/p09/run`) from `dist/`.
- Browser: puppeteer-core 24.43.1 + `/Applications/Google Chrome.app`, FE vite on `127.0.0.1:5273` with `VITE_BACKEND_URL` pinned to the gateway (3780), `VITE_API_URL=/api/v1`, all other VITE keys empty in the process env. CDP `Fetch` fails every non-localhost request. Attempts that were blocked: 0 in run6 and run7 (2 in an earlier run, both `accounts.google.com`, blocked and never sent).
- Accounts (seeded by SQL into the local DB only): STUDENT, TEACHER, STUDENT+SYSTEM_ADMIN. Credentials are in `$SCRATCH/p09/accounts.json` (mode 600), never in the repo or evidence.
- Ports: gateway 3780, auth 3781, exam 3782, finance 3783, admin 3785, gRPC 58151-58155.

## Static checks

| check | command | exit | result |
|---|---|---|---|
| FE build | `yarn build` (`tsc -b && vite build`) | 0 | built in 10.17s |
| FE lint | `yarn lint` | 0 | clean |
| FE tests | `yarn test` (`vitest run`) | 0 | 5 files, 43 tests passed |
| BE typecheck | `yarn typecheck` (all 6 services) | 0 | clean |
| BE build | `yarn build:all` | 0 | webpack compiled |
| generator | `yarn gen:fe-permissions` | 0 | file written |
| drift | regenerate + `cmp` against working-tree copy | 0 | byte-identical |
| drift (git) | `git diff --exit-code <generated file>` | 0 | **vacuous**: file is still untracked (`??`), so git cannot see a diff. Becomes meaningful once committed. |
| CI yaml | python yaml load of `.github/workflows/ci.yml` | 0 | 8 jobs incl. `fe-permissions-drift`; FE job runs `yarn test` |
| grep | `user?.isAdmin` / `TeacherRoute` in `examio-fe/src` | 1 | no matches (expected) |
| types | `user.ts` | n/a | `id: string`, `isSystemAdmin`, no `isAdmin` |
| migrate | `prisma migrate deploy` (local) | 0 | applied (first attempt exit 1: Postgres not ready, P1001) |
| schema drift | `prisma migrate diff --exit-code` | 0 | no drift |

Not run (out of Scope Contract): BE unit and e2e suites, mobile.

## Live matrix (final run = run7; run6 identical)

Artifacts: `ui-browser-run.json|txt` (run7), `ui-browser-run-attempt-run6.json|txt`, screenshots in `ui-screens/` (run7). Totals per run: **50 PASS, 1 FAIL, 2 NOTE**.

| # | item | result | evidence |
|---|---|---|---|
| 1 | landing: TEACHER→/k/ai-tool, STUDENT→/k/my-materials, STUDENT+ADMIN→/admin | PASS (3/3) | login via API, then `/k` redirect |
| 2 | sidebar exact per role; admin item only with `admin:access` | PASS | S: word-family, my-materials, my-exams, study-room, history/exam. T: ai-tool, word-family, manage-exam, flash-card, manage-exam-room, study-room, history. A: S set + `/admin` |
| 3 | forbidden direct URL → `/403` (9 cases) | PASS 9/9 | incl. STUDENT `/admin`, `/admin/roles`; TEACHER `/k/my-exams`, `/k/history/exam`, `/admin` |
| 4 | click every visible sidebar item, zero 403 | PASS | S, T, A: 403s=0 in the network log. STUDENT never calls `/ai/recent-uploads` (PDF history) |
| 5a | promote STUDENT (admin in a separate context): stale call → one refresh → teacher sidebar, no reload | PASS | `401 TOKEN_STALE` → `POST /auth/refresh 201` (exactly 1) → sidebar = teacher set; marker unchanged |
| 5b | demote back: no stale teacher data | sidebar PASS, refresh count **FAIL** | sidebar = student set, no teacher items. Two `/auth/refresh 201` in the window (see F2). Expected exactly 1. |
| 6 | hidden UI | PASS for the checks run | STUDENT: no "Tạo phòng", no "Số dư trong ví", pricing CTA "Gói dành cho giáo viên". TEACHER: "Tạo phòng" visible, no pricing CTA. |
| 6 | "Sinh bằng AI" / "Lưu" on word-family detail | NOTE | no word-family data seeded (page shows "Chưa có danh mục nào") |
| 6 | TEACHER on exam session start: notice, no start | NOTE | no seeded exam session; covered by static guard and unit tests only |
| 7 | in study room, promoted: `auth:reauth` → one refresh → reconnect → stays in room | PASS | frame `42["auth:reauth",{"reason":"AUTHZ_CHANGED"}]`; refresh=1; reconnects=1; URL unchanged. (15-min expiry path not run; authz_changed path used, as the plan allows.) |
| 7 | the student stays logged in when demoted while in the room | **FAIL** | student ends on `/login`. Two `POST /auth/refresh 401 "Invalid or expired refresh token"` (see F1). Reproduced in run6 and run7. |
| 8 | admin opens `/admin` and `/admin/roles` (no isAdmin shim) | PASS | "Phân quyền" rendered; 0 403 |
| 9 | no `permissions` / `roles` arrays in localStorage/sessionStorage | PASS (3/3) | keys seen: `auth_return_to`, `device_id`, `sidebar_collapsed`, i18n locale |

Pacing: the gateway default is 100 req/min per user or IP. The auth service has a global `ThrottlerModule` at 30 req/60 s per IP (`apps/auth-service/src/auth.module.ts:43-48`). Full page loads call `/auth/me` each time. `ui9-lib.cjs` `authGate()` holds every context under 20 auth calls per minute. Without the gate, runs 1–5 hit `429 ThrottlerException`.

## Findings (product)

**F1. Refresh cookie is never rotated: browser sessions die 60 s after the first refresh. Blocking.**
- Where: `examio-be/apps/auth-service/src/auth.controller.ts:362` sets only the `accessToken` cookie in `refreshToken()`. The rotated refresh token is returned only in the JSON body. Grace window: `devices/repositories/user-session.repository.ts:99` (`REFRESH_GRACE_MS = 60s`). The FE never calls `POST /auth/sync-refresh-token`: `examio-fe/src/apis/authApi.ts:145` is defined and has no caller.
- Pre-existing on `main`: `git show main:…/auth.controller.ts` has the same accessToken-only cookie on refresh (line 376), so this is not a regression from this branch. It is still a live defect here.
- Expected: after `/auth/refresh`, the browser holds the current refresh token, and a later refresh succeeds.
- Actual, deterministic (`scratchpad/p09/rcr.py`): refresh #1 → 201, refreshToken cookie hash unchanged. Same jar after 65 s → `401 UNAUTHORIZED "Invalid or expired refresh token"`.
- Browser timeline, run7 student (+ seconds from first refresh): `+278.6 201` (promotion refresh) … `+340.9 401` (62.3 s later), then `getUser`'s refresh 401, then logout to `/login`. Run6 is the same.
- Impact: any browser session is force-logged-out on the first refresh more than 60 s after the previous rotation. That is roughly every access-token cycle (15 min) past the second refresh.
- Note: `rotateRefreshTokenIfCurrent` and the grace path make concurrent refreshes safe. A promotion inside the grace window does not break it (`grace-authz.py`: 201).

**F2. Duplicate refresh on TOKEN_STALE: `getUser` bypasses single-flight. FE, this phase. Expected exactly 1 refresh (spec).**
- `examio-fe/src/stores/useAuthStore.ts` `getUser` (≈L256-300): on failure of `/auth/me` it calls `refreshTokenApi()` directly (L280), not `refreshAccessToken()` in `examio-fe/src/apis/api.ts:104`, which is the single-flight path.
- Triggered by `examio-fe/src/components/organisms/k/SideBar.tsx:105-108` and `examio-fe/src/hooks/useAuthSync.ts:43`, which call `getUser()` on each authenticated mount.
- Observed: `GET /auth/me 401 TOKEN_STALE` ×2 then `POST /auth/refresh 201` ×2 in the same window (run6 and run7, step 5b).
- Fix direction: have `getUser`'s fallback call the shared single-flight refresh, or skip the refresh on `TOKEN_STALE`.

**F3. A transient failure of `/auth/me` logs the user out. FE, this phase. Medium.**
- In `getUser`, when `/auth/me` and the fallback refresh both fail, it sets `isAuthenticated: false` and the guards send the user to `/login`. Any 429 or 5xx counts.
- Observed in runs 1–4 when the auth throttle returned 429: STUDENT `/admin` → `/login`, and the landing stayed on `/login`. Not reproduced once the gate paced the run.
- Expected: a transient error keeps the session and retries later. Only a definitive 401 that the refresh cannot fix should log out.

**F4. Operational risk, not a defect: auth-service global throttle 30 req/60 s per IP** (`auth.module.ts:43-48`). `/auth/me` runs on every full page load. Users behind a shared NAT could hit it. Combined with F3 this logs them out.

## Harness problems found and fixed (not product defects)

- RabbitMQ: the first service launcher expanded the password variable name at write time, so services sent a blank password and the broker refused them. Consequence: `auth.user.authz_changed` never flowed, and the outbox relay logged `ALERT outbox: N unpublished`. Fixed; broker shows 5 running connections and `examio.events`. Matrix runs 1–4 are invalid for items 5–7 because of this; run 5 (after the fix) was still throttled, so only runs 6 and 7 count.
- The sign-in button is gated on a Cloudflare Turnstile token (`signin-form.tsx:100,116`). The widget is external and must not be reached. Login was done with `POST /api/v1/auth/login` from the page context (same HttpOnly cookies). The login endpoint does not check Turnstile (only register does). All later navigation is UI-driven.
- Two containers started with an empty password (`POSTGRES_PASSWORD`, `--requirepass`). Recreated with the real values. The first Prisma attempt exited 1 (P1001) before Postgres was ready; rerun succeeded.
- Diagnostic probes (`probe-login.cjs`, `probe-refresh.cjs`, `probe-admin-redirect.cjs`, `race-repro.sh`) were used to isolate the causes above. They are not temper rows.

## Not verifiable here

- Word-family "Sinh bằng AI" and "Lưu" on detail pages: no seeded word-family data.
- TEACHER exam-session start notice: no seeded exam session.
- 15-minute token expiry socket path: not run. The authz_changed → `auth:reauth` path was used, as the plan allows.
- `permissions.generated.ts` drift check via `git diff`: vacuous until the file is committed. Not committed (commit was not requested).
- BE unit/e2e suites: out of scope for this phase (BE source unchanged except one package.json script).

## Next work (ranked)

1. F1 (BE, blocking): rotate the refreshToken cookie on `/auth/refresh` (`auth.controller.ts:~362`), or have the FE call `/auth/sync-refresh-token`. Add an e2e that refreshes twice more than 60 s apart with the cookie jar. Owner: auth-service.
2. F2 (FE): route `getUser`'s fallback through `refreshAccessToken()` (api.ts:104). Re-run 5b; expect refresh=1.
3. F3 (FE): `getUser` must not clear the session on a non-401 error.
4. Commit `permissions.generated.ts` so the CI drift check means something.
5. Seed one word-family set and one exam session, then close the two NOTE items.
6. Re-run this matrix after 1–3 with the same harness (`scratchpad/p09/ui9.cjs`).

## Re-temper after F1-F3

Scope: coordinator fixes F1 (refresh cookie rotation), F2/F3 (single-flight `getUser`, transient-error policy). No product code changed in this pass. Stack rebuilt from the working tree (`yarn build:all`), containers recreated on 127.0.0.1, DB freshly migrated and reseeded, same HARD SAFETY RULES.

### Result

| check | result |
|---|---|
| FE build / lint | PASS (exit 0 / 0) |
| FE tests | PASS: 6 files, 62 tests |
| BE typecheck | PASS (exit 0) |
| BE unit `yarn test apps/auth-service` | PASS: 25 suites, 204 tests |
| Auth e2e with RabbitMQ up (app, refresh-cookie, token, role-change) | PASS: 4 suites, 24 tests. The earlier app.e2e health failures came from RabbitMQ being down. With the broker up they pass; the failing code paths are not touched by the diff. |
| F1 `rcr2.py`: refresh #1, same jar +65 s, same jar +65 s more | PASS: 201, 201, 201. Cookie hash changes on every refresh. |
| Matrix (final run, `ui9.cjs`, items 1-10) | 63 PASS, 1 FAIL, 1 NOTE |
| F3 live: 5xx (auth down) and 429 (throttled), cold full reload | **FAIL**: user sent to `/login` |
| F3 live: 429 during client-side navigation (warm session) | PASS: 11 consecutive 429s on `/auth/me`, user stays in the app |

### Matrix items (final run; artifacts `ui-browser-run.json|txt`, screenshots in `ui-screens/`)

| # | item | result |
|---|---|---|
| 1 | landing per role | PASS 3/3 |
| 2 | sidebar sets, admin item only with admin:access | PASS |
| 3 | forbidden direct URL → /403 (9 cases) | PASS 9/9 |
| 4 | click every visible item, zero 403 | PASS (S, T, A) |
| 5a | promote: stale call → exactly one refresh → teacher sidebar, no reload | PASS |
| 5b | demote: **exactly one refresh** (was 2 before F2), sidebar correct | PASS (refresh=1) |
| 6 | hidden UI (student: no "Tạo phòng", no wallet balance, pricing CTA; teacher: "Tạo phòng" visible) | PASS |
| 6 | word-family: STUDENT no generate button, "Lưu" visible; TEACHER generate and "Lưu" visible | PASS (seeded root `p09root` in category `p09-notes`) |
| 6 | TEACHER on exam session: notice, no start | **FAIL** (new bug F5 below) |
| 6 | TEACHER on exam session: no "Bắt đầu làm bài" button | PASS |
| 6 | STUDENT (whitelisted): no teacher notice, start visible, start → `/exam-session/:id/quiz` | PASS (consent checkbox ticked first, as the UI requires) |
| 6 | "Từ đã lưu" saved-words view | NOTE: no such label or view in examio-fe src (0 hits). Cannot be verified as written. |
| 7 | in room: `auth:reauth` → exactly one refresh → reconnect → stays in room | PASS |
| 7 | demotion while in room: student stays logged in | PASS (sidebar present after `/k/my-materials`) |
| 8 | admin opens /admin and /admin/roles | PASS |
| 9 | no permissions/roles in web storage | PASS (3/3) |
| 10 | long session: 4 role flips ~65 s apart, 213 s total | PASS: refresh=4, exactly one per flip, student logged in each time. This is the end-to-end proof of F1 over more than 2 minutes. |

### F1 and F2: verified

- F1: `rcr2.py` shows the cookie rotates on each refresh, and the old cookie is no longer needed after 60 s. Matrix item 10 spans 4 refreshes over 213 s with no logout.
- F2: demotion produces exactly one `/auth/refresh` (matrix 5b and item 10).

### F3: NOT fixed for cold loads

- Warm session (client-side navigation, `/auth/me` throttled with 11×429): PASS, user stays in the app.
- Cold full reload while auth-service is down (502 on `/auth/me`) or throttled (429): **FAIL**. The user is sent to `/login`.
- Cause: on a cold load `isAuthenticated` starts `false` and `initializing` starts `true` (`examio-fe/src/stores/useAuthStore.ts:92-94`). `runLoadUser` (`useAuthStore.ts` ≈L337-355) calls `probeSession`, and a transient error returns `"keep"`. That leaves `isAuthenticated` false, so `ProtectedRoute` redirects (`examio-fe/src/routes/guards/ProtectedRoute.tsx:18-21`). "Keep" protects only a session already in memory. A reload has none.
- Expected: a transient failure during cold load keeps the user on the page (retry, or a neutral waiting state), not `/login`. Actual: `/login`.

### New bug F5 (FE + BE mismatch, blocks item 6 teacher notice)

- `examio-fe/src/pages/exam-session/ExamSessionPage.tsx:76` (and `:124`) calls `getExamSessionStatsApi(id)` whenever `access.hasAccess` is true, with no permission gate.
- The endpoint `GET /examsessions/study/:id/stats` is `@RequirePermissions('exam:take')` (`examio-be/apps/exam-service/src/modules/examsession/examsession.controller.ts:309-311`). TEACHER lacks `exam:take`.
- Repro: TEACHER opens `/exam-session/<id>` on a whitelisted session. The request returns `403 PERMISSION_DENIED`, the page never renders, and the spinner stays. The teacher notice ("Tài khoản giáo viên không thể làm bài thi") never appears.
- Expected: teacher sees the notice and no start. Actual: infinite loader plus a 403 request.
- Fix direction: skip the stats call when `!canTakeExam`, or render the notice before the stats fetch.

### Harness and hygiene (not product code)

- The auth e2e run was executed against the same local DB as the matrix fixtures. The e2e helper demotes every pre-existing admin on boot (per the phase 08 notes, `test/helpers/real-auth-admin.ts`). That reset the fixture admin to `isSystemAdmin=false`, and the admin's `/auth/me` then returned only STUDENT. It was restored via SQL before the matrix ran. Run e2e suites against a dedicated test DB.
- Two seed attempts were needed. `seed-notes.py` exited 0 but its exam-session call returned 400 and its category call returned 403 (admin lacked the permission while demoted). `seed-notes2.py` fixed both with real APIs. The word-family root is a single fixture row (`wf-root.cjs`). No real API can create roots without the AI service, which is not running here.
- Login hits the gateway's 5/min per IP limit. The seeding scripts retry on 429 after 65 s.
- Spec copy mismatch: the plan says "Sinh bằng AI", but the UI renders "Sinh từ con cho …" and "Sinh lại từ con". The matrix asserts the real labels.

### Not verifiable

- "Từ đã lưu" saved-words view: not implemented in examio-fe.
- The 15-minute token-expiry socket path: not run. The authz_changed path was used.
- The `git diff` drift check still passes vacuously until `permissions.generated.ts` is committed.

### Status

- DONE_WITH_CONCERNS. F1 and F2 are verified. F3 is incomplete for cold loads, and F5 is new. Item 6 teacher notice FAILS. Matrix: 63 PASS, 1 FAIL (F5), 1 NOTE ("Từ đã lưu" not in the FE).
- Phase 09 does not pass its acceptance until F3 (cold load) and F5 are fixed.

## Re-temper 3 (F5 teacher exam notice, F3 cold-load SessionUnavailable)

Scope: F5 (`ExamSessionPage` skips the stats call without `exam:take`; load failure shows an error card) and F3 cold load (`probeSession` returns ok|cleared|unavailable; guards render `SessionUnavailable` instead of redirecting on transient failure). FE only, no product code changed here. Auth e2e ran against a dedicated `examio_e2e` DB, never the matrix DB.

### Static and e2e

| check | exit | result |
|---|---|---|
| FE `yarn build` | 0 | built |
| FE `yarn lint` | 0 | clean |
| FE `yarn test` | 0 | 8 files, 73 tests pass (was 6 / 62) |
| auth e2e: app, refresh-cookie, token, role-change, RabbitMQ up, DB `examio_e2e` | 0 | 4 suites, 24 tests pass |

### Live F5 and F3 (`f5f3-live.cjs`, artifact `f5-f3-live-run.json`): 25/25 PASS

| check | result |
|---|---|
| F5 teacher on whitelisted session: notice "Tài khoản giáo viên không thể làm bài thi" visible, no spinner | PASS |
| F5 teacher: no `/stats` request and no 403 on the exam session | PASS (empty list) |
| F5 teacher: no "Bắt đầu làm bài" button | PASS |
| F5 whitelisted student: start visible, consent ticked, start → `/exam-session/:id/quiz` | PASS |
| F3 cold reload with auth-service stopped (502): SessionUnavailable shown, URL stays `/k/my-materials` | PASS |
| F3 auth restored, "Thử lại" → lands on `/k/my-materials` with sidebar | PASS |
| F3 throttled (10/40 × 429), warm client-side navigation stays in app | PASS |
| F3 throttled cold reload: SessionUnavailable shown, not `/login` | PASS |
| F3 after throttle window, "Thử lại" → navigation works | PASS |
| Revoked session (logout, then cold reload) → `/login` (unchanged) | PASS |
| No cookies, cold load → `/login` (unchanged) | PASS |

### Full matrix re-run (`ui9.cjs`, artifacts `ui-browser-run.json|txt`, screenshots `ui-screens/`): 64 PASS, 0 FAIL, 1 NOTE

| # | result |
|---|---|
| 1 landing per role | PASS |
| 2 sidebar sets, admin item only with `admin:access` | PASS |
| 3 forbidden URLs → /403 (9) | PASS |
| 4 click every visible item, zero 403 | PASS |
| 5a promote: one refresh, teacher sidebar, no reload | PASS |
| 5b demote: exactly one refresh | PASS (refresh=1) |
| 6 hidden UI, word-family generate/save per role | PASS |
| 6 TEACHER exam notice, no start | PASS (F5 fixed) |
| 6 STUDENT whitelisted: start → quiz | PASS |
| 6 "Từ đã lưu" saved-words view | NOTE: no such view in the FE (0 hits). Spec item cannot be verified as written. |
| 7 socket re-auth: one refresh, reconnect, stays in room | PASS |
| 7 demotion in room: student stays logged in | PASS |
| 8 admin screens | PASS |
| 9 no permissions/roles in web storage | PASS |
| 10 long session: 4 flips over 214 s, one refresh each | PASS (refresh=4) |

### Notes

- Two round-3 setup attempts exited 1 and are kept in the record: the quiz seed ran before the services were up, and the word-family fixture had a shell export error. Both were rerun and passed.
- The `room-seed.sh` script printed stale output from a previous run in its first attempt. Its rerun, with services up, got login 201 and room 201.
- The earlier e2e-demotes-admin hazard did not recur: the e2e ran against `examio_e2e`, and the matrix DB was seeded afterwards.

### Status

- DONE. F5 and F3 cold load are verified live. The full matrix passes (64 PASS, 0 FAIL). The one NOTE is a spec gap: the "Từ đã lưu" view does not exist in the FE.
- Not verified: the 15-minute token-expiry socket path (authz_changed path used). The `permissions.generated.ts` git-diff drift check is still vacuous until committed.

## Re-temper 4 (socket SERVICE_UNAVAILABLE backoff, interceptor refresh policy, M2)

Scope: socket recovery moved to `examio-fe/src/hooks/study-room-socket-recovery.ts` (+ `lib/rbac/socket-reconnect.ts`): SERVICE_UNAVAILABLE retries with jittered backoff (1,2,4,8,16 s), `MAX_BACKOFF_ATTEMPTS = 5` (`socket-reconnect.ts:3`), give-up toast `rbac.studyRoomUnavailable`. `api.ts` refresh failure logs out only on 401/403. No product code changed in this pass.

### Static and regression

| check | result |
|---|---|
| FE build / lint | exit 0 / exit 0 |
| FE tests | 9 files, 84 tests pass |
| Full matrix `ui9.cjs` (items 1-10; run before the socket experiments) | 64 PASS, 0 FAIL, 1 NOTE ("Từ đã lưu", no such view in FE) |

Matrix items 1, 2, 3, 4, 5a, 5b (refresh=1), 6, 7 (promotion and demotion in room: one refresh, one reconnect, stays in room), 8, 9 and 10 (long session: four flips, one refresh each, 214 s) all PASS.

### M2: auth-service down mid-session, stale token (`r4-m2.cjs`): 11/11 PASS

- Student promoted by admin, then auth-service stopped.
- Client-side nav to `/k/word-family`: `GET /word-family/categories 401 TOKEN_STALE`, then `POST /auth/refresh 502 UPSTREAM_UNAVAILABLE`. The user is NOT redirected: path stays `/k/word-family`, sidebar still rendered.
- Auth restarted. Client-side nav to `/k/study-room`: `401 TOKEN_STALE` ×2 (single flight), `POST /auth/refresh 201`, then `GET /studyrooms/mine 200`. Path `/k/study-room`, room list rendered. Never sent to `/login`.
- Screenshots: `ui-screens/r4-m2-during-auth-outage.png`, `r4-m2-after-recovery.png`.

### Socket SERVICE_UNAVAILABLE backoff: mixed result

How the socket was made to fail: the exam-service handshake middleware returns `SERVICE_UNAVAILABLE` when its Redis `av` lookup fails (`examio-be/apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts:122,147`). Redis was stopped and restarted via docker.

Trigger notes: Chrome offline emulation does not close an established WebSocket, so the first attempt used `setOfflineMode`, which did nothing. The final method is `setOfflineMode(true)` for about 45 s (socket dropped by ping timeout), then Redis stopped while offline, then online again. Reloading the room page is an alternative trigger.

| run (log file suffix) | Variant B (recover) | Variant A (give up) |
|---|---|---|
| offline drop (first) | rig issue: no drop, no SU | not run |
| reload trigger | SU errors seen; no reconnect (exam-service had crashed) | 8 attempts, 5 SU, no toast |
| longer windows | SU at +56 s and +89 s; reconnect failed (exam down) | 9 attempts, 5 SU, toast not reached |
| final | **PASS**: SU seen, reconnected after Redis and exam restart, room snapshot restored on the same URL | 11 attempts, 5 SU, **give-up toast PASS**; silence check FAIL (checked only 4 s after the last attempt) |
| give-up verified | not repeated | exam-service crashed after SU #5; ECONNREFUSED repeats; toast not reached |

Backoff schedule, from the final run's timeline (`r4-ws-debug.json`, SU frame to next WebSocket attempt): +1.0 s, +1.8 s, +4.5 s, +6.9 s, +16.5 s. This fits the 1, 2, 4, 8, 16 s schedule with ±20% jitter.

Attempt count: the FE schedules a retry per SU until 5 retries are used, so the sequence is 1 initial + 5 retries = 6 handshakes, then give-up on the 6th failure. The brief said "5 attempts". The code does 6 handshakes. Please confirm which is intended.

### New finding F6: exam-service process exits when Redis is unavailable (blocks socket recovery)

- In each run, exam-service exited during the Redis outage: `exam.log` shows `[StudyRoom Redis sub] error: connect ECONNREFUSED` followed by an uncaught `MaxRetriesPerRequestError: Reached the max retries per request limit (which is 20)` with `triggerUncaughtException(err, true /* fromPromise */)`.
- The trigger seen in the first crash: `GET /api/v1/studyrooms/:id/leaderboard`. Path: `examio-be/apps/exam-service/src/modules/study-room/study-room.controller.ts:117-125` → `study-room.service.ts:187-190` (`assertRole` → `repo.findMemberCached`, `:72-80`) → `study-room.repository.ts:70-73` → `libs/redis/src/redis.service.ts:40-43`.
- The exact origin of the unhandled rejection is NOT confirmed. Candidate: the subscriber path (`libs/redis/src/redis.service.ts:118-132`, `subscriber.subscribe` not guarded), given the `[StudyRoom Redis sub]` log line. A targeted repro is still needed.
- Impact: once exam-service is down, the gateway returns `ECONNREFUSED` (no `SERVICE_UNAVAILABLE` frame), so the FE backoff never sees a SERVICE_UNAVAILABLE and cannot recover. Supervision is required to recover. In this rig the harness restarted exam-service each time.

### New finding F7: unbounded socket.io reconnect loop after the FE give-up path is skipped

- After exam-service dies, the socket keeps reconnecting on socket.io's built-in loop. In the give-up run, 127 `ECONNREFUSED` upstream errors appeared in about 10 minutes, at roughly 17-25 s intervals, with no toast and no stop.
- The FE give-up covers only SERVICE_UNAVAILABLE frames (`study-room-socket-recovery.ts:55-66`). Transport-level failures (gateway ECONNREFUSED) are outside it. socket.io's own reconnection is not capped in `examio-fe/src/hooks/useStudyRoomSocket.ts` (socket options at ~L47-50).
- Expected: a bounded, quiet retry with a give-up toast for any unreachable-room condition. Actual: unbounded retries until the page is closed.

### Screenshots and artifacts

- `ui-screens/r4-b-recovered.png` (after SU recovery), `r4-a-gave-up-toast.png` (last socket run, may show the page without the toast), `r4-m2-during-auth-outage.png`, `r4-m2-after-recovery.png`.
- `r4-m2-run.json`, `r4-live-run.json` (last socket run only; earlier runs are in the logs).

### Notes

- Socket scripts exit 0 even when checks FAIL (`process.exit(0)` in `finally`). Read the per-check results in the log, not the exit code.
- Redis was restarted by the harness after each outage. Exam-service was restarted by the harness after each crash.
- CI drift check and the 15-minute token-expiry path were not re-verified this round.

### Status

- DONE_WITH_CONCERNS. M2 PASS (11/11). Matrix regression PASS (64 PASS, 0 FAIL). Socket SU backoff: retry schedule and recovery verified, give-up toast verified in the final run. Silence after give-up not verified (checked too early). New findings F6 (exam-service crash on Redis outage, blocks recovery) and F7 (unbounded socket.io reconnect on gateway ECONNREFUSED). Both need owner review before phase 09 can pass.

## Re-temper 5 (F6 exam-service survives Redis outage, F7 capped socket.io reconnect, SERVICE_UNAVAILABLE silence)

Scope: F6 (`redis-io.adapter.ts`, `study-room.gateway.ts` sweep `.catch`, `libs/redis/src/redis.service.ts` error listener, `redis-unavailable.filter.ts` 503 mapping) and F7 (socket.io `reconnectionAttempts 5`, `delayMax 30 s`, give-up toast). No product code changed here. New round-5 socket scripts exit non-zero on any failed check (`r5lib.cjs` `finish()`).

### Static

| check | result |
|---|---|
| BE `yarn typecheck` | exit 0 |
| BE `yarn build:all` | exit 0. Exam-service dist rebuilt; it boots and listens on 3782, so the `ioredis/built/errors` import resolves. |
| FE build / lint | exit 0 / exit 0 |
| FE tests | 9 files, 86 tests pass |

### Results

| check | result |
|---|---|
| F6 outage 358 s, student in room, teacher probing (`r5-f6.cjs`) | exam-service pid unchanged for the whole outage: **PASS** |
| F6 Redis-dependent routes during outage | leaderboard: **504** on the first call (gateway timeout while exam-service spent its Redis retry budget), then **503**; room GET 503; `/studyrooms/mine` 200 (no Redis dependency). Documented. The 504-first-then-503 behaviour is FAIL against the strict 503 wording. |
| F6 no uncaught exceptions in `exam.log` during the outage | **PASS** (0 markers) |
| F6 5-minute focus sweep ran during the outage and failed as a warning | **PASS** (1 `focus sweep failed` warning, no crash) |
| F6 recovery: socket reconnects with the same pid, presence broadcast teacher → student, room still visible, leaderboard 200 | **PASS** (3 checks) |
| F7 exam-service stopped with student in room (`r5-f7.cjs`): capped reconnects | **PASS**: 5 attempts at +1, +2, +8, +14, +30 s |
| F7 give-up toast | **PASS**: appeared at +30 s |
| F7 zero further attempts for 60 s after give-up | **PASS** (0) |
| F7 exam restart, leave and re-enter, room works | **PASS** (leave 201, join 201, new socket connects, snapshot shows) |
| F7 "toast visible" re-check 60 s after the give-up | FAIL, harness: toast had auto-dismissed. The give-up itself was seen at +30 s. |
| SU silence (`r5-su.cjs`, Redis down + room reload, exam alive): retries, give-up, 60 s silence | **FAIL, F6 regression (see below).** exam-service crashed in 2 of 2 runs. Give-up toast seen at +122-127 s and 0 attempts for 60 s afterwards, but no `SERVICE_UNAVAILABLE` frames were reproduced in these runs. |
| Regression matrix (`ui9.cjs`) items 1-10 | 64 PASS, 0 FAIL, 1 NOTE. **5b PASS** (refresh=1). **7 PASS** (one refresh, one reconnect, stays in room, demotion keeps student logged in). **10 PASS** (4 flips, 215 s, one refresh each). |

### F6 regression: exam-service still dies on a Redis outage with socket disconnects (BLOCKING)

- Evidence: both SU runs: exam-service pid gone, `exam.log` ends with `MaxRetriesPerRequestError: Reached the max retries per request limit (which is 20)` raised from `ioredis/built/event_handler.js:207` (`flushQueue`). Uncaught process exit, as in round 4 F6.
- Reproduced when the student's socket disconnects while Redis is down (page reload). Not reproduced in the 358 s outage run, where no socket disconnected during the outage.
- Most probable code path, not confirmed by stack: `examio-be/apps/exam-service/src/modules/study-room/study-room.gateway.ts:182-187`. `handleDisconnect` is `async`, and it awaits `onLeave` (`:230`) for every joined room with no try/catch. `onLeave` (`:230-232`) awaits `flushFocus` and `state.clearPresence`, which hit Redis. An exhausted-retry rejection escapes the disconnect handler.
- Also unverified: whether other unawaited main-client Redis calls (default `maxRetriesPerRequest` 20 in `libs/redis`) are a second source.
- Expected: exam-service survives any Redis outage; disconnect cleanup catches and logs. Actual: process exits.

### Other observations

- Redis 504 vs 503: first Redis-dependent call returns 504 after the gateway timeout. Later calls return 503 fast. Documented, not a crash.
- Chrome offline emulation closes the WebSocket immediately (not after the ping timeout), and socket.io does not auto-reconnect after that close in our runs. This is a harness artefact, so the SU test uses a room reload as the trigger.

### Artefacts

- `r5-f6-run.json` (includes per-probe statuses in `outage.statuses`), `r5-f7-run.json` (attempt timeline), `r5-su-run.json` (last SU run).
- Screenshots: `ui-screens/r5-f6-after-recovery.png`, `ui-screens/r5-f7-reentered.png`.

### Status

- DONE_WITH_CONCERNS. Static gates green. F7 cap and give-up verified live. F6 survives a 358 s outage with focus sweep, 503 routes and broadcast recovery, but **exam-service still crashes when a socket disconnects during a Redis outage**. The SU silence item is not verified, because the crash interrupts it. Regression matrix 5b, 7 and 10 PASS.

## Re-temper 6 (exam-service survives socket disconnects during a Redis outage; graceful shutdown; regression)

Scope: BE `runSafely` / `StudyRoomWsExceptionFilter` (`study-room-redis-safety.ts`), `handleDisconnect` / `handleConnection` / sweep wrapped, `libs/redis` quit and subscriber guards. No product code changed in this pass. Scripts exit non-zero on any failed check.

### Static

| check | result |
|---|---|
| BE `yarn typecheck` | exit 0 |
| BE `yarn build:all` | exit 0 (exam-service dist rebuilt; it boots) |
| FE `yarn test` | 9 files, 86 tests pass |

### Results

| # | item | result |
|---|---|---|
| 2 | crash repro, run 1 (`r6-crash.cjs`, Node socket.io clients, Redis down 276 s, 18 rounds of disconnects, reconnects and WS messages) | **PASS 11/11**: exam pid 4779 unchanged, 0 uncaught markers, SERVICE_UNAVAILABLE error frames captured |
| 2 | crash repro, run 2 (same script) | **PASS 11/11**: same pid, same frames |
| 2 | crash repro, run 3 (browser reload, `r5-su.cjs`, ~5 min Redis down) | exam pid unchanged, no crash: **PASS** for the crash part. Item 4 result below. |
| 2 | WS messages during outage return `error` with code `SERVICE_UNAVAILABLE` (not a crash) | **PASS**. Frame: `{"code":"SERVICE_UNAVAILABLE","message":"Dịch vụ tạm thời không khả dụng, vui lòng thử lại…"}`. Also seen: `FORBIDDEN` for a non-host control message. |
| 3 | Redis restarted, same exam pid, rejoin works, presence broadcast teacher → student, leaderboard 200 | **PASS** (both crash runs): pid 4779 unchanged; room snapshots to both clients; `presence:updated` on the student socket; leaderboard 200 |
| 4 | SERVICE_UNAVAILABLE give-up with exam alive: reload, retries, give-up toast once, then 60 s zero attempts | Give-up **PASS**: 6 SU errors (+43, +127, +169, +212, +254, +296 s), toast at the 6th, zero further attempts in 60 s, exam pid unchanged. **FAIL on the cap check**: 15 WebSocket attempts in total (strict limit 6). See F8. |
| 5 | SIGTERM with Redis down and an open socket | **PASS** (documented): exit by signal SIGTERM immediately (0 s). No `quit()` rejection and no unhandled markers. The process exits by default signal termination; no app shutdown hook runs. |
| 6 | regression matrix 5b, 7, 10 (full `ui9.cjs`) | **64 PASS, 0 FAIL, 1 NOTE** ("Từ đã lưu" absent in FE). 5b refresh=1. 7 PASS. 10 PASS (4 refreshes, 215 s). |

Exam-service log for the round-6 instance window: 0 uncaught or unhandled markers, 0 unhandled `MaxRetriesPerRequestError` (the round-5 crash form), 28 handled `av lookup failed` entries, 3 focus-sweep warnings.

### F8 (new, minor, socket.io transport attempts not capped)

- During the SERVICE_UNAVAILABLE phase the socket made 15 WebSocket attempts in about 5 minutes. Only 6 namespace SERVICE_UNAVAILABLE errors arrived, and the FE gave up at the 6th.
- The extra transport attempts are socket.io reconnects that open an engine connection and then fail or time out before the namespace answer. Socket.io resets its reconnect counter whenever the engine opens, so `reconnectionAttempts: 5` (`examio-fe/src/lib/rbac/socket-reconnect.ts`, `TRANSPORT_RECONNECT_OPTIONS`) does not cap them.
- Expected by the brief: ≤5 retries, then give up. Actual: the give-up is capped at the 6th namespace error, but the transport attempts between errors are not.
- Impact: noisy and slow but bounded in time (no tight loop, and silent for 60 s after give-up). Not a crash.

### Artefacts

- `r6-crash-run.json` (run 2, same results as run 1), `r6-sigterm-run.json`, `r6-su-run.json` (run 3), `temper-raw.json` (rows prefixed `re-temper-6:`).
- Note: the round-5 `r5-su-run.json` was overwritten by this run's copy; it is preserved as `r6-su-run.json`.

### Status

- DONE_WITH_CONCERNS. The round-5 F6 crash is fixed: three repro runs keep exam-service alive through Redis outages of 4-5 minutes with disconnects, and WS messages return SERVICE_UNAVAILABLE. Restore works on the same pid. Graceful shutdown with Redis down exits cleanly by signal. The matrix regression holds. Open: F8 (socket.io transport attempts uncapped between namespace errors), which is cosmetic and bounded.

## Re-temper 7 (socket reauth with auth refresh failing: ghost-join guard, recovery, give-up)

Scope: `examio-fe/src/hooks/study-room-socket-recovery.ts` changes: a reauth refresh failing with 429/5xx/network keeps the session and retries with the capped backoff, then the single give-up toast; `disposed` guard so an in-flight refresh cannot reconnect or re-JOIN after unmount. No product code changed in this pass.

### Rig

- Auth outage was emulated with a local auth proxy (`auth-proxy.cjs`, port 3790). The gateway's `AUTH_SERVICE_URL` pointed at the proxy. A mode file controls `/auth/refresh` only: `pass`, `refresh502` (answers 502 UPSTREAM_UNAVAILABLE), `refreshslow` (holds 10 s, then forwards). Promotions and the authz event still travel by their normal paths, so the reauth arrives while the refresh fails. Stopping auth-service would have dropped the outbox relay that publishes the event.
- Ghost-join navigation was done inside the SPA (`history.pushState` + `popstate`), not a page load, so the in-flight refresh survives the unmount.

### Static

| check | result |
|---|---|
| FE `yarn build` / `yarn lint` | exit 0 / exit 0 |
| FE `yarn test` | 9 files, 86 tests pass |

### Results (`r7-reauth.cjs`, artefact `r7-reauth-run.json`): 27 PASS, 2 FAIL

| # | item | result |
|---|---|---|
| 3 | Ghost-join: reauth refresh still in flight (10 s), user leaves the room. Refresh completes AFTER navigation (201). | **PASS**. No WebSocket created after navigation, no `room:join` sent, no namespace connect, user on the destination page, not /login. |
| 2a | Refresh fails 502 during reauth: user NOT sent to /login, stays on the room URL, room still rendered | **PASS** |
| 2b | Restore auth within the backoff window → a retry refresh succeeds (201) and the socket reconnects, WITHOUT a page reload | **FAIL** (F9). No refresh retry happens. Socket attempts after restore fail (see F9). |
| 2c | Page reload after the outage restores the socket and room snapshot | **PASS** (fallback path only) |
| 2d | Auth kept down: single give-up toast, not /login, zero refresh and zero socket attempts for 60 s after give-up | **PASS**. Toast at +37 s after reauth; 0 refresh and 0 WebSocket attempts in the 60 s after it; still on the room URL. |
| 4 | Regression matrix 5b and 7 (full `ui9.cjs`) | **PASS**. 64 PASS, 0 FAIL, 1 NOTE. 5b: refresh=1. 7: auth:reauth, exactly one refresh, one reconnect, stays in room, demotion keeps the student logged in. |

### F9 (new, blocking for recovery): a stale-token reconnect is never refreshed

- Verified: the gateway rejects a `/ws/study` upgrade that carries a stale access token with **HTTP 401** before the namespace is reached. socket.io reports it as `connect_error` with message `websocket error` (`stale-upgrade.cjs`: "Unexpected server response: 401"). No namespace error code arrives.
- The FE only refreshes on namespace token codes. The chain:
  - `examio-fe/src/hooks/study-room-socket-recovery.ts:81-85`: a transient refresh failure takes `scheduleBackoff()` and clears `reauthTried`.
  - `:63-66`: the backoff timer only calls `connect()`. It never refreshes.
  - `:114-117`: `connect_error` with `websocket error` goes to `onSocketError`. `examio-fe/src/lib/rbac/api-error-policy.ts:73` (default) maps it to no action.
- Result: after the proxy is restored the socket keeps reconnecting with the same stale token, the upgrade is rejected each time, and the room stays dead until a page reload. Logged in the run: 3 WebSocket attempts after restore, 0 refresh calls.
- Expected: a backoff retry after a transient refresh failure refreshes first, then reconnects. Actual: it reconnects with the stale token only.
- Fix direction: when a retry follows a transient refresh failure, refresh before `connect()` (or map a `websocket error` from a stale upgrade to a refresh).

### Artefacts

- `r7-reauth-run.json` (last run), `r7-debug.json` (frame and request timeline of the last run), `ui-screens/r7-a-after-restore.png`.

### Status

- DONE_WITH_CONCERNS. Ghost-join guard verified (no reconnect or re-JOIN after unmount). Give-up path verified (single toast, zero attempts for 60 s, not /login). Recovery is FAIL: F9 means the socket does not come back after auth recovers without a reload. Regression 5b and 7 PASS.

## Re-temper 8 (F9 fix: refresh retry on the backoff path; stale-upgrade refresh; offline token aging; genuine network fault)

Scope: `examio-fe/src/hooks/study-room-socket-recovery.ts` after the F9 change (`refreshPending`, backoff retries the refresh, one refresh on a `websocket error` per disconnect cycle). No product code changed in this pass. Rig as round 7: auth proxy (3790) with mode file; gateway upstream pointed at the proxy. Admin role calls go to admin-service directly (`/api/v1/admin/roles/users/:id/role` on 3785) when the gateway is down.

### Static

| check | result |
|---|---|
| FE `yarn build` / `yarn lint` | exit 0 / exit 0 |
| FE `yarn test` | 9 files, 86 tests pass |

### Results

| # | item | result |
|---|---|---|
| 2 | Recovery: refresh 502 during reauth; proxy back to `pass` inside the backoff window | **PASS**. Refresh requests during the outage: 4 failed (502), then one 201 at the first retry after restore. Socket reconnects, `room:snapshot` received, same URL, no page reload, never /login. Refresh count is within the backoff attempts, but see F10 for the duplicate pairs at the start of the cycle. (`r7-reauth.cjs`, 29/29 PASS in this run.) |
| 3 | Give-up (auth kept down): single toast, then 60 s zero refresh and zero WS attempts, still on the room URL | **PASS**. Toast at +35 s after the reauth; 0 refresh and 0 WS attempts in the 60 s after; URL unchanged, not /login. |
| 4 | Offline token aging: socket down (gateway killed, which closes it at once), token ages (student promoted through admin-service direct), gateway back | **PASS** (10/10, `r8-age.cjs`). Socket reconnects, **exactly one refresh** (201), no `auth:reauth` frame needed, room snapshot restored on the same URL, no /login. |
| 5 | Genuine network fault: gateway down for the whole cap (120 s observed) | Toast **PASS** (single transport give-up toast at +27 s). Silence **PASS** (0 refresh and 0 WS attempts in the last 60 s). **FAIL** on the cap: 9 refresh requests while the gateway was down, against 5 WebSocket attempts (expected at most 1). See F10. |
| 6 | Ghost-join guard | **PASS** (6/6 from `r7-reauth.cjs`, in this round's run). |
| 6 | Regression 5b and 7 (full `ui9.cjs`) | **PASS**: 64 PASS, 0 FAIL, 1 NOTE ("Từ đã lưu"). 5b refresh=1. 7: one refresh, one reconnect, stays in room, demotion keeps the student logged in. 10: one refresh per flip. |

### F10 (new, blocking for the cap): two refreshes per reconnect cycle

- Each socket.io reconnect attempt that fails at the upgrade raises a `connect_error` with `websocket error`. The handler starts a refresh: `examio-fe/src/hooks/study-room-socket-recovery.ts:136-140`.
- That refresh fails with a network error. The catch clears `reauthTried` (`:98`) and schedules the backoff (`:99-100`). The backoff timer then runs `runRefresh()` again (`:72`).
- The next socket.io attempt raises another `websocket error`. The guard `!reauthTried && !refreshing` at `:136` is true again, because `:98` cleared `reauthTried`. So a second refresh runs immediately, about one second after the first.
- Observed: 9 refresh requests against 5 WebSocket attempts while the gateway was down; in round 7 and item 2 the same pairs appear at the start of the cycle.
- Expected: at most one refresh per disconnect cycle, then the transport give-up. Actual: two per attempt, which is a refresh storm for the length of the cap.
- Fix direction: do not start a refresh from `connect_error` while a backoff timer or a refresh is pending (check `backoffTimer` and `refreshPending` there), and keep `reauthTried` set across the transient-failure retry.

### Correction to the round-8 diagnostic

- `r8-probe2.cjs` reported "no transport give-up toast". That was a late check: the toast auto-dismisses after about 4 s, and the probe read it 90 s after the kill. `r8-net` observed the toast at +27 s. The give-up toast does appear.

### Artefacts

- `r8-age-run.json` (item 4), `r8-net-run.json` (item 5), `r8-reauth-run.json` (items 2, 3, 6), `ui-browser-run.json|txt` (regression), `ui-screens/r8-4-offline-aging-recovered.png`.
- Scratch only: `r8-probe.cjs`, `r8-probe2.cjs`, `stale-upgrade.cjs`.

### Status

- DONE_WITH_CONCERNS. F9 is fixed: recovery after a 502 works without a page reload (item 2), and a token that aged while offline recovers with exactly one refresh (item 4). Give-up silence holds (items 3 and 5), and the give-up toast appears on a genuine network fault. Open: F10 (two refreshes per reconnect cycle, item 5 cap), which needs an owner fix before the phase passes. Ghost-join and regression 5b and 7 PASS.

## Re-temper 9 (F10 fix: refresh driven only by the initial trigger and the backoff schedule)

Scope: `examio-fe/src/hooks/study-room-socket-recovery.ts`. The `connect_error` "websocket error" path and the namespace refresh-reconnect path both skip while `refreshPending` is set, so the backoff timer owns the retry. No product code changed in this pass. Rig as rounds 7-8 (auth proxy, gateway upstream through the proxy, admin-service direct when the gateway is down).

### Static

| check | result |
|---|---|
| FE `yarn build` / `yarn lint` | exit 0 / exit 0 |
| FE `yarn test` | 9 files, 86 tests pass |

### Results

| item | result |
|---|---|
| 1 | Static gates above: PASS |
| 2 | Genuine network fault, gateway down for the whole cap (`r8-net.cjs`, artefact `r9-net-run.json`): **PASS 6/6**. Refresh requests at +1.3, 2.1, 4.3, 8.7, 17.8 s after the gateway kill (5 in total). Gaps 0.8, 2.2, 4.4, 9.1 s, which is the initial trigger then the 1/2/4/8 s backoff ticks ±20%. **No pairs** (no two refreshes within 0.5 s). WebSocket attempts at +1.3, 3.4, 5.7, 10.3, 31 s. Single transport give-up toast at +31 s. Zero refresh and zero WebSocket attempts in the 60 s after. |
| 3 | 502 then auth back inside the backoff window (`r7-reauth.cjs` items 2a-2b, artefact `r9-reauth-run.json`): **PASS**. Refresh requests at +4.1, 5.0, 7.0, 11.1 (502) and +18.5 (201) after the reauth. Gaps 0.9, 2.0, 4.1, 7.4 s, matching the backoff schedule. **No pairs** (asserted). Socket reconnects once, the snapshot is restored, the URL is unchanged, and the user is never sent to /login. |
| 4 | Offline token aging (`r8-age.cjs`, artefact `r9-age-run.json`): **PASS 10/10**. Exactly one refresh (201) after the gateway returned, no `auth:reauth` frame needed, socket reconnects, room snapshot restored on the same URL, no /login. |
| 5 | Give-up silence with auth kept down (`r7-reauth.cjs` item 2d): **PASS**. Single give-up toast at +38 s after the reauth, then 0 refresh and 0 WebSocket attempts in the following 60 s, still on the room URL and not on /login. |
| 6 | Regression matrix, full `ui9.cjs`: **64 PASS, 0 FAIL, 1 NOTE** ("Từ đã lưu" absent from the FE). Items 5b (refresh=1 on demotion), 7 (one refresh, one reconnect, stays in room, demotion in room keeps the student logged in) and 10 (one refresh per flip) all PASS. |
| 6 | Ghost-join guard (`r7-reauth.cjs` item C): **PASS 6/6**. The refresh completed after the user left the room (201). No WebSocket created after the navigation, no `room:join` sent, no namespace connect, and the user stays in the app. |

### F10 status

- Closed. Recovery (item 3) and the network-fault cap (item 2) both show no refresh pairs. The network-fault run went from 9 refresh requests (round 8) to 5, all on the backoff schedule.

### Artefacts

- `r9-net-run.json`, `r9-reauth-run.json`, `r9-age-run.json`, `ui-browser-run.json|txt` (regression), `ui-screens/`.

### Status

- DONE. All items in the re-temper-9 brief pass: F10 is fixed, the backoff cap holds, recovery works without pairs, offline token aging needs exactly one refresh, the give-up is silent, and the regression holds.

## Final verification set (gate input)

`temper-raw.json` keeps the full history (every round, including the failed runs that found F1-F10). `temper-results.json` is built from `temper-final.json`: the latest passing proof of each check against the FINAL code — the `final:` static rows (BE typecheck, full unit suite 1688/1688, build:all, generator; FE build, lint, 86 tests; greps), all `re-temper-9:` rows (FE + socket live + matrix, after the last FE change), the round-6 BE Redis-outage live rows (`re-temper-6:` crash repro x2, SIGTERM, matrix, log scan; BE code unchanged since), the auth e2e on the dedicated DB (`re-temper-3:`, auth code unchanged since), the refresh-cookie rotation live probes (rcr / rcr2) and the CI YAML load. Every failed historical row is superseded by a later passing row of the same check in that set.
- Human sign-off: user approved "Ký duyệt + commit" on 2026-10-22 (riskGate.humanSignedOff=true).
