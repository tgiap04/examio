# Red Team — Accepted Changes (apply per phase)

User decision 2026-10-17: apply all 14 accepted findings. Rejected: sync gRPC generation (generation runs minutes; keep job + events).
Mark every edit inline with `<!-- Red Team: RT-<n> -->`. These override earlier text in phase files and planner-brief.md where they conflict.

## RT-1 (Critical) Money idempotency + generation charge atomicity
- **P02**: add to `finance/v1` proto `WalletService.Debit(user_id, amount, reason, idempotency_key)`, `Credit(...)`, `Refund(debit_idempotency_key, reason)` (returns tx + `already_applied` bool). Mark idempotent RPCs with a proto option or a lib-side allowlist. `libs/grpc` retries ONLY allowlisted idempotent RPCs. Keep `UpdateBalance` temporarily (deprecated) for the current exam caller.
- **P10**: implement in finance: `WalletTransaction.idempotencyKey String? @unique` (per wallet: `@@unique([walletId, idempotencyKey])`). Insert-then-adjust in one tx, `ON CONFLICT` → return the existing tx. Switch exam AI callers (`finance-client.service.ts:110-155`) from `UpdateBalance` to `Debit`, then delete `UpdateBalance`. Move `AI_FREE_MODE` handling into the shared finance client wrapper.
- **P15** (and P14 when moved): generation flow = (1) local tx: `GenerationJob(status=PENDING_CHARGE, key=gen:<jobId>)`, commit; (2) `Debit(gen:<jobId>)` for upload + generation as ONE debit when both are needed; (3) local tx: status `QUEUED` + outbox `content.generation.requested`. A reaper refunds and cancels jobs stuck in `PENDING_CHARGE` for more than 10 min. Cancel/refund only for `PENDING|QUEUED|PROCESSING`; COMPLETED → 409. Keep the reuse branch (`ai.service.ts:366-382`: an already-processed file charges only generation). State plainly that cancel-refund is NEW behaviour (today `cancelJob` refunds nothing, `ai.service.ts:953-1000`). Depends on P10's RPCs.

## RT-2 (Critical) Internal trust model
- **P04**: auth issues **service tokens**. `POST /internal/token` (internal network only) with `client_credentials` (per-service `SERVICE_CLIENT_SECRET` env, hashed in auth config) → RS256 JWT `sub=svc:<name>`, `aud=<target svc>`, `roles=["SERVICE"]`, 5 min TTL, cached by the caller. `libs/auth-jwt` adds `@ServiceOnly(...allowedCallers)` and `@RequirePermissionsOrService`. Rule: **every state-changing RPC** (wallet Debit/Credit/Refund, FinanceAdmin*, auth SetUserRole/SetSystemAdmin/SetUserStatus, GatewayControl*, r2 Delete*/upload) requires either a forwarded user token with the needed permission (actor = token `sub`, never a body `actor_id`) or a service token from an allowlisted caller. Read RPCs (`GetPublicProfilesByIds`, `GetWallet`, `GetUserBenefits`) require any valid service or user token. Simplify forwarding: an explicit `metadata` param in the generated client wrapper; no AsyncLocalStorage middleware (drop it from P02).
- **P03**: a RabbitMQ user per service. `definitions.json` gives each user write only on `kmaedu.events` with its own routing-key prefix (topic permissions `^<domain>\.`) and read only on its own queues. Consumers validate `source` against the routing-key domain.
- **P05**: move compose network segmentation (`edge`, `internal`, `egress`) here from P16. Only the gateway is on `edge`. No host port for Postgres/Redis/RabbitMQ.
- **P10**: `FinanceAdminService` takes actor from the forwarded admin token (`finance:admin`), not `actor_id`.

