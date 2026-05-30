# Security Audit Report — examio-be

**Audited by:** Claude Code (Debugger Agent)
**Date:** 2026-05-30
**Scope:** examio-be backend (auth, gateway, exam, finance, r2 services)
**Files reviewed:** 40+ files across services

---

## Finding 1 — CRITICAL: Hardcoded fallback secrets in CryptoService

| Field | Value |
|---|---|
| File | `libs/common/src/services/crypto.service.ts:27-29` |
| Severity | **Critical** |
| STRIDE | T (Tampering), I (Information Disclosure) |
| OWASP | A02 (Cryptographic Failures) |

**Description:**
`CryptoService` uses hardcoded fallback values when environment variables are unset:

```typescript
this.jwtSecret =
    process.env.QUIZ_JWT_SECRET || 'default-quiz-jwt-secret-32chars!';
const aesKeyString =
    process.env.QUIZ_AES_KEY || 'default-aes-256-key-32-chars!!!';
```

If `QUIZ_JWT_SECRET` or `QUIZ_AES_KEY` env vars are not set in production, the system falls back to known weak values. An attacker who discovers the fallback can:
- Forge valid quiz question tokens → access exam answers before submission
- Decrypt all quiz content encrypted with AES → access question banks

**Fix:** Throw an error at startup if the required secrets are missing; do not fall back silently:
```typescript
const jwtSecret = process.env.QUIZ_JWT_SECRET;
if (!jwtSecret) throw new Error('QUIZ_JWT_SECRET env var is required');
const aesKeyRaw = process.env.QUIZ_AES_KEY;
if (!aesKeyRaw) throw new Error('QUIZ_AES_KEY env var is required');
```

---

## Finding 2 — CRITICAL: FREE_MODE hardcoded to `true` in production code

| Field | Value |
|---|---|
| Files | `apps/exam-service/src/modules/finance-client/finance-client.service.ts:28`; `apps/finance-service/src/types/subscription.ts:6`; `apps/exam-service/src/modules/ai-chat/ai-chat.service.ts:602` |
| Severity | **Critical** |
| STRIDE | E (Elevation of Privilege) |
| OWASP | A07 (Authentication Failures) |

**Description:**
`FREE_MODE = true` is hardcoded in 3 places:

1. `FinanceClientService` — credit deduction is completely bypassed. Any user can generate unlimited quizzes/flashcards without paying.
2. `subscription.ts` — all users receive VIP-level benefits (999,999 credits/month, unlimited messages) regardless of actual subscription tier.
3. `AIChatService` — all subscription rate limits are bypassed.

The code comments say these are for development, but hardcoded boolean constants in service code are easy to deploy accidentally to production.

**Fix:** Make `FREE_MODE` an environment variable:
```typescript
const FREE_MODE = process.env.FREE_MODE === 'true';
// And add a startup warning in production
if (FREE_MODE && process.env.NODE_ENV === 'production') {
  console.error('FATAL: FREE_MODE is enabled in production!');
}
```

---

## Finding 3 — HIGH: Timing-safe API key comparison missing in webhook

| Field | Value |
|---|---|
| File | `apps/finance-service/src/modules/sepay/webhook.service.ts:48` |
| Severity | **High** |
| STRIDE | I (Information Disclosure) |
| OWASP | A07 (Authentication Failures) |

**Description:**
```typescript
if (apiKey !== this.webhookSecretKey) {
```
Uses strict equality (`!==`) for comparing the SePay webhook API key. This is vulnerable to **timing oracle attacks**: the comparison short-circuits on the first mismatched character, leaking key length/prefix via response timing. A network attacker can incrementally guess the API key character-by-character.

**Fix:** Use `crypto.timingSafeEqual`:
```typescript
import * as crypto from 'crypto';
const keyBuf = Buffer.from(apiKey, 'utf8');
const secretBuf = Buffer.from(this.webhookSecretKey, 'utf8');
if (keyBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(keyBuf, secretBuf)) {
  // ...
}
```

---

## Finding 4 — HIGH: Hardcoded production secrets in committed .env file

| Field | Value |
|---|---|
| File | `examio-be/.env`, `examio-be/apps/auth-service/.env`, `examio-be/apps/gateway-service/.env` |
| Severity | **High** |
| STRIDE | I (Information Disclosure) |
| OWASP | A02 (Cryptographic Failures) |

