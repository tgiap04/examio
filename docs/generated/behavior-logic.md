# Behavior Logic

Generated: 2026-05-27
Source: scout reports and `_scout-bl-inventory.md`. Unknowns are marked `Needs verification`.

## Auth, Session, And Routing

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL001 | Login/register issue JWT access tokens, refresh tokens, session id, and auth cookies. | Backend, web, mobile | Auth service `/auth/login`, `/auth/register`; web auth store; mobile AuthRepository/AuthViewModel. |
| BL002 | Authenticated requests prefer cookies on backend, with Bearer token fallback. | Backend | Shared AuthGuard. |
| BL003 | Web Axios injects `Authorization: Bearer {auth_token}` and `X-Device-ID`. | Web | `src/apis/api.ts`. |
| BL004 | Web 401 responses trigger single-flight token refresh, then retry or clear auth and redirect to `/login`. Redirect loop prevention: `setRedirectBackTarget` skipped when already on `/login`. `handleAuthFailure` no longer calls `clearRedirectBackTarget()` before `navigateTo()`. | Web | Handles invalid/expired sessions, session invalidation (403), and model-specific error codes. `src/apis/api.ts`. |
| BL005 | OAuth redirect tokens are read from URL query params, persisted, then stripped from URL. | Web, mobile | Web `useAuthSync`; Android/iOS custom scheme callbacks. |
| BL006 | ProtectedRoute blocks unauthenticated workspace screens and stores return path. | Web | Applies to `/k/*`. |
| BL007 | PublicRoute redirects authenticated users away from login/register/reset screens. | Web | Redirects to `/k`. |
| BL007a | Standalone study/exam routes (`/study-flashcard/:id`, `/exam-session/:id`, `/exam-session/:id/quiz`) include client-side auth checks that redirect to `/login?from=...` when unauthenticated. | Web | Previously had no route guard; auth check added inline in page components. |
| BL008 | TeacherRoute only checks authentication, not teacher/admin role. | Web | Authorization gap; should not be treated as enforced teacher permission. |
| BL009 | Device/session lifecycle includes `x-device-id`, active session tracking, logout deactivation, and cleanup cron. | Backend, web, mobile | Device list/logout behavior on web; mobile sends device id through KMP interceptor. |
| BL010 | Mobile Android auth uses shared KMP AuthRepository and encrypted token storage. | Android | API-backed. |
| BL011 | Mobile iOS auth uses a private Swift URLSession client and KeychainTokenStore, not shared KMP auth storage. | iOS | KMP iOS SecureTokenStorage is stubbed. |

## API Gateway And Integration

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL020 | Gateway proxies `/api/v1/*` to auth, exam, finance, R2-related, webhook, and AI/study controllers. | Backend | Public clients mostly call gateway. |
| BL021 | Gateway forwards cookies and bearer tokens to downstream services. | Backend | Proxy behavior. |
| BL022 | Gateway rate limits requests at about 100 req/min. | Backend | `@nestjs/throttler`; exact route exclusions Need verification. |
| BL023 | Service-to-service validation can use auth gRPC `ValidateToken`, `GetUserInfo`, and `CheckPermission`. | Backend | Authorization model simple role/ownership. |
| BL024 | RabbitMQ topic exchange `examio.events` carries user, payment, wallet, subscription, exam, OCR events. | Backend | Known consumers include finance user-created handler and AI consumer. |

## Learning Content

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL030 | Quiz sets support CRUD, labels, questions, sharing/access, history save, and export on web. | Backend, web | Mobile shared API ready; mobile UI mock-backed. |
| BL031 | Flashcard sets support CRUD, labels, flashcards, sharing/access, study flow, and flashcard view modal in label manager. | Backend, web | Mobile shared API ready; mobile UI mock-backed. |
| BL032 | Store caches reduce repeated API calls and are invalidated on mutations. Includes flashcards-by-label cache. | Web | `storeCache` used by most Zustand stores. |
| BL033 | Student materials expose recent flashcards/exams and pin/unpin/share links. | Backend, web, mobile shared | Mobile UI mock-backed. Exact share flow Needs verification. |
| BL034 | Flashcard study records progress and answer submissions through `/flashcard-study/*`. | Backend, web, mobile shared | Web standalone route with inline auth check; mobile UI mock-backed. |

