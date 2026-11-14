# Review: docker-development (untracked, branch feat/docker-development)

Scope: 47 files under `docker-development/` (excl. `.claude/`), ~3.1k lines. Depth: full.
Evidence run: `./test/run-tests.sh` → shellcheck clean + 78/78 bats ok (exit 0); `node --test deploy/compose-topology.spec.cjs` 46/46; `git diff --exit-code kmaedu-be/deploy` exit 0; own `./project render` into scratch (`KMAEDU_DEV_TOOL_RUNNER=local`, scratch GEN/ENV) + real `docker compose config` (Compose 5.4.0) inspected per service. `./project up` NOT run (per brief).

Score: **8/10**. No critical. 4 warnings, 8 suggestions.

## Acceptance criteria
| Phase | Criterion | Status |
|---|---|---|
| 01 | run-tests exit 0 in bash 3.2, shellcheck clean | met (re-run) |
| 01 | render twice → secrets.env identical | met (bats `two renders`) |
| 01 | compose.env keys ≥ deploy/.env.example keys | met (bats) |
| 02 | compose-overlay.bats green, deploy diff 0, topology spec green | met (re-run) |
| 03 | help lists commands/keys | met |
| 04 | smoke exit 0 twice + timings | per tester report only (not re-run) |
| 05 | docs | pending (README.md appeared mid-review; not reviewed) |

## Verified good
- Compose never loads deploy/.env: every include sets `env_file` → `.generated/compose.env`; poison test proves no POISON in merged config.
- Every deploy compose file has an overlay (render dies otherwise); every env_file is `!override`d to `.generated/env/*`.
- Only postgres/redis/rabbitmq/traefik publish, all `127.0.0.1`; no `container_name`; networks renamed `<project>-*`; volumes `<project>_*`; rabbitmq-defs reads `deploy/rabbitmq` ro and writes to `.generated/rabbitmq` only.
- Secrets: generated in `--network none` container, captured via stdout, never echoed; `.generated` 700, files 600; summaries print key names + paths only. No secret in tracked files (Turnstile/Google values are public test placeholders).
- db:reset: TTY confirm or `-y`, volume name from validated project name, deploy names refused.
- Bash: 3.2-safe idioms, `${args[@]+...}`, atomic writes, values parsed not sourced.

## Warnings
**W1 Real secret files are readable inside every Node container** — `lib/render-host-env-masks.sh:10-17`, `compose/dev-extras.yaml:19`, every `compose/*.dev.yaml` `${KMAEDU_BE_DIR}:/workspace`.
Masks cover only `kmaedu-be/.env` + the container's own `apps/<svc>/.env`. Still visible: `/workspace/deploy/.env`, `/workspace/deploy/env/*.env`, other apps' `.env` (e.g. `apps/r2-service/.env`, `apps/ai-service/.env` inside auth). `deps` runs `yarn install` (lifecycle scripts) with internet egress over this tree. Code does not load them (verified: each `main.ts` loads only its own `apps/<svc>/.env`; Prisma root `.env` masked), but the plan's invariant "never read by the dev stack" holds only by convention, and a compromised dependency can read production deploy secrets. Also `_mask_spec` has no `*)` branch: a new deploy compose file gets zero masks silently, and its `main.ts` dotenv would load its `apps/<x>/.env`.
Fix: in `_service_masks`, mask for every `/workspace` service every existing `deploy/.env`, `apps/*/.env`, `.env` (generic loop, not per-app); cover `deploy/env` with `tmpfs` (`- type: tmpfs\n  target: /workspace/deploy/env`, dir exists so no host artifact). Make `_mask_spec` die on unknown names except an explicit no-mount list (`infra ai`). Add bats: deps/auth have masks for poisoned `deploy/.env` and `apps/r2-service/.env`.

**W2 Every `./project up` re-runs `deps` under live watchers** — `compose/dev-extras.yaml:15`.
`proto/buf.gen.yaml` has `clean: true` → `libs/contracts/src/generated` deleted then rewritten; `prisma:generate` rewrites `apps/*/src/generated/prisma`; while up to 10 Nest watchers (and host IDE) run → simultaneous failed rebuilds/restarts each time the user edits `services` and re-ups. Not covered by smoke (db:reset removes apps first).
Fix: stamp guard: `h=$(cat yarn.lock proto/kmaedu/*/*/*.proto apps/*/prisma/schema.prisma | sha256sum); [ "$h" = "$(cat node_modules/.dev-deps-stamp 2>/dev/null)" ] && exit 0; yarn install --immutable && yarn proto:gen && yarn prisma:generate && echo "$h" > node_modules/.dev-deps-stamp`.

**W3 Containers run as root and write into the host tree (Linux)** — `images/node-dev.Dockerfile:4`, deps job.
On Linux `libs/contracts/src/generated` and `apps/*/src/generated/prisma` become root-owned; host `yarn proto:gen` (clean: true) then fails EACCES. Unverified (no Linux run), plan lists Linux as target.
Fix: render `KMAEDU_UID/GID` (`id -u/-g`) into compose.env and set `user: "${KMAEDU_UID}:${KMAEDU_GID}"` on deps/apps/fe on Linux (HOME + yarn cache path adjusted), or a documented `chown` step.

