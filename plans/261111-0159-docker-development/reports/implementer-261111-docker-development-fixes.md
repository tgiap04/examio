# Fix round: review findings, docker-development

Date 2026-11-11, branch `feat/docker-development`. Input: `reviewer-261111-docker-development.md`. Only `docker-development/**`
changed (plus this report). Nothing committed. No real env file was opened: masks and smoke checks test existence and size only.

## Finding → change → test → result

| # | Change | Test (RED before the fix) | Result |
|---|---|---|---|
| W1 | `lib/render-host-env-masks.sh` rewritten. Every container that mounts kmaedu-be (`deps seed`, each app, each `*-migrate`, `r2`, `gateway-a/b`) masks every existing `.env` and `.env.*` (not `*.example`) at the root, in `deploy/` and in every `apps/*/`, plus an empty `tmpfs` over `/workspace/deploy/env`. `fe` masks `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`. Masks use the long bind syntax, so a `:` in a name is safe. A path with `" ' \ $` dies. `_mask_spec` dies on an unknown compose name; `infra` and `ai` are the explicit no-mount list. | `test/host-env-masks.bats` (6 tests): all-files mask per BE service, tmpfs, fe variants, ai gets none, unsafe path dies, unknown name dies | RED 5/6 → GREEN. Smoke check 10: `find` (names only, `-size +0c`) in auth and gateway-a returns nothing, `deploy/env` has 0 entries, fe has none |
| W2 | New `images/deps-job.sh` (POSIX sh, mounted read-only at `/usr/local/bin/kmaedu-deps-job`). It hashes node/yarn versions, `yarn.lock`, `.yarnrc.yml`, `package.json`, `proto/**` and `apps/*/prisma/schema*`. It skips when the hash matches `node_modules/.kmaedu-dev-deps-stamp` and the generated outputs exist. The stamp is removed before the steps and written after all three succeed. `KMAEDU_DEPS_FORCE=1` forces a run (compose `${KMAEDU_DEPS_FORCE:-0}`); any value other than 0/1 dies in `check_port_knobs`. | `test/deps-job.bats` (7 tests): the real script on a fake workspace with fake node/yarn. Covers skip on rerun; rerun on a lockfile, proto (changed or new) or schema change; force; a deleted output; a failed step leaves no stamp; compose wiring; bad force value | RED 7/7 → GREEN. Smoke check 13: second `up` returned in 6 s, last deps log line "skipped", gateway still 401 |
| W4 | New `lib/project-ownership.sh`. `assert_project_owned` runs first in `up`, `down`, `seed` and `db:reset`. It dies when a container of the project has `com.docker.compose.project.config_files` other than `$GEN_DIR/compose.yaml`; the path is compared as given, shell-normalised and symlink-resolved. It also dies when the project has volumes but no marker volume `<project>_kmaedu-dev-owner`, which `up` creates with the project label. `test/smoke-up.sh` refuses the project `kmaedu-dev`, any existing container, and any volume other than a KEEP_MODULES leftover (node_modules + marker); the marker is kept or removed together with node_modules. | `test/project-ownership.bats` (6 tests) | RED 4/6 → GREEN (2 "ours proceeds" cases passed by design). Real Docker: a foreign unlabelled volume made `smoke-up.sh`, `./project up` and `./project down` exit 1, and the volume survived. `KMAEDU_SMOKE_PROJECT=kmaedu-dev` was refused |
| S1 | `db:reset` lists services with `ps -a`. | `inspect-and-database.bats` "db:reset also removes STOPPED containers" (shim gained `FAKE_COMPOSE_PS_STOPPED`) | RED → GREEN |
| S3 | `_write_rendered` sets `trap "rm -f '<tmp>'" EXIT` and runs the function without `\|\|`, so errexit applies and any exit removes the temp file. `write_file_atomic` removes its temp on failure. | `render-env-files.bats` "a render that dies half-way leaves no temp file" (a quote in `KMAEDU_REPO_ROOT` makes `_env_line` die after the secret lines) | RED (`compose.env.tmp.<pid>` left) → GREEN |
| S7 | `test/run-tests.sh` stages `docker-development` from `git ls-files --cached --others --exclude-standard`, so `.env`, `services` and `.generated/` stay out, and mounts the staged copy. It also runs `shellcheck -s sh images/*.sh`. | `cli-and-prerequisites.bats` "the test container sees no user file" | RED with a temporary `.generated/red-canary` → GREEN |
| W3 | Not implemented. README gets a `## Giới hạn` section: Linux untested, generated dirs may be root-owned, `chown` workaround. | — | doc only |
| S5 | Not implemented: not trivial. It needs a host-side portable hash, a label merged into deploy's `build`, and a rebuild path. An unlabelled existing image would trigger a ~30 min rebuild. README note kept and reworded. | — | doc only |