**Description:**
Actual secrets are present in `.env` files that are likely committed to the repository:
- `JWT_SECRET`, `REFRESH_TOKEN_SECRET`
- `GEMINI_API_KEYS`, `OPENAI_API_KEY`, `AI2_API_KEY`
- `RABBITMQ_PASS`, `REDIS_PASSWORD`
- `PAYMENT_SERVICE_SEPAY_KEY`, `PAYMENT_WEBHOOK_SECRET_KEY`
- `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`
- `R2_SECRET_ACCESS_KEY`

**Fix:** Add all `.env` files to `.gitignore`. Commit only `.env.example` with placeholder values. Use a secrets manager (Vault, AWS Secrets Manager, or similar) for production deployments.

---

## Finding 5 — HIGH: OAuth mobile redirect leaks tokens in URL query params

| Field | Value |
|---|---|
| File | `apps/auth-service/src/auth.controller.ts:459-467` |
| Severity | **High** |
| STRIDE | I (Information Disclosure) |
| OWASP | A01 (Broken Access Control) |

**Description:**
For mobile app OAuth callbacks, tokens are appended as URL query parameters:
```typescript
const url = new URL(appCallback);
if (token) url.searchParams.set('token', token);
if (refreshToken) url.searchParams.set('refreshToken', refreshToken);
if (sessionId) url.searchParams.set('sessionId', sessionId);
if (user?.id) url.searchParams.set('userId', user.id);
res.redirect(302, url.toString());
```

This leaks tokens via:
- Server access logs
- Browser history
- HTTP `Referer` header
- Shared URLs in app switching

**Fix:** Use a custom URL scheme with an opaque one-time code instead:
```typescript
// Generate a short-lived one-time code
const oneTimeCode = crypto.randomBytes(32).toString('hex');
// Store (code → tokens) mapping in Redis with 60-second TTL
// Redirect to app scheme: examio://auth/callback?code=oneTimeCode
```

---

## Finding 6 — HIGH: Weak random number generator for auth codes

| Field | Value |
|---|---|
| File | `libs/common/src/utils/generate-code.ts:1-9` |
| Severity | **High** |
| STRIDE | T (Tampering) |
| OWASP | A07 (Authentication Failures) |

**Description:**
```typescript
export function generateCode(length: number): string {
    const characters = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}
```

Uses `Math.random()` which is **not cryptographically secure**. 6-digit numeric codes generated by `Math.random()` can be predicted with enough observed outputs. This is used for:
- Account verification codes (10 min expiry)
- Password reset codes (10 min expiry)

**Fix:** Use Node.js `crypto.randomInt()`:
```typescript
import { randomInt } from 'crypto';
export function generateCode(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += randomInt(0, 10).toString();
    }
    return result;
}
```

---

## Finding 7 — HIGH: Refresh token rotation does not invalidate old token

| Field | Value |
|---|---|
| File | `apps/auth-service/src/auth.service.ts:678-681` |
| Severity | **High** |
| STRIDE | T (Tampering) |
| OWASP | A07 (Authentication Failures) |

**Description:**
```typescript
await this.userSessionRepository.rotateRefreshToken(
    session.sessionId,
    nextRefreshToken
);
```
The old refresh token is **not invalidated** when rotated. The `rotateRefreshToken` method only sets the new token — the old one remains valid in the database until `expiresAt` (30 days). An attacker with a stolen refresh token can use it for up to 30 days after a legitimate rotation.

**Fix:** Invalidate the old refresh token atomically:
```typescript
// Store old token for short window (5 min) to prevent race conditions
await this.redisService.set(`old_rt:${oldRefreshToken}`, '1', EXPIRED_TIME.FIVE_MINUTES);
await this.userSessionRepository.rotateRefreshToken(session.sessionId, nextRefreshToken);
```
And add a check in `findByRefreshToken` to reject tokens recently stored as "old".

---

## Finding 8 — MEDIUM: No rate limiting on authentication endpoints

| Field | Value |
|---|---|
| File | `apps/gateway-service/src/gateway.module.ts:50-55` |
| Severity | **Medium** |
| STRIDE | D (Denial of Service), T (Tampering) |
| OWASP | A05 (Security Misconfiguration) |

