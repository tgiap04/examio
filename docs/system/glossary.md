# Examio Glossary

Generated: 2026-05-27 20:54 Asia/Saigon
Source artifacts: `_session-context.md`, `data-model.md`, `feature-list.md`, `features/*/business-context.md`, `api-map.md`.

## Product Terms

- **Examio**: Learning and assessment platform spanning web, backend services, AI/OCR processing, and Android/iOS mobile companion apps.
- **Workspace**: Authenticated user area under `/k` where users navigate materials, history, AI tools, profile, subscriptions, and teacher flows.
- **My Materials**: Workspace area for recent or pinned study content such as quiz sets, flashcard sets, exam materials, and uploaded/generated files.
- **History**: User-facing record of prior exam attempts, uploaded PDFs/files, and AI-generated quiz or flashcard outputs.
- **Mobile Companion**: Kotlin Multiplatform-based Android/iOS app intended to expose auth, study, AI, exam, history, account, wallet, and teacher workflows.
- **Teacher/Host**: User role/persona that creates quiz content, exam rooms, exam sessions, and reviews student outcomes; exact role enforcement needs verification.
- **Student/Learner**: User role/persona that studies materials, takes exams, uses AI tools, and manages personal account/payment state.

## Auth, Profile & Sessions

- **User**: Core account record with identity, email, username/name, profile media, verification/admin flags, and password data.
- **Authentication API**: Gateway/auth-service routes for register, login, logout, refresh, current user, password reset/change, Google OAuth, and Google One Tap.
- **Session**: Authenticated continuity record backed by refresh/session/device tracking so users remain signed in across requests and clients.
- **UserSession**: Persisted session/device record containing session ID, refresh token, device ID/name, browser, OS, IP, and location metadata.
- **Refresh Token**: Long-lived token used to renew access without forcing the user to log in again; tracked per user session/device.
- **Bearer Fallback**: Backend support for bearer authorization tokens when cookie-first auth is not available.
- **Device Management**: Profile/security feature for listing active sessions/devices and revoking sessions that are no longer trusted.
- **Email Verification**: Flow that sends and validates a verification code to prove ownership of an account email.
- **VerifyAccountCode**: Database record for email verification codes; exact fields need schema verification.
- **ResetPasswordCode**: Database record for password recovery codes; exact fields need schema verification.
- **OAuth / Google Sign-In**: Social login path using Google redirect, callback, or One Tap instead of email/password.
- **Profile Media**: Avatar and banner images uploaded through storage/R2 flows and reused across clients.

## Learning Content

- **Quiz Set**: Reusable collection of quiz questions, labels, tags, sharing/access flags, and generated/manual study content.
- **Quiz Question**: Individual question item with question text, answer/options data, and related details.
- **DetailsQuizQuestion**: Junction/link entity between quiz sets, questions, history, and labels.
- **Quiz Set Label**: Organizational label for grouping or categorizing quiz sets/questions.
- **Quiz Practice Attempt**: Practice-mode tracking record for answers, score, time, marked questions, and attempt type.
- **Flashcard Set**: Reusable collection of flashcards with title, tags, access code, whitelist, and sharing/access behavior.
- **Flashcard**: Individual recall card with question/front and answer/back content.
- **DetailsFlashCard**: Junction/link entity between flashcard sets, flashcards, and history.
- **Flashcard Study Session**: User flow for reviewing cards, submitting answers/progress, and resuming repetition work.
- **Generated Quiz History**: Saved AI-generated quiz output linked to a user upload/storage item.
- **Generated Flashcard History**: Saved AI-generated flashcard output linked to a user upload/storage item.
- **Student Materials API**: Student-facing gateway routes for recent materials, pinned materials, and access to quiz/flashcard/exam resources.

## Exams & Integrity

- **Exam Room**: Teacher/host-owned container for assessment setup, linked quiz content, sessions, analytics, and participant workflows.
- **Exam Session**: Scheduled or shareable exam occurrence within a room, with status, timestamps, access code, whitelist, passing score, and retake rules.
- **Exam Attempt**: Student's active or completed exam-taking record containing answers, score, current index, marked questions, violation count, and status.
- **Secure Quiz Payload**: Protected/encrypted quiz content sent to students during exam-taking; exact route and response shape need verification.
- **Access Code**: Code used to join protected flashcard sets or exam sessions, depending on feature context.
- **Whitelist**: Allowed-user list for restricting flashcard or exam session access.
- **Retake Rule**: Session configuration controlling whether and how students can attempt an exam again.
- **Passing Score**: Minimum score threshold configured for an exam session.
- **Marked Questions**: Questions flagged by the student during practice or exam-taking for later review.
- **Cheating Log**: Proctoring/integrity record tied to an exam attempt and violation type.
- **Proctoring Signal**: Browser or environment event such as tab switch, window blur, or devtools open used to create cheating logs.
- **Integrity Logging**: Capture and persistence of suspicious exam-taking behavior for teacher review and analytics.

## Wallet, Payments & Subscription

- **Wallet**: One-to-one user finance account storing balance and enabling paid feature usage.
- **Wallet Transaction**: Ledger entry for balance movement, including amount, type, and direction such as `ADD` or `SUBTRACT`.
- **Payment**: Finance record for a purchase/payment attempt with amount, currency, status, payment type, and SePay virtual-account data.
- **Subscription**: User paid-tier state used to unlock benefits; current tier values are `0=none`, `1=basic`, `2=advanced`, `3=vip`.
- **Subscription Benefits**: Capabilities/limits returned through finance gRPC and used by other services to decide paid feature access.
- **SePay**: Payment provider integrated through QR/status/history flows and webhook callbacks.
- **Payment Webhook**: External callback endpoint used by SePay to confirm payment success/failure and trigger wallet/subscription updates.
- **Payment Polling**: Client behavior that checks payment status until success, cancellation, failure, or timeout.
- **FREE_MODE**: Web frontend bypass flag currently noted as bypassing credit checks; production intent needs verification.

