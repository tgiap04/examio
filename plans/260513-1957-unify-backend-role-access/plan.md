# Unify Backend Role Access Plan

## Goal
Stop using teacher vs student role as an API access boundary in `kmaedu-be`; any authenticated user can create/manage study resources, create exam rooms, take exams, use AI study/chat features, and view user-scoped data.

## Current Findings
- Role enforcement is centralized in `libs/common/src/guard/roles.guard.ts` and `libs/common/src/guard/roles.decorator.ts`, while authentication remains in `libs/common/src/guard/auth.guard.ts`.
- Blocking role decorators are mostly in `apps/exam-service/src/modules/*` controllers, especially quiz sets, flashcard sets, exam rooms, AI, and AI chat.
- Gateway only has broad `@Roles('teacher', 'student')` on AI study proxy controllers, so most gateway proxy routes already rely on auth/proxying rather than role checks.
- Auth still records and validates `role` during registration/OAuth and redirects by role; keep this for profile/UI compatibility unless product explicitly removes role from identity.

## Phases
1. [Phase 01 - Access Audit](./phase-01-access-audit.md) - confirm all role gates and ownership checks.
2. [Phase 02 - Controller Access Changes](./phase-02-controller-access-changes.md) - replace role-gated endpoint access with authenticated access.
3. [Phase 03 - Auth and Shared Role Compatibility](./phase-03-auth-shared-role-compatibility.md) - keep roles non-authoritative without breaking auth/profile contracts.
4. [Phase 04 - Validation and Regression Tests](./phase-04-validation-and-regression-tests.md) - compile, targeted tests, and grep checks.

## Key Decisions
- Do not remove authentication: unauthenticated users must still get 401 on protected APIs.
- Do not remove ownership/tenant checks: users can only update/delete their own quiz sets, flashcard sets, exam rooms, chats, attempts, etc.
- Prefer removing `RolesGuard`/`@Roles(...)` from endpoints that only need auth; do not weaken `AuthGuard`.
- Keep `isAdmin` and any admin-only behavior separate; this plan targets teacher/student role distinction only.

## Validation Commands
Run from `kmaedu-be/`:

```bash
yarn build
yarn test apps/exam-service/src/modules/ai/ai.controller.e2e-spec.ts
yarn test --runInBand apps/exam-service/src/modules/ai/ai.controller.e2e-spec.ts
rg -n "@Roles\('teacher'|@Roles\('student'|RolesGuard|role !== 'teacher'|role === 'teacher'" apps/gateway-service apps/exam-service apps/auth-service libs/common
```

## Risks
- Some service methods use `user.role` for behavior, not just access; review before removal to avoid leaking answer keys or cross-user stats.
- Existing frontend routes may still show teacher/student dashboards based on role, even after backend allows both roles.
- Swagger summaries and tests may still mention teacher/student and need updates to avoid stale API documentation.
