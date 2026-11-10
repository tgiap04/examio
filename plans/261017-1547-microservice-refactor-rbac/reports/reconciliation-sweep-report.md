# Reconciliation Sweep Report (2026-10-18)

Scope: all 19 phase files + `reports/planner-brief.md` header. `plan.md` untouched. Edits marked `<!-- Reconcile: X<n> -->` (plus `deps` / `P05 schema` for non-X fixes). Precedence: decisions.md > reconciliation-decisions.md > red-team-changes.md > planner-brief.md.

## 1. Items applied

| X | Files · sections |
|---|---|
| X1 ban/SetUserStatus | P02 Requirements (`SetUserStatus` UNIMPLEMENTED until 08). P04 Key Insights, Requirements (claims list, RPC table row, interim ban removed), Related Code Files, Steps 12, Tests (ban e2e → P08), Todo, Risk, Next Steps. P05 Requirements (`InvalidateUser` `@ServiceOnly('auth')`, no admin ban caller), Architecture, Tests (`svc:admin` denied), Next Steps. P08 Context, Key Insights, Requirements (no P04 interim), Related Files (ban e2e = create), Steps, Tests, Rollback, Next Steps (CROSS-PHASE resolved). P10 Key Insights, Requirements (no `SetUserStatus`, no ban `auth.user.updated`), Architecture, Steps 2/7, Tests, Todo, Success, Security. P19 item 8 (password change does not revoke sessions; ban via P08). |
| X2 one authz event | P03 state-event list, `registered` note, proto file note, Next Steps. P04 payload `{userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}`, finance consumer = `authz_changed` where `role=TEACHER` (re-read consumer + `user-role-changed.handler.ts` dropped), Architecture, steps 6–7/9/10, proto (`UserAuthzChanged` only), tests renamed `user-authz-changed.e2e-spec.ts`, Todo; `reason` gains `unban`. P08 payload + role-change e2e. P10 provisioning test. P19 item 10 event list. |
| X3 P10 provisioning | P10 Requirements (only `welcome:<userId>` key + `ensureWallet` in `Debit`), ownership (dropped `events/**`, `commands/**`), Steps 3/6, Tests, Todo, Risk. |
| X4 WS event | P12 Requirements (`auth:reauth {AUTHZ_CHANGED}` + disconnect; `room:kicked` only for in-room ban), WS e2e. P06 CROSS-PHASE note marked resolved. |
| X5 `gw:user:<id>:av` | P05 Requirements (`invalid_before` line removed), Success Criteria grep. |
| X6 allowlists in code | P11 step 7 trimmed. P12/P13/P14/P15: r2 `DeleteObjects`/`UploadFile` + finance `Debit`/`Refund` caller lists → `@ServiceOnly`/`@RequirePermissionsOrService` decorators (files named); RabbitMQ edits → `deploy/rabbitmq/definitions.template.json`. P15 ai-service `AI_ALLOWED_CALLERS` env → in-code `ALLOWED_CALLERS` constant in `service_token.py` (P13/P14 follow). |
| X7 P13 gate | P13 Success Criteria: plain grep, `--exclude-dir=r2-service` removed. |
| X8 claims | P04 `@AllowUnverified` list + `sync-refresh-token` (verified `auth.controller.ts:633`); CROSS-PHASE claim question → resolved. P19 claim list already matched. |
| X9 small fixes | P01 Next Steps → "Phase 17 (deferred)". P05: gateway log publisher ported into dispatcher (`request-log.ts`, Requirements/Steps/Files/Tests/Todo; source verified `proxy.middleware.ts:20-24`, `common/log-publisher.service.ts`). P12 step 10 + P15 (interceptor note, Roles) `/metrics` removed. P02 owns FE `BACKEND_URL` `:7000 → :3000` (verified `examio-fe/docker-compose.yml:21`; ownership, Files, Steps, Todo); P05 duplicate removed. |
| X10 brief | `reports/planner-brief.md` header note added (brief not rewritten). |

## 2. Stale terms fixed (count per file)

| File | Fixes |
|---|---|
| P02 | `SetUserStatus` "until 04" 1 · `BACKEND_URL` add 4 |
| P03 | `role_changed`/`UserRoleChanged` 4 |
| P04 | `role_changed`/`UserRoleChanged`/`user-role-changed` 9 · interim ban 8 · "until phase 10" 2 |
| P05 | `invalid_before` 2 · admin `InvalidateUser` 4 · `BACKEND_URL` 2 · `routes.*.yaml` note 1 |
| P08 | P04-interim refs 7 · `role_changed` 1 |
| P10 | `SetUserStatus`/ban 9 · duplicated provisioning 6 · `role_changed` 1 |
| P11 | redundant allowlist step 1 |
| P12 | `room:kicked` 2 · env allowlist 2 · per-route `rateLimit` (vs P05 top-level `rateLimits`) 3 · `/metrics` 1 |
| P13 | env allowlist 3 · `definitions.json` 2 · r2 grep exclusion 1 · deps note 1 |
| P14 | env allowlists 2 · `definitions.json` 1 · deps note 1 |
| P15 | `/metrics` 2 · env allowlists 5 · `definitions.json` 2 |
| P16 | `6369:7000` → `6369:3000` 1 |
| P19 | `role_changed` 2 · password-revoke claim 1 |

Checked, compliant (no edit): `isAdmin` (only compat/rename/grep contexts), `actor_id` + `AsyncLocalStorage` (negations only), `UpdateBalance` after P10 (history/grep gates), `user.deleted`/purge (deferred or outbox purge), `logged_in`/`admin_metrics` (P10 "no …" list), `services.json` (P16/P17 deploy list, no proto graph), `outputServices` (P02/P19 removal notes), `db push` after P01 (P16 describes today/never), `@Throttle` exam (negations + grep gate), Tempo/Loki/Prometheus/Grafana outside P17 (deferral notes; P11 hits are "temporary"), `50053/50054` (P01/P02 current-state + local `.env` ports), `STUDENT … ai_chat` (P13 test asserts 403).

## 3. Dependency check (Overview vs plan.md)
- Fixed: P13 → `11, 12, 15`; P14 → `07, 11, 13, 15` (CROSS-PHASE notes removed).
- Already matching: 01–12, 15 (`03, 10, 11`), 16, 17, 18 (`04, 05`), 19 (`16, 18 released`).

## 4. Permission-catalog check
- Every `x:y` key in all phases is in the brief §5 catalog (script scan; non-permission tokens like `exam:codefail`, `build:all` excluded).
- No phase grants TEACHER `flashcard:study`/`quiz:practice`/`exam:take` (P04/P06/P18 assert the opposite; P07 attempts use `@Authenticated` + owner for teacher preview). No phase grants STUDENT `ai_chat:use`/`ai:generate`/`wallet:use` (P09 sidebar `anyOf ai:generate, exam:take` is a union gate, not a grant).

## 5. Remaining unresolved contradictions
- None.

## Notes for the lead (observational, not contradictions)
- P10 and P08 effort values were not changed (plan.md owns effort). P10 lost `SetUserStatus` + provisioning work; 3d may be high.
- X6 was extended to Python: ai-service caller allowlist is now an in-code constant, not env `AI_ALLOWED_CALLERS`. Revert P15:61/196 if the lead wants env there.
- P19 keeps `invalid_before` only as a term to purge from ARCHITECTURE.md (doc-cleanup inventory + grep gate). That is intended.
- P01's interim `@AllowUnverified` list (4 handlers) grows to the X8 list (8) in P04. That widening is deliberate per X8.
