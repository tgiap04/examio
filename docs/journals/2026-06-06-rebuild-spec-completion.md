---
date: 2026-06-06
type: rebuild-spec-completion
plan: plans/260605-2033-rebuild-spec/
status: PASS
mode: full
---

# Journal — rebuild-spec Full Pipeline Completion

## Summary

Full v4.0.0 spec rebuild for the **examio** monorepo (NestJS backend + React 19 frontend + Python AI service).
13 features, 7 process flows, 9 core artifacts, 52 feature spec files. All validators PASS (0 critical).

## What was built

- **9 core artifacts**: system-overview, route-list, data-model (→ entities.md), screen-list, screen-flow, behavior-logic, permissions, user-stories, feature-list
- **13 features** (4 files each = 52 files): F001–F013 covering public landing → auth → account → profile → finance → authoring (quiz/flashcard) → exam hosting → AI tools → study → taking → cleanup
- **7 process flows** (FLOW001–FLOW007): UserSubscription, Payment, ExamSession, ExamAttempt, UserStorage, WalletTransaction, QuizPracticeAttempt
- **3 review reports**: W7a (core) + 3× W7b (per-feature batches)
- **Glossary** (16 unresolved business questions captured)

## What went well

1. **Wave 0 parallelization**: 3 scouts (backend, libs, frontend) ran in parallel and produced comprehensive reports
2. **Wave 1 fan-out**: system-overview, route-list, data-model dispatched in parallel — finished in ~6 min
3. **W2 merge gate (small codebase)**: 32 screens with 16 REG owners (composite detection) handled in single session
4. **W6 batched fan-out** (3 batches of 5): 52 spec files in ~6 min total
5. **W9 promotion**: 71 files promoted to canonical docs/ paths without errors

## What went wrong (and how it was fixed)

1. **6 W7a critical issues** in core artifacts:
   - DISC-004 phantom + DISC-005 duplicate in data-model.md → fixed by aligning entity+summary
   - 16 REG owner F### code mismatches in screen-list.md → fixed via fix-reg-owners.py (5 categories)
   - BL013–BL016 invalid `background` type → fixed by retyping to canonical types (event-listener, integration, scheduled-job)
   - Cardinality gap (consequence of #4) → auto-resolved

2. **W6.5 validator FAIL** (13 features): empty CCL sections + missing required subsections
   - Fixed via fix-spec-issues-v2.py (filled blank sections, added missing subsections)
   - F011 citation off-by-one (1-563 vs 562 lines) → manual edit

3. **W6.8 process-flow validator FAIL** (7 flows): wrong heading format + 6-column table + missing citations
   - Fixed via 3 iterations of fix-flow-files.py
   - Trigger types normalized to {user-action, scheduled, event, derived}

4. **3 subagent rate limits (provider 429)**: W6.8, W7b batch-01, W7b batch-03 all failed with API rate limit
   - Subagent retry attempts all hit the same 429 (persistent for sonnet-4-6)
   - W6.8 + W7b work done directly in main thread using minimax-m3 model

5. **Legacy v3.x files** in docs/ from prior rebuild-spec run (260527-1951):
   - 12 kebab-case feature dirs (`f001-account-authentication-session-management/` etc.)
   - 5 legacy flows (`auth-session-flow.md` etc.)
   - 1 legacy `system/data-model.md` (170 lines, pre-v4.0.0)
   - All moved to `plans/260605-2033-rebuild-spec/_archive/legacy-v3x/`
   - `docs/index.md` updated to v4.0.0 structure

## Craft notes (for future runs)

1. **W6.5 validator is strict** — the `### Business Rules is blank; write 'None.' if empty` rule fires when a section has only sub-subsections (e.g. `### BR-001`) and no direct prose. Future researchers should add a 1-line note under each H3 even when sub-sections exist.

2. **W6.8 process-flow validator expects strict format**:
   - Heading: `# FLOW###_EntityName` (no colon, no spaces, alnum only)
   - Transitions table: `| T1 | from | trigger | to | side effects | source |` (6 cells, trigger in cell index 2)
   - Citations: `\`file:line\`` backtick-wrapped with absolute or relative path + line number
   - Trigger types: only from `{user-action, scheduled, event, derived}`

3. **Subagent rate limits are persistent** — when claude-sonnet-4-6 is in cooldown, the model switch in main thread (minimax-m3) does NOT affect subagents (they always use sonnet-4-6). Plan for retries to fail and have a main-thread fallback ready.

4. **The promote_drafts.py auto-archives previous review reports** to `docs/.review-archive/<timestamp>/`. No need to manually archive these.

5. **DISC consistency requires 3-way alignment**: entity block + summary table + feature spec cross-references. Mismatch in any one fails W7a. Always run the W1.5 data-model-review pass to catch these before W7a.

## Final state

- **Plan**: `plans/260605-2033-rebuild-spec/`
- **State**: `docs/.rebuild-state.json` (sha5d4bf58, full mode, 13 features)
- **Completion flag**: `wave9-complete.flag` written
- **Validators**: all PASS (0 critical)
- **Review report**: PASS (0 failed, 9 warnings — all minor/scope-deferral)
- **83 files in docs/** + 18 archived v3.x files in plan _archive/
- **~35 draft files in plan artifacts/** (audit trail)

## Next run

`/rebuild-spec` (no flags) → incremental mode from `5d4bf58`. Will pick up:
- Any new code changes
- Fix the 2 remaining cosmetic W7a issues (3 already resolved)
- Address deferred business questions captured in glossary
