## Context links

- Parent plan: [plan.md](../plan.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md), [researcher-02-frontend.md](../research/researcher-02-frontend.md)
- Architecture: [docs/system/architecture.md](../../../../docs/system/architecture.md)
- Permissions: [docs/system/permissions.md](../../../../docs/system/permissions.md)
- Auth service skeleton: [examio-be/apps/auth-service/src/auth.module.ts](../../../../examio-be/apps/auth-service/src/auth.module.ts)
- AuthGuard: [examio-be/libs/common/src/guard/auth.guard.ts](../../../../examio-be/libs/common/src/guard/auth.guard.ts)
- Prisma schema: [examio-be/libs/database/src/schema.prisma](../../../../examio-be/libs/database/src/schema.prisma)
- Gateway module: [examio-be/apps/gateway-service/src/gateway.module.ts](../../../../examio-be/apps/gateway-service/src/gateway.module.ts)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P0 (foundation — unblocks all admin phases)
- **Implementation status:** pending
- **Review status:** pending

Bootstrap nền tảng cho admin-service: Prisma model `AdminAudit` + migration, scaffold NestJS service mới, `AdminGuard` trong `libs/common`, gateway ProxyService extension, env + nest-cli wiring.

## Key Insights

- `AuthGuard` đã expose `isAdmin` trên `request.user` (`libs/common/src/guard/auth.guard.ts:38`) — `AdminGuard` chỉ cần check flag này.
- `PasswordService` (bcrypt 10) + `GenerateIdService` đã export từ `@examio/common` — không cần thêm lib.
- `ProxyService.serviceUrls` union type ở `apps/gateway-service/src/services/proxy.service.ts:16-20` cần thêm `'admin'`.
- Throttler đã globally applied ở gateway — admin-service phải dùng **named** throttler + `@Throttle` per-controller để tránh double-limit.

## Requirements

**Functional**
- `AdminAudit` Prisma model với index `(adminId, createdAt)` + `(action, createdAt)`, reverse relation trên `User`
- `AdminGuard` extend `AuthGuard`, check `request.user.isAdmin === true`, throw `ForbiddenException` nếu false
- `admin-service` NestJS service skeleton: main.ts (port 7006, gRPC 50056), `admin-service.module.ts`, health controller
- ThrottlerModule named `'admin'` (60s TTL, 30 req limit)
- nest-cli.json + package.json scripts (`dev:admin`, `build:admin`)
- `.env.example` thêm: `ADMIN_EMAILS`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_SERVICE_URL`, `GRPC_PORT=50056`, `LOGS_DIR`, `THROTTLE_ADMIN_LIMIT=30`
- Export `AdminGuard` từ `@examio/common` index

**Non-functional**
- Build pass: `yarn build` ở root
- Migration an toàn: chạy `prisma:merge` trước, không phá schema cũ
- Không pollute logs Nest default

## Architecture

```
libs/database/
  schema.prisma                ← +model AdminAudit
  migrations/xxx_add_admin_audit/

libs/common/src/
  guard/admin.guard.ts         ← new: extends AuthGuard, check isAdmin
  index.ts                     ← +export AdminGuard

apps/admin-service/            ← new NestJS service
  src/
    main.ts                    ← port 7006, gRPC 50056
    admin-service.module.ts
    admin-service.controller.ts ← /admin/health
  test/
  tsconfig.app.json

apps/gateway-service/src/
  services/proxy.service.ts    ← union: 'auth' | 'exam' | 'finance' | 'admin'
  gateway.module.ts            ← no change
