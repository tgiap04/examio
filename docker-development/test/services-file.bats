#!/usr/bin/env bats
# services file: parse, validate, map keys to compose services.

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  # shellcheck source=../lib/common.sh
  . "$DEV_ROOT/lib/common.sh"
  # shellcheck source=../lib/services-file.sh
  . "$DEV_ROOT/lib/services-file.sh"
}

@test "comments, blank lines, trailing comments and duplicates are handled" {
  printf '# header\n\nauth\n  fe   # the web app\ncontent\nauth\n\t\n' >"$KMAEDU_SERVICES_FILE"
  run read_service_keys
  assert_success
  assert_output "auth
fe
content"
}

@test "unknown key dies and lists the valid keys" {
  printf 'auth\nexam\n' >"$KMAEDU_SERVICES_FILE"
  run read_service_keys
  assert_failure
  assert_output --partial "unknown service 'exam'"
  assert_output --partial "gateway auth admin content assessment study-room vocabulary document ai-chat r2 ai fe"
}

@test "a file with no service dies" {
  printf '# nothing\n\n' >"$KMAEDU_SERVICES_FILE"
  run read_service_keys
  assert_failure
  assert_output --partial "no service"
}

@test "a missing file dies with its path" {
  run read_service_keys
  assert_failure
  assert_output --partial "$KMAEDU_SERVICES_FILE"
}

@test "keys map to compose services: gateway -> gateway-a, ai -> ai ai-worker, others by name" {
  printf 'gateway\nai\nauth\nstudy-room\nai-chat\nfe\n' >"$KMAEDU_SERVICES_FILE"
  run needed_services
  assert_success
  assert_output "gateway-a ai ai-worker auth study-room ai-chat fe"
}

@test "every key of services.example is valid and all 12 are enabled" {
  SERVICES_FILE="$DEV_ROOT/services.example"
  run read_service_keys
  assert_success
  [ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" = 12 ]
}
