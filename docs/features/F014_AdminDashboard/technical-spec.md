# F014_AdminDashboard

**Priority**: P1
**Type**: ui
**Generated**: 2026-07-03

## Overview

Full-stack admin operations console backed by a dedicated `admin-service` (port 7006, gRPC 50056). Six modules cover platform-wide KPI/analytics, user management (ban/unban) and role management (STUDENT/TEACHER, SYSTEM_ADMIN flag, change history), finance operations (refund/credit-adjust/tier-change), server log viewing with SSE streaming, and audit log query. All admin mutations write one `AdminAudit` row per changed field, and all admin routes are gated by a standalone `AdminGuard`.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Admin can view platform KPI overview and time-series analytics | `admin-stats` module | yes |
| FR-007 | Admin can view signup breakdown by `utm_source` (null → "direct"), top 20 desc | `GET /admin/stats/sources` (+ alias `GET /admin/sources`) | yes |
| FR-002 | Admin can list, view, edit profile fields, ban and unban users; list rows show `role` and `isSystemAdmin` read-only | `admin-users` module (`GET/PATCH /admin/users`, `POST :id/ban|unban`) | yes |
| FR-003 | Admin can refund a payment, adjust credit balance, or change subscription tier | `admin-finance` module | yes |
| FR-004 | Admin can view and stream server logs in real time | `admin-logs` module (SSE ticket exchange) | yes |
| FR-005 | Admin can query the audit log of all admin actions | `admin-audit` module | yes |
| FR-008 | Admin can view the role to permission matrix | `GET /admin/roles` (`role:assign`) | yes |
| FR-009 | Admin can list users with role / admin flag (filters `q`, `role`, `isSystemAdmin`, paging) and see `systemAdminCount` | `GET /admin/roles/users` | yes |
| FR-010 | Admin can set a user's base role STUDENT/TEACHER and grant/revoke SYSTEM_ADMIN, with an optional reason; own row 403, last active admin 409 | `PUT /admin/roles/users/:id/role`, `PUT /admin/roles/users/:id/system-admin` | yes |
| FR-011 | Admin can read the role change history, newest first, with actor/target emails and source (`admin-ui`, `cli`, `bootstrap`) | `GET /admin/roles/changes` | yes |
| FR-012 | Ban and unban go through auth `SetUserStatus`: self 403, sessions revoked on ban, `authzVersion` bumped; `PATCH /admin/users/:id` rejects `role`, `isSystemAdmin`, `isBanned` (400 `VALIDATION_ERROR`) | `admin-users` module | yes |
| FR-006 | New admin accounts are provisioned/synced from an env allowlist on service startup | `admin-bootstrap` module | yes |

**Source:** `examio-be/apps/admin-service/src/admin-service.controller.ts`, `examio-be/apps/admin-service/src/modules/{admin-stats,admin-users,admin-finance,admin-logs,admin-audit,admin-bootstrap}/`

### Business Rules

- **BR-001**: `AdminGuard` performs its own standalone JWT verification and Prisma user lookup — it does not inherit from `AuthGuard` — specifically to avoid double `canActivate` execution and circular dependencies between guards.
- **BR-002**: All `/api/v1/admin/*` routes are throttled to 30 requests/minute per admin session (`ThrottlerModule`, `name: 'admin'`).
- **BR-003**: There is no user delete route in `AdminUsersController`. Ban sets `isBanned` only (no `deletedAt`) and revokes every session; unban also clears a legacy `deletedAt`.
- **BR-004**: Every admin mutation writes one `AdminAudit` row per changed field via a shared `AuditWriterService`, capturing admin ID, action, target, payload, IP, and user agent.
- **BR-005**: Finance operations (refund, credit adjustment, tier change) run inside `$transaction` with `Serializable` isolation to prevent race conditions on wallet/subscription state.
- **BR-006**: Server log viewing uses a ticket-exchange SSE pattern: `POST /admin/logs/ticket` issues a single-use Redis-backed ticket (300s TTL), then `GET /admin/logs/stream?ticket=` opens the actual stream — avoiding long-lived unauthenticated stream URLs.
- **BR-007**: Log output passes through a PII redactor before being returned — 4 patterns redacted: email, Bearer token, password JSON, JWT patterns.
- **BR-009** (phase 08): Role, admin-flag and ban changes are decided by auth (`SetUserRole`, `SetSystemAdmin`, `SetUserStatus`) with the admin's forwarded token; admin-service writes `AdminAudit` (`admin.role.set_base`, `admin.role.set_system_admin`, `admin.user.ban`, `admin.user.unban`) only after the RPC succeeds; a no-op role change writes none. Details: [permissions](../../system/permissions.md) § Role management and ban.
- **BR-008**: `admin-bootstrap` runs on `OnModuleInit`, reading `ADMIN_EMAILS` env and idempotently syncing: skip existing admins, grant admin to matching non-admins, create new users as needed. A CLI (`yarn bootstrap:admin sync|list|grant|revoke`) exposes the same logic manually.

