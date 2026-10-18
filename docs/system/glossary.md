# Glossary — examio Platform

**Project**: examio
**Generated**: 2026-06-05
**Sources**: `data-model.md`, all feature `business-context.md`, `system-overview.md`

Terms are grouped alphabetically. Each entry is a plain-language definition.

---

## A

**Access Code** — A 6-digit numeric code that unlocks a private flashcard deck or exam session. The owner shares the code with specific students instead of making content public.

**AES-256-CBC** — Standard symmetric encryption algorithm used to encrypt quiz questions server-side before sending them to the client. Prevents students from reading questions by inspecting network traffic.

**AIChat** — An AI chat session on the platform. Can optionally be attached to a Subject (AI teacher persona) and one or more documents from the user's knowledge base.

**AIChatDocument** — A junction record linking an AIChat session to a UserStorage document. Enables the AI to answer questions grounded in the uploaded course material rather than generic knowledge.

**AIChatMessage** — A single message in an AI chat session. Each message has a role (user or assistant), text content, and optionally an attached image or document reference.

**AI Service** — Standalone Python FastAPI service responsible for RAG (document retrieval), embedding generation, AI chat orchestration, and AI-assisted quiz/flashcard generation. Exam-service calls it via HTTP.

**Admin Service** — NestJS service providing the admin dashboard backend. Handles KPI/stats, user management (ban/unban/delete/grant admin), finance operations (refund/credit adjust/tier change), log streaming (SSE via ticket exchange), and audit log query. Exposed via gateway proxy at `/api/v1/admin/*` (HTTP port 3000 in containers; no gRPC server). Every controller requires `admin:access` (`@examio/auth-jwt`, `SYSTEM_ADMIN` role); grant/revoke admin go through auth `SetSystemAdmin`.

**Answer Token (JWT)** — A signed JSON Web Token submitted by the client when a student finishes an exam. Contains the map of question IDs to selected answers. The server validates the signature before grading — preventing answer forgery or tampering.

**Assess Type** — A discriminator on ExamSession controlling access mode: `0=PUBLIC` means anyone with the link can join; `1=PRIVATE` requires an access code or explicit whitelist.

**Auth Service** — NestJS service handling authentication, OAuth (Google), session management, device tracking, and account verification. Exposes both HTTP (port 3000) and gRPC (port 50051) interfaces.

**Authz Version (`av`)** — Monotonic integer on `User.authzVersion`, bumped in the same transaction as every role, admin-flag, ban or password change and carried in the access token as claim `av` so stale tokens are detectable.

---

## B

**Base Role** — `User.role`: `STUDENT` (default on register) or `TEACHER`; mutually exclusive. SYSTEM_ADMIN is a separate flag, not a base role.

**Bcrypt Hash** — The hashed representation of a user's password stored in the database. OAuth-only accounts have a null password field.

**Billing Cycle** — How often a subscription renews: either `monthly` or `yearly`. Determines the renewal date and pricing displayed to the user.

---

## C

**Cheating Log** — A per-attempt violation record tracking how many times a student triggered a suspicious behavior (tab switch, window blur, devtools open, copy-paste, right-click, fullscreen exit, print screen). Each violation type gets one upserted record with an incrementing count.

**Chunk** — A segment of extracted text from an uploaded document, used as the basic unit for embedding generation and RAG retrieval. Multiple chunks together form the full document content.

**Chunk Signature** — A hash of all chunk IDs used to build a graph. If the source document changes (new chunks added), the signature changes and the graph is invalidated for rebuild.

**Cloudflare R2** — Object storage service used to store user-uploaded files (PDFs, images). Files are accessed via signed R2 URLs served through r2-service.

**Cloudflare Turnstile** — Bot-protection challenge displayed on sensitive auth forms (signup, login, forgot password). Prevents automated fake account creation.