**Description:**
Global rate limit is 100 requests/minute per IP across all endpoints. Authentication endpoints (`/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/send-code-reset-password`) have no additional protection. This enables:
- **Credential stuffing** — trying leaked username/password pairs at scale
- **Brute force** — guessing passwords on targeted accounts
- **Resource exhaustion** — repeatedly triggering email sends

**Fix:** Apply stricter per-route throttling:
```typescript
ThrottlerModule.forRoot([
  { name: 'default', ttl: 60000, limit: 100 },
  { name: 'auth', ttl: 60000, limit: 10 },       // 10 login attempts/min
  { name: 'register', ttl: 3600000, limit: 5 }, // 5 registrations/hour
  { name: 'reset', ttl: 3600000, limit: 3 },    // 3 reset requests/hour
]),
```
Apply `@Throttle({ name: 'auth', limit: 10 })` on auth controller methods.

---

## Finding 9 — MEDIUM: OAuth open redirect via relative path bypass

| Field | Value |
|---|---|
| File | `apps/auth-service/src/auth.controller.ts:111-114` |
| Severity | **Medium** |
| STRIDE | I (Information Disclosure) |
| OWASP | A01 (Broken Access Control) |

**Description:**
```typescript
private resolveFrontendTarget(frontendUrl: string, redirectPath?: string) {
    const safeRedirect =
        redirectPath && redirectPath.startsWith('/') ? redirectPath : null;
    return `${frontendUrl}${safeRedirect || '/k'}`;
}
```
Any path starting with `/` is accepted as a valid redirect target. Combined with `parseOAuthState` parsing base64-encoded JSON from the OAuth state parameter, an attacker can control the `redirect` field. While the domain is locked to `FRONTEND_URL`, this still allows redirect to any internal path (e.g., `/admin`, `/settings`) which could be used in phishing by luring victims to a look-alike page at a known base domain.

**Fix:** Validate redirect paths against an allowlist:
```typescript
const ALLOWED_PATHS = ['/k', '/dashboard', '/profile'];
const safeRedirect = ALLOWED_PATHS.includes(redirectPath) ? redirectPath : null;
```

---

## Finding 10 — MEDIUM: CORS permissive on backend services

| Field | Value |
|---|---|
| Files | `apps/auth-service/src/main.ts:22-29`; `apps/exam-service/src/main.ts:17-24`; `apps/finance-service/src/main.ts:19-26` |
| Severity | **Medium** |
| STRIDE | I (Information Disclosure) |
| OWASP | A05 (Security Misconfiguration) |

**Description:**
Internal microservices (auth, exam, finance) configure CORS with `process.env.FRONTEND_URL`:
```typescript
app.enableCors({
    origin: process.env.FRONTEND_URL || [
        'http://localhost:5173',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
    ],
    credentials: true,
});
```
If `FRONTEND_URL` is misconfigured or a subdomain is compromised, the internal services become accessible from malicious origins. These services should not accept cross-origin requests directly — the gateway is the single entry point.

**Fix:** Disable CORS on all internal microservices. Only the gateway should handle CORS:
```typescript
app.enableCors({
    origin: false,  // Internal services — no CORS needed
});
```

---

## Finding 11 — MEDIUM: bcrypt cost factor below OWASP recommendation

| Field | Value |
|---|---|
| File | `libs/common/src/services/password.service.ts:7` |
| Severity | **Medium** |
| STRIDE | I (Information Disclosure) |
| OWASP | A02 (Cryptographic Failures) |

**Description:**
```typescript
const salt = await bcrypt.genSalt(10);  // cost = 10
```
OWASP and NIST recommend bcrypt cost factor of **at least 12** as of 2025. Cost 10 is computationally feasible for modern GPU-assisted attacks.

**Fix:** Increase to cost 12:
```typescript
const salt = await bcrypt.genSalt(12);
```

---

## Finding 12 — MEDIUM: No JWT secret minimum length validation

| Field | Value |
|---|---|
| File | `libs/common/src/auth/auth.module.ts:14-17` |
| Severity | **Medium** |
| STRIDE | T (Tampering), I (Information Disclosure) |
| OWASP | A02 (Cryptographic Failures) |

