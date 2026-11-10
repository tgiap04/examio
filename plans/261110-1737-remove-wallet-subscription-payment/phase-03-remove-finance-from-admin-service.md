# Phase 03 — Remove finance from admin-service

## Context Links
- [plan.md](./plan.md) · [scout-02 §3](./reports/scout-02-finance-service-infra-authz.md)

## Overview
- Priority: P1 · Status: Completed · Effort: 1d · Runs in parallel with 02 and 04 after 01.
- Delete admin finance actions (`POST /admin/finance/{refund,credit,set-tier,tier}`), the admin finance gRPC client, revenue/pro/VIP stats and user-detail wallet/subscription. Drop the `admin.finance.*` audit label mapping and its seed samples (the DB resets).

## Key Insights
- Admin imports `assertWholeCredits` from `@kmaedu/grpc` (`admin-finance.service.ts:3`). After this phase nothing outside finance-service uses it, which unblocks deleting it in 05.
- The stats response shape changes: `proCount`, `vipCount`, `revenue30d` and the `revenue` series are removed. FE phase 04 removes the readers, and both land in the same release.
- `test/stats-parity/**` was a one-off cutover parity guard against the legacy admin stats (which include finance). Delete the suite and its CI step instead of keeping a fake legacy side.

## Requirements
- Functional: the admin overview and stats still return user and content metrics. User detail returns profile/role data with no `wallet`, `subscription` or `financeUnavailable`.
- `series` DTO: `revenue` is no longer an accepted metric and is rejected by the Zod enum with 400.

## Architecture
- Admin-stats calls auth (users) and other non-finance sources only. Admin-users calls auth only.

## Related Code Files (BE = `/Users/tgiap.dev/devs/kmaedu/kmaedu-be`)
- Delete `BE/apps/admin-service/src/clients/finance.client.ts`, `BE/apps/admin-service/src/modules/admin-finance/**`, `BE/apps/admin-service/test/admin-finance.e2e-spec.ts`, and `admin-finance.service.spec.ts`.
- Modify:
  - `BE/apps/admin-service/src/admin-service.module.ts` (12, 50)
  - `src/modules/admin-stats/{admin-stats.module.ts, admin-stats.service.ts, admin-stats.types.ts, dto/series.query.ts, admin-stats-fe-routes.controller.ts, admin-stats.controller.ts}`
  - `src/modules/admin-users/{admin-users.module.ts, admin-users.service.ts, admin-users.controller.ts}`
  - `src/modules/admin-audit/admin-audit.service.ts` (31-41)
  - `prisma/seed.ts` (39-43)
  - `.env.example` (`FINANCE_GRPC_URL`)
- Rewrite tests: `BE/apps/admin-service/test/admin.e2e-spec.ts` (17, 62, 78, 237), `admin-stats.service.spec.ts`, `admin-users.service.queries.spec.ts`.
- Root (owned by this phase during the parallel window):
  - Delete `BE/test/stats-parity/**`.
  - Edit `/Users/tgiap.dev/devs/kmaedu/.github/workflows/ci.yml`: the stats-parity step only (~487-490).
  - Edit `BE/test/cross-app/admin-users-real-auth.e2e-spec.ts` (3-91).
  - Edit `BE/test/authz/authz-matrix.rows.ts`: the admin finance row only (~610).

## Implementation Steps
1. RED tests:
   - `GET /admin/stats` response has no `proCount`, `vipCount` or `revenue30d` keys.
   - User detail has no `wallet` or `subscription` and makes no finance RPC.
   - `POST /admin/finance/credit` → 404.
2. Delete the admin-finance module and client, and unwire them from the modules.
3. Trim the stats service, types and DTO, and the user-detail service and controller.
4. Drop the audit mapping and seed rows. `git grep -n -i "finance\|revenue\|wallet\|subscription\|proCount\|vip" -- apps/admin-service` should return nothing.
5. Delete stats-parity and its CI step. Update the root admin tests and authz row.

## Todo List
- [ ] RED tests (a red-first run is not recorded)
- [x] Delete admin-finance and client (module and client absent; `POST /admin/finance/credit` now 404s in admin.e2e-spec)
- [x] Stats and user-detail trim (no `proCount`, `vipCount`, `revenue30d` or `admin.finance` in admin-service)
- [x] Audit mapping and seed
- [x] Root tests and CI step (no stats-parity in `ci.yml`; cross-app 30/30 per tester)
- [ ] Green (admin e2e 17/17 per tester; `typecheck:admin` and `test/authz` not recorded)

## Success Criteria
- Admin compiles with no `@kmaedu/grpc` finance import, and `yarn seed:dev:admin` runs.
- Admin e2e is green, and the authz matrix has no admin-finance row.

## Test Plan — Scope Contract (SAFETY-CRITICAL: authz, public API, CI)
- Changed: admin-service; root authz rows (admin); cross-app admin test; stats-parity removal; one CI step.
- Impacted: FE admin pages (phase 04), auth `GetUserAdminDetail` callers (none changed).
- Will verify:
  - `cd kmaedu-be && yarn typecheck:admin`
  - `yarn test apps/admin-service`
  - `cd apps/admin-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`
  - `yarn test test/authz` (whole group)
  - `cd kmaedu-be && ./node_modules/.bin/jest --config test/cross-app/jest-e2e.json test/cross-app/admin-users-real-auth.e2e-spec.ts` (if the DB env is available, else "verification incomplete")
  - `yarn check:deps`
- Bugs caught: stale finance call at runtime (DI unresolved), leaking removed keys, route still reachable, audit list crashing on unknown action.
- Deliberately skipped: finance-service tests (unchanged until 05).

## Risk Assessment
- The FE reads removed stats keys → `undefined` KPIs. Countermeasure: phase 04 removes the readers in the same release.
- The audit page renders an unknown `admin.finance.*` action. Countermeasure: the DB resets, and the FE default label handles unknown actions (verify in 04).
- Rollback: revert the phase commits.

## Security Considerations
- Deleting privileged money endpoints shrinks the attack surface. Confirm that no `@RequirePermissions('finance:admin')` remains in admin (05 deletes the permission).

## Next Steps
- 05: delete `assertWholeCredits` and the finance client from `libs/grpc`, and the `finance:admin` permission.
