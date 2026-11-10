# KMAEdu — Pre-Release Security Audit (Consolidated)

> **FIX STATUS (2026-07-18):** Fix batch applied (user excluded C6). All affected services + FE build/typecheck clean, 0 lint errors. See `## Fix Log` at the bottom for per-item status. Not committed.


**Date:** 2026-07-18
**Scope:** `kmaedu-be` (8 NestJS services + Python AI service) + `kmaedu-fe` (React 19)
**Method:** 6 parallel read-only reviewer agents (auth/session, gateway/API surface, IDOR/money/R2, Python AI, frontend, secrets/infra). No files modified.
**Verdict:** **NOT ready for public release as-is.** 6 CRITICAL and 9 HIGH findings, several of which are direct revenue/data-integrity/account-takeover risks. All are fixable; none require architectural rewrites except the quiz-encryption key (C5).

---

## CRITICAL (release blockers)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| C1 | OAuth callback appends `token`/`refreshToken`/`session_id` as **plaintext query params** on the browser redirect (in addition to correct Set-Cookie) | `gateway-service/.../auth-proxy.controller.ts` `handleOAuthCallback` (~L403-412) | 30-day refresh token → account takeover, written to access logs + browser history + Referer on every OAuth login. FE already ships a client-side strip patch (`useAuthSync.ts`) — too late to stop server-log exposure. |
| C2 | `const FREE_MODE = true` hardcoded → **all** AI credit deduction short-circuits | `exam-service/modules/finance-client/finance-client.service.ts:28` | Any user runs unlimited AI generation/OCR/upload for free; refunds still work → system only ever pays out. Git shows it was `false` then flipped back "temporarily". |
| C3 | Exam attempt creation ignores `assessType`/`whitelist`/`accessCode` (IDOR) | `exam-service/modules/examattempt/examattempt.service.ts` `startExamAttempt` (L49-185), `createExamAttempt` (L1105-1192) | Any authenticated user who knows/guesses a private `examSessionId` takes the exam, gets graded — bypasses whitelist + 6-digit access code entirely. `checkAccess()` exists but isn't called here. |
| C4 | Live production secrets in plaintext `.env` files on disk (11 Gemini keys, R2 key pair, SePay key+webhook secret, Google/GitHub OAuth secrets, Gmail app password, CloudAMQP creds, Postgres/Redis passwords, JWT/AES secrets, admin default password) | 10 `.env` files across BE/FE (NOT committed — git history clean) | Any backup/tool/agent/CI with disk access exfiltrates everything in one pass. **Rotate all before release** regardless of git cleanliness. |
| C5 | `QUIZ_AES_KEY` (encrypts exam question/answer content at rest) is inlined into the public FE JS bundle via `VITE_QUIZ_AES_KEY` | `kmaedu-fe/Dockerfile:18-24`, `kmaedu-fe/src/lib/crypto.ts:8` | Any student greps `dist/assets/*.js` for the key → decrypts all exam content pre-submit → defeats anti-cheat. Team already flagged it "temporary stopgap." Needs server-side decryption. |
| C6 | Postgres port `5411:5432` published on host (`0.0.0.0`) in production compose + weak DB password (`kmaedu_devt@28112004`) | `kmaedu-be/deploy/docker-compose.yml:374-375`, `deploy/.env:20` | DB directly reachable from internet unless VPS firewall is airtight, bypassing all app-layer auth. Bind to `127.0.0.1` or drop the mapping; rotate password. |

---

