# Phase 06 — Docs sync and final gate

## Context Links
- [plan.md](./plan.md) · [scout-02 §9](./reports/scout-02-finance-service-infra-authz.md) · [scout-03 docs](./reports/scout-03-frontend.md)

## Overview
- Priority: P1 · Status: In progress · Effort: 1.5d · Depends on 05.
- Bring every doc in line with the code (no finance-service, no credits, no subscription limits), then run the single final gate on the finished tree.

## Key Insights
- `docs/generated/permissions-matrix.md` and the generated block of `docs/system/permissions.md` were already regenerated in 05. Everything else is edited by hand (no rebuild-spec re-run).
- CLAUDE.md and AGENTS.md are mirrors; edit both identically.
- Breaking HTTP changes must be written down: removed endpoints, removed response fields (`newBalance`, `creditCharged`, stats keys) and removed error codes.

## Requirements
- No doc describes a live finance flow. Historical changelog entries stay as history.
- The changelog entry lists the breaking changes and the ops note.

## Architecture
- n/a (docs only).

## Related Code Files (ROOT = `/Users/tgiap.dev/devs/examio`)
- Modify:
  - `ROOT/CLAUDE.md` and `ROOT/AGENTS.md`: topology, commands (`dev:finance`, `seed:dev` chain, `finance:reconcile-teachers`, `typecheck:<…>` list, migrate-dev svc list), shared libs (`@examio/grpc` FinanceClient), communication patterns (Debit/Refund, `MONEY_CALLERS`, upload/generation charge paths, ai-chat limits and benefits cache), data-shape table (finance row; 10 → 9 roles), FE (`useWalletStore`, `Idempotency-Key`).
  - `ROOT/ARCHITECTURE.md`, `ROOT/README.md`, `ROOT/examio-be/README.md` (if it mentions finance), and the `architecture-overview.mmd` node.
  - `ROOT/docs/system/{architecture,overview,business-rules,glossary,permissions}.md` (hand-written parts).
  - `ROOT/docs/generated/{route-list,api-map,entities,feature-list,behavior-logic,screen-list,screen-flow,user-stories}.md`: hand edits.
  - `ROOT/docs/flows/FLOW001*`, `FLOW002*`, `FLOW006*` (drop charge/refund steps).
  - Minor: `ROOT/docs/features/{F006,F007,F010,F014}*`, `ROOT/docs/screens/{SCR001,SCR013,SCR024}*`, `ROOT/docs/index.md`.
  - `ROOT/docs/project-changelog.md` and `ROOT/docs/development-roadmap.md`.
- Delete: `ROOT/docs/features/F005_Finance/**`, `ROOT/docs/screens/SCR015_SubscriptionPage/**`, and their index entries.

## Implementation Steps
1. `git grep -n -i "finance\|wallet\|subscription\|credit\|payment\|sepay\|PENDING_CHARGE\|AI_FREE_MODE\|RATE_LIMITED\|CHAT_LIMIT_REACHED\|QUOTA_EXCEEDED" -- '*.md' '*.mmd' ':!plans'`, then work through the hits.
2. Edit CLAUDE.md and AGENTS.md together, and diff them to confirm they still mirror each other.
3. Delete F005 and SCR015, and fix the links (`git grep -n "F005\|SCR015" -- docs`).
4. Write the changelog entry (breaking: endpoints, fields, error codes, permissions, `migration:contract`, ops note) and update the roadmap.
5. Run the final gate.

## Todo List
- [x] Root docs (CLAUDE, AGENTS, ARCHITECTURE, README, mmd) (remaining hits are removal notes or history)
- [x] docs/system and docs/generated hand edits (business-rules, overview, architecture, route-list carry removal notes)
- [x] Flows, features, screens; delete F005 and SCR015 (F005 and SCR015 deleted in the working tree)
- [x] Changelog and roadmap (changelog entry present)
- [ ] Final gate green: only the e2e mirror ran (765 of 766 passing, then 180/180 after the fix). Not recorded: typecheck, build:all, full unit suite, `test/authz`, buf breaking, drift diff, FE build/lint/test, ruff and pytest, coverage. Verification incomplete for these.

## Success Criteria
- The step 1 grep leaves only intentional hits: changelog history, "credential rate limit", and unrelated "credit" senses such as `FOCUS_CREDIT`.
- No broken relative links to F005 or SCR015.
- Final gate: every command below exits 0, or is reported as "verification incomplete" with the reason.

## Test Plan — Scope Contract (final gate; SAFETY-CRITICAL areas from 02 and 05 run whole)
- Changed: docs only in this phase. The gate covers the whole branch.
- Will verify, once, on the finished tree:
  - `cd examio-be && yarn proto:lint && yarn proto:gen && yarn typecheck && yarn build:all`
  - `yarn test` (all unit and spec tests, including `test/authz`, `test/build`, `test/ownership` and `test/cross-app/rpc-guard-table`)
  - The e2e config of each service: `for s in auth content assessment study-room vocabulary document ai-chat admin r2 gateway; do (cd apps/$s-service && ../../node_modules/.bin/jest --config test/jest-e2e.json) || exit 1; done`
  - `./node_modules/.bin/jest --config test/cross-app/jest-e2e.json` and `./node_modules/.bin/jest --config test/db-isolation/jest-e2e.json` (DB env)
  - `yarn check:ownership && yarn check:deps`
  - `yarn gen:permissions-doc && yarn gen:fe-permissions && git diff --exit-code -- ../docs/generated ../docs/system/permissions.md ../examio-fe/src/types/permissions.generated.ts` (drift)
  - `MIGRATION_CONTRACT=1 bash scripts/lint-migrations.sh develop HEAD`, plus the same without the env var to confirm it flags only the two intended migrations
  - buf breaking against develop (from 05)
  - `cd apps/ai-service && ./venv/bin/ruff check src && ./venv/bin/pytest src/backend/tests`
  - `cd ../../../examio-fe && yarn build && yarn lint && yarn test`
  - Coverage on changed logic: `yarn test:cov` scoped to content `modules/ai`, document `modules/upload` and ai-chat `modules/ai-chat`. Target 90% line and 80% branch.
- Deliberately skipped: mobile (out of scope) and a browser e2e (manual UI spot-check done in 04).

## Risk Assessment
- Doc drift misleads future sessions (the CLAUDE.md is long and dense). Countermeasure: the grep gate plus the mirror diff.
- Final gate env gaps (DB/RabbitMQ for e2e). Countermeasure: export the local docker env (see memory: local `.env` files point at the remote dev DB). Never run e2e against the shared remote DB.
- Rollback: docs revert with the merge.

## Security Considerations
- The docs must not include real secrets or env values. Use names only.

## Next Steps
- Open the PR from the feature branch into `develop` with label `migration:contract` (user approval required for commit and push).
- Follow-up after merge: remove the temporary buf `ignore_only` entries.
- Later and separate: the student AI chat page, which grants `ai_chat:use` and `document:upload` together.
