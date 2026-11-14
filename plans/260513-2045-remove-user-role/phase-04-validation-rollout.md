# Phase 04 - Validation And Rollout

## Context
Validate role removal across generated Prisma client, Nest services, frontend build, and runtime migration ordering.

## Validation Commands
- Complete: `cd kmaedu-be && yarn prisma:generate` passed.
- Complete: `cd kmaedu-be && yarn build` passed.
- Complete: `cd kmaedu-be && yarn test apps/auth-service/src/auth.service.spec.ts` passed.
- Complete: `cd kmaedu-fe && yarn build` passed.
- Complete with warnings only: `cd kmaedu-fe && yarn lint` reported pre-existing/generated UI style warnings and one existing unused route import, no errors.

## Search Checks
- Complete: Final role cleanup search returned no matches for forbidden `User.role`/role guard patterns in backend apps/common and frontend `src`.
- Confirmed expected exclusions remain: AI chat/tutor message `role`, ARIA `role`, and gRPC/admin numeric role derived from `isAdmin`.

## Rollout Steps
1. Deploy application code that no longer reads/writes `User.role`.
2. Apply Prisma migration dropping the column.
3. Run smoke tests for register, login, OAuth callback, refresh token, `/auth/me`, sidebar rendering, and formerly teacher/student pages.
4. Monitor 401/403 rates and frontend route errors after rollout.

## Success Criteria
- Complete: No TypeScript compile errors from missing `role` on User.
- Complete: No Prisma runtime-risk references remain for unknown field `role` in `select`, `create`, or response shaping based on cleanup search and build.
- Complete: No frontend route guard loops or hidden navigation due to undefined role in the updated roleless guards/sidebar.
- Complete: Existing resource ownership and `isAdmin` checks are preserved in code; targeted auth tests passed.
- Follow-up: Add route-level/e2e coverage for formerly teacher/student gated endpoints before high-confidence release.

## Remaining Rollout Notes
- No migration directory/file was found under the backend database package; DB column drop still needs migration/rollout decision.
- Auth gRPC proto/controller still exposes numeric `role` derived from `isAdmin`; retained intentionally, but naming remains a compatibility risk.

## Risks
- A hidden consumer may still expect `user.role` in API responses; search generated clients/docs before release.
- The tracked `schema.prisma` appears auto-generated; update the source model and regenerate rather than hand-edit only the generated file.
- Database migration must be coordinated with any long-running old service instances that still read/write `role`.
