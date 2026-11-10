# Phase 09 frontend RBAC: unit gates green, live 3-account matrix failed until round 9

**Date**: 2026-10-22 06:12
**Severity**: high
**Component**: examio-fe session, guards and study-room socket; examio-be auth-service (`/auth/refresh`) and exam-service study-room (Redis path)
**Status**: resolved

## What Happened

Phase 09 moved the FE onto server-sent `permissions`: route guards, a permission-driven sidebar, a role-based `/k` landing, `TOKEN_STALE` refresh, and study-room socket re-auth. Build, lint, 43 FE unit tests and BE typecheck were green from the first round. The live matrix (headless Chrome, three accounts: STUDENT, TEACHER, STUDENT+SYSTEM_ADMIN) failed on the first valid run. A student was logged out about 60 s after a refresh, and a demotion fired two `/auth/refresh` calls where the spec allows one. Nine temper rounds later the matrix reads 64 PASS / 0 FAIL / 1 NOTE. The fixes reached well outside the phase's file ownership: auth-service, exam-service and `libs/redis`.

## The Brutal Truth

Green unit tests gave a false sense of done. The matrix caught what they could not, and it caught it only because we ran it against real time windows. The galling part is F1: the refresh-cookie bug was already on `main`, and the fix is one missing `Set-Cookie` on `/auth/refresh`. The other sting is our own harness. Runs 1–4 were invalid. The service launcher expanded the RabbitMQ password at write time, so `auth.user.authz_changed` never flowed and the outbox logged `ALERT outbox: N unpublished`. The e2e helper also demoted the fixture admin on the matrix DB, and we restored it by hand in SQL. The socket scripts ended in `process.exit(0)` even on FAIL, so round 4's silence check was misread until round 5 made failures exit non-zero.

## Technical Details

- F1 `auth.controller.ts`: `/auth/refresh` set only `accessToken`. Refresh #1 gave 201. Same cookie jar at +62.3 s gave `401 "Invalid or expired refresh token"` (`REFRESH_GRACE_MS` = 60 s).
- F6 exam-service: uncaught `MaxRetriesPerRequestError: Reached the max retries per request limit (which is 20)` on a Redis outage. The process exited.
- F7: 127 `ECONNREFUSED` in about 10 minutes from an uncapped socket.io reconnect loop.
- F9: a stale-token `/ws/study` upgrade returns HTTP 401. socket.io reports only `websocket error`, so no refresh ran.
- F10: 9 refresh requests against 5 WebSocket attempts during a gateway outage. After the `refreshPending` guard: 5 and 5, no pair within 0.5 s.
- F8 (open): 15 WebSocket attempts in about 5 minutes against a strict cap of 6.

Numbered findings are F1–F3 and F5–F10: nine product defects. F4 is an operational throttle risk, not a defect.

## What We Tried

- **Round 1**: 50 PASS, 1 FAIL, 2 NOTE. Pinned F1 with a cookie-jar probe.
- **Re-temper 1**: single-flight `getUser` (F2) and keep-session on transient errors (F3). A cold load on 502 or 429 still sent the user to `/login`.
- **Re-temper 3**: `probeSession` returns ok | cleared | unavailable, and a `SessionUnavailable` screen replaces the redirect (F3 closed). The teacher stats call is gated (F5). Matrix 64/0/1.
- **Re-temper 4**: socket backoff 1, 2, 4, 8, 16 s. Exam-service crashed during the Redis outage (F6 found).
- **Re-temper 5**: fixed the crash for an outage with no disconnects. It still crashed when a socket disconnected during the outage. The round-4 patches went site by site and missed `handleDisconnect`.
- **Re-temper 6**: `runSafely` around the disconnect, sweep and connection paths, plus a subscriber error listener. Pid stayed fixed over 276 s with 18 disconnect rounds. The exact stack origin of the first unhandled rejection was never confirmed.
- **Re-temper 7–9**: F9 fixed, then F10 introduced by the reconnect interaction, then closed by letting the backoff timer own the retry.

## Root Cause Analysis

Three causes sit under the symptoms.

1. The refresh contract was half built. The rotated token went into the JSON body, but the web client reads cookies only. No test refreshed twice more than 60 s apart, so nothing exercised the grace window.
2. Exam-service treated Redis as infallible. Un-awaited adapter commands and an async disconnect handler had no catch, so the rejection escaped to the process. We patched call sites one at a time instead of auditing the class.
3. Socket recovery had three owners of refresh (`connect_error`, the backoff timer, and `auth:reauth`), each with its own guard. Nothing enforced one refresh per cycle.

## Lessons Learned

- A rule with a time window needs a check that runs past the window. Ten-second tests will not catch a 60-second bug.
- When one call site crashes a process, audit the whole class of calls before the next run.
- Every harness script must exit non-zero on a failed check. Read the per-check log, not the exit code.
- Keep the full run history (`temper-raw.json`) apart from the verified set (`temper-final.json`). The evidence gate rejects historical failed rows, which is correct.
- Use a dedicated e2e database. Never share it with matrix fixtures.
- Phase file status updated to Completed (committed `f2a122b..9fb5bc7`); `permissions.generated.ts` is tracked, so the CI drift check is live.

## Next Steps

All items have owners in `phase-09-frontend-rbac.md`, "Deferred / carried".

- Live 15-minute `exp` socket run (D12): lead, in the phase-16 cutover smoke. Not run; only the `authz_changed` path is proven.
- Cap socket.io transport attempts (D1 / F8): lead, phase 16.
- Decide "Từ đã lưu" (D10, absent from the FE) and the "Sinh bằng AI" vs "Sinh từ con" copy (D11): user.
- Auth global throttle, 30 req/60 s per IP (D15): user, before cutover.
- Refresh body token (D7): user, phase 18.
