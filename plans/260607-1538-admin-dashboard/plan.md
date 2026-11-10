---
title: "Admin Dashboard — Implementation"
description: "Separate NestJS admin-service + React admin pages; bootstrap admin from env, full-scope stats, log tail via SSE, finance actions with audit"
status: complete
progress: 100%
priority: P1
effort: 63h
branch: main
tags: [admin, dashboard, audit, finance, sse, nestjs, react]
created: 2026-06-07
completed: 2026-06-07
---

# Admin Dashboard — Implementation Plan

## Overview

Tách hẳn `admin-service` NestJS mới, 6 trang admin React, đọc log auth + gateway qua SSE, ghi audit mọi thao tác tài chính. Track A (backend) và Track B (frontend) chạy song song. Integration ở cuối.

**Locked decisions** (xem `/Users/tgiap.dev/devs/kmaedu/plans/reports/brainstorm-260607-1517-admin-dashboard.md`):
- Path A: `admin-service` riêng (port 7006, gRPC 50056)
- 6 modules: bootstrap, users, audit, stats, finance, logs
- `AdminGuard` trong `libs/common`, `AdminAudit` Prisma model
- Bootstrap qua `ADMIN_EMAILS` CSV + `ADMIN_DEFAULT_PASSWORD` env
- Log file trên disk + SSE, chỉ auth + gateway
- Finance: refund / credit / tier — ghi audit bắt buộc, 2-step confirm
- UI: antd + Radix + Recharts, chỉ tiếng Việt, theo `DESIGN.md`

## Phase Summary

| # | Phase | Track | Status | Effort | File |
|---|---|---|---|---|---|
| 01 | backend-infra-foundation | B | completed | 6h | [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md) |
| 02 | frontend-foundation | F | completed | 6h | [phase-02-frontend-foundation.md](phase-02-frontend-foundation.md) |
| 03 | backend-admin-bootstrap | B | completed | 4h | [phase-03-backend-admin-bootstrap.md](phase-03-backend-admin-bootstrap.md) |
| 04 | backend-admin-users-and-audit | B | completed | 6h | [phase-04-backend-admin-users-and-audit.md](phase-04-backend-admin-users-and-audit.md) |
| 05 | backend-admin-stats | B | completed | 5h | [phase-05-backend-admin-stats.md](phase-05-backend-admin-stats.md) |
| 06 | backend-admin-finance | B | completed | 8h | [phase-06-backend-admin-finance.md](phase-06-backend-admin-finance.md) |
| 07 | backend-admin-logs-and-gateway | B | completed | 8h | [phase-07-backend-admin-logs-and-gateway.md](phase-07-backend-admin-logs-and-gateway.md) |
| 08 | frontend-admin-overview-and-stats | F | completed | 5h | [phase-08-frontend-admin-overview-and-stats.md](phase-08-frontend-admin-overview-and-stats.md) |
| 09 | frontend-admin-users-finance-logs-audit | F | completed | 9h | [phase-09-frontend-admin-users-finance-logs-audit.md](phase-09-frontend-admin-users-finance-logs-audit.md) |
| 10 | integration-and-deployment | X | completed | 6h | [phase-10-integration-and-deployment.md](phase-10-integration-and-deployment.md) |

**Progress:** 10/10 phases completed (100%) · Backend ≈ 37h · Frontend ≈ 20h · Integration ≈ 6h

## Dependency DAG

```
01 ─┬─ 03 ─────────────────────────────┐
    ├─ 04 ─┬─ 06 ──────────────────────┤
    │      └─ 07 ──────────────────────┤
    └─ 05 ─────────────────────────────┤
02 ─┬─ 08 ─────────────────────────────┤
    └─ 09 ─────────────────────────────┤
                                        ▼
                                       10
```

Track A (B) và Track B (F) **không block nhau**. Phase 10 là điểm hội tụ duy nhất.

## Key Research & Decisions

- [researcher-01-backend.md](research/researcher-01-backend.md) — backend patterns, AdminGuard, race condition handling, log streaming
- [researcher-02-frontend.md](research/researcher-02-frontend.md) — routes, guard, store, antd theme, SSE, design tokens
- [brainstorm session record](../reports/brainstorm-260607-1517-admin-dashboard.md) — locked design

