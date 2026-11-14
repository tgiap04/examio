#!/usr/bin/env bats
# down / ps / logs / sh / seed / db:reset (docker shim).

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  printf 'auth\nfe\n' >"$KMAEDU_SERVICES_FILE"
  "$PROJECT" render >/dev/null 2>&1
  : >"$SHIM_LOG"
}

@test "logs maps services keys to compose services and passes flags through" {
  run "$PROJECT" logs -t fe gateway
  assert_success
  run grep ' logs ' "$SHIM_LOG"
  assert_output --regexp ' logs -f --tail=100 -t fe gateway-a$'
}

@test "sh opens a shell in the first container of a key; no name exits 2" {
  run "$PROJECT" sh ai
  assert_success
  grep -q ' exec ai sh -c ' "$SHIM_LOG"
  run "$PROJECT" sh
  [ "$status" -eq 2 ]
}

@test "ps prints a SERVICE STATE STATUS table and the URLs" {
  export FAKE_COMPOSE_PS_STATE="postgres|running|Up 2 minutes (healthy)
auth|running|Up 1 minute (health: starting)"
  run "$PROJECT" ps
  assert_success
  assert_output --regexp 'SERVICE +STATE +STATUS'
  assert_output --regexp 'auth +running +Up 1 minute'
  assert_output --partial "http://localhost:5173"
}

@test "inspect commands before any up say so" {
  rm -f "$GEN/compose.yaml"
  run "$PROJECT" ps
  assert_failure
  assert_output --partial "./project up"
}

@test "down keeps volumes; a generated file that no longer loads falls back to the project name" {
  run "$PROJECT" down
  assert_success
  grep -qE ' -f .*compose.yaml .* down --remove-orphans$' "$SHIM_LOG"
  : >"$SHIM_LOG"
  FAKE_COMPOSE_CONFIG_FAIL=1 run "$PROJECT" down
  assert_success
  grep -qx 'docker compose -p kmaedu-dev down --remove-orphans' "$SHIM_LOG"
  run grep -- ' -v' "$SHIM_LOG"
  assert_failure
}

@test "seed runs the seed profile and names the password key and file, never the password" {
  run "$PROJECT" seed
  assert_success
  grep -q -- ' --profile seed run --rm seed$' "$SHIM_LOG"
  assert_output --partial "ADMIN_DEFAULT_PASSWORD"
  assert_output --partial "$GEN/secrets.env"
  pw="$(sed -n "s/^ADMIN_DEFAULT_PASSWORD='\(.*\)'$/\1/p" "$GEN/secrets.env")"
  refute_output --partial "$pw"
}

@test "db:reset without a TTY and without -y refuses and removes nothing" {
  run "$PROJECT" db:reset </dev/null
  assert_failure
  assert_output --partial "-y"
  run grep -E ' rm |volume rm' "$SHIM_LOG"
  assert_failure
}

@test "db:reset -y: remove apps, drop the dev Postgres volume, then up" {
  export FAKE_COMPOSE_PS="postgres redis rabbitmq traefik deps auth auth-migrate fe"
  export FAKE_VOLUMES="kmaedu-dev_postgres_data"
  run "$PROJECT" db:reset -y
  assert_success
  r="$(grep -n ' rm -s -f ' "$SHIM_LOG" | head -1)"
  v="$(grep -n '^docker volume rm kmaedu-dev_postgres_data$' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  u="$(grep -n ' up -d auth fe$' "$SHIM_LOG" | head -1 | cut -d: -f1)"
  case "$r" in *' rm -s -f postgres deps auth auth-migrate fe') ;; *) fail "rm line: $r" ;; esac
  [ -n "$v" ] && [ -n "$u" ] && [ "${r%%:*}" -lt "$v" ] && [ "$v" -lt "$u" ]
  assert_output --partial "./project seed"
}

@test "db:reset rejects an unknown option with exit 2" {
  run "$PROJECT" db:reset --force
  [ "$status" -eq 2 ]
}

@test "db:reset also removes STOPPED containers (a stopped postgres keeps the volume in use)" {
  export FAKE_COMPOSE_PS="redis rabbitmq"
  export FAKE_COMPOSE_PS_STOPPED="postgres auth-migrate"
  export FAKE_VOLUMES="kmaedu-dev_postgres_data"
  run "$PROJECT" db:reset -y
  assert_success
  run grep ' rm -s -f ' "$SHIM_LOG"
  assert_output --regexp ' rm -s -f postgres auth-migrate$'
}
