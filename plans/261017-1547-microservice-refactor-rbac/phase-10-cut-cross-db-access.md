# Phase 10 — Cut Cross-DB Access

## Context Links
- [plan.md](./plan.md) · [decisions.md](./reports/decisions.md) · [planner-brief.md](./reports/planner-brief.md) · [red-team-changes.md](./reports/red-team-changes.md) (overrides the brief where they conflict)
- [scout-current-state §Data](./reports/scout-current-state-report.md) · [researcher-02 §3 outbox](./research/researcher-02-migration-mechanics-report.md)
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §6.2 (RPC catalog), §7.1, §12 P3
- Prior phases: [03 messaging](./phase-03-messaging-foundation.md), [04 identity](./phase-04-identity-and-rbac-core.md) (service tokens, `authzVersion`), [08 admin roles](./phase-08-admin-role-management-screen.md)

## Overview
- Priority: P1 · Status: Completed (committed 2c76da1..a97adb4) · Effort: 2.75d <!-- Red Team: RT-1, RT-11 --> <!-- Updated: Validation Session 1 - −0.25d: no GetWallet compat path in /auth/me --> · Depends on: 03, 04, 08, 09
- Goal: each Prisma model is read/written by exactly ONE service in code. The DB is still shared. Cross-service access becomes gRPC calls (sync) or events (async). Money RPCs become idempotent. dependency-cruiser is enforced. This gates phase 11, which physically separates the schemas.

## Key Insights
- admin writes finance tables inside its own tx: `apps/admin-service/src/modules/admin-finance/admin-finance.service.ts:96-337` (refund `:96`, credit `:202`, setTier `:299`).
- admin writes `User` directly: `admin-users.service.ts:218-407` (PATCH). Ban/unban already go through auth `SetUserStatus` since phase 08 (never touches `deletedAt`); this phase does not touch ban. <!-- Reconcile: X1 --> <!-- Red Team: RT-11 --> Real user deletion is deferred (not in this plan).
- admin stats run Prisma counts + raw SQL on `User`, `UserSession`, `UserSubscription`, `Payment`: activeToday = `userSession.count(createdAt ≥ today)`, active30d = `userSession.count(lastActivity ≥ 30d)` (`admin-stats.service.ts:56-60`), pro/vip + revenue30d (`:62-75`), utm breakdown raw SQL on `"User"` (`:155-175`), series signups/traffic/revenue raw SQL (`:208-248`). KPI list in `admin-stats.types.ts:6-39`. <!-- Red Team: RT-11 --> These queries move unchanged into their owners as aggregate RPCs.
- Money today: exam AI callers debit through `WalletService.UpdateBalance(SUBTRACT)` with no idempotency key (`apps/exam-service/src/modules/finance-client/finance-client.service.ts:110-155`). `AI_FREE_MODE` bypass lives in the same file (`:37-64,111-121`). `WalletTransaction` has no idempotency column (`libs/database/src/models/payment.prisma:34-47`). <!-- Red Team: RT-1 -->
- Page flags: admin writes `PageFeatureFlag` + Redis `config:pages:flags` (`admin-page-config.service.ts:133`, key at `libs/common/src/constants/cache-keys.ts:158`). The gateway read Prisma at `apps/gateway-service/src/services/config.service.ts:64-75`. Phase 05 dropped that DB fallback: admin warms the shared Redis key at boot, and the gateway's `SetPageFlags` server (writes `gw:config:pages`) already exists. study-room reads the shared key at `study-room.gateway.ts:90`. The key is gateway-owned data, so admin writes it through `SetPageFlags`. <!-- Red Team: RT-11 --> (Per-service Redis ACL is deferred to phase 17, but the ownership rule holds now.)
- exam reads `User` through relation includes in examattempt(10), examsession(9), examroom(5), flashcardset(3), student(2), study-room(5) and whitelist `user.findMany` (`flashcardset.service.ts:1389,1419`, `examsession.service.ts:775,806`). Several of these select `email` (`flashcardset.service.ts:1400,1442`, `examsession.service.ts:98,127,194,391,786,829`, `examsession.repository.ts:72,84`). <!-- Red Team: RT-15 --> After this phase no exam response carries `email`.
- auth `user.repository.ts:96-121` includes `wallet` + `subscription`. `/auth/me` returns both (scout §3). FE reads `user.wallet.balance` (`ProfilePage.tsx:294`, `useAuthStore.updateWalletBalance`). Mobile is unreleased (validation Q6, RT-13 reversed), so `wallet` and `subscription` leave `/auth/me` outright, with no compat field; the FE reads the balance from finance `GET /wallet/info` (`wallet:use`). <!-- Updated: Validation Session 1 - no /auth/me compat fields -->
- `WordFamilyCategory` has two writers: admin-word-family and exam `word-family.controller.ts:54-80` (Auth+AdminGuard CUD). The FE only calls `/admin/word-family/categories` (`examio-fe/src/apis/wordFamilyApi.ts:164-190`), so the exam CUD routes are dead.

