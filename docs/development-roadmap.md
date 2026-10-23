---
title: Examio Development Roadmap
last_updated: 2026-10-23
source: rebuild-spec pipeline run (plans/260605-2033-rebuild-spec/) + phase completions
status: ACTIVE
---

# Examio Development Roadmap

Living document tracking follow-up work derived from the rebuild-spec pipeline run on **2026-06-05/06** (plan `260605-2033-rebuild-spec`).

## Source

| Source | Count |
|--------|------:|
| Unresolved business questions from feature specs | 16 |
| Review warnings from W7a + 3×W7b | 9 |
| Known system issues from scout + W7a | 6 |
| **Total follow-up items** | **31** |

Priority: **P0** = blocking/correctness · **P1** = security/integrity · **P2** = correctness edge cases · **P3** = UX/spec completeness

---

## Documentation Coverage Note (2026-07-03)

The 2026-06-05 rebuild-spec baseline is now **873 files behind HEAD** (94k+ lines changed) — the diff exceeds the auto-full-rebuild threshold. A scoped manual update was performed instead of a full core re-scan:

- ✅ Added F015 (PageFeatureFlags) and F016 (WordFamily) to `feature-list.md`, `screen-list.md` (SCR039–SCR043), `permissions.md` (PERM054–PERM057), `user-stories.md` (US063–US067), with full 4-file feature specs
- ✅ Added F014 (AdminDashboard) 4-file feature specs (was in feature-list.md but missing `docs/features/` dir)
- ✅ Fixed `CLAUDE.md` — added the third workspace `examio-app` (Kotlin Multiplatform mobile), previously undocumented entirely
- ⚠️ **NOT done**: full core artifact re-scan (route-list, data-model, entities, behavior-logic, architecture) against the 873-file diff — these may still miss changes in `examio-app/`, `word-family` AI-service internals not covered above, and other commits not specifically researched
- ⚠️ **NOT done**: `docs/flows/*.md` and `docs/system/glossary.md` regeneration for the new features
- **Recommendation**: run `/tkm:rebuild-spec --full` (core pass) via Claude Code IDE when feasible to catch anything this scoped pass missed, followed by `--flows` and `--glossary`

## Documentation Coverage Note (2026-07-19)

- ✅ Added Study-Together Room to `project-changelog.md` and this roadmap (Phase 6); recorded the new WebSocket/Socket.io transport in `docs/system/architecture.md` § Cross-Service Communication
- ⚠️ **NOT done**: no `docs/features/F###_StudyTogetherRoom/` spec was generated — SDD mode was off for this feature and the spec was explicitly waived during planning (see `plans/260719-1844-study-together-room/`); `docs/generated/feature-list.md`, `route-list.md`, `api-map.md`, `screen-list.md`, `entities.md`, `user-stories.md`, and `permissions-matrix.md` do not yet reflect this feature (>10 source files changed — outside a scoped surgical pass)
- **Recommendation**: run `/tkm:rebuild-spec --features F017` (or the next free F-code) if/when a formal feature spec is wanted for Study-Together Room

## Documentation Coverage Note (2026-07-21)

- ✅ Added Study Room — Playlist, Access & Moderation (extends Phase 6) to `project-changelog.md` and this roadmap (new rows under Phase 6); extended `docs/system/architecture.md` § Cross-Service Communication § 6 with the new WS events and Prisma models
- ⚠️ Same spec gap as 2026-07-19 carries forward: no formal `docs/features/F###/` spec exists for Study Room at all (base or this extension) — SDD waived; `docs/generated/*` inventories still do not reflect any Study Room surface
- ⚠️ **Migration still pending**: `StudyRoomPlaylistItem` and `StudyRoomChatBlock` (plus the new `accessType`/`whitelist`/`playlistAddPermission` fields on `StudyRoom` and `isBanned`/`isMuted` on `StudyRoomMember`) were applied to the dev DB via raw `psql`, not `prisma migrate`/`prisma:deploy` — same unresolved gap as the original `StudyRoom`/`StudyRoomMember` models from 2026-07-19, now larger in scope
- **Recommendation**: generate one migration covering all Study Room schema changes (base + this extension) before any `prisma:deploy`-gated environment; run `/tkm:rebuild-spec --features F017` if a formal spec is later wanted

---

## Progress Note (2026-10-18) — microservice-refactor plan, phase 01

