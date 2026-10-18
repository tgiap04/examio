# Phase 11 — Database per Service

## Context Links
- [plan.md](./plan.md) · [planner-brief.md](./reports/planner-brief.md) decisions 1, 13, 15 · [red-team-changes.md](./reports/red-team-changes.md) (RT-8, RT-11, RT-14 override the brief)
- [researcher-02 §1 Prisma, §6 Postgres](./research/researcher-02-migration-mechanics-report.md)
- `/Users/tgiap.dev/devs/examio/ARCHITECTURE.md` §7.1–7.2, §8.2, §12 P4, Appendix A
- Prior: [phase-10](./phase-10-cut-cross-db-access.md) (ownership map), [phase-01](./phase-01-guardrails-and-cleanup.md) (single baseline + `migrate deploy`, **Prisma spike go/no-go**)

## Overview
- Priority: P1 · Status: Pending · Effort: 3d · Depends on: 10, and a GO result of the P01 Prisma/bundling spike recorded in plan.md <!-- Red Team: RT-14 -->
- Goal: each service connects with its own role that sees only its own schema. Per-service Prisma schema, client and migrations. Cross-service FKs dropped (keep `userId` + `@@index`). Rows owning R2 objects are deleted with a durable `r2_delete_tasks` outbox. `libs/database` (incl. the stale `libs/database/prisma/` tree) and `prisma:merge` deleted. **DB reset, no data copy.**
- <!-- Red Team: RT-11 --> **[DEFERRED] user deletion**: no admin DELETE, no auth `DeleteUser`, no purge worker, no per-service purgers, no `auth.user.deleted` event in this plan. Phase 19 records it in `docs/development-roadmap.md`. Dropping the FKs does not change today's behaviour because no code path deletes `User` rows.

## Key Insights
- Today there is one merged schema (`libs/database/src/schema.prisma`, 48 models) with 24 FKs → `User`, all cascade. The authoritative sources are `libs/database/src/models/*.prisma` (12 files). <!-- Red Team: RT-14 --> `libs/database/prisma/` is a **stale** tree (`schema.prisma` with 28 models, `base.prisma`, `models/`) that still hosts the live seeds: `package.json:29` `prisma:seed` → `libs/database/prisma/seed.ts`, `:30` `seed:dev` → `libs/database/prisma/seed-dev.ts` (run by `deploy/entrypoint-seed.sh:10`).
- Seed inventory <!-- Red Team: RT-14 -->:
  - `prisma/seed.ts`: PageFeatureFlag (`:11-29`, admin), SubjectCategory/Subject inline (`:179-210`, exam legacy → ai-chat in 13), word-family categories via `src/seed/word-family-category.seed.ts` (`seed.ts:231-232`, exam legacy → vocabulary in 12).
  - `prisma/seed-dev.ts`: admin + users (`:171,208`, auth), wallet/payment/walletTransaction (`:240,282,320`, finance), adminAudit + pageFeatureFlag (`:350,380`, admin).
  - `src/seed/subject.seed.ts`: no importer found (grep) [UNVERIFIED dead; compare its list with `seed.ts:179-210` and keep one].
- With the `prisma-client` generator + `@prisma/adapter-pg`, `?schema=` qualifies only generated SQL. Raw SQL (outbox relay, stats) needs role-level `search_path` (researcher-02 §1). The P01 spike validated this incl. `nest build --webpack` and `migrate deploy` with `?schema=`. <!-- Red Team: RT-14 --> NO-GO fallback: classic `prisma-client-js` with a per-service `output`.
- `migrate dev` needs a shadow DB, so dev uses a superuser shadow URL. Prod `migrate deploy` does not.
- ai-service still reads/writes exam-owned tables (`"Document"`, `"UserStorage"`, `"HistoryGenerated*"`, graph) until phase 15. (`BenchmarkItem` no longer exists: deleted in phase 01.) <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 --> It gets a temporary least-scope grant.
- ai-service runs DDL at runtime (`graph_storage_service.py:220-257`; `benchmark_index_service.py` is gone since phase 01 <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->). Postgres checks CREATE privilege on the schema even for `IF NOT EXISTS` [UNVERIFIED]. Guard it behind `AI_RUNTIME_DDL=false`.
- R2 deletes happen after the row delete with no retry, so a failure leaves orphans <!-- Red Team: RT-8 -->: `flashcardset.service.ts:250-254` (thumbnail), `:396` (old image on update), `quizset.service.ts:239,411`, `ai-chat.service.ts:769` (clearChat files), `ai.service.ts:908` (deleteUpload), `apps/auth-service/src/profile/profile.service.ts:199-206` (old avatar/banner), plus `DeleteCategory` (phase 10).
- exam stays as a **legacy** schema split into multi-file Prisma (`prisma/schema/*.prisma`), so 12–15 each own one file [UNVERIFIED: multi-file schema GA in Prisma 6.7+; fallback = one file with model-region ownership].
- Phase 03 put one shared `outbox_events` (with `source`) + `processed_events` (PK `consumer, event_id`) in `libs/database/src/models/messaging.prisma`. Each service schema gets its own copy of both tables. The `source`/`consumer` columns stay (harmless, phase 03), so `libs/messaging` needs no change for them.
- `BaseRepository` (`libs/common/src/repositories/base.repository.ts:2,27`) imports `PrismaService` from `@examio/database`. It is used by 9 repositories, so retype it structurally rather than rewrite them.
- <!-- Red Team: RT-14 --> `libs/observability` health stays Prisma-free (P01: injected `ReadinessCheck[]`). Each local Prisma module provides a `db` ReadinessCheck (`SELECT 1`).

