# Phase 01 - Backend Schema And Auth Cleanup

## Context
Remove writes/reads of `User.role` from Prisma user creation, auth responses, OAuth role selection, and register DTOs.

## Impacted Files
- `examio-be/libs/database/src/schema.prisma`
- `examio-be/libs/database/src/models/user.prisma`
- `examio-be/libs/database/prisma/schema.prisma` if generated/merged schema is tracked
- `examio-be/apps/auth-service/src/dto/register.dto.ts`
- `examio-be/apps/auth-service/src/auth.service.ts`
- `examio-be/apps/auth-service/src/auth.controller.ts`
- `examio-be/apps/auth-service/src/strategies/google.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/facebook.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/github.strategy.ts`
- `examio-be/apps/auth-service/src/auth.service.spec.ts`
- `examio-be/libs/common/src/guard/auth.guard.ts`
- `examio-be/libs/common/src/guard/google-auth.guard.ts`
- `examio-be/libs/common/src/guard/facebook-auth.guard.ts`
- `examio-be/libs/common/src/guard/github-auth.guard.ts`

## Implementation Steps
1. Remove `role String @default("student")` from the User model source and merged schema.
2. Generate a migration to drop the `role` column from `User`; do not touch chat message `role` fields.
3. Remove `role` from register DTO validation/OpenAPI metadata and frontend-facing request contract.
4. Update `AuthService.register` and OAuth creation to create users without `role`.
5. Remove OAuth `role` query/cookie parsing from auth guards, strategies, controller redirects, and service signatures.
6. Update login/register/OAuth redirect defaults to a single authenticated destination, recommended `/k` or one unified dashboard.
7. Update tests and fixtures that include `role: 'student'` or `role: 'teacher'` for User.

## Success Criteria
- Complete: Prisma client generation succeeds with no `User.role` field.
- Complete: Auth login, register, refresh, get-user, and OAuth flows compile without user role references.
- Complete: OAuth role query/cookie handling was removed and redirects now canonicalize to `/k` or a safe redirect.
- Complete: `isAdmin` remains selected and returned where currently required.
- Pending rollout: no migration directory/file was found under the backend database package, so the DB column drop still needs an explicit migration decision.

## Risks
- Existing frontend localStorage may contain old user objects with `role`; frontend cleanup should ignore stale role safely.
- OAuth providers currently use role to decide redirect destination; choose one canonical post-login route before implementation.
