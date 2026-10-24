---
title: "Microservice Refactor + RBAC (Teacher / Student / System Admin)"
description: "Refactor examio-be from distributed monolith to real microservices per ARCHITECTURE.md and introduce fixed-role RBAC with an admin role-assignment screen."
status: in-progress
priority: P1
effort: 56.75d
branch: refactor/microservice-rbac
tags: [refactor, backend, frontend, auth, database, infra, critical]
blockedBy: []
blocks: []
work_type: feature
spec_waived: "SDD mode disabled (takumi.sddMode: off)"
created: 2026-10-17
---

# Microservice Refactor + RBAC

## Overview
Refactor examio-be from distributed monolith to real microservices per `/ARCHITECTURE.md` (P0–P8). RBAC lands early, together with the RS256/JWKS token. Roles: `STUDENT` | `TEACHER` (mutually exclusive) + `SYSTEM_ADMIN` flag. **DB is reset** (no real users), so there is no data migration or backfill. Public `/api/v1` paths are kept.

Decisions (authoritative): [reports/decisions.md](./reports/decisions.md). Inputs: [current state](./reports/scout-current-state-report.md) · [RBAC surface](./reports/scout-rbac-surface-report.md) · [RBAC research](./research/researcher-01-rbac-report.md) · [migration mechanics](./research/researcher-02-migration-mechanics-report.md).

## Phases

| # | Phase | Status | Effort | Depends on |
|---|-------|--------|--------|-----------|
| 01 | [Guardrails & Cleanup](./phase-01-guardrails-and-cleanup.md) | Completed | 2.25d | — |
| 02 | [Contracts & Infra Libs](./phase-02-contracts-and-infra-libs.md) | Completed | 2.25d | 01 |
| 03 | [Messaging Foundation](./phase-03-messaging-foundation.md) | Completed | 2.5d | 02 |
| 04 | [Identity & RBAC Core](./phase-04-identity-and-rbac-core.md) | Completed | 5d | 02, 03 |
| 05 | [Gateway Rewrite](./phase-05-gateway-rewrite.md) | Completed | 4.25d | 02, 03, 04 |
| 06 | [RBAC Enforcement & Security Fixes](./phase-06-rbac-enforcement-and-security-fixes.md) | Completed | 4.75d | 04 |
| 07 | [Quiz Sharing & Student Practice](./phase-07-quiz-sharing-and-student-practice.md) | Completed | 2.75d | 06 |
| 08 | [Admin Role-Management Screen](./phase-08-admin-role-management-screen.md) | Completed | 2.75d | 04, 06 |
| 09 | [Frontend RBAC](./phase-09-frontend-rbac.md) | Completed | 3.5d | 04, 07, 08 |
| 10 | [Cut Cross-DB Access](./phase-10-cut-cross-db-access.md) | Completed | 2.75d | 03, 04, 08, 09 |
| 11 | [Database per Service](./phase-11-database-per-service.md) | Completed | 3d | 10 + P01 spike GO |
| 12 | [Extract Study-Room & Vocabulary](./phase-12-extract-study-room-and-vocabulary.md) | Completed | 3d | 05, 11 |
| 13 | [Extract AI-Chat](./phase-13-extract-ai-chat.md) | Pending | 2d | 11, 12, 15 |
| 14 | [Extract Content & Assessment](./phase-14-extract-content-and-assessment.md) | Pending | 4.5d | 07, 11, 13, 15 |
| 15 | [Document Service & AI-Service DB](./phase-15-document-service-and-ai-service-db.md) | Completed (pending commit) | 5d | 03, 10, 11 |
| 16 | [Deploy Independence](./phase-16-deploy-independence-and-observability.md) | Pending | 2.5d | 12–15 |
| 17 | [Deferred: K8s + Observability + Redis ACL](./phase-17-k8s-readiness.md) | Deferred | ~3.5d (excluded) | 16 |
| 18 | [Mobile RBAC Parity (examio-app, cross-repo)](./phase-18-mobile-rbac-parity.md) | Pending | 2.75d (provisional) | 09 · before first store release |
| 19 | [Docs & Architecture Sync](./phase-19-docs-and-architecture-sync.md) | Pending | 1.25d | 16 |

