# Permissions

**Project**: examio
**Generated**: 2026-06-05
**Analysis Scope**: All 32 frontend screens + 17 backend route groups + BL inventory

---

## Current RBAC Catalog (microservice refactor phases 04 and 06, 2026-10-19 / 2026-10-20)

> Authoritative for the code on `refactor/microservice-rbac`. Source: `examio-be/libs/auth-jwt/src/permissions.ts` (`ROLE_PERMISSIONS`). The legacy `PERM###` sections below pre-date it and still describe `AuthGuard` / `AdminGuard` / `User.isAdmin`, which no longer exist; where they conflict, this section wins (full rewrite is phase 19 of the plan).

### Roles

| Role | Where it lives | Notes |
|---|---|---|
| `STUDENT` | `User.role = STUDENT` (default on register) | Exclusive with `TEACHER`. |
| `TEACHER` | `User.role = TEACHER` | Exclusive with `STUDENT`. Only a SYSTEM_ADMIN can grant it. |
| `SYSTEM_ADMIN` | `User.isSystemAdmin = true` | Flag that combines with either base role. Replaces `User.isAdmin`. |
| `SERVICE` | Service token (`sub = svc:<name>`) | A token kind, not a user role; has no entry in `ROLE_PERMISSIONS`. |

Token `roles` = `[baseRole]`, plus `SYSTEM_ADMIN` when flagged (`rolesFor`). Permissions never travel in the token; they are derived from `roles` at check time (`permissionsOf`, union, no wildcard).

### Role to permission table

| Permission | STUDENT | TEACHER | SYSTEM_ADMIN |
|---|:-:|:-:|:-:|
| `flashcard:study` | x | | |
| `quiz:practice` | x | | |
| `exam:take` | x | | |
| `study_room:join` | x | x | |
| `word_family:read` | x | x | |
| `word_family:save` | x | x | |
| `quizset:manage` | | x | |
| `flashcardset:manage` | | x | |
| `exam_room:manage` | | x | |
| `exam_session:manage` | | x | |
| `exam_result:view` | | x | |
| `content:share` | | x | |
| `user:search` | | x | |
| `ai:generate` | | x | |
| `ai_chat:use` | | x | |
| `document:upload` | | x | |
| `study_room:create` | | x | |
| `word_family:generate` | | x | |
| `wallet:use` | | x | |
| `subscription:manage` | | x | |
| `admin:access` | | | x |
| `user:manage` | | | x |
| `role:assign` | | | x |
| `finance:admin` | | | x |
| `stats:read` | | | x |
| `logs:read` | | | x |
| `audit:read` | | | x |
| `page_config:manage` | | | x |
| `word_family:admin` | | | x |

A SYSTEM_ADMIN who is also a STUDENT/TEACHER holds the union of both columns. A bare admin (`STUDENT` + flag) does not get `quizset:manage` etc.; admin permissions do not imply teacher permissions.

### Enforcement (`@examio/auth-jwt`)

| Declaration | Meaning |
|---|---|
| `@Public()` | Anonymous allowed; an invalid token is ignored. |
| `@Authenticated()` | Any verified user; unverified email gets 403 unless `@AllowUnverified()`. |
| `@RequirePermissions(...p)` | User token holding ALL listed permissions (AND); unverified email always 403; service tokens rejected. |
| `@ServiceOnly(...callers)` | Service token whose name is in `callers`. |
| `@RequirePermissionsOrService(p[], { callers? })` | User holding `p` (empty = any verified user) OR an allowlisted service token. |
| none | `PermissionsGuard` denies: 403 `NO_AUTHZ_DECLARED` (deny by default). |

- Guard order: `JwtAuthGuard` (stateless RS256/JWKS verify, no DB per request) then `PermissionsGuard`. Registered as global `APP_GUARD`s by `AuthJwtModule.forRoot` (`globalGuards` defaults to true; the gateway sets it to `false` for now). WebSocket contexts are skipped; the study-room socket middleware verifies the token itself.
- IDOR rule for gRPC RPCs that take a `user_id`: `assertSelfOrService(metadata, userId)`; a user token may only name its own `sub`, an allowlisted service may name anyone.
- Role changes (`SetUserRole`, `SetSystemAdmin` on auth) require `role:assign`; only a SYSTEM_ADMIN can grant TEACHER or admin. A user cannot change their own role (403 `CANNOT_CHANGE_OWN_ROLE`); the last active SYSTEM_ADMIN cannot be demoted (409 `LAST_SYSTEM_ADMIN`). Every change writes `RoleChangeLog`, bumps `User.authzVersion` and emits `auth.user.authz_changed` in the same transaction.
- Stale tokens: a role change takes effect when the access token is refreshed (15 min max); the refresh reloads the role in a transaction and refuses banned/deleted accounts (401 `ACCOUNT_DISABLED`).
- `GET /auth/me` returns `{ user, roles, permissions }`; `user.isSystemAdmin` replaces `isAdmin`.

### Per-endpoint enforcement (phase 06, 2026-10-20)

> Source: `@RequirePermissions` / `@RequireOwnerOrPermission` / `@Authenticated()` / `@Public()` on the exam, finance, admin and r2 controllers; `examio-be/test/authz/` (`handler-declarations.spec.ts` fails on an undeclared HTTP handler or WS gateway class, on an `@Authenticated()` handler missing from `authenticated-allowlist.ts`, or an entry without a two-user spec; `authz-matrix.spec.ts` proves STUDENT / TEACHER / admin-only per row).

