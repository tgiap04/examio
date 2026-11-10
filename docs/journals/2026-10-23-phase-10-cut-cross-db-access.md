# Phase 10 cut cross-DB access: static gates green from day one, the live stack found the real faults

**Date**: 2026-10-23 09:00
**Severity**: high
**Component**: kmaedu-be finance, auth, admin, exam, gateway (owner RPC cut); libs/redis study-room adapter; kmaedu-fe admin finance modal
**Status**: ongoing

## What Happened

Phase 10 moved money and user data behind owner RPCs. Admin stopped touching `wallet` and `payment` directly, exam stopped reading `user`, and the FE stopped reading `user.wallet`. Commits `2c76da1..a97adb4` (15) landed it. Part A (money and protos) went first, then B1 and B2 in parallel by file ownership. The parallel run went wrong: one agent's `git stash` wiped another's uncommitted edits, and a concurrent `yarn build` ran `deleteOutDir` under a live tester. New rule: no stash, no concurrent builds, testers run from a dist copy.

Round 4 closed the targeted scope. Money acceptance is not fully met: the AI upload path still double-charges on a client retry. The user accepted that as an interim until phase 15.

## The Brutal Truth

Every static gate was green before anything ran live, and that told us nothing about what broke. The dist could not boot, and the study-room fan-out had been dead since before this phase.

The galling part is B2. The fix is a key derivation change, but the key comes from `generateId()` on every HTTP call, so a retry is a new charge. We saw it in the code in round 1 and still carried it as an interim. Defensible, but a real money path stays open.

The admin credit modal had never worked end to end. Every click returned 400 because the FE and BE DTOs had drifted.

## Technical Details

- B1: `nest-cli.json` copied only some protos. `node dist/apps/admin-service/main.js` → `ENOENT … finance_admin.proto`. Guarded by `test/build/proto-assets.spec.ts`.
- N1 (pre-existing): `PUBSUB NUMPAT` = 0, so cross-instance presence, chat and media returned 0 events. Fixed: NUMPAT 1, NUMSUB 2, 3/3 before and after `docker restart`.
- C1: `socket.data.expTimer` (a Node `Timeout`) reached a remote `fetchSockets`. `TypeError: Converting circular structure to JSON`, process exit, 1 crash in 3 valid runs. Repro now 10/10.
- F1: `CreditBody` sent no `direction`. Live ADD +4, SUBTRACT −2, double click one request, one tx.
- B2 (open): `ai.service.ts:1029-1030`, `upload:${generateId()}`. Same file twice: balance 18 → 16.
- W1: duplicate category name returned 500 (`Unique constraint failed on (name)`). Mapped to `ALREADY_EXISTS` in code, not re-run live.

## What We Tried

- **Round 1**: defects B1 and B2–B5 found live. No product code changed.
- **Rounds 2–3**: boot without `PROTO_ROOT` passed. C1 crashed once in three runs and stayed open. F1 blocked credit. Word-family evidence used the wrong S3 credentials and was not trusted.
- **Round 4**: C1 10/10, F1 ADD, SUBTRACT and double click green. W1 found.
- Failed attempts stay in `temper-raw.json`. The gate reads only `temper-final.json`.

## Root Cause Analysis

The money paths assumed a retry reuses the request identity. That holds inside `libs/grpc`, which re-sends the same closure. It does not hold at the exam upload handler, which mints a new id per HTTP call. Static gates checked the RPC shape, not key identity across a client retry.

The socket crash was a serialization assumption: a `Timeout` ended up inside a value the adapter JSON-encodes.

## Lessons Learned

- A retry test must send the same HTTP request twice. A unit test on the RPC wrapper proves nothing about the handler above it.
- Anything placed in `socket.data` or sent through an adapter must be plain data.
- Build once, then run every tester from a dist copy. Never stash in a shared worktree.
- CI env vars belong on the job that runs the spec. One of ours sat on the wrong job, so the spec never ran.

## Next Steps

- B2 and B2-upload: key debits on the stored `UserStorage` id or a client request id. Owner: phase 15, before the charge-first flow ships.
- W1 live re-run. Owner: not named; assign before phase 16.
- N4 (audit label shows username, dropdown shows display name). Owner: not named; a design call for the user.
- `finance.subscription.changed` effective-tier gap. Owner: phase 13.
- Remove the `UpdateBalance` breaking override in `buf.yaml` after merge to main. Owner: phase 16.