## Requirements
Functional
- Schemas + roles (all created now, so 12–15 never touch init): `auth, finance, admin, exam (legacy), content, assessment, studyroom, vocabulary, aichat, document, ai` → role `<schema>_svc`, plus a shared `extensions` schema for pgvector.
- Per-service Prisma (decision 13): `apps/<svc>/prisma/schema.prisma`, generator `prisma-client`, `output = "../src/generated/prisma"`, `moduleFormat = "cjs"`, `engineType = "client"`; runtime `PrismaPg` adapter with `schema` from the URL.
- Model placement:
  - auth: User, UserSession, VerifyAccountCode, ResetPasswordCode, RoleChangeLog, outbox, `r2_delete_tasks`
  - finance: Wallet, WalletTransaction, Payment, UserSubscription, outbox, processed
  - admin: AdminAudit, PageFeatureFlag, processed <!-- Red Team: RT-11 --> (no read-model tables)
  - exam legacy files: `base` (generator, outbox, processed, `r2_delete_tasks`), `content`, `assessment`, `study-room`, `vocabulary`, `ai-chat` (+ Subject*), `document` (UserStorage, UserMonthlyFileUpload), `ai` (Document, DocumentEntity, UserStorageGraph*) <!-- Updated: Validation Session 1 - BenchmarkItem/score deleted in P01 -->.
- FKs: drop every FK to `User` (keep `userId String` + `@@index`). FKs inside exam legacy stay until extraction.
- Durable R2 deletion <!-- Red Team: RT-8 -->: table `r2_delete_tasks(id uuid PK, key text, attempts int default 0, next_attempt_at timestamptz default now(), last_error text?, created_at)` + index `(next_attempt_at)`, in every schema whose service owns R2 objects (auth and exam legacy now; 12–15 add it to content, aichat, document, vocabulary). The row delete (or image replace) and the task insert happen in the SAME tx. A worker (`ROLE=worker`) claims due rows (`FOR UPDATE SKIP LOCKED`, short tx, `next_attempt_at = now()+30s`), calls `r2.v1.DeleteObjects(keys[≤100])` with a service token outside the tx, then deletes the rows; on failure `attempts++`, backoff `min(2^attempts × 30s, 1h)`; `attempts ≥ 10` → error log + metric, row kept. No handler calls R2 after commit.
- Shared code `libs/messaging/src/r2-delete/{r2-delete-task.writer.ts,r2-delete.worker.ts}` (Prisma-free, takes a structural `PrismaLike` tx with `$executeRaw`/`$queryRaw`).
- One URL→key resolver `libs/common/src/utils/r2-key-from-url.ts` replaces the three copies of `replace(/^https?:\/\/[^/]+\//, '')` (`flashcardset.service.ts:251`, `quizset.service.ts:237`, `profile.service.ts:216-217`). It returns a key only for URLs on the configured R2 public host (`R2_PUBLIC_URL`), else `null`, so external URLs are never deleted. <!-- Red Team: RT-8 -->
- Per-service seeds <!-- Red Team: RT-14 -->: `apps/auth-service/prisma/seed.ts` (admin bootstrap stays CLI; dev users), `apps/finance-service/prisma/seed.ts` (dev wallets/payments), `apps/admin-service/prisma/seed.ts` (PageFeatureFlag + dev audit), exam legacy `apps/exam-service/prisma/seed/{subjects,word-family-categories}.ts` (one file per future owner, moved in 12/13). `seed:dev` runs each service's dev seed in order auth → finance → admin → exam.
- Delete `libs/database` (both `src/` and the stale `prisma/` tree), the `@examio/database` path alias, `prisma:merge|push|seed|...` root scripts, and the `examio-migration` container.

