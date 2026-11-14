#!/usr/bin/env bats
# CLI surface and host prerequisites (docker shim).

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

@test "help lists every command, every services key and the KMAEDU_* knobs" {
  run "$PROJECT" help
  assert_success
  for c in up down ps logs sh seed db:reset help; do assert_output --partial "  $c"; done
  assert_output --partial "gateway auth admin content assessment study-room vocabulary document ai-chat r2 ai fe"
  for v in KMAEDU_DEV_PROJECT KMAEDU_WEB_PORT KMAEDU_HTTP_PORT KMAEDU_PG_PORT KMAEDU_REDIS_PORT KMAEDU_RABBITMQ_PORT \
    KMAEDU_WATCH_POLL KMAEDU_SERVICES_FILE KMAEDU_DEV_ENV_FILE KMAEDU_DEV_GEN_DIR; do
    assert_output --partial "$v"
  done
}

@test "no command prints help" {
  run "$PROJECT"
  assert_success
  assert_output --partial "Usage: ./project"
}

@test "an unknown command exits 2 with usage" {
  run "$PROJECT" frobnicate
  [ "$status" -eq 2 ]
  assert_output --partial "unknown command: frobnicate"
  assert_output --partial "Usage: ./project"
}

@test "Compose older than 2.24 is refused" {
  export FAKE_COMPOSE_VERSION=2.23.3
  run "$PROJECT" up
  assert_failure
  assert_output --partial "2.24"
  refute_output --partial "Starting"
}

@test "a stopped daemon is refused" {
  export FAKE_DAEMON_DOWN=1
  run "$PROJECT" up
  assert_failure
  assert_output --partial "daemon"
}

@test "an out-of-range port is refused, naming the variable" {
  KMAEDU_PG_PORT=70000 run "$PROJECT" up
  assert_failure
  assert_output --partial "KMAEDU_PG_PORT"
}

@test "the browser and API ports must differ" {
  KMAEDU_WEB_PORT=8000 KMAEDU_HTTP_PORT=8000 run "$PROJECT" up
  assert_failure
  assert_output --partial "must differ"
}

@test "an invalid or deploy-stack project name is refused" {
  KMAEDU_DEV_PROJECT=Bad.Name run "$PROJECT" up
  assert_failure
  assert_output --partial "KMAEDU_DEV_PROJECT"
  KMAEDU_DEV_PROJECT=deploy run "$PROJECT" ps
  assert_failure
  assert_output --partial "deploy stack"
}

@test "the test container sees no user file of docker-development (.env, services, .generated)" {
  for f in .env services .generated; do
    [ ! -e "$DEV_ROOT/$f" ] || fail "$f is visible inside the test container"
  done
}
