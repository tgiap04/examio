# Phase 19 — Docs & Architecture Sync
<!-- Updated: Validation Session 1 - no compat removal (RT-13 reversed) -->

## Context Links
- [plan.md](./plan.md) · [red-team-changes.md](./reports/red-team-changes.md) (authoritative where it conflicts with the brief) · [planner-brief.md](./reports/planner-brief.md) (decisions 3, 6, 9–13 and the phase-19 correction list) · [researcher-01 §0 conflicts](./research/researcher-01-rbac-report.md) · [researcher-02 §0 corrections](./research/researcher-02-migration-mechanics-report.md)
- Targets: `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md`, `/Users/tgiap.dev/devs/examio/docs/system/{architecture,permissions,business-rules,overview,glossary}.md`, `/Users/tgiap.dev/devs/examio/docs/{project-changelog,development-roadmap}.md`, `/Users/tgiap.dev/devs/examio/docs/generated/{permissions-matrix,route-list,api-map,entities}.md`, `/Users/tgiap.dev/devs/examio/docs/flows/*.md`, `/Users/tgiap.dev/devs/examio/CLAUDE.md`, `/Users/tgiap.dev/devs/examio/AGENTS.md`
- Cutover runbook source: [phase-16](./phase-16-deploy-independence-and-observability.md) "Production cutover runbook" → `examio-be/deploy/cutover-runbook.md`. <!-- Updated: Validation Session 1 - cutover runbook docs -->
- No code step: `/auth/me` never ships compat fields (validation Q6; phases 04/10). <!-- Updated: Validation Session 1 - no compat removal (RT-13 reversed) -->

## Overview
- [CARRIED from 11] `docs/generated/entities.md` field tables and entity count are stale after the per-service schema split (phase 11). Regenerate or fix them here.
- Priority: P2 · Status: Pending · Effort: 1.25d <!-- Red Team: RT-2, RT-3, RT-11, RT-12 (was 1d: +0.25d extra ARCH corrections) --> <!-- Updated: Validation Session 1 - −0.25d: step 0 compat removal deleted --> · Depends on: 16 (docs describe the cutover + steady-state deploy). Phase 18 status is recorded as-is; it does not gate this phase.
- Goal: docs describe the system as built. ARCHITECTURE.md has the known errors fixed and records the decisions this plan made, including the red-team changes. The permission docs are generated from `libs/auth-jwt` so they cannot drift. Docs only, no application code. <!-- Updated: Validation Session 1 - no compat removal (RT-13 reversed) -->
- Executed by the `doc-writer` agent: read code first, edit surgically, split files that grow too big.

## Key Insights
- `docs/system/permissions.md` (1770 lines, generated 2026-06-05) still describes the implicit "student = default, teacher = whoever created content" model. It is fully stale.
- `CLAUDE.md` describes `libs/database`, `yarn prisma:merge|push`, exam-service modules, `@examio/common` guards and an `ocr-service`. All are gone after phases 01/11/14.
- ARCHITECTURE.md is wrong in places the red team changed <!-- Red Team: RT-2, RT-3, RT-11, RT-12 -->: §5.3 trusts `x-user-id`/`x-user-roles` because "gRPC is only on `internal`" (`ARCHITECTURE.md:327-331`); §5.4 uses `invalid_before = now` (`:333-342`); §4.7 lists Redis ACL + Grafana/Loki/Tempo/Prometheus as current (`:273-283`); §7.2 describes user deletion via `auth.user.deleted` (`:558-565`); §10.3 rebuilds "server + client" on proto change and has no migration gate (`:889-903`); §10.4 NetworkPolicy relies on "client gRPC đã khai báo" (`:905-917`).

