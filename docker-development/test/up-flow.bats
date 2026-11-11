#!/usr/bin/env bats
# ./project up: user files, image, secrets, render, infra first, only the listed apps (docker shim).

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

last_up() { grep -E '^docker compose .* up -d' "$SHIM_LOG" | tail -1; }

@test "first run copies services and .env from the examples and says so" {
  run "$PROJECT" up
  assert_success
  assert_output --partial "Created $KMAEDU_SERVICES_FILE from services.example"
  assert_output --partial "Created $KMAEDU_DEV_ENV_FILE from .env.example"
  cmp "$KMAEDU_SERVICES_FILE" "$DEV_ROOT/services.example"
  cmp "$KMAEDU_DEV_ENV_FILE" "$DEV_ROOT/.env.example"
}

@test "services = auth fe: only those apps are started" {
  printf 'auth\nfe\n' >"$KMAEDU_SERVICES_FILE"
  run "$PROJECT" up
  assert_success
  run last_up
  assert_output --regexp ' up -d auth fe$'
  refute_output --partial gateway
}

@test "services = gateway ai: gateway-a plus both ai processes" {
  printf 'gateway\nai\n' >"$KMAEDU_SERVICES_FILE"
  run "$PROJECT" up
  assert_success
  run last_up
  assert_output --regexp ' up -d gateway-a ai ai-worker$'
  refute_output --partial gateway-b
}

@test "infra starts first with --wait, after the dev image build and before the apps" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  run "$PROJECT" up
  assert_success
  b="$(grep -n '^docker build ' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  i="$(grep -n ' up -d --wait .*postgres redis rabbitmq traefik' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  a="$(grep -n ' up -d auth$' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  [ -n "$b" ] && [ -n "$i" ] && [ -n "$a" ] && [ "$b" -lt "$i" ] && [ "$i" -lt "$a" ]
  grep -q "^docker build .*-t kmaedu-dev-node:local" "$SHIM_LOG"
  grep -q -- "-p kmaedu-dev -f $GEN/compose.yaml --env-file $GEN/compose.env" "$SHIM_LOG"
}

@test "an app dropped from services is removed; infra, deps and migrate jobs are kept" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  export FAKE_COMPOSE_PS="postgres redis rabbitmq traefik deps auth auth-migrate content content-migrate"
  run "$PROJECT" up
  assert_success
  run grep ' rm -s -f' "$SHIM_LOG"
  assert_output --regexp ' rm -s -f content$'
}

@test "no secrets but an existing Postgres volume: refuse and point at db:reset" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  export FAKE_VOLUMES="kmaedu-dev_postgres_data"
  run "$PROJECT" up
  assert_failure
  assert_output --partial "db:reset"
  run grep ' up -d' "$SHIM_LOG"
  assert_failure
}

@test "missing R2 keys only warn: up still runs" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  : >"$KMAEDU_DEV_ENV_FILE"
  run "$PROJECT" up
  assert_success
  assert_output --partial "R2"
  run last_up
  assert_output --regexp ' up -d auth$'
}

@test "the summary prints the URLs and where secrets live, never a secret value" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  KMAEDU_WEB_PORT=5200 run "$PROJECT" up
  assert_success
  assert_output --partial "http://localhost:5200"
  assert_output --partial "http://localhost:8000/api/v1"
  assert_output --partial "/_traefik/dashboard/"
  assert_output --partial "/_rabbitmq/"
  assert_output --partial "logs deps"
  assert_output --partial "$GEN/secrets.env"
  pw="$(sed -n "s/^RABBITMQ_PASS='\(.*\)'$/\1/p" "$GEN/secrets.env")"
  [ -n "$pw" ]
  refute_output --partial "$pw"
}

@test "new yarn cache volume: created and seeded from the host cache before the apps" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  mkdir -p "$SANDBOX/host-cache" && : >"$SANDBOX/host-cache/pkg.zip"
  KMAEDU_HOST_YARN_CACHE="$SANDBOX/host-cache" run "$PROJECT" up
  assert_success
  assert_output --partial "Seeding the yarn cache"
  c="$(grep -n '^docker volume create kmaedu-dev-yarn-cache$' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  s="$(grep -n "^docker run .*$SANDBOX/host-cache:/src:ro.*kmaedu-dev-yarn-cache:/dst" "$SHIM_LOG" | head -1 | cut -d: -f1)"
  a="$(grep -n ' up -d auth$' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  [ -n "$c" ] && [ -n "$s" ] && [ -n "$a" ] && [ "$c" -lt "$s" ] && [ "$s" -lt "$a" ]
}

@test "existing yarn cache volume or no host cache: nothing created or copied" {
  printf 'auth\n' >"$KMAEDU_SERVICES_FILE"
  mkdir -p "$SANDBOX/host-cache" && : >"$SANDBOX/host-cache/pkg.zip"
  FAKE_VOLUMES=kmaedu-dev-yarn-cache KMAEDU_HOST_YARN_CACHE="$SANDBOX/host-cache" run "$PROJECT" up
  assert_success
  run grep -E '^docker (volume create kmaedu-dev-yarn-cache|run .*:/src:ro)' "$SHIM_LOG"
  assert_failure
  : >"$SHIM_LOG"
  KMAEDU_HOST_YARN_CACHE="$SANDBOX/none" run "$PROJECT" up
  assert_success
  grep -q '^docker volume create kmaedu-dev-yarn-cache$' "$SHIM_LOG"
  run grep -E '^docker run .*:/src:ro' "$SHIM_LOG"
  assert_failure
}
