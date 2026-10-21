# Phase 18 — Mobile RBAC Parity (examio-app, cross-repo)

> **Cross-repo.** `examio-app/` (KMP shared + `androidApp` + `iosApp`) is NOT in this checkout. Every file path below is **[UNVERIFIED]**, taken from project memory notes, until step 1 replaces them. **iOS + Android parity is mandatory** (CLAUDE.md "khi sửa UI trên mobile thì cần sửa cả iosApp và androidApp").
>
> <!-- Updated: Validation Session 1 - RT-13 reversed (mobile unreleased) --> **Release gate.** The mobile app has never been released (validation Q6), so no store build depends on the old API. This phase blocks no backend work or deploy. Its only gate: it **must be finished before the first mobile store release**, and that release targets the post-cutover backend (phase 16 runbook, single production deploy at final merge).

## Context Links
- [plan.md](./plan.md) · [validation-session-1.md](./reports/validation-session-1.md) Q6 (reverses RT-13) · [red-team-changes.md](./reports/red-team-changes.md) RT-15 · [planner-brief.md](./reports/planner-brief.md) decisions 3, 5, 12, 14 <!-- Updated: Validation Session 1 - RT-13 reversed -->
- [phase-04](./phase-04-identity-and-rbac-core.md) (`/auth/me|login|refresh` → `{user, roles, permissions}`, no `isAdmin` alias, `av` claim, `EMAIL_NOT_VERIFIED`), [phase-05](./phase-05-gateway-rewrite.md) (401 `TOKEN_STALE` from `gw:user:<id>:av`), [phase-09](./phase-09-frontend-rbac.md) (web behaviour to mirror), [phase-10](./phase-10-cut-cross-db-access.md) (`/auth/me` has no `wallet`; balance via `GET /wallet/info`) <!-- Updated: Validation Session 1 - no compat fields -->
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §4.6 (mobile = Bearer, 401 codes)
- Pending mobile plans to align: `/Users/tgiap.dev/devs/examio/plans/260525-0629-mobile-screens/`, `/Users/tgiap.dev/devs/examio/plans/260704-1030-ai-flashcard-quiz-generation-app/`

## Overview
- Priority: P2 · Status: Pending · Effort: 2.75d **provisional — re-estimate after step 1** · Depends on: 09 (web behaviour + final API shapes from 04/05/10) · Gate: done before the first mobile store release. Blocks: nothing in this plan. <!-- Updated: Validation Session 1 - P2, deps 09, −0.25d (no legacy fallback, no coordinated release) -->
- Goal: the mobile app reads permissions from the server, shows only the features they allow, handles `TOKEN_STALE` (one refresh → refetch me → reset caches) and `SESSION_REVOKED` (logout). It shows no admin screens. Same behaviour on Android and iOS.

## Key Insights
- Mobile auth uses `Authorization: Bearer`. Tokens come in the body of `/auth/login` and `/auth/refresh` (ARCH §4.6). The access token is RS256 with an `av` (authzVersion) claim (phase 04), but the client never decodes it. Permissions come only from the response body (decision 12, same as web).
- <!-- Red Team: RT-3 --> `TOKEN_STALE` means the token's `av` is older than the gateway's `gw:user:<id>:av` (role change, admin flag, ban, password change). One refresh issues a token with the current `av`. A second `TOKEN_STALE` right after a refresh is not recoverable → logout.
- Android refresh lives in shared `AuthInterceptor.kt` (status-based 401 refresh, fixed 2026-07; memory). Session expiry is broadcast via shared `SessionEvents` SharedFlow → Android `ExamioApp`, iOS `NotificationCenter .examioSessionExpired`. iOS has its own Swift `ExamioAPIClient` + `TokenRefresher` actor (single-flight, retry once) [UNVERIFIED paths].
- iOS reimplements several features in Swift rather than through shared Kotlin (exam-room is Android-only, memory). Parity work = two implementations of the gating.
- <!-- Updated: Validation Session 1 - no compat fields --> API changes the app absorbs (target shape only; no old shape to tolerate): `roles`/`permissions` added; `User.isSystemAdmin` replaces `isAdmin` (no alias); `user.wallet` is gone (phase 10) → balance from `GET /api/v1/wallet/info`; new 401 codes `TOKEN_EXPIRED | TOKEN_STALE | SESSION_REVOKED`; 403 `PERMISSION_DENIED`; 403 `EMAIL_NOT_VERIFIED` (RT-6). `User.id` is already a `String` today (`libs/database/src/models/user.prisma:2`), so it is not a change.
- <!-- Red Team: RT-15 --> Every user has exactly one base role (`STUDENT` | `TEACHER`), optionally plus `SYSTEM_ADMIN`. An "admin-only" account cannot exist, so there is no admin-only screen and no such fixture. Gating is driven purely by `permissions`, never by role names.
- TEACHER does not have `flashcard:study`/`quiz:practice`/`exam:take`. Teachers preview only their own content (owner checks). Both roles have `word_family:save`. <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->

