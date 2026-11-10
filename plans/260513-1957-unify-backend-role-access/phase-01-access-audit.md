# Phase 01 - Access Audit

## Overview
Priority: high. Status: planned. Confirm every teacher/student access boundary before editing.

## Context Links
- `kmaedu-be/libs/common/src/guard/roles.guard.ts`
- `kmaedu-be/libs/common/src/guard/roles.decorator.ts`
- `kmaedu-be/libs/common/src/guard/auth.guard.ts`
- `kmaedu-be/libs/database/src/schema.prisma`

## Key Findings To Verify
- `User.role` is a string defaulting to `student` in Prisma and is selected into `req.user` by `AuthGuard`.
- `RolesGuard` denies requests when `@Roles(...)` metadata does not match `req.user.role`.
- `@Roles('teacher')` appears on quiz set, flashcard set, exam room, and many AI endpoints.
- `@Roles('student')` appears on AI chat and student programming tutor endpoints.
- `examattempt.service.ts` has direct `user.role !== 'teacher'` logic around teacher-only attempt statistics.

## Implementation Steps
1. Run focused search commands and save findings in the PR notes or implementation checklist.
2. Categorize each hit as access control, behavior branching, DTO/API docs only, naming only, or test fixture.
3. Confirm service-level ownership checks still protect mutating operations after controller role gates are removed.
4. Identify stale docs/summaries such as `(Teacher only)` or student-only summaries.

## Commands
```bash
cd kmaedu-be
rg -n "@Roles|RolesGuard" apps/gateway-service/src apps/exam-service/src apps/auth-service/src libs/common/src
rg -n "role\s*===|role\s*!==|user\.role|teacher|student" apps/exam-service/src apps/gateway-service/src apps/auth-service/src --glob '!**/*.spec.ts'
rg -n "enum \['teacher', 'student'\]|role\?: 'teacher' \| 'student'|OAuthRole|dashboard-teacher|dashboard-student" apps/auth-service/src libs/database/src
```

## Success Criteria
- Complete inventory of all role-based access checks in gateway, exam-service, auth-service, and common libs.
- No implementation proceeds without deciding whether each role reference is an access boundary or harmless compatibility field.

## Risk Assessment
- Removing controller gates without checking service ownership could broaden access too far.
- Renaming route prefixes like `/student` or statistics paths is likely a frontend contract change; avoid unless separately scoped.