| Area (controller) | Routes | Declaration |
|---|---|---|
| quizset | all CRUD, stats, list, questions, labels, set/save-history | `quizset:manage`. `GET /quizsets/public/:id` removed |
| quizset-sharing | `:id/sharing` (GET/PUT), `:id/generate-code` | `content:share` (owner only, else 404; `QuizsetSharingController`) |
| | `users/search` | `user:search` |
| quiz-practice | `sets`, `sets/:id/unlock` | `quiz:practice` (STUDENT) |
| | `sets/:id/access` | `@Public()` (token optional; no code or lists in the payload) |
| | `POST attempts` | `@RequireOwnerOrPermission('quiz:practice', QuizSetOwnerResolver)` (allowlist); no grant = 404 |
| | `GET attempts`, `GET/PUT attempts/:id`, `attempts/:id/submit` | `@Authenticated()` (allowlist; own attempts only, else 404; open attempt also needs current set access) |
| flashcardset | CRUD, stats, labels, cards, set/save-history | `flashcardset:manage` |
| | `:id/sharing` (GET/PUT), `:id/generate-code`, `:id/share` | `content:share`; `share` is owner-only |
| | `users/search` | `user:search` |
| | `public/:id`, `study/:id/info`, `study/:id/access` | `@Public()` (no code, no whitelist in the payload) |
| | `study/:id` | `@RequireOwnerOrPermission('flashcard:study', FlashcardSetOwnerResolver)` (allowlist) |
| | `study/:id/verify-code`, `study/:id/with-code` | `flashcard:study` + access-code guard |
| flashcard-study | `progress/:flashCardSetId` (GET/POST) | `@RequireOwnerOrPermission('flashcard:study', ...)` (allowlist) + set access check (no access = 404) |
| student | `recent-flashcards`, `pin-flashcard/:id` | `flashcard:study` (pin needs set access, else 404; unpin always allowed) |
| | `recent-exams`, `pin-exam-room/:id` | `exam:take` (pin needs room access, else 404) |
| examroom | CRUD, `detail/:id`, `list`, `list-all`, `:id/sessions` | `exam_room:manage` (host). `get-public/:id` `@Public()`: `{id,title,description,host:{name,avatar}}` only, and only for a room with a PUBLIC session |
| examsession | CRUD, `get-by-id`, `:id/sharing`, `:id/generate-code`, `room/:roomId/available-labels` | `exam_session:manage` (host) |
| | `users/search` | `user:search` |
| | `get-public/:id`, `study/:id/info`, `study/:id/access` | `@Public()` (sanitised) |
| | `study/:id`, `study/:id/stats` | `exam:take`; answer-free view |
| | `study/:id/verify-code`, `study/:id/with-code` | `exam:take` + access-code guard |
| examattempt | `history-stats`, `start`, `:id/progress`, `:id/submit`, `:id/quiz`, `:id/secure-*`, `POST /`, `list` | `exam:take` (own attempt). `start` no longer admits the room host |
| | `list-by-room/:id`, `list-by-session/:id` | `exam_result:view` (host) |
| | `DELETE :id` | `exam_session:manage` (host) |
| | `:id/detail`, `get-by-id/:id`, `PUT :id` | `@Authenticated()` (allowlist); `examattempt-access.ts`: examinee with `exam:take`, or host with `exam_result:view` (read) / `exam_session:manage` (write); else 404 |
| cheatinglog | `POST /` | `exam:take`; `attempt/:id`, `session/:id/stats`, `session/:sid/user/:uid`: `exam_result:view` (host, else 404) |
| study-room | `POST /`, `PUT/DELETE :id`, `:id/regenerate-code` | `study_room:create` |
| | `mine`, `join`, `:id/join`, `:id`, `:id/leave`, `:id/leaderboard` | `study_room:join` |
| word-family | `categories`, `roots`, `category/...`, `generation-status/*` | `word_family:read` |
| | `save`, `saved`, `DELETE saved/:id` | `word_family:save` |
| | `generate`, `generate-root` | `word_family:generate` (TEACHER only; free; 20/day per user, 429 `WORD_FAMILY_DAILY_LIMIT`; 503 `GENERATION_LIMIT_UNAVAILABLE` if Redis is down) |
| | `:id/to-flashcard` / categories POST/PUT/DELETE | `flashcardset:manage` / `word_family:admin` |
| ai | `quick-upload`, `upload`, `upload-image`, `recent-uploads`, `GET/DELETE upload/:id` | `document:upload` (own) |
| | `generate-from-file`, `regenerate/:id`, `job/:id`, `upload/:id/history`, `models` | `ai:generate` (own) |
| ai-chat | all handlers (class-level) | `ai_chat:use` (own); `:chatId/exists` is `true` only for the caller's own chat |
| subject | 4 GETs | `@Public()` |
| r2 (exam) / r2-service | `POST /r2/image` / `internal/upload` | `document:upload` / `@Public()` (internal, not routed by the gateway) |
| finance | `payment/create`, `status/:id`, `history`, `cancel/:id`; `wallet/info`, `wallet/details` | `wallet:use` |
| | `payment/subscription` / `subscription/plans` / `POST /webhook` | `subscription:manage` / `@Public()` / `@Public()` (SePay key) |
| admin | users (list, `:id`, PATCH, ban, unban) | `user:manage`; PATCH rejects `isAdmin`, `isSystemAdmin`, `role`, `isBanned` (400 `VALIDATION_ERROR`) |
| | `admin/roles` (matrix, `users`, `changes`), `PUT roles/users/:id/role`, `PUT roles/users/:id/system-admin` | `role:assign` (phase 08; `grant-admin` / `revoke-admin` removed) |
| | finance / logs / page-config / stats (`admin/stats/*`, `admin/overview`, `admin/series/:name`, `admin/sources`) / audit / word-family | `finance:admin` / `logs:read` / `page_config:manage` / `stats:read` / `audit:read` / `word_family:admin` (replaces the class-level `admin:access`) |

Plain `@Authenticated()` handlers (allowlist, each with a two-user negative spec or `selfScoped: true`): examattempt `detail` / `get-by-id` / `update`; auth `logout`, `me`-style and profile handlers (self-scoped); `DevicesController` list/logout (two-user spec).

**`@RequireOwnerOrPermission(perm, Resolver)`** (`libs/auth-jwt/src/owner-or-permission.*`): composes `@Authenticated()` plus a per-handler `OwnerOrPermissionGuard`. Passes when the token holds `perm`; otherwise `Resolver.resolveOwnerId(req)` must equal the token `sub`; else 403 `PERMISSION_DENIED` (identical whether the resource is missing or foreign; logged with user, route, perm). Holding `perm` never means "sees everything": the service still runs its access predicate. This is how a TEACHER previews their own flashcard set without `flashcard:study`.

**Resource rules**

- Non-owned resource: the service answers 404 (not 403) so existence does not leak. 403 `PERMISSION_DENIED` is only for a missing permission. Cheating-log reads, exam attempt reads/writes and exam session study access follow this.
- Owner-role independence: access checks (`flashcardset-access.ts`, `examattempt-access.ts`, session study access) decide only from `isPublic`, `whitelist`, code unlock, session visibility and `ownerId === sub`. None reads the owner's `User.role` / `isSystemAdmin`. A demoted TEACHER's shared / whitelisted / public / code content stays studyable by others; the demoted owner gets 403 on every `*:manage` route (and may still study their own set as a STUDENT).
- `generate-code` (flashcard set and exam session) replaces only the code; the whitelist and visibility are kept.
- `users/search` (flashcard set and exam session): `user:search` (TEACHER); `q` trimmed, at least 3 characters (400 `QUERY_TOO_SHORT`); matches `username` / `name` by prefix or `email` by exact value (case-insensitive); max 10; self excluded; returns `{ id, username, name, avatar }`, never the email. Sharing views (`GET :id/sharing`) list whitelisted users with the same four fields.

