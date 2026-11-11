#!/usr/bin/env bats
# Local secrets: generated once, never overwritten, mode 600.

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
  # shellcheck source=../lib/common.sh
  . "$DEV_ROOT/lib/common.sh"
  # shellcheck source=../lib/dotenv-reader.sh
  . "$DEV_ROOT/lib/dotenv-reader.sh"
  # shellcheck source=../lib/local-secrets.sh
  . "$DEV_ROOT/lib/local-secrets.sh"
  S="$GEN/secrets.env"
}

sha() { sha256sum "$1" | cut -d' ' -f1; }

@test "every secret is generated, file 600 in a 700 dir" {
  run secrets_exist
  assert_failure
  run ensure_secrets
  assert_success
  for k in POSTGRES_PASSWORD AUTH_DB_PASSWORD ADMIN_DB_PASSWORD CONTENT_DB_PASSWORD ASSESSMENT_DB_PASSWORD \
    STUDYROOM_DB_PASSWORD VOCABULARY_DB_PASSWORD AICHAT_DB_PASSWORD DOCUMENT_DB_PASSWORD AI_DB_PASSWORD REDIS_PASSWORD \
    RABBITMQ_PASS RABBITMQ_AUTH_PASS RABBITMQ_CONTENT_PASS RABBITMQ_ASSESSMENT_PASS RABBITMQ_STUDYROOM_PASS \
    RABBITMQ_DOCUMENT_PASS RABBITMQ_AI_PASS RABBITMQ_GATEWAY_PASS RABBITMQ_AICHAT_PASS JWT_KID JWT_PRIVATE_KEY \
    REFRESH_TOKEN_ENC_KEY QUIZ_JWT_SECRET QUIZ_AES_KEY ADMIN_DEFAULT_PASSWORD \
    CONTENT_SERVICE_CLIENT_SECRET ASSESSMENT_SERVICE_CLIENT_SECRET STUDYROOM_SERVICE_CLIENT_SECRET \
    VOCABULARY_SERVICE_CLIENT_SECRET DOCUMENT_SERVICE_CLIENT_SECRET AICHAT_SERVICE_CLIENT_SECRET \
    ADMIN_SERVICE_CLIENT_SECRET GATEWAY_SERVICE_CLIENT_SECRET; do
    v="$(dotenv_get "$S" "$k")"
    [ -n "$v" ] || fail "$k is empty"
  done
  [ "$(stat -c %a "$S")" = 600 ]
  [ "$(stat -c %a "$GEN")" = 700 ]
  run secrets_exist
  assert_success
}

@test "secret values are never printed" {
  run ensure_secrets
  assert_success
  pw="$(dotenv_get "$S" POSTGRES_PASSWORD)"
  refute_output --partial "$pw"
}

@test "a second run changes nothing" {
  ensure_secrets
  before="$(sha "$S")"
  ensure_secrets
  [ "$(sha "$S")" = "$before" ]
}

@test "only a missing key is added; the others keep their values" {
  ensure_secrets
  pg="$(dotenv_get "$S" POSTGRES_PASSWORD)"
  kid="$(dotenv_get "$S" JWT_KID)"
  grep -v '^REDIS_PASSWORD=' "$S" >"$S.tmp" && mv "$S.tmp" "$S"
  ensure_secrets
  [ -n "$(dotenv_get "$S" REDIS_PASSWORD)" ]
  [ "$(dotenv_get "$S" POSTGRES_PASSWORD)" = "$pg" ]
  [ "$(dotenv_get "$S" JWT_KID)" = "$kid" ]
  [ "$(grep -c '^REDIS_PASSWORD=' "$S")" = 1 ]
}

@test "QUIZ_AES_KEY is 32 characters, ADMIN_DEFAULT_PASSWORD at least 24, JWT key is a one-line PEM" {
  ensure_secrets
  aes="$(dotenv_get "$S" QUIZ_AES_KEY)"; [ "${#aes}" = 32 ]
  adm="$(dotenv_get "$S" ADMIN_DEFAULT_PASSWORD)"; [ "${#adm}" -ge 24 ]
  ref="$(dotenv_get "$S" REFRESH_TOKEN_ENC_KEY)"; [ "${#ref}" -ge 32 ]
  pem="$(dotenv_get "$S" JWT_PRIVATE_KEY)"
  case "$pem" in '-----BEGIN PRIVATE KEY-----\n'*'\n-----END PRIVATE KEY-----') ;; *) fail "bad PEM shape" ;; esac
  [ "$(grep -c '^JWT_PRIVATE_KEY=' "$S")" = 1 ]
}

@test "SERVICE_CLIENTS is valid JSON with exactly the 8 clients, each hash = sha256(secret)" {
  ensure_secrets
  json="$(service_clients_json)"
  names="$(printf '%s' "$json" | jq -r 'keys | sort | join(" ")')"
  [ "$names" = "admin ai-chat assessment content document gateway studyroom vocabulary" ]
  for pair in CONTENT:content ASSESSMENT:assessment STUDYROOM:studyroom VOCABULARY:vocabulary DOCUMENT:document \
    AICHAT:ai-chat ADMIN:admin GATEWAY:gateway; do
    secret="$(dotenv_get "$S" "${pair%%:*}_SERVICE_CLIENT_SECRET")"
    want="$(printf '%s' "$secret" | sha256sum | cut -d' ' -f1)"
    got="$(printf '%s' "$json" | jq -r --arg n "${pair#*:}" '.[$n]')"
    [ "$got" = "$want" ] || fail "${pair#*:}: hash mismatch"
  done
}

@test "default runner: one docker run of the dev image with the scripts mounted read-only" {
  unset KMAEDU_DEV_TOOL_RUNNER
  run ensure_secrets
  assert_success
  run grep -c '^docker run ' "$SHIM_LOG"
  assert_output 1
  run grep '^docker run ' "$SHIM_LOG"
  assert_output --partial "$KMAEDU_BE_DIR/scripts:/s:ro"
  assert_output --partial "kmaedu-dev-node:local"
}

@test "a failing runner dies and writes nothing" {
  unset KMAEDU_DEV_TOOL_RUNNER
  export FAKE_RUN_FAIL=1
  run ensure_secrets
  assert_failure
  assert_output --partial "secret generation failed"
  [ ! -e "$S" ]
}