**Community (Graph)** — A cluster of related chunks detected by the Louvain community detection algorithm within a UserStorageGraph. Represents a semantically coherent section of the document used for selective RAG retrieval.

**Credits** — The platform's virtual currency. Used to pay for AI-powered quiz and flashcard generation. Users purchase credits via SePay bank transfer; TEACHERs receive a 20-credit welcome bonus on wallet creation.

---

## D

**DetailsFlashCard** — A junction record that places a reusable FlashCard into a specific FlashCardSet. Enables the same card to appear in multiple decks with optional per-instance label assignment.

**DetailsQuizQuestion** — A junction record that places a reusable QuizQuestion into a specific QuizSet. Enables question reuse across multiple quizzes with optional per-instance label assignment.

**Discriminator Field** — A database field whose integer value determines the behavioral state of an entity (e.g., `status=0` means UPCOMING, `status=1` means ONGOING). Used throughout the data model to gate UI behavior and business logic.

**Docling** — Document OCR and parsing library used in the Python AI service to extract text from PDFs and scanned documents before chunking.

**Document** — A chunked and embedded representation of an uploaded UserStorage file. One Document per file; stores extracted text content alongside a vector embedding for semantic search.

**Document Entity** — A named entity (person, concept, formula, etc.) extracted from a document during processing. Used for knowledge graph construction and entity-based retrieval in AI chat.

**Domain** — A top-level grouping of related data models. The platform has 5 domains: User & Auth, Quiz/Flashcard Authoring, Exam Lifecycle, Finance, and AI/Storage/RAG.

---

## E

**End User** — A student or teacher who has registered and verified their account on the platform. Can access all non-restricted features (subject to subscription tier).

**Exam Attempt** — A single student's attempt at an ExamSession. Tracks all answers (encrypted), score, violation count, and lifecycle status (in-progress, completed, cancelled).

**Exam Room** — A hosted exam event created by a teacher. References a QuizSet as the question source and can contain one or more ExamSessions (scheduled instances). Is the top-level container for a teacher's exam offering.

**Exam Session** — A specific scheduled instance of an ExamRoom. Holds the time window, time limit, access control settings, and question selection strategy. Students join via ExamAttempt.

**Exam Service** — NestJS service responsible for quiz/flashcard/exam authoring, exam session management, attempt tracking, AI generation orchestration, and RAG document management.

---

## F

**FAISS** — Facebook AI Similarity Search. Library used by the Python AI service to perform fast vector similarity search over document embeddings.

**Finance Service** — NestJS service managing the credit wallet, SePay payment integration, and subscription lifecycle. Exposes gRPC WalletService on port 50051 for synchronous credit operations (`Debit`/`Credit`/`Refund` declared in the contract, `UNIMPLEMENTED` until a later phase).

**FlashCard** — A reusable question/answer pair (front and back). Can appear in multiple FlashCardSets via DetailsFlashCard join records.

**FlashCardSet** — An authored flashcard deck. Can be public (discoverable) or private (access-code protected). Tracks view count and study progress per student.

**FlashCardSetLabel** — A chapter or section label within a FlashCardSet, used to organize and optionally filter cards by topic. Has a name, color, and sort order.

**Flashcard Study Progress** — A per-user, per-deck record tracking which cards in a FlashCardSet the student has studied. Used to resume study sessions and show completion status.

**Flashcard View History** — A denormalized event log recording each time a user views a flashcard deck. Used for "recently viewed" features and analytics.

---

## G

**Gateway Service** — The single public HTTP entry point for all backend traffic. Handles rate limiting (100 req/min), auth token extraction, and proxies requests to downstream NestJS services.

**Gemini** — The LLM model used by the Python AI service for chat, generation, and reasoning tasks.

**gRPC** — Google Remote Procedure Call. Protocol used for synchronous, typed communication between NestJS services (auth-service, finance-service, r2-service) and their callers.

---

## H

**HistoryGeneratedFlashcard** — A record of one AI-generated batch of flashcards from a source document. Stores the serialized flashcard JSON and links to all DetailsFlashCard instances it produced.

