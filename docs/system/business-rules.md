# Business Rules

Generated: 2026-05-27
Source: scout reports and behavior inventory. Unknowns are marked `Needs verification`.

## Account And Session Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR001 | BL001, PERM002-PERM004 | A user must authenticate through credential login, registration, or Google OAuth before accessing workspace features. |
| BR002 | BL001, BL060 | A wallet is created automatically for new users through backend finance workflow. |
| BR003 | BL009, PERM007-PERM010 | Sessions are tied to device IDs and can be deactivated on logout/device logout. |
| BR004 | BL004, PERM006 | Web clients must attempt token refresh on expired access tokens before forcing logout. |
| BR005 | BL005 | OAuth callback tokens must be captured, persisted, and removed from the browser URL. |
| BR006 | BL011 | iOS currently relies on Swift Keychain auth storage; KMP iOS secure token storage is not implemented. |

## Access And Authorization Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR010 | BL006-BL008, PERM008 | Workspace routes require authenticated state on web. |
| BR011 | BL008, PERM023-PERM025 | Teacher/admin-only intent exists, but route-level teacher role enforcement is not proven. Needs verification. |
| BR012 | BL023, PERM037 | Internal services can validate tokens/check permissions through auth gRPC. |
| BR013 | PERM015-PERM021 | Learning content access depends on ownership/public/shared/access-code rules. Exact public/shared model Needs verification. |
| BR014 | BL042, PERM026 | Exam session join may be allowed without route auth if access code/link validation succeeds at API level. |
| BR015 | PERM034-PERM035 | GenAI knowledge management requires additional access control beyond basic auth. Exact rules Need verification. |

## Quiz, Flashcard, And Materials Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR020 | BL030, PERM016-PERM017 | Authenticated owners can create and manage quiz sets, questions, and labels. |
| BR021 | BL031, PERM019-PERM020 | Authenticated owners can create and manage flashcard sets, cards, and labels. |
| BR022 | BL032 | Web stores should serve cached feature data within TTL and invalidate affected caches after mutations. |
| BR023 | BL033, PERM022 | Student material lists are user-scoped and can include recent/pinned/shareable materials. |
| BR024 | BL034, PERM021 | Flashcard study progress/answers should be recorded only for accessible flashcard sets. |

## Exam Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR030 | BL040-BL041, PERM023-PERM024 | Exam rooms contain exam sessions; sessions define access, timing/status, scoring, retake, and sharing settings. |
| BR031 | BL041 | Exam session lifecycle states include draft/scheduled/active/completed/cancelled on mobile models; backend/web enum parity Needs verification. |
| BR032 | BL042, PERM026 | Session access can be controlled by access code, share link, whitelist, and authenticated ownership/participant rules. |
| BR033 | BL043, PERM027 | Exam attempts persist answers, score, current question index, marked questions, violation count, and attempt status. |
| BR034 | BL044, PERM027 | Secure quiz data may be encrypted and require per-question/attempt tokens for answer submission. |
| BR035 | BL045 | Web exam submissions may require reCAPTCHA tokens. Exact endpoint coverage Needs verification. |
| BR036 | BL046-BL047, PERM028 | Proctoring violations must be logged; penalty/termination thresholds Need verification. |

## AI, OCR, And Storage Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR040 | BL050, PERM029 | AI/PDF uploads must create R2 storage and UserStorage metadata before processing. |
| BR041 | BL051 | AI processing updates file status after OCR/chunking/embedding; failed jobs must be represented in processing status. |
| BR042 | BL052, PERM030 | Quiz/flashcard generation is file-backed and may run asynchronously with job polling/history retrieval. |
| BR043 | BL053, PERM031 | Recent uploads/history are user-scoped. |
| BR044 | BL054, PERM032-PERM033 | AI chat supports streaming, image/document context, and multi-document messages on web. |
| BR045 | BL074 | Mobile AI streaming cannot be considered available until SSE actual implementations are added. |
| BR046 | BL056, PERM034-PERM035 | Tutor knowledge supports folder/file/dataset/graph operations; destructive dataset clear/bulk delete need strict authorization verification. |
| BR047 | BL057, PERM038 | When deleting DB records with R2-backed assets, corresponding R2 objects should also be deleted per project rule; actual coverage Needs verification. |

## Finance And Credit Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR050 | BL061, PERM012 | Wallet balance and transaction history are user-scoped. |
| BR051 | BL062-BL063, PERM013-PERM014 | Payment creation produces a QR/payment record; SePay webhook changes final payment/wallet/subscription state. |
| BR052 | BL064 | Subscription benefits control limits such as files/month and message rate. Exact plan values Need verification. |
| BR053 | BL065, PERM030 | Web client credit checks are currently bypassed by `FREE_MODE = true`; backend enforcement must be verified. |

## Mobile Product Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR060 | BL070-BL072 | Mobile rebuild specs must distinguish shared API readiness from platform UI wiring. |
| BR061 | BL010, BL071 | Android auth is API-backed; Android non-auth feature screens are currently mock-backed unless later evidence proves wiring. |
| BR062 | BL011, BL072 | iOS auth is API-backed through Swift URLSession; iOS non-auth feature screens are currently mock-backed unless later evidence proves wiring. |
| BR063 | BL073 | Mobile deep links include exam session, flashcard, chat, and profile targets, but full navigation behavior Needs verification. |
| BR064 | SCR107 | Android HomeScreen exists but is not wired into main navigation; default tab is AI. |

## Data And Integration Rules

| Rule | Related BL/PERM | Description |
|---|---|---|
| BR070 | BL020-BL022 | Public clients should use gateway `/api/v1`; downstream service URLs are internal configuration. |
| BR071 | BL024 | Cross-service side effects should use RabbitMQ/gRPC where existing workflows already do so. |
| BR072 | BL050-BL051 | AI service and NestJS services share PostgreSQL state for UserStorage/Document/history records, so schema changes affect both stacks. |
| BR073 | BL030-BL064 | Backend Prisma schema is source of truth, but schema duplicate/divergence between trees must be verified before citing exact fields in later waves. |

## Needs Verification

- Exact role model for teacher/admin and whether `isAdmin` or role arrays are authoritative.
- Exact public/shared access rules for quiz sets, flashcard sets, and exam sessions.
- Exact anti-cheating thresholds and resulting attempt/session actions.
- Exact subscription plan values, credit costs, and backend credit enforcement.
- Exact mobile repository wiring roadmap and whether iOS should migrate from private URLSession auth to shared KMP APIs.
