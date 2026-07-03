---
title: Examio Development Roadmap
last_updated: 2026-07-03
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

---

## Phase 0 — System Correctness (P0, blocking)

| # | Item | Source | Owner | Deps |
|---|------|--------|-------|------|
| 0.1 | **Remove `FREE_MODE = true` from `FinanceClientService.deductCredits`** — credit bypass shipped in production code path | W7a + scout | backend | — |
| 0.2 | **Fix `ocr-service` gRPC port collision** (default 50053 conflicts with `finance-service`) | W7a + scout | platform | — |
| 0.3 | **Remove duplicate finance routes** in gateway (`wallet-profile-proxy.controller.ts` vs `finance-proxy.controller.ts` both expose `/payment/*`, `/subscription*`) | W7a | backend | — |
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
| 3.1 | Admin service (port 7006, gRPC 50056) | backend | ✅ Complete |
| 3.2 | 6 admin modules: bootstrap, stats, finance, logs, users, audit | backend | ✅ Complete |
| 3.3 | Frontend admin pages (6 pages: overview, stats, users, finance, logs, audit) | frontend | ✅ Complete |
| 3.4 | Ticket exchange SSE (server-sent events for real-time updates) | backend | ✅ Complete |
| 3.5 | Soft delete for users (`isBanned` + `deletedAt`) | backend | ✅ Complete |
| 3.6 | antd Table with pagination + filters on all list pages | frontend | ✅ Complete |

Key decisions made during implementation:
- `AdminGuard` lives in `@examio/common` — standalone JWT verify + DB lookup, avoids double `canActivate` from inheritance
- Ticket exchange uses SSE (no WebSocket); graceful fallback to polling if SSE fails
- User soft-delete: `isBanned = true` + `deletedAt = now()`; hard delete deferred
- All admin mutations write one `AdminAudit` row per changed field
- Admin service healthcheck: `GET /api/v1/health` (same pattern as other NestJS services)

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

## Roadmap Stats

- **Completed Phases**: Phase 3 (Admin Dashboard), Phase 4 (Page Feature Flags)
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