## RT-3 (High) Stale-role enforcement
- **P04**: `User.authzVersion Int @default(0)`, bumped in the same tx as a role change, admin flag change, ban or password change. Token claim `av`. Refresh signs INSIDE a tx that reads `role, isSystemAdmin, authzVersion` (`SELECT … FOR SHARE`). Outbox `auth.user.authz_changed {userId, authzVersion, reason}`.
- **P05**: gateway keeps `gw:user:<id>:av`. If the token's `av` < stored → `401 TOKEN_STALE`. Sources: (a) fast-path gRPC `InvalidateUser(userId, authzVersion)`, (b) **durable**: a gateway worker consumes `auth.user.authz_changed` (idempotent `SET` if greater). Drop the `invalid_before` timestamp comparison. Redis down: fail-closed for admin routes and for state-changing (non-GET) routes; fail-open only for GET on non-admin routes, logged + metric.
- **P08/P10**: ban → bump `authzVersion` + revoke sessions (SetUserStatus). Same path.

## RT-4 (High) Rate limits / brute force
- **P05**: port every current per-route throttle into `routes.yaml` `rateLimit` (study-room join 5/min, AI upload/generate 5–10/min per `ai-study-proxy.controller.ts:55,124,293,437,574`, auth login/register/refresh as today). Add explicit entries for `*/verify-code`, `*/with-code`, `*/unlock`, `users/search`. Key = user id when authenticated, else `req.ip` (see RT-15 real-ip).
- **P06/P07**: per-resource failure counter in Redis (`<svc>:codefail:<resourceId>:<userId>` 5 fails / 15 min → 429 `CODE_LOCKED`). Constant-time compare (`crypto.timingSafeEqual`). `verify-code`/`with-code`/`unlock` require auth (`flashcard:study` / `quiz:practice` / `exam:take`). Remove reliance on service `@Throttle` in exam-service (it has no ThrottlerModule).

## RT-5 (High) WebSocket authz
- **P04**: `JwtAuthGuard` and `PermissionsGuard` return true for `context.getType() === 'ws'`; WS auth lives in the socket middleware.
- **P06** (exam) and **P12** (study-room-service): in `server.use` middleware, verify the token (signature/aud/exp/email_verified), require `study_room:join`, check the gateway-equivalent `av` via a cached auth `GetAuthzVersion` RPC or a Redis read-only mirror [choose the simplest]; schedule a disconnect at token `exp`; consume `auth.user.authz_changed` → disconnect that user's sockets (`fetchSockets` by `user:<id>` room). Tests: a message-level e2e (connect → `room:join` → `chat:send`) for STUDENT allowed, ADMIN-only token rejected, and a stale token disconnected. The declaration test covers `@SubscribeMessage` handlers (gateway class must be `@Authenticated()` or documented).

## RT-6 (High) Unverified + optional auth
- **P04**: `@Authenticated()` denies `email_verified=false` by default (403 `EMAIL_NOT_VERIFIED`). Add `@AllowUnverified()` for: me, logout, sendVerificationEmail, verifyAccount, change-password, devices. `@Public()` parse: a token that fails verification is ignored (treated anonymous).
- **P05**: on `auth: optional` routes run verify + revoke + av checks. If any fail, **strip** `authorization`/cookie before forwarding (anonymous).
- **P06/P07**: add the new P07 handlers to `AUTHENTICATED_ALLOWLIST` with linked specs.

## RT-7 (High) Ownership/IDOR test dimension
- **P06**: the matrix becomes actor × resource-relation: {owner, other same role, other role, host, whitelisted, code-unlocked, anonymous}. Every `@Authenticated`/P|O allowlist entry must reference a two-user negative spec; the declaration test fails if the link is missing. Add an `@RequireOwnerOrPermission(perm, resolver)` decorator enforced by the guard to replace ad-hoc `assertPermissionOrOwner` where practical.
- **P07**: add cross-user tests for `PUT /attempts/:id`, `GET /attempts/:id`, practice history.