## Requirements
Functional
- Shared KMP module: model `AuthSession { user, roles: List<String>, permissions: Set<String> }` parsed from login/refresh/me. `Permission` string constants mirror the catalog (decision 5 + TEACHER `word_family:save`). `fun can(p: String): Boolean`. Persist permissions next to tokens (secure storage) for cold start, then refresh from `/auth/me`. <!-- Updated: Validation Session 1 - catalog -->
- Error handling (shared + iOS client) <!-- Red Team: RT-3, RT-6, RT-15 -->:
  - 401 `TOKEN_STALE` or `TOKEN_EXPIRED` → single-flight refresh → retry the original request **once**. On `TOKEN_STALE` also refetch `/auth/me` and emit `SessionEvents.PermissionsChanged` → clear feature caches (sets, rooms, wallet). A second `TOKEN_STALE`/`TOKEN_EXPIRED` on the retried request → logout (no refresh loop).
  - 401 `SESSION_REVOKED` or refresh failure → clear tokens → `SessionExpired` → login screen (existing path).
  - 403 `PERMISSION_DENIED` → a "Bạn không có quyền" state, no crash, no retry.
  - 403 `EMAIL_NOT_VERIFIED` → a "verify your email" state with resend (`sendVerificationEmail` is `@AllowUnverified`, phase 04).
- Navigation by permission (both platforms) <!-- Red Team: RT-15 -->:
  - AI generator ← `ai:generate`; manage quiz/flashcard sets ← `quizset:manage`, `flashcardset:manage`; exam rooms/sessions ← `exam_room:manage`, `exam_session:manage`; join/take exam session ← `exam:take`; study room create ← its create permission, join ← `study_room:join`; word family generate (TEACHER) / "to flashcard" ← their permissions, read/save ← theirs (save: STUDENT + TEACHER); wallet/subscription/pricing CTA ← `wallet:use`, `subscription:manage`; granted materials ← `flashcard:study` / `quiz:practice`.
  - Exact permission names come from `libs/auth-jwt/src/permissions.ts` (phase 04) at implementation time; do not hard-code role → feature tables.
  - `SYSTEM_ADMIN` adds nothing on mobile (admin screens are never built on mobile).
- Wallet: load from `GET /api/v1/wallet/info` only when `can("wallet:use")` (`/auth/me` has no `wallet` since phase 10). <!-- Updated: Validation Session 1 - no compat fields -->
- Strings vi/en/ja for the new states (match web i18n keys from phase 09 where possible).

Non-functional
- Decoders keep `ignoreUnknownKeys = true` (forward-compatible with additive fields) [UNVERIFIED current Json config]. `roles`/`permissions` are required in the new model; no legacy mode. <!-- Updated: Validation Session 1 - no legacy fallback -->
- No extra network calls on screens the permissions do not open (gate before ViewModel init).

