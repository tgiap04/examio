# Implementer report: phases 01-03 (docker-development)

Date 2026-11-11, branch `feat/docker-development`. Nothing committed. No file outside `docker-development/` and this plan folder touched.

## Files created (`docker-development/`, 44 files, 2789 lines, largest 143)

- `project` (89): dispatcher `up down ps logs sh seed db:reset help` + hidden `render`; `set -euo pipefail`, `umask 077`
- `lib/`: `common.sh` (104), `services-file.sh` (39), `dotenv-reader.sh` (50), `local-secrets.sh` (106), `render-env-files.sh` (143), `render-compose-include.sh` (46), `prerequisites.sh` (33), `commands-lifecycle.sh` (88), `commands-inspect.sh` (46), `commands-database.sh` (53)
- `compose/`: `{infra,auth,admin,content,assessment,study-room,vocabulary,document,ai-chat,gateway,r2,ai,seed}.dev.yaml`, `dev-extras.yaml` (deps, traefik, fe)
- `images/node-dev.Dockerfile`, `infra/traefik/routes.yaml`, `infra/rabbitmq/90-dev-management.conf`
- `services.example` (all 12 keys enabled, comment names the small set `gateway auth content assessment fe` and the 10-12 GB RAM need), `.env.example`, `.gitignore` (`.generated/`, `services`, `.env`)
- `test/`: `Dockerfile` (bash:3.2 + bats + shellcheck + jq + docker-cli-compose + openssl), `run-tests.sh`, `helpers/test-helper.bash` (docker shim), `fixtures/expected/compose.yaml`, 9 bats files

No root `.gitignore` change needed (the folder's own `.gitignore` covers it).

## Commands and exit codes

| Check | Result |
|---|---|
| RED phase 01: `./test/run-tests.sh` with empty libs | 35/35 not ok (exit 1) |
| RED phase 02: `./test/run-tests.sh test/compose-overlay.bats` before overlays | 12/12 not ok, "render failed" (exit 1) |
| RED phase 03: three phase-03 bats before the command libs | 21/25 not ok (exit 1); the 4 passing ones are covered by the skeleton dispatcher and common.sh |
| GREEN: `./test/run-tests.sh` (shellcheck + 72 bats, bash 3.2 container) | exit 0, 72/72 ok, shellcheck silent |
| `git diff --exit-code kmaedu-be/deploy` | exit 0 |
| `git status --porcelain kmaedu-be kmaedu-fe` | empty |
| `cd kmaedu-be && node --test deploy/compose-topology.spec.cjs` | exit 0, 46/46 pass |
| `./project render` twice (host, local runner) | secrets.env sha256 identical; every generated file identical |
| Key count | deploy/.env.example 40 keys, compose.env 56 (40 + 16 overlay vars) |
| Poison detector sanity (host) | including deploy/docker-compose.yml directly: 136 `POISON` hits; dev stack: 0 |
| Real infra (project `kmaedu-dev-impl`, ports 15173/18000/15432/16379/15673): secrets via the real `kmaedu-dev-node:local` runner, `up -d --wait postgres redis rabbitmq traefik` | exit 0, all healthy; `/_rabbitmq/api/overview` 200 via Traefik, 9 broker users, 9 `*_svc` Postgres roles, `/_traefik/dashboard/` 200, ports on 127.0.0.1 only, networks `kmaedu-dev-impl-*`, nothing written under `deploy/rabbitmq`. Then `./project down` exit 0 and the 3 volumes removed |

## Deviations from the plan

1. **SERVICE_CLIENTS is not stored in secrets.env.** secrets.env holds each `<X>_SERVICE_CLIENT_SECRET` plus `<X>_SERVICE_CLIENT_HASH`; SERVICE_CLIENTS is built from the hashes at render time. Storing only the JSON would force a rewrite whenever one client was missing. A half-present pair (JWT kid/key, one client's secret/hash) is regenerated as a pair. That only happens if someone edits the file by hand.
2. **RabbitMQ definitions are mounted as a directory.** `.generated/rabbitmq` is mounted at `/etc/rabbitmq/dev-defs`, and `90-dev-management.conf` overrides `definitions.local.path`. This avoids a single-file bind mount of a file that does not exist yet; Docker would create a directory there. The dir is mode 755 (hashes only) so the rabbitmq user can read it on Linux.
3. **`YARN_INSTALL_STATE_PATH` is set into the node_modules volumes.** It is set for deps, the apps, migrate, seed and fe. `kmaedu-be/.yarn/install-state.gz` is not gitignored, and a container install would otherwise write it into the host tree.
4. **Extra overlay vars `KMAEDU_BE_DIR` and `KMAEDU_FE_DIR` in compose.env.** The poison test points the generator at a copy of deploy.
5. **`auth` also depends on rabbitmq; `document` has no redis.** depends_on follows what each service's env actually uses. Infra is always started first anyway.
6. **The test container gets a staged copy of tracked files.** `run-tests.sh` mounts a staged copy of the git-tracked files of `kmaedu-be/deploy` and `kmaedu-be/scripts`, not the repo, so real env files never enter the container.
7. **`ps`, `logs`, `sh`, `seed` and `db:reset` use the files of the last `up`.** They do not re-render; with no generated stack they say "run ./project up first".
8. **Traefik is pinned to `v3.6.25`**, the same as devt. `KMAEDU_WATCH_POLL` defaults to `false` and is validated as true or false.

## Not verified here (phase 04)

- The `deps` job: `yarn install --immutable`, `buf generate` and `prisma:generate` in the container.
- Nest watch in containers, migrate jobs from source, the `kmaedu-dev-ai:local` build, `watchfiles` restart, and Vite through Traefik with HMR.
- The ai image is built by compose only when missing. A `requirements.txt` change needs `docker image rm kmaedu-dev-ai:local` (worth a line in the phase 05 README).

## Unresolved questions

None blocking.