## RT-8 (High) Durable R2 deletion + document deletion owner
- **P02**: add `r2.v1.DeleteObjects(keys[])` (idempotent) now.
- **P11+** (libs/messaging or a tiny shared pattern): `r2_delete_tasks(id, key, attempts, nextAttemptAt)` written in the SAME tx as the row delete; the worker deletes via `DeleteObjects` with backoff. Applies to every code path that deletes rows owning R2 objects (quiz set images, flashcard images, documents, chat images, avatars). The event handler must never call R2 after commit.
- **P13/P15**: `DocumentService.DeleteDocuments(ids)` (owner-checked or service-token, publishes `document.deleted`). ai-chat `clearChat(deleteFiles)` (`ai-chat.service.ts:739-790`) calls it. Add a URL→key resolver for `AIChatMessage.imageUrl`. e2e: "clear chat with files".

## RT-9 (High) Teacher wallet provisioning robustness
- **P04/P10**: finance provisioning = a single `INSERT … ON CONFLICT DO NOTHING` for wallet + welcome tx (key `welcome:<userId>`) + Free subscription. Lazy `ensureWallet(userId)` on finance read/debit paths when the caller token has `wallet:use`. Admin CLI `finance reconcile-teachers` (pages auth `ListUsers role=TEACHER`). A role re-apply with the same value re-emits `auth.user.authz_changed` (forced) so support can recover.

## RT-10 (High) Messaging hygiene + trimmed scope
- **P03**: a daily purge (outbox published > 7 d, processed_events > 14 d). The relay claims rows in a short tx (`locked_until = now()+30s`, commit), publishes OUTSIDE the tx with confirms, then marks published; separate small pool (max 2) for the relay. ONE retry tier (30 s TTL) + DLQ (max 5 attempts); more tiers only when needed. Move the Python envelope helper to P15. `traceparent` header deferred (deferred observability phase).
- State events carry `version` (aggregate `updatedAt` ms or `authzVersion`); consumers apply only if newer; ban/kick handlers re-read authoritative state (RT-15 ordering).