**HistoryGeneratedQuizz** — A record of one AI-generated batch of quiz questions from a source document. Stores the serialized question JSON and links to all DetailsQuizQuestion instances it produced.

---

## J

**JWKS** — JSON Web Key Set served by auth-service at `GET /.well-known/jwks.json`; services fetch it to verify RS256 access and service tokens.

**JWT (access token)** — JSON Web Token issued on login. RS256-signed by auth-service (15 min; claims `sub`, `sid`, `roles`, `email_verified`, `av`). Stored in browser localStorage and sent as `Authorization: Bearer` on every API request. Verified statelessly by each service against auth's JWKS.

---

## L

**LangChain / LangGraph** — AI orchestration frameworks used by the Python AI service to chain LLM calls, tool usage, and agentic workflows (e.g., ReAct agent for AI chat with document context).

**Louvain Community Detection** — Algorithm used to group related document chunks into communities within a UserStorageGraph. Produces UserStorageGraphGroup records for selective RAG retrieval.

---

## M

**Model** — A Prisma database entity. The platform has 38 models across 5 domains. Each model maps to a database table.

---

## O

**OCR** — Optical Character Recognition. The process of extracting readable text from scanned PDFs or image-based documents. Handled by the Python AI service via Docling.

**OAuth (Google)** — Third-party authentication via Google. Users click "Sign in with Google", are redirected to Google's auth flow, and return with a valid session without needing a platform password.

---

## P

**Payment** — A payment intent record tracking a SePay virtual account order. Tracks amount, currency, status (unpaid/paid/overdue/cancelled), and payment type (credits or subscription).

**Permission** — A string such as `quizset:manage` from the catalog in `libs/auth-jwt/src/permissions.ts`. Roles hold fixed permission sets; permissions are derived from the token `roles`, never carried in the token. See [permissions](permissions.md).

**Prisma** — ORM used across all NestJS services to interact with the shared PostgreSQL database. Schema lives in `@examio/database`.

**Processing Status** — A discriminator on UserStorage tracking where a document is in the pipeline: `PENDING` → `PROCESSING` → `COMPLETED` or `FAILED`. Controls whether the document is available for AI chat and generation.

**Profile** — The user-editable identity section (name, username, bio, avatar, banner) displayed on the platform. Changes take effect immediately across the platform.

**Protected Route** — A frontend route that requires a valid, verified user session. Unverified users are redirected to the account verification page.

**Public Route** — A frontend route accessible without authentication (e.g., landing page, login, registration, public exam session).

**Public Visibility** — A flag on QuizSet and FlashCardSet controlling whether the content appears in search and browse results. Public content is discoverable by all users; private content is only visible to the owner.

---

## Q

**Question Selection Mode** — A discriminator on ExamSession controlling how questions are chosen for a student's attempt: `ALL` (every question), `RANDOM_TOTAL` (random subset of N questions), or `RANDOM_BY_LABEL` (random N questions per chapter label).

**Quiz Attempt (Practice/Real)** — See QuizPracticeAttempt.

**Quiz加密** — See AES-256-CBC.

**QuizQuestion** — A reusable question item containing the question text, an array of answer option strings, and the correct answer string.

**QuizSet** — An authored collection of questions. The content source for ExamRooms and practice attempts. Can be public or private, organized with QuizSetLabels, and can contain manually authored or AI-generated questions.

**QuizSetLabel** — A chapter or section label within a QuizSet, used to organize and filter questions by topic. Has a name, color, and sort order.

---

## R

**RAG (Retrieval-Augmented Generation)** — AI technique where the system retrieves relevant document chunks before generating a response, grounding AI answers in the user's uploaded course materials rather than generic training data.

**RabbitMQ** — Message broker using a topic exchange (`examio.events`) for asynchronous event-driven workflows between services. Events go through a transactional outbox and an idempotent consumer (`@examio/messaging`). Currently used for wallet creation on user registration.

