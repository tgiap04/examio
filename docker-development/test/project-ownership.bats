#!/usr/bin/env bats
# KMAEDU_DEV_PROJECT may collide with another compose project (the deploy stack under a name set in its
# own .env): up / down / seed / db:reset refuse to touch containers or volumes they did not create.

OWNER=kmaedu-dev_kmaedu-dev-owner

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  "$PROJECT" render >/dev/null 2>&1
  : >"$SHIM_LOG"
}

mutated() { grep -E ' (up -d|down|rm -s -f|run --rm|exec)|^docker volume rm ' "$SHIM_LOG"; }

@test "containers of the project created from another compose file: every mutating command refuses" {
  export FAKE_PS_CONFIG_FILES="/srv/kmaedu-be/deploy/docker-compose.yml"
  for cmd in up down seed "db:reset -y" "sh auth"; do
    # shellcheck disable=SC2086  # db:reset -y is two words
    run "$PROJECT" $cmd
    assert_failure
    assert_output --partial "/srv/kmaedu-be/deploy/docker-compose.yml"
    assert_output --partial "KMAEDU_DEV_PROJECT"
  done
  run mutated
  assert_failure
}

@test "containers created from this generated compose.yaml are ours: up proceeds" {
  export FAKE_PS_CONFIG_FILES="$GEN/compose.yaml
$GEN/compose.yaml"
  export FAKE_PROJECT_VOLUMES="kmaedu-dev_postgres_data $OWNER"
  run "$PROJECT" up
  assert_success
  grep -qE ' up -d auth$' "$SHIM_LOG"
}

@test "volumes of the project without the owner marker: up and db:reset refuse, nothing is deleted" {
  export FAKE_PROJECT_VOLUMES="kmaedu-dev_postgres_data kmaedu-dev_redis_data"
  export FAKE_VOLUMES="kmaedu-dev_postgres_data"
  run "$PROJECT" up
  assert_failure
  assert_output --partial "$OWNER"
  run "$PROJECT" db:reset -y
  assert_failure
  run mutated
  assert_failure
}

@test "first up creates the owner marker volume with the project label, before any container starts" {
  run "$PROJECT" up
  assert_success
  c="$(grep -n "^docker volume create .*--label com.docker.compose.project=kmaedu-dev .*$OWNER$" "$SHIM_LOG" | head -1 | cut -d: -f1)"
  i="$(grep -n ' up -d --wait ' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  [ -n "$c" ] && [ -n "$i" ] && [ "$c" -lt "$i" ]
}

@test "an existing marker is not created again" {
  export FAKE_VOLUMES="$OWNER" FAKE_PROJECT_VOLUMES="$OWNER"
  run "$PROJECT" up
  assert_success
  run grep "^docker volume create .*$OWNER" "$SHIM_LOG"
  assert_failure
}

@test "a generated dir under a symlink, written with // and a trailing / (TMPDIR on macOS), matches the label" {
  # Compose cleans the path but keeps the symlink (/var/folders/.../T//x -> /var/folders/.../T/x, not /private/var)
  mkdir -p "$SANDBOX/real" && ln -s "$SANDBOX/real" "$SANDBOX/link"
  export KMAEDU_DEV_GEN_DIR="$SANDBOX/link//gen/"
  "$PROJECT" render >/dev/null 2>&1
  export FAKE_PS_CONFIG_FILES="$SANDBOX/link/gen/compose.yaml"
  run "$PROJECT" up
  assert_success
}
