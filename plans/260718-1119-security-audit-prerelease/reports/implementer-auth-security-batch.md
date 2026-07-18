# Auth security fix batch — implementation report

Work context: examio-be (apps/auth-service/**, libs/common/**)

## Files changed

- `apps/auth-service/src/auth.service.ts` (+31/-9) — added `signAccessToken()`, reordered session creation before token signing in `login`, `register`, `handleOAuthLogin`, `refreshAccessToken`.
- `apps/auth-service/src/auth.controller.ts` (+44/-13) — OAuth nonce verification in `googleAuthRedirect`, `parseOAuthState` extended, `ensureOauthSession` re-signs token with sessionId, throttle guards added on `send-code-change-password` / `change-password`.
- `apps/auth-service/src/main.ts` (+9) — boot-time `JWT_SECRET` assertion.
- `libs/common/src/guard/auth.guard.ts` (+28/-4) — session-active check via `sessionId` claim.
- `libs/common/src/guard/admin.guard.ts` (+18/-1) — same session-active check.
- `libs/common/src/guard/google-auth.guard.ts` (+64/-6) — nonce generation/embedding into OAuth `state`.
- Deleted (dead, unreferenced duplicates confirmed via grep before removal):
  `libs/common/guard/{auth.guard.ts,google-auth.guard.ts,optional-auth.guard.ts}`,
  `libs/common/services/{crypto.service.ts,generate-id.service.ts,image-preprocessing.service.ts,mail.service.ts,password.service.ts,pdf.service.ts}`.

## Per-fix summary

**H1 — session revocation now enforced at the guard.** JWT payload now carries `sessionId` (added via new `AuthService.signAccessToken(userId, sessionId?)`), set on session creation in `login`/`register`/OAuth/refresh. `AuthGuard` and `AdminGuard` look up `UserSession.isActive` by `sessionId` (indexed unique field) and reject with 401 if the session is gone/inactive. Applies to both cookie and Bearer clients (guard reads either). Tokens signed before this change (no `sessionId` claim) fall through unchecked and simply expire naturally — `ACCESS_TOKEN_EXPIRATION` defaults to 15m, so the exposure window is bounded, not indefinite. The Google-redirect flow signs its token before a session exists (strategy has no device info), so `ensureOauthSession` now re-signs the token once the session is created, ensuring that path also carries `sessionId`.

**M1 — OAuth CSRF nonce.** `GoogleAuthGuard` mints a random nonce only on the initiation request (`/auth/google`, distinguished via `context.getHandler().name`), stores it in an httpOnly cookie (`oauth_nonce`, 10 min TTL, same pattern as the existing `oauth_redirect` cookie), and embeds it into the `state` payload sent to Google. `googleAuthRedirect` verifies the returned state's nonce equals the cookie before calling `ensureOauthSession` (i.e., before any session/cookie is created for the browser) — rejects with 401 otherwise. Redirect-allowlist behavior untouched.

**M2 — throttle on change-password endpoints.** Added `AuthStrictThrottlerGuard` + `@Throttle({ default: { limit: 5, ttl: 60000 } })` to both `send-code-change-password` and `change-password`, matching `reset-password`/`verify-account`.

**H7 — dead duplicate dirs removed.** Re-confirmed via grep (`common/guard`, `common/services`, non-src paths) that nothing imports them, then `rm`'d both directories. `libs/common/src/**` untouched.

**H8-auth — JWT_SECRET boot assertion.** `main.ts` throws before `app.listen` if `JWT_SECRET` is missing or `< 32` chars.

**H5 — hash refresh tokens at rest: BLOCKED, no files touched.**
Traced every read/write of `refreshToken`/`previousRefreshToken`:
- `UserSessionRepository.create`, `.rotateRefreshToken` (dead/unused), `.deactivateByRefreshToken` (dead/unused), `SessionValidationMiddleware` — all safe to hash: they either write, or compare a **client-supplied candidate** against a stored hash.
- `UserSessionRepository.findByRefreshToken` — also safe: client supplies the candidate, we'd hash-and-compare.
- `UserSessionRepository.rotateRefreshTokenIfCurrent`, case 2 (grace-window branch) — **not safe**: when a second tab's request arrives holding the just-rotated-away token, the method must hand back the **current, server-generated** plaintext refresh token (`session.refreshToken`) so that tab converges onto it. With a one-way hash, that plaintext no longer exists anywhere to return.
- `AuthService.syncRefreshTokenBySession` (used by `POST /auth/sync-refresh-token`) — same root problem: it reads `session.refreshToken` and returns it in plaintext to a caller who authenticated via access token + sessionId, not by presenting the refresh token itself.

Both of these depend on retrieving a **previously server-generated** plaintext token from storage, not on comparing a client-presented value — which is exactly what a one-way hash (sha256, as specified) cannot support. The only correctness-preserving fixes I could see (a reversible-encryption field instead of a hash, or a short-TTL plaintext cache in Redis alongside the hashed DB field) are materially bigger architectural changes than "hash a Prisma field," and I can't validate either against the live multi-tab refresh/rotation behavior in this batch. Per the instruction to prioritize refresh-flow correctness over completion, I left `refreshToken`/`previousRefreshToken` as plaintext and did not modify `user-session.repository.ts`, `auth.service.ts`'s refresh/sync methods (beyond the H1 `signAccessToken` reorder, which doesn't touch these fields), or the middleware.

**Recommendation for a follow-up:** either (a) accept a scoped behavior change — have `syncRefreshTokenBySession` and the grace-window case-2 branch always issue a *fresh* rotation instead of recovering the old current value (safe with hashing, but increases rotation churn and needs multi-tab testing), or (b) keep tokens hashed in Postgres for durability but cache the plaintext mapping (old→new) in Redis with a TTL equal to the grace window, falling back to forced re-login only on a Redis miss.

## Verification

- `cd examio-be && npx nest build auth-service` → exit 0 (webpack compiled successfully).
- Also built `gateway-service`, `exam-service`, `finance-service` (all consume the shared `libs/common` guards I edited) → all exit 0, confirming the guard changes and directory deletion didn't break other consumers.
- `yarn test apps/auth-service/src/auth.service.spec.ts apps/auth-service/src/auth-service.controller.spec.ts` → 3 failing (refresh-token flow tests) / 3 passing. Confirmed via `git stash` that the same 3 tests fail identically on the pre-existing `main` working tree (mock `GenerateIdService` doesn't stub `generateSecureToken`) — pre-existing, unrelated to this batch, not touched.

**Status:** DONE_WITH_CONCERNS
**Summary:** H1, M1, M2, H7, H8-auth implemented and build-verified across auth-service and all libs/common consumers; H5 is BLOCKED (documented above) because hashing refresh tokens at rest breaks two code paths that must return a server-generated plaintext token to a caller who didn't present it, and no file was modified for that item.
**Concerns/Blockers:** H5 blocked as detailed above — needs an explicit decision (accept forced-rotation semantics vs. add a Redis plaintext cache) before it can be implemented safely.
