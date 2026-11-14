# Smoke report: phase 04 (docker-development, real Docker)

Date 2026-11-11, branch `feat/docker-development`, macOS, Docker Desktop 29.7.2 (7.75 GiB, 10 CPU), Compose v5.4.0.
Nothing committed. Only `docker-development/**` and this plan folder were changed.

## Script

`docker-development/test/smoke-up.sh` (bash 3.2, `set -euo pipefail`, `trap cleanup EXIT`): project `kmaedu-dev-smoke`
(`KMAEDU_SMOKE_PROJECT`), scratch generated dir, `services` (= `gateway auth fe`) and `.env` (only `ADMIN_EMAILS`),
ports 15173/18000/15432/16379/15672. `KMAEDU_SMOKE_KEEP=1` keeps the stack, `KMAEDU_SMOKE_KEEP_MODULES=1` keeps the
node_modules volumes. The admin password is read from the scratch secrets into a 600 file, sent with `--data-binary @file`
and never printed.

## Results (final tree, two consecutive runs)

| Run | Exit | PASS / FAIL | `up` returned | stack ready | total |
|---|---|---|---|---|---|
| D (`KMAEDU_SMOKE_KEEP_MODULES=1`, empty node_modules volumes, warm yarn cache) | 0 | 38 / 0 | 51 s | 58 s | 91 s |
| E (node_modules reused, then everything removed) | 0 | 38 / 0 | 23 s | 30 s | 63 s |

Earlier green runs on intermediate trees: A 43 s / B 23 s / C 46 s (`up`).

| # | Check | Evidence (run E) |
|---|---|---|
| 1 | containers | postgres redis rabbitmq traefik auth gateway-a fe `running`; deps, auth-migrate `exited:0`; content r2 gateway-b ai ai-worker admin absent |
| 2 | `GET :15173/` | `content-type: text/html`, body has `/@vite/client` |
| 3 | `GET :15173/api/v1/auth/me` | 401, JSON with `code` (gateway, not Traefik) |
| 4 | `./project seed` + `POST :15173/api/v1/auth/login` | seed exit 0; **201** (Nest default for POST; the phase said 200, the script accepts 200/201); `Set-Cookie: accessToken=…; HttpOnly; SameSite=Lax` |
| 5 | `GET /api/v1/auth/me` with the cookie | 200, `user.isSystemAdmin == true` (roles `STUDENT, SYSTEM_ADMIN`) |
| 6 | HMR websocket (`Sec-WebSocket-Protocol: vite-hmr`) via Traefik | `HTTP/1.1 101 Switching Protocols` |
| 7 | `:18000/_traefik/dashboard/`, `:18000/_rabbitmq/` | 200, 200; on `:15173` both are the Vite SPA (body has `/@vite/client`), no admin UI |
| 8 | `GET :18000/api/v1/auth/me` | 401 |
| 9 | `nc -z 127.0.0.1 15432/16379/15672` | open ×3 |
| 10 | auth container | `apps/auth-service/.env` is 0 bytes; `DATABASE_URL` hostname `postgres` (value never printed) |
| 11 | tree | `git status --porcelain kmaedu-be/deploy` empty; `kmaedu-be kmaedu-fe` porcelain unchanged; host `.env` file list unchanged |
| 12 | after `./project down` | 0 containers; 0 project volumes |

Seed output contains the admin password 0 times (checked with `grep -cF`).

## Manual checks

- **BE hot reload**: `touch kmaedu-be/apps/auth-service/src/main.ts` (mtime only, content unchanged) → "Nest application successfully started" again after 2 s (no polling needed on Docker Desktop).
- **FE HMR**: `touch kmaedu-fe/src/components/GoogleAnalytics.tsx` → `[vite] (client) hmr update /src/components/GoogleAnalytics.tsx` after 1 s.
- **ai restart**: `touch kmaedu-be/apps/ai-service/src/main.py` → `watchfiles` "1 change detected", gRPC server stopped and restarted after 1 s.
- **ai image**: `docker build -t kmaedu-dev-ai:local -f apps/ai-service/Dockerfile kmaedu-be` exit 0, 1831 s (slow network, ~80-175 KB/s), 2.11 GB.
- **Full 12 keys** (`services.example`, project `kmaedu-dev-full`): `up` exit 0 in 26 s (images and modules warm); all 10 Nest apps, ai, ai-worker healthy; 9 `*-migrate` and `ai-migrate` exited 0; `/api/v1/subjects` 200, `/api/v1/config/pages` 200, `/api/v1/auth/me` 401 via Traefik.
- **db:reset**: `./project db:reset -y` on the full stack, exit 0 in 31 s; new `postgres_data` volume; every migrate job restarted and exited 0; 43 tables back in `auth content assessment ai`; all apps healthy again.

