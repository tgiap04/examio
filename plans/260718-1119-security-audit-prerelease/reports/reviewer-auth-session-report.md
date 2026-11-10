# Security Audit — Auth & Session Management (Pre-release)

Scope: `kmaedu-be/apps/auth-service/`, `libs/common/{guard,auth,services,utils}`, `libs/database` (schema), gateway auth proxy, FE OAuth-callback consumer. Read-only review.

## Overall Assessment

The auth-service shows clear evidence of prior hardening passes — constant-time code comparison, user-enumeration-safe responses, refresh-token rotation with grace window, session invalidation on password change/reset, Turnstile-gated brute force endpoints, open-redirect allowlisting for OAuth app callbacks, and gRPC algorithm pinning. Password hashing and JWT verification are sound. However, one **critical** defect was found in the gateway's OAuth callback handler that reintroduces the exact token-in-URL leak the auth-service code was explicitly written to avoid, plus a few high/medium issues around refresh-token-at-rest, stale duplicate guard files, and cache hygiene.

---

## Critical

### C1. Gateway OAuth callback leaks live access/refresh tokens via URL query string

**File:** `kmaedu-be/apps/gateway-service/src/controllers/auth-proxy.controller.ts`, `handleOAuthCallback()` (lines ~369-417), invoked from `googleCallback()` (line ~171-183).

Flow: browser hits gateway `GET /api/v1/auth/google/callback` → `AuthProxyController.googleCallback` → `ProxyService.forwardWithRedirect('auth', ...)` (registered in `gateway.module.ts:80`, this is a live route, not dead code) → auth-service's own callback (`auth.controller.ts:googleAuthRedirect`) already does the *secure* thing: sets `token`/`session_id`/`refreshToken` as httpOnly cookies and 302-redirects to a path-only frontend URL (or, for allowlisted mobile schemes, a one-time Redis exchange code — see the "prevents tokens from appearing in URL" comment at `auth.controller.ts:548-556`).

The gateway's `handleOAuthCallback` then:
1. Correctly relays the `Set-Cookie` headers from the auth-service response (httpOnly cookies land on the browser) — good.
2. **Also** re-extracts the same `token` / `refreshToken` / `session_id` values straight out of those `Set-Cookie` headers (`extractCookieValue(setCookieHeaders, 'token')`, etc.) and appends them as **plaintext query parameters** on the final `res.redirect(redirectUrl.toString())` sent to the browser (lines 403-412).