## Architecture
```
login/refresh/me ──► shared AuthRepository ──► AuthSession(roles, permissions) ──► secure storage
                                   │                         └─► StateFlow<AuthSession> ─► Android NavGraph / iOS TabView builder (by permission)
AuthInterceptor (Ktor) / TokenRefresher (Swift):
  401 TOKEN_STALE|EXPIRED ─► refresh (single-flight) ─► retry once ─► (STALE) GET /auth/me ─► PermissionsChanged ─► cache reset
                                                       └─ retried request 401 again ─► SessionExpired ─► Login
  401 SESSION_REVOKED / refresh fail ─► SessionExpired ─► Login
  403 PERMISSION_DENIED ─► denied state · 403 EMAIL_NOT_VERIFIED ─► verify-email state
Dev/QA: app builds point at local compose (branch backend). First store release: after the phase-16 production cutover.
```
<!-- Updated: Validation Session 1 - release decoupled from backend deploy -->

## Related Code Files
File ownership: the examio-app repo only. Nothing in this checkout. All paths are relative to `examio-app/` and **[UNVERIFIED]** until step 1:
- Shared: `shared/src/commonMain/kotlin/**/auth/{AuthSession.kt,Permission.kt,AuthRepository.kt,SessionEvents.kt}`, `shared/src/commonMain/kotlin/**/network/AuthInterceptor.kt`, `shared/src/commonMain/kotlin/**/model/User.kt`, `shared/src/commonTest/**/auth/*Test.kt`
- Android: `androidApp/src/main/**/ExamioApp.kt`, `androidApp/src/main/**/navigation/*` (bottom bar/NavGraph), `androidApp/src/main/**/features/{ai,exams,exams/room,exams/session,study,studyroom,wordfamily,profile,subscription}/**` (entry gating), `androidApp/src/main/**/AndroidAppContainer.kt`, `androidApp/src/main/res/values*/strings.xml`, `androidApp/proguard-rules.pro`
- iOS: `iosApp/**/Networking/{ExamioAPIClient.swift,TokenRefresher.swift}`, `iosApp/**/Models/{User.swift,AuthSession.swift,Permission.swift}`, `iosApp/**/App/RootView.swift` (TabView), `iosApp/**/Features/{AI,DeThi,Study,StudyRoom,WordFamily,Profile}/**`, `iosApp/**/Resources/*.lproj/Localizable.strings`

## Implementation Steps
1. Locate the examio-app repo, read the real tree, replace the [UNVERIFIED] paths in this file, record gaps (does iOS use shared KMP models? current Json config? which screens exist per platform?), then **re-estimate this phase** and report the effort to the lead for plan.md. Can start once phase 09 lands on the branch. <!-- Updated: Validation Session 1 - no Milestone-A prerequisite -->
2. Shared: `AuthSession` + `Permission` constants + `can()`. Update the `User` model (`isSystemAdmin`; drop `isAdmin` and `wallet`). Persist the session. <!-- Updated: Validation Session 1 - no compat fields -->
3. Shared `AuthInterceptor`: parse the error `code` from the 401/403 body. Implement the STALE/EXPIRED (refresh once)/REVOKED/PERMISSION_DENIED/EMAIL_NOT_VERIFIED branches. Emit `PermissionsChanged`.
4. Android: build the nav/bottom bar from `AuthSession` (StateFlow) by permission. Gate each feature entry. 403 + verify-email states. Reset caches on `PermissionsChanged`. Keep-rules for the new serializable models.
5. iOS: mirror steps 2–4 in Swift (`TokenRefresher` code branches, `Permission.swift`, TabView builder, gated buttons, 403 + verify-email views, cache reset via NotificationCenter `.examioPermissionsChanged`).
6. Wallet loading via `/wallet/info` behind `wallet:use` on both platforms.
7. i18n strings (vi/en/ja) on both platforms.
8. Release readiness: QA both builds against local compose running the branch backend. Smoke-test the Android release (R8) build first (memory: R8 breakage shows only at runtime). The first store submission happens only after the phase-16 cutover is live. <!-- Updated: Validation Session 1 - release decoupled -->
9. Update the two pending mobile plans with a note: any new screen must declare its permission gate.

