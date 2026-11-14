# Phase 02 - Backend Access Control Cleanup

## Context
Remove teacher/student authorization while preserving authentication, resource ownership, and admin-only behavior.

## Impacted Files
- `kmaedu-be/libs/common/src/guard/roles.guard.ts`
- `kmaedu-be/libs/common/src/decorator/roles.decorator.ts` or equivalent export if present
- `kmaedu-be/libs/common/src/index.ts` if role guard/decorator exports become unused
- `kmaedu-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/quizset/quizset.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcardset.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/examroom/examroom.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/ai/ai.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/ai-chat/ai-chat.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/examattempt/examattempt.service.ts`
- `kmaedu-be/apps/exam-service/src/modules/ai/ai.controller.e2e-spec.ts`

## Implementation Steps
1. Replace `@UseGuards(AuthGuard, RolesGuard)` plus `@Roles('teacher', 'student')` with `@UseGuards(AuthGuard)` where every authenticated user should have access.
2. Remove teacher-only checks such as `if (user.role !== 'teacher')`; replace with ownership checks where the operation mutates/reads owned resources.
3. Keep existing admin checks that use `isAdmin`; do not convert them to role checks.
4. Review gateway proxy controllers so they only enforce auth and forward authenticated user context.
5. Decide whether `RolesGuard` and `@Roles` should be deleted, retained unused, or repurposed for `isAdmin`; recommended: remove only if no references remain after cleanup.
6. Update tests that inject `req.user = { id, role }` to inject only required auth fields such as `id`, `email`, `isAdmin`.

## Success Criteria
- Complete: No backend user authorization in apps/common depends on `user.role` or `@Roles`/`RolesGuard`.
- Complete: RolesGuard, `@Roles`, and role decorator exports were removed; formerly teacher/student gated controllers now use `AuthGuard`.
- Complete: Ownership checks still prevent users from editing/deleting resources they do not own.
- Complete: Admin-only behavior remains based on `isAdmin` or dedicated admin permissions.
- Follow-up: Add route-level/e2e coverage for endpoints that were previously teacher/student gated.

## Notes
Do not modify AI/chat message roles, tutor message roles, or gRPC auth proto `role` if it represents admin numeric role derived from `isAdmin`; only revisit proto naming if it reads from `User.role`.

Completed work retained the auth gRPC proto/controller numeric `role` derived from `isAdmin`; this is compatible with the original plan but remains a naming risk for future API cleanup.