### Decision Logic

None captured beyond standard CRUD/action-permission gating (see `permissions.md` PERM046–PERM053).

### State Machines

None.

### Algorithms

- **Stats aggregation**: `admin-stats` computes KPI overview (6 metrics) + 3 time-series (signups/traffic/revenue) via raw SQL `date_trunc` queries, cached in Redis for 5 minutes.
- **Signup source breakdown**: `getSourceBreakdown` groups `User` rows by `COALESCE(NULLIF("utmSource", ''), 'direct')`, optional date range, top 20 desc.

### External Integrations

None beyond internal services (finance, exam, auth) via existing Prisma/gRPC wiring.

### Verification

- **SC-001** — A non-admin user receives 403 on any `/api/v1/admin/*` route.
- **SC-002** — Every successful admin mutation produces at least one `AdminAudit` row.
- **SC-003** — A banned user's session is invalidated / soft-deleted state is enforced on next auth check.
- **SC-004** — Log output never contains a raw email, Bearer token, password, or JWT in plaintext.

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

_See `business-context.md` for plain-language user story narrative. Admin tooling has no external (student/teacher) user stories — see feature-list.md F014 note._

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| User | `User` | isBanned, deletedAt, isAdmin, utmSource | Soft-delete + admin-role fields added for this feature; `utmSource` (indexed) backs the signup-source breakdown |
| AdminAudit | `AdminAudit` | id, adminId, action, targetId, payload, reason, ipAddress, userAgent, createdAt | One row per changed field per admin mutation |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|---------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F014 | [x] |
| Screen List | [screen-list.md](../../docs/generated/screen-list.md) | SCR033–SCR038, SCR044 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM046–PERM053 | [x] |

## Assumptions

- Ticket exchange SSE was chosen over WebSocket for lighter client footprint and simpler reconnect semantics; a polling fallback exists if SSE fails.
- Rate limit of 30 req/min per admin is assumed sufficient for dashboard polling patterns; not confirmed against real admin usage volume.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| AdminGuard | `examio-be/libs/common/src/guard/admin.guard.ts` | Standalone JWT + `isAdmin` check |
| AuditWriterService | `examio-be/apps/admin-service/src/modules/*/audit-writer.service.ts` (shared) | Per-field `AdminAudit` row writer |
| admin-stats module | `examio-be/apps/admin-service/src/modules/admin-stats/` | KPI + time-series + signup-source breakdown, Redis 5-min cache |
| AdminStatsFeRoutesController | `examio-be/apps/admin-service/src/modules/admin-stats/admin-stats-fe-routes.controller.ts` | Top-level `/admin/{overview,series,sources}` alias routes for FE dashboard |
| admin-users module | `examio-be/apps/admin-service/src/modules/admin-users/` | List/detail/patch/ban/unban |
| admin-roles module | `examio-be/apps/admin-service/src/modules/admin-roles/` | Role matrix, user list, history, set role / SYSTEM_ADMIN |
| AdminRolesPage | `examio-fe/src/pages/admin/AdminRolesPage.tsx` | `/admin/roles` (SCR044) |
| admin-finance module | `examio-be/apps/admin-service/src/modules/admin-finance/` | Refund/credit/tier, `$transaction` Serializable |
| admin-logs module | `examio-be/apps/admin-service/src/modules/admin-logs/` | Redactor, ticket-exchange SSE |
| admin-audit module | `examio-be/apps/admin-service/src/modules/admin-audit/` | Paginated audit query |
| admin-bootstrap module | `examio-be/apps/admin-service/src/modules/admin-bootstrap/` | `OnModuleInit` sync + CLI |
| AdminProxyController (gateway) | `examio-be/apps/gateway-service/src/controllers/admin-proxy.controller.ts` | `@All('*')` forward to admin-service |
| Admin FE pages | `examio-fe/src/pages/admin/{AdminOverviewPage,AdminStatsPage,AdminUsersPage,AdminFinancePage,AdminLogsPage,AdminAuditPage}.tsx` | 6 admin screens |
| useAdminStore | `examio-fe/src/stores/useAdminStore.ts` | Zustand store, 5-min in-memory cache per endpoint |

## Unresolved Questions

1. **Hard delete**: Is a hard-delete path for users planned, or is soft-delete permanent by design?
2. **Multi-instance admin-bootstrap**: If multiple admin-service instances run `OnModuleInit` sync simultaneously, is there a race condition risk on user creation?
3. **Rate limit tuning**: Has the 30 req/min throttle been validated against real dashboard polling load (multiple charts + tables on one page)?
