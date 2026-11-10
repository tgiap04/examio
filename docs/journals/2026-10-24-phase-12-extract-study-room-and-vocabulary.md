# Phase 12: study-room and vocabulary extracted, and an audience gap only the live stack caught

**Date**: 2026-10-24 02:32
**Severity**: high
**Component**: examio-be study-room-service (new), vocabulary-service (new), exam-service (to-flashcard bridge), auth-service (SERVICE_AUDIENCES), gateway routes.yaml, deploy/compose, .github/workflows/ci.yml, libs/grpc
**Status**: resolved

## What Happened

Phase 12 cut the first two strangler services out of exam-service. Ten commits in `6a7248e..8c645bd`: the shared public-profile client (`b6b2c79`), study-room (`757647f`), vocabulary (`bab57d1`), the auth audience fix (`4a0eed0`), gateway routing (`47723dc`), compose/broker/CI (`19d351d`), cross-app tests (`1229afe`), docs (`1ed6c34`), and the phase 11 journal and plan sync.

What shipped:
- **study-room-service**: HTTP plus Socket.io `/ws/study`. The `studyroom.events` consumer runs in the API process, so it is one container with no worker, no ROLE env and no gRPC server. Redis adapter key `studyroom`.
- **vocabulary-service**: HTTP plus gRPC on 50051. `WordFamilyAdminService` moved over, and `WordFamilyService.GetWordFamily` is new. `ROLE=api,worker` in one process; the worker runs the R2 delete poller.
- **exam** lost its gRPC server. `POST word-family/:id/to-flashcard` stays in exam, because it writes content, and reads the family through `GetWordFamily`.
- **RT-15 fix**: the bridge used to look up new cards by `question` across all users. Card ids are now pre-assigned with `crypto.randomUUID()`. The e2e mutation check gave 6 links instead of 2 against the old lookup.
- The public-profile client moved to `libs/grpc`.

## The Brutal Truth

The galling part: the unit and e2e suites were green for to-flashcard the whole time, and the route returned 500 on the live stack. The harness faked the service token client, and a fake accepts any audience. Only temper stage 4 found it.

The RabbitMQ race is worse. A root `docker exec` ran before the broker wrote its cookie, and the broker died on every cold start. It has been in CI since phase 03. The first temper run hung on it for about an hour, per the session account; the runs file has no timestamp for that.

The tired truth: builds lost up to about five hours to a DNS outage, and the build agents died during it. That cost is outside our control, but the wait loops that sat on it had no deadline.

## Technical Details

- **F1**: exam logged `Service token request for "vocabulary" failed with HTTP 401`. Live route: `500 INTERNAL`. Cause: `apps/auth-service/src/token/service-clients.ts` `SERVICE_AUDIENCES` had no `vocabulary`. Fixed by adding it. Regression: `test/cross-app/service-audiences.spec.ts` statically collects every `attach(metadata, '<aud>')` and was RED before the fix. Live recheck 9/9, TEACHER to-flashcard 201, 3 cards, foreign identical-question card linked 0.
- **Cookie race**: `Error when reading /var/lib/rabbitmq/.erlang.cookie: eacces`. Root `docker exec rabbitmq-diagnostics` reproduced 6/6. `docker exec -u rabbitmq` gave 3/3 OK. The CI wait loop in `.github/workflows/ci.yml` now runs as `rabbitmq`.
- **Outage**: `getaddrinfo ENOTFOUND registry.yarnpkg.com` at the yarn step. First-attempt durations 17671 s and 3142 s. Retried one image at a time with a 900 s deadline, all 16 exit 0.
- **Final static**: `TZ=UTC yarn test` 2019 passed. `check:deps` and `check:ownership` green. Compose-topology and render-definitions specs 32/32.
- **Live**: `up -d --wait` from an empty volume exit 0 in 39 s. Smoke 18/18. UI matrix 64 PASS, 0 FAIL, 1 NOTE. Banned member disconnected 0.45 s after the ban. Cross-replica chat 6/6 through the Redis adapter.
- **Side incident (facts only)**: `meetio-postgres-1` and `meetio-redis-1` were up at the stage 6 teardown and gone at the stage 6b check. Their volumes `meetio_postgres-data` and `meetio_redis-data` are intact. The audit of every rm, down and stop in the run found none touching `meetio-*`; the compose teardown was scoped with `-p p12t`. The Docker VM uptime was about 7.2 h at 19:24 UTC on 2026-10-23, which fits a VM restart. Cause unconfirmed. We did not restart anything.

