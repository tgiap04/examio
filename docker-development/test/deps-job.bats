#!/usr/bin/env bats
# images/deps-job.sh (the `deps` one-shot): install + proto:gen + prisma:generate only when an input changed.
# Runs the real script against a fake workspace with fake node/yarn on PATH.

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  WS="$SANDBOX/ws"
  YARN_LOG="$SANDBOX/yarn.log"
  mkdir -p "$WS/node_modules" "$WS/proto/kmaedu/a/v1" "$WS/apps/auth-service/prisma" "$WS/apps/gateway-service/src"
  printf 'lock v1\n' >"$WS/yarn.lock"
  printf '{}\n' >"$WS/package.json"
  printf 'syntax = "proto3";\n' >"$WS/proto/kmaedu/a/v1/a.proto"
  printf 'model A {}\n' >"$WS/apps/auth-service/prisma/schema.prisma"
  cat >"$SHIM_DIR/node" <<'SH'
#!/bin/sh
echo v22.0.0
SH
  cat >"$SHIM_DIR/yarn" <<'SH'
#!/bin/sh
[ "$1" = --version ] && { echo 4.9.2; exit 0; }
echo "yarn $*" >>"$YARN_LOG"
[ "${FAKE_YARN_FAIL:-}" = "$1" ] && exit 1
case "$1" in
  proto:gen) mkdir -p libs/contracts/src/generated ;;
  prisma:generate) mkdir -p apps/auth-service/src/generated/prisma ;;
esac
exit 0
SH
  chmod +x "$SHIM_DIR/node" "$SHIM_DIR/yarn"
  export YARN_LOG KMAEDU_DEPS_WORKSPACE="$WS"
}

deps_job() { : >"$YARN_LOG"; sh "$DEV_ROOT/images/deps-job.sh"; }
ran_all() { [ "$(cat "$YARN_LOG")" = "$(printf 'yarn install --immutable\nyarn proto:gen\nyarn prisma:generate')" ]; }
ran_none() { [ ! -s "$YARN_LOG" ]; }

@test "first run installs and generates, a second run with the same inputs skips everything" {
  run deps_job
  assert_success
  ran_all
  run deps_job
  assert_success
  assert_output --partial "skipped"
  ran_none
}

@test "a change in yarn.lock, a proto file, a new proto file or a prisma schema runs everything again" {
  deps_job
  for change in "lock v2>yarn.lock" "message B {}>proto/kmaedu/a/v1/a.proto" "x>proto/kmaedu/a/v1/b.proto" \
    "model B {}>apps/auth-service/prisma/schema.prisma"; do
    printf '%s\n' "${change%%>*}" >"$WS/${change#*>}"
    run deps_job
    assert_success
    ran_all || fail "no rerun after changing ${change#*>}"
    run deps_job
    ran_none || fail "rerun twice after changing ${change#*>}"
  done
}

@test "KMAEDU_DEPS_FORCE=1 runs everything even when nothing changed" {
  deps_job
  KMAEDU_DEPS_FORCE=1 run deps_job
  assert_success
  ran_all
}

@test "a deleted generated output (proto or prisma client) runs everything again" {
  deps_job
  rm -rf "$WS/libs/contracts/src/generated"
  run deps_job
  ran_all
  rm -rf "$WS/apps/auth-service/src/generated/prisma"
  run deps_job
  ran_all
}

@test "a failed step exits non-zero and leaves no stamp: the next run retries" {
  deps_job
  printf 'lock v3\n' >"$WS/yarn.lock"
  FAKE_YARN_FAIL=prisma:generate run deps_job
  assert_failure
  run deps_job
  assert_success
  ran_all
}

@test "compose: deps runs the mounted script read-only, KMAEDU_DEPS_FORCE passes through (default 0)" {
  config_json
  [ "$(q '.services.deps.command | join(" ")')" = "sh /usr/local/bin/kmaedu-deps-job" ]
  [ "$(q '.services.deps.volumes[] | select(.target == "/usr/local/bin/kmaedu-deps-job") | "\(.source) \(.read_only)"')" = \
    "$DEV_ROOT/images/deps-job.sh true" ]
  [ "$(q '.services.deps.environment.KMAEDU_DEPS_FORCE')" = 0 ]
  KMAEDU_DEPS_FORCE=1 real_compose_config >"$CFG"
  [ "$(q '.services.deps.environment.KMAEDU_DEPS_FORCE')" = 1 ]
}

@test "KMAEDU_DEPS_FORCE other than 0 or 1 is rejected before anything starts" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  KMAEDU_DEPS_FORCE=yes run "$PROJECT" up
  assert_failure
  assert_output --partial "KMAEDU_DEPS_FORCE"
  run grep ' up -d' "$SHIM_LOG"
  assert_failure
}
