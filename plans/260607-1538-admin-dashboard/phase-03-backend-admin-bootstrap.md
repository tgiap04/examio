## Context links

- Parent plan: [plan.md](../plan.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md)
- Auth module: [examio-be/apps/auth-service/src/auth.module.ts](../../../../examio-be/apps/auth-service/src/auth.module.ts)
- Prisma schema: [examio-be/libs/database/src/schema.prisma](../../../../examio-be/libs/database/src/schema.prisma)
- PasswordService: [examio-be/libs/common/src/services/password.service.ts](../../../../examio-be/libs/common/src/services/password.service.ts)
- GenerateIdService: [examio-be/libs/common/src/services/generate-id.service.ts](../../../../examio-be/libs/common/src/services/generate-id.service.ts)
- Phase 01: [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P0 (admin account bootstrap — required before anyone can login)
- **Implementation status:** pending
- **Review status:** pending

`AdminBootstrapService` chạy trong `OnModuleInit` của `auth-service`. Sync `ADMIN_EMAILS` (CSV) + `ADMIN_DEFAULT_PASSWORD` env. Idempotent: tạo user nếu chưa có, set `isAdmin=true` nếu chưa phải, update password nếu mismatch. Có CLI command riêng để re-sync thủ công.

## Key Insights

- Locked decision: đặt trong `auth-service` (không phải `admin-service`) vì gần User model + UserRepository đã có sẵn.
- Researcher cảnh báo `OnModuleInit` chạy sớm (trước khi các dependency HTTP listen). Tốt cho bootstrap vì không phụ thuộc HTTP. Alternative: `OnApplicationBootstrap` chạy sau khi tất cả init xong — chọn `OnModuleInit` theo locked decision.
- `PasswordService` đã handle bcrypt 10 + salt; không tự code lại.
- `User` model đã có field `isAdmin`, `isVerified`, `password` — không cần thêm field.
- `AdminAudit` table đã có từ phase 01.

## Requirements

**Functional**
- Đọc env `ADMIN_EMAILS` (CSV) + `ADMIN_DEFAULT_PASSWORD`. Skip nếu rỗng (log warning).
- Mỗi email (lowercased, deduped, trim):
  - User chưa tồn tại → `prisma.user.create` với `isAdmin: true, isVerified: true, password: hashed`. Set `createdBy = "system.bootstrap"`.
  - User tồn tại + `isAdmin === false` → update `isAdmin: true`, ghi audit `admin.bootstrap.grant`.
  - User tồn tại + `isAdmin === true` + password lệch → update password, ghi audit `admin.bootstrap.password_update`.
  - User tồn tại + `isAdmin === true` + password khớp → skip, log info.
- KHÔNG auto-revoke: nếu email có trong DB nhưng KHÔNG trong env → leave alone.
- CLI command `bootstrap:admin` (Nest Commander) cho manual re-sync.
- Mỗi action write `AdminAudit` row với `action = "admin.bootstrap.sync"`, `payload = { email, action: "create|grant|update_password|skip" }`, `reason = "system"`.
- Try/catch per email; KHÔNG throw global — failure một email không block các email khác.

**Non-functional**
- Idempotent 100% — chạy nhiều lần không tạo duplicate.
- Không leak password ra log.
- Boot time overhead < 2s cho 10 admins.

## Architecture

```
auth-service/src/modules/admin-bootstrap/
  admin-bootstrap.service.ts
  admin-bootstrap.module.ts
  commands/
    bootstrap-admin.command.ts      ← Nest Commander CLI
```

Service:
```ts
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly generateId: GenerateIdService,
    private readonly auditWriter: AuditWriterService,  // from phase 01 skeleton
  ) {}

  async onModuleInit() { await this.syncAdmins(); }

  async syncAdmins(): Promise<BootstrapResult> {
    const emails = this.parseEnv();
    if (emails.length === 0) {
      this.logger.warn('ADMIN_EMAILS is empty, skipping bootstrap');
      return { total: 0, created: 0, granted: 0, updated: 0, skipped: 0, errors: [] };
    }
    // ... for each email, create/grant/update/skip
  }
}
```

## Related code files

**New:**
- `examio-be/apps/auth-service/src/modules/admin-bootstrap/admin-bootstrap.service.ts`
- `examio-be/apps/auth-service/src/modules/admin-bootstrap/admin-bootstrap.module.ts`
- `examio-be/apps/auth-service/src/modules/admin-bootstrap/bootstrap.types.ts`
- `examio-be/apps/auth-service/src/modules/admin-bootstrap/bootstrap.types.spec.ts`
- `examio-be/apps/auth-service/src/modules/admin-bootstrap/admin-bootstrap.service.spec.ts`
- `examio-be/apps/auth-service/src/commands/bootstrap-admin.command.ts` (Nest Commander entry)

**Modify:**
- `examio-be/apps/auth-service/src/auth.module.ts` (hoặc `auth-service.module.ts`) — import `AdminBootstrapModule`
- `examio-be/apps/admin-service/src/common/audit-writer.service.ts` (skeleton từ phase 01) — full impl với signature `write(adminId, action, targetId, payload, reason, req)`
- `examio-be/package.json` — script `bootstrap:admin`

## Implementation Steps

1. **AuditWriter skeleton từ phase 01 → full impl** — inject `PrismaService`, `Request` (qua `@Req()` decorator từ controller). Method `write(adminId, action, targetId, payload, reason, req)` insert row. Đặt trong `apps/admin-service/src/common/` (theo phase 01 outline). Cross-service: auth-service import từ `admin-service` (hoặc move sang `libs/common` nếu cleaner — note trong phase 10 nếu cần).
2. **AdminBootstrapService** — implement `onModuleInit()` + `syncAdmins()`. Parse `ADMIN_EMAILS` (CSV, lowercase, trim, dedup). Per email:
   - Query `prisma.user.findUnique({ where: { email } })`.
   - Compare password qua `passwordService.comparePassword(plain, hash)`.
   - Apply action (create / grant / update_password / skip).
   - Ghi audit qua `auditWriter.write(...)`.
3. **AdminBootstrapModule** — wrap service, export.
4. **Wire vào auth.module** — import `AdminBootstrapModule` (chỉ chạy trong auth-service, không phải admin-service).
5. **CLI command** — Nest Commander pattern: `bootstrap:admin` → gọi `AdminBootstrapService.syncAdmins()`. Đăng ký trong `main.ts` standalone mode (`bootstrap` parameter).
6. **Unit tests** — `admin-bootstrap.service.spec.ts`: mock PrismaService + PasswordService. Test cases: empty env, create new, grant existing, update password, skip unchanged, user not in env not demoted, partial failure.
7. **Idempotency test** — gọi `syncAdmins()` 2 lần liên tiếp, assert không có duplicate.
8. **Verify** — `yarn build` pass; `yarn dev:auth` boot không throw; chạy `yarn bootstrap:admin` thành công.

## Todo list

- [ ] Move `AuditWriterService` từ skeleton (phase 01) thành full impl
- [ ] Tạo `admin-bootstrap.service.ts` với `onModuleInit` + `syncAdmins`
- [ ] Tạo `bootstrap.types.ts` với `BootstrapResult`, `BootstrapAction` enum
- [ ] Tạo `admin-bootstrap.module.ts`
- [ ] Tạo `bootstrap-admin.command.ts` (CLI)
- [ ] Import `AdminBootstrapModule` vào `auth.module.ts` (hoặc `auth-service.module.ts`)
- [ ] Add `bootstrap:admin` script vào root `package.json`
- [ ] Wire CLI command vào `auth-service/src/main.ts`
- [ ] Unit tests: empty env, create, grant, update_password, skip, partial failure
- [ ] Idempotency test: gọi 2 lần liên tiếp, assert no duplicate
- [ ] `yarn build` pass
- [ ] `yarn dev:auth` boot — verify AdminAudit rows created
- [ ] `yarn bootstrap:admin` chạy thành công
- [ ] Verify password không leak ra log (grep stderr output)

## Success Criteria

- [ ] Boot với `ADMIN_EMAILS=admin1@x.com,admin2@y.com` + `ADMIN_DEFAULT_PASSWORD=test123` → tạo 2 admin user, mỗi user có thể login với `test123`
- [ ] Re-boot với cùng env → không tạo duplicate, `createdBy` giữ nguyên, password không update (vì match)
- [ ] Đổi `ADMIN_DEFAULT_PASSWORD=another` → re-boot → password update cho cả 2
- [ ] Set `ADMIN_EMAILS=admin1@x.com,admin2@y.com,admin3@z.com` (admin3 mới) → re-boot → tạo admin3
- [ ] DB có admin cũ (email `ex@x.com`, isAdmin=true) không có trong env → KHÔNG bị revoke
- [ ] DB có user thường (email `user@x.com`, isAdmin=false) trong env → upgrade thành admin, ghi audit
- [ ] Empty env → log warning, no-op
- [ ] Một email invalid (vd `not-an-email`) → log error, skip, các email khác vẫn xử lý
- [ ] `yarn bootstrap:admin` re-sync thành công manual
- [ ] `AdminAudit` table có row cho mỗi action

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Password default weak | Đặt warning trong log khi `ADMIN_DEFAULT_PASSWORD.length < 16`; require confirm trong roadmap v2 |
| `OnModuleInit` race với Prisma init | PrismaService khởi tạo trước (Nest DI lifecycle); OnModuleInit đảm bảo chạy sau khi tất cả provider resolve |
| `auditWriter` cross-service import | Nếu gặp vấn đề circular, move `AuditWriter` sang `libs/common` ở phase 10 |
| Email comparison case-sensitive | Normalize về lowercase cả env input lẫn DB query |
| Default password rotate trên mỗi boot | Per recommendation Q7: chỉ update khi mismatch. Add CLI `bootstrap:admin rotate` riêng cho rotation |
| User tạo thủ công qua Google OAuth (không có password) | Skip password check nếu `password === null`; chỉ grant isAdmin |

## Security Considerations

- `ADMIN_DEFAULT_PASSWORD` không bao giờ log raw. Hash rồi mới dùng.
- Audit row `payload` KHÔNG chứa password plaintext. Chỉ ghi `{ email, action }`.
- Email enumeration: vì tạo user mới dựa trên env, attacker có thể enumerate email có trong hệ thống. Tuy nhiên attacker cần access env file trước — đã là breach.
- Rate-limit env read: `process.env.ADMIN_EMAILS` chỉ đọc 1 lần lúc boot.
- CLI command `bootstrap:admin` không expose qua HTTP — chỉ chạy trực tiếp trên server.

## Next steps

- Phase 04 (admin-users-and-audit) cần `AuditWriter` từ phase này (full impl).
- Phase 06 (admin-finance) cần `AuditWriter` cho mọi mutation.
- Phase 10 (integration) cần CLI command + AuditWriter audit cho user grant/revoke actions.