## What We Tried

- **Temper 1**: static gates green. The first live run hung on the cookie race and was fixed in CI.
- **Stage 2**: exam e2e 213 failed on `QUIZ_JWT_SECRET is required`. A harness env gap; re-run 213/213.
- **Stage 4**: F1 found by the live to-flashcard check. Fixed in auth, then re-proven live.
- **Stage 5**: WS through the gateway passed except two premise and environment fails (see Deferred).
- **Stage 6**: UI matrix 58/3/1. The fails were a missing exam-session fixture, a Puppeteer detached-frame flake, and a NOTE whose expected label does not exist in the FE. Not product defects.
- **Stage 6b**: a fixture and ten study-room script runs. Final run 36/38, with one fail on the access-mode select (F14). Matrix re-run 64/0/1.

## Root Cause Analysis

F1: `SERVICE_AUDIENCES` is a hand-kept list with nothing tying a caller's audience string to auth's allowlist. The fakes hid the gap.

Cookie race: root-owned `docker exec` writes `.erlang.cookie` before the server does, and the broker cannot read it back. It shows only on cold starts, so CI passed often enough to hide it.

Outage: external. Our side was an unbounded wait and no quick way to separate a DNS failure from a Dockerfile failure.

## Decisions

- **Non-host `PUT /studyrooms/:id` stays 403** in this move-only phase. Changing it to 404 changes a response, so it goes to M1. Set aside: mapping to 404 now, which would have moved the FE and the matrix in the same phase.
- **F2**: category images outside `word-family/` are not deleted, because vocabulary deletes only keys it owns. User decision 2026-10-24: keep as is, follow-up later.
- **One study-room container.** The consumer needs the Socket.io server and the Redis adapter in one process. Set aside: a separate study-room worker, which would need its own socket server.
- **exam no longer depends on vocabulary in compose.** The gRPC client is lazy; to-flashcard answers 503 while vocabulary is down.

## Lessons Learned

- A fake of a cross-service auth client needs at least one live or contract check of the real token path. Keep the static audience spec, and still run one live call for every new audience.
- Every wait loop needs a time box and a check for container exit. The RabbitMQ wait sat on a dead broker for about an hour.
- Run diagnostic `docker exec` as the service user. A root exec writes root-owned files into volumes the service must read.
- Classify a build failure before you retry it. `ENOTFOUND` is the network, not the Dockerfile. Retry sequentially with a deadline.
- Fixture data must match the real shape. F9 (`rootWord` missing) and F13 (the seed made the STUDENT account a TEACHER) each cost a run.

## Next Steps

- **M1** (404 for non-host and unknown-room PUT, plus the FE and the spec together). Owner: unassigned. Phase 19 cleanup or a small dedicated phase.
- **M2 / F2** (admin image upload under `word-family/`). User decision: follow-up on the roadmap.
- **F4** (no SYSTEM_ADMIN-only account in the role model). Owner to decide whether a fixture should exist. Until then the case is proven at service level only.
- **F14** (create-room access-mode select not automatable). Manual UI check before release. Owner: whoever signs off the FE.
- **F15** (no saved-list view) and **F16** (category delete is a soft delete that keeps the row). Owner to decide scope.
- **D5 remainder** (`libs/redis` deep-imports `ioredis/built/errors`) and the **stale `authz_changed` binding** on `exam.events` on a pre-existing broker. Phase 16 cutover, broker reset.
- **Docs debt**: the `docs/system/overview.md` ASCII topology still omits the two services, and the legacy sections of `docs/system/permissions.md` are stale beyond the patched phase-12 lines. Carried to phase 19 as a `[CARRIED from 12]` line.
- **meetio containers**: the user checks the Docker VM restart log and the `meetio` stack. Nothing in this run to fix.
