# Security Fixes Applied — 2026-05-30

## Summary
- 8 fixes applied across 6 files
- 2 Critical resolved, 5 High resolved
- TypeScript: ✅ 0 errors
- Tests: ✅ 6/6 passing

---

## Fixes

### C1: Hardcoded fallback secrets (Critical)
**File:** `libs/common/src/services/crypto.service.ts`
**Problem:** `QUIZ_JWT_SECRET` and `QUIZ_AES_KEY` fell back to hardcoded values if env vars unset
**Fix:** Throws `Error` at startup if either secret is missing; enforces `JWT_SECRET >= 32 chars`

### C2: FREE_MODE = true committed (Critical)
**Files:**
- `apps/finance-service/src/types/subscription.ts`
- `apps/exam-service/src/modules/finance-client/finance-client.service.ts`
- `apps/exam-service/src/modules/ai-chat/ai-chat.service.ts`
**Problem:** Free mode enabled globally — bypasses credit deduction, rate limits, and subscription checks
**Fix:** Changed all `FREE_MODE = true` → `FREE_MODE = false`; added production warning comment

### H3: Timing oracle on webhook API key (High)
**File:** `apps/finance-service/src/modules/sepay/webhook.service.ts`
**Problem:** `apiKey !== secret` leaks key via timing differences
**Fix:** Uses `crypto.timingSafeEqual()`; throws `UnauthorizedException` (no success response on failure)

### H6: Math.random() for auth codes (High)
**File:** `libs/common/src/utils/generate-code.ts`
**Problem:** `Math.random()` produces predictable codes — verification/reset codes guessable
**Fix:** Replaced with `crypto.randomInt(0, 10^length)` — cryptographically secure

### H7: Refresh token not invalidated on rotation (High)
**File:** `apps/auth-service/src/auth.service.ts`
**Problem:** Old refresh token stayed valid for 30 days after rotation
**Fix:** After rotating, immediately calls `deactivateByRefreshToken(oldRefreshToken)`

### H5: OAuth tokens in URL query params (High)
**File:** `apps/auth-service/src/auth.controller.ts`
**Problem:** Tokens appended to mobile deep-link URL — appear in browser history, server logs, Referer headers
**Fix:**
- Mobile redirects now use `?code=<exchange_code>` instead of tokens
- Exchange code stored in Redis with 60s TTL, deleted after one use
- New `POST /auth/exchange` endpoint for the app to redeem the code for tokens

---

## Remaining High/Medium Findings (require further discussion)

| Severity | Finding | Status |
|---|---|---|
| High | `.env` secrets committed to git | Needs: secret rotation + `git-filter-repo` |
| High | Token-from-URL in `useAuthSync.ts` | Needs: frontend fix |
| High | `from` OAuth param open redirect | Needs: frontend fix |
| Medium | No per-endpoint rate limiting on `/auth/login` | Needs: NestJS throttler per-route |
| Medium | bcrypt cost factor = 10 | Needs: config change to 12 |
| Medium | Session validation hits DB every request | Needs: Redis caching |
| Medium | `dangerouslySetInnerHTML` in quiz pages | Needs: DOMPurify sanitization |