## Requirements
Functional — finance (money) <!-- Red Team: RT-1 -->
- `WalletTransaction.idempotencyKey String?` + `@@unique([walletId, idempotencyKey])`.
- `examio.finance.v1.WalletService` (proto from P02): `Debit(user_id, amount, reason, idempotency_key)`, `Credit(...)`, `Refund(debit_idempotency_key, reason)`, each returning `{ tx, already_applied }`. One tx: `INSERT WalletTransaction … ON CONFLICT (walletId, idempotencyKey) DO NOTHING RETURNING` → if no row, return the existing tx with `already_applied=true`, else adjust the balance (`UPDATE … SET balance = balance - $amt WHERE balance >= $amt`; 0 rows → `FAILED_PRECONDITION INSUFFICIENT_CREDITS`, tx rolled back). `Refund` of an unknown key → `NOT_FOUND`; a second refund → `already_applied`.
- Switch the exam AI callers from `UpdateBalance` to `Debit`, then delete `UpdateBalance` from proto + server. Interim keys until phase 15 replaces them with `doc:`/`gen:`: `<op>:<storageId>` for once-per-file ops (upload, quick-upload), else `<op>:<uuidv7>` created once per HTTP request.
- `AI_FREE_MODE` (incl. the production force-off) moves into the shared finance client wrapper `libs/grpc/src/clients/finance.client.ts`, so content/document reuse it in 14/15.
- `examio.finance.v1.FinanceAdminService`: `AdjustBalance(user_id, amount, reason, idempotency_key)`, `Refund(payment_id, reason, idempotency_key)`, `ChangeTier(user_id, tier, idempotency_key)`, `ListPayments(filter, cursor, limit)`, `ListSubscriptions(cursor, limit)`. <!-- Red Team: RT-2 --> No `actor_id` field: the actor is the forwarded admin token `sub`, guarded by `@RequirePermissions('finance:admin')`. Every write writes `WalletTransaction` + outbox in one tx.
- RPC guards <!-- Red Team: RT-2 -->: `Debit` = `@RequirePermissionsOrService('wallet:use', callers: exam, content, document)`; `Refund`/`Credit` = `@ServiceOnly('exam','content','document')`; `GetWallet`/`GetUserBenefits` = any valid user or service token.
- Provisioning <!-- Red Team: RT-9 --> <!-- Reconcile: X3 -->: P04 owns it (ON CONFLICT `ensureWallet`, `authz_changed` consumer, re-apply, lazy ensure, `reconcile-teachers`). This phase only (a) sets `idempotencyKey = welcome:<userId>` on the welcome `WalletTransaction` (new column) and (b) calls `ensureWallet(userId)` inside `Debit` before the balance check.
- `finance.v1.GetRevenueStats(range)` <!-- Red Team: RT-11 -->: pro/vip counts, revenue30d, revenue series — the current queries (`admin-stats.service.ts:62-75`, revenue series `:234-248`) run inside finance. Requires a forwarded `stats:read` token.

