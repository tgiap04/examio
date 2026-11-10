# Production cutover runbook (one-time)

Production is deployed **once**, at the final merge of `refactor/microservice-rbac`: the old build-on-VPS stack
(the `main` branch's `kmaedu-be/deploy`, one shared `.env`, `kmaedu-migration` + `db push`) is replaced by the
per-service GHCR images and per-service env files, on a **reset database**. After this runbook, every deploy is
the steady-state flow in `README.md` ("Per-service deploys": `deploy-service.sh`, waves, migrate gate).

Rules while you follow it:

- Tick each box only after its check passed. Any failure in steps 4 to 10 means **Rollback** (end of file).
- Run everything on the VPS inside `$DEPLOY` (the compose project directory), unless a step says otherwise.
- Never print `.env` / `env/*.env` into a terminal that is logged or shared.
- The pre-cutover dump is never deleted by this plan.

```bash
# On the VPS, once per shell. DEPLOY_DIR is the repository checkout (the GitHub secret of the same name).
export DEPLOY="$DEPLOY_DIR/kmaedu-be/deploy"
cd "$DEPLOY"
# Every compose command below uses both env files; .tags.env pins the image tags (written in step 4).
alias dc='docker compose --env-file .env --env-file .tags.env'   # or define a function in scripts
```

`MERGE_SHA` below is the full sha of the merge commit on `main`; `STAMP` is `$(date +%Y%m%d-%H%M)`.

## 0. Preconditions

- [ ] The merge commit is green in CI, and its `deploy.yml` run shows `deploy skipped (CUTOVER_DONE is not true)`
      with the build matrix green (the images for the sha were built and pushed).
- [ ] A GHCR image exists for every key of `deploy/services.json` at `MERGE_SHA` (from a machine logged in to GHCR;
      `jq` and `docker` needed):
      ```bash
      for k in $(jq -r '(.node + .python) | keys[]' deploy/services.json); do
        img=$(jq -r --arg k "$k" '(.node + .python)[$k].image' deploy/services.json)
        docker manifest inspect "ghcr.io/cychipo/$img:$MERGE_SHA" >/dev/null && echo "ok      $k" || echo "MISSING $k"
      done
      ```
- [ ] Repository variable `CUTOVER_DONE` is unset or `false` (`gh variable list`); it is set to `true` only in step 10.
- [ ] VPS: `docker login ghcr.io` with a read-only PAT (`read:packages`), the same one the deploy job uses
      (`GHCR_READ_TOKEN`, `GHCR_READ_USER`): `printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin`.
- [ ] VPS env files filled (create from the templates, then fill every empty `KEY=` line; see `env/README.md`):
      ```bash
      cp -n .env.example .env                                # compose-level: DB/broker/Redis passwords, JWT keypair, service secrets
      for f in env/*.env.example; do cp -n "$f" "${f%.example}"; done
      ```
      Required values: `JWT_PRIVATE_KEY` + `JWT_KID` (`scripts/gen-jwt-keypair.sh`), `SERVICE_CLIENTS` and every
      `<SVC>_SERVICE_CLIENT_SECRET` (`scripts/gen-service-secret.sh <name>`; the hashes go into `SERVICE_CLIENTS`),
      all `*_DB_PASSWORD` and `RABBITMQ_*_PASS` (URL-safe: hex or base64url), `REDIS_PASSWORD`, `FRONTEND_URL`,
      `TURNSTILE_SECRET_KEY` (content, assessment), `GOOGLE_*` and `EMAIL_*` (auth),
      `R2_*` (r2, new bucket, step 3), `GEMINI_*` (ai). Copy values from the old `.env` where they carry over, but
      **do not reuse the old `JWT_SECRET`** (it is gone) and remember `ADMIN_EMAILS` / `ADMIN_DEFAULT_PASSWORD` in
      `env/auth.env` (step 9).
- [ ] Topology (decided 2026-10-28): Cloudflare -> host reverse proxy (nginx/Caddy) on the VPS -> `127.0.0.1:6368`
      (`kmaedu-frontend`, `FE_BIND` defaults to loopback). The host proxy accepts only Cloudflare addresses (allowlist the
      ranges or firewall 80/443 to them) and passes `CF-Connecting-IP` through unchanged; FE nginx trusts that header from
      Cloudflare ranges and the Docker private ranges (`kmaedu-fe/nginx/cloudflare-real-ip.conf`). Gateway logs must later
      show distinct client IPs (step 10).
- [ ] Downtime window announced (users, mobile team). Mobile app: unreleased against this backend, nothing to coordinate.
- [ ] Decision D15 taken (see "Notes carried into the cutover"): login/register stay at 5 requests per minute per IP.
- [ ] The runbook has been rehearsed end to end on an empty local compose host (Appendix: Rehearsal), rollback included.
- [ ] Three smoke accounts planned (TEACHER, STUDENT, TARGET) plus the first SYSTEM_ADMIN; they are created in steps 9 and 10.

## 1. Backup and mark the running stack

The old stack is still running. Its compose project is the `deploy` directory of the checkout currently on the VPS.

- [ ] Backup (keep it, copy it off-host):
      ```bash
      mkdir -p /srv/backups
      docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > /srv/backups/kmaedu-pre-cutover-$STAMP.dump
      ```
      (The single quotes make the postgres container expand its own `POSTGRES_USER`/`POSTGRES_DB`. Do not `source`
      `.env` into your shell: a multi-line PEM value such as `JWT_PRIVATE_KEY` breaks `set -a; . ./.env`.)
- [ ] The dump is readable: `pg_restore --list /srv/backups/kmaedu-pre-cutover-$STAMP.dump | head`, and its size is plausible.
- [ ] Copied off-host: `scp /srv/backups/kmaedu-pre-cutover-$STAMP.dump <backup-host>:` and checksum compared (`sha256sum`).
- [ ] Old shared env kept: `cp .env /srv/backups/deploy.env.pre-cutover-$STAMP` (mode 600).
- [ ] Git tag of the running commit: `git -C "$DEPLOY_DIR" tag pre-cutover-$STAMP "$(git -C "$DEPLOY_DIR" rev-parse HEAD)" && git -C "$DEPLOY_DIR" tag -f pre-cutover "$(git -C "$DEPLOY_DIR" rev-parse HEAD)"`.
- [ ] Every running image tagged `:pre-cutover`:
      ```bash
      for img in $(docker compose ps --format '{{.Image}}' | sort -u); do docker tag "$img" "${img%%:*}:pre-cutover"; done
      docker image ls --filter 'reference=*:pre-cutover'
      ```
- [ ] Old FE container image tagged the same way: `docker tag "$(docker inspect --format '{{.Config.Image}}' kmaedu-frontend)" kmaedu-frontend-image:pre-cutover` (record the original name in your notes).

## 2. Drain and stop the old stack

- [ ] Broker idle: `docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready` shows 0 ready messages
      (repeat until it does; stuck messages mean a consumer is down, fix that first).
- [ ] Stop: `docker compose down` (old compose from the checkout still at the old commit; **no `-v`**).

## 3. Drop the data volumes, point R2 at a new bucket

- [ ] Project name: `PROJECT="$(docker compose config --format json | jq -r .name)"` (the volume prefix; `deploy` when
      the compose directory is `deploy/` and `COMPOSE_PROJECT_NAME` is unset).
- [ ] List: `docker volume ls --filter "name=^${PROJECT}_" | grep -E '_(postgres|redis|rabbitmq)_data$'`.
- [ ] Remove exactly those three: `docker volume rm "${PROJECT}_postgres_data" "${PROJECT}_redis_data" "${PROJECT}_rabbitmq_data"`
      (a fresh broker volume is also what drops the stale `auth.user.authz_changed` binding on `exam.events`).
- [ ] R2: create a new empty bucket; `R2_BUCKET_NAME` (and, if the public URL changes, `R2_PUBLIC_URL` in the services
      that read it) in `env/r2.env` and `.env` point at it. The old bucket stays untouched for rollback; it is emptied
      only after the 24 h rollback window (rows that own R2 objects are deleted together with their objects).

## 4. Checkout the merge sha, pin the tags, pull

- [ ] ```bash
      git -C "$DEPLOY_DIR" fetch origin main "$MERGE_SHA" --prune && git -C "$DEPLOY_DIR" checkout --detach "$MERGE_SHA"
      cd "$DEPLOY"
      # Pin every image to the merge sha (compose defaults to :main otherwise).
      jq -r --arg sha "$MERGE_SHA" '.[] | keys[] | (ascii_upcase | gsub("-"; "_")) + "_TAG=" + $sha' services.json > .tags.env
      ```
- [ ] `.env` and every `env/<name>.env` exist (step 0); `docker compose --env-file .env --env-file .tags.env config --quiet` exits 0.
- [ ] RabbitMQ definitions render (also happens as the `rabbitmq-defs` one-shot before the broker starts; fails fast on a
      missing `RABBITMQ_*_PASS`): `dc run --rm rabbitmq-defs` then `test -s rabbitmq/definitions.json`.
- [ ] `dc pull` (all images at the merge sha; fails here instead of in the middle of the cutover).

## 5. Infra

- [ ] `dc up -d --wait postgres redis rabbitmq`. The empty data directory runs `postgres/init/01-service-schemas.sh`
      (schemas, `<svc>_svc` roles, `search_path`, pgvector).
- [ ] Roles exist: `dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\du"'` lists the ten `*_svc` roles.
- [ ] Broker users exist and `exam.events` does not: `dc exec rabbitmq rabbitmqctl list_users` lists the broker users;
      `dc exec rabbitmq rabbitmqctl list_queues name` has no `exam.*` queue.

## 6. Migrate every database service, in wave order

`scripts/changed-services.sh` with an empty base prints every service in wave order (run it on any machine with the
repo, or read `deploy/services.json`):

```bash
( cd "$DEPLOY_DIR/kmaedu-be" && scripts/changed-services.sh "" "$MERGE_SHA" )   # {"wave1":[...],"wave2":[...]}
```

- [ ] For every key with `"db": true` (admin, ai, ai-chat, assessment, auth, content, document, study-room, vocabulary):
      `dc run --rm --no-deps <svc>-migrate` exits 0. Prisma services run `migrate deploy`; `ai` runs Alembic.
      Any non-zero exit means stop and go to Rollback. A `P3009` in the output is not expected on a fresh database.
      ```bash
      for s in auth admin content assessment study-room vocabulary document ai-chat ai; do
        echo ">> $s-migrate"; dc run --rm --no-deps "$s-migrate" || { echo "MIGRATE FAILED: $s"; break; }
      done
      ```

## 7. Seed reference data (never the dev seed)

Production gets only reference data: admin page flags, word-family categories, ai-chat subjects. The service image runs
its own seed with `SEED_PROFILE=prod` (the `seed` compose service with `--profile seed` is the **dev** seed: never run it here).

- [ ] ```bash
      dc run --rm --no-deps -e ROLE=seed -e SEED_PROFILE=prod admin        # PageFlagConfig
      dc run --rm --no-deps -e ROLE=seed -e SEED_PROFILE=prod vocabulary   # word-family categories
      dc run --rm --no-deps -e ROLE=seed -e SEED_PROFILE=prod ai-chat      # subjects
      ```
      Each prints `==> Seeding ... (profile=prod, ...)` and `==> Seeds complete.`, exit 0. Idempotent: re-running is safe.
- [ ] Spot check: `dc exec postgres psql -U admin_svc -d "$POSTGRES_DB" -c 'select count(*) from admin."PageFeatureFlag"'` is greater than 0.

## 8. Start the services in wave order

- [ ] The R2 and auth env are final (`env/auth.env` has `ADMIN_EMAILS` and `ADMIN_DEFAULT_PASSWORD`, see step 9).
- [ ] Start with the deploy script, one service at a time, stop at the first failure (it never runs `down`, never `migrate resolve`):
      ```bash
      for s in <wave1 keys> <wave2 keys>; do ./deploy-service.sh "$s" "$MERGE_SHA" || break; done
      ```
      Keep the order `changed-services.sh` prints: inside each wave `auth` comes first (JWKS and `/internal/token` come
      from it) and `gateway` last (`gateway-a`, then `gateway-b`; nginx is never reloaded). With an empty base every
      key is in wave 2, so `auth` starts first. The script's `up --wait` timeout is 90 s per service.
- [ ] `dc ps` shows every container `healthy` (one-shot `*-migrate` and `rabbitmq-defs` exited 0).
- [ ] Frontend (build on the VPS, same as the deploy job): `cd "$DEPLOY_DIR/kmaedu-fe"` (compose reads `kmaedu-fe/.env` itself), then
      `docker compose build && docker compose up -d`; the FE joins the external `kmaedu-edge` network the backend created.
      `docker exec kmaedu-frontend wget -qO- http://kmaedu-gateway-a:3000/health/ready` succeeds.

## 9. First SYSTEM_ADMIN

The built auth image contains only `dist/apps/auth-service/main.js`; the `bootstrap:admin` CLI is **not** in it. Use the
boot sync of `ADMIN_EMAILS`, which creates a verified admin account (password = `ADMIN_DEFAULT_PASSWORD`) or grants
SYSTEM_ADMIN to an existing account:

- [ ] `env/auth.env` has `ADMIN_EMAILS=<admin email>` and a strong `ADMIN_DEFAULT_PASSWORD` (set before step 8, or set now and
      `dc up -d --no-deps --force-recreate auth`).
- [ ] `dc logs auth | grep "sync complete"` shows `created=1` (or `granted=1`) and `errors=0`.
- [ ] The admin logs in on the web, **changes the password**, and `RoleChangeLog` has the row (`/admin/roles` changes tab: `source=cli`/bootstrap).
- [ ] Smoke accounts: register `smoke-teacher`, `smoke-student`, `smoke-target` on the web (verify the e-mail), then in
      `/admin/roles` set `smoke-teacher` to TEACHER (leave the others STUDENT). Record the credentials for step 10.
- [ ] Later grants (not needed for the cutover): from a workstation with the repo and a DB tunnel, `yarn bootstrap:admin:grant <email> [--teacher]`;
      there is no CLI in the production image.

## 10. Smoke

Production enforces Cloudflare Turnstile on login (`NODE_ENV=production`), so the script needs a token the verifier
accepts. Decided 2026-10-28: **A**. (B stays as the fallback.)

- A: temporarily set `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (Cloudflare's always-pass test secret) in
  `env/auth.env` and recreate auth (`dc up -d --no-deps --force-recreate auth`), run the smoke with
  `TURNSTILE_TOKEN=XXXX.DUMMY.TOKEN.XXXX`, then **restore the real secret and recreate auth again** before announcing.
  Do this inside the downtime window, never while users are on the site.
- B: skip the script's login with a manual browser pass of the same checks (login, quiz set, shared set, role change, room).

- [ ] Run from a machine with the repo (4 logins per run; the gateway allows 5 per minute per IP, so wait a minute before a re-run):
      ```bash
      cd kmaedu-be && BASE_URL=https://<prod-origin> \
        TEACHER_EMAIL=... TEACHER_PASSWORD=... STUDENT_EMAIL=... STUDENT_PASSWORD=... \
        ADMIN_EMAIL=... ADMIN_PASSWORD=... TARGET_EMAIL=... TARGET_PASSWORD=... \
        TURNSTILE_TOKEN=XXXX.DUMMY.TOKEN.XXXX yarn smoke:cutover
      ```
      Exit 0 and every line `PASS` (login cookies, `/auth/me` roles, quiz + flashcard creation, whitelisted study read,
      student 403, page flags, study room over `/ws/study`, role flip to `TOKEN_STALE` then refresh, cleanup).
- [ ] Not covered by the script, check by hand in a browser through the real Cloudflare + nginx path:
      Google login; AI chat token streaming; a 20 MB PDF upload and an AI generation; admin log SSE; a
      page-flag toggle reaching an open tab; gateway logs show real client IPs, not Cloudflare ranges
      (`docker logs kmaedu-gateway-a --tail 50`).
- [ ] D12: keep a browser tab inside a study room for 16 minutes (access token lifetime is 15): the socket receives
      `auth:reauth`, the FE refreshes, reconnects, and the room is still usable.
- [ ] Set `CUTOVER_DONE=true`: `gh variable set CUTOVER_DONE --body true --repo tgiap04/kmaedu`. Announce. Watch logs for one hour
      (`dc logs -f --since 5m`), `dc ps`, `dc stats --no-stream` against the `mem_limit` table in `README.md`.
- [ ] Post-merge list below done or ticketed.

## Rollback

Any failure in steps 4 to 10, or a problem within the 24 h rollback window. Data created after the cutover is lost
(accepted and announced). Keep `CUTOVER_DONE=false` (or set it back).

- [ ] `dc down --remove-orphans` (new stack; the FE container too: `docker compose -f "$DEPLOY_DIR/kmaedu-fe/docker-compose.yml" down`).
- [ ] Remove the new volumes: `docker volume rm "${PROJECT}_postgres_data" "${PROJECT}_redis_data" "${PROJECT}_rabbitmq_data"` (`PROJECT` from step 3).
- [ ] Checkout the old commit: `git -C "$DEPLOY_DIR" checkout --detach pre-cutover`; restore the old env:
      `cp /srv/backups/deploy.env.pre-cutover-$STAMP "$DEPLOY/.env"` (mode 600). The `env/*.env` files are ignored by the old stack.
- [ ] Put the old images back as the compose images:
      `docker image ls --filter 'reference=*:pre-cutover' --format '{{.Repository}}' | while read -r r; do docker tag "$r:pre-cutover" "$r:latest"; done`.
- [ ] Old stack, postgres first on an empty volume, then restore the step-1 dump:
      ```bash
      cd "$DEPLOY" && docker compose up -d postgres            # old compose, no env-file flags
      docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' < /srv/backups/kmaedu-pre-cutover-$STAMP.dump
      ```
- [ ] `R2_BUCKET_NAME` back to the old bucket (old `.env` already has it).
- [ ] `docker compose up -d --no-build` (the old build-on-VPS compose, with the `:pre-cutover` images; no `--wait`: the old
      one-shot migrate/seed containers exit 0 and make `--wait` report failure, so check `docker compose ps` instead). Start the old FE the same way from `kmaedu-fe` at `pre-cutover`.
- [ ] Smoke: log in on the web with an existing account; `docker compose ps` all healthy.

## Post-merge list (only after the merge to `main`)

- [ ] Remove the `UpdateBalance` `breaking.ignore` override from `proto/buf.yaml` (the `buf breaking` baseline is `main`, which now has the RPC removed).
- [ ] Set `CUTOVER_DONE=true` (step 10) and confirm the next push to `main` deploys only the changed services.
- [ ] Empty the old R2 bucket after the 24 h rollback window; delete nothing from `/srv/backups`.
- [ ] Docs sync (phase 19): link this runbook and the README sections.

## Notes carried into the cutover

- **D12** (15-minute socket expiry): manual check in step 10.
- **D15** (auth throttle): login, register, verify, reset and change-password are limited to 5 per minute per client IP at
  the gateway (`routes.yaml` `rateLimits`) and again in auth (`@StrictThrottle`). Behind Cloudflare and nginx the IP is the real
  client IP, so this is per user, not per proxy. **User decision needed before cutover:** keep 5/min (current, recommended) or
  raise it for campus or NAT traffic. The smoke script makes 4 logins from one IP per run.
- **U1** (service output vanished once): `Dockerfile.node` already fails the build with
  `test -f dist/apps/$SERVICE/main.js` after `nest build`.
- **Deferred, not part of this runbook** (phase 16 part D or the roadmap): D1 transport-attempt cap test, D3 per-env
  `REDIS_COMMAND_TIMEOUT_MS`, D14 CI e2e on a dedicated DB, L4 page-flag push serialization per admin instance, exam e2e
  parallel-worker segfault (CI keeps `maxWorkers 1`), N1 Redis-down degraded boot live run, W6 empty page-flag default on the FE,
  F10 full ui9 browser matrix (run it in the rehearsal), amd64 image verification (run the rehearsal on an amd64 host or
  check the CI build is `linux/amd64`), legacy owner-less R2 keys (accepted orphans), ai-service pool cap and OCR private-host switch.

## Appendix: Rehearsal (local, throwaway)

Goal: run steps 0 to 10 and the rollback on a laptop, against an empty Docker host. Use a separate checkout (or a worktree)
and a separate compose project name so nothing touches a real stack: `export COMPOSE_PROJECT_NAME=rehearsal`
(volumes become `rehearsal_*_data`; the network names are pinned `kmaedu-*`, so stop any other kmaedu stack first).

1. **Old stack from `main`, one image at a time** (it builds locally; do not run `--parallel` on a small laptop):
   `git worktree add /tmp/kmaedu-old main && cd /tmp/kmaedu-old/kmaedu-be/deploy && bash setup-env.sh` (needs a filled `kmaedu-be/.env`
   with throwaway values), then `for s in $(docker compose config --services); do docker compose build "$s"; done && docker compose up -d`.
   Register a user and create a row on the old web, then take the step-1 dump into a temp dir. This is your "production".
2. **New stack, throwaway env**: in the branch checkout, `cd kmaedu-be/deploy`, `bash ci-dummy.env.sh > .env && bash ci-dummy.env.sh --service-envs`
   (dummy values; replace `RABBITMQ_*` and DB passwords only if you want realistic ones, keep them URL-safe). Real third parties
   (Google, R2, Gemini) are not available: the checks that need them are skipped in the rehearsal and done in step 10 live.
   Set `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` in `env/content.env`, `env/assessment.env` and `env/auth.env`, and
   `ADMIN_EMAILS=admin@rehearsal.test`, `ADMIN_DEFAULT_PASSWORD=<12+ chars>` in `env/auth.env`.
3. **Images**: the compose files have `build:`, so build locally instead of pulling: `docker compose build <svc>` per service (one at a time),
   and use `docker compose` without `pull`; or build once with `GATEWAY_TAG=local` etc. If you want to rehearse the GHCR path, push the images
   to a scratch registry and set `<SVC>_TAG` in `.tags.env`.
4. Walk steps 1 to 9 literally (paths: `$DEPLOY` is your checkout's `kmaedu-be/deploy`; skip the GHCR login and the off-host copy).
   Step 2 of the old stack: `cd /tmp/kmaedu-old/kmaedu-be/deploy && docker compose down` (no `-v` until step 3).
5. **Step 10**: `BASE_URL=http://localhost:6368` (the FE container, host port `FE_PORT`) with `TURNSTILE_TOKEN=XXXX.DUMMY.TOKEN.XXXX`
   and accounts registered through the API or the dev seed. Then run the browser matrix (F10) by hand.
6. **Rollback rehearsal**: follow the Rollback section against the old worktree: `down`, remove the `rehearsal_*` volumes, start the old
   postgres on an empty volume, `pg_restore` the dump, `docker compose up -d --no-build`, log in with the old user. That user working is the pass criterion.
7. **Gateway rollout under load** (phase 16 acceptance): while the stack is up, run a k6 smoke at 50 rps against `/api/v1/status`
   and `/api/v1/config/pages` for 2 minutes, and meanwhile `./deploy-service.sh gateway <sha>`; there must be 0 non-2xx caused by the deploy.
   Keep an `io('/ws/study')` client open: it reconnects within 10 s.
8. Clean up: `docker compose down -v` in both worktrees, `git worktree remove /tmp/kmaedu-old`, `unset COMPOSE_PROJECT_NAME`.
