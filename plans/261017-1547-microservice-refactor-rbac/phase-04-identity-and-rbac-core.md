# Phase 04 — Identity & RBAC Core

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§04, decisions 2–7, 9)
- Red team: [reports/red-team-changes.md](./reports/red-team-changes.md) RT-2, RT-3, RT-5, RT-6, RT-9, RT-15 (authoritative over this file's earlier text and the brief). RT-13 (mobile compat fields) is reversed by [validation-session-1](./reports/validation-session-1.md) Q6: mobile is unreleased, no compat fields. <!-- Updated: Validation Session 1 - RT-13 reversed -->
- Decisions: [reports/decisions.md](./reports/decisions.md) (roles, provisioning, admin combo)
- Research: [researcher-01](./research/researcher-01-rbac-report.md) §1–2, §4, §6 · [researcher-02](./research/researcher-02-migration-mechanics-report.md) §4 (jose 5.10 CJS)
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §3, §5, §6 · [current state](./reports/scout-current-state-report.md) "Auth"
- Prior: [phase-02](./phase-02-contracts-and-infra-libs.md) (explicit-metadata clients, `GetPublicProfilesByIds`, no `actor_id`), [phase-03](./phase-03-messaging-foundation.md) (outbox, state-event `version`)
- ARCHITECTURE.md §5.1–5.4

## Overview
- Priority: P1 · Status: Pending · Effort: 5d <!-- Red Team: RT-2, RT-3, RT-9, RT-15 (was 3d: +service tokens/decorators 0.75d, +authzVersion/refresh tx/authz event 0.5d, +robust provisioning/ensureWallet/reconcile 0.5d, +public profiles/advisory lock/ban guard 0.25d) --> · Depends on: 02, 03
- Add the role model and RS256/JWKS tokens with `roles` and `av` (authz version). Build `libs/auth-jwt`: a stateless verifier, the permission catalog, global deny-by-default guards, and service tokens for service-to-service calls. Swap it in for every `libs/common` guard. Add the role-change flow (auth gRPC), robust finance teacher provisioning, and admin bootstrap → `isSystemAdmin`.
- Guard swap is **mechanical, behaviour-preserving** (relative to phase 01). Endpoints are tightened per permission in phase 06.

## Key Insights
- Today: HS256 `JWT_SECRET`, claims `{userId, sessionId}` (`auth.service.ts:66-70`). Every guard in `libs/common/src/guard/{auth,admin,optional-auth}.guard.ts` queries `userSession` + `user` per request.
- Refresh (`auth.service.ts:722-769`) loads the user but does NOT reject banned/deleted users. Ban (`admin-users.service.ts:253-296`, already a Serializable tx) sets `isBanned, deletedAt` but leaves sessions active. Ban was effective only because guards hit the DB. **Stateless guards make both gaps real**: refresh is fixed here; ban (sessions revoked + `av` bump) is fixed in phase 08 `SetUserStatus`; 04 + 05 + 08 are verified together on local compose (production deploys once, at final merge). <!-- Reconcile: X1 --> <!-- Updated: Validation Session 1 - single production deploy -->
- ~130 sites pass whole `req.user` into services (grep `req.user[,)]`: quizset 20, flashcardset 22, examattempt 14, ai-chat 14 …). New `AuthUser = { kind:'user', id, sid, roles, emailVerified, av }` keeps `.id`. `tsc` flags every service that reads `.email/.username/.isAdmin`. Those load from DB (still allowed until phase 10).
- <!-- Red Team: RT-6 --> Unverified users: claim `email_verified` (ARCH §5.1). After phase 01, `AuthGuard` already rejects unverified users except on `@AllowUnverified` handlers, so `@Authenticated()` denying them by default is behaviour-preserving. The decorator moves into `libs/auth-jwt` with the extended list.
- <!-- Red Team: RT-2 --> Internal trust today = network placement: any container can call any gRPC method (no metadata check). Bodies would carry `actor_id` if allowed (phase 02 removed it). Service tokens make the caller explicit and allowlistable.
- <!-- Red Team: RT-3 --> Role/admin/ban/password changes take effect only after the 15 m access token expires unless something rejects older tokens. A monotonic `authzVersion` per user (claim `av`) gives the gateway and WS a cheap, ordered staleness check (phase 05/06).
- <!-- Red Team: RT-9 --> Today's wallet bootstrap is check-then-insert (`finance-service/src/events/user-event.handler.ts:42-80`), racy under redelivery. `Wallet.userId` and `UserSubscription.userId` are both `@unique` (`payment.prisma:23`, `user.prisma:51`), so `ON CONFLICT (userId) DO NOTHING` works without new columns.
- Cookies today: auth sets `token`, `session_id`, `refreshToken` (`auth.controller.ts:232-237…`). Until phase 05 cleans up names, extractor order is: Bearer header → cookie `accessToken` → cookie `token`.
- `jose@5.10.0` (CJS-compatible). Pin `algorithms:['RS256']`, `typ:'at+jwt'`, iss/aud. Local verify inside auth uses `createLocalJWKSet`, so auth never fetches its own JWKS over HTTP.
- DB reset → rename `isAdmin` → `isSystemAdmin` freely (no `@map`), no backfill.
- Admin bootstrap lives in admin-service (`admin-bootstrap.service.ts:146-219`, `commands/cli.ts`) and writes `User` directly. **Move it to auth-service** (auth owns User and the role-change service, so RoleChangeLog and the outbox stay consistent).

## Requirements
- Functional — schema:
  - Prisma (`user.prisma`): `enum BaseRole { STUDENT TEACHER }`; `role BaseRole @default(STUDENT)`; `isSystemAdmin Boolean @default(false)` (drop `isAdmin`); `authzVersion Int @default(0)` <!-- Red Team: RT-3 -->; index `[role]`, `[isSystemAdmin]`.
  - `RoleChangeLog`: `id, targetUserId, targetEmail, actorUserId?, actorEmail, fromRole, toRole, fromAdmin, toAdmin, reason?, source ('admin-ui'|'cli'|'bootstrap'), createdAt`, indexes `[targetUserId, createdAt desc]`, `[createdAt desc]`. No FK.
- Functional — user tokens:
  - RS256 signed by `JWT_PRIVATE_KEY` (PKCS8 PEM) with header `kid=JWT_KID`, `typ=at+jwt`.
  - Claims: `iss=JWT_ISSUER, aud=JWT_AUDIENCE, sub, sid, roles, email_verified, av, iat, exp` (15m). `roles` = `[role]` + `"SYSTEM_ADMIN"` if `isSystemAdmin`. `av` = `User.authzVersion` at signing. <!-- Red Team: RT-3 -->
  - JWKS: `GET /.well-known/jwks.json` (excluded from the `api/v1` prefix, `@Public`). Publishes the current key plus `JWT_RETIRED_PUBLIC_KEYS` (JSON `[{kid,pem}]`) for rotation.
  - Login and refresh sign INSIDE a tx that reads `role, isSystemAdmin, authzVersion, isBanned, deletedAt, isVerified` with `SELECT … FOR SHARE`, so a token never carries roles older than its `av`. Banned/deleted → 401 `ACCOUNT_DISABLED` and the session is deactivated. `verifyAccount` re-issues the access cookie with `email_verified=true`. <!-- Red Team: RT-3 -->
  - `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` add `roles: Role[]` and `permissions: Permission[]` next to existing fields. `user` gains `role`, `isSystemAdmin` and has **no `isAdmin` alias** (mobile is unreleased, no compat contract). The existing `wallet`/`subscription` includes stay as today's behaviour until phase 10 removes `wallet` and `subscription` from `/auth/me`. <!-- Updated: Validation Session 1 - no compat fields -->
  - Register (email + Google): DB default `STUDENT`. **Remove `UserSubscription` creation** (`auth.service.ts:171-194, 576-605`). `/auth/me` wallet/subscription are null for users without them.
  - `authzVersion` bump (same tx as the change, plus outbox `auth.user.authz_changed {userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}`) on: role change, admin flag change, password change (`changePassword`, `resetPassword`). Ban is implemented in phase 08 (`SetUserStatus`) on the same path. `reason ∈ role|admin|password|ban|unban|reapply`; `version = authzVersion`. <!-- Red Team: RT-3 --> <!-- Reconcile: X1, X2 -->
- Functional — service tokens <!-- Red Team: RT-2 -->:
  - `POST /internal/token` on auth (excluded from the `api/v1` prefix, never routed by the gateway, internal network only), `client_credentials`: body `{ client_id, client_secret, audience }`.
  - Auth config `SERVICE_CLIENTS` = JSON `{ "<name>": "<sha256-hex of secret>" }`; compare with `crypto.timingSafeEqual`. Unknown client, bad secret, or unknown audience → 401 (logged, no detail).
  - Token: RS256, same key/JWKS, `sub=svc:<name>`, `aud=<target svc>`, `roles=["SERVICE"]`, no `sid`/`av`/`email_verified`, TTL 5 min.
  - Callers: env `SERVICE_NAME`, `SERVICE_CLIENT_SECRET`, `AUTH_TOKEN_URL`. `libs/auth-jwt` `ServiceTokenClient` caches one token per audience until `exp − 60 s` (single-flight refresh). Auth signs its own outbound service tokens locally.
  - Secrets: `scripts/gen-service-secret.sh <name>` prints the secret and its hash. Phase 04 issues them for `exam`, `finance`, `admin`.
- Functional — `libs/auth-jwt` (no Prisma, no DB):
  - `permissions.ts` holds the exact v1 catalog (brief decision 5, plus TEACHER `word_family:save` <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->) and `ROLE_PERMISSIONS`, `permissionsOf`, `hasPermission`. `SERVICE` is not a key of `ROLE_PERMISSIONS` (no user permissions).
  - `verify.ts`, `extract-token.ts`, `decorators.ts`, `jwt-auth.guard.ts`, `permissions.guard.ts`, `service-token.client.ts`, `grpc-metadata.ts` (`forwardUser(req)` → metadata with the caller's bearer + `x-request-id`; `asService(aud)` → metadata with a cached service token), `auth-jwt.module.ts` (registers both guards as `APP_GUARD`, in order). <!-- Red Team: RT-2 -->
  - Decorators:
    - `@RequirePermissions(...perms)` (AND, user tokens only);
    - `@Authenticated()` (any verified user) <!-- Red Team: RT-6 -->: denies `email_verified=false` with 403 `EMAIL_NOT_VERIFIED`;
    - `@AllowUnverified()` exempts: `me`, `logout`, `sendVerificationEmail`, `verifyAccount`, `send-code-change-password`, `change-password`, `devices` (class), `sync-refresh-token`. A unit test pins this list; <!-- Red Team: RT-6 --> <!-- Reconcile: X8 -->
    - `@Public()`: a token that fails verification is ignored and the request is treated as anonymous (never 401); <!-- Red Team: RT-6 -->
    - `@ServiceOnly(...callers)` (≥1 caller): a service token whose `svc:<name>` is listed; <!-- Red Team: RT-2 -->
    - `@RequirePermissionsOrService(perms, { callers? })`: a user token with `perms` (empty = any verified user) OR a service token from `callers` (omitted = any service); <!-- Red Team: RT-2 -->
    - `@CurrentUser()` → `AuthUser | ServiceCaller { kind:'service', name }`.
  - Verify accepts `aud ∈ {JWT_AUDIENCE, SERVICE_NAME}`. A token with `roles` containing `SERVICE` must have `sub` starting `svc:` and vice versa; otherwise 401 `TOKEN_INVALID`. User-only decorators reject service tokens with 403 `PERMISSION_DENIED`.
  - <!-- Red Team: RT-5 --> Both guards return `true` when `context.getType() === 'ws'`. WS auth lives in the socket `server.use` middleware (phase 06).
  - Deny by default: a handler with no declaration → 403 `NO_AUTHZ_DECLARED`. Missing/invalid token on a non-public route → 401 `TOKEN_MISSING|TOKEN_EXPIRED|TOKEN_INVALID`. Permission missing → 403 `PERMISSION_DENIED`.
- Functional — RPC guards <!-- Red Team: RT-2, RT-15 -->. Hybrid apps `connectMicroservice(opts, { inheritAppConfig: true })`; the guard reads `authorization` from metadata (decision 9). Rule: every state-changing RPC needs a forwarded user token with the permission (actor = token `sub`, never a body field) or an allowlisted service token. Network placement is not the trust boundary.

  | RPC | Declaration |
  |---|---|
  | auth `GetPublicProfilesByIds` (implemented here: `id, username, name, avatar`) | `@RequirePermissionsOrService([])` |
  | auth `GetUser`, `GetUsersByIds`, `FindUserByEmail` (full user incl. email) | `@RequirePermissionsOrService(['user:manage'], { callers: ['admin','finance'] })` |
  | auth `ListUsers` | `@RequirePermissionsOrService(['user:manage'], { callers: ['finance'] })` |
  | auth `SetUserRole`, `SetSystemAdmin`, `ListRoleChanges` | `@RequirePermissions('role:assign')` (actor = token `sub`) |
  | auth `SetUserStatus` | stays `UNIMPLEMENTED` until phase 08 (implemented there) <!-- Reconcile: X1 --> |
  | finance `GetWallet`, `GetUserBenefits` | `@RequirePermissionsOrService([])` |
  | finance `CreateWallet` (no caller today) | `@ServiceOnly('auth')` |
  | finance `UpdateBalance` (deprecated) | `@ServiceOnly('exam')` |
  | r2 `GetFileUrl`, `ListUserFiles` | `@RequirePermissionsOrService([])` |
  | r2 `UploadFile`, `DeleteFile`, `DeleteObjects` | `@ServiceOnly('exam','auth')` |

  Callers switch to real metadata: exam → r2/finance `asService(...)`; auth → r2/gateway (locally signed); finance → auth `asService('auth')`; admin → auth role RPCs `forwardUser(req)`.
- Functional — role change (`RoleChangeService.change`, decision 6), steps in Architecture. <!-- Red Team: RT-15 --> Serialized by `pg_advisory_xact_lock(hashtext('role-change'))`; `40P01`/`40001` → one retry → 409 `ROLE_CHANGE_CONFLICT`.
- Functional — demotion TEACHER → STUDENT <!-- Updated: Validation Session 1 - demotion keeps content -->: the change touches only `User.role` / `authzVersion` (+ log + outbox). Ownership and content (quiz sets, flashcard sets, exam rooms, exam sessions incl. open ones, documents, wallet) are untouched: no cascade, no transfer, no block on open sessions. Management is locked by permissions alone (the demoted user lacks `*:manage` → 403); student access to that content never depends on the owner's role (phase 06).
- Ban: no interim admin-side ban here. Phase 08 implements auth `SetUserStatus` (advisory lock, last-admin guard, `authzVersion` bump, sessions revoked, outbox `authz_changed(reason:'ban')`); admin-service never calls `InvalidateUser`. 04 + 05 + 08 are verified together on local compose; production sees them only in the one final-merge deploy (phase 16 cutover runbook), so there is no gap. <!-- Updated: Validation Session 1 - single production deploy --> Admin-service `banUser` is only touched here for the `isSystemAdmin` rename. <!-- Reconcile: X1 -->
- Functional — finance provisioning <!-- Red Team: RT-9 -->:
  - Consumer `@EventHandler('auth.user.authz_changed')`, when `role=TEACHER` (any `reason`, incl. `reapply`), calls `ensureWallet(userId)`. Idempotent, so redelivery and out-of-order events are harmless. <!-- Reconcile: X2 -->
  - `ensureWallet` = one tx: `INSERT Wallet(balance 20) ON CONFLICT (userId) DO NOTHING RETURNING id`; only when a row was inserted, insert the `+20` welcome `WalletTransaction` (so: once ever; wallets are never deleted); `INSERT UserSubscription(tier 0) ON CONFLICT (userId) DO NOTHING`. Demotion: no-op (wallet kept).
  - Lazy `ensureWallet` on the finance HTTP read paths (`GET /wallet/info`, `/wallet/details`) when the caller's token has `wallet:use`.
  - CLI `finance reconcile-teachers` (`apps/finance-service/src/commands/cli.ts`): pages auth `ListUsers(role=TEACHER)` and calls `ensureWallet` per user; prints created count.
  - Remove finance's `auth.user.registered` handler + binding from 03.
- Functional — bootstrap CLI (`apps/auth-service/src/commands/cli.ts`): `sync` (`ADMIN_EMAILS`), `list`, `grant <email> [--teacher]`, `revoke <email>`. All go through `RoleChangeService` with `source:'cli'` (actor checks skipped for the system actor; advisory lock and last-admin guard kept). Boot-time sync also moves to auth (`onModuleInit`). Re-running `grant` with the same values is the support recovery path (forced re-emit). <!-- Red Team: RT-9 -->
- Non-functional: zero DB queries in any guard. Verify p99 < 2ms (local JWKS cache). No permission data in the token. Service-token fetch adds ≤1 HTTP call per caller per audience per ~4 min.

## Architecture
```
login/refresh ─► auth: tx { SELECT user FOR SHARE → roles, av } → SignJWT RS256 {sub,sid,roles,email_verified,av}
service HTTP/gRPC ─► JwtAuthGuard (jose verify via JWKS cache, kid; ws → skip) ─► PermissionsGuard (decl → user perms | service allowlist) ─► handler
exam/finance ─POST /internal/token (client_credentials)─► auth ─► svc JWT {sub:svc:exam, aud:finance, roles:[SERVICE]} (cached 4 min)
admin-service ─gRPC SetUserRole(user bearer md)─► auth: role:assign ─► RoleChangeService tx ─► outbox(authz_changed) ─► finance worker (ensureWallet if role=TEACHER) <!-- Reconcile: X2 -->
                                                                            └─► after commit: GatewayControl.InvalidateUser(userId, av) (05)
```
<!-- Red Team: RT-2, RT-3 -->
Role-change steps (in `RoleChangeService.change`) <!-- Red Team: RT-3, RT-9, RT-15 -->:
1. Actor == target → 403 `CANNOT_CHANGE_OWN_ROLE`.
2. `$transaction`: `SELECT pg_advisory_xact_lock(hashtext('role-change'))`.
3. Re-read the actor from DB and require `isSystemAdmin && !isBanned && !deletedAt` (skipped for the CLI system actor).
4. Read the target `FOR UPDATE`.
5. If the change demotes an admin: `SELECT count(*) FROM "User" WHERE "isSystemAdmin" AND NOT "isBanned" AND "deletedAt" IS NULL` ≤ 1 → 409 `LAST_SYSTEM_ADMIN`.
6. Same values (re-apply): insert `RoleChangeLog` (reason `reapply`) + outbox `auth.user.authz_changed {userId, authzVersion (unchanged), role, isSystemAdmin, isBanned, reason:'reapply', version}`; no user update; return. <!-- Reconcile: X2 -->
7. Update the user (`authzVersion + 1`), insert `RoleChangeLog` (holds from/to + actor), outbox `auth.user.authz_changed {userId, authzVersion, role, isSystemAdmin, isBanned, reason, version: authzVersion}` (the only identity-authz event). <!-- Reconcile: X2 -->
8. After commit: `gatewayControl.invalidateUser(targetId, authzVersion)` (fail-soft: log + counter; no-op while `GATEWAY_CONTROL_ENABLED=false` until 05; the durable event covers a lost call). Never revoke sessions.
9. `40P01`/`40001` anywhere in 2–7 → retry the tx once → 409 `ROLE_CHANGE_CONFLICT`.

```ts
// libs/auth-jwt/src/permissions.ts (shape only)
export const PERMISSIONS = { FLASHCARD_STUDY: 'flashcard:study', QUIZ_PRACTICE: 'quiz:practice', /* … all v1 keys … */ } as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type Role = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';
export const ROLE_PERMISSIONS = { STUDENT: [...], TEACHER: [...], SYSTEM_ADMIN: [...] } as const satisfies Record<Role, readonly Permission[]>;
```
Mechanical guard mapping (no behaviour change vs phase 01):

| Today | Phase 04 |
|---|---|
| `@UseGuards(AuthGuard)` | `@Authenticated()` |
| `@UseGuards(AuthGuard)` + `@AllowUnverified()` (phase 01) | `@Authenticated()` + `@AllowUnverified()` (extended list) <!-- Red Team: RT-6 --> |
| `@UseGuards(OptionalAuthGuard)` / no guard | `@Public()` |
| `@UseGuards(AdminGuard)` (admin-service classes) | class `@RequirePermissions(P.ADMIN_ACCESS)` |
| word-family `AuthGuard, AdminGuard` | `@RequirePermissions(P.WORD_FAMILY_ADMIN)` |
| SePay webhook, health, subjects, `get-public/*`, JWKS, `/internal/token` | `@Public()` |
| `@GrpcMethod` handlers | RPC guard table above <!-- Red Team: RT-2 --> |

The gateway (pre-05) gets no global guards. Its existing `@UseGuards(AuthGuard)` sites switch to the non-global `JwtAuthGuard` (verify only). Study-room socket auth (`study-room-socket-auth.service.ts`) swaps jwtService + Prisma for `verifyAccessToken`; the full WS checks land in phase 06 (RT-5).

## Related Code Files
File ownership (globs): `examio-be/libs/auth-jwt/**`, `examio-be/libs/common/src/{guard/**,auth/**,decorators/allow-unverified.decorator.ts}`, `examio-be/libs/database/src/models/user.prisma`, `examio-be/libs/database/src/models/role-change-log.prisma`, `examio-be/libs/database/src/migrations/*_rbac_core/**`, `examio-be/proto/examio/events/v1/auth_events.proto`, `examio-be/apps/auth-service/**`, `examio-be/apps/finance-service/src/{events/**,commands/**,modules/wallet/wallet.controller.ts,modules/wallet/wallet.service.ts,modules/wallet/wallet.grpc.controller.ts,modules/sepay/subscription.grpc.controller.ts,clients/**}`, `examio-be/apps/r2-service/src/r2-service.controller.ts` (decorator lines), `examio-be/apps/exam-service/src/clients/**` (metadata wiring), `examio-be/apps/admin-service/src/{modules/admin-bootstrap/**,commands/**,admin-service.module.ts,modules/admin-users/user-select.safe.ts,modules/admin-users/admin-users.service.ts}`, `examio-be/apps/admin-service/test/**`, `examio-be/apps/*/src/**/*.controller.ts` (decorator lines only), `examio-be/apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts`, `examio-be/apps/*/src/*.module.ts` (AuthJwtModule import), `examio-be/{package.json,tsconfig.json,jest.config.js}`, `examio-be/deploy/docker-compose.yml` (JWT + service-client env), `examio-be/apps/*/.env.example`, `examio-be/scripts/{gen-jwt-keypair.sh,gen-service-secret.sh}`. <!-- Red Team: RT-2, RT-9 -->

- Create:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/auth-jwt/src/{index.ts,permissions.ts,verify.ts,extract-token.ts,decorators.ts,jwt-auth.guard.ts,permissions.guard.ts,service-token.client.ts,grpc-metadata.ts,auth-jwt.module.ts,auth-errors.ts}` <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/models/role-change-log.prisma`, `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/migrations/<ts>_rbac_core/migration.sql`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/token/{token.service.ts,jwks.controller.ts,keys.ts,service-token.controller.ts,service-clients.ts}` <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/roles/{role-change.service.ts,role-change.repository.ts,roles.module.ts}`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/clients/gateway-control.client.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/admin-bootstrap/{admin-bootstrap.service.ts,admin-bootstrap.module.ts}`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/commands/cli.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/events/handlers/user-authz-changed.handler.ts` <!-- Reconcile: X2 -->, `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/wallet/ensure-wallet.service.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/commands/cli.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/clients/auth.client.ts` <!-- Red Team: RT-9 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/scripts/gen-jwt-keypair.sh` (openssl RS256 PKCS8 + kid), `/Users/tgiap.dev/devs/examio/examio-be/scripts/gen-service-secret.sh` <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/test/jest-e2e.json` (missing today; copy the auth one) <!-- Red Team: RT-3, RT-15 -->
- Modify:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/models/user.prisma`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/{auth.service.ts,auth.controller.ts,auth.module.ts,main.ts}`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/grpc/auth.grpc.controller.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/repositories/user.repository.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/devices/devices.controller.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/dto/{register.dto.ts,login.dto.ts}` (`.strict()`)
  - `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/events/v1/auth_events.proto` (`UserAuthzChanged` only) <!-- Red Team: RT-3 --> <!-- Reconcile: X2 -->
  - all controllers in `/Users/tgiap.dev/devs/examio/examio-be/apps/{auth,exam,finance,admin,r2}-service/src/**` (mapping table) + gateway `@UseGuards(AuthGuard)` sites; gRPC controllers per the RPC guard table <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/clients/{r2,finance}.client.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/clients/r2.client.ts` (metadata wiring) <!-- Red Team: RT-2 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/wallet/{wallet.controller.ts,wallet.service.ts}` (lazy `ensureWallet`) <!-- Red Team: RT-9 -->
  - services that read non-`id` fields from `req.user` (found by `tsc`)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/study-room/study-room-socket-auth.service.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/modules/admin-users/{admin-users.service.ts,user-select.safe.ts}` (rename to `isSystemAdmin` only; ban moves to auth in 08), `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/admin-service.module.ts` <!-- Reconcile: X1 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/test/admin.e2e-spec.ts` (mocks the deleted `AdminGuard` today; switch to a test-signed admin token)
  - `/Users/tgiap.dev/devs/examio/examio-be/package.json` (`bootstrap:admin*` → auth CLI; `finance:reconcile-teachers`; add `jose@5.10.0`)
- Delete:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/guard/{auth,admin,optional-auth}.guard.ts`, `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/auth/auth.module.ts` (stray 7d HS256), `/Users/tgiap.dev/devs/examio/examio-be/libs/common/src/decorators/allow-unverified.decorator.ts` (moved to libs/auth-jwt)
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/modules/admin-bootstrap/`, `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/commands/cli.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/events/handlers/user-registered.handler.ts`

## Implementation Steps
1. Write the failing tests for `permissions.ts`, the guards/decorators, the service-token flow, and `RoleChangeService` (see Tests).
2. Build `libs/auth-jwt`. `permissions.ts` stays pure TS (phase 09 codegen reads it). `verify.ts` takes `{ jwksUrl } | { localJwks }` plus `issuer`, `audiences[]`, and maps jose errors to codes. Guards: ws skip, deny-by-default, unverified default deny, `@Public` ignores bad tokens, service-token rules. `ServiceTokenClient` + `grpc-metadata.ts`. <!-- Red Team: RT-2, RT-5, RT-6 -->
3. Prisma: role enum + `isSystemAdmin` + `authzVersion` + `RoleChangeLog`. Run `prisma:merge`, then `migrate dev --name rbac_core`. <!-- Red Team: RT-3 -->
4. Auth tokens:
   - `keys.ts` loads PEMs.
   - `token.service.ts` signs user tokens (with `av`) and service tokens, verifies, and exposes the JWKS.
   - `service-token.controller.ts` (`POST /internal/token`) + `service-clients.ts` (parses `SERVICE_CLIENTS`, fails fast on bad JSON). <!-- Red Team: RT-2 -->
   - Replace `JwtService` usage for access tokens. Delete `JWT_SECRET` from auth.
   - Compose env: `JWT_PRIVATE_KEY`, `JWT_KID`, `JWT_ISSUER`, `JWT_AUDIENCE`, `SERVICE_CLIENTS` (auth); `AUTH_JWKS_URL=http://auth-service:3000/.well-known/jwks.json`, `AUTH_TOKEN_URL=http://auth-service:3000/internal/token`, `SERVICE_NAME`, `SERVICE_CLIENT_SECRET` (exam, finance, admin).
5. Auth flows:
   - login/refresh sign inside the `FOR SHARE` tx; response additions; refresh rejects banned/deleted users; <!-- Red Team: RT-3 -->
   - `/auth/me` returns `user.isSystemAdmin` with no `isAdmin` alias; the existing `wallet` include is left as-is until phase 10; <!-- Updated: Validation Session 1 - no compat fields -->
   - `changePassword` / `resetPassword` bump `authzVersion` + outbox `authz_changed(reason:'password')` in the password-update tx; <!-- Red Team: RT-3 -->
   - `verifyAccount` re-issues the token;
   - register drops UserSubscription;
   - `logout` uses `req.user.sid` instead of the `session_id` cookie.
6. Install `AuthJwtModule` in auth, exam, finance, admin, r2. Apply the mapping table across all controllers and the RPC guard table across gRPC controllers. Add `@AllowUnverified()` to the listed auth handlers and the `devices` controller. Run `yarn typecheck` and fix `req.user` field reads (DB lookup where email/username is needed). <!-- Red Team: RT-2, RT-6 -->
7. Wire metadata in the phase-02 client wrappers (`asService` / `forwardUser`). <!-- Red Team: RT-2 -->
8. Swap study-room socket auth and the gateway `AuthGuard` sites to the libs/auth-jwt verifier.
9. `RoleChangeService` (advisory lock, re-apply, `authzVersion`, one `authz_changed` outbox event, conflict retry) <!-- Reconcile: X2 --> + auth gRPC `SetUserRole` / `SetSystemAdmin` / `ListRoleChanges` / `ListUsers` (filters role/isSystemAdmin/isBanned/query, paginated, batch-safe, no N+1) / `GetPublicProfilesByIds` (one `findMany` with `select` of the 4 fields, input order). Add `GatewayControlClient` (02 contract, `InvalidateUser(userId, authzVersion)`) behind `GATEWAY_CONTROL_ENABLED`. <!-- Red Team: RT-3, RT-15 -->
10. Finance: `ensure-wallet.service.ts`, `user-authz-changed.handler.ts` (`role=TEACHER` → `ensureWallet`) <!-- Reconcile: X2 -->, lazy `ensureWallet` on `GET /wallet/info|details`, `commands/cli.ts reconcile-teachers`. Remove the registered handler/binding. <!-- Red Team: RT-9 -->
11. Move bootstrap and CLI into auth (`--teacher` flag). Update the package.json scripts. Delete the admin-service copies.
12. Admin-service compile fixes: `isAdmin` → `isSystemAdmin`. No ban logic here (phase 08). <!-- Reconcile: X1 -->

## Tests
- Write first:
  - `libs/auth-jwt/src/permissions.spec.ts`:
    - snapshot of `ROLE_PERMISSIONS` against the catalog in the brief (exact keys) + TEACHER `word_family:save`; <!-- Updated: Validation Session 1 - TEACHER += word_family:save -->
    - TEACHER lacks `flashcard:study|quiz:practice|exam:take`;
    - SYSTEM_ADMIN has no TEACHER perms;
    - `hasPermission` uses AND; `SERVICE` has no permissions.
  - `libs/auth-jwt/src/guards.spec.ts`:
    - no declaration → 403 `NO_AUTHZ_DECLARED`;
    - `@Public` + bad/expired token → passes as anonymous (no user); <!-- Red Team: RT-6 -->
    - expired → 401 `TOKEN_EXPIRED`; `alg: HS256` / `none` → 401; wrong `aud` → 401;
    - `email_verified=false` on `@Authenticated` → 403 `EMAIL_NOT_VERIFIED`; on `@Authenticated` + `@AllowUnverified` → passes; on `@RequirePermissions` → 403; <!-- Red Team: RT-6 -->
    - the `@AllowUnverified` handler list equals the pinned list (scan of auth controllers); <!-- Red Team: RT-6 -->
    - `ws` context → `true` without reading a token; <!-- Red Team: RT-5 -->
    - service token on `@RequirePermissions` → 403; on `@ServiceOnly('exam')` from `svc:finance` → 403, from `svc:exam` → pass; `@RequirePermissionsOrService(['user:manage'],{callers:['admin']})` with a STUDENT user token → 403; <!-- Red Team: RT-2 -->
    - a token with `roles:["SERVICE"]` and `sub` not starting `svc:` → 401; <!-- Red Team: RT-2 -->
    - rpc context reads metadata.
  - `libs/auth-jwt/src/service-token.client.spec.ts`: one fetch per audience within TTL; refresh at `exp − 60 s`; concurrent callers share one in-flight fetch. <!-- Red Team: RT-2 -->
  - `apps/auth-service/src/roles/role-change.service.spec.ts`: self-change 403; non-admin actor (DB re-check) 403; last-admin 409; re-apply writes a log + `authz_changed(reapply)` and no user update; success writes log + one `authz_changed` outbox row (`role`, `isSystemAdmin`, `isBanned`, `version = authzVersion`) <!-- Reconcile: X2 --> and calls `invalidateUser(id, av)` after commit; a `40P01` on the first attempt → retried once; twice → 409 `ROLE_CHANGE_CONFLICT`. <!-- Red Team: RT-3, RT-9, RT-15 -->
- Integration (real Postgres):
  - `apps/auth-service/test/role-change.e2e-spec.ts`: demoting a TEACHER who owns a quiz set, flashcard set and an open exam session → only `role`/`authzVersion` change; row counts and `ownerId`s of their content are identical before/after <!-- Updated: Validation Session 1 - demotion keeps content -->; two concurrent demotions of the last two admins → exactly one succeeds (advisory lock); a demotion concurrent with a refresh → the refreshed token carries either the old roles with the old `av` or the new roles with the new `av`, never a mix. <!-- Red Team: RT-3, RT-15 -->
  - `apps/auth-service/test/token.e2e-spec.ts`: login → token verifies against `/.well-known/jwks.json`; claims as specified incl. `av`; refresh after a role change returns the new roles and a higher `av`; refresh of a banned user → 401; password change → `authzVersion+1` and one `authz_changed` outbox row. <!-- Red Team: RT-3 -->
  - `apps/auth-service/test/service-token.e2e-spec.ts` <!-- Red Team: RT-2 -->: valid `client_credentials` → token with `sub=svc:exam`, `aud=finance`, `roles=["SERVICE"]`, exp ≤ 5 min; wrong secret → 401; unknown audience → 401; the token is rejected by an HTTP `@Authenticated` route (403) and accepted by finance `UpdateBalance` only for `svc:exam`.
  - `apps/auth-service/test/public-profiles.e2e-spec.ts` <!-- Red Team: RT-15 -->: `GetPublicProfilesByIds` response has no `email` key; `GetUsersByIds` with a STUDENT user token → `PERMISSION_DENIED`; with `svc:admin` → full user.
  - Ban e2e lives in phase 08 (`apps/admin-service/test/ban.e2e-spec.ts`, through auth `SetUserStatus`). <!-- Reconcile: X1 -->
- Money e2e (`apps/finance-service/test/user-authz-changed.e2e-spec.ts`) <!-- Red Team: RT-9 --> <!-- Reconcile: X2 -->: promote → wallet 20 + Free sub. Demote + re-promote → still 20 (no second bonus). Duplicate event → no-op. Two `ensureWallet` calls racing for the same user → 1 wallet, 1 welcome tx. Re-apply (`grant --teacher` twice) for a TEACHER whose wallet row was deleted in the fixture → wallet recreated. `GET /wallet/info` by a TEACHER without a wallet → 200 with balance 20. `reconcile-teachers` on a fixture with 2 missing wallets → 2 created.

## Todo List
- [ ] libs/auth-jwt (catalog, verify, guards incl. ws skip, decorators incl. AllowUnverified/ServiceOnly/RequirePermissionsOrService, service-token client, grpc metadata, module) + tests <!-- Red Team: RT-2, RT-5, RT-6 -->
- [ ] Prisma role enum, isSystemAdmin, authzVersion, RoleChangeLog + migration <!-- Red Team: RT-3 -->
- [ ] RS256 keys, JWKS endpoint, new claims incl. `av`, 15m
- [ ] `/internal/token` service tokens + `SERVICE_CLIENTS` + secrets script <!-- Red Team: RT-2 -->
- [ ] login/refresh sign in FOR SHARE tx; roles+permissions; ban check; verify re-issue; register w/o subscription; `/auth/me` has `isSystemAdmin`, no `isAdmin` alias <!-- Red Team: RT-3 --> <!-- Updated: Validation Session 1 - no compat fields -->
- [ ] Password change/reset bump authzVersion + `authz_changed` <!-- Red Team: RT-3 -->
- [ ] Guard swap in all services (mapping table) + RPC guard table + req.user fixes <!-- Red Team: RT-2 -->
- [ ] Client wrappers send user/service metadata <!-- Red Team: RT-2 -->
- [ ] Study-room socket + gateway guard sites on libs/auth-jwt
- [ ] Demotion keeps ownership/content; e2e asserts content untouched <!-- Updated: Validation Session 1 - demotion keeps content -->
- [ ] RoleChangeService (advisory lock, re-apply, av, 1 `authz_changed` event, 409 retry) <!-- Reconcile: X2 --> + auth gRPC admin RPCs + GetPublicProfilesByIds + GatewayControl client (flagged) <!-- Red Team: RT-3, RT-15 -->
- [ ] Finance ensureWallet (ON CONFLICT), `authz_changed` consumer (role=TEACHER), lazy ensure, reconcile CLI; registered handler removed <!-- Red Team: RT-9 --> <!-- Reconcile: X2 -->
- [ ] Bootstrap CLI moved to auth (+ --teacher)
- [ ] admin-service compile fixes (`isSystemAdmin` rename; no ban logic) <!-- Reconcile: X1 -->

## Success Criteria
- `cd examio-be && yarn typecheck && yarn build:all && yarn test`: exit 0.
- `cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`: exit 0. Same for `apps/finance-service` and `apps/admin-service`.
- `grep -rn "AuthGuard\b\|AdminGuard\|OptionalAuthGuard\|JWT_SECRET" examio-be/apps examio-be/libs --include=*.ts` → only `GoogleAuthGuard`/`AuthStrictThrottlerGuard` hits.
- `grep -rn "userSession\|prisma" examio-be/libs/auth-jwt` → none.
- <!-- Red Team: RT-2 --> Every `@GrpcMethod` handler in `apps/*/src` carries a declaration from the RPC guard table (unit test scans the decorator metadata). A gRPC call without metadata to finance `UpdateBalance` → `UNAUTHENTICATED`.
- Manual: register → `/auth/me` returns `roles:["STUDENT"]`, `permissions` = the STUDENT list, no wallet, `user.isSystemAdmin:false`, no `isAdmin` key. `yarn bootstrap:admin:grant a@x.io --teacher` → `/auth/me` (after refresh) shows `["TEACHER","SYSTEM_ADMIN"]` (TEACHER permissions incl. `word_family:save`), `user.isSystemAdmin:true`, and the wallet balance is 20. <!-- Updated: Validation Session 1 - no compat fields; catalog -->
- Every existing FE flow still works for a TEACHER+ADMIN user (guards are mechanical).

## Risk Assessment
- Stateless guards drop session-active checks before the gateway revoke list exists (05) → High/Medium. Logged-out tokens stay valid ≤15m. **Verify 04 + 05 + 08 together on local compose** (single long branch; Milestone A is a local-compose checkpoint, never a production deploy). Ban (sessions revoked + `av` bump) arrives with 08 before that checkpoint; production gets everything once at final merge. <!-- Reconcile: X1 --> <!-- Updated: Validation Session 1 - single production deploy -->
- `req.user` shape change breaks services at runtime where typed `any` → High/Medium. Grep `req.user` call sites into `any`-typed params and add an e2e smoke per module.
- Global deny-by-default blocks an un-annotated handler → intended. The phase 06 CI test catches it. Here, `tsc` + manual smoke + mapping completeness grep (`@UseGuards(` count = 0 in controllers except throttler/google).
- <!-- Red Team: RT-2 --> A caller missing `SERVICE_CLIENT_SECRET` or auth down at boot → its first RPC fails → Medium/High. Countermove: `ServiceTokenClient` fails fast at boot when env is missing; token fetch retries with backoff; cached tokens survive a short auth outage (≤4 min).
- <!-- Red Team: RT-2 --> A leaked service secret lets an attacker on the internal network act as that service → Low/High. Countermove: per-service secrets (blast radius = one allowlist), hashes only in auth, rotation = new hash in `SERVICE_CLIENTS` + redeploy the caller; tokens live 5 min.
- <!-- Red Team: RT-15 --> The global advisory lock serializes every role change and ban → Low (admin-only, rare writes). The lock is tx-scoped, so it never leaks.
- <!-- Red Team: RT-6 --> Unverified users lose an endpoint they need → Medium/Low. The pinned `@AllowUnverified` list is reviewed in the PR; phase 06's matrix adds the unverified dimension.
- Key management mistakes (PEM newline escaping in env) → `keys.ts` normalises `\n`. Fail fast at boot when the key is missing.
- jose 5 vs Jest CJS → pinned 5.10.0 (CJS export verified by researcher-02).

## Rollback
- Revert the phase as a unit (tokens, guards, service tokens, and schema are coupled). The DB is reset, so the old `isAdmin` schema returns via the baseline + reverted migration.
- Finance provisioning: revert the handler commits and restore the registered handler from 03. `ensureWallet` is additive (ON CONFLICT), so partial rollback leaves no bad data.

## Security Considerations
- Pin `RS256`. Reject `none`/HS*. Validate `typ`, `iss`, `aud`. JWKS has signing keys only (`use: sig`).
- Register/login DTOs `.strict()` → injected `role`/`isSystemAdmin` returns 400 (escalation guard). Never spread a DTO into `prisma.user.create/update`.
- Role changes need a fresh DB check of the actor, the advisory lock, the last-admin guard, and an audit row. Responses never include `password`. <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-2 --> gRPC: forwarded token or service token verified on every call; never bare `x-user-*` metadata and never a body `actor_id`. The actor is always the verified `sub`. `/internal/token` is not routed by the gateway, and service tokens (`aud` = a service name) fail the gateway's `aud` check, so they cannot be replayed at the edge.
- <!-- Red Team: RT-15 --> Display lookups use `GetPublicProfilesByIds` (no email). Email-bearing RPCs need `user:manage` or an allowlisted service.
- <!-- Red Team: RT-3 --> `av` makes role/admin/password/ban changes observable to stateless checks without a DB hit; refresh never mints a token older than the row it read.
- Private key and `SERVICE_CLIENTS` only in auth env. Other services get `AUTH_JWKS_URL`, `AUTH_TOKEN_URL`, and their own client secret only.

## Next Steps
- Unblocks 05 (gateway uses `libs/auth-jwt` verify + `av` check + GatewayControl server guarded by `@ServiceOnly`), 06 (per-endpoint permissions, WS middleware), 08 (admin role screen over auth gRPC). <!-- Red Team: RT-2, RT-3, RT-5 -->
- Resolved: `email_verified` and `av` are accepted claim additions (`iss, aud, sub, sid, roles, email_verified, av, iat, exp`). <!-- Reconcile: X8 -->
- [CROSS-PHASE] No `/auth/me` compat fields (RT-13 reversed): no `isAdmin` alias here; phase 10 removes `wallet`/`subscription` from `/auth/me` outright. Phases 18/19 have no compat work. <!-- Updated: Validation Session 1 - no compat fields -->
- [CROSS-PHASE] admin-service `grant-admin`/`revoke-admin` stay DB-direct (no RoleChangeLog/InvalidateUser) until phase 08 replaces them with the auth RPC path. The Milestone A local-compose checkpoint requires 08; nothing reaches production before the final merge. <!-- Updated: Validation Session 1 - single production deploy -->
- [CROSS-PHASE] Phase 08 implements auth `SetUserStatus` (ban/unban; durable `authz_changed(reason:'ban')`, `InvalidateUser` from auth after commit). Admin-service calls it with `forwardUser(req)` and never calls `InvalidateUser`. Phase 10 does not touch ban. <!-- Reconcile: X1 -->
- [CROSS-PHASE] <!-- Red Team: RT-9 --> Phase 10 adds the `welcome:<userId>` idempotency key to the welcome tx (needs its `WalletTransaction.idempotencyKey` column) and calls `ensureWallet` from `Debit`; the ON CONFLICT provisioning, reapply consumer, lazy ensure, and reconcile CLI already exist from here.
- [CROSS-PHASE] Bootstrap CLI moved admin → auth here. Phase 10 no longer needs to cut that cross-DB write.
