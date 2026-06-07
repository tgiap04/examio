---
title: Examio Project Changelog
last_updated: 2026-06-07
---

# Examio Project Changelog

## [Unreleased] — 2026-06-07

### Added

#### Admin Dashboard (F014 / Phase 3)
Full-stack admin dashboard implementation, completing Phase 3 of the development roadmap.

**Backend — `admin-service` (NestJS, port 7006, gRPC 50056)**

| Module | Description |
|--------|-------------|
| `admin-bootstrap` | OnModuleInit reads `ADMIN_EMAILS` env, idempotent sync: skip existing, grant non-admin, create new |
| `admin-management` | CLI via `yarn bootstrap:admin`: `sync`, `list`, `grant <email>`, `revoke <email>` |
| `admin-users` | List (paginated, filter by search/admin/banned), detail, update, ban, unban, grant-admin, revoke-admin |
| `admin-audit` | Paginated audit log with admin include, optional filters |
| `admin-stats` | Overview (6 KPIs) + 3 series (signups/traffic/revenue), Redis 5-min cache, raw SQL `date_trunc` |
| `admin-finance` | Refund (status=4, reverse credits), credit (ADD/SUBTRACT), set-tier — all in `$transaction` Serializable |
| `admin-logs` | Log redactor (4 PII patterns), recent log tail, ticket exchange SSE stream |

- `AdminGuard` in `@examio/common` — standalone JWT verify + Prisma `isAdmin` lookup
- `AuditWriterService` — shared service writes one `AdminAudit` row per changed field
- User soft-delete: `isBanned = true` + `deletedAt = now()`
- Ticket exchange SSE: `POST /admin/logs/ticket` → Redis `sse:ticket:{uuid}` (300s, single-use) → `GET /admin/logs/stream?ticket=`
- Rate limiting: 30 req/min per admin (ThrottlerModule `name: 'admin'`)
- PII redaction: email, Bearer token, password JSON, JWT patterns
- Healthcheck: `GET /api/v1/health`
- gRPC: `ENABLE_ADMIN_GRPC=true` enables reflection on port 50056

**Frontend (`examio-fe`, route `/admin`)**

| Page | Components |
|------|-----------|
| Overview | `KpiCard`, `MiniChartCard`, `StatChart`, `RangeSelector`, Recharts Area/Line/Bar |
| Stats | 3 large charts with date range picker |
| Users | `UserTable` with `UserDetailDrawer`, ban/unban/grant/revoke actions |
| Finance | `PaymentTable` with `FinanceActionModal` (refund/credit/tier) |
| Logs | `LogViewer` with SSE reconnect backoff |
| Audit | `AuditTable` with expandable payload row |

- `AdminRoute` guard: redirect `/admin` → `/login` (unauthenticated) or `/k` (non-admin)
- `AdminLayout`: cream canvas `#faf9f5`, 6 nav items, admin name + Logout top bar
- Zustand `useAdminStore` with 5-min in-memory cache per endpoint
- antd Table with pagination + filters on all list pages
- Vietnamese + English i18n: `public/locales/{vi,en}/admin.json`
- KLayout sidebar: admin-only "Trang quản trị" nav link (visible when `user.isAdmin`)

**Database — Prisma schema additions**

```prisma
// libs/database/src/models/user.prisma
isBanned   Boolean  @default(false)
deletedAt  DateTime?
adminAudits AdminAudit[]

// libs/database/src/models/admin-audit.prisma
model AdminAudit {
  id        String   @id @default(cuid())
  adminId   String
  action    String
  targetId  String?
  payload   Json?
  reason    String?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  admin     User     @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId, createdAt])
  @@index([action, createdAt])
}
```

**Gateway proxy**

- `apps/gateway-service/src/controllers/admin-proxy.controller.ts`: `@All('*')` catch-all forward `/api/v1/admin/*` to admin-service
- `apps/gateway-service/src/services/proxy.service.ts`: `admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:7006'`

**Deployment**

- `deploy/docker-compose.yml`: admin-service + `examio_logs` volume
- `package.json`: `dev:admin`, `build:admin`, `start:admin`, `bootstrap:admin sync|list|grant|revoke`

**Permissions** (PERM046–PERM053)

| ID | Name | Description |
|----|------|-------------|
| PERM046 | `AdminRouteAccess` | Route guard via AdminGuard |
| PERM047 | `AdminUserManagement` | Ban/unban/soft-delete |
| PERM048 | `AdminGrantRevoke` | Grant/revoke admin |
| PERM049 | `AdminFinanceRefund` | Wallet refund |
| PERM050 | `AdminCreditAdjustment` | Manual credit adjustment |
| PERM051 | `AdminSubscriptionTierChange` | Subscription tier change |
| PERM052 | `AdminAuditLogView` | Audit log query |
| PERM053 | `AdminLogView` | Server log retrieval + SSE stream |

**Implementation plan**: `plans/260607-1538-admin-dashboard/`

---

*Older entries will be added as they are recorded.*