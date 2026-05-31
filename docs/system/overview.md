# System Overview

Generated: 2026-05-27

## Scope

Examio is a three-workspace learning and exam platform:

- Backend: `examio-be/` NestJS monorepo plus Python FastAPI AI/OCR services.
- Frontend: `examio-fe/` React 19 + Vite + TypeScript web app.
- Mobile: `examio-app/` Kotlin Multiplatform app with Android Compose and iOS SwiftUI.

Sources: `plans/260527-1951-rebuild-spec/artifacts/_session-context.md`, `plans/260527-1951-rebuild-spec/artifacts/scout-report.md`.

## Backend Architecture

- Public entry point is `gateway-service` on port 3000, forwarding `/api/v1/*` traffic to internal services through proxy controllers.
- Domain services include `auth-service`, `exam-service`, `finance-service`, `r2-service`, `ocr-service`, and Python `ai-service`.
- Shared libraries are `@examio/common`, `@examio/database`, and `@examio/redis`.
- Persistence uses PostgreSQL through Prisma; Redis is used for caching; RabbitMQ topic exchange `examio.events` handles async events.
- gRPC contracts connect auth, wallet/subscription, R2 storage, and OCR services.

Sources: `scout-report.md` lines 20-37, 61-93, 365-430, 499-530.

## Core Service Roles

| Service | Role | Source |
|---|---|---|
| `gateway-service` | API gateway/reverse proxy for FE/mobile clients | `scout-report.md` lines 61-93 |
| `auth-service` | Registration, login, OAuth, JWT/session/device management | `scout-report.md` lines 96-147 |
| `exam-service` | Quiz, flashcard, exam room/session/attempt, AI integration, file metadata | `scout-report.md` lines 150-175 |
| `finance-service` | Wallet, payments, SePay, subscriptions | `scout-report.md` lines 178-213 |
| `r2-service` | Cloudflare R2 file upload/download/signed URL/list/delete | `scout-report.md` lines 216-240 |
| `ai-service` | OCR, RAG, AI chat, quiz/flashcard generation, tutor knowledge | `scout-report.md` lines 243-333 |
| `ocr-service` | Hybrid NestJS gRPC + Python OCR backend | `scout-report.md` lines 336-361 |

## Web Frontend Architecture

- React Router v7 defines public, auth, protected workspace, and standalone study/exam routes.
- Axios instance uses `VITE_API_URL=/api/v1`, sends credentials, injects bearer token and `X-Device-ID`, and refreshes tokens on 401.
- Zustand stores hold feature state for auth, quiz sets, flashcards, exam rooms/sessions, AI generation/chat, model catalog, stats, student materials, and GenAI knowledge.
- `storeCache` provides in-memory TTL caching and mutation invalidation across stores.
- UI is organized into pages, templates, components, hooks, stores, APIs, and types.

Sources: `scout-report.md` lines 797-805, 828-887, 891-947.

## Mobile Architecture

- KMP shared module provides Ktor API services, repositories, models, token storage interfaces, and common async result types.
- Android uses Compose with local mutable UI state and manual DI through `AndroidAppContainer`.
- iOS uses SwiftUI with `AuthViewModel` for auth and local `@State` for most feature screens.
- Mobile data flow is `View -> UiState -> Repository -> ApiService -> Backend`.
- Auth is real on Android and iOS; most non-auth platform screens currently use mock UiState data despite real shared API/repository layers.

Sources: `scout-report.md` lines 1146-1168, 1201-1288, 1305-1459, 1462-1488.

## Key End-To-End Flows

### Authentication

1. Client calls gateway `/api/v1/auth/login` or `/api/v1/auth/register`.
2. `auth-service` issues JWT access token, refresh token, and session ID.
3. Web stores tokens in localStorage/cookies; mobile stores tokens in Android secure storage or iOS Keychain.
4. Subsequent requests authenticate by cookie first or bearer fallback.
5. Refresh uses `/auth/refresh`; session/device tracking uses `X-Device-ID`.

Sources: `scout-report.md` lines 533-557, 951-975, 1440-1459.

### AI File Processing

1. Client uploads file through gateway `/api/v1/ai/quick-upload` or `/api/v1/ai/upload`.
2. `exam-service` uploads to R2 through `R2Service.UploadFile`.
3. `exam-service` creates `UserStorage` metadata.
4. `ai-service` processes OCR/chunks/embeddings and writes `Document` records.
5. `UserStorage.processingStatus` tracks processing lifecycle.

Sources: `scout-report.md` lines 584-590, 599-608.

### Exam Taking

- Web has standalone `/exam-session/:id` and `/exam-session/:id/quiz` routes without route guard; access is handled by API-level checks.
- Exam attempt APIs handle start/resume/submit/progress/secure quiz.
- Anti-cheating uses browser hooks for tab/window/devtools/copy/paste/fullscreen signals and logs violations.
- Mobile shared API has secure quiz models and exam attempt repository support; platform UIs are currently mock-backed.

Sources: `scout-report.md` lines 883-887, 913-922, 1042-1049, 1264-1270, 1478-1487.

## Known Gaps / Needs Verification

- `TeacherRoute.tsx` only checks authentication, not teacher/admin role.
- Web has remnants of prior Next.js migration; route/proxy prefix consistency needs verification.
- Mobile SSE clients are stubs on both Android and iOS.
- iOS KMP secure token storage is stubbed; actual token store is private Swift code.
- Most Android/iOS non-auth screens use mock UiState rather than repositories.

## Resolved Gaps (since 2026-05-27)

- `FREE_MODE` changed from `true` to `false` — credit and subscription checks are now fully enforced in production. The flag is strictly development-only and must never be `true` in production commits.
- Environment variable validation: `QUIZ_JWT_SECRET` and `QUIZ_AES_KEY` are now validated at startup (required, minimum 32-char length for JWT secret). Services fail to initialize with descriptive errors instead of silently falling back to weak defaults.
- Code generation: `generateCode()` uses `crypto.randomInt()` instead of `Math.random()` for cryptographically secure random codes (password reset, verification, exam access codes).
- Webhook API key validation: SePay webhooks now use `crypto.timingSafeEqual()` for timing-attack-safe comparison. Invalid API keys throw `UnauthorizedException` instead of silently returning `false`.
- Auth redirect loop prevention: `handleAuthFailure` and 403 session invalidation handlers skip `setRedirectBackTarget` when the current path is `/login`, preventing redirect loops.
- Standalone study/exam routes: `/study-flashcard/:id`, `/exam-session/:id`, and `/exam-session/:id/quiz` now include client-side auth checks that redirect unauthenticated users to `/login?from=...`.

Sources: git diffs `0a16bed..be6471c`, commit range May 27–May 31 2026.
