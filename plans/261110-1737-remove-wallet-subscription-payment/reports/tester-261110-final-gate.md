# Tester final gate: remove wallet, subscription and payment (DB and broker layer)

Branch `feat/remove-finance`, all changes uncommitted, base `develop`. No production code edited, no git state changed, docs untouched.

Logs: `/private/tmp/claude-501/-Users-tgiap-dev-devs-examio/98946b76-ed84-4c4e-b639-fed5f91646c2/scratchpad/rmfin-logs/` (one `.log` per step, `e2e-summary.txt` holds the exit codes).

## Setup (throwaway, mirrors `.github/workflows/ci.yml` job `be-e2e`)

- Containers, all removed at the end: `examio-rmfin-pg` (`pgvector/pgvector:pg16`, host 55432), `examio-rmfin-redis` (`redis:7`, host 56379, no password), `examio-rmfin-rmq` (`rabbitmq:3.13`, host 55672, with `deploy/rabbitmq/definitions.json` rendered by `render-definitions.cjs` and mounted as CI does).
- Non-default host ports. The CI commands hardcode `localhost:5432/6379/5672`, so those were remapped in the env and in the commands. Images are the same as CI.
- Env: a separate file built from the CI job's `env:` block, with the auth values from `scripts/ci-ephemeral-auth-env.sh`. Every run used `env -i`. Every DB host is `localhost:55432` (checked). `examio-be/.env` and `apps/*/.env` were never opened. The apps only load dotenv in `main.ts` and the CLI, which the tests do not import.
- Roles and schemas: `deploy/postgres/init/01-service-schemas.sh` run directly with the CI passwords.
- The first attempt was disturbed by a stray second runner (a trace run piped into `head`). I killed it, rebuilt the containers from zero, and every reported number below is from one clean pass on the rebuilt stack.

## Per command

| # | Command | Exit | Result |
|---|---|---|---|
| 0 | `docker run` pg, redis, rabbitmq (3.13 with definitions) | 0 | pg accepts connections, redis PONG, rabbit ping OK |
| 1 | `bash deploy/postgres/init/01-service-schemas.sh` | 0 | roles and schemas created for all 9 services |
| 2 | `yarn prisma:generate` | 0 | client generated (gitignored `src/generated`) |
| 3 | `npx prisma migrate deploy --schema <svc>` for auth, admin, content, assessment, studyroom, vocabulary, document, aichat | 0 ×8 | all applied, including `content/20261110180000_remove_generation_charge` and `document/20261110180000_remove_upload_charge` (after `refund_settled_at`) |
| 4 | `prisma migrate diff --from-url --to-schema-datamodel --exit-code` (drift), all 8 | 0 ×8 | no drift, run twice (before and after the rebuild) |
| 5 | `scripts/lint-migrations.sh` on the 2 new migration files, no flag | 1 | 7 breaking changes: content `migration.sql` lines 16, 17, 18 (`DROP COLUMN`); document lines 19, 20, 21 (`DROP COLUMN`) and 24 (`DROP TABLE`). `DROP INDEX` and `SET DEFAULT` pass, as the script intends |
| 6 | same, `MIGRATION_CONTRACT=1` | 0 | check skipped, as designed |

Step 5 is the expected result for contract migrations. CI applies the rule to PRs (`ci.yml` line 72), and the script header says CI sets `MIGRATION_CONTRACT` from the `migration:contract` label, so this change needs that label or a two-PR split.

### E2E: mirror of the `be-e2e` job (one step per command, nothing stopped early)

| Step | Suites | Tests (pass / total) | Exit |
|---|---|---|---|
| `db-isolation` (root `test/db-isolation`, CI=true) | 5/5 | 69 / 69 | 0 |
| `health-auth`, `health-admin`, `health-r2`, `health-gateway` (`app.e2e-spec`) | 1/1 each | 3 / 3 each | 0 |
| `messaging-auth-register-outbox` | 1/1 | 2 / 2 | 0 |
| `messaging-lib` (`libs/messaging`) | 1/1 | 1 / 1 | 0 |
| `identity-auth` (7 named auth specs) | 7/7 | 51 / 51 | 0 |
| `identity-admin` (`admin.e2e-spec`) | 1/1 | 17 / 17 | 0 |
| `identity-cross-app-auth-admin` (root cross-app) | 3/3 | 30 / 30 | 0 |
| `rbac-content` (whole content e2e folder, one process) | 20/21 | **179 / 180** | **1** |
| `rbac-assessment` (whole folder) | 18/18 | 139 / 139 | 0 |
| `rbac-studyroom` (whole folder) | 4/4 | 22 / 22 | 0 |
| `rbac-vocabulary` (whole folder) | 4/4 | 19 / 19 | 0 |
| `rbac-aichat` (whole folder) | 8/8 | 77 / 77 | 0 |
| `rbac-document` (whole folder) | 6/6 | 60 / 60 | 0 |
| `rbac-auth-ownership` (`test/ownership`) | 1/1 | 4 / 4 | 0 |
| `rbac-cross-app-assessment` (root cross-app) | 2/2 | 6 / 6 | 0 |
| `redis-adapter-real` (real Redis fan-out) | 1/1 | 6 / 6 | 0 |
| `gateway-e2e` (7 named gateway specs) | 7/7 | 62 / 62 | 0 |
| `gateway-cross-app-integration` (root cross-app) | 1/1 | 9 / 9 | 0 |

Totals: 765 passed, 1 failed, 766 run. No step reported "No tests found".

## The one red test

