# Permissions Matrix

> Note: This matrix is a grouped permission summary. `permissions.md` is the canonical detailed permission catalog (`PERM001`-`PERM040`); this matrix intentionally collapses related detailed permissions into broader capability rows for quick review.


Source artifacts: `permissions.md`, `screen-list.md`, `route-list.md`, `scout-report.md`.

| Code | Capability | Public | Auth User | Owner/Host | Admin | System/API Key | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| PERM001 | Landing/legal page access | Yes | Yes | Yes | Yes | No | Public web pages. |
| PERM002 | Register/login/OAuth/password reset | Yes | N/A | N/A | N/A | No | Auth endpoints are public with validation. |
| PERM003 | Current user/session/profile read | No | Yes | Own only | Yes | No | Uses JWT/cookie/Bearer/session guards. |
| PERM004 | Profile update/avatar/banner upload | No | Yes | Own only | Yes | No | Media uses R2/image endpoints. |
| PERM005 | Device/session management | No | Yes | Own sessions | Yes | No | Logout device/all others. |
| PERM006 | Quiz set CRUD | No | Yes | Owner | Yes | No | Public/shared quiz read may exist; exact routes need verification. |
| PERM007 | Flashcard set CRUD/study/share | Mixed | Yes | Owner | Yes | No | Standalone study route relies API access checks. |
| PERM008 | Exam room/session management | No | Yes | Host/owner | Yes | No | TeacherRoute on web currently only checks auth. |
| PERM009 | Exam attempt participation | Mixed | Yes | Attempt owner | Host analytics | No | Join by code/link may be public/API-level. |
| PERM010 | Cheating log creation/read | No | Yes | Attempt owner/log owner | Host analytics | No | Proctoring logs from web hook/API. |
| PERM011 | AI upload/generation/chat | No | Yes | Own uploads/chats | Yes | No | Benefits/credits checked server-side; frontend FREE_MODE bypasses only client checks. |
| PERM012 | GenAI tutor knowledge management | No | Yes | Owner? | Yes | No | Access rules clarified; admin-service enforces. |
| PERM013 | Wallet/payment/subscription | No | Yes | Own wallet/payment | Yes | SePay webhook | Webhook protected by API key. |
| PERM014 | R2 storage operations | No | Yes | Own files | Yes | gRPC internal | Product rule: deleting DB record with R2 asset should delete R2 object too. |
| PERM015 | Service-to-service gRPC auth/wallet/r2/ocr/subscription | No | No | No | No | Internal services | Proto contracts in `libs/common/src/protos`. |
| PERM016 | RabbitMQ events | No | No | No | No | Internal services | Topic exchange `examio.events`. |
| PERM017 | Mobile auth flows | Yes | N/A | N/A | N/A | No | Android/iOS email+OAuth auth real. |
| PERM018 | Mobile non-auth feature data | No | Intended auth | Intended own data | Yes | No | Shared API/repo ready; platform UI mostly mock-backed. |
| PERM046 | Admin dashboard access | No | No | No | Yes | No | AdminGuard in `@examio/common`; `User.isAdmin = true` required. |
| PERM047 | Admin user management (ban/unban/delete) | No | No | No | Yes | No | AdminUsersModule; all mutations write AdminAudit rows. |
| PERM048 | Admin grant/revoke admin role | No | No | No | Yes | No | AdminUsersModule; all mutations write AdminAudit rows. |
| PERM049 | Admin wallet refund | No | No | No | Yes | No | AdminFinanceModule; writes WalletTransaction refund + AdminAudit. |
| PERM050 | Admin credit adjustment | No | No | No | Yes | No | AdminFinanceModule; writes WalletTransaction adjustment + AdminAudit. |
| PERM051 | Admin subscription tier change | No | No | No | Yes | No | AdminFinanceModule; updates UserSubscription + AdminAudit. |
| PERM052 | Admin audit log view | No | No | No | Yes | No | AdminAuditModule; queries AdminAudit table. |
| PERM053 | Admin log view + SSE stream | No | No | No | Yes | No | AdminLogsModule; ticket exchange SSE + polling fallback. |

## Unresolved Questions
- Exact teacher/admin role gating for web and backend routes needs verification.
- Public/shared quiz/flashcard/exam access matrix needs route-level confirmation.
- GenAI knowledge manager authorization semantics need verification.