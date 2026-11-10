# Phase 04 - Validation and Regression Tests

## Overview
Priority: high. Status: planned. Validate compile safety and access behavior after role gates are removed.

## Validation Commands
Run from `kmaedu-be/`:

```bash
yarn build
yarn test
```

Run targeted checks when full tests are too slow:

```bash
yarn test apps/exam-service/src/modules/ai/ai.controller.e2e-spec.ts
yarn test --runInBand apps/exam-service/src/modules/ai/ai.controller.e2e-spec.ts
```

Run grep verification:

```bash
rg -n "@Roles\('teacher'|@Roles\('student'|RolesGuard|role !== 'teacher'|role === 'teacher'" apps/gateway-service apps/exam-service apps/auth-service libs/common
rg -n "Teacher only|Student only|teachers|students" apps/gateway-service/src apps/exam-service/src apps/auth-service/src
```

## Manual/API Scenarios
- Authenticated student-role user can create quiz set, add/update/delete questions in own quiz set, and delete own quiz set.
- Authenticated student-role user can create flashcard set and delete own flashcard set.
- Authenticated student-role user can create/update/delete own exam room.
- Authenticated teacher-role user can create AI chat and call student-programming tutor endpoints.
- Unauthenticated user still receives 401 for protected create/update/delete endpoints.
- Cross-user update/delete of quiz set, flashcard set, exam room, AI chat, and attempts still fails.

## Test Update Guidance
- Update tests that assert 403 solely due to teacher/student mismatch.
- Keep tests that assert 401 unauthenticated behavior.
- Add or adjust controller/service tests to assert ownership authorization rather than role authorization.
- Avoid fake pass-through mocks that skip `AuthGuard` behavior unless the test is specifically unit-scoped.

## Success Criteria
- `yarn build` passes.
- Role-grep finds no teacher/student access gates in scoped backend APIs, except compatibility-only auth/profile code or intentional admin-unrelated code.
- Regression tests demonstrate any authenticated user can perform formerly role-restricted user actions while ownership isolation remains intact.

## Risk Assessment
- Full `yarn test` may require local services/env; if it fails for environment reasons, capture exact failure and run targeted unit/e2e tests that do not require unavailable infra.
