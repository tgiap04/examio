---
type: bug
date: 2026-06-07
title: admin-service UnknownDependenciesException — AdminGuard JwtService not resolved in 4 modules
---

# Bug — `admin-service` crashes on boot with `UnknownDependenciesException`

## Symptom

```
[Nest] ERROR [ExceptionHandler] UnknownDependenciesException [Error]: 
Nest can't resolve dependencies of the AdminGuard (?, PrismaService). 
Please make sure that the argument JwtService at index [0] is available in the AdminAuditModule module.

context: {
  index: 0,
  dependencies: [[class JwtService], [class PrismaService extends r]],
  name: [class JwtService]
}
```

`admin-service` exits immediately after `AuthModule dependencies initialized` — no controller routes registered, no bootstrap service runs, no HTTP listener binds.

## Root cause

`AdminGuard` (`libs/common/src/guard/admin.guard.ts`) injects `JwtService` from `@nestjs/jwt`:

```ts
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService
    ) {}
    ...
}
```

Nest resolves constructor dependencies from the declaring module's own providers OR providers from imported modules. The failing module `AdminAuditModule` only imported `DatabaseModule`:

```ts
@Module({
    imports: [DatabaseModule],
    controllers: [AdminAuditController],
    providers: [AdminAuditService, PrismaService],
    exports: [AdminAuditService],
})
export class AdminAuditModule {}
```

So when Nest tried to instantiate `AdminGuard` (declared as a controller-level guard via `@UseGuards(AdminGuard)` on `AdminAuditController`), it could not find a `JwtService` provider in the resolution tree.

The same mistake existed in 3 other admin modules:
- `AdminUsersModule` (uses `@UseGuards(AdminGuard)` on `AdminUsersController`)
- `AdminStatsModule` (uses it on `AdminStatsController`)
- `AdminLogsModule` (uses it on `AdminLogsController`)

The exception trace happened to surface for `AdminAuditModule` first because instance-loader order is registration order, and audit is registered before users/stats/logs in the root module.

The working reference is `AdminFinanceModule` — it correctly imports `AuthModule` (which provides `JwtService`) AND declares `AdminGuard` in its own `providers` so it can be resolved by `@UseGuards(AdminGuard)`:

```ts
@Module({
    imports: [AdminCommonModule, AuthModule],
    controllers: [AdminFinanceController],
    providers: [AdminFinanceService, GenerateIdService, AdminGuard],
    exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
```

Why was this missed? The codebase has two contradictory patterns for declaring guards:
- Global guard via `app.useGlobalGuards(AdminGuard)` in `main.ts` — would have worked without per-module provider registration, but admin-service does **not** register a global guard.
- Module-local guard via `providers: [AdminGuard]` + `imports: [AuthModule]` — what `AdminFinanceModule` does correctly.

The other 4 modules only imported `AuthModule` half-way (or not at all) — they referenced `AdminGuard` in `@UseGuards` but never made it resolvable.

## Fix

Applied the `AdminFinanceModule` pattern to the 4 broken modules:

### `admin-audit.module.ts`
```ts
imports: [DatabaseModule, AuthModule],
providers: [AdminAuditService, PrismaService, AdminGuard],
```

### `admin-users.module.ts`
```ts
imports: [AdminCommonModule, AuthModule],
providers: [AdminUsersService, AdminGuard],
```

### `admin-stats.module.ts`
```ts
imports: [RedisModule, AuthModule],
providers: [AdminStatsService, PrismaService, AdminGuard],
```

### `admin-logs.module.ts`
```ts
imports: [AuthModule],
providers: [AdminLogsService, RedisLogService, AdminGuard],
```

`AuthModule` is imported from `@examio/common` and provides `JwtService` (the same module referenced in `AdminFinanceModule`).

## Verification

```
$ cd examio-be && yarn tsc --noEmit
(no errors related to admin-service modules)
exit 0

$ cd deploy && docker compose build admin
Image deploy-admin Built

$ docker compose up -d admin
Container examio-admin Started

$ docker compose logs admin --tail=30
[InstanceLoader] AdminLogsModule dependencies initialized +0ms
[RoutesResolver] AdminServiceController {/api/v1}: +4ms
[RoutesResolver] AdminStatsController {/api/v1/admin/stats}: +0ms
[RoutesResolver] AdminFinanceController {/api/v1/admin/finance}: +0ms
[RoutesResolver] AdminLogsController {/api/v1/admin/logs}: +0ms
[RoutesResolver] AdminUsersController {/api/v1/admin/users}: +0ms
[RoutesResolver] AdminAuditController {/api/v1/admin/audit}: +0ms
[AdminBootstrapService] Admin already up-to-date: togiap.admin@examio.top (id=90300ed6603b0e413f5ecf2f)
[AdminBootstrapService] Admin bootstrap complete: total=1 created=0 granted=0 skipped=1 errors=0
[NestApplication] Nest application successfully started +112ms
🚀 Admin Service HTTP running on port 7006
```

All 6 admin controllers + 1 root controller registered, bootstrap service ran, HTTP listener bound on port 7006.

## Files changed (4)

| File | Change |
|---|---|
| `apps/admin-service/src/modules/admin-audit/admin-audit.module.ts` | Add `AuthModule` import, `AdminGuard` provider |
| `apps/admin-service/src/modules/admin-users/admin-users.module.ts` | Add `AuthModule` import, `AdminGuard` provider |
| `apps/admin-service/src/modules/admin-stats/admin-stats.module.ts` | Add `AuthModule` import, `AdminGuard` provider |
| `apps/admin-service/src/modules/admin-logs/admin-logs.module.ts` | Add `AuthModule` import, `AdminGuard` provider |

`AdminFinanceModule` and `AdminBootstrapModule` left unchanged — `AdminFinanceModule` was already correct; `AdminBootstrapModule` does not use `AdminGuard` and has no `@UseGuards` annotations in its services.

## Prevention

This class of defect (forgetting to import a module that provides a guard's dependencies) recurs easily. Two mitigations, deferred:

1. **ESLint rule** — add a custom rule that checks `@UseGuards(SomeGuard)` annotations against the module's `imports[]` to verify the guard's dependency tree is reachable. Heavy lift; out of scope.
2. **Switch to global guard** — register `AdminGuard` in `admin-service/src/main.ts` via `app.useGlobalGuards(AdminGuard)` (mirroring how some other services do it). This eliminates per-module provider declarations for the guard entirely but requires `AdminGuard` to either be `@Global()`-decorated or registered in a `@Global()` module. Cleaner long-term; out of scope for this fix.
3. **Module boilerplate generator** — when adding a new admin feature module, the scaffold should include the standard `imports: [..., AuthModule]` + `providers: [..., AdminGuard]` block. Could be a `nest g` schematic; deferred.

## Open questions

None.