Phase 01 (guardrails and cleanup) is implemented but uncommitted on `refactor/microservice-rbac`: CI quality gate, `ocr-service` removed, baseline Prisma migration, health probes, pino logs. See [changelog](project-changelog.md). Plan: `plans/261017-1547-microservice-refactor-rbac/`.

## Progress Note (2026-10-18) — microservice-refactor plan, phase 02

Phase 02 (contracts and infra libs) is implemented but uncommitted on `refactor/microservice-rbac`: protos moved to `examio-be/proto/` (buf), new libs `@examio/contracts`, `@examio/grpc`, `@examio/http`, unified container ports (HTTP 3000 / gRPC 50051), `FINANCE_GRPC_URL` env. Subscription limits are now enforced. See [changelog](project-changelog.md).

## Progress Note (2026-10-18) — microservice-refactor plan, phase 03

Phase 03 (messaging foundation) is implemented but uncommitted on `refactor/microservice-rbac`: `@examio/messaging` (outbox + relay, idempotent consumer, retry/DLQ, `ROLE`), `auth.user.created` replaced by `auth.user.registered`, per-service RabbitMQ users rendered from definitions at deploy, RabbitMQ 3.13. See [changelog](project-changelog.md).

## Progress Note (2026-10-19) — microservice-refactor plan, phase 04

Phase 04 (identity and RBAC core) is implemented but uncommitted on `refactor/microservice-rbac`: roles STUDENT/TEACHER + `isSystemAdmin` (replaces `isAdmin`), RS256/JWKS tokens, new `@examio/auth-jwt` (deny-by-default guards, permission catalog), service tokens, TEACHER-only wallets, admin bootstrap moved to auth CLI. Roadmap item 1.2 (session/refresh policy) is partly addressed: access 15 min, refresh reloads role. Frontend still reads `isAdmin`. See [changelog](project-changelog.md) and [permissions](system/permissions.md).

## Progress Note (2026-10-20) — microservice-refactor plan, phase 05

Phase 05 (gateway rewrite) is implemented but uncommitted on `refactor/microservice-rbac`: YAML route table, streaming dispatcher, revoke/stale checks with `GatewayControl` + durable events, Redis rate limits, WS upgrade auth, network-segmented compose, `accessToken`/`refreshToken` cookies. Roadmap item 0.3 is resolved by removing the proxy controllers. See [changelog](project-changelog.md) and [architecture](system/architecture.md) § 1.

## Progress Note (2026-10-20) — microservice-refactor plan, phase 06

Phase 06 (RBAC enforcement and security fixes) is implemented but uncommitted on `refactor/microservice-rbac`: per-handler permissions on exam/finance/admin/r2, `@RequireOwnerOrPermission`, CI declaration + matrix + ownership specs, access-code lockout, trimmed study/public payloads, TEACHER-only user search and word-family generation (20/day), WebSocket permission/`av`/expiry checks. This extends the Phase 1 (Security & Auth Integrity) theme (IDOR, public-endpoint leakage, code brute force) without closing a numbered item; the frontend (phases 07 and 09) still has to adapt (share button, `auth:reauth`). See [changelog](project-changelog.md) and [permissions](system/permissions.md).

## Progress Note (2026-10-20) — microservice-refactor plan, phase 07

Phase 07 (quiz sharing and student practice) is implemented but uncommitted on `refactor/microservice-rbac`: quiz-set whitelist/code/public sharing, the delta sharing API (2000 cap) shared with flashcard sets, remembered code unlocks evicted on rotation, and `/quiz-practice/*` with server-side scoring and frozen results. Follow-ups: migration `20261020132225_quiz_sharing` is not applied on shared databases; mobile adaptation and a central axios error fix remain. See [changelog](project-changelog.md).

## Progress Note (2026-10-20) — microservice-refactor plan, phase 08

Phase 08 (admin role management) is implemented but uncommitted on `refactor/microservice-rbac`: `/admin/roles` API and the `/admin/roles` FE page, ban/unban through auth `SetUserStatus`, `grant-admin`/`revoke-admin` removed. Milestone A backend is complete. See [changelog](project-changelog.md) and [permissions](system/permissions.md).

## Progress Note (2026-10-22) — microservice-refactor plan, phase 09

Phase 09 (frontend RBAC) is implemented but uncommitted on `refactor/microservice-rbac`: permission-driven routing and nav, `/403`, generated permission types with a CI drift check, `ApiRequestError` plus the 401/403 policy, single-flight refresh, session-probe, role-scoped store reset, study-room socket recovery, Vitest for the FE, and backend fixes (refresh cookie rotation, exam-service Redis-outage 503). Follow-ups: `/study-flashcard/:id` now needs login; mobile (`examio-app`) still not adapted. See [changelog](project-changelog.md) and [permissions](system/permissions.md) § Frontend route guards.

