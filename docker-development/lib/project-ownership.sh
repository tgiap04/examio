# Project-name guard. KMAEDU_DEV_PROJECT can equal another compose project's name (the deploy stack may
# take its name from deploy/.env, which this tool never reads): `--remove-orphans`, stop_unneeded and
# db:reset would then remove its containers or its database volume. Every mutating command first proves
# the project is this dev stack's. bash 3.2 safe.
# shellcheck shell=bash

# Created by `./project up` with the project label; a project whose volumes lack it is not ours.
OWNER_VOLUME="${PROJECT_NAME}_kmaedu-dev-owner"

# _is_our_compose_file <config_files label>: the generated compose.yaml. Compose records a cleaned absolute
# path (no // or trailing /, e.g. from TMPDIR=/var/.../T/), so compare it with GEN_DIR as given, normalised
# by the shell, and with symlinks resolved.
_is_our_compose_file() {
  local dir
  [ "$1" = "$GEN_DIR/compose.yaml" ] && return 0
  dir="$(cd "$GEN_DIR" 2>/dev/null && pwd)" || return 1
  [ "$1" = "$dir/compose.yaml" ] && return 0
  dir="$(cd -P "$GEN_DIR" 2>/dev/null && pwd)" || return 1
  [ "$1" = "$dir/compose.yaml" ]
}

# assert_project_owned: die when a container of the project came from another compose file, or when the
# project has volumes but no owner marker.
assert_project_owned() {
  local files line vols
  files="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --format '{{.Label "com.docker.compose.project.config_files"}}' </dev/null)" ||
    die "docker ps failed: cannot check who owns compose project '$PROJECT_NAME'"
  while IFS= read -r line; do
    [ -z "$line" ] || _is_our_compose_file "$line" ||
      die "compose project '$PROJECT_NAME' has containers created from $line, not from $GEN_DIR/compose.yaml: it is not this dev stack (the deploy stack?). Set KMAEDU_DEV_PROJECT to another name; nothing was changed."
  done <<EOF
$files
EOF
  vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" </dev/null)" ||
    die "docker volume ls failed: cannot check who owns compose project '$PROJECT_NAME'"
  [ -n "$vols" ] || return 0
  case " $(printf '%s' "$vols" | tr '\n' ' ') " in *" $OWNER_VOLUME "*) return 0 ;; esac
  die "compose project '$PROJECT_NAME' has volumes ($(printf '%s' "$vols" | tr '\n' ' ')) but no marker volume $OWNER_VOLUME: they were not created by docker-development (the deploy stack?). Set KMAEDU_DEV_PROJECT to another name; if they are leftovers of your own dev stack, remove them with docker volume rm. Nothing was changed."
}

# ensure_owner_marker: claim the project for docker-development (after assert_project_owned passed).
ensure_owner_marker() {
  docker volume inspect "$OWNER_VOLUME" >/dev/null 2>&1 && return 0
  docker volume create --label "com.docker.compose.project=$PROJECT_NAME" \
    --label com.kmaedu.dev.owner=docker-development "$OWNER_VOLUME" >/dev/null ||
    die "cannot create the docker volume $OWNER_VOLUME"
}
