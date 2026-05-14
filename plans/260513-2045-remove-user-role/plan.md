# Remove User Role Implementation Plan

## Goal
Remove the `role` column from the user database model and update backend/frontend so authentication, ownership checks, and admin behavior continue without teacher/student roles.

## Scope
- Backend: `examio-be` Nest services and shared Prisma schema.
- Frontend: `examio-fe` React routes, auth flow, role-gated UI, and types.
- Preserve `isAdmin` and resource ownership checks.
- Do not remove chat message `role` fields (`user`/`assistant`) or ARIA `role` attributes.

## Phases
1. [Backend schema and auth cleanup](phase-01-backend-schema-auth.md) - Complete: code no longer reads/writes `User.role`; Prisma generation passed. Migration file still needs rollout decision.
2. [Backend access control cleanup](phase-02-backend-access-control.md) - Complete: role guards/decorators removed; formerly role-gated endpoints now use `AuthGuard` with ownership/admin checks preserved.
3. [Frontend roleless navigation and auth](phase-03-frontend-roleless-ui.md) - Complete: role type, signup/signin role UI, role redirects, guards, and sidebar filtering removed.
4. [Validation and rollout](phase-04-validation-rollout.md) - Mostly complete: build/test/lint checks passed; remaining rollout concern is DB migration plus route/e2e coverage.

## Migration Strategy
- Update Prisma source model files and generated merged schema source used by the repo.
- Create a Prisma migration that drops `User.role` only after code no longer reads or writes it.
- Keep `isAdmin` untouched; admin-only behavior should remain based on `isAdmin` or existing admin permission fields.
- Treat teacher/student page names and URLs as legacy labels unless product decides to rename them; remove authorization dependency first.

## High-Impact Files
- `examio-be/libs/database/src/schema.prisma`
- `examio-be/libs/database/src/models/user.prisma`
- `examio-be/apps/auth-service/src/auth.service.ts`
- `examio-be/apps/auth-service/src/dto/register.dto.ts`
- `examio-be/apps/auth-service/src/auth.controller.ts`
- `examio-be/apps/auth-service/src/strategies/google.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/facebook.strategy.ts`
- `examio-be/apps/auth-service/src/strategies/github.strategy.ts`
- `examio-be/libs/common/src/guard/auth.guard.ts`
- `examio-be/libs/common/src/guard/roles.guard.ts`
- `examio-fe/src/types/user.ts`
- `examio-fe/src/apis/authApi.ts`
- `examio-fe/src/stores/useAuthStore.ts`
- `examio-fe/src/routes/index.tsx`
- `examio-fe/src/components/organisms/k/SideBar.tsx`
- `examio-fe/src/components/organisms/auth/signin-form.tsx`
- `examio-fe/src/components/organisms/auth/signup-form.tsx`

## Validation Commands
- Backend: `cd examio-be && yarn prisma:generate && yarn build && yarn test`
- Frontend: `cd examio-fe && yarn build && yarn lint`
- Targeted backend checks: `cd examio-be && yarn test apps/auth-service/src/auth.service.spec.ts`

## Open Questions And Risks
- Legacy URLs/routes were kept as compatibility labels while role-based authorization and redirects were removed.
- GenAI knowledge access remains restricted by `isAdmin` or the email allowlist.
- No migration directory/file was found under the backend database package; dropping `User.role` still needs a migration/rollout decision.
- Auth gRPC proto/controller still exposes numeric `role` derived from `isAdmin`; retained per plan note, but the name remains a compatibility risk.
- More route-level/e2e coverage is recommended for endpoints that were previously teacher/student gated.