**ReAct Agent** — An AI agent pattern (Reason + Act) used by the Python AI service to reason about user questions, retrieve relevant document chunks, and generate grounded responses.

**Redis** — In-memory data store used for session caching and general-purpose caching with a 5-minute default TTL.

**Refresh Token** — An opaque JWT stored in an HTTP-only cookie. Used to obtain a new access token when the current one expires. Tracked per session per device.

**ResetPasswordCode** — A one-time 6-digit code sent to the user's email when they request a password reset. Valid for a limited time window.

**R2 Service** — NestJS service managing Cloudflare R2 object storage. Exposes gRPC R2Service on port 50051 for signed upload URL generation and file deletion (`DeleteObjects` for batch).

**RoleChangeLog** — Audit table of every role / admin-flag change (target, actor, from/to role and admin, reason, source `admin-ui` | `cli` | `bootstrap`).

---

## S

**Score** — A floating-point value representing the student's exam result, typically expressed as a percentage (0–100). Compared against the ExamSession's passingScore to determine pass/fail.

**SePay** — Vietnamese payment provider enabling bank transfers via virtual account numbers and QR codes. The platform generates a SePay VA for each payment; a webhook confirms when the transfer is received.

**Service Token** — Short-lived (5 min) JWT for service-to-service calls (`sub = svc:<name>`, `roles = ["SERVICE"]`), obtained from `POST /internal/token` with client credentials and sent as `authorization` header / gRPC metadata.

**Session** — See UserSession.

**Session Cleanup** — A nightly cron job (3:00 AM server time) that deletes expired sessions and deactivates stale sessions (no activity in 30 days or older than 90 days).

**Shuffle Questions** — A flag on ExamSession that randomizes the order of questions per student attempt, preventing answer sharing.

**Slug** — A URL-friendly string derived from a name (e.g., "Artificial Intelligence" → "artificial-intelligence"). Used for Subject and SubjectCategory routing.

**SSE (Server-Sent Events)** — HTTP-based streaming mechanism used for AI chat responses. The server pushes tokens to the client in real time as the AI generates them.

**Student** — A platform user with base role `STUDENT` (the default): studies flashcards, practices quizzes, takes exams, joins study rooms. Has no wallet.

**Subject** — An AI teacher persona defined by a name, icon, and system prompt stored in the database. Students select a Subject when starting an AI chat session.

**SubjectCategory** — A top-level grouping of AI teacher Subjects (e.g., "Mathematics", "Natural Sciences"). Used for UI navigation and organizing the Subject catalog.

**Subscription Tier** — A discriminator on UserSubscription gating feature access: `0=none` (free), `1=basic`, `2=advanced`, `3=vip`. Controls upload limits and AI feature quotas.

**SYSTEM_ADMIN** — Role of an account with `User.isSystemAdmin = true` (replaces `isAdmin`). Holds the admin permissions; can grant TEACHER and the admin flag. Cannot change their own role; the last active one cannot be demoted.

---

## T

**Teacher** — A platform user with base role `TEACHER` (granted only by a SYSTEM_ADMIN) who authors quiz sets, flashcard decks, and exam rooms, and reviews student performance analytics.

**Turnstile** — See Cloudflare Turnstile.

---

## U

**Upload Quota** — A monthly limit on how many files a user can upload, enforced by UserMonthlyFileUpload counters. Limits vary by subscription tier.

**User** — A registered account on the platform. Can be a student (takes exams, studies flashcards) or teacher (authors content). Account may be email/password or OAuth-only.

**UserMonthlyFileUpload** — A per-user monthly counter tracking how many files the user has uploaded in the current calendar month. Enforces subscription-tier upload limits.

**UserPinnedExamRoom** — A pin record linking a user to an ExamRoom for quick access. One record per user per room.