## Progress Note (2026-10-23) — microservice-refactor plan, phase 10

Phase 10 (cut cross-DB access) is implemented but uncommitted on `refactor/microservice-rbac`: one owning service per Prisma model (`yarn check:ownership`, `yarn check:deps` in CI), idempotent money RPCs (`WalletService.Debit`/`Credit`/`Refund`, `UpdateBalance` removed), finance admin/stats RPCs, auth user admin RPCs and `auth.user.updated`, `/auth/me` without wallet/subscription, admin stats from `GetUserStats` plus `GetRevenueStats`, page flags pushed admin to gateway by gRPC, exam user enrichment through auth public profiles, word-family category admin through exam gRPC. Migrations `20261022090000_wallet_idempotency` and `20261023090000_payment_refund_key`. Follow-ups: the database is still shared (schema split is phase 11); `examio-app` was not checked against the new `/auth/me` shape. See [changelog](project-changelog.md) and [architecture](system/architecture.md) § gRPC.

## Phase 0 — System Correctness (P0, blocking)

| # | Item | Source | Owner | Deps |
|---|------|--------|-------|------|
| 0.1 | ~~Remove `FREE_MODE = true` from `FinanceClientService.deductCredits`~~ — resolved 2026-10-23 (microservice-refactor phase 10): charging goes through the shared `FinanceClient` (`libs/grpc`); `AI_FREE_MODE` is dev/local only and forced off when `NODE_ENV=production` | W7a + scout | backend | — |
| 0.2 | ~~Fix `ocr-service` gRPC port collision~~ — resolved 2026-10-18: `ocr-service` deleted (microservice-refactor phase 01) | W7a + scout | platform | — |
| 0.3 | ~~Remove duplicate finance routes in gateway~~ — resolved 2026-10-20: proxy controllers removed, `routes.yaml` has one `wallet` / `payment` entry (microservice-refactor phase 05) | W7a | backend | — |
| 0.4 | **Decide `AuthService.ValidateToken` gRPC** — wired but unused; either remove or have downstream services use it instead of Prisma-direct lookup | W7a | backend | — |
| 0.5 | **Verify `ExamAttempt.submit` legacy endpoint** — `submitSecureQuiz` is canonical, but `submitExamAttemptApi` still exists; remove if unused | W7a | backend | — |
| 0.6 | **Fix `PendingJobDialog` unconditional render in `KLayout`** — should only appear on AI-tool pages | W7a | frontend | — |

## Phase 1 — Security & Auth Integrity (P1)

| # | Item | Source | Owner | Deps |
|---|------|--------|-------|------|
| 1.1 | **Confirm Turnstile enforcement on login page** (bot protection on repeated failed attempts) | F002 Q1 | backend | 0.1 |
| 1.2 | **Define session TTL + refresh token rotation policy** (currently undocumented) | F002 Q2 | backend | — |
| 1.3 | **Configure Google One Tap domain/email allowlist** (or document why not) | F002 Q3 | platform | — |
| 1.4 | **AES-256-CBC key provisioning mechanism** for quiz decryption (embed in JWT vs separate fetch) | F012 Q1 | backend | 0.1 |
| 1.5 | **Verify code deletion cascade** for `UserStorage` → Document chunks + embeddings + R2 object | F006 Q4 | backend | — |
| 1.6 | **Add `keys/` directory delete side-effects** (per project rule: R2 cleanup on data delete) | F006 Q4 | backend | 1.5 |

## Phase 2 — Feature Spec Edge Cases (P2)

### F001 PublicLanding
| # | Item | Owner |
|---|------|-------|
| 2.1.1 | Decide SSR vs CSR for HomePage content | frontend |
| 2.1.2 | Add contact form rate limiting (beyond Turnstile) | backend |

### F003 AccountManagement
| # | Item | Owner |
|---|------|-------|
| 2.3.1 | Document verification code TTL | backend |
| 2.3.2 | Resend rate-limit policy for OTP | backend |
| 2.3.3 | Whether OAuth accounts are auto-verified | backend |

### F004 ProfileManagement
| # | Item | Owner |
|---|------|-------|
| 2.4.1 | Image dimension constraints for avatar/banner | frontend |
| 2.4.2 | Concurrent profile edit handling (last-write-wins vs optimistic locking) | backend |