## HIGH

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| H1 | Session/access-token revocation is **dead code** — `SessionValidationMiddleware` has zero consumers; guards only check JWT signature + banned/deleted/verified, never `UserSession.isActive` | `libs/common/src/middleware/session-validation.middleware.ts` (unused); `libs/common/src/guard/*.ts` | Stolen access token keeps working after logout / "logout other devices" / password reset, until JWT expiry (~15m). Code comments falsely promise instant revocation. Wire the middleware or add a session/version claim check into `AuthGuard`. |
| H2 | No dedicated rate limit on expensive AI/OCR/upload endpoints (only global 100/min); non-streaming `sendMessage` skips `checkLimits` entirely | `gateway-service/.../ai-study-proxy.controller.ts`; `exam-service/modules/ai-chat/ai-chat.service.ts:165` (vs `streamMessage` L283) | Authenticated user scripts calls to burn LLM/OCR budget (cost-DoS) or bypass per-tier chat limits. |
| H3 | AI IDOR: `generate_quiz`/`generate_flashcards` never compare `file_info.user_id` (real owner) to `request.user_id` | `ai-service/.../generation_service.py:522-528, 700-706` | Generate study content from another user's private document; result persisted to attacker's history. Ownership data is on hand but unused. |
| H4 | SSRF hardening has DNS-rebinding TOCTOU (validate resolves once, httpx re-resolves at connect) + allowlist silently disabled when `R2_ALLOWED_HOSTS`/`R2_PUBLIC_URL` unset (not in `.env.example`) | `ai-service/.../ocr_service.py:54-119, 324-346` | If a download URL is ever attacker-influenceable, fetch internal/metadata endpoints. Pin to validated IP; make allowlist fail-closed. |
| H5 | Refresh tokens stored **plaintext** in Postgres | `libs/database/src/schema.prisma:768-796` (`UserSession.refreshToken`/`previousRefreshToken`) | DB read (via C6 or a dump) yields usable long-lived refresh tokens. Hash at rest. |
| H6 | Weak shared `JWT_SECRET=kmaedu_secret_key` (18 chars, guessable) in 4 service `.env` files pointing at live host `sv.fayedark.com` | `apps/{auth,gateway,admin,finance}-service/.env` | Guess/brute the secret → forge valid JWT as any user against a real backend. Use distinct high-entropy secret per env. |
| H7 | Dead duplicate `libs/common/guard/*.ts` + `libs/common/services/*.ts` (no `src/`) — weaker auth checks and hardcoded default secrets (`'default-aes-256-key-32-chars!!!'`) | `libs/common/guard/`, `libs/common/services/crypto.service.ts:26-29` | Unreachable today (tsconfig maps `@kmaedu/common`→`src`), but a stray import resurrects a known-key encryptor or a guard missing ban/verify checks. Delete them. |
| H8 | No boot-time validation of `JWT_SECRET` in gateway/exam/finance/admin | `main.ts` of those services; guards read `process.env.JWT_SECRET` with no assertion | Fail-closed (not a bypass) but a missing env turns into a silent "everyone is 401" outage. Add fail-fast assertion (auth grpc controller already does). |
| H9 | (grouped w/ H2) AI service has no internal rate limiting; `rate_limit.py` model is fully unwired; no `max_length` on chat `query`/`system_prompt`/history | `ai-service/.../api/chat.py:26-46`, `models/rate_limit.py` | Internal-token holder / buggy caller sends unbounded payloads → cost explosion / OOM. |

---

## MEDIUM

