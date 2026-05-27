# Permissions Matrix

> Note: This matrix is a grouped permission summary. `permissions.md` is the canonical detailed permission catalog (`PERM001`-`PERM040`); this matrix intentionally collapses related detailed permissions into broader capability rows for quick review.


Source artifacts: `permissions.md`, `screen-list.md`, `route-list.md`, `scout-report.md`.

| Code | Capability | Public | Auth User | Owner/Host | Admin/Teacher | System/API Key | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| PERM001 | Landing/legal page access | Yes | Yes | Yes | Yes | No | Public web pages. |
| PERM002 | Register/login/OAuth/password reset | Yes | N/A | N/A | N/A | No | Auth endpoints are public with validation. |
| PERM003 | Current user/session/profile read | No | Yes | Own only | Admin needs verification | No | Uses JWT/cookie/Bearer/session guards. |
| PERM004 | Profile update/avatar/banner upload | No | Yes | Own only | Admin needs verification | No | Media uses R2/image endpoints. |
| PERM005 | Device/session management | No | Yes | Own sessions | Admin needs verification | No | Logout device/all others. |
| PERM006 | Quiz set CRUD | No | Yes | Owner | Admin needs verification | No | Public/shared quiz read may exist; exact routes need verification. |
| PERM007 | Flashcard set CRUD/study/share | Mixed | Yes | Owner | Admin needs verification | No | Standalone study route relies API access checks. |
| PERM008 | Exam room/session management | No | Yes | Host/owner | Teacher/Admin intended | No | TeacherRoute on web currently only checks auth. |
| PERM009 | Exam attempt participation | Mixed | Yes | Attempt owner | Host analytics | No | Join by code/link may be public/API-level. |
| PERM010 | Cheating log creation/read | No | Yes | Attempt owner/log owner | Host analytics | No | Proctoring logs from web hook/API. |
| PERM011 | AI upload/generation/chat | No | Yes | Own uploads/chats | Admin needs verification | No | Benefits/credits checked server-side; frontend FREE_MODE bypasses only client checks. |
| PERM012 | GenAI tutor knowledge management | No | Needs verification | Owner? | Teacher/Admin intended | No | Access rules unclear; web allowed-email/admin behavior needs verification. |
| PERM013 | Wallet/payment/subscription | No | Yes | Own wallet/payment | Admin needs verification | SePay webhook | Webhook protected by API key. |
| PERM014 | R2 storage operations | No | Yes | Own files | Admin needs verification | gRPC internal | Product rule: deleting DB record with R2 asset should delete R2 object too. |
| PERM015 | Service-to-service gRPC auth/wallet/r2/ocr/subscription | No | No | No | No | Internal services | Proto contracts in `libs/common/src/protos`. |
| PERM016 | RabbitMQ events | No | No | No | No | Internal services | Topic exchange `examio.events`. |
| PERM017 | Mobile auth flows | Yes | N/A | N/A | N/A | No | Android/iOS email+OAuth auth real. |
| PERM018 | Mobile non-auth feature data | No | Intended auth | Intended own data | Needs verification | No | Shared API/repo ready; platform UI mostly mock-backed. |

## Unresolved Questions
- Exact teacher/admin role gating for web and backend routes needs verification.
- Public/shared quiz/flashcard/exam access matrix needs route-level confirmation.
- GenAI knowledge manager authorization semantics need verification.