## Requirements
ARCHITECTURE.md corrections (mandatory, from the brief, amended by the red team):
1. **§5.3 + §11 gRPC identity** <!-- Red Team: RT-2 -->: network location grants nothing. User-initiated calls forward the user's access token in `authorization` metadata through an explicit `metadata` parameter of the generated client wrapper (no AsyncLocalStorage); the callee re-verifies with `libs/auth-jwt`, and the actor is the token `sub`, never a body `actor_id`. System calls (events, cron, workers) use **service tokens**: `POST /internal/token` (internal network only, `client_credentials`, per-service `SERVICE_CLIENT_SECRET`, hashed in auth config) → RS256 JWT `sub=svc:<name>`, `aud=<target svc>`, `roles=["SERVICE"]`, 5-min TTL, cached by the caller. Every state-changing RPC (wallet `Debit/Credit/Refund`, `FinanceAdmin*`, auth `SetUserRole/SetSystemAdmin/SetUserStatus`, `GatewayControl*`, r2 delete/upload) needs a user token with the permission or a service token from an allowlisted caller (`@ServiceOnly(...)`, `@RequirePermissionsOrService`). Read RPCs need any valid token. Do NOT trust `x-user-id`/`x-user-roles`. Fix the §11 "Metadata gRPC" row.
2. **§6.2 ts-proto flags**: `nestJs=true,addGrpcMetadata=true,addNestjsRestParameter=true` (+ `esModuleInterop, env=node, forceLong=string`). Remove `outputServices=grpc-js` (ignored with `nestJs=true`). Python stubs via `grpc_tools.protoc`, not a buf plugin.
3. **§7.1 search_path**: `?schema=` alone does not cover raw SQL with `@prisma/adapter-pg`. Use `ALTER ROLE <svc>_svc SET search_path = <svc>, extensions` (init script `deploy/postgres/init/01-service-schemas.sh`). pgvector lives in schema `extensions`. ai-service sets `search_path` per pool.
4. **§10.1 gateway + networks** <!-- Red Team: RT-2 -->: networks `edge` / `internal` / `egress` (phase 05); only the gateway is on `edge`; no host port for gateway, Postgres, Redis, RabbitMQ. `gateway-a` + `gateway-b` sit behind the examio-fe nginx upstream (resolver + reload during rollout). Add `location /ws/` and the `real_ip` (CF-Connecting-IP) block.
5. **§10.2 webpack**: the Nest default externalizes node_modules, so use the custom `deploy/webpack.service.js` (`webpackConfigPath`, `externals` list from the phase-16 spike, single chunk). Runtime **node:22-alpine** (Node 20 EOL). No native Prisma engine (`engineType="client"`).
6. **Node 22** everywhere (§10.2, §11, any Dockerfile mention).
7. **Role claims** (§5.1, §5.5, §8.4, §11) <!-- Red Team: RT-3, RT-6 -->: `roles` ∈ `STUDENT | TEACHER` (exclusive) + optional `SYSTEM_ADMIN`; claims `iss, aud, sub, sid, roles, av, email_verified, iat, exp`, `typ: at+jwt`. Permissions are not in the token; they derive from `ROLE_PERMISSIONS`. `libs/auth-jwt` = `JwtAuthGuard` + `PermissionsGuard` (global, deny-by-default, skip `ws` context), `@Public()`, `@Authenticated()` (denies unverified → 403 `EMAIL_NOT_VERIFIED`), `@AllowUnverified()`, `@RequirePermissions()`, `@RequireOwnerOrPermission()`, `@ServiceOnly()`, `@RequirePermissionsOrService()`, `@CurrentUser()`. Replace `RolesGuard('admin')`/`OptionalJwtAuthGuard`.

