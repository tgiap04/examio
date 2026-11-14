# Frontend Security Audit Report — kmaedu-fe

**Date:** 2026-05-30
**Scope:** kmaedu-fe/src/ — API layer, auth stores, hooks, lib, components, env configs
**Methodology:** STRIDE + OWASP Top 10

---

## CRITICAL Findings

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/.env` (committed to repo) |
| **Severity** | Critical |
| **STRIDE** | Information Disclosure |
| **OWASP** | A05:2021 Security Misconfiguration |
| **Description** | The `.env` file containing real production secrets is committed to the git repository. It holds `VITE_QUIZ_AES_KEY`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_GOOGLE_CLIENT_ID`, and `VITE_MEASUREMENT_ID`. Any collaborator, contractor, or leaked commit history exposes these secrets. |
| **Fix** | Immediately rotate all exposed keys. Remove `.env` from git history (`git filter-repo` or BFG Repo-Cleaner). Add `.env` to `.gitignore` (it already is — determine why it was committed and audit other devs' clones). Never commit `.env`. Use a secrets manager (Vault, AWS SSM) or CI secrets injection for production builds. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/lib/crypto.ts:5` + `kmaedu-fe/src/lib/env.ts:23` |
| **Severity** | Critical |
| **STRIDE** | Tampering / Information Disclosure |
| **OWASP** | A01:2021 Broken Access Control, A02:2021 Cryptographic Failures |
| **Description** | The AES-256 quiz decryption key (`VITE_QUIZ_AES_KEY`) is bundled into the browser JS bundle at build time via Vite's `import.meta.env` injection. An attacker can: (1) open DevTools → Sources → find the bundled chunk, (2) search for `quizAesKey` or the key string, (3) use it to decrypt all encrypted quiz questions and answers client-side. This completely bypasses the secure-quiz anti-cheat mechanism — any student can programmatically extract all correct answers before or during the exam. |
| **Fix** | Move quiz decryption to the server. The backend should decrypt questions server-side and return plaintext only after the exam session is verified server-side, or use server-side rendering with short-lived per-session keys derived from the session secret. The frontend should never have access to the AES key. As a stopgap: use a backend proxy endpoint `/quiz/decrypt` that decrypts on behalf of the client with server-side key material. |

---

## HIGH Findings

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useAuthSync.ts:54–76` |
| **Severity** | High |
| **STRIDE** | Spoofing / Elevation of Privilege |
| **OWASP** | A01:2021 Broken Access Control, A07:2021 Authentication Failures |
| **Description** | The `useAuthSync` hook reads `token`, `refreshToken`, and `sessionId` directly from URL query parameters (`url.searchParams.get(...)`) and immediately stores them in localStorage/cookies. An attacker can craft a malicious URL like `https://kmaedu.fayedark.com/k?token=<attacker_token>&refreshToken=<attacker_refresh_token>` and send it to a victim. If the victim visits the link, their session is silently overwritten with the attacker's token, log them out (or log them in as the attacker account), and the redirect removes all traces from the URL bar. This is a token substitution attack. |
| **Fix** | Never accept tokens from URL query parameters. Use HTTP-only cookies set by the backend on the `/auth/callback` OAuth endpoint. If session-fixation protection is needed, use a one-time POST exchange via the backend. Strip tokens from URLs before any storage operation. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/stores/useAuthStore.ts:52–72` + `kmaedu-fe/src/stores/useAuthStore.ts:329–330` |
| **Severity** | High |
| **STRIDE** | Information Disclosure / Phishing |
| **OWASP** | A01:2021 Broken Access Control |
| **Description** | `getOAuthRedirectPath()` reads a `from` URL parameter and returns it directly as the post-login redirect destination without validating that it belongs to the app's origin. `window.location.href` is then set to `${env.apiUrl}/auth/google?redirect=${redirect}` where `redirect` is an arbitrary URL. An attacker can set `from=https://evil.phishing.com` to redirect the victim to a fake site after OAuth login, or `from=https://kmaedu.fayedark.com/admin/delete-everything`. The `normalizeReturnPath()` only validates `//` prefix but not cross-origin targets. |
| **Fix** | Validate that the `from` parameter points to a path within the app's origin. Use `URL` to parse and compare `origin` (not just `pathname`). Allowlist redirect paths or restrict to relative paths only (`from` must start with `/`). |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useAuthSync.ts:118–121, 134–136` |
| **Severity** | High |
| **STRIDE** | Spoofing / Information Disclosure |
| **OWASP** | A07:2021 Authentication Failures |
| **Description** | Refresh tokens are stored in plain text in localStorage (`REFRESH_STORAGE_KEY = "refresh_token"`). localStorage is accessible to any JavaScript running on the page, including injected third-party scripts (analytics, chat widgets, ads). Any XSS vulnerability in the app (even a stored XSS in a quiz question or flashcard) can exfiltrate the refresh token. Unlike access tokens, refresh tokens are long-lived and can be used to obtain new access tokens even after the user closes the session. |
| **Fix** | Store refresh tokens in HTTP-only, Secure, SameSite=Strict cookies set by the backend. The backend should handle token rotation server-side via a `/auth/refresh` endpoint that reads from the HTTP-only cookie. Remove `setStoredRefreshToken` / `getStoredRefreshToken` from localStorage entirely. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/apis/api.ts` (global axios instance) |
| **Severity** | High |
| **STRIDE** | Tampering |
| **OWASP** | A01:2021 Broken Access Control, A08:2021 Software and Data Integrity Failures |
| **Description** | All API requests lack CSRF token protection. Axios is configured with `withCredentials: true` sending cookies cross-origin, but there is no `X-CSRF-Token` header or equivalent on any POST/PUT/PATCH/DELETE request. An attacker-controlled page (malicious site, XSS payload) can make browser-initiated requests to the app's API using the victim's cookies to perform state-changing actions (change password, delete data, submit exam). |
| **Fix** | Implement CSRF token: (1) Backend issues a CSRF token cookie (`csrf_token` in HTTP-only cookie). (2) Frontend reads it via `document.cookie` and sends it as `X-CSRF-Token` header on all mutating requests. (3) Backend validates the token. Alternatively, use the `SameSite=Strict` cookie attribute as a defense-in-depth measure (note: this breaks legitimate cross-origin flows — only viable if the SPA is the sole consumer of the API). |

---

## MEDIUM Findings

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useAuthSync.ts:19–24` |
| **Severity** | Medium |
| **STRIDE** | Tampering |
| **OWASP** | A01:2021 Broken Access Control |
| **Description** | `SameSite=None` is only set for the production hostname `kmaedu.fayedark.com`. On all other hostnames (localhost, staging, dev environments), the auth cookie uses the default browser behavior (Lax), which does not protect against CSRF from other subdomains. Additionally, the `Secure` flag is only applied in production — staging/development cookies travel over HTTP, making them interceptable. |
| **Fix** | Set `Secure; SameSite=Strict` cookies in production. Use `SameSite=Lax` (not `None`) for non-production as an interim CSRF measure. In production, ensure all traffic is HTTPS. Consider a domain allowlist for cookie domain attribute rather than hardcoding `fayedark.com`. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/vite.config.ts:59–64` |
| **Severity** | Medium |
| **STRIDE** | Information Disclosure / Tampering |
| **OWASP** | A05:2021 Security Misconfiguration |
| **Description** | The Vite dev server proxy target reads from `process.env.VITE_BACKEND_URL` which defaults to `http://localhost:3000`. If a developer inadvertently sets `VITE_BACKEND_URL` to a malicious server, the browser will proxy all `/api` requests (including auth tokens) to the attacker-controlled host during development. This is a supply-chain risk for devs who don't audit their `.env` files. |
| **Fix** | Document clearly that `VITE_BACKEND_URL` must only point to trusted backend instances. Consider pinning the dev proxy to `127.0.0.1` or a known local address. In production builds, the proxy is irrelevant (API calls go directly to the backend), but add a runtime validation that `apiUrl` matches an allowlist of known origins. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/pages/exam-session/ExamQuizPage.tsx:435,463` + `kmaedu-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx:443,464` |
| **Severity** | Medium |
| **STRIDE** | Injection |
| **OWASP** | A03:2021 Injection |
| **Description** | User-generated content (quiz question text, flashcard question/answer) is rendered via `dangerouslySetInnerHTML`. Even though this content may originate from the exam creator (trusted in most scenarios), it is not sanitized. If an exam creator account is compromised, or if AI-generated content contains malicious scripts, the XSS payload executes in every student's browser who views the exam. The `LabelManager.tsx` line 466 also uses `dangerouslySetInnerHTML` for `highlight` (question text). |
| **Fix** | Replace all `dangerouslySetInnerHTML` usages with a sanitized HTML renderer (e.g., `DOMPurify` with a strict allowlist of tags: `p`, `ul`, `ol`, `li`, `strong`, `em`, `br`, `code`). Apply sanitization server-side before storing content. Apply `DOMPurify.sanitize()` to all user content before rendering, or use the existing `RichTextViewer` component which uses TipTap's safe rendering engine. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/components/organisms/GoogleOneTap.tsx:34` + `.env` |
| **Severity** | Medium |
| **STRIDE** | Information Disclosure |
| **OWASP** | A05:2021 Security Misconfiguration |
| **Description** | `VITE_GOOGLE_CLIENT_ID` is a public-facing OAuth client ID. While client IDs are designed to be public, exposing them lets attackers clone the login page UI or build look-alike phishing pages using the same client ID. More critically, the `GoogleOneTap.tsx` builds the URL as `${env.apiUrl}/auth/google/one-tap` — if `env.apiUrl` is tampered with, the credential POST goes to the wrong host. |
| **Fix** | Restrict the Google OAuth client ID's allowed origins in the Google Cloud Console to only known app origins. Validate `env.apiUrl` at runtime against a hardcoded allowlist. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/lib/env.ts:21` + `.env` |
| **Severity** | Medium |
| **STRIDE** | Information Disclosure |
| **OWASP** | A05:2021 Security Misconfiguration |
| **Description** | `VITE_RECAPTCHA_SITE_KEY` is bundled into the client JS. While reCAPTCHA site keys are less sensitive than secret keys, an attacker can use the exposed site key to: (1) programmatically trigger reCAPTCHA challenges on their own pages, (2) abuse the API quota, or (3) in rare misconfigurations, use it to probe for valid challenge tokens. |
| **Fix** | Ensure reCAPTCHA site key is restricted to the app's domains in Google reCAPTCHA admin console. Monitor reCAPTCHA usage for anomalies. |

---

## LOW Findings

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/lib/genai-knowledge-access.ts:4–9` |
| **Severity** | Low |
| **STRIDE** | Information Disclosure |
| **OWASP** | A01:2021 Broken Access Control |
| **Description** | `VITE_GENAI_TUTOR_ALLOWED_EMAILS` is bundled into the client. The email allowlist for the GenAI Knowledge Manager feature is visible in the browser bundle, revealing which email addresses have elevated access. |
| **Fix** | Enforce the email allowlist server-side, not client-side. The frontend should receive a boolean `canAccessGenAIKnowledgeManager` from the backend `/auth/me` response. The client-side check in `genai-knowledge-access.ts` is defense-in-depth only; it must not be the sole access control mechanism. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useCheatingDetection.ts:83–166` |
| **Severity** | Low |
| **STRIDE** | Denial of Service |
| **OWASP** | A04:2021 Insecure Design |
| **Description** | The cheating detection hook registers 8 event listeners (visibilitychange, blur, keydown, copy, paste, cut, contextmenu, fullscreenchange) on every exam page. These are client-side-only controls that are trivially bypassed: disabling JavaScript, using browser devtools, or a non-standard browser will defeat all of them. Relying on client-side anti-cheat as the primary integrity mechanism gives a false sense of security. |
| **Fix** | Client-side anti-cheat is valid as a deterrent and for logging purposes. Ensure backend has complementary integrity checks: answer pattern analysis, time-per-question analysis, server-side answer verification, and IP/session anomaly detection. Add a disclaimer that client-side detection is not foolproof. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useAuthSync.ts:42–44` |
| **Severity** | Low |
| **STRIDE** | Information Disclosure |
| **OWASP** | A07:2021 Authentication Failures |
| **Description** | `getCookie()` uses a regex without anchoring, making it susceptible to substring matches: `document.cookie` returns all cookies as a single string like `"token=abc"`. The regex `(^| )${name}=([^;]+)` matches `" token=abc"` but also `"othertoken=abc"` if the cookie name is `"token"` — this is a low-risk bug but could return the wrong cookie value in edge cases. |
| **Fix** | Use `; ` as the explicit cookie delimiter: `document.cookie.split('; ').reduce(...)` or use the more robust regex: `(?:^\|; )${name}=([^;]+)`. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/hooks/useAuthSync.ts:95–109` |
| **Severity** | Low |
| **STRIDE** | Denial of Service / Information Disclosure |
| **OWASP** | A07:2021 Authentication Failures |
| **Description** | The `syncRefreshTokenApi` call in `useAuthSync` fires on every page load when a session exists without a refresh token. It silently swallows errors (`console.error` only). An attacker who has stolen a session ID but not the access token can trigger repeated token sync requests, potentially leading to rate limiting the legitimate user or revealing information about the session state through error side-channels. |
| **Fix** | Add exponential backoff for repeated sync failures. Add a cap on sync attempts per page load. Log sync failures server-side for anomaly detection. |

---

## INFO Findings

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/stores/useAuthStore.ts` (multiple `typeof window !== "undefined"` checks) |
| **Severity** | Info |
| **STRIDE** | Information Disclosure |
| **Description** | Positive security pattern: auth store correctly guards all localStorage/cookie access with `typeof window !== "undefined"` SSR checks. This prevents SSR crashes but note that server-side rendering of protected pages without auth context should be handled by the routing layer's `ProtectedRoute` to avoid leaking unauthenticated state. |

---

| Field | Value |
|---|---|
| **File** | `kmaedu-fe/src/lib/authRedirect.ts:3–12` |
| **Severity** | Info |
| **STRIDE** | Information Disclosure |
| **Description** | `normalizeReturnPath()` correctly blocks `//` prefix (to prevent `//evil.com`) but does not block other protocol-relative or cross-origin redirects. This is partially mitigated by `getOAuthRedirectPath()` using `startsWith("/")` check, but the `from` param in `useAuthStore` bypasses `normalizeReturnPath` and is used as the raw redirect in the OAuth URL. |

---

## Summary Table

| # | File | Severity | STRIDE | OWASP | Title |
|---|---|---|---|---|---|
| C1 | `.env` (committed) | Critical | Information Disclosure | A05 | Production secrets committed to git |
| C2 | `src/lib/crypto.ts:5` | Critical | Tampering / Info | A01/A02 | AES key in browser bundle — exam answer extraction |
| H1 | `src/hooks/useAuthSync.ts:54–76` | High | Spoofing | A01/A07 | Token injection via URL query params |
| H2 | `src/stores/useAuthStore.ts:52–72,329–330` | High | Phishing | A01 | OAuth redirect to arbitrary URL via `from` param |
| H3 | `src/hooks/useAuthSync.ts:118–136` | High | Spoofing / Info | A07 | Refresh token stored in localStorage (XSS exfiltration) |
| H4 | `src/apis/api.ts` | High | Tampering | A01/A08 | No CSRF protection on state-changing requests |
| M1 | `src/hooks/useAuthSync.ts:19–24` | Medium | Tampering | A01 | SameSite=None/Secure only in production |
| M2 | `vite.config.ts:59–64` | Medium | Tampering | A05 | Dev proxy target from env variable |
| M3 | `ExamQuizPage.tsx:435,463` + `FlashcardStudyPage.tsx:443,464` | Medium | Injection | A03 | `dangerouslySetInnerHTML` for user content |
| M4 | `GoogleOneTap.tsx:34` | Medium | Info | A05 | Google OAuth Client ID in bundle |
| M5 | `src/lib/env.ts:21` | Medium | Info | A05 | reCaptcha site key in bundle |
| L1 | `genai-knowledge-access.ts:4–9` | Low | Info | A01 | Email allowlist visible in bundle |
| L2 | `useCheatingDetection.ts` | Low | DoS | A04 | Client-only anti-cheat bypassable |
| L3 | `useAuthSync.ts:42–44` | Low | Info | A07 | getCookie regex substring match bug |
| L4 | `useAuthSync.ts:95–109` | Low | DoS / Info | A07 | Unbounded syncRefreshTokenApi calls on page load |
| I1 | `useAuthStore.ts` | Info | — | — | SSR guards correctly implemented |
| I2 | `authRedirect.ts:3–12` | Info | — | — | Partial double-slash guard but `from` param bypasses it |

---

## Prioritized Remediation Roadmap

| Priority | Action | Effort |
|---|---|---|
| **P0 — Immediate** | Rotate all exposed `.env` secrets; remove from git history | High |
| **P0 — Immediate** | Move AES quiz decryption to backend; remove key from client bundle | High |
| **P1 — This sprint** | Remove token-from-URL acceptance in `useAuthSync` | Low |
| **P1 — This sprint** | Validate `from` OAuth redirect against app origin allowlist | Low |
| **P1 — This sprint** | Move refresh token storage to HTTP-only cookies | High |
| **P1 — This sprint** | Implement CSRF token on all mutating API requests | Medium |
| **P2 — Next sprint** | Replace all `dangerouslySetInnerHTML` with DOMPurify/TipTap renderer | Medium |
| **P2 — Next sprint** | Enforce `SameSite=Strict` cookies in all environments | Low |
| **P3 — Backlog** | Add runtime `apiUrl` allowlist validation | Low |
| **P3 — Backlog** | Move email allowlist enforcement to server-side `/auth/me` | Medium |
| **P3 — Backlog** | Fix getCookie regex and add sync attempt rate limit | Low |
