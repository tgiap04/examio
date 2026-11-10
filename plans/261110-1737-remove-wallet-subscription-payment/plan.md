---
title: "Remove wallet / subscription / payment (school edition)"
description: "Delete finance-service and every money, subscription and benefit-derived limit flow across backend, protos, infra/CI, frontend and docs in one release."
status: in-progress
priority: P1
effort: 9.25d
branch: develop
tags: [backend, frontend, database, infra, authz, breaking, cleanup]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Remove wallet / subscription / payment

## Overview
Examio is now a school product: no credits, wallets, subscriptions or payments. Finance-service, Debit/Refund flows, subscription limits (ai-chat 5/min and 30/chat, document monthly quota), the finance permissions, admin finance UI and the FE wallet/subscription/pricing UI all go. The work ships as **one release** on a branch off `develop` with PR label `migration:contract`. There is no expand/contract split and no data migration, because the new stack was never deployed and cutover resets the DB.

Decisions: [clarifications.md](./clarifications.md). Inventories: [backend money flows](./reports/scout-01-backend-money-flows.md) · [finance-service, infra, authz](./reports/scout-02-finance-service-infra-authz.md) · [frontend](./reports/scout-03-frontend.md).

## Phases

| # | Phase | Status | Effort | Depends on | Parallel |
|---|-------|--------|--------|-----------|----------|
| 01 | [Decouple gRPC metadata attacher](./phase-01-decouple-grpc-metadata-attacher.md) | Completed | 0.25d | — | — |
| 02 | [Remove money and limits from content, document, ai-chat](./phase-02-remove-money-and-limits-content-document-ai-chat.md) | Completed | 3d | 01 | with 03, 04 |
| 03 | [Remove finance from admin-service](./phase-03-remove-finance-from-admin-service.md) | Completed | 1d | 01 | with 02, 04 |
| 04 | [Frontend wallet, subscription, pricing removal](./phase-04-frontend-wallet-subscription-pricing-removal.md) | Completed | 1.5d | — | with 02, 03 |
| 05 | [Delete finance-service, protos, permissions, infra and CI](./phase-05-delete-finance-service-protos-permissions-infra-ci.md) | Completed | 2d | 02, 03, 04 | — |
| 06 | [Docs sync and final gate](./phase-06-docs-sync-and-final-gate.md) | In progress | 1.5d | 05 | — |

Status as of 2026-11-10 on branch `feat/remove-finance`, all changes uncommitted. Phase 06 stays `In progress` because its final gate is only partly recorded (see Follow-ups).

## Key dependencies
- 01 comes first because `GrpcMetadataAttacher` lives in `finance.client.ts` and `public-profile.client.ts` imports it from there.
- Permission removal (`wallet:use`, `subscription:manage`, `finance:admin`) has to land in **05**. Finance-service, admin-finance, gateway `routes.yaml`, `rpc-guard-table` and the FE generated types all reference those permissions, so dropping them earlier breaks compile and tests.
- Auth's `finance` audience and caller entries, plus the gateway finance routes, also move in 05. `rpc-guard-table.spec.ts` and the gateway `route-coverage.spec.ts` pin them.
- 04 must be merged into the branch before 05 regenerates `permissions.generated.ts`. Otherwise the FE compile breaks at `routes/index.tsx`, `nav-items.ts`, `PricingBand.tsx` and `ProfilePage.tsx`.
- buf `breaking` (FILE category) flags deleted files **and** reserved fields. 02 and 05 add scoped `ignore_only` entries (verified locally with buf 1.74.0, exit 0). A follow-up commit after merge removes them.
- Parallel window 02 ∥ 03 ∥ 04 has disjoint file ownership (listed in each phase). Shared files (`ci.yml`, `test/authz/**`, `libs/grpc/src/index.ts`, `proto/buf.yaml`, `nest-cli.json`) belong to exactly one phase in that window.

## Kept on purpose (not subscription limits)
Credential rate limit, gateway `rateLimits`, `maxBodySize`, the 1 MB snapshot cap, vocabulary AI 20/day, access-code lockout and ai-service `AI_BUSY`. AI generation stays TEACHER-only. Student permissions do not change.

## NOT in scope
- A student AI chat page, or granting students `ai_chat:use` / `document:upload` (later, together).
- examio-app (mobile): not touched.
- A new CD flow (`deploy.yml` is already deleted).
- Re-running the rebuild-spec skill. Generated docs other than permissions-matrix are edited by hand.

## Rollback
Single branch: revert the merge commit. Any dev DB that applied the contract migrations needs `docker compose down -v` (the DB resets anyway).

## Follow-ups
Owed before merge:
- Commit: stage the untracked files by path (new migrations, new specs, `document-queue.service.ts`). `git status --short | grep '^??'` must show only `plans/`. Reviewer W1.
- PR carries label `migration:contract`. The two contract migrations trip `lint-migrations.sh` (7 DROPs) without it.
- Browser pass with `yarn dev`: landing, `/k/profile`, `/admin` overview, stats, audit, user drawer. Not run.
- Leftover S3: delete the no-op `delete process.env.FINANCE_GRPC_URL` at `examio-be/apps/content-service/test/worker.e2e-spec.ts:32`.
- Final gate not in any report: `yarn typecheck`, `yarn build:all`, full `yarn test`, `test/authz`, buf breaking exit 0, permissions drift diff, FE `yarn build && lint && test`, ai-service ruff and pytest, coverage on changed logic.

Owed after merge:
- Remove the temporary buf `ignore_only` entries (`FILE_NO_DELETE`, `FIELD_NO_DELETE`, `ENUM_VALUE_NO_DELETE`) in `examio-be/proto/buf.yaml`.
- Ops: `docker compose down -v` on dev stacks, or the manual steps in phase 05 ops note.

Deferred review suggestions (`reports/reviewer-261110-finance-removal.md`): M2 (delete orphan upload when `submit` fails), S1 (R2 cleanup on sign failure in register), S2 (drop unused Redis from ai-chat), S4 (dead `currency-vnd` formatter), S5 (dead `userSubscription` mock in auth spec), S7 (warn on unused `SERVICE_CLIENTS` entries).

Out of scope, known gap: examio-app still calls the removed `/wallet` routes. Not touched in this release.