## RT-11 (High) Scope cuts
- **P10**: replace the event-fed admin read model with aggregate RPCs `auth.v1.GetUserStats(range)` and `finance.v1.GetRevenueStats(range)` that run the CURRENT queries (semantics at `admin-stats.service.ts:56-60,159,212-242`, unchanged) inside the owner. Keep the 5-min Redis cache. Remove `admin_metrics_daily`, `admin_user_facts`, `admin_user_activity_daily`, the `rebuild-metrics` CLI and the `auth.user.logged_in` event.
- **P11**: remove the user-deletion pipeline (admin DELETE, auth DeleteUser, purge worker, per-service purgers). Only drop the cross-service FKs, keep `userId` + `@@index`. Add `[DEFERRED] user deletion` to the roadmap.
- **P16**: keep per-service images, GHCR, CI matrix, deploy script, env per service, gateway-a/b. MOVE to deferred phase 17: Prometheus/Loki/Tempo/Grafana stack, Redis ACL, admin logs on Loki. Keep the existing log-watcher. Drop the `services.json` proto client graph; the server of `kmaedu.<svc>.v1` is `<svc>` by convention.
- **P17**: becomes "Deferred: K8s + full observability + Redis ACL". Excluded from the effort total.
- **P01/P02**: move depcruise to P10 (enforced, not report-only). Move FE vitest to P09 (with `mergeConfig`, RT-15). Limit `libs/http` error envelope to gateway + auth in P05 (others later as they're touched).

## RT-12 (High) Deploy safety
- **P16**: deploy in waves derived per change: wave 1 = services whose `proto/kmaedu/<svc>/` changed (servers), wave 2 = the rest. A migration lint fails CI on `DROP`/`RENAME`/`ALTER … TYPE` unless the PR has the label `migration:contract`, and contract migrations deploy only after all callers have shipped (documented two-PR flow). The deploy script detects P3009 → halts, alerts, leaves the old image running (no auto `migrate resolve`). Honest drain: SSE/WS clients reconnect on gateway rollout; the FE already retries; the success criterion is "no failed non-streaming requests".

## RT-13 (High) Mobile compatibility
- **P04/P10**: keep `user.isAdmin` (deprecated alias) and `wallet` in `/auth/me` until P18 ships; removal moves to P19.
- **P18**: step 1 "locate and read kmaedu-app" becomes a prerequisite before the Milestone A deploy; the mobile release ships together with the Milestone A backend deploy. Re-estimate after reading. Drive gating purely by `permissions` (drop the "admin-only account" blocker and fixture — impossible in the role model; RT-15).

## RT-14 (High) Prisma / bundling spike before data phases
- **P01**: add step "Bump prisma/@prisma/client 6.16.2 → 6.19.x, add `@prisma/adapter-pg` + `pg`" and a **0.5 d spike** (record the result in plan.md): `prisma-client` generator + adapter-pg + `engineType=client` + `nest build --webpack` bundle + `migrate deploy` with `?schema=` + `search_path`. Go/no-go gate for P11. Fallback: classic `prisma-client-js` with per-service output.
- **P01/P11**: `libs/observability` health stays Prisma-free (an injected `ReadinessCheck[]`). P11 deletes the stale tree `libs/database/prisma/` (the stale 28-model schema) after re-inventorying the real seeds (`libs/database/prisma/seed.ts`, `seed-dev.ts`, `libs/database/src/seed/*.seed.ts`). The authoritative schema is `libs/database/src/models/*.prisma`.

## RT-15 (Medium) Batch
- Email leak (P04/P10): split `GetPublicProfilesByIds` (id, username, name, avatar) from a privileged `GetUsersByIds` (service token + `user:manage`). Cache only the public projection. Contract test: no exam/content/assessment response contains `email`.
- Gateway hardening (P05): port helmet, `enableCors` allowlist + prod fail-fast (`gateway main.ts:37-74`), short-circuit OPTIONS before the dispatcher. nginx `real_ip_header CF-Connecting-IP` + `set_real_ip_from` (Cloudflare ranges) as a deliverable, owned by P05 (`kmaedu-fe/nginx.conf`); WS uses `req.ip` only; e2e: a forged XFF does not change the limiter key.
- Last admin (P04): serialize role changes with `pg_advisory_xact_lock(hashtext('role-change'))` and map `40P01`/serialization failures to 409 after one retry. `SetUserStatus` (ban) also guards against banning the last SYSTEM_ADMIN.
- Snapshot (P14): store `contentHash` of the quiz set in the snapshot; teacher session views show "Đề đã thay đổi kể từ khi tạo phiên — Cập nhật đề" with a re-snapshot action (allowed only while UPCOMING with 0 attempts). Cache the parsed snapshot per session (in-memory LRU, 5 min); endpoints select only the needed fields; cap 1 MB.
- Sharing (P07): `PUT …/sharing` takes deltas `{ addUserIds[], removeUserIds[], isPublic?, codeEnabled? }`, applied atomically (`array_append`/`array_remove`). Keep code-granted users separate (`codeGrantedIds String[]`) so rotating or disabling the code evicts them. One cap (2000) for both lists. Apply the same to flashcard sets and exam sessions where P07 touches them.
- FE gates (P09): `vitest.config.ts` uses `mergeConfig(viteConfig, …)` for the `@` alias. The grep gate is scoped to `user.isAdmin`. P08 owns renaming the admin FE files to `isSystemAdmin` (`apis/adminApi.ts`, `components/admin/UserTable.tsx`, `UserDetailDrawer.tsx`, `stores/useAdminStore.ts`); P09 owns `SideBar.tsx` and `AdminRoute.tsx`.
- r2 internal token (P13/P15): move r2 internal upload to `r2.v1` gRPC (service token, caller document-service), delete the HTTP `internal/upload` + `INTERNAL_SERVICE_TOKEN` in P15. The P13 grep gate excludes r2 until P15.
- Event ordering (P03/P12): see RT-10 (version field, re-read state).
- Word-family `to-flashcard` (P12): fix the cross-user card lookup (`word-family-bridge.service.ts` matches `question in [...]` across all users) — scope it to the target set.