## Execution Strategy
- **Branching/deploy (validated):** one long branch `refactor/microservice-rbac`. Sync `main` into it weekly; every phase ends green on the branch. Production deploys **once**, at the final merge, with a DB reset (cutover runbook in P16). Milestones are verified on local compose only.
- Milestone A (01–09): RBAC usable end to end on the current topology, with the new auth and gateway. 04 + 05 + 08 are verified together (04 alone has no revoke list). **Status 2026-10-20: Milestone A backend (04 + 05 + 08) is verified locally** (admin trio 36/36, auth CI set 35/35, gateway probe 16/16, UI browser run 27/27; evidence: [phase-08-runs.md](./evidence/phase-08-runs.md)). **FE (09) completed 2026-10-22, pending commit** (live matrix 64 PASS / 0 FAIL / 1 NOTE; carried items D1–D15 in [phase 09](./phase-09-frontend-rbac.md#deferred--carried)). Phase 08 has two open Todo lines (FE error/409 states, last-admin ban UI on `/admin/users`); see phase-08 Next Steps item 10.
- P04 admin grant/revoke already route via auth (`SetSystemAdmin`, with the admin's token forwarded). P08 builds the rest of the role screen on that path; admin-service never writes `isSystemAdmin` directly.
- Milestone B (10–11): data ownership. Each service gets its own schema and role. `libs/database` is removed. 10's FE edits land after 09 (shared `useAuthStore.ts`, `types/user.ts`).
- Milestone C (12–15): exam-service is split away. Order: **12 ∥ 15 → 13 → 14** (15 also needs 10's idempotent `Debit`/`Refund`). 13 needs 15 (document-service + gRPC `AiService`). 12/13/14 share `apps/exam-service/src/exam-service.module.ts` and `apps/gateway-service/config/routes.yaml` (single file, named entries per phase). Edits to shared files (`routes.yaml`, `nest-cli.json`, `package.json`, `jest.config.js`, compose includes) are append-only, and merges are serialized.
- Milestone D (16, 19): independent deploy + docs. 17 deferred (K8s, observability stack, Redis ACL).
- Mobile (18): mobile is unreleased, so 18 runs any time after 09 and must finish before the first store release. iOS + Android parity.
- Every phase ends green: `yarn build && yarn test` (BE), `yarn build && yarn lint` (FE), app runs via compose.

## Key Dependencies
- Node 22 base image, Prisma 6.19.x (`prisma-client` generator + `@prisma/adapter-pg`), `jose@5.10` (CJS), `http-proxy-middleware@3.0.7`, buf v2 + ts-proto, amqp-connection-manager.
- `examio-app` (mobile) is not in this checkout. Phase 18 runs in its own repo, iOS + Android parity.

## Prisma Spike Verdict (P01 step 3 — gates P11)
**GO (2026-10-18).** Prisma 6.19.3 `prisma-client` generator (`engineType=client`, `moduleFormat=cjs`) + `@prisma/adapter-pg`. Custom webpack (`externals: []`) gives a self-contained bundle. Image ≈63 MB. Migrations and queries land in `?schema=<svc>`, and raw SQL relies on the role's `search_path`. Tested on arm64 only, so amd64 must be confirmed in CI. Details: [spike report](./reports/spike-prisma-bundling-report.md).

## Red Team Review
4 reviewers (Security, Failure Mode, Assumption, Scope). 37 raw findings, merged to 15. All 15 cited `file:line`. 14 accepted, 1 rejected. Applied per phase from [red-team-changes.md](./reports/red-team-changes.md); edits marked `<!-- Red Team: RT-n -->`.

| RT | Sev | Finding | Disposition |
|----|-----|---------|-------------|
| 1 | Critical | No idempotent Debit/Refund; non-atomic generation charge | Accept (P02/P10/P15) |
| 2 | Critical | Money/identity RPCs trust "internal network"; shared broker creds | Accept (S2S tokens P04, RMQ users P03, networks P05) |
| 3 | High | Stale-role race, fire-and-forget invalidation | Accept (`av` claim + durable consumer) |
| 4 | High | Per-route rate limits lost; code brute force | Accept |
| 5 | High | WS authz race; global guards vs `@SubscribeMessage` | Accept |
| 6 | High | Unverified users pass `@Authenticated`; optional auth forwards revoked tokens | Accept |
| 7 | High | No IDOR/ownership test dimension | Accept |
| 8 | High | R2 delete not durable; document delete owner missing | Accept (`r2_delete_tasks`, `DeleteDocuments`) |
| 9 | High | Teacher wallet provisioning unrecoverable | Accept |
| 10 | High | Outbox growth, relay holds tx; messaging over-built | Accept |
| 11 | High | Scope: KPI read model, user deletion, K8s/obs/ACL | Accept (cut/defer to P17) |
| 12 | High | Deploy order, destructive migrations, P3009 | Accept |
| 13 | High | Mobile breaks at Milestone A | Accept, then **reversed by Validation Q6** (mobile unreleased: no compat fields) |
| 14 | High | Prisma 6.19/adapter/bundling unspiked | Accept (spike gate in P01) |
| 15 | Medium | Batch: email leak, CORS/helmet/real-ip, last-admin deadlock, snapshot drift, sharing race, FE gates, r2 token, ordering | Accept |
| — | Medium | Make generation synchronous gRPC | Reject: runs minutes, keep job + events |

**Reconciliation sweep (2026-10-18):** applied X1–X10 ([decisions](./reports/reconciliation-decisions.md), [report](./reports/reconciliation-sweep-report.md)): ban built in P08, one `auth.user.authz_changed` event, `gw:user:<id>:av` only, caller allowlists in code. Unresolved contradictions: **none**.

## Validation Log
Session 1 (2026-10-18), 7 questions. Full record: [validation-session-1.md](./reports/validation-session-1.md).
- Word-family generation stays free (TEACHER-only, rate-limited). TEACHER also gets `word_family:save`.
- A demoted teacher keeps their content and loses management; students keep access.
- One long branch; a single production deploy + DB reset at the final merge.
- Mobile is unreleased: no compat fields (reverses RT-13). P18 must finish before the first store release.
- ai-service `score/` and `BenchmarkItem` are deleted (P01).
- Propagated to phases ([report](./reports/validation-propagation-report.md)). Lead accepted 4 calls: new R2 bucket at cutover (old kept 24h for rollback), P01 also removes the dev-only `streamlit_ui/` + `evaluate_chatbot.py`, seeding via `ROLE=seed`, `CUTOVER_DONE` deploy gate. Unresolved contradictions: **none**.
- Milestone A local verification now covers 04 + 05 (08 pending). Evidence: [phase-04-runs.md](./evidence/phase-04-runs.md), [phase-05-runs.md](./evidence/phase-05-runs.md). Phase 05 closed 2026-10-20 (forge + 6 fix rounds; temper 80/80; inspection SEALED 9/10, 0 critical). Phase 05 Todo "e2e + manual FE smoke + compose smoke" still open (see phase-05 file).

## Cross-Plan Notes
- Supersedes the role removal of `260513-2045-remove-user-role` and `260513-1957-unify-backend-role-access` (roles re-introduced, new model).
- Pending mobile plans (`260525-0629-mobile-screens`, `260704-1030-ai-flashcard-quiz-generation-app`) must respect the role gating from phase 09/18. Relationship to confirm in validation.
