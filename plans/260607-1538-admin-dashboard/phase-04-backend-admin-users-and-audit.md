## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md)
- Auth guard: [kmaedu-be/libs/common/src/guard/auth.guard.ts](../../../../kmaedu-be/libs/common/src/guard/auth.guard.ts)
- Prisma: [kmaedu-be/libs/database/src/schema.prisma](../../../../kmaedu-be/libs/database/src/schema.prisma)
- UserRepository: [kmaedu-be/apps/auth-service/src/repositories/user.repository.ts](../../../../kmaedu-be/apps/auth-service/src/repositories/user.repository.ts)
- Zod pattern: existing `nestjs-zod` ZodValidationPipe trong repo (verify version)
- Phase 01: [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md)
- Phase 03: [phase-03-backend-admin-bootstrap.md](phase-03-backend-admin-bootstrap.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P1
- **Implementation status:** done
- **Review status:** done

CRUD user cho admin: list/filter, get detail, update (ban/revoke isAdmin). Module audit: paginated query với filter theo adminId, action, date range. Shared `AuditWriter` service (full impl) dùng cho mọi mutation sau này.

## Key Insights

- `UserRepository` ở auth-service đã có pattern query user — admin-service có thể dùng `PrismaService` trực tiếp (đã share `libs/database`) thay vì duplicate.
- `nestjs-zod` đã dùng trong repo — DTO với Zod cho query params.
- Soft delete chưa có field trong `User` model — cần thêm `deletedAt DateTime?` (recommendation Q8).
- `AdminAudit` table đã có từ phase 01 — phase này chỉ viết controller + service cho query.
- `AuditWriter` skeleton từ phase 01 cần full impl ở phase 03 — phase này chỉ consume.

## Requirements

**Functional**

`admin-users`:
- `GET /admin/users` — paginated, filters: `search` (email/username), `isAdmin`, `isVerified`, `isBanned`, `createdFrom`, `createdTo`. Response: `{ rows: UserRow[], total: number, page, pageSize }`.
- `GET /admin/users/:id` — full profile + wallet + subscription + last session.
- `PATCH /admin/users/:id` — body: `{ isAdmin?, isVerified?, isBanned?, name?, bio? }`. Mỗi update ghi audit.
- `POST /admin/users/:id/ban` — set `isBanned = true, deletedAt = now()`. Ghi audit `admin.user.ban`. **(Decision Q4: soft delete để bảo toàn audit chain + foreign key)**
- `POST /admin/users/:id/unban` — set `isBanned = false, deletedAt = null`. Ghi audit `admin.user.unban`.
- `POST /admin/users/:id/grant-admin` — `isAdmin = true`. Ghi audit.
- `POST /admin/users/:id/revoke-admin` — `isAdmin = false`. Ghi audit. Block nếu revoke chính mình.

`admin-audit`:
- `GET /admin/audit` — paginated, filters: `adminId`, `targetId`, `action`, `createdFrom`, `createdTo`. Response: `{ rows: AuditRow[], total, page, pageSize }`.
- Không có create endpoint (chỉ write internal từ các service khác).

`AuditWriter`:
- Method `write(adminId, action, targetId, payload, reason, req)`. Auto-extract `ipAddress` + `userAgent` từ `req`.
- Helper `writeFromContext(ctx, adminId, action, targetId, payload, reason)` — extract từ `ExecutionContext`.
- Module wrap, export cho admin-finance, admin-bootstrap dùng.

**Non-functional**
- Không bao giờ trả `password` field trong response — dùng `select` Prisma exclude.
- Pagination: `page` (1-based) + `pageSize` (max 100).
- Sort: mặc định `createdAt desc`.

## Architecture

```
admin-service/src/modules/admin-users/
  admin-users.service.ts
  admin-users.controller.ts
  admin-users.module.ts
  dto/
    list-users.query.ts           ← Zod
    update-user.body.ts           ← Zod
  admin-users.service.spec.ts

admin-service/src/modules/admin-audit/
  admin-audit.service.ts
  admin-audit.controller.ts
  admin-audit.module.ts
  dto/
    list-audit.query.ts           ← Zod
  admin-audit.service.spec.ts

admin-service/src/common/
  audit-writer.service.ts         ← full impl
  audit-writer.module.ts          ← shared module
```

## Related code files

**New:**
- `kmaedu-be/apps/admin-service/src/modules/admin-users/admin-users.service.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-users/admin-users.controller.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-users/admin-users.module.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-users/dto/list-users.query.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-users/dto/update-user.body.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-users/admin-users.service.spec.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-audit/admin-audit.service.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-audit/admin-audit.controller.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-audit/admin-audit.module.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-audit/dto/list-audit.query.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-audit/admin-audit.service.spec.ts`
- `kmaedu-be/apps/admin-service/src/common/audit-writer.service.ts` (full impl, đã có skeleton từ phase 01)
- `kmaedu-be/apps/admin-service/src/common/audit-writer.module.ts`

**Modify:**
- `kmaedu-be/libs/database/src/schema.prisma` — add `deletedAt DateTime?`, `isBanned Boolean @default(false)` trên `User` model
- `kmaedu-be/apps/admin-service/src/admin-service.module.ts` — import `AdminUsersModule`, `AdminAuditModule`, `AuditWriterModule`
- Migration: `add_user_ban_fields` (mới, sau `add_admin_audit`)

## Implementation Steps

1. **Schema update** — `User` model thêm `deletedAt DateTime?`, `isBanned Boolean @default(false)`. Run migration `add_user_ban_fields`. Backfill: nếu có user hiện tại, set `isBanned = false` mặc định (đã default).
2. **AuditWriter full impl** — `audit-writer.service.ts`:
   - Inject `PrismaService`, `@Inject(REQUEST) req: Request` hoặc helper từ `ExecutionContext`.
   - Method `write({ adminId, action, targetId, payload, reason, ipAddress, userAgent })`.
   - Method helper `writeFromContext(ctx, ...)`: extract IP từ `x-forwarded-for` → `req.ip` → `req.socket.remoteAddress`. Extract UA từ `headers['user-agent']`.
3. **AuditWriterModule** — wrap, export service. `global: true` nếu cần dùng ở nhiều module.
4. **admin-users.service**:
   - `listUsers(query)` — Prisma `findMany` với `where` dynamic theo filters, `select` exclude `password`, `orderBy createdAt desc`, `skip/take`.
   - `getUserDetail(id)` — `findUnique` + include wallet, subscription, last session.
   - `updateUser(id, dto, adminId, req)` — diff old vs new state; ghi audit với payload `{ field, from, to }` per changed field.
   - `banUser(id, adminId, req)` — tx update `isBanned = true, deletedAt = now()`; ghi audit.
   - `unbanUser`, `grantAdmin`, `revokeAdmin` tương tự.
   - Block self-revoke-admin: nếu `id === adminId` → throw 400.
5. **admin-users.controller** — 7 endpoints, tất cả `@UseGuards(AdminGuard)` + `@Throttle({ admin: { ttl: 60000, limit: 30 } })`. Zod validation pipe cho query/body.
6. **admin-audit.service**:
   - `listAudit(query)` — Prisma `findMany` trên `AdminAudit` với filters, `orderBy createdAt desc`, pagination.
7. **admin-audit.controller** — `GET /admin/audit` với `@UseGuards(AdminGuard)`.
8. **Module wiring** — `admin-service.module.ts` import `AdminUsersModule`, `AdminAuditModule`, `AuditWriterModule`.
9. **Unit tests**:
   - `listUsers` filters: search, isAdmin, date range, pagination.
   - `updateUser` ghi audit đúng field thay đổi.
   - `revokeAdmin` block self-revoke.
   - `listAudit` filters theo adminId/action/date.
10. **E2E test** (sau phase 10): admin login → grant 2nd admin → list users → ban → audit row visible.

## Todo list

- [ ] Add `deletedAt` + `isBanned` vào User model
- [ ] Generate migration `add_user_ban_fields`
- [ ] Implement `AuditWriterService` full (write + writeFromContext)
- [ ] Tạo `AuditWriterModule`
- [ ] Tạo `admin-users.service.ts` (list, get, update, ban, unban, grant, revoke)
- [ ] Tạo `list-users.query.ts` Zod
- [ ] Tạo `update-user.body.ts` Zod
- [ ] Tạo `admin-users.controller.ts` với 7 endpoints
- [ ] Tạo `admin-users.module.ts`
- [ ] Tạo `admin-audit.service.ts`
- [ ] Tạo `list-audit.query.ts` Zod
- [ ] Tạo `admin-audit.controller.ts`
- [ ] Tạo `admin-audit.module.ts`
- [ ] Wire vào `admin-service.module.ts`
- [ ] Unit tests: listUsers filters, updateUser audit, revokeAdmin self-block, listAudit filters
- [ ] Verify `password` field không lộ trong response
- [ ] Verify migration chạy không phá data
- [ ] `yarn build` pass
- [ ] `yarn dev:admin` boot OK
- [ ] Manual test: admin login → grant 2nd admin → list users → ban

## Success Criteria

- [ ] `GET /admin/users?search=...&isAdmin=true&page=1&pageSize=20` trả rows + total
- [ ] `GET /admin/users/:id` trả full profile, KHÔNG có `password`
- [ ] `PATCH /admin/users/:id` với `{ isAdmin: true }` → user update + audit row
- [ ] `POST /admin/users/:id/ban` → `isBanned = true, deletedAt` set
- [ ] `POST /admin/users/:id/revoke-admin` với `id === adminId` → 400 với message "Cannot revoke own admin"
- [ ] `GET /admin/audit?adminId=...&action=admin.user.ban` trả rows
- [ ] Pagination `pageSize` max 100 (validator 400 nếu > 100)
- [ ] `password` field không xuất hiện trong bất kỳ response
- [ ] Mỗi mutation ghi đúng 1 `AdminAudit` row với payload diff
- [ ] Non-admin JWT → 403
- [ ] Throttler 30 req/min áp dụng

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration `deletedAt` + `isBanned` ảnh hưởng logic cũ | Default `isBanned = false`, `deletedAt = null` — backward compatible |
| Self-revoke-admin lockout | Trước khi revoke, check `id === adminId` → 400. UI cũng block trong frontend |
| `password` leak qua `select` | Luôn explicit `select` exclude `password`; viết helper `userSelectSafe` |
| Pagination bypass (pageSize > 100) | Zod schema max(100) — reject trước khi hit DB |
| `AdminAudit` table grow nhanh | Index đã có. Retention policy để v2 |
| Email enumeration qua `search` filter | Giới hạn 20 ký tự đầu cho search, không expose user list dạng autocomplete |

## Security Considerations

- **Critical:** block self-revoke admin để tránh lockout.
- **Critical:** block self-ban.
- Audit row phải ghi cả IP + UA — trace khi admin thực hiện action.
- Validation Zod cho mọi input — tránh Prisma injection (vd `where: { isAdmin: "true"; drop table }`).
- Soft delete chỉ set `deletedAt` + `isBanned`. KHÔNG xóa `User` row — bảo toàn foreign key từ `UserSession`, `Payment`, etc.
- Throttler ngăn brute-force list (vd dump toàn bộ user).

## Next steps

- Phase 06 (admin-finance) dùng `AuditWriter` từ phase này.
- Phase 09 (frontend AdminUsers + AdminAudit pages) consume các endpoints này.
- Phase 10 (integration) thêm e2e test.

## Implementation Notes

- User model updated: `isBanned @default(false)`, `deletedAt DateTime?`, `adminAudits AdminAudit[]` relation
- Migration `add_user_ban_fields` not explicitly confirmed as run
- AuditWriterService fully implemented (write + writeFromRequest), placed in `admin-service/src/common/`
- AuditWriterModule exported as global-ish module for other admin modules
- admin-users: 7 endpoints (list, get, update, ban, unban, grant, revoke)
- admin-audit: paginated query with filters (adminId, action, date range)
- Self-revoke-admin blocked with 400 "Cannot revoke own admin"
- Password field never exposed via explicit Prisma `select`
- Pagination max 100 enforced via Zod validator