**UserPinnedFlashcard** — A pin record linking a user to a FlashCardSet for quick access. One record per user per deck.

**UserSession** — An active login session tied to a specific device. Tracks device fingerprint, browser, OS, IP, and last activity timestamp. Invalidated on logout or remote device termination.

**UserStorage** — A record of a user-uploaded file (PDF, DOC, TXT). Stores metadata, R2 URL, and processing status. Anchors the document processing pipeline (OCR, chunking, graph building).

**UserStorageGraph** — A community detection graph built from a UserStorage document. One graph per file. Stores chunk count, edge count, community statistics, and readiness status.

**UserStorageGraphGroup** — A semantic community of chunks within a UserStorageGraph. Represents a coherent section of the document used for selective RAG retrieval with an estimated token count for LLM context.

**User Subscription** — A per-user record tracking the current subscription tier, billing cycle, payment dates, and active/inactive status.

---

## V

**VerifyAccountCode** — A one-time 6-digit code sent to the user's email after registration. Entering the code activates the account and unlocks all platform features.

**Virtual Account (SePay)** — A temporary bank account number generated for a payment. The user transfers the purchase amount to this VA; the platform confirms receipt via webhook and activates credits or subscription.

**Violation Count** — The total number of cheating violations recorded against an ExamAttempt. Tracked per violation type in CheatingLog entries.

**VPN Gateway** — The gateway service acts as the single HTTP entry point and reverse proxy for all backend services, centralizing rate limiting, auth, and logging.

---

## W

**Wallet** — A per-user credit balance. The wallet balance is the sum of all WalletTransactions (credits added and spent). Exists only for TEACHERs: created when the account becomes a TEACHER (with a 20-credit welcome bonus); STUDENTs have none.

**Wallet Transaction** — An immutable ledger entry recording a credit change on a Wallet. Includes type (buy credits, subscription, refund, admin adjustment, use services) and direction (ADD or SUBTRACT).

**Webhook (SePay)** — An automated HTTP POST from SePay notifying the platform that a bank transfer was received. Triggers credit activation or subscription renewal.

**Welcome Bonus** — 20 credits added once to a TEACHER's wallet when it is provisioned, by the finance-service's `UserAuthzChangedHandler` consuming `auth.user.authz_changed` with `role = TEACHER` (or lazily on first wallet read).

**Whitelist** — A list of user IDs with explicit access to a private exam session or flashcard deck. In addition to access codes, teachers can grant access to specific students by adding their user IDs.

---

## X

**X-Device-ID** — HTTP header added by the frontend Axios client identifying the browser/device. Sent on every API request and used to track sessions per device and enforce per-device session limits.

---

## Unresolved Questions

The following business questions remain open at the time of this glossary and may affect the definition or behavior of related terms:

1. Does flashcard study progress reset when the deck owner adds new cards?
2. Is there brute-force protection on access code attempts?
3. If AI generation fails after credits were deducted, are credits automatically restored?
4. When AI generates questions from a shared document, who is listed as the question author — the document uploader or the initiator?
5. If a teacher deletes a deck that students have studied, is individual card progress preserved or removed?
6. Can a teacher share their knowledge base with specific students, or is it purely personal?
7. What file formats produce the best AI quality for chunking — plain text vs. scanned PDF?
8. Can users rate or flag generated content to improve future generations?
9. Who owns AI-generated questions and flashcards — the document uploader, the initiator, or the platform?
10. Is the score shown as a percentage, fraction, or letter grade?
11. Can a student retake an exam after passing — is there a cooldown period?
12. Are students penalized for cheating violations, or is the log purely informational?
13. If a student loses internet mid-exam and `sendBeacon` fails, does the server auto-submit based on server-side time?
14. Are cheating logs visible to students after the exam, or only to the teacher?
15. Is daily session cleanup sufficient, or should short-TTL sessions be cleaned more frequently?
16. Are session cleanup deletions processed in batches to avoid table locking?