- **M1** OAuth missing server-generated `state` (CSRF nonce) → login-CSRF / session-fixation into attacker's account. `auth-service/auth.controller.ts` + `google-auth.guard.ts`.
- **M2** `change-password` / `send-code-change-password` missing `AuthStrictThrottlerGuard` (fall back to 30/min instead of 5/min) — brute-force `currentPassword` window. `auth.controller.ts:436-470`.
- **M3** Gateway `AuthGuard` inconsistent at edge — many proxy controllers rely only on `@ApiBearerAuth` (Swagger doc, no runtime effect). Safe today because downstream re-checks, but no defense-in-depth. Make it structural or document the delegation.
- **M4** Session cookie **values** logged plaintext at debug. `gateway-service/services/proxy.service.ts:60-64`.
- **M5** Log pipeline `redacted` field is a verbatim copy of the line (no redaction); streamed to admin live-log viewer. `gateway-service/common/log-publisher.service.ts:29-34`.
- **M6** Client-controlled `systemPrompt` override, no validation/length cap, fully replaces tutor persona/safety framing. `ai-service/api/chat.py:40-44` → `simple_chat_agent.py:244-252`. Poisonable if `Subject.systemPrompt` is writable by lower-trust actors.
- **M7** Indirect prompt injection: retrieved OCR/document text spliced into prompts with no untrusted-data delimiter. `simple_chat_agent.py:307-377`, `entity_extraction_service.py`.
- **M8** Proprietary `Subject.systemPrompt` leaks via **public** `GET /subjects/:id` + `/subjects/slug/:slug` (no `select`, returns all scalars). `subject.repository.ts:61,81`.
- **M9** Private exam-session config (title/times/passingScore/maxAttempts…) leaks via `GET /examsessions/study/:id/stats` — no `checkAccess`. `examsession.service.ts:847`.
- **M10** Chat rate-limit fails **open** when finance gRPC client unbound (inconsistent with credit-deduction's fail-closed). `ai-chat.service.ts:680-687`.
- **M11** `files_per_month` subscription quota fetched but never enforced on upload/generation path.
- **M12** Node + AI containers run as **root** (no `USER` directive). `deploy/Dockerfile`, `ai-service/Dockerfile`.
- **M13** No CPU/memory limits on any compose service → one runaway workload OOMs the whole VPS. `deploy/docker-compose.yml`.
- **M14** CSP allows `'unsafe-inline'` scripts (`nginx.conf:71`); origin TLS posture unverifiable — confirm Cloudflare is Full (strict), not Flexible (else CDN→origin leg is plaintext).
- **M15** No global CSP in FE `index.html` (relies on nginx); confirm nginx sets it for the FE origin.

## LOW (post-release backlog)

Password hash cached in Redis on existence checks; gRPC `GetUserInfo` no caller-identity check (internal-only today); TOCTOU on quota counters (use Redis atomic INCR); `GET /ai-chat/:chatId/exists` unscoped by user (existence oracle); pin/study-progress existence oracle; R2 internal token compared with `!==` not `timingSafeEqual`; dead legacy `ai-service/src/score/*` + `agent/*` (different product, has dynamic-SQL pattern — quarantine); `innerHTML` HTML-strip smell in inline editors (safe on detached node); SSE fetch bypasses axios 401-refresh; backend error strings `console.log`'d; dev+prod share the same Gemini key pool; weak `ADMIN_DEFAULT_PASSWORD` (`admin04`).

---

## Verified SECURE (do not regress)

- **Money integrity is solid**: wallet debit uses conditional `updateMany({balance:{gte:amount}})` (no overdraw under concurrency); SePay webhook is atomic + idempotent (`updateMany({status:{not:PAID}})` in `$transaction`, no double-credit on replay); webhook key compared with `crypto.timingSafeEqual`; amount cross-checked server-side, never trusted from client; `cancelPayment`/`getPaymentStatus` scope by `userId`.
- **R2**: path traversal defended (`sanitizePathPart`/`sanitizeDirectory`); delete-on-record-delete correctly wired everywhere (matches CLAUDE.md rule); no external port mapping.
- **Ownership** consistent across quizset/flashcardset/examroom/cheatinglog/word-family; `updateExamAttempt` blocks non-host from setting score/status (anti-self-grading); no mass-assignment (no DTO takes `userId`/`balance`/`role`).
- **Auth crypto**: `crypto.timingSafeEqual` on all code comparisons; `crypto.randomInt`/`randomBytes` for codes/tokens (no `Math.random`); enumeration-safe login/reset; single-use codes w/ 10-min expiry; sessions killed on password reset (refresh-flow); mobile OAuth uses one-time Redis exchange code + redirect allowlist (no token-in-URL).
- **FE**: tokens are **httpOnly cookies**, never localStorage (CLAUDE.md is stale on this); markdown/AI XSS sanitized (`rehype-raw` before `rehype-sanitize`, no `dangerouslySetInnerHTML`); open-redirect protection solid (`normalizeReturnPath`); all `target=_blank` carry `rel=noopener`; no secrets in `src/`.
- **CORS** explicit allowlist, fails to boot in prod without config; X-Forwarded-For spoofing guarded (`trust proxy: 1` + server-derived IP); prod error responses generic (no stack traces); internal-service-token fail-closed + timing-safe (Python side); Redis/RabbitMQ not host-published; eval-sandbox disabled by default with rlimits + scrubbed env.

---

## Recommended fix order before launch

1. **C1** — delete the token-in-URL branch in OAuth callback (cookie relay already suffices).
2. **C2** — env-gate `FREE_MODE`, default `false`, fail-hard if `true` in prod.
3. **C3** — call `checkAccess()` in `startExamAttempt`/`createExamAttempt`.
4. **C4** — rotate every secret; move to a secrets manager.
5. **C6** — unpublish Postgres port (or bind loopback) + rotate DB password.
6. **C5** — decide: ship server-side quiz decryption now, or explicitly sign off as accepted launch risk (it is release-gate, not silent-ship).
7. **H1–H9** — session revocation, AI/upload throttles + `sendMessage` checkLimits, AI document-ownership check, SSRF IP-pinning + fail-closed allowlist, hash refresh tokens, distinct JWT secrets, delete dead guard/service dirs, boot-time secret assertions.
8. **M-tier** — OAuth state, change-password throttle, strip `systemPrompt` from public subject endpoint, `checkAccess` on stats endpoint, non-root containers, resource limits, remove cookie debug-log, confirm CDN TLS is Full-strict.

---

## Fix Log (2026-07-18)

Applied via parallel implementer agents (per-service, no file conflicts) + orchestrator for cross-cutting changes. Verification: all 6 BE services `nest build` exit 0; FE `tsc --noEmit` clean; changed FE files `eslint` 0 errors. **Not committed** (awaiting user).

### Fixed & build-verified
- **C1** — OAuth callback no longer appends tokens to redirect URL (cookies only); removed the dead `extractCookieValue` helper. `gateway-service`.
- **C2** — `FREE_MODE` now env-gated (`AI_FREE_MODE`, default = charging ON); forced OFF + logged error if enabled in production. `exam-service/finance-client`.
- **C3** — `assertSessionAccess()` added to `startExamAttempt` + `createExamAttempt` (public/host/whitelist/valid-code allowed, else 403). Access code threaded FE→BE: verified code stored in sessionStorage → passed to `/examattempts/start`; new optional `accessCode` on the DTO.
- **C5** — quiz content now served as plaintext over TLS (auth-scoped, per-question JWT retained); removed client AES layer entirely: deleted `src/lib/crypto.ts`, `VITE_QUIZ_AES_KEY` from env/vite-env/Dockerfile/.env.example. The shipped key is gone.
- **H1** — `AuthGuard`/`AdminGuard` now check a `sessionId` claim against an active `UserSession`; session created before token signing across login/register/OAuth/refresh. Stolen access tokens die on logout/password-reset.
- **H2** — strict per-endpoint throttles on AI/upload/stream (gateway) + `sendMessage` now calls `checkLimits` (exam-service).
- **H3** — AI `generate_quiz`/`generate_flashcards` assert `file_info.user_id == request.user_id` (403 on mismatch).
- **H4** — SSRF: IP-pinned connection (Host/SNI preserved) closes DNS-rebinding TOCTOU; allowlist now fails closed when unconfigured.
- **H7** — deleted dead duplicate `libs/common/guard/*` + `libs/common/services/*` (had hardcoded default secrets / weaker checks).
- **H8** — boot-time `JWT_SECRET` assertion (min 32 chars) in gateway/exam/finance/admin/auth `main.ts`.
- **H9** — `max_length` caps on AI chat `query`/`system_prompt`/history.
- **M1** — OAuth `state` now carries a server nonce bound to an httpOnly cookie; callback rejects on mismatch.
- **M2** — `AuthStrictThrottlerGuard` + `@Throttle(5/60s)` on change-password + send-code-change-password.
- **M4** — gateway cookie debug log prints names only, never values.
- **M5** — `log-publisher` `redacted` field now strips query strings + masks sensitive param names.
- **M6** — AI base persona/safety prompt is non-overridable; client `system_prompt` appended as a labeled hint only.
- **M7** — retrieved document content wrapped in `<document>` untrusted-data delimiters + "data not instructions" instruction.
- **M8** — public `GET /subjects/:id` + `/slug/:slug` now use explicit `select` excluding `systemPrompt`.
- **M9** — `getExamSessionStatsForStudent` now calls `checkAccess` first.
- **M10** — chat `checkLimits` fails safe (Free-tier defaults) when the finance gRPC client is unset.
- **M11** — `files_per_month` enforced on upload/generation (via `getUserBenefits` + monthly `UserStorage` count).
- **LOW** — R2 `assertInternalToken` now uses `timingSafeEqual`.

### BLOCKED / needs a decision
- **H5 (hash refresh tokens at rest)** — NOT applied (deliberately, no partial change). Hashing breaks two paths that must return a server-generated plaintext token the caller never presented: the grace-window branch of `rotateRefreshTokenIfCurrent` and `syncRefreshTokenBySession` (`POST /auth/sync-refresh-token`). Needs either reversible encryption at rest or a Redis old→new plaintext cache with a grace TTL — bigger than a field hash. Decide before it ships. Detail: `reports/implementer-auth-security-batch.md`.

### Operational — YOUR action required (cannot be code-fixed)
- **C4** — rotate EVERY secret in the `.env` files (Gemini×11, R2, SePay, Google/GitHub OAuth, Gmail app password, CloudAMQP, Postgres/Redis, JWT/AES, admin default password). `.gitignore` already covers `.env`; nothing is committed — but treat all as exposed. Move to a secrets manager.
- **H6 / H8 interaction** — the new min-32-char `JWT_SECRET` assertion means services WON'T BOOT until you replace the current weak `JWT_SECRET` (`kmaedu_secret_key`, 17–18 chars) with a distinct high-entropy ≥32-char value per environment. This is intended fail-fast; set it before deploy/local run.
- **C6** — excluded per your instruction (Postgres port). Still recommend binding to loopback before public launch.

### Deferred (lower-risk, not blind-applied pre-release)
- **M3** gateway-edge `AuthGuard` uniformity (safe today — downstream enforces); **M12** non-root container `USER`; **M13** compose resource limits; **M14/M15** CSP `unsafe-inline` + confirm Cloudflare TLS Full-strict — these are infra changes best verified in staging, not blind-edited right before release.
- Remaining LOW: Redis password-hash cache on existence checks, gRPC `GetUserInfo` caller check, TOCTOU quota counters (use Redis atomic), chat `exists` oracle, pin oracle, dead `ai-service/src/score/*` quarantine, SSE bypasses axios refresh, console error logging, dev/prod shared Gemini keys.

---

## Post-Fix Review (reviewer pass)

A focused regression review of the highest-risk fixes (H1 session order, C3 access, C5 plaintext, C2) found:

- **C3 resume-lockout (HIGH regression) — FIXED.** `assertSessionAccess` originally ran before the in-progress-attempt resume check, so a code-gated user resuming from a new tab / the dashboard "Tiếp tục" button (empty sessionStorage) got locked out of their own started exam. Fix: the resume early-return now runs FIRST (ownership of an in-progress attempt already proves access); the access assertion only guards NEW attempts. Added an FE fallback: a 403 on start redirects to the session page's code dialog instead of dead-ending.
- **OptionalAuthGuard parity (MEDIUM) — FIXED.** It now also enforces the `sessionId`-active check (fail-soft → treats a revoked session as anonymous), matching AuthGuard/AdminGuard.
- **H1, C5, C2 — VERIFIED-SAFE.** Every token path embeds a resolvable `sessionId`; pre-existing tokens degrade gracefully (no mass logout on deploy — they fall through unchecked until natural expiry as clients refresh); FE/BE plaintext-quiz shapes match; FREE_MODE defaults to charging and can't run free in production.

### ⚠ Mobile app consequence (kmaedu-app — NOT in this audit's scope)
The C3 server-side enforcement now correctly blocks code-gated exam sessions from the **mobile app**, because `kmaedu-app`'s `StartExamAttemptRequest` has no `accessCode` field and no code-entry UI. Before the fix these "worked" only because there was no enforcement (the IDOR). Public / host / whitelisted exams still work on mobile. **Follow-up (separate effort):** add access-code entry to the mobile start flow (Kotlin shared model + API + UI on BOTH iOS and Android per project rule). Flagged as a release-scope decision — not silently shipped.