## Exam And Proctoring

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL040 | Exam rooms group sessions and are managed by authenticated users. | Backend, web | Teacher/admin enforcement Needs verification. |
| BL041 | Exam sessions have lifecycle states, access code/whitelist/sharing settings, passing score, and retake rules. | Backend, web, mobile shared | Detailed transitions Need verification. |
| BL042 | Join/start flows allow public code/link entry while backend validates access. Standalone exam routes now include inline auth check redirecting to `/login?from=...`. | Backend, web | Route guards added in commit 1bb4d29. |
| BL043 | Exam attempts track score, answers, current index, marked questions, violation count, and status. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL044 | Secure quiz flow can use encrypted quiz payloads/JWT per question and client-side AES helpers. Cryptography env vars (`QUIZ_JWT_SECRET`, `QUIZ_AES_KEY`) validated at startup. | Backend, web, mobile shared | Mobile decryption plan Needs verification. |
| BL045 | Web exam taking uses reCAPTCHA on protected submission endpoints. | Web, backend | reCAPTCHA provider wraps app. Exact endpoints Need verification. |
| BL046 | Web proctoring detects tab switch, blur, devtools, copy/paste, right-click, fullscreen exit, and print screen. | Web | Logs violations to cheating log API. |
| BL047 | Cheating logs persist violation type/count/stats per attempt. | Backend, web | Threshold consequences Need verification. |

## AI, OCR, And File Storage

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL050 | File upload flow: client -> gateway -> exam-service -> R2 gRPC -> UserStorage DB record -> AI process-file. | Backend, web | Applies to AI upload/quick-upload. |
| BL051 | AI service processes files via OCR/chunking/embeddings and writes Document/UserStorage status. | Backend Python | Uses shared PostgreSQL. |
| BL052 | Generation flow uploads/selects file, creates async job/history, polls job status, then displays quiz/flashcards. | Backend, web | Web `useAIGeneratorStore`; mobile UI mock-backed. |
| BL053 | Recent uploads and generation history are fetched from `/ai/recent-uploads` and history endpoints. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL054 | AI chat supports chat CRUD, messages, image upload, multi-document context, and SSE streaming on web. | Backend, web | Mobile shared SSE is stubbed. |
| BL055 | AI model catalog is lazy-loaded and cached. AI2 model names cached in Python service with 5-min TTL. | Backend, web | Model runtime errors handled in web Axios. |
| BL056 | GenAI tutor knowledge supports folders, files, ingest jobs, graphs, dataset imports, bulk delete/reprocess. | Backend, web | Access restrictions Need verification. |
| BL057 | Uploaded profile/media images use R2 image API. | Backend, web | On record deletion with R2 asset, deletion behavior Needs verification per repo rule. |
| BL058 | `generateCode()` now uses `crypto.randomInt()` for cryptographically secure random codes. | Backend | Shared lib `@examio/common`. |
| BL059 | Environment variable validation: `QUIZ_JWT_SECRET` and `QUIZ_AES_KEY` validated at startup (required, min length). | Backend | Shared lib `@examio/common`. |

## Finance And Subscription

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL060 | New user registration triggers wallet creation through event/gRPC-backed finance workflow. | Backend | `user.created` event and wallet gRPC. |
| BL061 | Wallet details include balance and transaction history. | Backend, web, mobile shared | Mobile UI mock-backed. |
| BL062 | Payment creation returns SePay QR/payment data; client polls status. | Backend, web | Web QRPaymentDialog. |
| BL063 | SePay webhook updates payment/wallet/subscription state. Webhook API key validated via `crypto.timingSafeEqual`; invalid keys throw `UnauthorizedException`. | Backend | Timing-safe comparison; previously returned `{ success: false }` silently. |
| BL064 | Subscription benefits are available through finance gRPC `GetUserBenefits`. | Backend | Used by AI chat/subscription checks. |
| BL065 | `FREE_MODE` is `false` in production — credit and subscription checks are fully enforced. Flag is strictly development-only. | Backend, web | Was previously `true` by default. |

## Mobile-Specific Behavior

| ID | Logic | Scope | Sources / Notes |
|---|---|---|---|
| BL070 | Shared KMP repositories for auth, AI, study, exams, history, and account are real Ktor API facades. | Mobile shared | Platform feature UIs mostly not wired. |
| BL071 | Android main feature screens manage local `mutableStateOf` UiState and use hardcoded sample data. | Android | Mock-backed except auth and likely logout. |
| BL072 | iOS main feature screens manage local SwiftUI state and use hardcoded/default data. | iOS | Mock-backed except auth. |
| BL073 | Mobile deep links parse exam session, flashcard, chat, and profile targets. | Mobile shared/platform | Actual navigation handling beyond auth callback Needs verification. |
| BL074 | Mobile SSE client interfaces exist but Android/iOS actuals throw `NotImplementedError`. | Mobile shared | AI streaming unavailable on mobile. |

## Unknowns To Verify

- Exact `/k` root redirect destination.
- Detailed exam session state transitions and anti-cheating penalty thresholds.
- Whether backend enforces teacher/admin permissions for teacher-only web/mobile flows.
- Whether production credit checks are backend-enforced when web `FREE_MODE = true`.
- Exact mobile wiring plans for shared repositories and SSE.
