# Phase 13: ai-chat-service extracted, and the stream abort that only failed through the gateway

**Date**: 2026-10-25 11:34
**Severity**: high
**Component**: kmaedu-be ai-chat-service (new), gateway-service proxy-factory, finance-service subscription expiry, ai-service HTTP surface, exam-service (modules removed), vocabulary ai client, deploy/compose, RabbitMQ definitions, .github/workflows/ci.yml
**Status**: resolved

## What Happened

Phase 13 is 14 commits, `8b4a881..ebae483`, all stamped 2026-10-25 and not pushed. The chain runs from `feat(ai-chat)!` (`8b4a881`) through the exam removal (`77b71a0`), the finance effective-tier event (`a80f484`), the vocabulary move to gRPC (`34c4df1`), the ai-service HTTP removal (`7ba0429`), the gateway abort fix (`5658796`), the routes and R2 changes, compose and CI wiring (`69f74da`), tests (`5ca6634`) and the docs and evidence sync (`ebae483`).

The phase moves AI chat, subjects and chat-to-document links out of exam into ai-chat-service (schema `aichat`). ai-service loses its HTTP chat API and the `INTERNAL_SERVICE_TOKEN` it used.

## The Brutal Truth

The worst bug was not in any suite. Direct to ai-chat, an SSE abort cancelled the gRPC call. Through the gateway the LLM call ran to the end and the full answer was saved. Every service-level test passed, and the gap showed up only in the live temper (F1, High). The gateway had never propagated a client disconnect on streamed routes, so every answer a user abandoned kept running upstream and was still saved in full.

The second was expiry (F2, Medium). A lapsed subscription was applied as tier 0 on reads but never published. The only flip-and-publish lived in a method with no production caller, so ai-chat kept the old tier for up to its 5-minute cache TTL.

The galling part: the first regression test for F1 hung Jest for more than 12 hours with no output. The session account says it passed `timeout: '0'` as a string, which the route schema rejects, and that the zod error fired inside a promise path nobody was watching. The background run had no watchdog. Those hours were pure loss.

The phase reports 9/9 criteria, but two were reworded with sign-off, and the FE AI chat actions were never exercised. The page is not mounted on any route at HEAD.

## Technical Details

- **F1** `apps/gateway-service/src/pipeline/proxy-factory.ts:54` and `:104`: `abortOnClientClose(proxyReq, res)` runs on `proxyReq`. Before the fix, http-proxy never destroyed the upstream request when the client socket closed. Live repro: `curl -N --max-time 1.3` against `:6369`. Before the fix the fake ran to `done` at +3.3 s. After: `CANCELLED after 3 chunks` at +1.3 s, partial save `w1 w2 w3 `.
- **F2** `expireIfLapsed` in `apps/finance-service`: conditional `updateMany` on `isActive AND nextPaymentDate < now`, with the outbox row in the same tx. Live: read path publishes one `toTier 0` event; sweeper (60 s tick) flipped `p13r_t2` in 7 s. No duplicate after a further 75 s.
- Re-verification: gateway 61/61, finance 73/73.
- **Secret incident**: a plain `grep -r` over `deploy/` matched the gitignored `kmaedu-be/deploy/.env` and printed a live `INTERNAL_SERVICE_TOKEN` into the transcript. Not in git. Rotation is requested; the record does not confirm it happened.

## What We Tried

- **F1 first attempt**: a regression test with `timeout: '0'`. Hung for 12+ hours (see above). Rerun with a watchdog and `--forceExit`. RED proof: hook disabled, test failed `Expected true / Received false`, file restored.
- **F3 `exists` on a foreign chat**: returns 200 `{exists:false}`, the same as a missing chat. Rejected as a fix. Accepted as no leak; criterion 6 reworded.
- **Review**: 9/9 criteria, 0 Critical/High. Rejected re-adding `x-internal-service-token` to the strip list. Deferred regenerate-before-admission (Medium) and four Lows to phase 16.

## Root Cause Analysis

F1 is an unproven hop. Each service passed its own abort test, and nobody tested the path end to end through the proxy. F2 is a dead-code path: the expiry rule lived in a method that no production code called, so unit tests of that method passed while the event never fired. The hang was missing guardrails on a background test run.

## Lessons Learned

- Prove abort and cancel propagation through every hop, from the client to the gateway to the service to the gRPC call. A service-level test cannot prove a proxy behavior.
- A state transition that must publish an event has to live on the path that actually runs. Check for a production caller before trusting a passing test.
- Every background Jest run gets a watchdog and an explicit timeout. Do not pass the timeout as a string.
- Use `git grep` for repo-wide searches. Plain `grep -r` reads gitignored `.env` files.

## Next Steps

- Confirm the INTERNAL_SERVICE_TOKEN rotation. Owner: the user. Now.
- Update the plan header in `plans/261017-1547-microservice-refactor-rbac/phase-13-extract-ai-chat.md` line 10: it still says "not committed, awaiting sign-off". Owner: next plan sync.
- Mount the AI chat page or accept that it stays unshipped (F4, Medium). Owner: phase 16.
- Regenerate-before-admission (Medium), OCR wait after SSE abort, and the eight `forceExit: true` configs (F6). Owner: phase 16.
- Phase 14 is next.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 13 is committed and sealed at 9/9 after the F1 and F2 fixes. The FE chat page criterion was not exercised, and one 12-hour test hang cost real time.
