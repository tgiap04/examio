---
title: "260607-2242-admin-guard-missing-auth-module"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2242-admin-guard-missing-auth-module

## What

Fixed `admin-service` boot crash `UnknownDependenciesException` — `AdminGuard`'s `JwtService` injection failed because 4 admin feature modules didn't import `AuthModule`.

## Root cause

`AdminGuard` (libs/common/src/guard/admin.guard.ts) injects `JwtService`. Nest resolves guards from the declaring module's `providers` + `imports`. The 4 broken modules only imported `DatabaseModule` / `RedisModule` / `AdminCommonModule` — never `AuthModule`, so `JwtService` was unreachable.

Reference: `AdminFinanceModule` had the correct pattern (`imports: [AdminCommonModule, AuthModule]` + `providers: [..., AdminGuard]`). The other 4 modules were missing the `AuthModule` import.

## Fix

4 module files edited to add `AuthModule` import + `AdminGuard` provider:

- `admin-audit.module.ts`
- `admin-users.module.ts`
- `admin-stats.module.ts`
- `admin-logs.module.ts`

## Verification

- `tsc --noEmit` exit 0 (no new errors in admin-service)
- `docker compose build admin` → Built
- `docker compose up -d admin` → Started
- Logs show all 6 admin controllers registered, bootstrap ran, HTTP listener bound on port 7006
- No more `UnknownDependenciesException`

## Files changed (4)

```
apps/admin-service/src/modules/admin-audit/admin-audit.module.ts
apps/admin-service/src/modules/admin-users/admin-users.module.ts
apps/admin-service/src/modules/admin-stats/admin-stats.module.ts
apps/admin-service/src/modules/admin-logs/admin-logs.module.ts
```

## Prevention (deferred)

- Switch admin-service to use a global guard (one-time `app.useGlobalGuards(AdminGuard)` in main.ts) — removes per-module provider declaration, no more per-module `AuthModule` import. Out of scope for this fix.
- ESLint rule to verify `@UseGuards(X)` modules include the dependency tree for `X`. Heavy; deferred.

## Committed

- No — user said "Không commit" in previous session, applying same posture for consistency.

## Next

- (carry to user) Optional: `docker compose logs -f admin` to confirm stability over a longer window.
- (carry to user) Optional: `curl http://localhost:3000/api/v1/admin/series/traffic` to verify gateway → admin-service chain works end-to-end.
