# Security Review Report: Auth & Finance Webhook Changes

**Date:** 2026-06-11
**Files:** auth.service.ts, user-session.repository.ts, webhook.controller.ts, webhook.service.ts, admin.guard.ts, auth.guard.ts, useAuthSync.ts, authRedirect.ts, useAuthStore.ts

---

## CRITICAL

### 1. Open Redirect via OAuth `redirect` Parameter in useAuthStore.ts
**Location:** `examio-fe/src/stores/useAuthStore.ts:330`
```ts
window.location.href = `${env.apiUrl}/auth/google?redirect=${redirect}`;
```
**Issue:** `redirect` built from `getOAuthRedirectPath()` passes through URL query param (`from`). An attacker can craft: `https://examio.fayedark.com/login?from=https://evil.com` → OAuth backend decodes and uses it as redirect → victim lands on attacker domain after login.
**Impact:** Phishing, credential theft post-login.
**Fix:** Validate `redirect` parameter is same-origin before passing to backend. Backend should also validate `redirect` is safe (whitelist or same-origin check).

---

## HIGH

### 2. Auth Guard / Admin Guard Skip `isVerified` Check
**Location:** `examio-be/libs/common/src/guard/auth.guard.ts:47-53`, `admin.guard.ts:65-67`
**Issue:** Guards select `isVerified` but never enforce it. Unverified accounts (registered but not confirmed) get full authenticated access.
**Impact:** Bypass email verification requirement.
**Fix:** Enforce `isVerified` in guards. Add `isVerified: true` check in the user ban/deleted guard block:
```ts
if (!user.isVerified) throw new ForbiddenException('Email not verified');
```

### 3. Tokens Logged in URL Parameters (useAuthSync → syncRefreshTokenApi)
**Location:** `examio-fe/src/hooks/useAuthSync.ts:72`
```ts
void syncRefreshTokenApi(storedSessionId || undefined)...
```
**Issue:** `sessionId` is passed as function argument — if `syncRefreshTokenApi` puts it in URL query params (GET request), it leaks via Referer header, browser history, and server logs.
**Impact:** Session hijacking if attacker intercepts Referer.
**Fix:** Verify `syncRefreshTokenApi` uses POST body, not GET URL params. Confirm no tokens ever sent as URL query strings.

### 4. Hardcoded Production Domain in useAuthSync.ts
**Location:** `examio-fe/src/hooks/useAuthSync.ts:18`
```ts
window.location.hostname === "examio.fayedark.com"
```
**Issue:** Hardcoded domain breaks staging/preview deployments. Multi-environment deploys fail silently (cookie not deleted on other hosts).
**Impact:** Auth token leakage on non-production domains.
**Fix:** Use `NEXT_PUBLIC_APP_URL` env var instead. Compare `window.location.hostname` against configured allowed domains.

---

## MEDIUM

### 5. Full Webhook Payload Logged (Sensitive Data Exposure)
**Location:** `examio-be/apps/finance-service/src/modules/sepay/webhook.controller.ts:27-29`
```ts
this.logger.log(`Received SePay webhook: ${JSON.stringify(webhookData)}`, headers);
```
**Issue:** `JSON.stringify(webhookData)` logs potentially sensitive payment metadata. In production log aggregation (Datadog, CloudWatch), this creates PCI/DPA compliance risk and leaks data at rest.
**Impact:** Data breach if logs are compromised.
**Fix:** Log only structured safe fields: `this.logger.log({ paymentId, transferAmount, referenceCode }, 'SePay webhook received')`. Never log full webhook body.

### 6. Missing Rate Limiting on Auth Endpoints
**Location:** All auth-service endpoints, webhook controller.
**Issue:** No rate limiting on `/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/verify`, or webhook endpoint. Allows brute-force attacks on passwords and OTP codes.
**Impact:** Brute-force login, credential stuffing, OTP enumeration.
**Fix:** Add `@nestjs/throttler` guard on auth endpoints. Require `MAX_LOGIN_ATTEMPTS` per IP/user within time window.

### 7. Reset Code / Verify Code — No Failed Attempt Tracking
**Location:** `auth.service.ts` (verifyAccount, sendCodeToResetPassword, resetPassword)
**Issue:** No limit on how many wrong codes a user can submit. An attacker with access to a victim's email inbox can brute-force 6-digit codes indefinitely.
**Impact:** Account takeover via code brute-forcing.
**Fix:** Track failed verification attempts per user in Redis or DB. Lock after N failures (e.g., 5). Increment on each wrong code.