```

## Related code files

**New:**
- `examio-be/libs/common/src/guard/admin.guard.ts`
- `examio-be/apps/admin-service/src/main.ts`
- `examio-be/apps/admin-service/src/admin-service.module.ts`
- `examio-be/apps/admin-service/src/admin-service.controller.ts`
- `examio-be/apps/admin-service/src/admin-service.controller.spec.ts`
- `examio-be/apps/admin-service/src/common/audit-writer.service.ts` (skeleton, full impl in phase 04)
- `examio-be/apps/admin-service/test/`
- `examio-be/apps/admin-service/tsconfig.app.json`
- `examio-be/apps/admin-service/nest-cli.json` (or root nest-cli.json entry)
- `examio-be/apps/admin-service/.env.example`
- `examio-be/apps/admin-service/src/common/types.ts`

**Modify:**
- `examio-be/libs/database/src/schema.prisma` — add AdminAudit model + reverse on User
- `examio-be/libs/common/src/index.ts` — export AdminGuard
- `examio-be/apps/gateway-service/src/services/proxy.service.ts` — add 'admin' to union
- `examio-be/package.json` — add `dev:admin`, `build:admin` scripts
- `examio-be/nest-cli.json` — add admin-service project
- `examio-be/.env.example` — add new envs

## Implementation Steps

1. **Prisma model** — edit `schema.prisma` thêm `AdminAudit` + `adminAudits AdminAudit[]` reverse trên `User`. Index `(adminId, createdAt)` + `(action, createdAt)`. Run `yarn prisma:merge && yarn prisma:migrate dev --name add_admin_audit && yarn prisma:generate`.
2. **AdminGuard** — `libs/common/src/guard/admin.guard.ts` import `AuthGuard`, override `canActivate`: gọi super trước, sau đó check `request.user.isAdmin === true`. Throw `ForbiddenException('Admin access required')` nếu false. Re-export từ `libs/common/src/index.ts`.
3. **ProxyService extension** — sửa `proxy.service.ts:16-20` union thành `'auth' | 'exam' | 'finance' | 'admin'`. Thêm `admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:7006'`.
4. **Scaffold admin-service** — copy pattern từ `auth-service/src/main.ts`. Module import `DatabaseModule`, `RedisModule`, `ThrottlerModule.forRoot([{ name: 'admin', ttl: 60000, limit: 30 }])`, `JwtModule`, `AdminGuard`. Health controller `GET /admin/health` trả 200.
5. **nest-cli.json** — thêm entry admin-service.
6. **package.json scripts** — `dev:admin`, `build:admin`, `test:admin`, `prisma:generate` (gọi chung).
7. **.env.example** — append 6 envs mới.
8. **Verify** — `yarn build` pass ở root; `yarn dev:admin` boot được; `curl http://localhost:7006/api/v1/admin/health` → 200.

## Todo list

- [ ] Add `AdminAudit` model + reverse on `User`
- [ ] Generate migration `add_admin_audit`
- [ ] Run `yarn prisma:generate` cho tất cả service
- [ ] Create `admin.guard.ts` extending `AuthGuard`
- [ ] Export `AdminGuard` từ `libs/common/src/index.ts`
- [ ] Extend `ProxyService.serviceUrls` union với `'admin'`
- [ ] Scaffold `apps/admin-service/src/main.ts` (port 7006, gRPC 50056)
- [ ] Scaffold `admin-service.module.ts` (DatabaseModule, RedisModule, ThrottlerModule, JwtModule, AdminGuard)
- [ ] Scaffold `admin-service.controller.ts` với `GET /admin/health`
- [ ] Add nest-cli.json entry cho admin-service
- [ ] Add package.json scripts: `dev:admin`, `build:admin`, `test:admin`
- [ ] Append 6 envs mới vào `.env.example`
- [ ] Verify `yarn build` pass
- [ ] Verify `yarn dev:admin` boot + health endpoint 200
- [ ] Verify non-admin JWT → 403 trên guard test

## Success Criteria

- [ ] `yarn build` pass toàn root
- [ ] `yarn dev:admin` boot thành công trên port 7006
- [ ] `GET /api/v1/admin/health` trả 200
- [ ] JWT không có `isAdmin` → 403 trên route bất kỳ dùng `AdminGuard`
- [ ] Prisma migration `add_admin_audit` tạo thành công, không phá data cũ
- [ ] `AdminGuard` re-exportable từ `@examio/common`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration phá schema shared | Chạy `prisma:merge` trước; test trên dev DB trước khi commit |
| AdminGuard gọi AuthGuard 2 lần | Override `canActivate` chỉ gọi super 1 lần, check isAdmin sau |
| Throttler xung đột global | Dùng named throttler `'admin'`, không đăng ký `APP_GUARD` global |
| ProxyService union break các caller cũ | Optional: dùng `as const` để TS suinfer; thêm type guard |

## Security Considerations

- `AdminGuard` phải throw `ForbiddenException` (không phải `UnauthorizedException`) — phân biệt 401 (chưa login) vs 403 (đã login nhưng không phải admin).
- `AdminGuard` không nên gọi `AuthGuard` qua `super.canActivate()` nếu guard được dùng standalone — wrap logic hoặc inject `JwtService` trực tiếp.
- Health endpoint bypass throttler để monitor container.
- Không log JWT token ở bất kỳ chỗ nào trong admin-service.

## Next steps

- Phase 02 (frontend-foundation) chạy song song — không phụ thuộc phase này.
- Phase 03 (bootstrap) cần Prisma model từ phase này.
- Phase 04–07 cần scaffold service từ phase này.