**Role management and ban (phase 08)** (`admin-service` `AdminRolesController`, `AdminUsersController`; source of truth is auth, admin-service forwards the admin's token via `forwardUser(req)`)

| Rule | Behaviour |
|---|---|
| Who | `role:assign` for `/admin/roles*` (reading the history too: `ListRoleChanges` carries emails); `user:manage` for `/admin/users*` ban/unban |
| Base role | `PUT roles/users/:id/role` `{ role: STUDENT or TEACHER, reason? }` (auth `SetUserRole`); own row 403 `CANNOT_CHANGE_OWN_ROLE`, unknown user 404 `USER_NOT_FOUND`, concurrent change 409 `ROLE_CHANGE_CONFLICT`. No-op is 200 without an `AdminAudit` row (auth still logs a `reapply` row) |
| SYSTEM_ADMIN flag | `PUT roles/users/:id/system-admin` `{ isSystemAdmin, reason? }` (auth `SetSystemAdmin`); same errors plus 409 `LAST_SYSTEM_ADMIN` when the last active admin would be demoted |
| Ban / unban | `POST users/:id/ban` and `unban` call auth `SetUserStatus` (`user:manage`, actor = token `sub`): self 403 `CANNOT_CHANGE_OWN_STATUS`, last active admin 409 `LAST_SYSTEM_ADMIN` (unreachable over HTTP), 409 `ROLE_CHANGE_CONFLICT`. Ban sets `isBanned` (no `deletedAt`), revokes every session; ban and unban bump `authzVersion` and publish `auth.user.authz_changed` with `reason` `ban` / `unban`. Unban also clears `deletedAt` of accounts banned before RBAC |
| `PATCH /admin/users/:id` | Strict body: `role`, `isSystemAdmin`, `isAdmin`, `isBanned` give 400 `VALIDATION_ERROR` |
| Audit | `AdminAudit` after a successful RPC: `admin.role.set_base` `{from,to,reason}`, `admin.role.set_system_admin` `{from,to,reason}`, `admin.user.ban` / `admin.user.unban` `{previousIsBanned}`. Auth writes `RoleChangeLog` for every change; ban / unban / re-apply rows keep the same role and flag on both sides and a `reason` starting `ban` / `unban` / `reapply` |
| Lists | `GET roles/users` returns `{ data, meta, systemAdminCount }` (count of active, non-banned admins); rows carry `role` and `isSystemAdmin` (no `isAdmin`). `GET /admin/users` rows carry the same two fields; filter `isSystemAdmin=true|false` |

**Access-code lockout** (`exam-service/src/modules/common/access-code-guard.ts`; used by flashcard `verify-code`/`with-code`, exam session `verify-code`/`with-code`, and exam attempt `start` with an `accessCode`)

| Rule | Behaviour |
|---|---|
| Format | Code must match `^\d{6}$`, else 400 `INVALID_CODE_FORMAT` (not counted). `GET study/:id` on a code-gated set the caller has no grant for: 403 `CODE_REQUIRED` (send the code to `with-code`) |
| Counter | Redis `exam:codefail:<resourceId>:<userId>`; every evaluated attempt does an atomic `INCR` (`EXPIRE 900 NX`), so the limit is per resource AND user (an attacker only locks themselves) |
| Lockout | More than 5 attempts in 15 min: 429 `CODE_LOCKED` `{ retryAfterSeconds }` before comparing (a correct code is refused too); the 5th wrong code also answers 429 |
| Compare | `timingSafeEqual(sha256(stored), sha256(given))` (fixed length, no early exit). Wrong code below the limit: 400 `INVALID_CODE`. Success deletes the counter |
| Redis down | 503 `CODE_CHECK_UNAVAILABLE` (fail-closed) |

exam-service has no `ThrottlerModule`; per-IP rate limits for `verify-code` / `with-code` (5 / 60 s) and `users/search` (30 / 60 s) live in gateway `routes.yaml`.

**WebSocket `/ws/study`** (`StudyRoomSocketAuth`, `server.use` in `StudyRoomGateway.afterInit`; the gateway class carries a declarative `@Authenticated()` because HTTP guards skip `ws`): checks run in order: token present (`handshake.auth.token`, then Bearer/cookie), signature / `iss` / `aud` / `exp`, `email_verified`, `study_room:join`, token `av` vs Redis `gw:user:<sub>:av` (lower = stale; key missing = pass), then account not banned/deleted, then the `study-room` page flag. A failure is a `connect_error` whose message is the code: `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `EMAIL_NOT_VERIFIED`, `PERMISSION_DENIED`, `TOKEN_STALE`, `SERVICE_UNAVAILABLE` (Redis or DB error, fail-closed), `UNAUTHORIZED`, `PAGE_DISABLED`. `socket.data` holds `{ user, av, exp }`. `handleConnection` (sync) joins room `user:<id>` and schedules a disconnect at token `exp`; `handleDisconnect` clears the timer. Before the server disconnects it emits `auth:reauth { reason: 'TOKEN_EXPIRED' | 'AUTHZ_CHANGED' }` (client: refresh the token, reconnect). On `auth.user.authz_changed` (`study-room-authz.handler.ts`) sockets of that user whose `av` is below the event's `authzVersion` get `auth:reauth` then `disconnect(true)`. `room:kicked` remains for the in-room ban only.

---

## Curated View

- **Public (guest)** can view the landing page, browse featured quiz sets, flashcard sets, and exam rooms. Can register an account and log in. Cannot access any protected area without an active session.

- **Authenticated user (student)** can manage their own profile, view their wallet balance, purchase subscriptions, access study materials (flashcard study), take exams, and view their own history. Cannot create, edit, or delete any quiz set, flashcard set, exam room, or knowledge base entry. Cannot see another user's exam results.

- **Teacher** (user who has created resources) can create, edit, and delete their own quiz sets, flashcard sets, exam rooms, and exam sessions. Can view analytics for their exam sessions. Cannot modify another user's content or exam attempts.

- **Account state gates**: Unverified accounts cannot access protected pages (redirected to `/k/verify`). Expired or invalidated sessions are rejected at the middleware level with a 401 on every protected route. A `FREE_MODE` flag in production bypasses AI credit deduction (credits not required for generation).

---

## Authorization System Type

**System Type**: hybrid

RBAC with resource-ownership checks. Authenticated users have base access; teachers gain authoring permissions on resources they created; ownership guards prevent cross-user mutations.

**Identified Roles**:
- guest (unauthenticated)
- student (authenticated, no authored resources)
- teacher (authenticated, owns quiz sets, flashcard sets, exam rooms)
- subscription-tier (affects AI tool access)

---

## Permissions Index

| Code | Name | Type | Enforced At |
|------|------|------|-------------|
| PERM001 | PublicRouteAccess | route-guard | Gateway / middleware |
| PERM002 | AuthenticatedRouteAccess | route-guard | AuthGuard / middleware |
| PERM003 | UnverifiedAccountGate | route-guard | Frontend ProtectedRoute |
| PERM004 | LoginAccess | screen-permission | LoginPage |
| PERM005 | RegisterAccess | screen-permission | RegisterPage |
| PERM006 | ProfileReadOwn | data-permission | ProfilePage / API |
| PERM007 | ProfileWriteOwn | action-permission | ProfilePage |
| PERM008 | DeviceListViewOwn | data-permission | ProfilePage / API |
| PERM009 | DeviceDeleteOwn | action-permission | ProfilePage |
| PERM010 | PasswordChangeOwn | action-permission | ProfilePage |
| PERM011 | WalletViewOwn | data-permission | ProfilePage / API |
| PERM012 | SubscriptionViewOwn | data-permission | SubscriptionPage / API |
| PERM013 | SubscriptionPurchase | action-permission | SubscriptionPage |
| PERM014 | QuizSetAuthorCreate | action-permission | MyMaterialsPage, ManageQuizSetDetailPage |
| PERM015 | QuizSetAuthorEdit | resource-ownership | ManageQuizSetDetailPage |
| PERM016 | QuizSetAuthorDelete | resource-ownership | MyMaterialsPage |
| PERM017 | FlashcardSetAuthorCreate | action-permission | MyMaterialsPage, FlashcardsPage |
| PERM018 | FlashcardSetAuthorEdit | resource-ownership | ManageFlashcardSetDetailPage |
| PERM019 | FlashcardSetAuthorDelete | resource-ownership | MyMaterialsPage |
| PERM020 | ExamRoomAuthorCreate | action-permission | MyMaterialsPage, ManageExamPage |
| PERM021 | ExamRoomAuthorEdit | resource-ownership | ManageExamRoomDetailPage |
| PERM022 | ExamRoomAuthorDelete | resource-ownership | ManageExamPage |
| PERM023 | ExamSessionAuthorCreate | action-permission | ManageExamRoomDetailPage |
| PERM024 | ExamSessionAuthorManage | resource-ownership | ManageExamRoomDetailPage |
| PERM025 | ExamSessionAuthorSharing | action-permission | ManageExamRoomDetailPage |
| PERM026 | ExamSessionAuthorAnalytics | data-permission | ExamRoomSessionAnalyticsPage |
| PERM027 | ExamSessionAccess | route-guard | ExamSessionPage |
| PERM028 | ExamAttemptStart | action-permission | ExamSessionPage |
| PERM029 | ExamAttemptResume | action-permission | ExamSessionPage |
| PERM030 | ExamAttemptViewOwn | data-permission | MyExamsPage, ExamQuizPage |
| PERM031 | ExamAttemptSubmit | action-permission | ExamQuizPage |
| PERM032 | FlashcardStudyAccess | route-guard | FlashcardStudyPage |
| PERM033 | FlashcardStudyAccessCode | action-permission | FlashcardStudyPage |
| PERM034 | FlashcardStudyProgress | data-permission | FlashcardStudyPage |
| PERM035 | AIGenerationAccess | route-guard | AIToolPage |
| PERM036 | AIGenerationCredits | action-permission | AIToolPage |
| PERM037 | AIKnowledgeBaseManage | action-permission | GenAIKnowledgePage |
| PERM038 | PDFHistoryViewOwn | data-permission | HistoryPage, PDFHistoryPage |
| PERM039 | ExamHistoryViewOwn | data-permission | HistoryPage, ExamHistoryPage |
| PERM040 | SessionCleanup | env-gate | SessionCleanupCron (BL001) |
| PERM041 | FreeModeCreditBypass | env-gate | FinanceClientService (BL004) |
| PERM042 | TurnstileBotProtection | feature-flag | RegisterPage |
| PERM043 | QuizSetVisibilityControl | resource-ownership | ManageQuizSetDetailPage |
| PERM044 | FlashcardSetVisibilityControl | resource-ownership | ManageFlashcardSetDetailPage |
| PERM045 | ExamRoomVisibilityControl | resource-ownership | ManageExamRoomDetailPage |
| PERM046 | AdminRouteAccess | route-guard | `@RequirePermissions('admin:access')` / `@examio/auth-jwt` |
| PERM047 | AdminUserManagement | action-permission | AdminUsersModule |
| PERM048 | AdminGrantRevoke | action-permission | AdminUsersModule |
| PERM049 | AdminFinanceRefund | action-permission | AdminFinanceModule |
| PERM050 | AdminCreditAdjustment | action-permission | AdminFinanceModule |
| PERM051 | AdminSubscriptionTierChange | action-permission | AdminFinanceModule |
| PERM052 | AdminAuditLogView | data-permission | AdminAuditModule |
| PERM053 | AdminLogView | data-permission | AdminLogsModule |

---

## PERM001: PublicRouteAccess

**Type**: route-guard
**Enforced At**: Gateway / middleware (`SessionValidationMiddleware` — BL009)

### Description

Public routes accessible without authentication. Any incoming request without a bearer token or with an invalid/expired token passes through without rejection.

### Related Routes

- (GET) `/`
- (GET) `/about`
- (GET) `/contact`
- (GET) `/terms`
- (GET) `/privacy`
- (GET) `/cookies`
- (GET) `/security`
- (POST) `/api/v1/auth/login`
- (POST) `/api/v1/auth/register`
- (GET) `/api/v1/auth/google`
- (GET) `/api/v1/auth/google/callback`
- (POST) `/api/v1/auth/google/one-tap`
- (POST) `/api/v1/auth/refresh`
- (POST) `/api/v1/auth/sendVerificationEmail`
- (POST) `/api/v1/auth/verifyAccount`
- (POST) `/api/v1/auth/send-code-reset-password`
- (POST) `/api/v1/auth/reset-password`

### Related Screens

- SCR001 – HomePage
- SCR002 – AboutPage
- SCR003 – ContactPage
- SCR004 – TermsPage
- SCR005 – PrivacyPage
- SCR006 – CookiesPage
- SCR007 – SecurityPage
- SCR008 – LoginPage
- SCR009 – RegisterPage
- SCR010 – ForgotPasswordPage
- SCR011 – ResetPasswordPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No token required |
| student | ✓ | Token optional — if present, must be valid |
| teacher | ✓ | Token optional |

---

## PERM002: AuthenticatedRouteAccess

**Type**: route-guard
**Enforced At**: AuthGuard / middleware (applied globally via NestJS middleware registration)

### Description

All protected routes require a valid, active session token. Token must be present in `Authorization: Bearer <token>` header or `token`/`accessToken` cookie. Rejected if `isActive === false` (SESSION_INVALIDATED) or `expiresAt < now` (SESSION_EXPIRED). Returns 401 with error code.

### Related Routes

- (GET) `/api/v1/profile`
- (PUT) `/api/v1/profile`
- (GET) `/api/v1/devices`
- (DELETE) `/api/v1/devices/:deviceId`
- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/send-code-change-password`
- (GET) `/api/v1/wallet/details`
- (GET) `/api/v1/payment/subscription`
- (GET) `/api/v1/quizsets`
- (POST) `/api/v1/quizsets`
- (PUT) `/api/v1/quizsets/:id`
- (DELETE) `/api/v1/quizsets/:id`
- (GET) `/api/v1/quizsets/:id`
- (POST) `/api/v1/quizsets/:id/labels`
- (GET) `/api/v1/quizsets/:id/labels`
- (PUT) `/api/v1/quizsets/:id/labels`
- (DELETE) `/api/v1/quizsets/:id/labels/:labelId`
- (GET) `/api/v1/quizsets/:id/questions`
- (POST) `/api/v1/quizsets/:id/questions`
- (PUT) `/api/v1/quizsets/:id/questions/:questionId`
- (DELETE) `/api/v1/quizsets/:id/questions/:questionId`
- (GET) `/api/v1/flashcardsets`
- (POST) `/api/v1/flashcardsets`
- (PUT) `/api/v1/flashcardsets/:id`
- (DELETE) `/api/v1/flashcardsets/:id`
- (GET) `/api/v1/flashcardsets/:id`
- (GET) `/api/v1/flashcardsets/:id/labels`
- (POST) `/api/v1/flashcardsets/:id/labels`
- (PUT) `/api/v1/flashcardsets/:id/labels`
- (DELETE) `/api/v1/flashcardsets/:id/labels/:labelId`
- (GET) `/api/v1/flashcardsets/:id/flashcards`
- (POST) `/api/v1/flashcardsets/:id/flashcards`
- (PUT) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`
- (DELETE) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`
- (GET) `/api/v1/examrooms`
- (POST) `/api/v1/examrooms`
- (PUT) `/api/v1/examrooms/:id`
- (DELETE) `/api/v1/examrooms/:id`
- (GET) `/api/v1/examrooms/list`
- (GET) `/api/v1/examrooms/detail/:id`
- (GET) `/api/v1/examrooms/:id/sessions`
- (POST) `/api/v1/examrooms/:id/sessions`
- (GET) `/api/v1/examsessions/:id`
- (PUT) `/api/v1/examsessions/:id`
- (DELETE) `/api/v1/examsessions/:id`
- (GET) `/api/v1/examsessions/:id/sharing`
- (PUT) `/api/v1/examsessions/:id/sharing`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`
- (POST) `/api/v1/secure-quiz`
- (POST) `/api/v1/secure-submit`
- (PUT) `/api/v1/examattempts/:attemptId/progress`
- (POST) `/api/v1/cheatinglogs`
- (GET) `/api/v1/student/recent-flashcards`
- (GET) `/api/v1/student/recent-exams`
- (GET) `/api/v1/quizsets/stats`
- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`
- (GET) `/api/v1/ai/tutor/knowledge-folders`
- (POST) `/api/v1/ai/tutor/knowledge-folders`
- (PUT) `/api/v1/ai/tutor/knowledge-folders/:id`
- (DELETE) `/api/v1/ai/tutor/knowledge-folders/:id`
- (GET) `/api/v1/ai/tutor/knowledge-files`
- (POST) `/api/v1/ai/tutor/knowledge-files`
- (DELETE) `/api/v1/ai/tutor/knowledge-files/:id`
- (POST) `/api/v1/ai/tutor/knowledge-files/:id/reprocess`
- (GET) `/api/v1/ai/tutor/dataset-imports`
- (POST) `/api/v1/ai/tutor/dataset-imports`
- (GET) `/api/v1/ai/tutor/knowledge-stats`
- (GET) `/api/v1/auth/me`
- (POST) `/api/v1/auth/logout`
- (POST) `/api/v1/auth/sync-refresh-token`

### Related Screens

- SCR012 – KRootRedirect
- SCR013 – ProfilePage (all regions)
- SCR014 – VerifyPage
- SCR015 – SubscriptionPage
- SCR016 – MyMaterialsPage (all regions)
- SCR017 – FlashcardsPage
- SCR018 – HistoryPage (all regions)
- SCR019 – ExamHistoryPage
- SCR020 – PDFHistoryPage
- SCR021 – ManageExamPage
- SCR022 – ManageQuizSetDetailPage
- SCR023 – ManageFlashcardSetDetailPage
- SCR024 – AIToolPage
- SCR025 – GenAIKnowledgePage (all regions)
- SCR026 – ManageExamRoomPage
- SCR027 – ManageExamRoomDetailPage (all regions)
- SCR028 – ExamRoomSessionAnalyticsPage
- SCR029 – MyExamsPage
- SCR030 – FlashcardStudyPage
- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Valid active session |
| teacher | ✓ | Valid active session |

---

## PERM003: UnverifiedAccountGate

**Type**: route-guard
**Enforced At**: Frontend `ProtectedRoute` / route guard

### Description

Unverified accounts (email not confirmed) are redirected to `/k/verify` when attempting to access any protected page under `/k/`. Users who have not completed email verification cannot access study materials, exam sessions, or AI tools. Verification is triggered by a 6-digit OTP sent to the user's email address.

### Related Screens

- SCR012 – KRootRedirect
- SCR013 – ProfilePage
- SCR014 – VerifyPage (the redirect destination)
- SCR015 – SubscriptionPage
- SCR016 – MyMaterialsPage
- SCR017 – FlashcardsPage
- SCR018 – HistoryPage
- SCR019 – ExamHistoryPage
- SCR020 – PDFHistoryPage
- SCR021 – ManageExamPage
- SCR022 – ManageQuizSetDetailPage
- SCR023 – ManageFlashcardSetDetailPage
- SCR024 – AIToolPage
- SCR025 – GenAIKnowledgePage
- SCR026 – ManageExamRoomPage
- SCR027 – ManageExamRoomDetailPage
- SCR028 – ExamRoomSessionAnalyticsPage
- SCR029 – MyExamsPage
- SCR030 – FlashcardStudyPage
- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Redirected to login |
| student (unverified) | ✗ | Redirected to `/k/verify` |
| student (verified) | ✓ | Email verified |
| teacher | ✓ | Email verified |

---

## PERM004: LoginAccess

**Type**: screen-permission
**Enforced At**: LoginPage (`SCR008`)

### Description

Login page is only accessible to unauthenticated users. Authenticated users are redirected to `/k/my-materials`.

### Related Screens

- SCR008 – LoginPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No active session |
| student | ✗ | Redirected to `/k/my-materials` |
| teacher | ✗ | Redirected to `/k/my-materials` |

---

## PERM005: RegisterAccess

**Type**: screen-permission
**Enforced At**: RegisterPage (`SCR009`)

### Description

Register page is only accessible to unauthenticated users. Authenticated users are redirected to `/k/my-materials`.

### Related Screens

- SCR009 – RegisterPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓ | No active session |
| student | ✗ | Redirected to `/k/my-materials` |
| teacher | ✗ | Redirected to `/k/my-materials` |

---

## PERM006: ProfileReadOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/profile` + ProfilePage (SCR013)

### Description

A user can read their own profile data: id, email, username, name, avatar, banner, and bio. Users cannot read another user's profile via any API endpoint.

### Related Routes

- (GET) `/api/v1/profile`

### Related Screens

- SCR013 – ProfilePage / REG001 (ProfileForm)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own profile only |
| teacher | ✓ | Own profile only |

---

## PERM007: ProfileWriteOwn

**Type**: action-permission
**Enforced At**: `PUT /api/v1/profile` + ProfilePage (SCR013)

### Description

A user can update their own profile: avatar upload, banner upload, name, username, and bio. Avatar and banner uploads go through the R2 storage proxy (`POST /api/v1/r2/image`).

### Related Routes

- (PUT) `/api/v1/profile`
- (POST) `/api/v1/r2/image`

### Related Screens

- SCR013 – ProfilePage / REG001 (ProfileForm)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own profile |
| teacher | ✓ | Own profile |

---

## PERM008: DeviceListViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/devices` + ProfilePage (SCR013)

### Description

A user can view all active sessions and devices associated with their account. Each session shows browser, OS, IP address, and creation/expiry time. Sessions are scoped to the owning user.

### Related Routes

- (GET) `/api/v1/devices`

### Related Screens

- SCR013 – ProfilePage / REG002 (DeviceList)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own devices only |
| teacher | ✓ | Own devices only |

---

## PERM009: DeviceDeleteOwn

**Type**: action-permission
**Enforced At**: `DELETE /api/v1/devices/:deviceId` + ProfilePage (SCR013)

### Description

A user can terminate any other session/device belonging to their account. This does not terminate the current session.

### Related Routes

- (DELETE) `/api/v1/devices/:deviceId`

### Related Screens

- SCR013 – ProfilePage / REG002 (DeviceList)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own device, not current |
| teacher | ✓ | Own device, not current |

---

## PERM010: PasswordChangeOwn

**Type**: action-permission
**Enforced At**: `POST /api/v1/auth/change-password` + ProfilePage (SCR013)

### Description

A user can change their own account password. Requires the current password plus a new password. An email notification is sent upon successful change.

### Related Routes

- (POST) `/api/v1/auth/change-password`
- (POST) `/api/v1/auth/send-code-change-password`

### Related Screens

- SCR013 – ProfilePage (ChangePasswordSection)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM011: WalletViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/wallet/details` + ProfilePage (SCR013)

### Description

A user can view their own wallet balance and recent transactions. Balance is shown in credits. Transactions list is paginated and scoped to the authenticated user.

### Related Routes

- (GET) `/api/v1/wallet/details`

### Related Screens

- SCR013 – ProfilePage / REG003 (SubscriptionWallet)
- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own wallet |
| teacher | ✓ | Own wallet |

---

## PERM012: SubscriptionViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/payment/subscription` + SubscriptionPage (SCR015)

### Description

A user can view their current subscription plan, billing cycle, and activation status.

### Related Routes

- (GET) `/api/v1/payment/subscription`

### Related Screens

- SCR013 – ProfilePage / REG003 (SubscriptionWallet)
- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own subscription |
| teacher | ✓ | Own subscription |

---

## PERM013: SubscriptionPurchase

**Type**: action-permission
**Enforced At**: SubscriptionPage (SCR015) + finance-service

### Description

A user selects a subscription plan and initiates payment via SePay virtual account. The system creates a `Payment` record with `status = unpaid`, assigns a virtual account number, and presents a QR code to the user. When SePay confirms the bank transfer, the payment is marked `paid` and the subscription is activated.

### Related Routes

- (GET) `/api/v1/payment/subscription`
- (POST) webhook (SePay callback)

### Related Screens

- SCR015 – SubscriptionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM014: QuizSetAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/quizsets` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new quiz set. The creating user becomes the owner and can edit, delete, and set visibility.

### Related Routes

- (POST) `/api/v1/quizsets`

### Related Screens

- SCR016 – MyMaterialsPage / REG001 (QuizSetGrid)
- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM015: QuizSetAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/quizsets/:id` + ManageQuizSetDetailPage (SCR022)

### Description

Only the owner of a quiz set can edit its metadata, labels, and questions. Non-owners receive 403.

### Related Routes

- (PUT) `/api/v1/quizsets/:id`
- (POST) `/api/v1/quizsets/:id/labels`
- (PUT) `/api/v1/quizsets/:id/labels`
- (DELETE) `/api/v1/quizsets/:id/labels/:labelId`
- (POST) `/api/v1/quizsets/:id/questions`
- (PUT) `/api/v1/quizsets/:id/questions/:questionId`
- (DELETE) `/api/v1/quizsets/:id/questions/:questionId`

### Related Screens

- SCR022 – ManageQuizSetDetailPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own quiz set |
| other user | ✗ | Not owner |

---

## PERM016: QuizSetAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/quizsets/:id` + MyMaterialsPage (SCR016)

### Description

Only the owner of a quiz set can delete it. Deletion removes the quiz set and all associated questions and labels.

### Related Routes

- (DELETE) `/api/v1/quizsets/:id`

### Related Screens

- SCR016 – MyMaterialsPage / REG001 (QuizSetGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own quiz set |
| other user | ✗ | Not owner |

---

## PERM017: FlashcardSetAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/flashcardsets` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new flashcard set. The creating user becomes the owner.

### Related Routes

- (POST) `/api/v1/flashcardsets`

### Related Screens

- SCR016 – MyMaterialsPage / REG002 (FlashCardSetGrid)
- SCR017 – FlashcardsPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM018: FlashcardSetAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/flashcardsets/:id` + ManageFlashcardSetDetailPage (SCR023)

### Description

Only the owner of a flashcard set can edit its metadata, labels, and flashcards.

### Related Routes

- (PUT) `/api/v1/flashcardsets/:id`
- (POST/PUT/DELETE) `/api/v1/flashcardsets/:id/labels/:labelId`
- (POST/PUT/DELETE) `/api/v1/flashcardsets/:id/flashcards/:flashcardId`

### Related Screens

- SCR023 – ManageFlashcardSetDetailPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own flashcard set |
| other user | ✗ | Not owner |

---

## PERM019: FlashcardSetAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/flashcardsets/:id` + MyMaterialsPage (SCR016)

### Description

Only the owner of a flashcard set can delete it.

### Related Routes

- (DELETE) `/api/v1/flashcardsets/:id`

### Related Screens

- SCR016 – MyMaterialsPage / REG002 (FlashCardSetGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not owner |
| teacher | ✓ | Own flashcard set |
| other user | ✗ | Not owner |

---

## PERM020: ExamRoomAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/examrooms` + MyMaterialsPage (SCR016)

### Description

An authenticated user can create a new exam room. The creating user becomes the host.

### Related Routes

- (POST) `/api/v1/examrooms`

### Related Screens

- SCR016 – MyMaterialsPage / REG003 (ExamRoomGrid)
- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM021: ExamRoomAuthorEdit

**Type**: resource-ownership
**Enforced At**: `PUT /api/v1/examrooms/:id` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host of an exam room can edit its metadata.

### Related Routes

- (PUT) `/api/v1/examrooms/:id`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG002 (RoomInfoSection)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |
| other user | ✗ | Not host |

---

## PERM022: ExamRoomAuthorDelete

**Type**: resource-ownership
**Enforced At**: `DELETE /api/v1/examrooms/:id` + ManageExamPage (SCR021)

### Description

Only the host of an exam room can delete it. This cascades to all associated sessions.

### Related Routes

- (DELETE) `/api/v1/examrooms/:id`

### Related Screens

- SCR021 – ManageExamPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |
| other user | ✗ | Not host |

---

## PERM023: ExamSessionAuthorCreate

**Type**: action-permission
**Enforced At**: `POST /api/v1/examrooms/:id/sessions` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host of an exam room can create sessions under it.

### Related Routes

- (POST) `/api/v1/examrooms/:id/sessions`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG003 (SessionTable)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |

---

## PERM024: ExamSessionAuthorManage

**Type**: resource-ownership
**Enforced At**: `PUT/DELETE /api/v1/examsessions/:id` + ManageExamRoomDetailPage (SCR027)

### Description

Only the host who owns the parent exam room can update or delete a session.

### Related Routes

- (PUT) `/api/v1/examsessions/:id`
- (DELETE) `/api/v1/examsessions/:id`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG003 (SessionTable)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own exam room |

---

## PERM025: ExamSessionAuthorSharing

**Type**: action-permission
**Enforced At**: `GET/PUT /api/v1/examsessions/:id/sharing` + ManageExamRoomDetailPage (SCR027)

### Description

Only the session host can manage sharing settings (access code, link generation).

### Related Routes

- (GET) `/api/v1/examsessions/:id/sharing`
- (PUT) `/api/v1/examsessions/:id/sharing`

### Related Screens

- SCR027 – ManageExamRoomDetailPage / REG004 (ShareDialog)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own session |

---

## PERM026: ExamSessionAuthorAnalytics

**Type**: data-permission
**Enforced At**: `GET /api/v1/examrooms/:id/sessions/:sessionId/attempts` + ExamRoomSessionAnalyticsPage (SCR028)

### Description

Only the session host can view attempt leaderboard, score distribution, and cheating statistics for a session. Other users receive 403.

### Related Routes

- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts`
- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`

### Related Screens

- SCR028 – ExamRoomSessionAnalyticsPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✗ | Not host |
| teacher | ✓ | Own session |
| attempt owner | ✗ | Cannot view other students' results |

---

## PERM027: ExamSessionAccess

**Type**: route-guard
**Enforced At**: ExamSessionPage (SCR031) + API

### Description

A student can access an exam session if: the session is public, or the student is whitelisted, or the student holds the correct access code. Sessions are time-gated: access is blocked before `startTime` and after `endTime`. The host always has access to their own sessions.

### Related Routes

- (GET) `/api/v1/examsessions/:id`

### Related Screens

- SCR031 – ExamSessionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Passes access check (public/whitelist/code) + within time window |
| teacher (non-host) | ✓ | Passes access check |
| session host | ✓ | Always |

---

## PERM028: ExamAttemptStart

**Type**: action-permission
**Enforced At**: ExamSessionPage (SCR031)

### Description

A student can start a new exam attempt if: the session is currently active (within time window), the student has no other in-progress attempt for this session, and the session's attempt limit has not been reached.

### Related Screens

- SCR031 – ExamSessionPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | No in-progress attempt exists + within time window + under attempt limit |
| teacher | ✓ | Same conditions |

---

## PERM029: ExamAttemptResume

**Type**: action-permission
**Enforced At**: ExamSessionPage (SCR031)

### Description

A student can resume an in-progress attempt. The system decrypts and serves the last saved question index and answer state.

### Related Screens

- SCR031 – ExamSessionPage
- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own in-progress attempt |
| teacher | ✓ | Own in-progress attempt |

---

## PERM030: ExamAttemptViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId` + MyExamsPage (SCR029)

### Description

A student can view their own exam attempt results and details. Cannot view another student's attempt.

### Related Routes

- (GET) `/api/v1/examrooms/:id/sessions/:sessionId/attempts/:attemptId`

### Related Screens

- SCR029 – MyExamsPage (SessionHistoryDialog)
- SCR032 – ExamQuizPage (results view)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own attempt |
| other student | ✗ | Not owner |

---

## PERM031: ExamAttemptSubmit

**Type**: action-permission
**Enforced At**: ExamQuizPage (SCR032)

### Description

A student submits an exam attempt by sending encrypted answers via JWT-wrapped `secure-submit` endpoint. Submission is also triggered automatically when the session time limit expires.

### Related Routes

- (POST) `/api/v1/secure-submit`

### Related Screens

- SCR032 – ExamQuizPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own in-progress attempt |
| teacher | ✓ | Own in-progress attempt |

---

## PERM032: FlashcardStudyAccess

**Type**: route-guard
**Enforced At**: FlashcardStudyPage (SCR030)

### Description

A student can access a flashcard set for study if: the set is public, or the student is the owner, or the student holds the correct access code.

### Related Routes

- (GET) `/study-flashcard/:id`

### Related Screens

- SCR030 – FlashcardStudyPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| student | ✓ | Passes access check (public/owner/code) |
| set owner | ✓ | Always |
| teacher | ✓ | Same as student |

---

## PERM033: FlashcardStudyAccessCode

**Type**: action-permission
**Enforced At**: FlashcardStudyPage (SCR030) — AccessCodeDialog

### Description

A flashcard set with access code protection requires the student to enter the correct 6-digit code before the study interface is unlocked.

### Related Screens


### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Correct code entered |
| set owner | ✓ | Code bypassed |

---

## PERM034: FlashcardStudyProgress

**Type**: data-permission
**Enforced At**: FlashcardStudyPage (SCR030)

### Description

Study progress (studied card IDs) is saved per user per flashcard set. The student can only view and update their own progress.

### Related Routes

- (internal) `addStudiedCardApi`

### Related Screens

- SCR030 – FlashcardStudyPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own progress |
| teacher | ✓ | Own progress |

---

## PERM035: AIGenerationAccess

**Type**: route-guard
**Enforced At**: AIToolPage (SCR024) + AI generation endpoints

### Description

Authenticated users can access the AI generation tool page and initiate quiz or flashcard generation from uploaded documents. The page lists available files and generation history.

### Related Routes

- (GET) `/api/v1/ai/job/:jobId`
- (DELETE) `/api/v1/ai/job/:jobId`

### Related Screens

- SCR024 – AIToolPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM036: AIGenerationCredits

**Type**: action-permission
**Enforced At**: AIToolPage (SCR024) + `FinanceClientService` (BL004)

### Description

AI generation deducts credits from the user's wallet before processing. The system checks wallet balance via `FinanceClientService` and emits a debit transaction. However, `FREE_MODE = true` in production bypasses this credit check entirely — generation proceeds without credit deduction.

### Related Routes

- (internal) Credit deduction via `FinanceClientService`

### Related Screens

- SCR024 – AIToolPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Wallet has sufficient credits (or FREE_MODE = true) |
| teacher | ✓ | Wallet has sufficient credits (or FREE_MODE = true) |

---

## PERM037: AIKnowledgeBaseManage

**Type**: action-permission
**Enforced At**: GenAIKnowledgePage (SCR025)

### Description

Authenticated users can upload knowledge files, create folders, manage dataset imports, and reprocess files for the AI tutor knowledge base. Files are processed by the AI service to produce chunks and embeddings.

### Related Routes

- (GET/POST/PUT/DELETE) `/api/v1/ai/tutor/knowledge-folders`
- (GET/POST/DELETE) `/api/v1/ai/tutor/knowledge-files`
- (POST) `/api/v1/ai/tutor/knowledge-files/:id/reprocess`
- (GET/POST) `/api/v1/ai/tutor/dataset-imports`
- (GET) `/api/v1/ai/tutor/knowledge-stats`

### Related Screens

- SCR025 – GenAIKnowledgePage (all regions)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Authenticated |
| teacher | ✓ | Authenticated |

---

## PERM038: PDFHistoryViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/student/recent-flashcards` + HistoryPage (SCR018) + PDFHistoryPage (SCR020)

### Description

A student can view their own PDF upload history (AI-processed documents) and trigger re-download. Cannot view another user's PDF history.

### Related Routes

- (GET) `/api/v1/student/recent-flashcards`

### Related Screens

- SCR018 – HistoryPage / REG001 (PDFHistoryList)
- SCR020 – PDFHistoryPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own history |
| teacher | ✓ | Own history |

---

## PERM039: ExamHistoryViewOwn

**Type**: data-permission
**Enforced At**: `GET /api/v1/student/recent-exams` + HistoryPage (SCR018) + ExamHistoryPage (SCR019)

### Description

A student can view their own exam attempt history with scores, timestamps, and pass/fail status. Cannot view another user's exam history.

### Related Routes

- (GET) `/api/v1/student/recent-exams`

### Related Screens

- SCR018 – HistoryPage / REG002 (ExamHistoryList)
- SCR019 – ExamHistoryPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| student | ✓ | Own history |
| teacher | ✓ | Own history |

---

## PERM040: SessionCleanup

**Type**: env-gate
**Enforced At**: `SessionCleanupCron` (BL001) — `examio-be/apps/auth-service/src/session-cleanup.cron.ts`

### Description

Daily cron job deactivates expired sessions. Runs on a configurable schedule. This is an internal infrastructure rule; no user-facing screen directly triggers it.

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| system (cron) | ✓ | Service account |

---

## PERM041: FreeModeCreditBypass

**Type**: env-gate
**Enforced At**: `FinanceClientService` (BL004) — `examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts`

### Description

`FREE_MODE = true` in production code path bypasses credit deduction for AI generation and document processing. Wallet balance is not checked; credits are not deducted regardless of subscription status. This is a compile-time or environment-gated flag.

### Related Modules

- exam-service: `FinanceClientService`

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| all roles | ✓ (bypass) | FREE_MODE = true |
| all roles | normal credit check | FREE_MODE = false |

---

## PERM042: TurnstileBotProtection

**Type**: feature-flag
**Enforced At**: RegisterPage (SCR009)

### Description

Bot protection via Turnstile challenge is enforced on account registration. Protects against automated account creation.

### Related Screens

- SCR009 – RegisterPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| all | ✓ | Turnstile token valid |
| bot | ✗ | Challenge failed |

---

## PERM043: QuizSetVisibilityControl

**Type**: resource-ownership
**Enforced At**: `GET /api/v1/quizsets` + ManageQuizSetDetailPage (SCR022)

### Description

A quiz set owner can set visibility to `public` (browsable by any authenticated user) or `private` (owner only). Public visibility makes the set discoverable on the HomePage and browseable via the quiz set grid.

### Related Screens

- SCR022 – ManageQuizSetDetailPage (QuizSetHeader)
- SCR001 – HomePage (ContentGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| set owner | ✓ | Can set public/private |
| other student | ✓ (read) | Only if set is public |
| other teacher | ✓ (read) | Only if set is public |

---

## PERM044: FlashcardSetVisibilityControl

**Type**: resource-ownership
**Enforced At**: `GET /api/v1/flashcardsets` + ManageFlashcardSetDetailPage (SCR023)

### Description

A flashcard set owner can set visibility to `public` or `private`. Public sets are browsable via the FlashcardsPage and discoverable on the HomePage.

### Related Screens

- SCR023 – ManageFlashcardSetDetailPage (FlashcardSetHeader)
- SCR017 – FlashcardsPage
- SCR001 – HomePage (ContentGrid)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| set owner | ✓ | Can set public/private |
| other student | ✓ (read) | Only if set is public |
| other teacher | ✓ (read) | Only if set is public |

---

## PERM045: ExamRoomVisibilityControl

**Type**: resource-ownership
**Enforced At**: ExamRoom listing + ExamSessionPage (SCR031)

### Description

An exam room owner can control access via: public (anyone with link), whitelist (specific user IDs), or access code (6-digit OTP). These settings determine who can attempt the exam.

### Related Screens

- SCR027 – ManageExamRoomDetailPage (ShareDialog)
- SCR031 – ExamSessionPage (AccessCodeDialog)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| room host | ✓ | Can configure access mode |
| student | ✓ (attempt) | Passes access check |
| other teacher | ✓ (read) | Only if room is discoverable |

---

## PERM046: AdminRouteAccess

**Type**: route-guard
**Enforced At**: class-level `@RequirePermissions('admin:access')` on every admin-service controller (`@examio/auth-jwt` `JwtAuthGuard` then `PermissionsGuard`; stateless, no DB lookup). `admin:access` comes from the `SYSTEM_ADMIN` role in the token.

### Description

All `/api/v1/admin/*` routes require a valid JWT bearer token and `User.isSystemAdmin = true`. The token is verified statelessly against auth's JWKS (no per-request DB lookup); the `SYSTEM_ADMIN` role must be in the token `roles`. ThrottlerModule enforces 30 req/min per admin session.

### Related Routes

- (GET) `/api/v1/admin/bootstrap`
- (GET) `/api/v1/admin/stats`
- (GET) `/api/v1/admin/stats/sources`
- (GET) `/api/v1/admin/sources` (FE-facing alias of `/admin/stats/sources`)
- (GET) `/api/v1/admin/users`
- (POST) `/api/v1/admin/users/:id/ban`
- (POST) `/api/v1/admin/users/:id/unban`
- (GET) `/api/v1/admin/roles`
- (GET) `/api/v1/admin/roles/users`
- (GET) `/api/v1/admin/roles/changes`
- (PUT) `/api/v1/admin/roles/users/:id/role`
- (PUT) `/api/v1/admin/roles/users/:id/system-admin`
- (GET) `/api/v1/admin/finance/refunds`
- (POST) `/api/v1/admin/finance/refund`
- (POST) `/api/v1/admin/finance/adjust-credit`
- (PUT) `/api/v1/admin/finance/subscription-tier`
- (GET) `/api/v1/admin/audit`
- (GET) `/api/v1/admin/logs`
- (GET) `/api/v1/admin/logs/stream`

### Related Screens

- SCR033 – AdminOverviewPage
- SCR034 – AdminStatsPage
- SCR035 – AdminUsersPage
- SCR036 – AdminFinancePage
- SCR037 – AdminLogsPage
- SCR038 – AdminAuditPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate as admin |
| student | ✗ | 403 Forbidden |
| teacher | ✗ | 403 Forbidden |
| admin | ✓ | `User.isSystemAdmin = true` + valid JWT |

---

## PERM047: AdminUserManagement

> Current (phase 08): ban / unban are `POST` via auth `SetUserStatus` and no longer soft-delete; no `DELETE /admin/users/:id` route exists. See § Current RBAC Catalog, "Role management and ban".

**Type**: action-permission
**Enforced At**: `AdminUsersModule` — `POST /api/v1/admin/users/:id/ban`, `POST /api/v1/admin/users/:id/unban`

### Description

An admin can ban or unban a user (auth `SetUserStatus`: `User.isBanned`, sessions revoked on ban, `authzVersion` bumped). Banned users are refused at refresh (`ACCOUNT_DISABLED`). Every mutation writes an `AdminAudit` row.

### Related Routes

- (POST) `/api/v1/admin/users/:id/ban`
- (POST) `/api/v1/admin/users/:id/unban`

### Related Screens

- SCR035 – AdminUsersPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM048: AdminGrantRevoke

> Superseded (phase 08): `grant-admin` / `revoke-admin` were removed. The capability is `PUT /api/v1/admin/roles/users/:id/system-admin` (`role:assign`); see § Current RBAC Catalog, "Role management and ban".

**Type**: action-permission
**Enforced At**: `AdminUsersModule` — `PUT /api/v1/admin/roles/users/:id/role`, `PUT /api/v1/admin/roles/users/:id/system-admin`

### Description

An admin can grant or revoke admin privileges for any user. Granting admin sets `User.isSystemAdmin = true`; revoking sets it to `false`. This permission is distinct from PERM047 because it affects system-level roles, not account state. Every mutation writes an `AdminAudit` row.

### Related Routes

- (GET) `/api/v1/admin/roles`
- (GET) `/api/v1/admin/roles/users`
- (GET) `/api/v1/admin/roles/changes`
- (PUT) `/api/v1/admin/roles/users/:id/role`
- (PUT) `/api/v1/admin/roles/users/:id/system-admin`

### Related Screens

- SCR044 – AdminRolesPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM049: AdminFinanceRefund

**Type**: action-permission
**Enforced At**: `AdminFinanceModule` — `POST /api/v1/admin/finance/refund`

### Description

An admin can initiate a wallet refund for a user. The refund creates a `WalletTransaction` of type `refund` and credits the user's wallet. Refunds are recorded in `AdminAudit` with full payload.

### Related Routes

- (POST) `/api/v1/admin/finance/refund`

### Related Screens

- SCR036 – AdminFinancePage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM050: AdminCreditAdjustment

**Type**: action-permission
**Enforced At**: `AdminFinanceModule` — `POST /api/v1/admin/finance/adjust-credit`

### Description

An admin can manually adjust a user's credit balance (positive or negative). The adjustment creates a `WalletTransaction` of type `adjustment`. Used for compensating errors or granting promotional credits.

### Related Routes

- (POST) `/api/v1/admin/finance/adjust-credit`

### Related Screens

- SCR036 – AdminFinancePage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM051: AdminSubscriptionTierChange

**Type**: action-permission
**Enforced At**: `AdminFinanceModule` — `PUT /api/v1/admin/finance/subscription-tier`

### Description

An admin can change a user's subscription tier (upgrade/downgrade/cancel). The change updates `UserSubscription` and prorates or voids the current billing cycle as appropriate.

### Related Routes

- (PUT) `/api/v1/admin/finance/subscription-tier`

### Related Screens

- SCR036 – AdminFinancePage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM052: AdminAuditLogView

**Type**: data-permission
**Enforced At**: `AdminAuditModule` — `GET /api/v1/admin/audit`

### Description

An admin can query the audit log — one row per changed field per admin mutation. Captured fields: `adminId`, `targetId`, `action`, `payload` (JSON diff), `ipAddress`, `userAgent`, `createdAt`. Supports pagination and date range filtering.

### Related Routes

- (GET) `/api/v1/admin/audit`

### Related Screens

- SCR038 – AdminAuditPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM053: AdminLogView

**Type**: data-permission
**Enforced At**: `AdminLogsModule` — `GET /api/v1/admin/logs`, `GET /api/v1/admin/logs/stream`

### Description

An admin can retrieve server-side application logs and stream them in real time via SSE (ticket exchange). Logs are filtered by level, service, and time range. Streaming is via `GET /api/v1/admin/logs/stream`; polling fallback is `GET /api/v1/admin/logs`.

### Related Routes

- (GET) `/api/v1/admin/logs`
- (GET) `/api/v1/admin/logs/stream`

### Related Screens

- SCR037 – AdminLogsPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM054: AdminPageConfigManagement

**Type**: action-permission
**Enforced At**: `AdminPageConfigController` — `@RequirePermissions('admin:access')`, `GET/PATCH /api/v1/admin/page-config*`, throttled 30 req/60s.

### Description

An admin can view all `PageFeatureFlag` rows and toggle a page's `enabled` state. `toggle()` validates the key against `TOGGLEABLE_PAGE_KEYS` (else `BadRequestException`), writes DB → rebuilds Redis cache (`config:pages:flags`) → publishes to `config:pages` pub/sub channel → writes an `AdminAudit` row (action `admin.page-config.toggle`). Redis publish and audit-write failures are caught and logged as warnings — they never fail the toggle itself.

### Related Routes

- (GET) `/api/v1/admin/page-config`
- (PATCH) `/api/v1/admin/page-config/:key`

### Related Screens

- SCR039 – AdminPageConfigPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## PERM055: PageToggleEnforcement

**Type**: feature-flag
**Enforced At**: `PageEnabledGuard` (gateway-service) — reads `@TogglePage(key)` route metadata, checks `ConfigService.getPages()` (Redis-first, DB fallback).

### Description

Gateway-level feature-flag gate applied to proxy controllers annotated with `@TogglePage(key)` (currently `word-family`, `manage-exam-room`, `flash-card`, `manage-exam`, `ai-tool`). Blocks with `404 Not Found` (not 403, to avoid revealing page existence) only when the flag is explicitly `false`; absence of a key or any infra error (Redis/DB failure) fails OPEN — the request is allowed through. Some page keys (`my-materials`, `my-exams`, `history`) are FE-only toggles with an empty `PAGE_ROUTE_MAP` entry — deliberately not enforced at the gateway because they share core routes with other still-enabled features.

### Related Routes

- All routes on proxy controllers decorated with `@TogglePage(...)` (e.g. `word-family-proxy.controller.ts`, `examroom-proxy.controller.ts`, `flashcardset-proxy.controller.ts`, `quizset-proxy.controller.ts`, `ai-study-proxy.controller.ts`)
- (GET) `/api/v1/config/pages` — public bootstrap fetch (guests included, via `OptionalAuthGuard`)
- (GET) `/api/v1/config/stream` — SSE realtime push, requires `AuthGuard`

### Related Screens

- SCR039 – AdminPageConfigPage (management)
- All screens gated by `<FeatureRoute pageKey="...">` on the frontend (client-side mirror of this guard)

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✓/✗ | Allowed unless the page's flag is explicitly `false` |
| authenticated (any role) | ✓/✗ | Same rule — flag state, not role, determines access |
| admin | ✓ | Admin routes are never gated by page toggles |

---

## PERM056: WordFamilyAccess

**Type**: route-guard
**Enforced At**: `word-family.controller.ts` (`AuthGuard`) + `word-family-proxy.controller.ts` (`AuthGuard` + `PageEnabledGuard` + `@TogglePage('word-family')`)

### Description

All user-facing word-family routes (browse categories, view root words/detail, generate via AI, save/remove from collection, convert to flashcard) require a valid Bearer/cookie session AND the `word-family` page flag enabled (PERM055). No credit/quota gate was found on AI generation, unlike other AI flows in the codebase.

### Related Routes

- (GET) `/api/v1/word-family/categories`
- (GET) `/api/v1/word-family/categories/:slug/roots`
- (GET) `/api/v1/word-family/category/:categorySlug/:rootWord`
- (POST) `/api/v1/word-family/generate`
- (POST) `/api/v1/word-family/save`
- (GET) `/api/v1/word-family/saved`
- (DELETE) `/api/v1/word-family/saved/:wordFamilyId`
- (POST) `/api/v1/word-family/:id/to-flashcard`

### Related Screens

- SCR040 – WordFamilyPage
- SCR041 – WordFamilyCategoryPage
- SCR042 – WordFamilyDetailPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| guest | ✗ | Must authenticate |
| authenticated (any role) | ✓ | Valid session + `word-family` page flag enabled |

---

## PERM057: AdminWordFamilyManagement

**Type**: action-permission
**Enforced At**: `admin-word-family.controller.ts` (`@RequirePermissions('admin:access')`, class-level) + duplicate category CRUD in `word-family.controller.ts` (method-level `word_family:admin`)

### Description

Admin-only CRUD on `WordFamilyCategory` (create, update, soft-delete via `isActive = false`). Two parallel implementations exist: the primary admin-service surface (`/api/v1/admin/word-family/*`, used by the FE admin page, wraps writes in `Prisma.TransactionIsolationLevel.Serializable` + `AdminAudit` before/after diff) and a secondary exam-service surface (`/api/v1/word-family/categories*`) kept for backward compatibility. Category deletion is soft-delete only at the API layer — the Prisma `onDelete: Cascade` relation to `WordFamily`/`UserSavedWordFamily` is defined but not reachable via any exposed hard-delete route.

### Related Routes

- (GET) `/api/v1/admin/word-family/categories`
- (POST) `/api/v1/admin/word-family/categories`
- (PUT) `/api/v1/admin/word-family/categories/:id`
- (DELETE) `/api/v1/admin/word-family/categories/:id`

### Related Screens

- SCR043 – AdminWordFamilyPage

### Permission Rules

| Role | Allow | Conditions |
|------|-------|------------|
| admin | ✓ | `User.isSystemAdmin = true` |
| non-admin | ✗ | 403 Forbidden |

---

## Summary

- **Total Permission Items**: 57
- **By Type**: route-guard: 6, screen-permission: 2, action-permission: 15, data-permission: 11, role-based: 1, resource-ownership: 9, env-gate: 2, feature-flag: 2

---

## Cross-Reference Validation

- [x] All PERM### codes are unique (PERM001–PERM057)
- [x] All PERM### codes reference valid screens (SCR###) from ScreenList.md
- [x] All related route references are valid (RT### in RouteList — omitted here for brevity; cross-referenced via route-path pattern matching)
- [x] All related module references are valid (auth-service, exam-service, finance-service, r2-service, admin-service, common)
- [x] No orphaned permission references
- [x] Ownership rules (PERM015–PERM022, PERM024–PERM025) correctly target only resource owners
- [x] Guest vs. authenticated separation correctly enforced for all screen groups