Impact: the 30-day-lived `refreshToken` (full account-takeover credential) and access token end up in:
- Web/CDN/reverse-proxy access logs (full request line is logged by most stacks by default)
- Browser navigation history
- Any HAR file / screen-share / support ticket showing the address bar
- `Referer` header of any subresource the landing page fetches before JS runs (mitigated somewhat by modern browsers' `strict-origin-when-cross-origin` default, but not for same-origin resources or older browsers/webviews)

This directly defeats the security work already done in `auth.controller.ts` — the httpOnly-cookie + exchange-code design is redundant once this code path also puts the same secrets in the URL.

**Confirmed as a live, exploited path**: the frontend has already had to add a defensive patch for it — `kmaedu-fe/src/hooks/useAuthSync.ts:7-37` strips `token`/`refreshToken`/`sessionId` from the URL client-side with a comment: *"The gateway may forward auth tokens in the query string alongside the httpOnly cookies... strip them client-side."* This is a band-aid (via `history.replaceState`, presumably) applied **after** the tokens have already reached the browser/log layer — it does not prevent the leak, only shortens its lifetime in the visible address bar/browser history.

**Fix:** Remove the token/refreshToken/sessionId query-param injection in `handleOAuthCallback` entirely. The `Set-Cookie` relay already delivers the credentials securely; the redirect should carry no more than a path (mirroring what `auth-service`'s own `resolveFrontendTarget` already does). If a non-cookie transport is genuinely needed for some client, route it through the existing Redis one-time exchange-code mechanism instead of raw tokens in the URL.

---

## High

### H1. Refresh tokens stored in plaintext in the database

**Files:** `libs/database/src/schema.prisma:768-796` (`UserSession.refreshToken`, `previousRefreshToken`), `apps/auth-service/src/devices/repositories/user-session.repository.ts`.

Refresh tokens (30-day validity, `sessionTtlMs` in `auth.service.ts:43`) are stored and looked up as raw strings (`findByRefreshToken`, unique index on the column). Unlike the verification/reset codes (which are short-lived and additionally protected by constant-time comparison against guessing), a refresh token is a long-lived bearer secret — if the `user_sessions` table leaks (DB backup exposure, SQLi in an unrelated service, insider access, misconfigured replica), every active session becomes trivially replayable indefinitely until expiry/rotation.

**Recommendation:** store only a hash (e.g. SHA-256) of the refresh token, compare by hashing the incoming value before the lookup (a `findFirst`/`findUnique` on the hash still supports the O(1) index lookup, no timing-safe compare needed since it's not a guessing-prone short code). This is the same pattern already used correctly for verification/reset codes' *comparison* (though those are stored plaintext too, since they're short-lived, low-entropy, single-use — a materially different risk profile than a 30-day bearer token).

### H2. Stale, insecure duplicate of `AuthGuard`/`OptionalAuthGuard`/`GoogleAuthGuard` tracked in git

**Files:** `libs/common/guard/auth.guard.ts`, `libs/common/guard/optional-auth.guard.ts`, `libs/common/guard/google-auth.guard.ts`, and sibling `libs/common/services/*.ts` (top-level, **not** under `libs/common/src/`).

These are git-tracked (`git log` shows a 2026-05-13 commit), import from a nonexistent `'src/prisma/prisma.service'` path (leftover from a pre-monorepo layout), and are **not** reachable via the `@kmaedu/common` alias (`tsconfig.json` paths map `@kmaedu/common` → `libs/common/src` only) — confirmed no relative imports reference them either. So today they are dead weight, not a live vuln. But the stale `auth.guard.ts` copy is missing the `isBanned`/`deletedAt`/`isVerified` checks present in the real `libs/common/src/guard/auth.guard.ts` — i.e. it's a materially less-secure version of the guard sitting in the tree under a name identical to the real one. Risk: a future refactor, IDE auto-import, or a relative-path import typo silently wires in the insecure version with no compile error (since it's independently valid TypeScript). Given this is pre-release, recommend deleting the stale top-level `guard/` and `services/` (and any other orphaned top-level dirs mirroring `src/`) rather than leaving them as a landmine.

---

## Medium

### M1. `JWT_SECRET` has no startup fail-fast / strength validation

**Files:** `apps/auth-service/src/auth.module.ts:35-41`, `libs/common/src/guard/auth.guard.ts:29-31`, `libs/common/src/guard/admin.guard.ts:39-41`, `libs/common/src/guard/optional-auth.guard.ts:28-30`.

`JwtModule.register({ secret: process.env.JWT_SECRET, ... })` and the guards' `verifyAsync(token, { secret: process.env.JWT_SECRET })` will silently proceed with `secret: undefined` if the env var is unset — signing would throw at first use, but there's no boot-time check. Contrast with `CryptoService` (`libs/common/src/services/crypto.service.ts:29-43`) and `AuthGrpcController` (`grpc/auth.grpc.controller.ts:55-61`), both of which fail fast with a clear error if their secret is missing/too short. `.env.example` documents "min 32 chars" for `JWT_SECRET` but nothing enforces it. Recommend adding the same presence + length guard used for `QUIZ_JWT_SECRET` to the main JWT secret, ideally at app bootstrap (`main.ts`) so a misconfigured production deploy fails to start rather than silently issuing/accepting weak or unverifiable tokens.

### M2. `AuthGuard`/`OptionalAuthGuard`/`AdminGuard` don't pin JWT algorithm on verify

**Files:** `libs/common/src/guard/auth.guard.ts:29-31`, `optional-auth.guard.ts:28-30`, `admin.guard.ts:39-41`.

`jwtService.verifyAsync(token, { secret })` doesn't pass `algorithms: ['HS256']`, unlike `AuthGrpcController` (`grpc/auth.grpc.controller.ts:87-89`), which explicitly pins it. With only a symmetric secret configured (no public key ever handed to the verifier), classic RS/HS algorithm-confusion isn't reachable here — but pinning is a cheap, standard defense-in-depth measure and keeps the three verification call sites consistent with the one that already does it correctly.

### M3. Full `User` records (including bcrypt hash) cached in Redis

**File:** `apps/auth-service/src/repositories/user.repository.ts` (`findByEmail`, `findByUsername`, `findByIdWithRelations` — `redis.set(cacheKey, user, cacheTTL)`).

The cached value is the raw Prisma `User` row, i.e. the bcrypt password hash rides into Redis for up to 5 minutes (`EXPIRED_TIME.FIVE_MINUTES`) on every cache-populating lookup (login, registration uniqueness checks, `/auth/me`, `/profile`). `RedisService` (`libs/redis/src/redis.service.ts`) does support a password, but `.env.example` ships `REDIS_PASSWORD=` blank, and there's no TLS configured for the ioredis client. Not exploitable without separate Redis access, but it's an unnecessary secondary store of credential material — recommend caching a `sanitizeUser()`-shaped projection instead of the raw row, or at minimum excluding `password`.

### M4. Cache invalidation on email/username change uses the *new* value, not the old

**File:** `apps/auth-service/src/repositories/user.repository.ts:163-179` (`update()`).

`update()` invalidates `email:{result.email}` / `username:{result.username}` cache keys using the **post-update** email/username. If a user ever changes their email (no endpoint currently does this for `email` specifically via `updateProfile`, but the repository method is generic and reused — e.g. `verifyAccount`/password changes call `update()` too), a stale cache entry keyed on the *old* email/username would survive up to 5 minutes, during which `emailExists()`/`findByCredential()` for that old value would still resolve from cache. Low practical impact today since no live endpoint changes email, but worth tightening (invalidate both old and new keys) before an email-change feature is exposed.

---

## Low / Suggestions

- **Bcrypt cost factor 10** (`libs/common/src/services/password.service.ts:7`, `bcrypt.genSalt(10)`) — acceptable but on the low end for a 2026 launch; consider 12 if login-latency budget allows.
- **Password policy**: register requires 8-100 chars, no complexity beyond length (`dto/register.dto.ts`); login only requires 6+ (`dto/login.dto.ts` — shape validation only, doesn't affect actual auth). Length-only is consistent with current NIST guidance; no action required, just flagging the login/register minimum mismatch as a minor inconsistency.
- **`AuthGrpcController.CheckPermission`** (`grpc/auth.grpc.controller.ts:213-270`) intentionally denies all non-admin requests by design (explicit comment references a prior fail-open bug fix) — correct as implemented, calling out as a positive.
- **Internal gRPC endpoints** (`ValidateToken`, `GetUserInfo`, `CheckPermission`) have no service-to-service auth (mTLS/shared secret) of their own — they rely entirely on network segmentation between services. Standard for an internal mesh, but worth confirming the deploy topology (`deploy/docker-compose.yml`) actually firewalls the gRPC ports from anything outside the private network before public launch.
- **`main.ts`** doesn't set `helmet()` or an explicit body-size limit on the auth-service HTTP app; confirm the gateway (the actual public entry point) applies these, since auth-service itself is presumably not directly internet-facing.

---

## Positive Observations

- Constant-time comparison (`crypto.timingSafeEqual`) for verification/reset/change codes (`auth.service.ts:60-67`).
- User-enumeration-safe responses for login and `sendCodeToResetPassword` (generic error/generic response regardless of account existence).
- Refresh-token rotation with a bounded grace window to avoid multi-tab self-logout races (`user-session.repository.ts:85-139`), with correct one-time-use semantics on conflicting rotation attempts.
- All sessions invalidated on password reset/change (`auth.service.ts:429-431, 540-542`) — stops a hijacked session surviving credential rotation.
- OAuth app-redirect allowlist (`isAllowedAppRedirect`) closes an open-redirect → account-takeover vector for the mobile exchange-code flow.
- `trust proxy` explicitly scoped to 1 hop plus `getTracker()` using `req.ips` (not raw `x-forwarded-for`) in the strict throttler — rate limiting can't be bypassed by IP header spoofing.
- gRPC token validation pins `algorithms: ['HS256']` and checks `isBanned`/`deletedAt` — good defense in depth server-to-server.
- Ownership checks present on device logout (`devices.service.ts:54-58`) — no IDOR.
- Turnstile is mandatory (not just optional) in production for register/login (`auth.controller.ts:189-194, 258-263`) — a missing token is rejected rather than silently skipped.

---

## Recommended Actions (priority order)

1. **[Critical]** Strip token/refreshToken/sessionId query-param injection from `gateway-service/.../auth-proxy.controller.ts::handleOAuthCallback`. Rely solely on the already-correct `Set-Cookie` relay.
2. **[High]** Hash refresh tokens at rest (`UserSession.refreshToken`/`previousRefreshToken`); update lookup to hash-then-query.
3. **[High]** Delete the stale, insecure duplicate guard/service files under `libs/common/guard/` and `libs/common/services/` (top-level, outside `src/`) to remove the landmine.
4. **[Medium]** Add boot-time presence/length validation for `JWT_SECRET` (mirror `CryptoService`'s pattern for `QUIZ_JWT_SECRET`).
5. **[Medium]** Pin `algorithms: ['HS256']` on `verifyAsync` calls in `AuthGuard`/`OptionalAuthGuard`/`AdminGuard`.
6. **[Medium]** Cache a sanitized user projection instead of the raw Prisma row (drop `password` before it hits Redis).
7. **[Medium]** Fix `UserRepository.update()` cache invalidation to also clear stale old-email/old-username keys.
8. **[Low]** Consider bumping bcrypt cost factor to 12 before launch if latency budget allows.

## Unresolved Questions

- Is `auth-service` ever reachable directly (bypassing the gateway) in the production topology? If so, `main.ts` should gain `helmet()` + body-size limits rather than relying on the gateway for those headers.
- Is there a planned "change email" feature? If so, M4 (cache invalidation) should be fixed before it ships, not after.
- Confirm `REDIS_PASSWORD` is actually set (not blank) and Redis is network-isolated in the production compose/deploy config — `.env.example` ships it blank.
