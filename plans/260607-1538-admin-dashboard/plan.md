---
title: "Admin Dashboard — Implementation"
description: "Separate NestJS admin-service + React admin pages; bootstrap admin from env, full-scope stats, log tail via SSE, finance actions with audit"
status: pending
priority: P1
effort: 63h
branch: main
tags: [admin, dashboard, audit, finance, sse, nestjs, react]
created: 2026-06-07
---

# Admin Dashboard — Implementation Plan

## Overview

Tách hẳn `admin-service` NestJS mới, 6 trang admin React, đọc log auth + gateway qua SSE, ghi audit mọi thao tác tài chính. Track A (backend) và Track B (frontend) chạy song song. Integration ở cuối.

**Locked decisions** (xem `/Users/tgiap.dev/devs/examio/plans/reports/brainstorm-260607-1517-admin-dashboard.md`):
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
| 01 | backend-infra-foundation | B | pending | 6h | [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md) |
| 02 | frontend-foundation | F | pending | 6h | [phase-02-frontend-foundation.md](phase-02-frontend-foundation.md) |
| 03 | backend-admin-bootstrap | B | pending | 4h | [phase-03-backend-admin-bootstrap.md](phase-03-backend-admin-bootstrap.md) |
| 04 | backend-admin-users-and-audit | B | pending | 6h | [phase-04-backend-admin-users-and-audit.md](phase-04-backend-admin-users-and-audit.md) |
| 05 | backend-admin-stats | B | pending | 5h | [phase-05-backend-admin-stats.md](phase-05-backend-admin-stats.md) |
| 06 | backend-admin-finance | B | pending | 8h | [phase-06-backend-admin-finance.md](phase-06-backend-admin-finance.md) |
| 07 | backend-admin-logs-and-gateway | B | pending | 8h | [phase-07-backend-admin-logs-and-gateway.md](phase-07-backend-admin-logs-and-gateway.md) |
| 08 | frontend-admin-overview-and-stats | F | pending | 5h | [phase-08-frontend-admin-overview-and-stats.md](phase-08-frontend-admin-overview-and-stats.md) |
| 09 | frontend-admin-users-finance-logs-audit | F | pending | 9h | [phase-09-frontend-admin-users-finance-logs-audit.md](phase-09-frontend-admin-users-finance-logs-audit.md) |
| 10 | integration-and-deployment | X | pending | 6h | [phase-10-integration-and-deployment.md](phase-10-integration-and-deployment.md) |

**Totals:** Backend ≈ 37h, Frontend ≈ 20h, Integration ≈ 6h.

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
- **Compose:** thêm `admin-service`, share volume `examio_logs:/var/log/examio` với auth + gateway.
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
11. ✅ **Log file names** → chuẩn `{service}-service.log` trong `LOGS_DIR=/var/log/examio`

## Success Criteria

- [ ] Admin đăng nhập từ email trong `ADMIN_EMAILS` → vào `/admin` được
- [ ] User thường → `/admin` redirect `/k`
- [ ] Overview: 4 KPI + 3 charts
- [ ] Users page: list/filter/grant isAdmin/ban
- [ ] Stats: 3 charts theo range 7d/30d/90d
- [ ] Finance: refund/credit/tier có audit, modal 2-step
- [ ] Logs: tail live qua SSE + PII redact
- [ ] Audit: xem được mọi thao tác admin
- [ ] Non-admin → 401/403 trên mọi `/api/v1/admin/*`
- [ ] `yarn build` + `yarn lint` pass 2 repo
- [ ] E2E: admin flow + 401 flow pass