ARCHITECTURE.md corrections (from research + phases 10–16, amended by the red team):
8. **§5.4 + §9.5 stale roles** <!-- Red Team: RT-3 -->: `User.authzVersion` is bumped in the same tx as a role change, admin flag change, ban or password change; token claim `av`; refresh signs inside a tx that reads `role, isSystemAdmin, authzVersion` (`FOR SHARE`). Gateway keeps `gw:user:<id>:av`; token `av` < stored → 401 `TOKEN_STALE`. Two sources: fast-path gRPC `InvalidateUser(userId, authzVersion)` and the **durable** gateway worker consuming `auth.user.authz_changed` (idempotent `SET` if greater). Remove `invalid_before`. Role change and password change do not revoke sessions (refresh picks up the new state); ban revokes sessions (auth `SetUserStatus`, phase 08). <!-- Reconcile: X1 --> Last-admin guard: `pg_advisory_xact_lock` on role change and ban (RT-15).
9. **§4.2/§5 WS + Redis outage** <!-- Red Team: RT-3, RT-5 -->: WS auth at upgrade = cookie `accessToken` or `Authorization` header (socket.io `auth.token` is not visible at upgrade). The socket `server.use` middleware verifies the token (signature/aud/exp/`email_verified`), requires `study_room:join`, checks `av`, schedules a disconnect at `exp`, and disconnects a user's sockets on `auth.user.authz_changed`. Redis outage: **fail-closed** for `/api/v1/admin/*` and every non-GET route; fail-open only for GET on non-admin routes (logged).
10. **§4.4 + §6.3 + §9.2 events + messaging** <!-- Red Team: RT-2, RT-9, RT-10, RT-11 -->: finance provisions wallet + `welcome:<userId>` tx + Free subscription on `auth.user.authz_changed` with `role=TEACHER` (phase 04) <!-- Reconcile: X2 --> with one `INSERT … ON CONFLICT DO NOTHING`, plus lazy `ensureWallet` and the `finance reconcile-teachers` CLI; not on `auth.user.registered`. Event list: `auth.user.authz_changed {userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}` (the only identity-authz event; no `role_changed`) <!-- Reconcile: X2 -->, `auth.user.updated {…, version}`, `finance.subscription.changed`, `document.deleted` / `content.quizset.deleted` (id arrays). **No `auth.user.deleted`, no `auth.user.logged_in`.** State events carry `version`; consumers apply only if newer. One RabbitMQ user per service (write only on `examio.events` with topic permission `^<domain>\.`, read only its own queues); consumers check `source` against the routing-key domain. Relay: claim rows in a short tx, publish outside it with confirms; one 30 s retry tier + DLQ (5 attempts); daily purge (outbox > 7 d, processed_events > 14 d).
11. **§6.2 RPC catalog** <!-- Red Team: RT-1, RT-8, RT-11, RT-15 -->: auth `SearchUsers, SetUserStatus, UpdateUserAdmin, SetUserRole, SetSystemAdmin, GetPublicProfilesByIds` (public fields) + privileged `GetUsersByIds` (service token + `user:manage`) + `GetUserStats(range)`; finance `WalletService.{Debit, Credit, Refund}` (idempotency key, returns `already_applied`; `UpdateBalance` removed), `GetRevenueStats(range)`, `FinanceAdminService {AdjustBalance, Refund, ChangeTier, ListPayments, ListSubscriptions}` (actor from token, no `actor_id`); r2 `DeleteObjects(keys[])` + gRPC upload (HTTP `internal/upload` + `INTERNAL_SERVICE_TOKEN` gone); document `CreateUpload, EnsureProcessed, DeleteDocuments`; content `GetUserContentStats`; vocabulary `WordFamilyService.GetWordFamily`, `WordFamilyAdminService`. `libs/grpc` retries only allowlisted idempotent RPCs. No `DeleteUser`.
12. **§7.2 + §7.3 data** <!-- Red Team: RT-8, RT-11, RT-15 -->: §7.2 becomes "user deletion is **deferred**": cross-service FKs are dropped, `userId` + `@@index` kept, no deletion fan-out yet (roadmap item). Row deletes that own R2 objects write `r2_delete_tasks` in the same tx; a worker calls `DeleteObjects` with backoff (never R2 after commit in an event handler). §7.3: the `ExamSession.quizSnapshot` v1 shape with `contentHash`, the "Đề đã thay đổi" banner and re-snapshot (UPCOMING with 0 attempts only), 1 MB cap. `ExamAttempt.userDisplayName` is dropped. QuizSet deletion no longer cascades to ExamRoom (`sourceDeleted`). Generation charge = `PENDING_CHARGE` job → one `Debit(gen:<jobId>)` → `QUEUED` + outbox; reaper refunds after 10 min; cancel refunds only `PENDING|QUEUED|PROCESSING` (RT-1).
13. **§12 order + table** <!-- Red Team: RT-11, RT-12, RT-15 -->: P6 (document/ai) lands before ai-chat extraction (phase 15 before 13). Map P0–P7 to plan phases 01–16; P8 (K8s) + full observability + Redis ACL → **deferred phase 17**. Fix the rows (`ARCHITECTURE.md:961-969`): P0 drops "dependency-cruiser báo cáo" (enforced in phase 10); P3 "admin KPI … read model từ event (backfill)" → aggregate RPCs, `GetUsersByIds` → `GetPublicProfilesByIds`, `AdjustBalance` → plus `Debit/Credit/Refund`; P4 drops "`auth.user.deleted` thay cho cascade" (deferred); P7 drops "Redis ACL. Grafana/Loki/Tempo/Prometheus. Admin đọc log từ Loki" and the trace criterion, adds waves + migration lint.
14. **§13 checklist**: step 3 path → `deploy/postgres/init/01-service-schemas.sh` + `deploy/compose/<svc>.yml`; step 5 route keys `auth, public, rateLimit, permissions, pageFlag` (not `roles`); step 8 → add the service to `deploy/services.json` (key = compose service = proto package; no client graph). <!-- Red Team: RT-11 -->
15. **§14.2**: Q3 (`score/database.py`) resolved: `src/score/`, the dev agent, the benchmark index and `BenchmarkItem` were deleted in phase 01 (validation Q7). Q5 replaced with the measured RAM numbers from phase 16. <!-- Updated: Validation Session 1 - ai-service legacy deleted -->
16. **§10.3 CI/CD** <!-- Red Team: RT-12 -->: proto change → rebuild the server only (`buf breaking` keeps clients compatible); deploy in waves (wave 1 = servers whose `proto/examio/<svc>/` changed, wave 2 = the rest; gateway last); migration lint rejects `DROP`/`RENAME`/`ALTER … TYPE` (and `SET NOT NULL`, NOT NULL without default) unless the PR has label `migration:contract`; the two-PR expand → contract flow; a failed migrate / `P3009` halts the deploy, alerts on Telegram, leaves the old image running, and never auto-runs `migrate resolve`. Honest drain: non-streaming requests drain; SSE/WS clients reconnect; an in-flight AI chat stream may be cut. Add a §10.3 note: the first production deploy was a one-time cutover with DB reset (backup → stop → drop volumes → render definitions → per-service migrate in waves → seed → bootstrap admin → smoke; rollback = `:pre-cutover` images + dump restore), summarised from `deploy/cutover-runbook.md`; waves apply after it. <!-- Updated: Validation Session 1 - cutover runbook docs -->
17. **§4.7 + §8.3 + §10.4 deferred infra** <!-- Red Team: RT-11 -->: Redis ACL, Grafana/Loki/Tempo/Prometheus, OTel/`traceparent`, admin logs on Loki and K8s are **deferred (phase 17)**. As built: pino JSON logs, `/health/{live,ready}`, admin logs via the existing Redis list/pub-sub. Admin KPIs come from aggregate RPCs (`GetUserStats`, `GetRevenueStats`) with a 5-min Redis cache, not an event-fed read model. §10.4 NetworkPolicy: default deny + namespace-internal (no per-caller allow-lists).
18. **§4.6 clients** <!-- Red Team: RT-6, RT-13 -->: add 403 `PERMISSION_DENIED` and `EMAIL_NOT_VERIFIED`; `TOKEN_STALE` = stale `av`, refresh once. The "client không phải sửa" sentence is wrong: web (phase 09) and mobile (phase 18) changed; `/auth/me` has `isSystemAdmin` (no `isAdmin`) and no `wallet` (balance via `GET /wallet/info`); mobile parity is required before the first store release. <!-- Updated: Validation Session 1 - no compat removal (RT-13 reversed) -->