Functional — auth
- `examio.auth.v1` (`SetUserStatus` is phase 08's, not here <!-- Reconcile: X1 -->): `UpdateUserAdmin(user_id, name?, bio?, is_verified?)`, `SearchUsers(query, limit≤20)` (public fields only), extend `ListUsers` with `created_at`, `utm_source`, cursor. <!-- Red Team: RT-2 --> Actor = forwarded admin token `sub` (`user:manage`); no `actor_id` field.
- `GetPublicProfilesByIds(ids)` → `{id, username, name, avatar}` (any valid token) is already served since phase 04; this phase switches the exam callers to it. <!-- Red Team: RT-15 --> The P02 `GetUsersByIds` becomes privileged: service token + `user:manage`, used by admin only.
- `GetUserStats(range)` <!-- Red Team: RT-11 -->: totalUsers, activeToday, active30d, signups + traffic series, utm source breakdown — the current SQL (`admin-stats.service.ts:56-60`, utm `:155-175`, series `:208-233`) moved verbatim. Requires `stats:read`.
- Events: `auth.user.updated {userId, changed[], version}` (`version` = `updatedAt` ms) for profile/admin edits. <!-- Red Team: RT-10 --> <!-- Reconcile: X1 --> Consumers apply only if newer; ban/kick handlers re-read state.
- `/auth/me` <!-- Updated: Validation Session 1 - no /auth/me compat fields -->: auth stops reading finance tables. Response = `{ user, roles, permissions }`; `user` has no `wallet`, `subscription` or `isAdmin` key. Auth makes no finance call for login/refresh/me.

Functional — admin, gateway, exam, vocabulary
- admin-stats <!-- Red Team: RT-11 -->: calls `GetUserStats` + `GetRevenueStats` in parallel and keeps the 5-min Redis cache (`admin:stats:*`). Response shapes unchanged. No read model, no `admin_metrics_*` tables, no rebuild CLI, no `auth.user.logged_in` or `finance.payment.succeeded` events.
- Page flags: admin PATCH → gateway gRPC `SetPageFlags(flags)`. On boot the gateway pulls `examio.admin.v1.AdminService/GetPageFlags` (retry until available; serve last Redis copy meanwhile). Remove the study-room in-service page-flag read; the gateway checks `pageFlag` at WS upgrade (phase 05).
- finance publishes `finance.subscription.changed {userId, fromTier, toTier, at, version}` (consumer: ai-chat in 13).
- exam: `clients/auth.client.ts` → `getPublicProfiles(ids)` does a Redis `MGET exam:cache:user:<id>` (public projection only, TTL 600s), batch-fetches only the misses with ONE `GetPublicProfilesByIds`, and keeps result order. The exam worker consumes `auth.user.updated` → `DEL` cache. `users/search` → `SearchUsers`.
- vocabulary contract `examio.vocabulary.v1.WordFamilyAdminService { ListCategories, UpsertCategory, DeleteCategory }` is served by exam-service now (moves to vocabulary-service in phase 12). admin-word-family calls it with the forwarded admin token (`word_family:admin`). `DeleteCategory` deletes the R2 `imageUrl` object. Delete the exam CUD category routes.
- `scripts/check-model-ownership.ts`: an ownership map (model → service) is the source for phase 11. It fails if `prisma.<model>`/`tx.<model>` appears outside the owner app.
- dependency-cruiser <!-- Red Team: RT-11 -->: `.dependency-cruiser.cjs` moves here from P01, **enforced** in CI: no `apps/A` → `apps/B` import, `libs` → `apps` forbidden, `libs-no-prisma` (warn now, error in 11).

Non-functional
- Default deadline 3s. <!-- Red Team: RT-1 --> `libs/grpc` retries only allowlisted idempotent RPCs (`Debit`, `Credit`, `Refund`, finance admin writes with a key, all reads). No N+1: user enrichment = 1 RPC per request.
- Admin endpoints keep their response shapes (FE unchanged except wallet loading).

## Architecture
```
admin HTTP ─gRPC (admin token)─► finance FinanceAdminService ─tx─► Wallet/WalletTransaction/Payment/UserSubscription + outbox
admin HTTP ─gRPC (admin token)─► auth UpdateUserAdmin / ListUsers ─tx─► User + outbox(auth.user.updated)   (ban = SetUserStatus, phase 08) <!-- Reconcile: X1 -->
admin stats ─gRPC GetUserStats ∥ GetRevenueStats─► auth / finance (current SQL)   ─► Redis 5-min cache
exam AI ─gRPC Debit(key) (user token)─► finance: INSERT tx ON CONFLICT → adjust balance | already_applied
admin PATCH page flag ─► PageFeatureFlag ─► gRPC gateway SetPageFlags ─► Redis gw:config:pages ─► /config/stream SSE
exam service ─► auth.client.getPublicProfiles (Redis MGET → miss → GetPublicProfilesByIds) ◄─ exam worker DEL on auth.user.updated
FE ProfilePage/SubscriptionPage ─GET /wallet/info (wallet:use)─► finance   (auth /auth/me has no wallet) <!-- Updated: Validation Session 1 - no /auth/me compat fields -->
admin-word-family ─gRPC (admin token)─► exam WordFamilyAdminService (→ vocabulary-service in phase 12)
```
<!-- Red Team: RT-11 --> The event-fed admin read model is removed; KPI semantics stay identical because the same SQL runs in the owner.

## Related Code Files
File ownership (globs). No other phase edits these while 10 runs:
- `/Users/tgiap.dev/devs/examio/examio-be/apps/admin-service/src/modules/{admin-finance,admin-users,admin-stats,admin-page-config,admin-word-family}/**`, `.../admin-service/src/clients/**`
- `/Users/tgiap.dev/devs/examio/examio-be/apps/finance-service/src/modules/{finance-admin,stats}/**` (create), `.../finance-service/src/modules/{wallet,sepay}/**` (incl. P04's `ensure-wallet.service.ts`: welcome key only) <!-- Red Team: RT-1, RT-9 --> <!-- Reconcile: X3 -->
- `/Users/tgiap.dev/devs/examio/examio-be/apps/auth-service/src/{repositories/user.repository.ts,auth.service.ts,auth.controller.ts,grpc/**}`, `.../auth-service/src/modules/stats/**` (create)
- `/Users/tgiap.dev/devs/examio/examio-be/apps/gateway-service/src/{services/config.service.ts,grpc/**}`
- `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/{clients/**,events/**}`, `.../modules/**/*.{service,repository}.ts`, `.../modules/*/dto/sharing.dto.ts`, `.../modules/word-family/**`, `.../modules/finance-client/**`, `.../modules/study-room/study-room.gateway.ts`
- `/Users/tgiap.dev/devs/examio/examio-be/proto/examio/{auth,finance,admin,gateway,vocabulary,events}/v1/**`
- `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/models/payment.prisma` (`idempotencyKey`), `.../libs/grpc/src/clients/finance.client.ts` (create), `.../libs/grpc/src/deadline-retry.ts` (allowlist) <!-- Red Team: RT-1 -->
- `/Users/tgiap.dev/devs/examio/examio-be/scripts/check-model-ownership.ts` (create), `/Users/tgiap.dev/devs/examio/examio-be/.dependency-cruiser.cjs` (create), `/Users/tgiap.dev/devs/examio/.github/workflows/ci.yml` (append the ownership + depcruise steps) <!-- Red Team: RT-11 -->
- FE: `/Users/tgiap.dev/devs/examio/examio-fe/src/{stores/useAuthStore.ts,types/user.ts,apis/walletApi.ts}`, `.../pages/**/ProfilePage.tsx`. [CROSS-PHASE] Phase 09 also edits `useAuthStore.ts`/`types/user.ts`, so this step lands after 09 merges.

Create: the files above marked create, plus `apps/admin-service/src/clients/{auth,finance,gateway,vocabulary}.client.ts`, `apps/exam-service/src/clients/auth.client.ts`, `apps/exam-service/src/modules/word-family/word-family-admin.grpc.controller.ts`.
Delete: exam category CUD handlers (`word-family.controller.ts:54-80`), `WalletService.UpdateBalance` (proto + finance server), the `deductCredits` body in `finance-client.service.ts` (replaced by the shared wrapper), Prisma imports of foreign models in admin/auth/gateway/exam. <!-- Red Team: RT-1 -->

## Implementation Steps
1. Write `check-model-ownership.ts` with an ownership map taken from ARCH Appendix A (exam = content/assessment/studyroom/vocab/aichat/document models for now; ai-service tables listed as `exam` too). Run it in report mode and save the baseline violations. Add `.dependency-cruiser.cjs` and run it; fix cross-app imports. <!-- Red Team: RT-11 -->
2. Proto: finance `Debit/Credit/Refund` server side (contract from P02), FinanceAdminService (no `actor_id`), `GetRevenueStats`; auth `UpdateUserAdmin`, `SearchUsers`, `GetUserStats` <!-- Reconcile: X1 -->; admin `GetPageFlags`; vocabulary WordFamilyAdminService; event schemas `auth.user.updated`, `finance.subscription.changed` (both with `version`). Run `buf lint && buf breaking && yarn proto:gen`. `buf breaking` is expected to flag the `UpdateBalance` removal in step 4 — land it with the documented breaking-change override.
3. finance money <!-- Red Team: RT-1 -->: add `idempotencyKey` + `@@unique([walletId, idempotencyKey])`; implement `Debit/Credit/Refund` (insert-then-adjust, ON CONFLICT → existing tx; `Debit` calls `ensureWallet` first <!-- Reconcile: X3 -->). Add the retry allowlist in `libs/grpc`. Build `libs/grpc/src/clients/finance.client.ts` with the `AI_FREE_MODE` logic moved from `finance-client.service.ts:37-64,111-121`.
4. exam AI callers → `Debit` through the shared wrapper (keys per Requirements). Delete `UpdateBalance` (proto + server) once `grep -rn "updateBalance" apps` → none.
5. finance admin: implement FinanceAdminService (logic ported from `admin-finance.service.ts:96-337`), actor from token. Emit `finance.subscription.changed` from tier changes via outbox. admin-finance → `FinanceClient` with the forwarded admin token; keep `AdminAudit` writes in admin. Map gRPC errors to HTTP via libs/grpc.
6. finance provisioning <!-- Red Team: RT-9 --> <!-- Reconcile: X3 -->: in P04's `ensureWallet`, write the welcome tx with `idempotencyKey = welcome:<userId>`. Nothing else (consumer, lazy ensure, CLI exist from P04).
7. auth: implement `UpdateUserAdmin`, `SearchUsers`, `GetUserStats`; restrict `GetUsersByIds`. admin-users list/PATCH → `AuthClient` (phase 08 already moved role ops and ban/unban onto `SetUserStatus`). <!-- Reconcile: X1 -->
8. auth `/auth/me` <!-- Updated: Validation Session 1 - no /auth/me compat fields -->: remove the wallet/subscription includes (`user.repository.ts:96-121`) and the `wallet`/`subscription` keys from the login/refresh/me mappers. No finance call. Update the e2e snapshot.
9. admin-stats <!-- Red Team: RT-11 -->: replace the Prisma/raw SQL with the two RPCs, keep the Redis cache and `invalidateOverview/Series`.
10. Page flags: admin PATCH (and admin boot warm-up from phase 05) → gateway `SetPageFlags`. Admin stops writing the Redis key itself. Gateway boot pulls `GetPageFlags` when `gw:config:pages` is empty. Remove the `CONFIG_PAGES_KEY` read in `study-room.gateway.ts:90` and the shared constant once unused.
11. exam: add `auth.client.ts` (batch + cache, public projection) and replace every `include: { user|host }` and `user.findMany` with post-query enrichment (collect ids → one call → map). Drop every `email: true` select. `sharing.dto.ts` user fields come from the enrichment. `users/search` → `SearchUsers`. <!-- Red Team: RT-15 -->
12. exam worker: consume `auth.user.updated` → cache `DEL`.
13. vocabulary contract: add `word-family-admin.grpc.controller.ts` in exam word-family. admin-word-family → `VocabularyClient`. Delete the exam CUD category routes.
14. FE <!-- Updated: Validation Session 1 - no /auth/me compat fields -->: remove `wallet` from the `User` type (`types/user.ts`) and from `useAuthStore` (`updateWalletBalance` moves to a wallet slice fed by `walletApi` `GET /wallet/info`, fetched only with `wallet:use`, cached per session, refreshed after payment/debit). Update ProfilePage/SubscriptionPage reads. `grep -rn "user\??\.wallet" examio-fe/src` → none.
15. Run the ownership script in strict mode and depcruise (enforced) in CI.

## Tests
Write first (failing → code):
- finance `Debit` <!-- Red Team: RT-1 -->: same key twice (incl. concurrent, 2 parallel calls) → one tx, balance changed once, second returns `already_applied`; insufficient balance → `FAILED_PRECONDITION`, no tx row; `Refund` twice → one credit; `Refund` of unknown key → `NOT_FOUND`. Money e2e is mandatory (ARCH §12 rule).
- `libs/grpc` retry: `Debit` retried on `UNAVAILABLE`; a non-allowlisted write is never retried.
- `finance.client` wrapper: `AI_FREE_MODE=true` → no RPC; `NODE_ENV=production` forces it off.
- finance FinanceAdminService e2e: same `idempotency_key` twice → one transaction; `Refund` of a refunded payment → `FAILED_PRECONDITION`; a call without a `finance:admin` token → `PERMISSION_DENIED`; a body actor is impossible (no field). <!-- Red Team: RT-2 -->
- Provisioning <!-- Red Team: RT-9 --> <!-- Reconcile: X2, X3 -->: welcome tx carries `idempotencyKey = welcome:<userId>`; `Debit` by a TEACHER with no wallet → wallet created (20) then debited. (Event/lazy/CLI cases are P04's tests.)
- admin-finance e2e with a fake finance gRPC server: HTTP shape unchanged; finance `UNAVAILABLE` → 503 envelope.
- auth `UpdateUserAdmin` <!-- Reconcile: X1 -->: name/bio/isVerified change → outbox `auth.user.updated` in the same tx; a non-`user:manage` token → `PERMISSION_DENIED`. (Ban tests live in phase 08.)
- Stats parity <!-- Red Team: RT-11 -->: a fixture DB → `GetUserStats`/`GetRevenueStats` numbers equal the pre-change `admin-stats.service.ts` output (golden JSON captured before step 9).
- exam `auth.client`: N ids → 1 RPC; all cached → 0 RPC; order preserved; unknown id → `null` placeholder (no throw).
- Email leak contract <!-- Red Team: RT-15 -->: a JSON-key scan over the exam e2e responses (sessions, attempts, flashcard sharing, rooms) → no `email` key. `GetUsersByIds` with a non-admin user token → `PERMISSION_DENIED`.
- `/auth/me` shape <!-- Updated: Validation Session 1 - no /auth/me compat fields -->: TEACHER/STUDENT → no `user.wallet`, `user.subscription`, `user.isAdmin` keys; finance stopped → 200 (no finance dependency).
- `check-model-ownership.ts` self-test: a fixture violation → exit 1. depcruise fixture: `apps/a` importing `apps/b` → error.

## Todo List
- [x] Ownership script (report mode) + depcruise config <!-- Red Team: RT-11 --> — `check:ownership` 0 violations; `check:deps` 0 errors (round 4).
- [ ] Protos + events schemas (with `version`) — proto gen/lint/breaking pass (documented override). `auth.user.updated` proven live (C4). `finance.subscription.changed` emission NOT evidenced (consumer lands in 13); open.
- [x] `idempotencyKey` + Debit/Credit/Refund + retry allowlist <!-- Red Team: RT-1 --> — finance e2e 52/52; deadline-retry + idempotent-rpcs specs 18/18. Key-stability gap is B2, carried to 15.
- [x] Shared finance client wrapper (AI_FREE_MODE); exam callers → Debit; delete UpdateBalance <!-- Red Team: RT-1 --> — grep clean. Interim keys differ from spec (see deviations).
- [x] FinanceAdminService (actor from token) + admin-finance → FinanceClient <!-- Red Team: RT-2 --> — finance e2e, admin 27/27, live C1 money and F1 credit/tier/refund (round 4).
- [x] Provisioning: `welcome:<userId>` key + `ensureWallet` inside `Debit` <!-- Red Team: RT-9 --> <!-- Reconcile: X3 --> — welcome-key test in finance e2e; live M6 teacher without wallet minted +20, then debited.
- [x] auth UpdateUserAdmin/SearchUsers/GetUserStats; callers on GetPublicProfilesByIds <!-- Reconcile: X1 --> — auth 61/61 (round 1); live rename → cache DEL (C4).
- [x] `/auth/me` without finance reads; no `wallet`/`subscription`/`isAdmin` keys <!-- Updated: Validation Session 1 - no /auth/me compat fields --> — C2 shape; 200 with finance stopped.
- [x] GetUserStats/GetRevenueStats + admin-stats switch <!-- Red Team: RT-11 --> — stats parity e2e; live `/admin/stats` 14/14 vs legacy SQL on the same DB.
- [x] Page flags via SetPageFlags/GetPageFlags — live C5 PASS, boot pull, admin down then up, L2 re-pull ≤60s. Key-name drift W4 (see carried).
- [x] exam user enrichment via GetPublicProfilesByIds + cache + invalidation; no `email` — C4, H1 (520/520 names), H2; `email: true` grep clean; W2 DTO field removed. F2 carried.
- [x] WordFamilyAdminService in exam; admin uses it; delete dup routes — C6 routes 404; image create/replace/delete 13/13; N6 PASS. W1 duplicate-name 500 fixed in code (`word-family-admin.service.ts:18-29`), not re-run live.
- [x] FE wallet loading via `GET /wallet/info`; `User.wallet` removed (after phase 09) <!-- Updated: Validation Session 1 - no /auth/me compat fields --> — ProfilePage probe 6/6; grep clean.
- [x] Ownership script strict + depcruise enforced in CI — `ci.yml:176-179`, no `continue-on-error`.

## Success Criteria
- `cd /Users/tgiap.dev/devs/examio/examio-be && npx ts-node scripts/check-model-ownership.ts --strict` → exit 0. `npx depcruise apps libs --config .dependency-cruiser.cjs` → 0 errors.
- `grep -rnE "(prisma|tx)\.(wallet|walletTransaction|payment|userSubscription|user|userSession)\b" apps/admin-service/src` → no output.
- `grep -rnE "(prisma|tx)\.(user|userSession)\b" apps/exam-service/src apps/gateway-service/src` → no output. `grep -rn "email: true" apps/exam-service/src` → no output.
- `grep -nE "wallet|subscription" apps/auth-service/src/repositories/user.repository.ts` → no output. `grep -rnE "user\??\.wallet|isAdmin" examio-fe/src/{types/user.ts,stores/useAuthStore.ts,pages}` → none. <!-- Updated: Validation Session 1 - no /auth/me compat fields --> `grep -rn "UpdateBalance\|updateBalance" apps proto libs` → no output.
- `yarn build && yarn test` green. `cd ../examio-fe && yarn build && yarn lint` green.
- Manual: admin credit with a repeated key → balance changes once; AI generate retried by the client lib → one debit; admin profile edit (name) → exam views show the new name after cache `DEL`. <!-- Reconcile: X1 --> Admin overview numbers equal the pre-phase values on the same DB.

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Double debit/credit on retry | M | H | `@@unique([walletId, idempotencyKey])` + ON CONFLICT; retries only on allowlisted RPCs; concurrent-call e2e <!-- Red Team: RT-1 --> |
| A caller still on `UpdateBalance` at deploy | M | H | Grep gate before deleting; on the branch both change in the same commit range, and production gets them together at the one cutover (waves apply only afterwards) <!-- Red Team: RT-1 --> <!-- Updated: Validation Session 1 - single production deploy --> |
| Teacher without a wallet (lost event) | M | M | P04 provisioning + `ensureWallet` inside `Debit` <!-- Red Team: RT-9 --> <!-- Reconcile: X3 --> |
| Enrichment adds latency to list endpoints | M | M | Redis MGET, a single batch RPC, deadline 3s, degrade to `user: null` on `UNAVAILABLE` |
| Teacher views lose student emails | M | L | Intended (RT-15); show username/name; flag the FE copy change in the PR <!-- Red Team: RT-15 --> |
| Stats RPC slower than local SQL | L | L | Same SQL, parallel calls, 5-min cache unchanged <!-- Red Team: RT-11 --> |
| Gateway boots before admin → no flags | M | M | Serve the last Redis copy; retry the pull with backoff; default = all enabled (matches current fallback [UNVERIFIED]) |
| FE edit collides with phase 09 | M | M | Land the FE step after 09 merges |

## Rollback
- Each step is its own commit; revert per step. No data migration (DB reset), so a revert needs no data repair. Revert order for money: re-add `UpdateBalance` (step 4 revert) before reverting the exam caller switch. <!-- Red Team: RT-1 -->

## Security Considerations
- `SearchUsers`/`GetPublicProfilesByIds` return no email; `SearchUsers` is TEACHER-only upstream (`user:search`, phase 06) and rate-limited at the gateway. `GetUsersByIds` (email) requires a service token + `user:manage`. <!-- Red Team: RT-15 -->
- <!-- Red Team: RT-2 --> Every state-changing RPC here requires a forwarded user token with the needed permission (actor = token `sub`) or an allowlisted service token (P04). Network placement is not the trust boundary. Admin HTTP keeps `finance:admin`/`user:manage` and records `AdminAudit` with the token actor.

## Next Steps
- Phase 11 uses the ownership map to split schemas and drop cross-service FKs. <!-- Red Team: RT-11 --> User deletion is deferred (roadmap item).
- Phase 15 replaces the interim debit keys with `doc:`/`gen:` keys and the charge-first job flow (RT-1).
- No `/auth/me` compat removal remains for phase 19 (RT-13 reversed by validation Q6). <!-- Updated: Validation Session 1 - no /auth/me compat fields -->
- [CARRIED from 09] D9: a possible double 403 toast on one denied action. Fix in the FE step that lands after 09; a test shows one toast per denied action. **Closed live 2026-10-23** (round 4: one denied call → one toast node).

## Close-out (sync 2026-10-23)

Evidence: [phase-10-runs.md](../evidence/phase-10-runs.md) (rounds 1–4; round 4 is the final verdict: C1 and F1 pass live). Verdict on the targeted scope: closes once W1 is re-run live and the open items below have owners.

### Delivered beyond plan / deviations
Each line: what changed → why → cost. "Why" marked *not recorded* where the brief gave none; lead to fill.
- auth: separate `AuthUserService` gRPC service (UpdateUserAdmin, SearchUsers, GetUserStats, GetUserAdminDetail), not on `AuthService`. Why: *not recorded*. Cost: one more gRPC service to register and own.
- finance: `FinanceAdminService.RefundPayment` (plan said `Refund`); `AdjustBalance` takes `direction` ADD|SUBTRACT, not a signed amount; `GetUserFinance` added; revenue stats on `FinanceStatsService.GetRevenueStats`. Why: *not recorded*. Cost: names differ from the plan's Requirements.
- `WalletTransaction.balanceAfter` added. Why: *not recorded*. Cost: one more column.
- Ledger keys namespaced (`debit:` / `credit:` / `refund:` / `adjust:` / `refund-payment:` / `welcome:`) with a replay fingerprint check → `IDEMPOTENCY_KEY_REUSED`. Why: keys from different operations must not collide, and a reused key with a different amount must not fabricate a balance (live M3 PASS). Cost: the fingerprint column/logic.
- Migrations: `20261022090000_wallet_idempotency` plus new `20261023090000_payment_refund_key` (`Payment.refundIdempotencyKey`). Why: refund replay needs its own key. Cost: a second migration; DB reset at cutover, so no data work.
- Proto renames: `revenue_last30d`, `active_last30d`. Why: *not recorded*. Cost: contract change, FE/admin updated in step.
- `Debit` mints the welcome wallet only for a caller-self TEACHER user token; exam forwards the user's access token on every `Debit`. A service token gets `WALLET_NOT_FOUND`. Why: narrower than the plan's "ensureWallet inside Debit"; a service must not create wallets. Cost: `WALLET_NOT_FOUND` is detected by message text (carried to 15).
- `UserMonthlyFileUpload` owner = document; unused finance methods deleted. Why: one owner per model. Cost: none known.
- Admin `Idempotency-Key` header (FE sends one per action); post-commit `AdminAudit` is best-effort; `alreadyApplied` in admin finance responses. Why: retry-safe admin money. Cost: an audit row can be lost if the admin process dies between commit and audit write.
- Gateway page-flag pull with retry, plus a 60 s watcher. Why: the boot pull alone missed a flush at runtime (L2). Cost: a periodic pull per gateway instance.
- exam profile cache: chunked batch RPC (≤500 ids) + tombstone Lua guard on SET. Why: 500-id whitelists (H1). Cost: a Lua script in the cache path.
- `nest-cli.json` proto assets for all services + a guard test. Why: B1, dist could not boot. Cost: build config must list each service's protos.
- Legacy `EventSubscriberService` requires `SERVICE_NAME`. Why: default queue `common-queue` has no broker grant (W3). Cost: an env var that must be set per service.
- depcruise: cross-app test imports moved to `test/cross-app`; rule set to error. Why: CI enforcement. Cost: none known.
- CI: ownership strict, depcruise, money e2e, stats parity, real-Redis study-room adapter step. Why: gates. Cost: longer CI.

### Fixed while tempering (pre-existing bugs)
- N1 study-room Redis adapter never subscribed (cross-instance fan-out dead). Fixed; live 3/3 before and after Redis restart, NUMPAT 1, NUMSUB 2.
- C1 cross-instance `fetchSockets` crashed the process (`Timeout` in `socket.data`). Fixed; repro 10/10 and standalone control.
- N2 room detail cache stale after session writes. Fixed; PUT whitelist → detail 2/2.
- B3 audit `actorId` NaN, plus FE actor filter param. Fixed; live label and filter PASS.
- F1 admin credit modal always 400. Fixed; live ADD/SUBTRACT/double-click PASS (round 4).
- M1 (exam) AI reuse path ran for free on a refused debit. Fixed per brief. Not the same M1 as the evidence file's refund-replay note (below).
- W2 email in exam OpenAPI DTO. Fixed.
- W1 duplicate category name → 500. Fixed in code (`word-family-admin.service.ts:18-29`, P2002 → `ALREADY_EXISTS`). Not re-run live. Owner: *not named in the brief*.
- ChangeTier `isActive` no-op; `kickUser` local fallback; reason trim validation. Fixed.
- B1 dist could not boot exam/admin. Fixed (see nest-cli.json deviation); live boot with no `PROTO_ROOT` PASS.
- Evidence M1 (refund replay returns no `alreadyApplied`). Code and e2e now return `alreadyApplied: true` on replay (`finance-admin.e2e-spec.ts:139-162`, `admin-finance.e2e-spec.ts:155`). Live replay not re-run in round 4 (round 4 second refund click got 409 `PAYMENT_ALREADY_REFUNDED`).
- B4 auth e2e not repeatable. Code now uses a unique `utmSource` per run (`auth-users.e2e-spec.ts:150`). Round 1 run 2 (same DB, no reset) was the only failure.
- B5 study-room spec ignored `REDIS_PASSWORD`. Code now passes it (`study-room-ws.e2e-spec.ts:112`).

### Deferred / carried (target phase)
- B2 interim AI debit keys until 15: `doc:` / `gen:` keys and the charge-first job flow replace them. Upload double-submit = two storages = two charges. → **15**.
- Live AI-generation debit retry proof (needs ai-service + R2). → **15**.
- B2-upload: the keys follow Requirements (`upload:<storageId>` / `quick-upload:<storageId>`, the id of the `UserStorage` row created by that call; `libs/grpc` retries reuse it). A client re-submitting the same file creates a new storage row and is charged again; request-level dedupe (client key or content hash) belongs to the phase-15 charge-first flow. → **15**.
- `buf.yaml` `UpdateBalance` breaking override must be removed after merge to main. → **16**.
- N3 whitelist accepts arbitrary strings. → **14**.
- F2 exam profile cache keeps a deleted user's name up to 600 s. No product path sets `deletedAt` yet. → **no phase in this plan** (user deletion is a roadmap item). Owner needed.
- L4 page-flag push serialization is per admin instance; multi-replica needs a gateway version. → **16**.
- `WALLET_NOT_FOUND` detected by gRPC message text; add a structured detail. → **15**.
- exam e2e parallel jest worker segfault (serial OK; CI `maxWorkers 1`). → **16**.
- N1 Redis-down degraded boot not run live. → **16**.
- admin user detail `deletedAt` always null (auth User proto has no field). → **19**.
- Docs: plan line says `gw:config:pages`; code key is `config:pages:flags` (`libs/common/src/constants/cache-keys.ts:158`). Target not given in brief; proposed **19**.

### Open at close (surfaced by the sync, not in the brief)
- W1 live re-run (see Fixed). Owner needed.
- U1: `dist/apps/exam-service` vanished once mid-run, cause unknown. Watch in CI. → **16**.
- W6: empty page-flag default (`{"pages":[]}`) vs plan "all enabled". FE treatment unchecked. → **16**.
- N4: audit label shows `username`; admin dropdown shows display name. Design call, open. Owner needed.
- W3: `SERVICE_NAME` unset path not re-tested after the fix. Owner needed.
- `finance.subscription.changed` emission not evidenced (see Todo).
- C14b in the live harness still expects a numeric `actorId`. Harness-only; the contract is the string id.

### Success criteria status
- Met: depcruise and ownership gates; grep gates; `/auth/me` shape; no `UpdateBalance`; Debit same-key, insufficient, refund twice, unknown key (finance e2e 52/52); admin shapes and 503 on finance down (L8); stats 14/14 live; page flags; exam no-email; `yarn build && yarn test` and FE build/lint/test green.
- Not met, deferred to 15: "AI generate retried by the client lib → one debit" (manual criterion).
- Not met, deferred to 15: upload retry → one debit (B2-upload).
- Not re-run live: W1 (fixed in code).
