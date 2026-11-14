# Shared helpers: logging, paths, ports, compose wrapper. Sourced by ./project (bash 3.2 safe).
# shellcheck shell=bash
# shellcheck disable=SC2034  # globals are consumed by the other lib files

# This tool's dir. ./project sets SELF_DIR; fall back to deriving it so libs can be sourced alone (bats).
SELF_DIR="${SELF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REPO_ROOT="${KMAEDU_REPO_ROOT:-$(dirname "$SELF_DIR")}"
BE_DIR="${KMAEDU_BE_DIR:-$REPO_ROOT/kmaedu-be}"
FE_DIR="${KMAEDU_FE_DIR:-$REPO_ROOT/kmaedu-fe}"
# Everything machine-generated (secrets included) lives here: gitignored, mode 700.
GEN_DIR="${KMAEDU_DEV_GEN_DIR:-$SELF_DIR/.generated}"
SERVICES_FILE="${KMAEDU_SERVICES_FILE:-$SELF_DIR/services}"
DEV_ENV_FILE="${KMAEDU_DEV_ENV_FILE:-$SELF_DIR/.env}"
SECRETS_FILE="$GEN_DIR/secrets.env"

log()  { printf '==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

# Compose project: names containers, volumes (<project>_postgres_data) and networks. Never the deploy stack's.
PROJECT_NAME="${KMAEDU_DEV_PROJECT:-kmaedu-dev}"
[[ "$PROJECT_NAME" =~ ^[a-z][a-z0-9_-]*$ ]] ||
  die "invalid KMAEDU_DEV_PROJECT '$PROJECT_NAME' (lowercase letters, digits, - and _, starting with a letter)"
case "$PROJECT_NAME" in
  deploy | kmaedu) die "KMAEDU_DEV_PROJECT '$PROJECT_NAME' is the name of the deploy stack: pick another" ;;
esac

WEB_PORT="${KMAEDU_WEB_PORT:-5173}"
HTTP_PORT="${KMAEDU_HTTP_PORT:-8000}"
PG_PORT="${KMAEDU_PG_PORT:-5432}"
REDIS_PORT="${KMAEDU_REDIS_PORT:-6379}"
RABBITMQ_PORT="${KMAEDU_RABBITMQ_PORT:-5672}"
WATCH_POLL="${KMAEDU_WATCH_POLL:-false}"

DEV_NODE_IMAGE=kmaedu-dev-node:local
DEV_AI_IMAGE=kmaedu-dev-ai:local
# yarn package cache of deps and fe, shared by every dev project (compose/dev-extras.yaml: external)
YARN_CACHE_VOLUME=kmaedu-dev-yarn-cache
# Started (and waited for) before any app; never removed by stop_unneeded.
INFRA_SERVICES="postgres redis rabbitmq traefik"
MIN_COMPOSE_VERSION=2.24.0

# check_port_knobs: every port is 1-65535 (no leading zero); browser and API entries differ.
check_port_knobs() {
  local pair name val
  for pair in "KMAEDU_WEB_PORT:$WEB_PORT" "KMAEDU_HTTP_PORT:$HTTP_PORT" "KMAEDU_PG_PORT:$PG_PORT" \
    "KMAEDU_REDIS_PORT:$REDIS_PORT" "KMAEDU_RABBITMQ_PORT:$RABBITMQ_PORT"; do
    name="${pair%%:*}" val="${pair#*:}"
    if ! [[ "$val" =~ ^[1-9][0-9]{0,4}$ ]] || [ "$val" -gt 65535 ]; then
      die "invalid $name '$val' (use a port number 1-65535)"
    fi
  done
  [ "$WEB_PORT" != "$HTTP_PORT" ] ||
    die "KMAEDU_WEB_PORT and KMAEDU_HTTP_PORT must differ (both $WEB_PORT): one is the browser port, the other the API port"
  [ "$WATCH_POLL" = true ] || [ "$WATCH_POLL" = false ] || die "invalid KMAEDU_WATCH_POLL '$WATCH_POLL' (true or false)"
  # read by compose (deps environment), not rendered: checked here so a typo does not silently skip
  case "${KMAEDU_DEPS_FORCE:-0}" in 0 | 1) ;; *) die "invalid KMAEDU_DEPS_FORCE '${KMAEDU_DEPS_FORCE}' (0 or 1)" ;; esac
}

# check_path_chars <path...>: these land inside double-quoted YAML and env values.
check_path_chars() {
  local p
  for p in "$@"; do
    case "$p" in *[\"\\\$\']* | *$'\n'*) die "unsupported character (\" ' \\ \$ or newline) in path $p" ;; esac
  done
}

# ensure_gen_dir: the generated dir and its subdirs, private to the user.
ensure_gen_dir() {
  mkdir -p "$GEN_DIR/env" "$GEN_DIR/rabbitmq" || die "cannot create $GEN_DIR"
  chmod 700 "$GEN_DIR" "$GEN_DIR/env"
  # read inside the rabbitmq container by its own user (hashes only, no password)
  chmod 755 "$GEN_DIR/rabbitmq"
}

# write_file_atomic <path>: stdin -> path via temp + rename (mode 600), so nothing sees a half-written file.
write_file_atomic() {
  local dest="$1" tmp
  tmp="$dest.tmp.$$"
  { (umask 077 && cat >"$tmp") && chmod 600 "$tmp" && mv -f "$tmp" "$dest"; } || { rm -f "$tmp"; return 1; }
}

# docker compose bound to the dev project, the generated file and its env (never deploy/.env).
dc() {
  docker compose -p "$PROJECT_NAME" -f "$GEN_DIR/compose.yaml" --env-file "$GEN_DIR/compose.env" "$@"
}

# version_ge <have> <need>: dotted numeric compare (3 fields), tolerates a leading "v" and -/+ suffixes.
version_ge() {
  local have="${1#v}" need="${2#v}" i h n
  local IFS=.
  local -a ha na
  have="${have%%[-+]*}"
  need="${need%%[-+]*}"
  read -r -a ha <<<"$have"
  read -r -a na <<<"$need"
  for i in 0 1 2; do
    h="${ha[$i]:-0}"
    n="${na[$i]:-0}"
    case "$h" in '' | *[!0-9]*) h=0 ;; esac
    case "$n" in '' | *[!0-9]*) n=0 ;; esac
    [ "$h" -gt "$n" ] && return 0
    [ "$h" -lt "$n" ] && return 1
  done
  return 0
}