Other docs
- `docs/system/permissions.md`: replace it with a curated view (3 roles, Authenticated-only routes, ownership/grant rules from decisions.md, the actor × resource-relation matrix from phase 06) + a generated catalog section from `scripts/gen-permissions-doc.ts` (reads `libs/auth-jwt/src/permissions.ts`; renders role → permissions and permission → routes via the CI "every handler declared" inventory). Same output → `docs/generated/permissions-matrix.md`. CI diff check.
- `docs/system/architecture.md`: service topology, data ownership (ARCH Appendix A as built), comms (user vs service tokens), deploy (waves, contract flow) + a "Production cutover (one-time)" subsection: the 10 runbook steps in one line each, the rollback rule, the cutover date, and a link to `examio-be/deploy/cutover-runbook.md` (the commands live only there; DRY). Link ARCHITECTURE.md instead of duplicating it (DRY). <!-- Updated: Validation Session 1 - cutover runbook docs -->
- `docs/system/business-rules.md` <!-- Red Team: RT-1, RT-4, RT-8, RT-15 -->: TEACHER-only provisioning, grant mechanism (whitelist/code/public; code-granted users separate and evicted on code rotation; cap 2000; code brute-force lock 5 fails / 15 min), snapshot immutability + re-snapshot rule, durable R2 cleanup (`r2_delete_tasks`), idempotent charging + refund on cancel.
- `docs/generated/{route-list,api-map}.md`: add an "owning service" column from the gateway routes YAML. `entities.md`: owner service per model.
- `docs/flows/FLOW001_user-subscription.md` (provisioning on TEACHER grant + reconcile CLI), `FLOW003/004` (snapshot + contentHash), `FLOW005_user-storage.md` (document-service + events + `DeleteDocuments`), `FLOW007_quiz-practice-attempt.md` (phase-07 endpoints).
- `docs/project-changelog.md`: one release entry for the final-merge cutover (date, DB reset), with sub-sections per milestone A–D (breaking changes: `/auth/me` shape incl. `isAdmin` → `isSystemAdmin` and `wallet` removed, RS256 + `av`, 401/403 codes incl. `EMAIL_NOT_VERIFIED`, `UpdateBalance` → `Debit/Credit/Refund`, ExamRoom no cascade, ai-service `score/` + benchmark removed, TEACHER can save word families). <!-- Updated: Validation Session 1 - single deploy; no compat -->
- `docs/development-roadmap.md` <!-- Red Team: RT-11 -->: milestones and phases with their real status. Follow-ups: **[DEFERRED] user deletion** (admin DELETE → auth `DeleteUser` → fan-out + purgers), **[DEFERRED] phase 17** (K8s, observability, Redis ACL, Loki admin logs), mobile student practice, Reserve→Capture credits.
- `CLAUDE.md` + `AGENTS.md`: service list, `libs/*` set (contracts, grpc, messaging, observability, http, auth-jwt, redis, common), per-service Prisma commands (`yarn prisma:generate`, `scripts/prisma-migrate-dev.sh <svc> <name>`), dev scripts per service, the deploy model (waves, `migration:contract` label), RBAC rules for new endpoints ("every handler must declare `@Public/@Authenticated/@RequirePermissions`"; state-changing RPCs need a user or service token). Keep the Vietnamese voice and existing rules (commit, R2 cleanup, plans in `/plans`).