## Tests
Write first:
- Shared `commonTest` (Ktor MockEngine): 401 `TOKEN_STALE` → refresh → retry → `/auth/me` called → `PermissionsChanged` emitted once; retried request 401 `TOKEN_STALE` again → `SessionExpired`, exactly 1 refresh; 2 concurrent 401s → 1 refresh; `SESSION_REVOKED` → `SessionExpired`, no retry; 403 `PERMISSION_DENIED` → typed `PermissionDenied`; 403 `EMAIL_NOT_VERIFIED` → typed `EmailNotVerified`. <!-- Red Team: RT-3, RT-6 -->
- Shared: `AuthSession` decoding fixtures for STUDENT / TEACHER / TEACHER+ADMIN / STUDENT+ADMIN `/auth/me` payloads (copied from the backend phase-04/10 e2e snapshots; no `isAdmin`, no `wallet`). <!-- Red Team: RT-15 --> <!-- Updated: Validation Session 1 - no legacy fixture -->
- Android unit: nav builder returns the expected destinations per permission fixture.
- iOS XCTest: `TokenRefresher` STALE path (refresh once, then logout); nav model per permission fixture.
- Manual QA matrix on device (both platforms, local compose backend): STUDENT, TEACHER, TEACHER+ADMIN, STUDENT+ADMIN; role change by admin on web while the app is open → the next request triggers STALE → UI updates without re-login; ban on web → next request → login screen.

## Todo List
- [ ] Step 1: locate/read examio-app, verify paths, re-estimate <!-- Updated: Validation Session 1 - no Milestone-A prerequisite -->
- [ ] Shared AuthSession/Permission + User model changes (`isSystemAdmin`, no `isAdmin`/`wallet`)
- [ ] Shared interceptor STALE(once)/EXPIRED/REVOKED/403/EMAIL_NOT_VERIFIED
- [ ] Android permission-based nav + gating + 403/verify states + cache reset
- [ ] iOS same (Swift)
- [ ] Wallet via /wallet/info
- [ ] i18n vi/en/ja both platforms
- [ ] Tests (shared, Android, iOS) + manual QA matrix
- [ ] Release-ready builds verified against local compose; store submission scheduled after the phase-16 cutover <!-- Updated: Validation Session 1 - release decoupled -->
- [ ] Note in pending mobile plans

## Success Criteria
- `./gradlew :shared:allTests :androidApp:assembleDebug :androidApp:assembleRelease` green (run in examio-app).
- `xcodebuild -scheme ExamioApp -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' build test` green.
- QA matrix: a STUDENT sees no AI/wallet/create entries on either platform. A role flip TEACHER→STUDENT applies within 1 request without logout (exactly one refresh in the network log). <!-- Red Team: RT-15 -->
- `grep -rn "isAdmin\|\.wallet\b" shared/src/commonMain iosApp` (in examio-app) → no reads of the removed fields. The effort line reflects the step-1 re-estimate. <!-- Updated: Validation Session 1 - no compat fields -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| A store release ships before the backend cutover and hits the old production API | L | H | Gate: first submission only after the phase-16 cutover smoke passes <!-- Updated: Validation Session 1 - release gate --> |
| Refresh loop on repeated `TOKEN_STALE` | L | M | <!-- Red Team: RT-3 --> Retry once, then logout; test covers it |
| iOS/Android drift (separate implementations) | H | M | One QA matrix for both; shared fixtures; a parity checklist in the PR |
| Release build R8 strips the new serializable classes | M | M | Keep-rules for the new models; smoke-test the release build |
| Paths / effort in this plan are wrong | H | M | Step 1 verification + re-estimate before any edit |

## Rollback
- App-side commits revert independently in examio-app. No store build exists yet, so there is nothing to roll back in the stores; after the first release, use the normal store rollback (previous build). <!-- Updated: Validation Session 1 - mobile unreleased -->

## Security Considerations
- UI gating is cosmetic; the backend enforces permissions (decision 4). Never derive permissions client-side from the JWT.
- Tokens + session stay in Keychain/EncryptedSharedPreferences. Clear the cached permissions on logout/expiry.

## Next Steps
- No backend follow-up (no compat fields to remove; phase 19 has no compat step). <!-- Updated: Validation Session 1 - no compat fields -->
- [CARRIED from 09] D7: decide whether `/auth/refresh` keeps returning `refreshToken` in the body (web uses the cookie only; mobile is the body consumer). Record the decision before step 3.
- Follow-up (not in scope): student quiz practice + code remembering screens on mobile (backend from phase 07). Track it in the mobile plans.
