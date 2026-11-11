# Shared bats helper. docker-development/ is mounted read-only, so every test gets a private sandbox:
# generated dir, services file, user .env, a docker shim on PATH and (on demand) a writable kmaedu-be copy.
# shellcheck shell=bash

DEV_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
REAL_BE_DIR="$(cd "$DEV_ROOT/.." && pwd)/kmaedu-be"
export PROJECT="$DEV_ROOT/project"

load_bats_libs() {
  load '/usr/local/lib/bats-support/load'
  load '/usr/local/lib/bats-assert/load'
}

# Per-test sandbox. Secrets come from local openssl (KMAEDU_DEV_TOOL_RUNNER=local), never from a container.
setup_sandbox() {
  SANDBOX="$BATS_TEST_TMPDIR/sandbox"
  SHIM_DIR="$SANDBOX/shims"
  SHIM_LOG="$SANDBOX/calls.log"
  GEN="$SANDBOX/gen"
  mkdir -p "$SHIM_DIR"
  : >"$SHIM_LOG"
  export SHIM_LOG
  export KMAEDU_DEV_GEN_DIR="$GEN"
  export KMAEDU_SERVICES_FILE="$SANDBOX/services"
  export KMAEDU_DEV_ENV_FILE="$SANDBOX/dev.env"
  export KMAEDU_DEV_TOOL_RUNNER=local
  export KMAEDU_BE_DIR="$REAL_BE_DIR"
  unset KMAEDU_DEV_PROJECT KMAEDU_WEB_PORT KMAEDU_HTTP_PORT KMAEDU_PG_PORT KMAEDU_REDIS_PORT KMAEDU_RABBITMQ_PORT \
    KMAEDU_WATCH_POLL KMAEDU_HOST_YARN_CACHE FAKE_COMPOSE_VERSION FAKE_DAEMON_DOWN FAKE_COMPOSE_PS FAKE_COMPOSE_PS_STATE FAKE_VOLUMES \
    FAKE_COMPOSE_CONFIG_FAIL FAKE_RUN_FAIL FAKE_COMPOSE_PS_STOPPED FAKE_PS_CONFIG_FILES FAKE_PROJECT_VOLUMES \
    KMAEDU_DEPS_FORCE
  ORIG_PATH="$PATH"
  export PATH="$SHIM_DIR:$PATH"
  install_docker_shim
}

# copy_be: writable copy of the deploy templates + secret scripts (tests that alter or poison them).
copy_be() {
  local dest="$SANDBOX/kmaedu-be"
  mkdir -p "$dest"
  cp -R "$REAL_BE_DIR/deploy" "$REAL_BE_DIR/scripts" "$dest/"
  export KMAEDU_BE_DIR="$dest"
  # shellcheck disable=SC2034  # read by the tests
  BE_COPY="$dest"
}

# Fake `docker`: logs every call; behaviour driven by FAKE_* env vars:
#   FAKE_COMPOSE_VERSION        `compose version --short` output (default v5.4.0)
#   FAKE_DAEMON_DOWN=1          `info` fails
#   FAKE_COMPOSE_PS             stdout of `compose ... ps` (space-separated service names of RUNNING containers)
#   FAKE_COMPOSE_PS_STOPPED     extra services `compose ... ps -a` lists (stopped containers)
#   FAKE_PS_CONFIG_FILES        `docker ps -a --format ...config_files...` lines (containers of the project)
#   FAKE_PROJECT_VOLUMES        `docker volume ls -q` output (space-separated volumes of the project)
#   FAKE_COMPOSE_PS_STATE       stdout of `compose ... ps -a --format ...State...` ("<service> <state>" lines)
#   FAKE_VOLUMES                volumes `volume inspect` knows (space-separated); `volume create` succeeds
#   FAKE_COMPOSE_CONFIG_FAIL=1  `compose ... config` fails
#   FAKE_RUN_FAIL=1             `run` fails; otherwise `run ... bash -s` runs stdin locally with S=<scripts dir>
install_docker_shim() {
  cat >"$SHIM_DIR/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $*" >>"$SHIM_LOG"
last=""; for a in "$@"; do last="$a"; done
case "$1" in
  info) [ "${FAKE_DAEMON_DOWN:-}" = 1 ] && exit 1; exit 0 ;;
  ps) [ -z "${FAKE_PS_CONFIG_FILES:-}" ] || printf '%s\n' "$FAKE_PS_CONFIG_FILES"; exit 0 ;;
  volume) [ "$2" = create ] && exit 0
    if [ "$2" = ls ]; then [ -z "${FAKE_PROJECT_VOLUMES:-}" ] || printf '%s\n' $FAKE_PROJECT_VOLUMES; exit 0; fi
    case " ${FAKE_VOLUMES:-} " in *" $last "*) exit 0 ;; esac
    echo "Error: No such volume: $last" >&2; exit 1 ;;
  image|build) exit 0 ;;
  run) [ "${FAKE_RUN_FAIL:-}" = 1 ] && { echo "run failed" >&2; exit 125; }
    if [ "$last" = -s ]; then
      for a in "$@"; do case "$a" in *:/s:ro) S="${a%:/s:ro}" ;; esac; done
      S="$S" exec bash -s
    fi
    exit 0 ;;
  compose)
    if [ "$2" = version ]; then echo "${FAKE_COMPOSE_VERSION:-v5.4.0}"; exit 0; fi
    case " $* " in
      *" ps "*.State*) [ -z "${FAKE_COMPOSE_PS_STATE:-}" ] || printf '%s\n' "$FAKE_COMPOSE_PS_STATE" ;;
      *" ps -a "*) printf '%s\n' ${FAKE_COMPOSE_PS:-} ${FAKE_COMPOSE_PS_STOPPED:-} | grep . || true ;;
      *" ps "*) [ -z "${FAKE_COMPOSE_PS:-}" ] || printf '%s\n' $FAKE_COMPOSE_PS ;;
      *" config "*) [ "${FAKE_COMPOSE_CONFIG_FAIL:-}" = 1 ] && { echo "config failed" >&2; exit 1; } ;;
    esac
    exit 0 ;;
esac
exit 0
SHIM
  chmod +x "$SHIM_DIR/docker"
}

# Real `docker compose config` of the generated stack (offline, no daemon), bypassing the shim.
# shellcheck disable=SC2120  # callers may add compose config flags
real_compose_config() {
  PATH="$ORIG_PATH" docker compose -p "${KMAEDU_DEV_PROJECT:-kmaedu-dev}" -f "$GEN/compose.yaml" \
    --env-file "$GEN/compose.env" config --format json "$@"
}

shim_calls() { cat "$SHIM_LOG"; }

# config_json: render, then the merged model as JSON in $CFG (q <jq filter> reads it).
config_json() {
  "$PROJECT" render >/dev/null 2>&1 || fail "render failed"
  CFG="$SANDBOX/config.json"
  # shellcheck disable=SC2119
  real_compose_config >"$CFG" 2>"$SANDBOX/config.err" || { cat "$SANDBOX/config.err"; fail "compose config failed"; }
}

q() { jq -r "$@" "$CFG"; }

# uncommented KEY= names of a template, one per line
template_keys() { sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$1"; }