**W4 Project-name guard is a denylist** — `lib/common.sh:26-28`; impact `lib/commands-lifecycle.sh:48-59,72`, `lib/commands-database.sh:37-49`, `test/smoke-up.sh:33-35,55-61`.
The deploy stack's real name may come from `COMPOSE_PROJECT_NAME` in deploy/.env (unreadable by design). If `KMAEDU_DEV_PROJECT` equals it: `--remove-orphans` + `stop_unneeded` remove its containers, `db:reset -y` deletes its DB volume. Smoke checks only containers: `KMAEDU_SMOKE_PROJECT=kmaedu-dev` with the dev stack down deletes the dev volumes in cleanup.
Fix: before mutating commands, refuse when `docker ps -a --filter label=com.docker.compose.project=$PROJECT_NAME --format '{{.Label "com.docker.compose.project.config_files"}}'` yields anything other than `$GEN_DIR/compose.yaml`; smoke: refuse if `project_volumes` is non-empty at start.

## Suggestions
- S1 `lib/commands-database.sh:37` `dc ps` without `-a`: a stopped postgres container keeps the volume in use → `volume rm` dies. Use `ps -a` or always `dc rm -s -f postgres`.
- S2 `lib/commands-lifecycle.sh:25-30` checks only a missing secrets.env; a single deleted `*_DB_PASSWORD` is silently regenerated against an old volume. Die when the volume exists and any DB/RabbitMQ key is missing.
- S3 `lib/render-env-files.sh:96-101` a `die` inside the rendered fn exits before `rm -f "$tmp"` → `compose.env.tmp.<pid>` with secrets left in `.generated` (600, inside 700). Add `trap 'rm -f "$tmp"' EXIT` scoped or render to a var first.
- S4 `lib/render-host-env-masks.sh:31` Vite also loads `.env.local`, `.env.development`, `.env.development.local`; mask those when present.
- S5 `compose/ai.dev.yaml:8-48` ai image built once (no `--build`); a `requirements.txt` change is never picked up. Rebuild on requirements hash change or document `docker compose build ai`.
- S6 `/workspace/dist` anonymous volumes (every Node overlay) are orphaned by `down` (no `-v`) and accumulate; use `tmpfs: [/workspace/dist]`.
- S7 `test/run-tests.sh:34` mounts whole `docker-development/` incl. user `.env` (real R2/Gemini keys) and `.generated/secrets.env` into the test container; stage tracked files only, as done for kmaedu-be.
- S8 10 Node overlays are ~95% identical (60 lines each): consider generating them or a shared `extends` file; also `_has`/`secret_get` reparse secrets.env per key (render 1.4 s, fine).

## Test quality
Strong: real `docker compose config` assertions, poison test, golden compose.yaml, shimmed docker for flow order, bash 3.2 container. Gaps: no filesystem-visibility test for deploy/other-app env (W1); no test for unknown `_mask_spec` name; no re-up-with-running-apps case (W2); no foreign-project guard test (W4).

## Actions in order
1. W1 masks (generic + tmpfs deploy/env + die on unknown spec) + bats.
2. W4 project ownership check + smoke volume guard.
3. W2 deps stamp guard.
4. W3 Linux uid mapping (or document) before claiming Linux support.
5. S1–S7.

## Numbers
- Type coverage: n/a (bash/YAML). Test: 78 bats + 46 topology, all pass; line coverage not measured. Lint: shellcheck 0 findings. Files >200 lines: 0.

## Unresolved
- Smoke not re-run by reviewer (forbidden `up`); relied on tester report.
- Linux behaviour (W3, rabbitmq uid read of `.generated/rabbitmq`) unverified.
- docker-development/README.md (phase 05) appeared during review; not reviewed.

---

## Re-review (fix round, 2026-11-11)

Scope: W1, W2, W4, S1, S3, S4, S7 only, against `implementer-261111-docker-development-fixes.md`. Read: `lib/render-host-env-masks.sh`, `lib/project-ownership.sh`, `images/deps-job.sh`, `lib/commands-lifecycle.sh`, `lib/commands-database.sh`, `lib/render-env-files.sh:95-146`, `compose/dev-extras.yaml`, `test/run-tests.sh`, `test/smoke-up.sh` + `test/helpers/smoke-lib.bash`, new bats files.
Evidence: `./test/run-tests.sh` → exit 0, 100/100 ok (shellcheck bash + sh clean). Own `./project render` into scratch (`KMAEDU_DEV_TOOL_RUNNER=local`, scratch GEN/ENV/services) + real `docker compose config --format json`: all 21 services that mount `/workspace` carry 7 `empty.env` masks (`.env`, `deploy/.env`, admin/ai/auth/gateway/r2 `apps/*/.env`) + tmpfs `/workspace/deploy/env`; `fe` 1 mask; ai/infra none. Name-only scan of ignored files: every existing host env file sits in root, `deploy/` or `apps/*/` → all covered. Smoke/`up` not run (per brief); relied on implementer's smoke run for runtime visibility (check 10) and the 6 s skip (check 13). `docker volume ls`: no legacy `kmaedu-dev` volumes, so the new marker guard does not lock this machine out.