Non-functional
- Pool `max: 5` per process. Postgres `max_connections=200`. A role cannot read another schema (verified by test).

## Architecture
Postgres init outline — `deploy/postgres/init/01-service-schemas.sh` (runs only on an empty data dir; DB reset):
```bash
set -euo pipefail
SVCS="auth finance admin exam content assessment studyroom vocabulary aichat document ai"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
REVOKE ALL ON DATABASE $POSTGRES_DB FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
SQL
for s in $SVCS; do pw_var="${s^^}_DB_PASSWORD"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   -c "CREATE ROLE ${s}_svc LOGIN PASSWORD '${!pw_var}' CONNECTION LIMIT 40" \
   -c "GRANT CONNECT ON DATABASE $POSTGRES_DB TO ${s}_svc" \
   -c "CREATE SCHEMA $s AUTHORIZATION ${s}_svc" \
   -c "ALTER ROLE ${s}_svc SET search_path = $s, extensions"
done
# TEMPORARY until phase 15 (ai-service still on exam tables):
psql ... -c "GRANT USAGE ON SCHEMA exam TO ai_svc" \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE exam_svc IN SCHEMA exam GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ai_svc"
```
- ai-service sets the search path per pool (`asyncpg server_settings={"search_path": os.environ["DB_SEARCH_PATH"]}`): `exam,extensions` now, `ai,extensions` in phase 15. No `ALTER ROLE` is needed later.
- Runtime: `DATABASE_URL=postgresql://<svc>_svc:***@postgres:5432/examio?schema=<svc>` (the role's `search_path` covers raw SQL).

Migration baseline procedure (per service, fresh DB):
1. `docker compose -f deploy/docker-compose.yml down -v && docker compose up -d postgres` (init runs).
2. `scripts/prisma-migrate-dev.sh <svc> init`. It creates `examio_shadow_<svc>` as superuser with schema `<svc>` + `extensions`/vector, then runs `prisma migrate dev --create-only --name init --schema apps/<svc>-service/prisma/schema.prisma` (exam: `--schema apps/exam-service/prisma/schema`) with `shadowDatabaseUrl`.
3. Hand-edit `migration.sql`: outbox partial index `WHERE published_at IS NULL`; `r2_delete_tasks` index. Check the `vector` columns in exam.
4. `prisma migrate deploy` via `<svc>-migrate` → commit `apps/<svc>-service/prisma/migrations/**`. Delete the phase-01 baseline under `libs/database/src/migrations`.
5. Later model moves (12–15): new `migrate dev --create-only` in both the source (drop) and target (create) services. No data copy.

R2 delete flow <!-- Red Team: RT-8 -->:
```
service tx { DELETE row | UPDATE image ; INSERT r2_delete_tasks(key) } ─commit─► worker poll (SKIP LOCKED) ─gRPC DeleteObjects (svc token)─► r2 ─► DELETE task rows | backoff
```

## Related Code Files
File ownership (globs; sequential phase, but 09/18 may run in parallel; FE untouched): <!-- Red Team: RT-11 -->
- `/Users/tgiap.dev/devs/examio/examio-be/apps/{auth,finance,admin,exam}-service/prisma/**` (create)
- `/Users/tgiap.dev/devs/examio/examio-be/apps/{auth,finance,admin,exam,gateway,r2}-service/src/**` (import swaps `@examio/database` → local `src/prisma/`; R2 delete call sites → task writer)
- `/Users/tgiap.dev/devs/examio/examio-be/libs/database/**` (delete, incl. `libs/database/prisma/**`), `.../libs/common/src/{repositories/base.repository.ts,utils/r2-key-from-url.ts}`, `.../libs/messaging/src/r2-delete/**` (create) <!-- Red Team: RT-8, RT-14 -->
- `/Users/tgiap.dev/devs/examio/examio-be/apps/ai-service/src/{rag/vector_store_pg.py,backend/services/*.py}` (search_path + DDL guard only)
- `/Users/tgiap.dev/devs/examio/examio-be/deploy/{postgres/**,compose/**,docker-compose.yml,Dockerfile,Dockerfile.migration,Dockerfile.seed,entrypoint-migration.sh,entrypoint-seed.sh,env/*.env.example}`
- `/Users/tgiap.dev/devs/examio/examio-be/{package.json,tsconfig.json,jest.config.js,nest-cli.json,.gitignore,scripts/prisma-*.sh}`

Create: `deploy/postgres/init/01-service-schemas.sh`, `deploy/compose/{auth,finance,admin,exam,gateway,r2,ai,infra}.yml` (top-level `include:`), `deploy/env/<svc>.env.example`, `apps/<svc>-service/src/prisma/{prisma.service.ts,prisma.module.ts}`, `apps/exam-service/prisma/schema/{base,content,assessment,study-room,vocabulary,ai-chat,document,ai}.prisma`, `apps/{auth,finance,admin}-service/prisma/seed.ts`, `apps/exam-service/prisma/seed/{subjects,word-family-categories}.ts`, `libs/messaging/src/r2-delete/*`, `libs/common/src/utils/r2-key-from-url.ts`.
Delete: `libs/database/**` (incl. the stale `prisma/` tree after the seeds are relocated), `entrypoint-migration.sh` (replaced by `ROLE=migrate`), the `examio-migration` compose service.

## Implementation Steps
0. Gate <!-- Red Team: RT-14 -->: read the P01 spike result in plan.md. GO → `prisma-client` + adapter-pg. NO-GO → `prisma-client-js` with `output = "../src/generated/prisma"` per service (same layout; only the generator block and the PrismaService differ).
1. Write the init script and per-service DB passwords in `deploy/env/*.env.example`. Compose `postgres` mounts `deploy/postgres/init` and no longer publishes a port (phase 01).
2. Split the compose file into `deploy/compose/*.yml` + `include:`. Each service gets `<svc>-migrate` (`Dockerfile.migration`, `ARG SERVICE`, runs `prisma migrate deploy --schema apps/$SERVICE/prisma`) + `depends_on: service_completed_successfully`. 12–15 then only add a file + one include line.
3. Per service: create the schema file from the ownership map (phase 10) using `libs/database/src/models/*.prisma` as the only source (never the stale `prisma/` tree), remove `User` relations, keep indexes. Add `r2_delete_tasks` to auth + exam `base`. Generate the client into `src/generated/prisma` (gitignored). Add `prisma.service.ts` with the adapter + a `db` ReadinessCheck.
4. Swap all `@examio/database` imports (76 files) to the local Prisma module. Retype `BaseRepository` to a structural `PrismaLike` so `libs/common` imports no Prisma (dependency-cruiser `libs-no-prisma` → error).
5. Generate baselines per the procedure above. `package.json`: `prisma:generate` loops over `apps/*/prisma`; `prisma:migrate <svc>`; delete the `merge`/`push` scripts.
6. ai-service: env `DATABASE_URL` as `ai_svc`, `DB_SEARCH_PATH=exam,extensions`, `AI_RUNTIME_DDL=false` guarding the DDL blocks.
7. R2 deletion <!-- Red Team: RT-8 -->: write `libs/messaging/src/r2-delete/*`. Replace every call site listed in Key Insights with `r2DeleteTasks.enqueue(tx, keys)` inside the delete/update tx (move the delete into a `$transaction` where it is not one yet). Run the worker in auth + exam `ROLE=worker`. (exam/auth are already in the r2 `DeleteObjects` `@ServiceOnly` decorator since P04; nothing to add.) <!-- Reconcile: X6 -->
8. Seeds <!-- Red Team: RT-14 -->: move each block from the inventory to its owner file; `seed:dev` / `prisma:seed` scripts call the per-service seeds; `Dockerfile.seed` + `entrypoint-seed.sh` run them per service. Remove the `DATABASE_URL` echo (phase 01 check). Then `git rm -r libs/database/prisma`.
9. Delete `libs/database`, its alias in `tsconfig.json` + `jest.config.js` moduleNameMapper, and the nest-cli `database` project.

## Tests
Write first:
- `test/db-isolation.e2e-spec.ts` (runs against compose Postgres): as `content_svc`, `SELECT 1 FROM auth."User"` → permission denied; as `auth_svc`, raw `SELECT count(*) FROM outbox_events` resolves in schema `auth`.
- Migration smoke: from an empty DB, every `<svc>-migrate` exits 0 and `prisma migrate status` reports up to date.
- R2 delete <!-- Red Team: RT-8 -->: delete a FlashCardSet with a thumbnail → a task row exists in the same tx (tx rollback → no row); worker with a fake r2 gRPC → `DeleteObjects([key])` once, row gone; fake r2 `UNAVAILABLE` → `attempts=1`, `next_attempt_at` pushed, retried later; two workers in parallel → each key sent once. A static test greps the modified services for `deleteFile(`/`deleteImage(` → none outside the worker.
- Seeds <!-- Red Team: RT-14 -->: `yarn seed:dev` on an empty compose DB → exit 0; counts match the pre-split seed (page flags 9, subjects/categories, word-family categories, dev users/wallets).
- `BaseRepository` structural type: the 9 repositories compile against the local clients (`yarn build`).

## Todo List
- [ ] Spike gate check (P01 result) <!-- Red Team: RT-14 -->
- [ ] Init SQL + env examples + compose split
- [ ] Per-service schemas (auth, finance, admin, exam multi-file) from `src/models` only
- [ ] Local Prisma modules + ReadinessCheck; swap 76 imports; retype BaseRepository
- [ ] Baseline migrations + `<svc>-migrate` containers
- [ ] ai-service search_path + DDL guard + temporary grants
- [ ] `r2_delete_tasks` + shared writer/worker + call-site conversion <!-- Red Team: RT-8 -->
- [ ] Seed inventory → per-service seeds; delete the stale `libs/database/prisma/` tree <!-- Red Team: RT-14 -->
- [ ] Delete `libs/database` + scripts

## Success Criteria
- `cd /Users/tgiap.dev/devs/examio/examio-be && ls libs/database 2>/dev/null` → empty. `grep -rn "@examio/database\|libs/database" apps libs package.json deploy` → no output.
- `docker compose -f deploy/docker-compose.yml up -d --wait` from an empty volume → all `*-migrate` exit 0, all APIs healthy; `yarn seed:dev` exit 0.
- `docker compose exec postgres psql -U content_svc -d examio -c 'select 1 from auth."User"'` → `permission denied`.
- `yarn build && yarn test` green (incl. the db-isolation e2e). `npx depcruise apps libs` → 0 errors.
- Deleting a flashcard set with a thumbnail in the FE → `r2.DeleteObjects` log line with the key within 60 s; with r2 stopped, the task stays and succeeds after r2 restarts. <!-- Red Team: RT-8 -->

## Risk Assessment
| Risk | L | I | Mitigation |
|---|---|---|---|
| Raw SQL hits the wrong schema | M | H | Role `search_path`; db-isolation test; outbox relay test per service |
| Prisma generator/bundling fails in the per-service layout | L | H | P01 spike gate; NO-GO fallback `prisma-client-js` per-service output <!-- Red Team: RT-14 --> |
| Prisma multi-file schema unsupported in pinned version | L | M | Spike first. Fallback: single exam file with marked regions + an ownership comment |
| A seed is lost when the stale tree is deleted | M | M | Inventory above; seed count test before `git rm` <!-- Red Team: RT-14 --> |
| ai-service breaks on the role change | M | H | DDL guard; temporary grants; smoke with upload → process → generate |
| R2 orphans | L | M | Task row in the same tx; worker backoff; stuck-task metric <!-- Red Team: RT-8 --> |
| Prod data present (decision says reset) | L | H | Prod reset happens once, at the final-merge cutover (phase 16 runbook: dump kept, volumes dropped). If not, `ALTER TABLE … SET SCHEMA` (ARCH P4) instead of drop/create <!-- Updated: Validation Session 1 - single production deploy --> |

## Rollback
- Git revert of the phase + `docker compose down -v` (DB reset is policy). The old compose, the single migration container, `libs/database` (incl. seeds) and the direct R2 calls come back with the revert. The init script is idempotent only on an empty volume, so reset again if needed.

## Security Considerations
- Least privilege: each role owns only its schema; `public` revoked; DB passwords are per-service env and are not logged.
- The temporary `ai_svc` grant on `exam` is tracked as debt and removed in phase 15 (test asserts that).
- `DeleteObjects` is state-changing → service token from an allowlisted caller only (RT-2). Task rows hold object keys, not URLs with credentials. <!-- Red Team: RT-8 -->

## Next Steps
- 12–14 move model files from exam legacy into new services, each with its own `r2_delete_tasks` where it owns R2 objects. 15 moves `document`/`ai` files and drops the temporary grant.
- <!-- Red Team: RT-11 --> [DEFERRED] user deletion (admin DELETE → auth `DeleteUser` → `auth.user.deleted` fan-out + purgers) — roadmap item, recorded by phase 19.