Failing: `test/generation/generation-lifecycle.e2e-spec.ts`, `generation lifecycle (e2e) › generate-from-file › a STUDENT cannot generate (ai:generate stays TEACHER-only)`.

Output: `write EPIPE`. The test expects a 403 and gets a socket error.

Reproduced: 3 of 3 runs. Full folder run; isolated rerun on leftover rows; isolated rerun on cleared rows. The server log for the full run records 403 responses on `POST /api/v1/ai/generate-from-file`, so the guard does reject the student.

Mechanism: the spec attaches a 1 MB multipart body (`generate(t, student, { bytes: MB })`) to a route the guard rejects before reading the body. The server writes 403 and closes the connection (`connection: close`) while the client is still writing, so the client gets EPIPE before it can read the 403. The sibling check in `test/ownership/ai.ownership.e2e-spec.ts` (lines 79-90) sends `{}` to the same route as a student, gets 403, and passes.

Classification: **caused by this change**. The spec is new (not on `develop`). It is a defect in the new test's request setup, not in the endpoint. I did not edit it: it is test code, outside harness wiring, and fixing it means touching an assertion-adjacent setup. Suggested fix for the owner: send a small payload for the rejected-role case (for example `bytes: 1024`, or the sibling's `{}`) and keep `expect(res.status).toBe(403)` as it is.

## Second finding: test-state leakage (passes on clean state)

First rerun, leftover rows from earlier runs present: `a QUEUED job silent for more than the timeout is FAILED GENERATION_TIMEOUT and frees the lock` failed with `expect(reap(t)).toEqual({ timedOut: 1 })`, received `timedOut: 2`.

Cause: the reaper scans the whole `content."GenerationJob"` table, and the spec never clears it. The DB still held 38 QUEUED and 7 `GENERATION_TIMEOUT` rows from earlier runs.

Check: after `TRUNCATE content."GenerationJob" CASCADE` in my throwaway DB, the spec reran at 27 / 28, and the only failure was the EPIPE above. So the watchdog test is order- and history-dependent, and passes when the table starts empty. It passed in the full run, which started on a fresh DB. Classification: **caused by this change** (new spec). Suggested fix for the owner: clear `GenerationJob` (and its outbox rows) in `beforeEach`, or scope the reap assertion to the test's own job IDs.

No product defect was found in either finding. Neither is a harness wiring problem, so I did not change anything.

## Not run, and why

- Browser or UI pass: not in this gate, and no browser check is owed for this deletion beyond the plan's own note.
- `ai-service` pytest: outside the `be-e2e` job, so outside this gate.
- Coverage: not measured in this gate.
- Unit, static and FE suites: already green per the brief, not rerun.

## Cleanup

- Removed: the three containers and their volumes (`docker rm -f -v`).
- Removed: `examio-be/deploy/rabbitmq/definitions.json`. It is gitignored, but it held the CI dummy broker passwords. The rendering step overwrote any previous copy.
- Changed on disk, all gitignored: regenerated Prisma clients under `src/generated`.
- Git: no commit, stash, checkout, reset, restore or rm. `git ls-files -o` shows only the change's own new files.

## Re-run after spec fix

Test-file edits by the coordinator (`generation-lifecycle.e2e-spec.ts` only): the STUDENT case sends `bytes: 1` (line 178), and the watchdog describe has a `beforeEach` that deletes open QUEUED/PROCESSING `GenerationJob` rows (line 306). No production code or harness changed.

Stack rebuilt the same way: `examio-rmfin-` containers on localhost:55432 / 56379 / 55672, the same env file with `env -i`, all 8 migration sets applied (exit 0).

| Run | Command | Exit | Suites | Tests |
|---|---|---|---|---|
| 1 | `rbac-content` (CI be-e2e content step, whole folder) | 0 | 21 / 21 passed | 180 / 180 passed |
| 2 | same, on the same DB with run 1's rows still present, no truncation | 0 | 21 / 21 passed | 180 / 180 passed |

- The lifecycle file passed in both runs (`PASS test/generation/generation-lifecycle.e2e-spec.ts`), so the EPIPE case and the watchdog case are both green.
- Run 2 started with 38 leftover rows from run 1 (`FAILED` 22, `COMPLETED` 8, `CANCELLED` 4, `QUEUED` 4). The watchdog's `beforeEach` cleared the open rows, so the reaper count held. This is the cross-run check that the earlier manual truncation stood in for.
- Logs: `/private/tmp/claude-501/-Users-tgiap-dev-devs-examio/98946b76-ed84-4c4e-b639-fed5f91646c2/scratchpad/rmfin-logs/rbac-content-rerun1.log` and `rbac-content-rerun2.log`.
- Cleanup: containers and volumes removed, `examio-be/deploy/rabbitmq/definitions.json` removed again. No git state changed, nothing committed.

The first red result (`rbac-content` exit 1, 179 / 180) is superseded by this re-run. The content step is now green.

**Status:** DONE_WITH_CONCERNS

**Summary:** The content step that was red is now green in both runs. `rbac-content` exits 0 with 180 of 180 tests passing, twice on the same database. Across the full `be-e2e` mirror, all 22 steps are green once the content step is counted as fixed. The one open item is the migration label, not a test.

**Concerns/Blockers:**
- Migrations: the two new migrations are contract changes (7 flagged DROPs). The PR needs the `migration:contract` label, or it must be split into expand and contract PRs.
- Not covered by this gate: browser or UI pass (owed per plan), `ai-service` pytest, coverage.