## Memory (`docker stats --no-stream`)

| Set | Total | Per container |
|---|---|---|
| Smoke (`gateway auth fe` + infra) | ~1.8 GiB | auth 677 MiB, gateway-a 535 MiB, fe 351 MiB (1.8 GiB right after a first Vite dep scan), rabbitmq 134, postgres 42, traefik 35, redis 11 |
| 11 keys (no ai) | 5.5-6.1 GiB | each Nest app 520-680 MiB (`nest start --watch`: compiler + app) |
| Full 12 keys | peak 7040 MiB (sum, sampled 4 min from `up`); steady ~6.3 GiB | Nest apps 520-640 MiB each, ai 125 MiB, ai-worker 62 MiB, fe 167 MiB |

The full stack fits an 8 GB Docker Desktop with almost no headroom; `services.example`'s "10-12 GB" note is right.

## Bugs found and fixed (all inside `docker-development/`)

1. **auth crashed without Google keys** (`TypeError: OAuth2Strategy requires a clientID option`), so "missing keys do not block `up`" was false. `lib/render-env-files.sh` now renders `GOOGLE_CLIENT_ID=not-configured.apps.googleusercontent.com` when the user gives none; `VITE_GOOGLE_CLIENT_ID` stays empty. Test: `render-env-files.bats` "no GOOGLE_CLIENT_ID…".
2. **deps and fe read the host `.env`** (prisma generate printed "Environment variables loaded from .env" from `kmaedu-be/.env`; Vite would load `kmaedu-fe/.env`).
3. **Masking created files in the host tree.** The static empty.env bind mounts created 0-byte `apps/{content,assessment,document,study-room,vocabulary,ai-chat}-service/.env` on the host (root-owned on Linux). The six files this run created were removed. Fix for 2 and 3: new `lib/render-host-env-masks.sh` writes `.generated/compose/<x>.env-masks.yaml` covering only `.env` files that exist (root, per-app, `kmaedu-fe/.env`); `render-compose-include.sh` adds it as a third include path; the static overlays no longer mount empty.env. Tests: `compose-overlay.bats` "every EXISTING host .env…" and "no host .env at all…"; smoke check 11 compares the host `.env` list. A `.env` created after `up` is masked from the next `up`.
4. **Every node_modules loss re-downloaded every package** (yarn cache was inside the container; the first try ran over 5 minutes in "Fetch step" before I stopped it). New external volume `kmaedu-dev-yarn-cache` mounted at `/root/.yarn/berry/cache` in deps and fe. `./project up` creates it and, when it is new, copies the host's `~/.yarn/berry/cache` into it once (`KMAEDU_HOST_YARN_CACHE`, read-only mount, best effort). It survives `down -v` and `db:reset` and is shared by every dev project. Tests: `compose-overlay.bats` (mount + external) and `up-flow.bats` (created and seeded before the apps; no create/copy when it exists; no copy without a host cache).

## Final gate

| Check | Result |
|---|---|
| `./test/run-tests.sh` (shellcheck + bats, bash 3.2 container) | exit 0, 78/78 ok (72 before + 6 new), shellcheck silent |
| `node --test deploy/compose-topology.spec.cjs` | exit 0, 46/46 |
| `git diff --exit-code kmaedu-be/deploy` | exit 0 |
| `git status --porcelain` | only `README.md` (pre-existing), `docker-development/`, the plan folder |

Left on the machine on purpose: images `kmaedu-dev-node:local`, `kmaedu-dev-ai:local`, `kmaedu-docker-development-test:local`, and volume `kmaedu-dev-yarn-cache` (2.56 GB). No container, network or other volume of `kmaedu-dev-smoke` / `kmaedu-dev-full` remains.

## For phase 05 (docs)

- First run times: ai image ~30 min on a slow link; deps install ~45 s with a warm yarn cache, much longer without one.
- Login answers 201. Missing Google keys give a placeholder client id.
- `kmaedu-dev-yarn-cache` and `KMAEDU_HOST_YARN_CACHE`; delete with `docker volume rm kmaedu-dev-yarn-cache`.
- A new host `.env` is masked from the next `./project up`.
- `requirements.txt` change: `docker image rm kmaedu-dev-ai:local`.

## Unresolved

- Linux run not done (no machine).
- The host yarn cache holds darwin builds of native packages; the linux-musl ones are still downloaded the first time.