### F005 Finance
| # | Item | Owner |
|---|------|-------|
| 2.5.1 | VA expiry window (currently unknown) | backend |
| 2.5.2 | SePay webhook retry policy | backend |
| 2.5.3 | Refund/dispute handling for cancelled payments | backend |

### F006 QuizAuthoring
| # | Item | Owner |
|---|------|-------|
| 2.6.1 | Cascade delete scope for ExamRoom when QuizSet is deleted | backend |
| 2.6.2 | AI job credit deduction timing (atomic vs completion-time) | backend |
| 2.6.3 | Question deduplication behavior in DetailsQuizQuestion | backend |

### F007 FlashcardAuthoring
| # | Item | Owner |
|---|------|-------|
| 2.7.1 | Credit refund policy on failed AI jobs | backend |
| 2.7.2 | Access code brute-force protection | backend |
| 2.7.3 | Cascade delete scope for FlashcardStudyProgress | backend |

### F008 ExamHosting
| # | Item | Owner |
|---|------|-------|
| 2.8.1 | Attempt auto-cancel policy on session end | backend |
| 2.8.2 | Grading algorithm (partial credit vs all-or-nothing) | backend |
| 2.8.3 | Whitelist enforcement mechanism | backend |
| 2.8.4 | Question selection timing (pre-quiz vs on-attempt-start) | backend |

### F009 AITeacherKnowledgeBase
| # | Item | Owner |
|---|------|-------|
| 2.9.1 | Max file size limit + supported formats | backend |
| 2.9.2 | Per-user storage quota | backend |
| 2.9.3 | Chunking strategy (Docling defaults vs custom) | backend |
| 2.9.4 | Graph build failure recovery | backend |

### F010 AITool
| # | Item | Owner |
|---|------|-------|
| 2.10.1 | Credit refund on AI job failure | backend |
| 2.10.2 | Credit cost model per generation type | backend |
| 2.10.3 | Job history retention window | backend |
| 2.10.4 | Concurrent job limit per user | backend |

### F011 FlashcardStudy
| # | Item | Owner |
|---|------|-------|
| 2.11.1 | Progress reset on deck edit (preserve vs reset) | backend |
| 2.11.2 | Sound CDN failure handling | frontend |

### F012 ExamTaking
| # | Item | Owner |
|---|------|-------|
| 2.12.1 | `sendBeacon` failure fallback (server-side timeout?) | backend |
| 2.12.2 | Cheating detection coverage (fullscreen exit, print screen, copy-paste beyond tab/blur) | frontend |

### F013 SessionCleanup
| # | Item | Owner |
|---|------|-------|
| 2.13.1 | Distributed lock for multi-instance deployments | backend |
| 2.13.2 | Alerting on cron failure | platform |

## Phase 3 — Admin Dashboard

| # | Item | Owner | Status |
|---|------|-------|--------|
| 3.1 | Admin service (HTTP port 3000 in containers since microservice-refactor phase 02; originally 7006 / gRPC 50056, no gRPC server now) | backend | ✅ Complete |
| 3.2 | 6 admin modules: bootstrap, stats, finance, logs, users, audit | backend | ✅ Complete |
| 3.3 | Frontend admin pages (6 pages: overview, stats, users, finance, logs, audit) | frontend | ✅ Complete |
| 3.4 | Ticket exchange SSE (server-sent events for real-time updates) | backend | ✅ Complete |
| 3.5 | Soft delete for users (`isBanned` + `deletedAt`) | backend | ✅ Complete |
| 3.6 | antd Table with pagination + filters on all list pages | frontend | ✅ Complete |

Key decisions made during implementation:
- Admin routes are guarded by `@RequirePermissions('admin:access')` from `@examio/auth-jwt` (stateless JWT; `AdminGuard` removed in microservice-refactor phase 04)
- Ticket exchange uses SSE (no WebSocket); graceful fallback to polling if SSE fails
- User soft-delete: `isBanned = true` + `deletedAt = now()`; hard delete deferred
- All admin mutations write one `AdminAudit` row per changed field
- Admin service healthcheck: `GET /health/live` and `GET /health/ready` (shared `libs/observability` controller; moved from `/api/v1/health` in microservice-refactor phase 01)

