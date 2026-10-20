# Permissions Matrix

> Note: This matrix is a grouped permission summary. `permissions.md` is the canonical detailed permission catalog (`PERM001`-`PERM040`); this matrix intentionally collapses related detailed permissions into broader capability rows for quick review.


> Current roles (phase 04): `STUDENT`, `TEACHER`, `SYSTEM_ADMIN` (flag). The role-to-permission table is in `docs/system/permissions.md` § Current RBAC Catalog (source `libs/auth-jwt/src/permissions.ts`). "Auth User" below means STUDENT or TEACHER; "Owner/Host" rows that author content (PERM006-PERM008, PERM011) now additionally require the TEACHER role; legacy columns are otherwise unchanged and will be regenerated in plan phase 19.

> Phase 06 (2026-10-20): each exam/finance/admin/r2 endpoint now enforces a named permission (`system/permissions.md` § Per-endpoint enforcement; source: controllers + `examio-be/test/authz/`). Non-owned resources answer 404, a missing permission 403 `PERMISSION_DENIED`. Rows below changed as noted; other columns are still legacy until plan phase 19.

Source artifacts: `permissions.md`, `screen-list.md`, `route-list.md`, `scout-report.md`.

| Code | Capability | Public | Auth User | Owner/Host | Admin | System/API Key | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| PERM001 | Landing/legal page access | Yes | Yes | Yes | Yes | No | Public web pages. |
| PERM002 | Register/login/OAuth/password reset | Yes | N/A | N/A | N/A | No | Auth endpoints are public with validation. |
| PERM003 | Current user/session/profile read | No | Yes | Own only | Yes | No | Uses JWT/cookie/Bearer/session guards. |
| PERM004 | Profile update/avatar/banner upload | No | Yes | Own only | Yes | No | Media uses R2/image endpoints. |
| PERM005 | Device/session management | No | Yes | Own sessions | Yes | No | Logout device/all others. |
| PERM006 | Quiz set CRUD | No | Yes | Owner | Yes | No | `quizset:manage` (TEACHER). The public quiz read `GET /quizsets/public/:id` was removed in phase 06. Phase 07: quiz sets are shareable (`content:share`, owner only; whitelist, code, `isPublic`) and students practise granted sets via `quiz:practice` (`/quiz-practice/*`). |
| PERM007 | Flashcard set CRUD/study/share | Mixed | Yes | Owner | Yes | No | Manage = `flashcardset:manage`; share = `content:share` (owner only); study = `flashcard:study` or owner. Access = public / owner / whitelist / code; no grant = 404. `GET /flashcardsets/public/:id` stays anonymous (trimmed payload). |
| PERM008 | Exam room/session management | No | Yes | Host/owner | Yes | No | Rooms `exam_room:manage`, sessions `exam_session:manage` (host only, TEACHER). `GET /examrooms/get-public/:id` is an anonymous teaser (no email). |
| PERM009 | Exam attempt participation | Mixed | Yes | Attempt owner | Host analytics | No | Taking = `exam:take` (STUDENT; hosts cannot start attempts). Results = `exam_result:view` (host). Code entry is authenticated and locks after 5 wrong codes / 15 min. |
| PERM010 | Cheating log creation/read | No | Yes | Attempt owner/log owner | Host analytics | No | Create = `exam:take` (attempt owner); read = `exam_result:view` (host); others get 404. |
| PERM011 | AI upload/generation/chat | No | Yes | Own uploads/chats | Yes | No | `document:upload`, `ai:generate`, `ai_chat:use` (TEACHER); own data only. Word-family generation `word_family:generate` (TEACHER, 20/day). Credits checked server-side; frontend FREE_MODE bypasses only client checks. |
| PERM012 | GenAI tutor knowledge management | No | Yes | Owner? | Yes | No | Access rules clarified; admin-service enforces. |
| PERM013 | Wallet/payment/subscription | No | Yes | Own wallet/payment | Yes | SePay webhook | `wallet:use` / `subscription:manage` (TEACHER); webhook protected by API key. |
| PERM014 | R2 storage operations | No | Yes | Own files | Yes | gRPC internal | `POST /r2/image` needs `document:upload`. Product rule: deleting DB record with R2 asset should delete R2 object too. |
| PERM015 | Service-to-service gRPC auth/wallet/r2/ocr/subscription | No | No | No | No | Internal services | Proto contracts in `examio-be/proto/`; callers present a service token (`authorization` gRPC metadata). |
| PERM016 | RabbitMQ events | No | No | No | No | Internal services | Topic exchange `examio.events`. |
| PERM017 | Mobile auth flows | Yes | N/A | N/A | N/A | No | Android/iOS email+OAuth auth real. |
| PERM018 | Mobile non-auth feature data | No | Intended auth | Intended own data | Yes | No | Shared API/repo ready; platform UI mostly mock-backed. |
| PERM046 | Admin dashboard access | No | No | No | Yes | No | `@RequirePermissions('stats:read')` on the stats controllers (the class-level `admin:access` was replaced per controller in phase 06); `SYSTEM_ADMIN` role (`User.isSystemAdmin`) required. Includes `GET /admin/stats/sources` (+ alias `GET /admin/sources`) — signup breakdown by `utm_source`. |
| PERM047 | Admin user management (ban/unban/delete) | No | No | No | Yes | No | `user:manage`; PATCH no longer accepts `isAdmin`; AdminUsersModule; all mutations write AdminAudit rows. |
| PERM048 | Admin grant/revoke admin role | No | No | No | Yes | No | AdminUsersModule via auth `SetSystemAdmin` (`role:assign`); self-change blocked, last admin protected; writes AdminAudit + RoleChangeLog. TEACHER grant: auth CLI only. |
| PERM049 | Admin wallet refund | No | No | No | Yes | No | AdminFinanceModule; writes WalletTransaction refund + AdminAudit. |
| PERM050 | Admin credit adjustment | No | No | No | Yes | No | AdminFinanceModule; writes WalletTransaction adjustment + AdminAudit. |
| PERM051 | Admin subscription tier change | No | No | No | Yes | No | AdminFinanceModule; updates UserSubscription + AdminAudit. |
| PERM052 | Admin audit log view | No | No | No | Yes | No | AdminAuditModule; queries AdminAudit table. |
| PERM053 | Admin log view + SSE stream | No | No | No | Yes | No | AdminLogsModule; ticket exchange SSE + polling fallback. |

## Unresolved Questions
- GenAI knowledge manager authorization semantics need verification.