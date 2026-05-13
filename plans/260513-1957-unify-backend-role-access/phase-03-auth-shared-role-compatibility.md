# Phase 03 - Auth and Shared Role Compatibility

## Overview
Priority: medium. Status: planned. Make teacher/student roles non-authoritative for access while preserving compatibility.

## Related Code Files
- `examio-be/apps/auth-service/src/dto/register.dto.ts`
- `examio-be/apps/auth-service/src/auth.service.ts`
- `examio-be/apps/auth-service/src/auth.controller.ts`
- `examio-be/apps/auth-service/src/strategies/google.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/github.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/facebook.strategy.ts`
- `examio-be/libs/common/src/guard/roles.decorator.ts`
- `examio-be/libs/common/src/guard/roles.guard.ts`

## Recommended Scope
- Keep `role` in register DTO, OAuth state parsing, profile responses, and Prisma for backward compatibility with frontend dashboards.
- Do not use role for ordinary study/exam/AI API authorization.
- Keep `RolesGuard` in shared libs only if other services or future admin-like role gates still rely on it; otherwise deprecate by leaving unused exports for now.
- Do not change JWT payload/auth selection unless a later product decision removes role from user identity entirely.

## Implementation Steps
1. Verify no downstream access still depends on teacher/student after controller changes.
2. Keep auth registration/OAuth defaults as-is unless product asks to remove role choice from signup.
3. Update comments and API docs that imply role controls capabilities.
4. If `RolesGuard` becomes unused, leave it in `@examio/common` to avoid breaking imports outside the inspected scope, then schedule cleanup separately.
5. Check any redirect logic in `auth.controller.ts` that sends users to `/k/dashboard-teacher` or `/k/dashboard-student`; flag this as frontend/product follow-up, not backend blocker.

## Success Criteria
- Backend access no longer depends on teacher/student role for study/exam/AI routes.
- Existing auth flows still compile and return role data for clients that expect it.
- No schema migration is required for this backend access change.

## Security Considerations
- Do not conflate teacher/student unification with admin access.
- Keep `isAdmin` checks and future admin guard semantics separate from this change.
