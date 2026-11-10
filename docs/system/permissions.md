# Permissions

Authorization model of kmaedu after the microservice RBAC refactor: who can do what, how a request is checked, and where the check lives. Code is authoritative; this page is the map.

- Source of truth: `kmaedu-be/libs/auth-jwt/src/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`) and the guards beside it.
- Full permission x role matrix and permission -> gateway routes: [generated/permissions-matrix.md](../generated/permissions-matrix.md) (generated, do not edit).
- Decisions and ownership rules in business terms: [business-rules.md](business-rules.md).

Contents: [Roles](#roles) · [Token and error codes](#token-and-error-codes) · [Decorators](#decorators) · [Ownership and grants](#ownership-and-grants) · [Service tokens](#service-tokens) · [gRPC guards](#grpc-guards) · [Per-endpoint enforcement](#per-endpoint-enforcement-phase-06-2026-10-20) · [Frontend route guards](#frontend-route-guards-phase-09-2026-10-22)

## Roles

| Role | Where it lives | Notes |
|---|---|---|
| `STUDENT` | `User.role = STUDENT` (default on register) | Exclusive with `TEACHER`. |
| `TEACHER` | `User.role = TEACHER` | Exclusive with `STUDENT`. Only a SYSTEM_ADMIN can grant it (admin UI `/admin/roles` or `yarn bootstrap:admin:grant <email> --teacher`). |
| `SYSTEM_ADMIN` | `User.isSystemAdmin = true` | Flag that combines with either base role (replaces `User.isAdmin`). |
| `SERVICE` | Service token (`sub = svc:<name>`) | A token kind, not a user role; no entry in `ROLE_PERMISSIONS`. |

Token `roles` = `[baseRole]`, plus `SYSTEM_ADMIN` when flagged (`rolesFor`). Permissions never travel in the token; they are derived from `roles` at check time (`permissionsOf`: union, AND semantics for several required, no wildcard). A SYSTEM_ADMIN who is also a STUDENT/TEACHER holds the union; a bare admin (`STUDENT` + flag) gets no teacher permissions, and admin permissions do not imply teacher ones.

Role -> permissions (generated from `ROLE_PERMISSIONS`):

<!-- BEGIN GENERATED: permissions -->

| Role | Count | Permissions |
|---|--:|---|
| `STUDENT` | 6 | `exam:take`, `flashcard:study`, `quiz:practice`, `study_room:join`, `word_family:read`, `word_family:save` |
| `TEACHER` | 15 | `ai:generate`, `ai_chat:use`, `content:share`, `document:upload`, `exam_result:view`, `exam_room:manage`, `exam_session:manage`, `flashcardset:manage`, `quizset:manage`, `study_room:create`, `study_room:join`, `user:search`, `word_family:generate`, `word_family:read`, `word_family:save` |
| `SYSTEM_ADMIN` | 8 | `admin:access`, `audit:read`, `logs:read`, `page_config:manage`, `role:assign`, `stats:read`, `user:manage`, `word_family:admin` |

<!-- END GENERATED -->

## Token and error codes

Access token: RS256, 15 minutes, `typ=at+jwt`, issuer and audience pinned, `exp` and `iat` required. Verified statelessly via auth's JWKS (`createTokenVerifier`), no DB per request. User claims: `sub`, `sid` (session), `roles`, `email_verified`, `av` (authz version, an integer >= 0). A malformed or inconsistent claim set is `TOKEN_INVALID`.

`av` is `User.authzVersion`. Every role, flag or ban change bumps it and emits `auth.user.authz_changed` in the same transaction; the gateway compares the token's `av` against Redis (`gw:user:<id>:av`) and answers 401 `TOKEN_STALE` for a lower one, so the client refreshes and gets the new role. `GET /auth/me`, login and refresh return `{ user, roles, permissions }` (`user.isSystemAdmin`; no wallet or subscription, the feature was removed). Refresh reloads the role in a transaction and refuses banned or deleted accounts (401 `ACCOUNT_DISABLED`).

| HTTP | Code | Raised when |
|---|---|---|
| 401 | `TOKEN_MISSING` | No token on a non-public handler |
| 401 | `TOKEN_EXPIRED` | `exp` passed (client refreshes once) |
| 401 | `TOKEN_INVALID` | Bad signature, issuer, audience, `typ` or claims |
| 401 | `TOKEN_STALE` | Gateway: token `av` below the current one |
| 401 | `SESSION_REVOKED` | Gateway: session id revoked (logout, ban) |
| 403 | `EMAIL_NOT_VERIFIED` | Unverified email on any handler except `@AllowUnverified()` ones |
| 403 | `PERMISSION_DENIED` | Missing permission, wrong token kind, or caller not allowlisted |
| 403 | `NO_AUTHZ_DECLARED` | The handler declares nothing (deny by default) |

HTTP bodies are `{ statusCode, code, message }` (the gateway adds `requestId`). Over gRPC the same codes become `UNAUTHENTICATED` / `PERMISSION_DENIED` with the code as the status message. Status mapping lives in `libs/auth-jwt/src/auth-errors.ts`; `TOKEN_STALE` and `SESSION_REVOKED` come from the gateway pipeline (`apps/gateway-service/src/pipeline/auth-check.ts`).

## Decorators

`AuthJwtModule.forRoot({ serviceName })` registers `JwtAuthGuard` (authenticate, attach principal) then `PermissionsGuard` (authorize) as global guards. WebSocket contexts are skipped; the study-room socket middleware verifies the token itself. A handler-level declaration wins over a class-level one. Exactly one declaration per handler:

| Declaration | Meaning |
|---|---|
| `@Public()` | Anonymous allowed; an invalid token is treated as anonymous. |
| `@Authenticated()` | Any verified user (service tokens rejected); unverified email gets 403 unless `@AllowUnverified()`. Must be listed in `test/authz/authenticated-allowlist.ts`. |
| `@AllowUnverified()` | Modifier for `@Authenticated()`: lets an unverified user finish onboarding. Pinned by `apps/auth-service/test/allow-unverified-allowlist.spec.ts`. |
| `@RequirePermissions(...p)` | User token holding ALL listed permissions (AND); unverified email always 403; service tokens rejected. The default for new endpoints. |
| `@RequireOwnerOrPermission(perm, Resolver)` | Verified user who holds `perm` OR owns the resource `Resolver.resolveOwnerId(req)` names; else 403. Composes `@Authenticated()`, so it needs an allowlist entry. |
| `@ServiceOnly(...callers)` | Service token whose `svc:<name>` is in `callers` (at least one required). |
| `@RequirePermissionsOrService(p[], { callers? })` | User holding `p` (empty = any verified user) OR a service token (`callers` omitted = any service; `[]` = no service). |
| none | 403 `NO_AUTHZ_DECLARED`. |

`@RequireOwnerOrPermission` passing on the permission never means "sees everything": the service still runs its own access predicate (grants, below). The resolver is a provider of the controller's module doing one cheap `select { userId }`; a missing resource and a foreign one answer the same 403. This is how a TEACHER previews their own flashcard set without `flashcard:study`.

`@Authenticated()` handlers and `@RequireOwnerOrPermission` handlers must appear in `authenticated-allowlist.ts` with either a two-user negative spec (`spec` + a test title containing the key) or `selfScoped: true` (the route has no path parameter, e.g. auth `me`). `yarn test test/authz` runs:

| Spec | Fails when |
|---|---|
| `handler-declarations.spec.ts` | An HTTP handler or WS gateway class declares nothing; an `@Authenticated()` handler is missing from or stale in the allowlist; a spec file or key is missing; a `selfScoped` route takes a param |
| `authz-matrix.spec.ts` | A row in `authz-matrix.rows.ts` does not behave as STUDENT / TEACHER / admin-only |
| `static-source-rules.spec.ts` | A static rule is broken (e.g. a `@Throttle` in content or assessment, which have no `ThrottlerModule`) |

IDOR rule for gRPC RPCs taking a `user_id`: `assertSelfOrService(metadata, userId)`; a user token may only name its own `sub`, an allowlisted service may name anyone.

## Ownership and grants

- **Grant mechanism** for shared content (flashcard sets, quiz sets, exam sessions): access is decided only from `isPublic`, the whitelist, a code unlock, session visibility and `ownerId === sub` (`flashcardset-access.ts`, `examattempt-access.ts`). Nothing reads the owner's `User.role` or `isSystemAdmin`: a demoted TEACHER's shared, whitelisted, public or code content stays studyable; the owner gets 403 on every `*:manage` route.
- **404 vs 403**: a resource the caller may not see answers 404 so existence does not leak (cheating-log reads, attempts, study access, no grant). 403 `PERMISSION_DENIED` is only for a missing permission.
- **Whitelist and code lists** are capped at 2000 users (`SHARE_LIST_CAP`). `generate-code` replaces only the code; whitelist and visibility stay. Code-granted users are kept separate from the whitelist.
- **Access-code lockout**: 6-digit code, 5 failed attempts per (resource, user) within 15 minutes locks it (429 `CODE_LOCKED`); details below.

## Service tokens

Service-to-service calls carry a service token in gRPC metadata `authorization`: RS256, `sub = svc:<name>`, `roles = ["SERVICE"]` only (any other combination is `TOKEN_INVALID`). A caller obtains one per audience from auth (`POST /internal/token`, env `AUTH_TOKEN_URL` + `SERVICE_CLIENT_SECRET`) via `ServiceTokenClient`: cached per audience, refreshed 60 s before `exp`, one in-flight fetch, up to 3 attempts, falling back to a still-valid cached token. Auth's `SERVICE_CLIENTS` lists the clients and `SERVICE_AUDIENCES` the audiences. Where the actor is a user (state-changing RPCs on their behalf), the caller forwards the user's token instead, so the callee authorizes the real person.

Admin-service calls auth, gateway and vocabulary with the acting admin's forwarded token. The Python ai-service accepts service tokens only (see § Python ai-service below).

## Role management and stale tokens

A role change takes effect when the access token is refreshed (15 minutes at most) or earlier through `TOKEN_STALE`. `SetUserRole` and `SetSystemAdmin` on auth require `role:assign`; only a SYSTEM_ADMIN can grant TEACHER or admin. A user cannot change their own role (403 `CANNOT_CHANGE_OWN_ROLE`); the last active SYSTEM_ADMIN cannot be demoted (409 `LAST_SYSTEM_ADMIN`). Every change writes `RoleChangeLog`. The ban/unban and `/admin/roles` rules are in § Per-endpoint enforcement.

## gRPC guards

Every Nest gRPC handler carries a guard declaration (`handler-declarations.spec.ts` scans for it, and the generator below throws on a handler without one). The table is generated from the `*.grpc.controller.ts` files and `apps/r2-service/src/r2-service.controller.ts`; do not edit it by hand.

<!-- BEGIN GENERATED: grpc-guards -->

| Service | RPC | Guard | Source |
|---|---|---|---|
| AdminService | GetPageFlags | `@ServiceOnly('gateway')` | `apps/admin-service/src/modules/admin-page-config/admin-page-flags.grpc.controller.ts` |
| AuthService | FindUserByEmail | `@RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | GetPublicProfilesByIds | `@RequirePermissionsOrService([])` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | GetUser | `@RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | GetUsersByIds | `@RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | ListRoleChanges | `@RequirePermissions('role:assign')` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | ListUsers | `@RequirePermissions('user:manage')` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | SetSystemAdmin | `@RequirePermissions('role:assign')` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | SetUserRole | `@RequirePermissions('role:assign')` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthService | SetUserStatus | `@RequirePermissions('role:assign')` | `apps/auth-service/src/grpc/auth.grpc.controller.ts` |
| AuthUserService | GetUserAdminDetail | `@RequirePermissions('user:manage')` | `apps/auth-service/src/grpc/auth-users.grpc.controller.ts` |
| AuthUserService | GetUserStats | `@RequirePermissions('stats:read')` | `apps/auth-service/src/grpc/auth-users.grpc.controller.ts` |
| AuthUserService | SearchUsers | `@RequirePermissions('user:search')` | `apps/auth-service/src/grpc/auth-users.grpc.controller.ts` |
| AuthUserService | UpdateUserAdmin | `@RequirePermissions('user:manage')` | `apps/auth-service/src/grpc/auth-users.grpc.controller.ts` |
| ContentService | GetQuizSetSnapshot | `@RequirePermissions('quizset:manage')` | `apps/content-service/src/grpc/content.grpc.controller.ts` |
| ContentService | GetQuizSetsByIds | `@RequirePermissions('quizset:manage')` | `apps/content-service/src/grpc/content.grpc.controller.ts` |
| ContentService | GetUserContentStats | `@RequirePermissionsOrService([], { callers: [] })` | `apps/content-service/src/grpc/content.grpc.controller.ts` |
| DocumentService | AssertOwnership | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | CreateUpload | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | DeleteDocuments | `@RequirePermissionsOrService(['document:upload'], { callers: [] })` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | EnsureProcessed | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | GetDocumentsByIds | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | GetDownloadUrl | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | GetQuota | `@RequirePermissionsOrService([], { callers: [] })` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| DocumentService | ListDocuments | `@RequirePermissions('document:upload')` | `apps/document-service/src/modules/upload/document.grpc.controller.ts` |
| GatewayControl | InvalidateUser | `@ServiceOnly('auth')` | `apps/gateway-service/src/control/gateway-control.grpc.controller.ts` |
| GatewayControl | RevokeSession | `@ServiceOnly('auth')` | `apps/gateway-service/src/control/gateway-control.grpc.controller.ts` |
| GatewayControl | SetPageFlags | `@ServiceOnly('admin')` | `apps/gateway-service/src/control/gateway-control.grpc.controller.ts` |
| R2Service | CreatePresignedDownload | `@ServiceOnly('document')` | `apps/r2-service/src/r2-service.controller.ts` |
| R2Service | DeleteFile | `@ServiceOnly('auth')` | `apps/r2-service/src/r2-service.controller.ts` |
| R2Service | DeleteObjects | `@ServiceOnly('auth', 'vocabulary', 'document', 'ai-chat', 'content')` | `apps/r2-service/src/r2-service.controller.ts` |
| R2Service | GetFileUrl | `@ServiceOnly('auth')` | `apps/r2-service/src/r2-service.controller.ts` |
| R2Service | ListUserFiles | `@RequirePermissionsOrService([])` | `apps/r2-service/src/r2-service.controller.ts` |
| R2Service | UploadFile | `@ServiceOnly('auth', 'document', 'content')` | `apps/r2-service/src/r2-service.controller.ts` |
| WordFamilyAdminService | DeleteCategory | `@RequirePermissions('word_family:admin')` | `apps/vocabulary-service/src/modules/word-family/word-family-admin.grpc.controller.ts` |
| WordFamilyAdminService | ListCategories | `@RequirePermissions('word_family:admin')` | `apps/vocabulary-service/src/modules/word-family/word-family-admin.grpc.controller.ts` |
| WordFamilyAdminService | UpsertCategory | `@RequirePermissions('word_family:admin')` | `apps/vocabulary-service/src/modules/word-family/word-family-admin.grpc.controller.ts` |
| WordFamilyService | GetWordFamily | `@RequirePermissionsOrService([])` | `apps/vocabulary-service/src/modules/word-family/word-family.grpc.controller.ts` |

<!-- END GENERATED -->

Reading the table:

- `ServiceOnly(...)` lists the allowed service callers (service token, `sub = svc:<name>`).
- `RequirePermissionsOrService(perms, { callers })` accepts a user token holding `perms`, or a service token from `callers`. With no `callers` option any service token is accepted; `callers: []` means no service caller. An empty `perms` list means any verified user.
- Auth `SetUserStatus` is `role:assign` over gRPC; the HTTP routes `POST /admin/users/:id/ban|unban` need `user:manage` and forward the admin token to it, so a caller needs both.
- r2 `ListUserFiles` is declared but answers `UNIMPLEMENTED`.
- Actor of a write is always the verified token `sub`; rows of other users are not found.
- auth `ListUsers` accepts only a forwarded user token with `user:manage` (no service caller; the `finance` caller was removed with finance-service).
- document `GetQuota` and the other document RPCs take the forwarded user token (content, assessment and ai-chat forward it); there is no service caller.

### Python ai-service (phase 15)

Source: `apps/ai-service/src/backend/auth/service_token.py`. `AiService.StreamChat`, `Query`, `GenerateWordFamily` and `ListModels` use a Python interceptor, not a Nest decorator: service token only. RS256, `iss`, `aud=ai`, `exp`, `roles` exactly SERVICE, `sub` in `svc:ai-chat`, `svc:vocabulary`, `svc:content` (constant `ALLOWED_CALLERS`, not env). A user token (`aud=kmaedu`) answers `UNAUTHENTICATED` because the audience check runs first; a valid `aud=ai` token from another service (e.g. `svc:document`) answers `PERMISSION_DENIED`.

Auth `SERVICE_AUDIENCES` includes `document` and `ai`; auth `SERVICE_CLIENTS` needs an entry for `document`. There is no `finance` audience or client any more. The RabbitMQ users `document` and `ai` may publish only `^document\.` and `^ai\.`; user `content` may publish `^content\.` and user `assessment` `^assessment\.`.

## Per-endpoint enforcement (phase 06, 2026-10-20)

> Source: `@RequirePermissions` / `@RequireOwnerOrPermission` / `@Authenticated()` / `@Public()` on the content, assessment, admin and r2 controllers; `kmaedu-be/test/authz/` (`handler-declarations.spec.ts` fails on an undeclared HTTP handler or WS gateway class, on an `@Authenticated()` handler missing from `authenticated-allowlist.ts`, or an entry without a two-user spec; `authz-matrix.spec.ts` proves STUDENT / TEACHER / admin-only per row).

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
| | `POST :id/refresh-snapshot` (phase 14) | `exam_session:manage` (host): only while UPCOMING with 0 attempts, else 409 `SNAPSHOT_LOCKED` |
| | `users/search` | `user:search` |
| | `get-public/:id`, `study/:id/info`, `study/:id/access` | `@Public()` (sanitised) |
| | `study/:id`, `study/:id/stats` | `exam:take`; answer-free view |
| | `study/:id/verify-code`, `study/:id/with-code` | `exam:take` + access-code guard |
| examattempt | `history-stats`, `start`, `:id/progress`, `:id/submit`, `:id/quiz`, `:id/secure-*`, `POST /`, `list` | `exam:take` (own attempt). `start` no longer admits the room host |
| | `list-by-room/:id`, `list-by-session/:id` | `exam_result:view` (host) |
| | `DELETE :id` | `exam_session:manage` (host) |
| | `:id/detail`, `get-by-id/:id`, `PUT :id` | `@Authenticated()` (allowlist); `examattempt-access.ts`: examinee with `exam:take`, or host with `exam_result:view` (read) / `exam_session:manage` (write); else 404 |
| cheatinglog | `POST /` | `exam:take`; `attempt/:id`, `session/:id/stats`, `session/:sid/user/:uid`: `exam_result:view` (host, else 404) |
| study-room (study-room-service since phase 12; non-host `PUT :id` and an unknown room both answer 403) | `POST /`, `PUT/DELETE :id`, `:id/regenerate-code` | `study_room:create` |
| | `mine`, `join`, `:id/join`, `:id`, `:id/leave`, `:id/leaderboard` | `study_room:join` |
| word-family (vocabulary-service since phase 12) | `categories`, `roots`, `category/...`, `generation-status/*` | `word_family:read` |
| | `save`, `saved`, `DELETE saved/:id` | `word_family:save` |
| | `generate`, `generate-root` | `word_family:generate` (TEACHER only; free; 20/day per user, 429 `WORD_FAMILY_DAILY_LIMIT`; 503 `GENERATION_LIMIT_UNAVAILABLE` if Redis is down) |
| | `:id/to-flashcard` (lives in content-service: `modules/flashcardset/word-family-to-flashcard.controller.ts`; gateway route `wf-to-flashcard`, POST only) | `flashcardset:manage` |
| | categories POST/PUT/DELETE | removed from the exam HTTP surface (phase 10); category writes only through admin `admin/word-family/*` to vocabulary gRPC `WordFamilyAdminService` (`word_family:admin`) |
| document (document-service since phase 15; gateway route `ai-upload`) | `POST quick-upload`, `POST upload` (JSON), `POST upload-image`, `GET/DELETE upload/:id` | `document:upload` (own; other users' ids answer 404) |
| ai (content) | `recent-uploads` (gateway route `ai-recent-uploads`; documents come from document `ListDocuments`) | `document:upload` (own) |
| | `generate-from-file`, `regenerate/:id`, `GET/DELETE job/:id`, `upload/:id/history`, `models` | `ai:generate` (own; `history` first checks `AssertOwnership`) |
| ai-chat-service (own service since phase 13; `subjects` controller is `@Public`) | all ai-chat handlers (class-level) | `ai_chat:use` (own); `:chatId/exists` is `true` only for the caller's own chat |
| subject | 4 GETs | `@Public()` |
| r2 (document-service since phase 15) | `POST /r2/image` (gateway route `r2-image`) | `document:upload`. r2-service's HTTP `internal/upload` and its `INTERNAL_SERVICE_TOKEN` were removed |
| admin | users (list, `:id`, PATCH, ban, unban) | `user:manage`; PATCH rejects `isAdmin`, `isSystemAdmin`, `role`, `isBanned` (400 `VALIDATION_ERROR`) |
| | `admin/roles` (matrix, `users`, `changes`), `PUT roles/users/:id/role`, `PUT roles/users/:id/system-admin` | `role:assign` (phase 08; `grant-admin` / `revoke-admin` removed) |
| | logs / page-config / stats (`admin/stats/*`, `admin/overview`, `admin/series/:name`, `admin/sources`) / audit / word-family | `logs:read` / `page_config:manage` / `stats:read` / `audit:read` / `word_family:admin` (replaces the class-level `admin:access`) |

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
| Ban / unban | `POST users/:id/ban` and `unban` call auth `SetUserStatus` (HTTP route `user:manage`; the gRPC handler itself is `@RequirePermissions('role:assign')`; actor = token `sub`): self 403 `CANNOT_CHANGE_OWN_STATUS`, last active admin 409 `LAST_SYSTEM_ADMIN` (unreachable over HTTP), 409 `ROLE_CHANGE_CONFLICT`. Ban sets `isBanned` (no `deletedAt`), revokes every session; ban and unban bump `authzVersion` and publish `auth.user.authz_changed` with `reason` `ban` / `unban`. Unban also clears `deletedAt` of accounts banned before RBAC |
| `PATCH /admin/users/:id` | Strict body: `role`, `isSystemAdmin`, `isAdmin`, `isBanned` give 400 `VALIDATION_ERROR` |
| Audit | `AdminAudit` after a successful RPC: `admin.role.set_base` `{from,to,reason}`, `admin.role.set_system_admin` `{from,to,reason}`, `admin.user.ban` / `admin.user.unban` `{previousIsBanned}`. Auth writes `RoleChangeLog` for every change; ban / unban / re-apply rows keep the same role and flag on both sides and a `reason` starting `ban` / `unban` / `reapply` |
| Lists | `GET roles/users` returns `{ data, meta, systemAdminCount }` (count of active, non-banned admins); rows carry `role` and `isSystemAdmin` (no `isAdmin`). `GET /admin/users` rows carry the same two fields; filter `isSystemAdmin=true|false` |

**Access-code lockout** (`modules/common/access-code-guard.ts` in content-service and assessment-service; used by flashcard `verify-code`/`with-code`, exam session `verify-code`/`with-code`, and exam attempt `start` with an `accessCode`)

| Rule | Behaviour |
|---|---|
| Format | Code must match `^\d{6}$`, else 400 `INVALID_CODE_FORMAT` (not counted). `GET study/:id` on a code-gated set the caller has no grant for: 403 `CODE_REQUIRED` (send the code to `with-code`) |
| Counter | Redis `content:codefail:<resourceId>:<userId>` / `assessment:codefail:<resourceId>:<userId>`; every evaluated attempt does an atomic `INCR` (`EXPIRE 900 NX`), so the limit is per resource AND user (an attacker only locks themselves) |
| Lockout | More than 5 attempts in 15 min: 429 `CODE_LOCKED` `{ retryAfterSeconds }` before comparing (a correct code is refused too); the 5th wrong code also answers 429 |
| Compare | `timingSafeEqual(sha256(stored), sha256(given))` (fixed length, no early exit). Wrong code below the limit: 400 `INVALID_CODE`. Success deletes the counter |
| Redis down | 503 `CODE_CHECK_UNAVAILABLE` (fail-closed) |

content-service and assessment-service have no `ThrottlerModule`; per-IP rate limits for `verify-code` / `with-code` (5 / 60 s) and `users/search` (30 / 60 s) live in gateway `routes.yaml`.

**WebSocket `/ws/study`** (`StudyRoomSocketAuth` in `study-room-socket-auth.service.ts`, `server.use` in `StudyRoomGateway.afterInit`, both in study-room-service since phase 12; the gateway class carries a declarative `@Authenticated()` because HTTP guards skip `ws`). Two layers:

1. Gateway upgrade (`apps/gateway-service/src/ws/ws-upgrade.handler.ts` → `pipeline/guard-chain.ts`, route `/ws/study` with `pageFlag: study-room`): token verify, revoke / `av`, email verified, permissions, then the page flag. A disabled page is refused at the upgrade as HTTP 403 `PAGE_DISABLED` (a flag read error fails open). socket.io's `auth` payload is not visible here, so the service re-verifies.
2. Socket middleware, in order: token present (`handshake.auth.token`, then Bearer/cookie), signature / `iss` / `aud` / `exp`, `email_verified`, `study_room:join`, token `av` vs Redis `gw:user:<sub>:av` (lower = stale; key missing = pass), then the display profile from auth. A ban bumps `av`, so a banned account's old token is `TOKEN_STALE`; there is no separate ban read and no page-flag check in the socket middleware. An id auth no longer knows (deleted account) is `UNAUTHORIZED`.

A middleware failure is a `connect_error` whose message is the code (`SocketAuthCode`): `TOKEN_MISSING`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `EMAIL_NOT_VERIFIED`, `PERMISSION_DENIED`, `TOKEN_STALE`, `SERVICE_UNAVAILABLE` (Redis or auth lookup error, fail-closed), `UNAUTHORIZED`. `socket.data` holds `{ user, av, exp }`. `handleConnection` (sync) joins room `user:<id>` and schedules a disconnect at token `exp`; `handleDisconnect` clears the timer. Before the server disconnects it emits `auth:reauth { reason: 'TOKEN_EXPIRED' | 'AUTHZ_CHANGED' }` (client: refresh the token, reconnect). On `auth.user.authz_changed` (`study-room-authz.handler.ts`) sockets of that user whose `av` is below the event's `authzVersion` get `auth:reauth` then `disconnect(true)`. `room:kicked` remains for the in-room ban only.

## Frontend route guards (phase 09, 2026-10-22)

UX gating only; the backend decisions above are authoritative. Source: `kmaedu-fe/src/routes/index.tsx` (`guarded()` → `RequirePermission`), `kmaedu-fe/src/lib/rbac/nav-items.ts`, `kmaedu-fe/src/lib/rbac/landing-path.ts`. The permission names come from `kmaedu-fe/src/types/permissions.generated.ts`, generated from `libs/auth-jwt/src/permissions.ts` by `yarn gen:fe-permissions` (in `kmaedu-be`; CI job `fe-permissions-drift` fails when the file is stale). The session (`user`, `roles`, `permissions`) comes from `GET /auth/me` / login / refresh responses; the client never decodes the JWT.

**Guard outcomes** (`lib/rbac/guard-decision.ts`): session loading → spinner; anonymous → `/login?from=<path>`; `/auth/me` unreachable and no session in memory → `SessionUnavailable` (retry button, no redirect); permission missing → `/403` (`ForbiddenPage`, link to the role landing path); otherwise render. `/403` itself only needs a login.

| Route | Permission (any-of where listed) | Page flag |
|---|---|---|
| `/k`, `/k/profile`, `/k/verify` | login only | - |
| `/k/my-materials` | `flashcard:study` | `my-materials` |
| `/k/flash-card`, `/k/manage-flashcard-set/:id` | `flashcardset:manage` | `flash-card` |
| `/k/history` | `ai:generate` or `exam:take` | `history` |
| `/k/history/exam` | `exam:take` | `history` |
| `/k/history/pdf` | `ai:generate` | `history` |
| `/study-flashcard/:id` | `flashcard:study` or `flashcardset:manage` (now requires login; was open) | - |
| `/exam-session/:id` | none in the router (the page handles its own access) | - |
| `/exam-session/:id/quiz`, `/k/my-exams` | `exam:take` | `my-exams` on `/k/my-exams` only |
| `/k/manage-exam`, `/k/manage-quiz-set/:id` | `quizset:manage` | `manage-exam` |
| `/k/practice-quiz/:id` | `quiz:practice` or `quizset:manage` (owner preview; backend decides) | - |
| `/k/ai-tool` | `ai:generate` | `ai-tool` |
| `/k/manage-exam-room`, `/k/manage-exam-room/:id` | `exam_room:manage` | `manage-exam-room` |
| `/k/manage-exam-room/:id/session/:sessionId` | `exam_result:view` | `manage-exam-room` |
| `/k/study-room`, `/k/study-room/:id` | `study_room:join` | `study-room` |
| `/k/word-family`, `/:slug`, `/:slug/:rootWord` | `word_family:read` | `word-family` |
| `/admin` shell | `admin:access`; each child adds its own permission (next table) | - |

**Admin console** (`ADMIN_NAV_PERMISSIONS`, shared by route guard and nav; nav lists only entries the caller holds):

| Route | Permission |
|---|---|
| `/admin`, `/admin/stats` | `stats:read` |
| `/admin/users` | `user:manage` |
| `/admin/roles` | `role:assign` |
| `/admin/logs` | `logs:read` |
| `/admin/audit` | `audit:read` |
| `/admin/word-family` | `word_family:admin` |
| `/admin/page-config` | `page_config:manage` |

**Sidebar** (`NAV_ITEMS`): an item shows when the caller holds any of its `anyOf` permissions and its page flag is not `false`: AI tool `ai:generate`; word family `word_family:read`; my materials `flashcard:study`; my exams `exam:take`; manage exam `quizset:manage`; flashcard `flashcardset:manage`; exam rooms `exam_room:manage`; study room `study_room:join`; history `ai:generate` or `exam:take` (links to `/k/history/exam` when the caller lacks `ai:generate`); admin `admin:access`.

**Role landing** (`/k`, `resolveLandingPath`): a safe same-origin `from` wins; else TEACHER `/k/ai-tool`, STUDENT who is also SYSTEM_ADMIN `/admin`, other STUDENT `/k/my-materials`; if that target is not visible, the first visible nav item, else `/k/profile`.

**Error policy** (`lib/rbac/api-error-policy.ts`, `apis/api.ts`): 401 `TOKEN_EXPIRED` / `TOKEN_STALE` → one single-flight `/auth/refresh`, then retry; 401 `SESSION_REVOKED`, or a rejected refresh (401/403) → clear the session and go to `/login`; 403 `PERMISSION_DENIED` → toast and refetch `/auth/me` (at most every 5 s); 403 `EMAIL_NOT_VERIFIED` → `/k/verify`; 429, 5xx and network errors never end the session. `/auth/refresh` rotates the `refreshToken` cookie as well as `accessToken`. On a role change (refresh or `/auth/me` returns a different role set) and on logout, role-scoped Zustand stores and `storeCache` are reset.

**Study-room socket**: `auth:reauth`, `TOKEN_EXPIRED`, `TOKEN_STALE` → refresh then reconnect (one retry, then logout); `PERMISSION_DENIED` → leave the room; `SERVICE_UNAVAILABLE` (Redis outage on content-service, assessment-service or study-room-service) → bounded exponential backoff (1 s doubling, 30 s cap, 5 attempts), then a give-up notice.