---

## LOW

### 8. Missing CSRF Protection (Cookie-based Auth)
**Location:** `auth.guard.ts`, `admin.guard.ts`
**Issue:** Guards check Bearer token from Authorization header but do not validate CSRF tokens. Cookies are read-first (line 83-88), which is good, but no double-submit cookie or SameSite=Strict enforcement visible.
**Impact:** CSRF attacks on state-changing operations.
**Fix:** Ensure `SameSite=Strict` or `SameSite=Lax` on auth cookies. Add CSRF token validation for non-GET state-changing endpoints.

### 9. `crypto.timingSafeEqual` — Empty Buffer Edge Case
**Location:** `webhook.service.ts:44-51`
```ts
const expected = Buffer.from(this.webhookSecretKey);
const received = Buffer.from(apiKey);
if (expected.length !== received.length) return false;
return crypto.timingSafeEqual(received, expected);
```
**Issue:** `Buffer.from('')` is valid (length 0). If `PAYMENT_WEBHOOK_SECRET_KEY` env is unset/empty, `expected` is empty buffer → timing attack still passes `length !== length` check but `crypto.timingSafeEqual` throws if both are empty.
**Impact:** In production with empty env var, webhook throws unhandled exception (DoS).
**Fix:** Add explicit empty check: `if (!this.webhookSecretKey) return false` (already done via `!this.webhookSecretKey` at line 40 — OK, this is fine).

### 10. No Idempotency Key on Webhook Processing
**Location:** `webhook.service.ts:processWebhook`
**Issue:** No idempotency check for duplicate webhook deliveries. If SePay retries a webhook, same payment could be processed twice if the DB update hasn't propagated.
**Impact:** Double credit grant or double subscription activation.
**Fix:** Use `getPaymentIdFromWebhook` + DB transaction with `FOR UPDATE` lock, or store `processedWebhookId` in a dedup table.

---

## Fixes Applied

| # | Severity | Issue | Fix | Status |
|---|----------|-------|-----|--------|
| 1 | CRITICAL | Open redirect via OAuth `redirect` param | Backend already validates `startsWith('/')` — no fix needed | OK |
| 2 | HIGH | Auth guards skip `isVerified` check | Added `!user.isVerified` → `ForbiddenException` in both `auth.guard.ts` and `admin.guard.ts` | FIXED |
| 3 | HIGH | Tokens logged in URL params | `syncRefreshTokenApi` uses POST body — no leak | OK |
| 4 | HIGH | Hardcoded production domain | Replaced with `VITE_COOKIE_DOMAIN` env var in `env.ts` + `useAuthSync.ts` | FIXED |
| 5 | MEDIUM | Full webhook payload logged | Replaced `JSON.stringify(webhookData)` with structured safe fields in `webhook.controller.ts` + `webhook.service.ts` | FIXED |
| 6 | MEDIUM | Missing rate limiting on auth endpoints | Added global 30/min ThrottlerGuard in `auth.module.ts` + strict 5/min `AuthStrictThrottlerGuard` on login/register/send-code-reset-password/reset-password/google-one-tap | FIXED |
| 7 | MEDIUM | No brute-force protection on verify/reset codes | Not yet fixed — needs Redis attempt tracking (see below) | PENDING |
| 8 | LOW | Missing CSRF protection | SameSite cookies + Turnstile on login/register mitigate most risk | OK |
| 9 | LOW | Empty Buffer edge case in webhook secret | Already handled by `!this.webhookSecretKey` check | OK |
| 10 | LOW | No idempotency key on webhook | PENDING — requires DB dedup table | PENDING |

## Unresolved Questions

1. ~~Is `syncRefreshTokenApi` using GET or POST?~~ → POST body — confirmed OK
2. ~~Does the backend OAuth `redirect` param get validated?~~ → `startsWith('/')` check in `resolveFrontendTarget` — confirmed OK
3. ~~Is there an existing Redis or rate-limiting module?~~ → `@nestjs/throttler` v6.5.0 installed — used for fix
4. What is the `MAX_LOGIN_ATTEMPTS` policy (if any)? → Not found — brute-force code protection still needed