**Description:**
```typescript
JwtModule.register({
    secret: process.env.JWT_SECRET,
    signOptions: { expiresIn: '7d' },
}),
```
No validation that `JWT_SECRET` meets minimum entropy requirements. A short or weak secret could enable JWT forgery via brute force.

**Fix:** Validate at module initialization:
```typescript
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
}
```

---

## Finding 13 — MEDIUM: ReCAPTCHA verification is optional and skippable

| Field | Value |
|---|---|
| File | `apps/exam-service/src/modules/examattempt/examattempt.service.ts:50-56` |
| Severity | **Medium** |
| STRIDE | D (Denial of Service), T (Tampering) |
| OWASP | A05 (Security Misconfiguration) |

**Description:**
```typescript
if (dto.captchaToken) {
    await this.recaptchaService.verify(dto.captchaToken, 'fullscreen_exam');
}
```
ReCAPTCHA verification is conditional — if no token is provided, it is skipped entirely. An attacker can skip reCAPTCHA by simply omitting the token, defeating its purpose for bot prevention on exam start.

**Fix:** Require reCAPTCHA for exam attempts:
```typescript
if (!dto.captchaToken) {
    throw new BadRequestException('reCAPTCHA token is required');
}
await this.recaptchaService.verify(dto.captchaToken, 'fullscreen_exam');
```

---

## Finding 14 — MEDIUM: AI service URL defaults to localhost in production

| Field | Value |
|---|---|
| File | `apps/exam-service/src/modules/ai-chat/ai-chat.service.ts:30-31` |
| Severity | **Medium** |
| STRIDE | I (Information Disclosure), E (Elevation of Privilege) |
| OWASP | A10 (SSRF) |

**Description:**
```typescript
private readonly aiServiceUrl =
    process.env.AI_SERVICE_URL || 'http://localhost:8000/api';
```
If `AI_SERVICE_URL` is not set in production, AI chat requests will be sent to the local development server, potentially leaking user messages and returning incorrect responses.

**Fix:** Fail explicitly if not configured in non-dev environments:
```typescript
const url = process.env.AI_SERVICE_URL;
if (!url) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('AI_SERVICE_URL is required in production');
    }
    this.logger.warn('AI_SERVICE_URL not set, using localhost fallback');
}
this.aiServiceUrl = url || 'http://localhost:8000/api';
```

---

## Finding 15 — MEDIUM: Session validation middleware hits DB on every request

| Field | Value |
|---|---|
| File | `libs/common/src/middleware/session-validation.middleware.ts:50-58` |
| Severity | **Medium** |
| STRIDE | D (Denial of Service) |
| OWASP | A05 (Security Misconfiguration) |

**Description:**
```typescript
const session = await this.prisma.userSession.findUnique({
    where: { refreshToken },
    select: { isActive: true, expiresAt: true },
});
```
A database query is executed on **every authenticated request** to check session validity. At scale, this adds ~5-10ms latency per request and creates significant DB load.

**Fix:** Cache session status in Redis with short TTL:
```typescript
const cacheKey = `session:active:${refreshToken}`;
const cached = await this.redisService.get(cacheKey);
if (cached !== null) {
    if (cached === 'inactive') throw new UnauthorizedException(...);
    return next();
}
// DB query + cache with 60s TTL
await this.redisService.set(cacheKey, session.isActive ? 'active' : 'inactive', 60);
```

---

## Finding 16 — LOW: Soft payment amount validation allows underpayment

| Field | Value |
|---|---|
| File | `apps/finance-service/src/modules/sepay/webhook.service.ts:108-113` |
| Severity | **Low** |
| STRIDE | T (Tampering) |
| OWASP | A07 (Authentication Failures) |

**Description:**
```typescript
if (amountReceived < payment.amount * 0.95) {
    this.logger.warn(`Amount mismatch: expected ${payment.amount}, got ${amountReceived}`);
    // Vẫn xử lý nhưng ghi log
}
```
The payment webhook logs a warning but still processes the payment if the received amount is within 5% tolerance (presumably for bank fees). A malicious actor could exploit this by transferring slightly less than the required amount.

**Fix:** Require exact amount match for credits/subscription purchases, or implement a configurable tolerance threshold with logging and alerting:
```typescript
const tolerance = 0.02; // 2% for fees only
if (amountReceived < payment.amount * (1 - tolerance)) {
    this.logger.error(`Payment underpaid: ${paymentId}`);
    throw new BadRequestException('Payment amount insufficient');
}
```