## Architecture
```
libs/auth-jwt/src/permissions.ts ─► scripts/gen-permissions-doc.ts ─► docs/system/permissions.md (generated section) + docs/generated/permissions-matrix.md
apps/gateway-service/config/routes.yaml ─► route-list/api-map "owning service" column
CI: regenerate → git diff --exit-code docs/system/permissions.md docs/generated/permissions-matrix.md
examio-be/deploy/cutover-runbook.md ─► docs/system/architecture.md "Production cutover" summary + ARCH §10.3 note <!-- Updated: Validation Session 1 - cutover runbook docs -->
```

## Related Code Files
File ownership: the docs listed in Context Links + `/Users/tgiap.dev/devs/examio/examio-be/scripts/gen-permissions-doc.ts` (create) + one CI step in `/Users/tgiap.dev/devs/examio/.github/workflows/ci.yml` (append). No application code. `examio-be/deploy/cutover-runbook.md` stays phase-16 owned (read-only here). <!-- Updated: Validation Session 1 - no compat removal (RT-13 reversed) -->

## Implementation Steps
1. Inventory: grep the docs for stale terms (`libs/database`, `prisma:merge`, `isAdmin`, `exam-service`, `ocr-service`, `HS256`, `JWT_SECRET`, `x-user-roles`, `invalid_before`, `auth.user.deleted`, `UpdateBalance`, `node:20`, `6369`). Produce a checklist.
2. Apply ARCH corrections 1–18 in place (surgical edits, keep the Vietnamese voice). Add a "Thay đổi so với bản 17/10/2026" note at the top listing them.
3. Write `gen-permissions-doc.ts`. Generate the catalog sections. Add the CI diff step.
4. Rewrite `docs/system/permissions.md` (curated + generated). Keep each file < 800 lines; split the matrix into `docs/generated/permissions-matrix.md` if larger.
5. Update `architecture.md`, `business-rules.md`, `overview.md`, `glossary.md` (terms: permission, grant, snapshot, outbox, DLQ, authzVersion, service token, expand/contract).
6. Update route-list/api-map/entities and flows.
7. Changelog + roadmap entries (incl. the deferred items). Cutover summary in `docs/system/architecture.md` + the ARCH §10.3 note (link the runbook). <!-- Updated: Validation Session 1 - cutover runbook docs -->
8. Update CLAUDE.md + AGENTS.md (show the diff to the user before saving, since these files steer all agents).
9. Link check: `npx markdown-link-check` on the changed files (or a grep for relative links).

