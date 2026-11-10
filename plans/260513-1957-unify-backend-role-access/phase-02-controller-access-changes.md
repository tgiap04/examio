# Phase 02 - Controller Access Changes

## Overview
Priority: high. Status: planned. Convert teacher/student-gated APIs to authenticated-user APIs.

## Related Code Files
- `kmaedu-be/apps/exam-service/src/modules/quizset/quizset.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/flashcardset/flashcardset.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/examroom/examroom.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/ai/ai.controller.ts`
- `kmaedu-be/apps/exam-service/src/modules/ai-chat/ai-chat.controller.ts`
- `kmaedu-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`

## Required Changes
- Quiz sets: change create/update/delete quiz sets and question CRUD from `@UseGuards(AuthGuard, RolesGuard)` plus `@Roles('teacher')` to `@UseGuards(AuthGuard)`.
- Flashcard sets: change create/update/delete flashcard sets from teacher-only to authenticated-only.
- Exam rooms: change create/update/delete exam rooms from teacher-only to authenticated-only.
- AI generation/study: remove teacher-only/student-only restrictions on authenticated endpoints in `ai.controller.ts`; keep existing subscription/package checks unchanged.
- AI chat: remove class-level `RolesGuard` and `@Roles('student')`, keep class-level `AuthGuard`.
- Gateway AI study proxy: remove `RolesGuard` and `@Roles('teacher', 'student')` where it adds no value beyond auth.

## Implementation Steps
1. Remove `Roles` and `RolesGuard` imports where no longer used.
2. Replace `@UseGuards(AuthGuard, RolesGuard)` with `@UseGuards(AuthGuard)` for endpoints available to any authenticated user.
3. Remove `@Roles(...)` decorators from these endpoints/classes.
4. Update Swagger summaries from `(Teacher only)` or student-only wording to authenticated-user wording.
5. Keep public/optional auth routes unchanged.

## Success Criteria
- A student-role token and a teacher-role token can both call create quiz set, create flashcard set, create exam room, take exam, AI chat, and AI tutor APIs.
- Unauthenticated requests still fail with 401 on protected routes.
- Ownership checks in services still return 403/404 for cross-user mutations.

## Risk Assessment
- `ai.controller.ts` has many endpoints; use careful targeted edits rather than broad replace that removes auth guards.
- Existing tests may mock `RolesGuard`; update tests only where they assert obsolete role behavior.