## Storage, OCR & AI

- **R2**: Cloudflare R2 object storage used for user uploads, profile media, generated-history source files, and AI/tutor files.
- **R2 Service**: Backend storage service exposing upload, signed URL, delete, and list operations via gRPC and gateway/exam-service routes.
- **UserStorage**: Database metadata for uploaded files, including filename, URL, mimetype, size, R2 key, processing status, and credit charge.
- **Document**: OCR-processed text chunk/page record with page range, title, content, and embedding vector for retrieval/generation.
- **OCR**: Optical character recognition pipeline that extracts text from PDFs/images for AI generation and retrieval.
- **OCR Service**: Hybrid NestJS gRPC and Python backend service exposing `ProcessPdf` and health check behavior.
- **RAG**: Retrieval-augmented generation flow where uploaded document chunks are retrieved and used as context for AI answers or generation.
- **GraphRAG**: Graph-based retrieval artifact/approach using entities/relationships or graph snapshots to improve contextual AI answers.
- **UserStorageGraph**: Graph/RAG artifact associated with uploaded storage; exact active schema and fields need verification.
- **UserStorageGraphGroup**: Grouping artifact for storage graphs; exact active schema and fields need verification.
- **Embedding**: Vector representation of document text used by retrieval search and AI context selection.
- **AI Upload Job**: Asynchronous upload/process/generation task that can be polled by job ID or upload ID.
- **AI Generation**: Flow that turns uploaded documents/images into quiz or flashcard outputs and optionally saves them as reusable content.
- **AI Model Catalog**: API-backed list/defaults of available AI models for generation or tutor flows.
- **AI Tutor / Virtual Tutor**: Conversational assistant that answers learner questions using subjects, images, uploaded documents, and tutor knowledge sources.
- **AI Chat**: Persisted chat session with messages, optional images, and document context.
- **AI Chat Message**: Message record with role, content, optional image URL, and document references.
- **AI Chat Document**: Link between an AI chat and a user storage item for multi-document chat.
- **SSE Streaming**: Server-sent events used by web AI chat to stream model responses; mobile streaming is noted as incomplete/stubbed.
- **Tutor Knowledge Base**: Teacher/admin-managed AI tutor sources including folders, files, dataset imports, graph snapshots, and reprocessing jobs.
- **Dataset Import**: Tutor knowledge ingestion job that imports predefined or uploaded datasets into the tutor knowledge system.

## Backend & Integration Terms

- **Gateway Service**: Public HTTP entry point that exposes `/api/v1/*` routes and proxies to downstream backend services.
- **Auth Service**: NestJS service responsible for account auth, sessions, OAuth, profile/session helpers, and auth gRPC methods.
- **Exam Service**: NestJS domain service for quiz/flashcard/exam/AI orchestration, including calls to R2, finance, and Python AI services.
- **Finance Service**: NestJS service for wallet, payment, subscription, and finance gRPC behavior.
- **AI Service**: Python FastAPI service for RAG, OCR/document processing, chat, generation, entity extraction, graph stats, and tutor APIs.
- **gRPC Contract**: Service-to-service typed API, including auth, wallet, subscription, R2, and OCR proto packages.
- **RabbitMQ Event**: Asynchronous domain message on `examio.events`, including user, payment/wallet/subscription, exam, and OCR events.
- **Wallet Bootstrap**: Finance-side creation of a user wallet triggered by user registration or `user.created` event.
- **Prisma Schema**: Shared PostgreSQL model source of truth under backend database library.
- **Zustand Store**: Web frontend feature state layer that calls API wrappers and caches/manages client state.
- **Axios API Client**: Web HTTP client layer that attaches bearer/device headers and handles auth/session failures.

## Mobile & Platform Terms

- **KMP**: Kotlin Multiplatform shared code layer used by Android and iOS for API services, repositories, DTOs, and auth-related logic.
- **Android Compose**: Native Android UI toolkit used by the mobile companion app.
- **SwiftUI**: Native iOS UI toolkit used by the iOS companion app.
- **Secure Storage**: Mobile token/session storage pattern; iOS currently uses separate Swift/Keychain auth storage and shared KMP iOS storage needs verification.
- **Mock UiState**: Local sample state used by many non-auth mobile screens before production repository wiring is complete.
- **DTO Parity**: Requirement that mobile/web type shapes match backend DTOs for auth, study, exams, payments, AI chat, and subscription data.
- **Deep Link**: Mobile/web route entry from an external link; non-auth mobile deep-link completion needs verification.

## Unresolved Terms / Needs Verification

- Exact backend role model and enforcement for teacher/admin-only flows.
- Exact device management route list and route naming.
- Exact secure quiz route names and encrypted payload shape.
- Exact cheating violation thresholds and whether violations warn, score, or terminate attempts.
- Exact subscription plan endpoints and production behavior for `FREE_MODE`.
- Exact R2 HTTP proxy route coverage and delete ordering between database records and remote objects.
- Exact subject/category persisted model names and fields.
- Exact GenAI tutor knowledge database tables and permission model.
- Whether `UserStorageGraph` and `UserStorageGraphGroup` are active Prisma models or planned/context-only terms.

**Status:** DONE
**Summary:** Created concise Examio product/domain/technical glossary from existing rebuild specs at `plans/260527-1951-rebuild-spec/artifacts/glossary.md`.
**Concerns/Blockers:** Some source artifacts mark role enforcement, route coverage, GraphRAG storage models, and mobile wiring as needing verification; listed unresolved terms above.
