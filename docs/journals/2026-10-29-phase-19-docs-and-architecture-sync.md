# Phase 19: docs sync, and the doc lies that only a code-reading reviewer caught

**Date**: 2026-10-29
**Severity**: medium
**Component**: ARCHITECTURE.md, CLAUDE.md, AGENTS.md, docs/system/*, docs/generated/*, docs/flows/*, examio-be/scripts/gen-permissions-doc.ts, ci.yml
**Status**: resolved (signed off 2026-10-29)

## What Happened

Phase 19 brought the docs up to date with the system as built after phases 01–16:
- **ARCHITECTURE.md:** 18 corrections, a change table at the top, and [DEFERRED] markers for phase 17 and user deletion.
- **permissions.md:** rewritten from 2021 to about 316 lines.
- **New script:** `scripts/gen-permissions-doc.ts` generates the role table and a gRPC guard table (51 handlers) from the code. CI job `permissions-doc-drift` fails on drift.
- **Generated docs:** route-list/api-map gained an owner column, entities.md fields were fixed, flows were rewritten, and F009 was tombstoned.
- **Changelog:** one cutover release entry (18 breaking-change rows).
- **Roadmap:** phases 01–15 had been listed as "uncommitted"; now listed as committed.

Phase 18 (mobile) was postponed. examio-app exists only on `develop`, so the user chose to do 19 first.

## The Brutal Truth

Four doc-writers met every grep-based acceptance criterion, and the docs were still wrong in 8 places.

The plan's acceptance criteria checked words: stale terms, links, deferred markers. They never checked whether a sentence about a guard was true. Two reviewer rounds caught the false statements:

- **Round 1:**
  - A new agent rule in CLAUDE.md/AGENTS.md said read RPCs need "any valid token". Agents would have followed it and exposed PII-returning RPCs.
  - `SetUserStatus` was documented with the wrong permission.
  - The socket middleware was described doing checks it never runs.
  - "Bad signature → TOKEN_EXPIRED" was written down; the code returns `TOKEN_INVALID`.
  - A sample YAML was labelled "abridged from routes.yaml" but did not match the file.
  - A cookie `Domain` that the code never sets was documented.
- **Round 2:**
  - The fix itself said that `RequirePermissionsOrService` without `callers` rejects services. The guard accepts any service.

The worst ones came from text copied from the plan or the old docs and never re-read against the code. The fix that lasts is structural: the gRPC guard table is now generated from the controllers, and the script throws on a handler with no guard decorator. CI now catches that class of error.

Process miss: a doc-writer ran a path-limited `git stash` (then popped it) to compare actionlint with HEAD. My brief had left out the no-stash rule. No damage. Every brief now restates it.

## Technical Details

- **Generator:**
  - Controllers use `@<pkg>.<Svc>ControllerMethods()`, not `@GrpcMethod`, so the generator scans those classes.
  - Output is 51 rows: 55 proto RPCs minus the 4 Python `AiService` RPCs.
  - Sorting is by code point and output is deterministic.
  - It fails loudly on a missing `routes.yaml` and on an unguarded handler.
- **Reviews:** round 1 REWORK (score 6), round 2 REWORK (score 8), round 3 SEALED. Evidence gate SEALED.
- **Deferred (Low):**
  - DISC code numbering in entities.md.
  - study-room and word-family routes are not inventoried.
  - ARCHITECTURE.md and entities.md are over 800 lines.

## Lessons

- **Doc acceptance criteria:** they need a "claims match code" check, not only greps. Grep-green docs can still lie.
- **Generate rather than hand-maintain:** anything derivable from code (guards, role tables) should be generated and CI-checked.
- **Re-read copied text:** text carried from a plan or an old doc is the most likely to be false.
- **Agent instructions:** CLAUDE.md/AGENTS.md text gets executed by agents, so its rules get the strictest review.