---

## Finding 17 — LOW: Webhook returns success for invalid API key

| Field | Value |
|---|---|
| File | `apps/finance-service/src/modules/sepay/webhook.controller.ts:45-52` |
| Severity | **Low** |
| STRIDE | R (Repudiation) |
| OWASP | A09 (Security Logging Failures) |

**Description:**
```typescript
} catch (error) {
    this.logger.error(`Webhook processing failed: ${error.message}`);
    return { success: false, message: error.message };
}
```
The webhook returns `success: false` when processing fails, but the calling code (SePay) may not handle this properly. If SePay retries failed webhooks based on HTTP 200, failed processing could be retried indefinitely.

**Fix:** Return HTTP error status codes for failures rather than 200 with success=false body:
```typescript
throw new UnauthorizedException('Webhook processing failed');
```

---

## Finding 18 — INFO: Audit logging missing for security-relevant events

| Field | Value |
|---|---|
| Files | All services |
| Severity | **Info** |
| STRIDE | R (Repudiation) |
| OWASP | A09 (Logging Failures) |

**Description:**
Security-relevant events are logged with `console.log`/`console.error` but there is no structured audit log:
- Login attempts (success/failure)
- Password reset requests
- Account verification
- Payment events
- Admin actions
- Session creation/invalidation
- Role changes

**Fix:** Implement a structured audit log service:
```typescript
@Injectable()
export class AuditLogService {
    async log(event: AuditEvent) {
        await this.prisma.auditLog.create({ data: { ...event, ip, userAgent } });
    }
}
```
Events to log: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_CHANGED`, `PAYMENT_COMPLETED`, `SESSION_CREATED`, `SESSION_REVOKED`.

---

## Summary Table

| # | Severity | STRIDE | OWASP | File |
|---|---|---|---|---|
| 1 | **Critical** | T, I | A02 | `libs/common/src/services/crypto.service.ts:27-29` |
| 2 | **Critical** | E | A07 | `finance-client.service.ts:28`, `subscription.ts:6`, `ai-chat.service.ts:602` |
| 3 | **High** | I | A07 | `webhook.service.ts:48` |
| 4 | **High** | I | A02 | `.env` files (committed secrets) |
| 5 | **High** | I | A01 | `auth.controller.ts:459-467` |
| 6 | **High** | T | A07 | `generate-code.ts:1-9` |
| 7 | **High** | T | A07 | `auth.service.ts:678-681` |
| 8 | Medium | D, T | A05 | `gateway.module.ts:50-55` |
| 9 | Medium | I | A01 | `auth.controller.ts:111-114` |
| 10 | Medium | I | A05 | `main.ts` (auth/exam/finance) |
| 11 | Medium | I | A02 | `password.service.ts:7` |
| 12 | Medium | T, I | A02 | `auth.module.ts:14-17` |
| 13 | Medium | D, T | A05 | `examattempt.service.ts:50-56` |
| 14 | Medium | I, E | A10 | `ai-chat.service.ts:30-31` |
| 15 | Medium | D | A05 | `session-validation.middleware.ts:50-58` |
| 16 | Low | T | A07 | `webhook.service.ts:108-113` |
| 17 | Low | R | A09 | `webhook.controller.ts:45-52` |
| 18 | Info | R | A09 | All services |

---

## Unresolved Questions

1. **Recaptcha on auth endpoints**: Is `RecaptchaService` used on `/auth/register`, `/auth/login`, and `/auth/send-code-reset-password`? The code shows it only in `examattempt.service.ts`. If not, these endpoints are vulnerable to automated bot registration and credential stuffing.

2. **Password complexity**: `RegisterDto` only enforces `min(6)` length. Is there a plan to enforce stronger password policy (mixed case, numbers, special characters)?

3. **Concurrent refresh token use**: When a refresh token is used simultaneously from two devices, both requests may succeed before either rotation occurs. Is this race condition handled?

4. **Exam attempt answer exposure**: Does the non-secure `getExamAttemptForQuiz` endpoint return `answer` field? If so, students can read answers before submitting.

5. **SSRF in AI service URL**: The AI service URL is configured as an env var. If compromised (e.g., via CI/CD injection), could it be set to an internal service for data exfiltration?