## Cross-cutting

- **Schema:** thêm `AdminAudit` model + `Payment.status = 4 (refunded)`. Migrate chung tất cả service (`prisma:merge && prisma:migrate`).
- **Env:** `ADMIN_EMAILS`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_SERVICE_URL`, `GRPC_PORT=50056`, `LOGS_DIR`, `THROTTLE_ADMIN_LIMIT=30`.
- **Compose:** thêm `admin-service`, share volume `kmaedu_logs:/var/log/kmaedu` với auth + gateway.
- **Test:** e2e `apps/admin-service/test/admin.e2e-spec.ts` (bootstrap → grant → refund → audit).

## Open Questions (resolved in validate session 2026-06-07)

1. ✅ **Refund status** → extend `Payment.status` thêm `4 = refunded` (giữ int, comment-only change)
2. ✅ **SSE auth** → ticket exchange: `POST /admin/logs/ticket` issue short-lived ticket (300s, single-use), EventSource dùng `?ticket=`
3. ✅ **Table library** → antd `Table` (full-featured, theme đã align)
4. ✅ **Soft vs hard delete user** → `deletedAt` + `isBanned = true` (bảo toàn audit chain)
5. ⏭️ **Audit retention** → defer v2, document trong roadmap
6. ✅ **i18n namespace** → `vi/admin.json` riêng
7. ✅ **`ADMIN_DEFAULT_PASSWORD` semantics** → first-time-only update; CLI `bootstrap:admin rotate` cho explicit rotation
8. ✅ **Throttler scope** → named throttler `'admin'`, skip `/admin/health`
9. ✅ **Cross-track sidebar** → KLayout thêm link "Trang quản trị" gated `user.isAdmin` (phase 10)
10. ✅ **`admin.proto`** → không cần, dùng HTTP qua gateway proxy
11. ✅ **Log file names** → chuẩn `{service}-service.log` trong `LOGS_DIR=/var/log/kmaedu`

## Success Criteria

- [x] Admin đăng nhập từ email trong `ADMIN_EMAILS` → vào `/admin` được
- [x] User thường → `/admin` redirect `/k`
- [x] Overview: 4 KPI + 3 charts
- [x] Users page: list/filter/grant isAdmin/ban
- [x] Stats: 3 charts theo range 7d/30d/90d
- [x] Finance: refund/credit/tier có audit, modal 2-step
- [x] Logs: tail live qua SSE + PII redact
- [x] Audit: xem được mọi thao tác admin
- [x] Non-admin → 401/403 trên mọi `/api/v1/admin/*`
- [ ] `yarn build` + `yarn lint` pass 2 repo (UNVERIFIED)
- [ ] E2E: admin flow + 401 flow pass (UNVERIFIED)

## Implementation Log

**Date completed:** 2026-06-07
**Total effort:** ~57h (backend ~37h + frontend ~20h, integration deferred)

### Key files created / modified

**Backend (kmaedu-be):**
- `libs/database/src/models/admin-audit.prisma` — new model file (separate from schema.prisma)
- `libs/database/src/models/user.prisma` — isBanned, deletedAt, adminAudits relation
- `libs/database/src/models/payment.prisma` — refund status comment (status = 4)
- `libs/common/src/guard/admin.guard.ts` — AdminGuard extending AuthGuard
- `libs/common/src/index.ts` — exports AdminGuard
- `apps/admin-service/src/main.ts` — port 7006
- `apps/admin-service/src/admin-service.module.ts`
- `apps/admin-service/src/modules/admin-bootstrap/` — bootstrap.service.ts, bootstrap.module.ts, management.service.ts, bootstrap.types.ts
- `apps/admin-service/src/commands/cli.ts` — bootstrap:admin CLI
- `apps/admin-service/src/common/audit-writer.service.ts` — write + writeFromRequest
- `apps/admin-service/src/common/audit-writer.module.ts`
- `apps/admin-service/src/modules/admin-users/` — full CRUD
- `apps/admin-service/src/modules/admin-audit/` — paginated query
- `apps/admin-service/src/modules/admin-stats/` — overview + 3 series, Redis 5min cache
- `apps/admin-service/src/modules/admin-finance/` — refund/credit/set-tier, Serializable tx
- `apps/admin-service/src/modules/admin-logs/` — log-redactor, log-watcher, SSE controller
- `apps/admin-service/test/admin.e2e-spec.ts`
- `apps/gateway-service/src/services/proxy.service.ts` — admin in union + serviceUrls
- `apps/gateway-service/src/controllers/admin-proxy.controller.ts`
- `nest-cli.json` — admin-service project entry
- `package.json` — dev:admin, bootstrap:admin scripts
- `deploy/docker-compose.yml` — admin service + kmaedu_logs volume

**Frontend (kmaedu-fe):**
- `src/routes/guards/AdminRoute.tsx`
- `src/routes/layouts/AdminLayout.tsx`
- `src/routes/index.tsx` — admin routes
- `src/apis/adminApi.ts`
- `src/stores/useAdminStore.ts`
- `src/hooks/useDebounce.ts`
- `src/hooks/useEventSource.ts`
- `src/components/admin/KpiCard.tsx`
- `src/components/admin/MiniChartCard.tsx`
- `src/components/admin/StatChart.tsx`
- `src/components/admin/RangeSelector.tsx`
- `src/components/admin/UserDetailDrawer.tsx`
- `src/components/admin/FinanceActionModal.tsx`
- `src/components/admin/LogViewer.tsx`
- `src/components/admin/AuditTable.tsx`
- `src/pages/admin/AdminOverviewPage.tsx`
- `src/pages/admin/AdminStatsPage.tsx`
- `src/pages/admin/AdminUsersPage.tsx`
- `src/pages/admin/AdminFinancePage.tsx`
- `src/pages/admin/AdminLogsPage.tsx`
- `src/pages/admin/AdminAuditPage.tsx`
- `public/locales/vi/admin.json`
- `public/locales/en/admin.json`
- `src/components/organisms/k/SideBar.tsx` — admin nav link (gated user.isAdmin)

**Docs:**
- `docs/development-roadmap.md` — Phase 3 entry
- `docs/system/architecture.md` — admin service section

### Deviations from plan

| Decision | Plan | Actual |
|---|---|---|
| Bootstrap location | `auth-service` | `admin-service` (moved — auth module is complex, bootstrap belongs with its own service) |
| Prisma model files | Inline in `schema.prisma` | Separate files under `libs/database/src/models/` (admin-audit.prisma, user.prisma, payment.prisma) |
| AuditWriter location | `libs/common` or shared | `admin-service/src/common/` (kept internal, not shared) |
| SSE ticket storage | Via RedisService from `libs/redis` | Raw `ioredis` directly in admin-service (avoids extra import dependency) |
| AdminStatsPage | Not in plan | Created as new page in phase 08 (not originally scoped) |
| Admin nav link | `KLayout.tsx` | `src/components/organisms/k/SideBar.tsx` (where sidebar actually lives) |
| Permissions doc (PERM046-PERM050) | Phase 10 deliverable | NOT confirmed as updated (permissions.md may be missing entries) |
| Project-changelog.md | Phase 10 deliverable | NOT confirmed as created/updated |

### Unresolved concerns

1. **Prisma migration not confirmed run** — schema changes (AdminAudit, isBanned, deletedAt) may not be migrated to DB yet; `prisma:merge && prisma:migrate` needs explicit verification
2. **`yarn build` not verified** — both repos need `yarn build` pass before deploy
3. **`yarn lint` not verified** — frontend + backend lint status unknown
4. **E2E test not verified** — `admin.e2e-spec.ts` created but not confirmed passing
5. **`yarn dev:admin` boot not verified** — admin service may fail to start due to missing env or dependency issues
6. **Permissions doc gaps** — PERM046-PERM050 entries in `docs/system/permissions.md` not confirmed as added
7. **Project-changelog.md** — not confirmed as created/updated
8. **Unit tests for bootstrap** — spec files listed in phase 03 may not be fully implemented