S2, S6, S8 were left alone as instructed.

## Found during verification (fixed)

1. **Guard refused its own smoke stack.** `$TMPDIR` ends in `/`, so the generated dir was `.../T//kmaedu-smoke.X/gen`. Compose records the cleaned path and keeps the `/var` symlink; `cd -P` gives `/private/var`. Fix: also compare the logically normalised path (`cd && pwd`). Test: `project-ownership.bats` test 6 (symlink + `//` + trailing `/`), RED on the old function, GREEN now.
2. **Pre-existing flake in `_check_required_compose_vars`.** `printf "$parsed" | grep -qE` under `pipefail` broke when `grep -q` exited early: printf got SIGPIPE ("write error: Broken pipe") and a key that was present was reported missing. It failed 3 tests under load (smoke running in parallel). Fix: a here-string instead of the pipe. No deterministic test: the failure is a race.

## Other edits

- `config_json`/`q` moved from `compose-overlay.bats` to `test/helpers/test-helper.bash` (shared by the new files). Shim: `docker ps` (`FAKE_PS_CONFIG_FILES`), `docker volume ls` (`FAKE_PROJECT_VOLUMES`), `compose ps -a`.
- `up-flow.bats` "existing yarn cache volume…" now greps `volume create kmaedu-dev-yarn-cache`. It used to match any `volume create`, and the marker volume is now one. The assertion's intent is unchanged.
- Golden `test/fixtures/expected/compose.yaml`: one `env-masks.yaml` include path per compose name except infra and ai. With the tmpfs every BE service has a mask, so every fragment now exists.
- Smoke helpers moved to `test/helpers/smoke-lib.bash` to keep `smoke-up.sh` under 200 lines. The smoke host-env baseline now lists `.env*` names in root, `deploy/`, `apps/*`, fe.
- `./project help` and README document `KMAEDU_DEPS_FORCE`, the masks, and the owner guard.

## Files (lines)

New: `lib/project-ownership.sh` 48, `images/deps-job.sh` 54, `test/host-env-masks.bats` 88, `test/deps-job.bats` 106,
`test/project-ownership.bats` 76, `test/helpers/smoke-lib.bash` 34.
Changed: `lib/render-host-env-masks.sh` 105, `lib/render-env-files.sh` 154, `lib/common.sh` 108, `lib/commands-lifecycle.sh` 106,
`lib/commands-database.sh` 56, `compose/dev-extras.yaml` 87, `project` 94, `test/run-tests.sh` 49, `test/smoke-up.sh` 185,
`test/helpers/test-helper.bash` 112, `test/compose-overlay.bats` 154, `test/inspect-and-database.bats` 101,
`test/render-env-files.bats` 132, `test/cli-and-prerequisites.bats` 74, `test/up-flow.bats` 120,
`test/fixtures/expected/compose.yaml` 84, `README.md` 154. No file reaches 200 lines.

## Gate (final tree)

| Check | Result |
|---|---|
| `./test/run-tests.sh` (shellcheck bash + sh, bats in bash 3.2) | exit 0, 100/100 (was 78) |
| `git diff --exit-code kmaedu-be/deploy` | exit 0 |
| `node --test compose-topology.spec.cjs` | exit 0, 46/46 |
| `./test/smoke-up.sh` (real Docker, `kmaedu-dev-smoke`) | exit 0, all PASS; first `up` 43 s (fresh node_modules volume), second `up` 6 s with deps skipped, total 82 s |
| Leftovers | 0 kmaedu containers; volumes: only `kmaedu-dev-yarn-cache`; images `kmaedu-dev-node`, `kmaedu-dev-ai`, test image kept; no `.env`/`services`/`.generated` in docker-development |

Coverage: not measured (bash/YAML, no coverage tool).

## Open points

- `deploy/rabbitmq/definitions.json` (gitignored; RabbitMQ password hashes) stays visible under `/workspace` in BE containers. It is not an env file, so it is out of the W1 scope. Masking it is a one-line addition if wanted.
- In `lib/render-env-files.sh`, an error inside a nested command substitution, such as a malformed committed template value read via `dotenv_get "$tpl"`, is still swallowed and renders an empty value. User input (`docker-development/.env`) is validated up front, so only tracked templates are affected.
- Projects created before this round have no owner marker. After `down` their volumes are refused until removed by hand. No such volumes exist on this machine.