## Tests
- `node examio-be/scripts/gen-permissions-doc.ts && git diff --exit-code docs/system/permissions.md docs/generated/permissions-matrix.md` → clean (CI).
- Stale-term grep (step 1) returns only intentional historical mentions (changelog).
- Spot-check 6 claims in ARCH against code (the ts-proto opts in `proto/buf.gen.yaml`, `search_path` in the init script, nginx upstream, Dockerfile base image, `ROLE_PERMISSIONS`, the service-token endpoint `/internal/token`).

## Todo List
- [ ] Stale-term inventory
- [ ] ARCHITECTURE.md corrections 1–18 + change note
- [ ] Permission doc generator + CI diff
- [ ] permissions.md rewrite
- [ ] system/* docs updates
- [ ] generated route/api/entities + flows
- [ ] changelog (single cutover release entry) + roadmap (deferred items listed)
- [ ] Cutover runbook summary in docs/system/architecture.md + ARCH §10.3 note <!-- Updated: Validation Session 1 - cutover runbook docs -->
- [ ] CLAUDE.md + AGENTS.md (user reviews the diff)
- [ ] Link check

## Success Criteria
- `grep -rnE "libs/database|prisma:merge|x-user-roles|invalid_before|outputServices|node:20|6369:|HS256" /Users/tgiap.dev/devs/examio/ARCHITECTURE.md /Users/tgiap.dev/devs/examio/CLAUDE.md /Users/tgiap.dev/devs/examio/AGENTS.md /Users/tgiap.dev/devs/examio/docs/system` → only lines inside explicit "trước đây/legacy" notes.
- `grep -n "cutover-runbook.md" /Users/tgiap.dev/devs/examio/docs/system/architecture.md /Users/tgiap.dev/devs/examio/ARCHITECTURE.md` → ≥ 1 hit each; no runbook commands duplicated in docs. <!-- Updated: Validation Session 1 - cutover runbook docs -->
- `grep -n "auth.user.deleted\|Grafana" /Users/tgiap.dev/devs/examio/ARCHITECTURE.md` → only lines marked deferred. <!-- Red Team: RT-11 -->
- The CI permission-doc diff step is green.
- `docs/development-roadmap.md` shows milestones A–D with status and the `[DEFERRED]` items; the changelog has the breaking-change list.

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Docs describe intent, not the code | M | M | doc-writer reads the code first; spot-check list; generated sections |
| CLAUDE.md edit changes agent behaviour unexpectedly | L | M | User reviews the diff; keep the existing rules verbatim |
| permissions.md too large | M | L | Generated matrix lives in `docs/generated/`; the curated page stays short |

## Rollback
- Docs: git revert of the docs commit. No runtime impact.

## Security Considerations
- Docs must not contain secrets, real hostnames beyond the existing ones, `SERVICE_CLIENT_SECRET` values, or Redis/DB/RabbitMQ passwords. Use `.env.example` placeholders only.

## Next Steps
- Keep the generator in CI. Future endpoint changes update the permission docs automatically. Deferred items (phase 17, user deletion) stay on the roadmap.
- [CARRIED from 09] D11: word-family generate copy (UI "Sinh từ con" vs spec "Sinh bằng AI"), once the user picks one. D13: `/study-flashcard/:id` now requires login, so document it in business-rules and the changelog.
- [CARRIED from 10] admin user detail `deletedAt` is always null (auth User proto has no field): document or add the field. Docs plan line `gw:config:pages` vs code key `config:pages:flags` (`libs/common/src/constants/cache-keys.ts:158`): fix the docs. Audit actor label: state the username-vs-display-name rule (N4).