## Phase 4 — Page Feature Flags (Feature Toggling)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 4.1 | `PageFeatureFlag` Prisma model + seed file | backend | ✅ Complete |
| 4.2 | `PageConfigModule` (admin-service) + proxy controller (gateway) | backend | ✅ Complete |
| 4.3 | `PageEnabledGuard` in `@examio/common` | backend | ✅ Complete |
| 4.4 | Shared page-key constants (`page-keys.enum.ts`) | backend | ✅ Complete |
| 4.5 | SSE endpoint for real-time flag updates | backend | ✅ Complete |
| 4.6 | `usePageConfigStore` (Zustand) + `PageConfigApiClient` | frontend | ✅ Complete |
| 4.7 | `PageConfigProvider` + sidebar filter integration | frontend | ✅ Complete |
| 4.8 | Route guards + i18n translations | frontend | ✅ Complete |

Key decisions made during implementation:
- System-level flags (`isSystemLevel=true`) cannot be disabled; app-level flags can toggle
- SSE preferred over WebSocket for lighter client footprint; polling fallback if SSE unavailable
- Flags cached in Zustand; synced via SSE (300ms debounce) to reduce noise
- `PageEnabledGuard` runs after `JwtAuthGuard` to ensure authenticated context
- Mobile sync (iosApp/androidApp) deferred to next phase

## Phase 6 — Study-Together Room (Web)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 6.1 | `StudyRoom` + `StudyRoomMember` Prisma models | backend | ✅ Complete (⚠️ no migration applied yet) |
| 6.2 | `StudyRoomModule` (Socket.io gateway, Redis-backed live state, Pomodoro timer, chat, presence, focus-credit) in `exam-service` | backend | ✅ Complete |
| 6.3 | `@socket.io/redis-adapter` multi-instance fan-out | backend | ✅ Complete |
| 6.4 | Gateway WS upgrade proxy (`/ws/study`, `http-proxy` `ws:true`; authenticated at the gateway since phase 05) | backend | ✅ Complete |
| 6.5 | REST surface `/api/v1/studyrooms/*` (create/join/detail/update/delete/leave/regenerate-code/leaderboard) | backend | ✅ Complete |
| 6.6 | Frontend routes `/k/study-room`, `/k/study-room/:id` + Socket.io client + store | frontend | ✅ Complete |
| 6.7 | Mobile (iosApp/androidApp) parity | mobile | ❌ Not started (web only by design) |
| 6.8 | Playlist: `StudyRoomPlaylistItem` model + add/remove/reorder/next/prev/jump + leader-reported `media:ended` auto-advance (no YouTube Data API) | backend | ✅ Complete (⚠️ no migration applied yet) |
| 6.9 | Access modes: `StudyRoom.accessType` (PUBLIC/CODE/WHITELIST) + `POST /studyrooms/:id/join` | backend | ✅ Complete (⚠️ no migration applied yet) |
| 6.10 | Moderation: `StudyRoomMember.isBanned`/`.isMuted` (host/cohost ban+mute, cross-instance kick via redis-adapter) | backend | ✅ Complete (⚠️ no migration applied yet) |
| 6.11 | Personal chat block: `StudyRoomChatBlock` model, server-persisted + client-filtered | backend | ✅ Complete (⚠️ no migration applied yet) |
| 6.12 | Frontend playlist/access/moderation UI wired into existing study-room pages + store | frontend | ✅ Complete |

Key decisions made during implementation:
- Socket.io/WebSocket chosen over SSE — this feature needs bidirectional low-latency sync (timer control, media seek, chat), unlike existing SSE use cases which are server-to-client only
- FE client uses websocket-only transport (no long-polling) to avoid sticky-session requirements across gateway/exam-service instances
- Live state (timer, media position, chat, presence) lives in Redis only; Prisma holds room config + membership; chat is an ephemeral Redis LIST capped at 200 messages (no `StudyRoomMessage` model)
- Playlist items and moderation/block state ARE persisted to Prisma (unlike timer/media/chat) — they need to survive Redis flushes and reconnects; only live playback position (`currentIndex`, leader assignment) stays in Redis
- Auto-advance is leader-client-reported, not server-polled — avoids adding a YouTube Data API dependency
- Access modes mirror the existing `ExamSession` PUBLIC/CODE/WHITELIST shape rather than a new model
- **Follow-up needed**: a Prisma migration covering ALL Study Room models/fields (`StudyRoom`/`StudyRoomMember` from 2026-07-19, plus `StudyRoomPlaylistItem`/`StudyRoomChatBlock`/new fields from 2026-07-21) has not landed yet — applied to dev via raw `psql` only; block before this reaches an environment with `prisma:deploy` gating

## Phase 5 — UX Polish & Spec Completeness (P3)

