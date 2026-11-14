#!/usr/bin/env bats
# Host env files are hidden from EVERY container that mounts kmaedu-be (/workspace) or kmaedu-fe
# (/workspace-fe): masks are chosen by file existence only, contents are never read.

BE_SERVICES="deps seed auth auth-migrate admin admin-migrate content content-migrate assessment assessment-migrate
  study-room study-room-migrate vocabulary vocabulary-migrate document document-migrate ai-chat ai-chat-migrate
  r2 gateway-a gateway-b"
BE_FILES=".env .env.local deploy/.env apps/r2-service/.env apps/ai-service/.env apps/auth-service/.env
  apps/gateway-service/.env.development.local deploy/rabbitmq/definitions.json"
FE_FILES=".env .env.local .env.development .env.development.local .env.production.local"

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

# poison_tree: env files in a kmaedu-be copy and a fe dir (+ .env.example files that must stay visible).
poison_tree() {
  local f
  copy_be
  FE="$SANDBOX/fe"
  mkdir -p "$FE" "$BE_COPY/apps/r2-service" "$BE_COPY/apps/ai-service" "$BE_COPY/apps/auth-service" \
    "$BE_COPY/apps/gateway-service"
  for f in $BE_FILES apps/r2-service/.env.example; do printf 'X=POISON\n' >"$BE_COPY/$f"; done
  for f in $FE_FILES .env.example; do printf 'X=POISON\n' >"$FE/$f"; done
  export KMAEDU_FE_DIR="$FE"
}

# mask <service> <target>: "<source> <read_only>" of the mount on target (empty when none).
mask() { q ".services[\"$1\"].volumes[] | select(.target == \"$2\") | \"\(.source) \(.read_only)\""; }

@test "every kmaedu-be container masks every existing env file of the tree, not only its own" {
  poison_tree
  COMPOSE_PROFILES=seed config_json
  for s in $BE_SERVICES; do
    for f in $BE_FILES; do
      [ "$(mask "$s" "/workspace/$f")" = "$GEN/empty.env true" ] || fail "$s: $f not masked"
    done
    [ -z "$(mask "$s" /workspace/apps/r2-service/.env.example)" ] || fail "$s: .env.example masked"
  done
}

@test "deploy/env is covered by an empty tmpfs in every kmaedu-be container" {
  poison_tree
  COMPOSE_PROFILES=seed config_json
  for s in $BE_SERVICES; do
    [ "$(q ".services[\"$s\"].volumes[] | select(.target == \"/workspace/deploy/env\") | .type")" = tmpfs ] ||
      fail "$s: deploy/env visible"
  done
}

@test "fe masks .env, .env.local, .env.<mode> and .env.<mode>.local, never .env.example" {
  poison_tree
  config_json
  for f in $FE_FILES; do
    [ "$(mask fe "/workspace-fe/$f")" = "$GEN/empty.env true" ] || fail "fe: $f not masked"
  done
  [ -z "$(mask fe /workspace-fe/.env.example)" ]
  [ "$(q '[.services.fe.volumes[] | select(.target | startswith("/workspace/"))] | length')" = 0 ]
}

@test "ai containers mount no kmaedu-be root, so they get no masks" {
  poison_tree
  config_json
  for s in ai ai-worker ai-migrate; do
    [ "$(q "[.services[\"$s\"].volumes[] | select(.target | test(\"env\"))] | length")" = 0 ] || fail "$s"
  done
}

@test "an env file whose path compose cannot carry dies instead of rendering broken YAML" {
  poison_tree
  mkdir -p "$BE_COPY/apps/we\$ird-service"
  : >"$BE_COPY/apps/we\$ird-service/.env"
  run "$PROJECT" render
  assert_failure
  assert_output --partial "unsupported character"
}

@test "an unknown compose name is an error, not a silent empty mask set" {
  . "$DEV_ROOT/lib/common.sh"
  . "$DEV_ROOT/lib/render-host-env-masks.sh"
  run render_env_masks newsvc
  assert_failure
  assert_output --partial "newsvc"
  run render_env_masks infra ai
  assert_success
}