### Verdicts
| # | Verdict | Notes |
|---|---|---|
| W1 | **fixed** | Generic per-tree loop (`render-host-env-masks.sh:41-50`), tmpfs over `deploy/env` (`:69`), `_mask_spec` dies on unknown name with explicit `infra | ai` no-mount list (`:19-20`), long bind syntax, unsafe path dies. Bats cover all-files, tmpfs, fe variants, ai none, unknown name. |
| W2 | **fixed** | `images/deps-job.sh` stamp in the node_modules volume, removed before steps / written after all three; skip also requires outputs present; `--immutable` keeps yarn.lock stable so the pre-install hash is valid. Verified every `apps/*/prisma` has a schema and its `src/generated/prisma` output, so `outputs_present` cannot force a run forever. Re-run on real input changes still rewrites under watchers — inherent, acceptable. |
| W4 | **fixed** | `assert_project_owned` first in up/down/seed/db:reset (container config_files label + marker volume); marker created only after the check and before any `dc up`; path compare tolerant of `//`, trailing `/`, symlink. Smoke refuses `kmaedu-dev`, any container, any non-leftover volume. |
| S1 | **fixed** | `commands-database.sh` `dc ps -a`. |
| S3 | **fixed** | `_write_rendered` (`render-env-files.sh:97-107`) EXIT trap + no `||` anywhere up the call chain (`render_all` → `render_env_files` called bare under `set -euo pipefail`), so errexit applies. Trap clobbers any prior EXIT trap, but `project` sets none. |
| S4 | **fixed** | fe gets `.env` + every `.env.*` except `*.example` (glob, `render-host-env-masks.sh:30-31`). |
| S7 | **fixed** | Stage from `git ls-files --cached --others --exclude-standard`; `.env`, `services`, `.generated/` excluded; canary bats. |

No regressions found.

### New findings
- **Suggestion N1 — `deploy/rabbitmq/definitions.json` (implementer's open point)** — `lib/render-host-env-masks.sh:41-50`. Grade: suggestion, not warning. It holds only salted `password_hash` values (9 users, template has no plaintext), exists only if the deploy stack was rendered from this checkout (not present on this machine; dev rabbitmq reads `.generated/rabbitmq`), and the passwords are random. Still cheap defence-in-depth against a compromised `yarn install` dependency: in `_be_env_files` also print `deploy/rabbitmq/definitions.json` when `-e`, so it gets the same `empty.env` mask. Do it; one line + one bats case.
- **Suggestion N2 — mask coverage is fixed-depth** — `lib/render-host-env-masks.sh:42-47`. Only root, `deploy/`, `apps/*/` are scanned; an env file in `libs/*/`, `apps/*/test/`, `test/` would be visible. None exists today. Either document it in README "Giới hạn" or widen to a `find -maxdepth 3 -name '.env*' ! -name '*.example' -not -path '*/node_modules/*'` (still name-only).
- **Suggestion N3 — `sh`/`logs` skip the ownership guard** — `lib/commands-inspect.sh:22,39`. With a colliding name, `./project sh auth` would open a shell in the foreign (deploy) container. Not mutating by itself; add `assert_project_owned` to `cmd_sh` (cheap).
- **Suggestion N4 — `docker-development/.gitignore:5` ignores only `.env`** — a `.env.local` copy would be staged into the test container (S7) and is committable. Use `.env*` + `!.env.example`.
- **Suggestion N5 — deps hash omits the generator scripts** — `images/deps-job.sh:18-26`. `scripts/prisma-generate.sh`, `scripts/prisma-schema-path.sh`, the `proto:gen`/`prisma:generate` script bodies (covered via package.json) — the two scripts are not. Add `scripts/prisma-*.sh` to the hashed file list; `KMAEDU_DEPS_FORCE=1` is the workaround meanwhile.

### Still open from round 1 (out of this re-review's scope)
W3 (Linux root-owned outputs, doc only), S2, S5 (doc only), S6, S8.

### Score
**9/10** (was 8). All four warnings except W3 (documented limitation) closed with RED→GREEN tests; no critical, no warning, 5 small suggestions.

**Status:** DONE
**Summary:** W1, W2, W4, S1, S3, S4, S7 verified fixed with no regressions; `./test/run-tests.sh` exit 0, 100/100, and a scratch render + `docker compose config` confirms 7 masks + tmpfs on all 21 `/workspace` services. Five new suggestions only (mask `definitions.json`, depth of mask scan, guard `sh`, `.env*` ignore, hash generator scripts).
**Concerns/Blockers:** Smoke not re-run by reviewer (forbidden); runtime mask visibility and the 6 s deps skip rest on the implementer's smoke run. W3 Linux behaviour still unverified.