| # | Item | Source | Owner |
|---|------|--------|-------|
| 5.1 | `SubscriptionPage` vs `SubscriptionTemplate` — pick canonical UI, archive the other | W7a | frontend |
| 5.2 | `ProfilePage` dual data source (`getProfileApi` + `useAuthStore.user`) — pick one | W7a | frontend |
| 5.3 | Add a 6th feature for **Mobile Companion** (iOS + Android app) — currently not covered in spec | F012 in legacy v3.x | spec |
| 5.4 | Add iOS + Android spec parity for any screen changes | CLAUDE.md rule | spec + mobile |
| 5.5 | Document the FREE_MODE dev-only bypass before it leaks to production | system rule | devops |
| 5.6 | Implement native feature flag bridge for iosApp + androidApp | Phase 4 follow-up | mobile |

---

## Deferred: user account deletion (phase 11, 2026-10-23)

Database per service dropped every FK to `User`, so deleting a user no longer cascades across services. No code path deletes `User` rows today (no admin DELETE, no auth `DeleteUser`, no purge worker, no per-service purgers, no `auth.user.deleted` event), so behaviour is unchanged. Account deletion needs its own design (event fan-out to finance/exam/admin purgers, plus R2 cleanup through `r2_delete_tasks`) before it ships. Source: `plans/261017-1547-microservice-refactor-rbac/phase-11-database-per-service.md` (RT-11).

## Roadmap Stats

- **Completed Phases**: Phase 3 (Admin Dashboard), Phase 4 (Page Feature Flags), Phase 6 (Study-Together Room + Playlist/Access/Moderation — web only; migration pending, mobile parity not started)
- **P0 (blocking/correctness)**: 6 items
- **P1 (security/integrity)**: 6 items
- **P2 (spec edge cases)**: 30+ items across 12 features
- **P3 (UX polish)**: 6 items (Phase 5 + 1 mobile item)
- **Total unresolved**: ~48 work items, ~55 sub-decisions

## Owner Mapping

| Owner Role | Item Count |
|------------|------------:|
| `backend` | 24 |
| `frontend` | 8 |
| `platform` | 3 |
| `spec` | 2 |
| `devops` | 1 |
| `mobile` | 1 |

## Implementation Phases (Suggested)

### ✅ Completed — Phase 3 (Admin Dashboard)
All 6 items complete. Dashboard live with audit, stats, user management, finance controls.

### ✅ Completed — Phase 4 (Page Feature Flags)
All 8 items complete. Dynamic page enable/disable without redeployment. SSE real-time sync.

### ✅ Completed — Phase 6 (Study-Together Room, web only)
11 of 12 items complete (mobile parity not started, by design). Synchronized Pomodoro + shared YouTube media + roster + chat + leaderboard over the backend's first WebSocket transport, extended with an ordered playlist (leader-reported auto-advance), PUBLIC/CODE/WHITELIST access modes, host/cohost ban+mute moderation, and personal chat blocking. **Blocker before any deploy that runs `prisma:deploy` gating**: no migration exists yet for any Study Room model (`StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock`).

### Sprint Next — Phase 0 (System Correctness)
Goal: remove blockers that mask real bugs
- 0.1, 0.2, 0.3 (low-hanging cleanup)
- 0.4, 0.5 (dead-code audit)
- 0.6 (PendingJobDialog fix)

### Sprint +1 — Phase 1 (Security)
- 1.1, 1.2, 1.3 (auth integrity)
- 1.4 (AES key provisioning) — P0 implications
- 1.5, 1.6 (R2 cleanup on delete)

### Sprint +2+ — Phase 2 (Feature Edge Cases)
Tackle per feature. Suggestion: 1 feature per sprint.
- F006 (largest), F008 (most complex), F012 (most security-sensitive) first.

### Backlog — Phase 5
P3 items (UX polish, mobile sync) nice-to-have; not blocking for v1.

## Cross-References

- Full feature specs: `docs/features/F###_*/technical-spec.md`
- Unresolved business questions: `docs/system/glossary.md` § Unresolved Business Questions
- Review warnings: `plans/260605-2033-rebuild-spec/artifacts/review-report.md`
- W7a findings: `plans/260605-2033-rebuild-spec/artifacts/core-review-report.md`

## Update Protocol

This roadmap is regenerated/updated after each rebuild-spec run. To update manually:

1. Resolve an item → mark `[x] resolved` and link to PR/commit
2. New blocker discovered → add to Phase 0 with `P0` + source link
3. Quarterly review → re-prioritize P2/P3 items
