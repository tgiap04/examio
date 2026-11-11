# Local dev secrets in $GEN_DIR/secrets.env (mode 600): generated once, only missing keys are added,
# an existing value is never rewritten. Values come from kmaedu-be/scripts/gen-jwt-keypair.sh,
# gen-service-secret.sh and `openssl rand -hex`, run in ONE container of the dev image (no openssl
# needed on the host). KMAEDU_DEV_TOOL_RUNNER=local runs them on the host instead (tests). bash 3.2 safe.
# shellcheck shell=bash

HEX24_SECRETS="POSTGRES_PASSWORD AUTH_DB_PASSWORD ADMIN_DB_PASSWORD CONTENT_DB_PASSWORD ASSESSMENT_DB_PASSWORD
STUDYROOM_DB_PASSWORD VOCABULARY_DB_PASSWORD AICHAT_DB_PASSWORD DOCUMENT_DB_PASSWORD AI_DB_PASSWORD REDIS_PASSWORD
RABBITMQ_PASS RABBITMQ_AUTH_PASS RABBITMQ_CONTENT_PASS RABBITMQ_ASSESSMENT_PASS RABBITMQ_STUDYROOM_PASS
RABBITMQ_DOCUMENT_PASS RABBITMQ_AI_PASS RABBITMQ_GATEWAY_PASS RABBITMQ_AICHAT_PASS"
HEX32_SECRETS="REFRESH_TOKEN_ENC_KEY QUIZ_JWT_SECRET"
# 16 bytes -> 32 hex chars: QUIZ_AES_KEY must be exactly 32 characters.
HEX16_SECRETS="QUIZ_AES_KEY ADMIN_DEFAULT_PASSWORD"
# <VAR prefix>:<client name in auth SERVICE_CLIENTS>
SERVICE_CLIENTS_MAP="CONTENT:content ASSESSMENT:assessment STUDYROOM:studyroom VOCABULARY:vocabulary
DOCUMENT:document AICHAT:ai-chat ADMIN:admin GATEWAY:gateway"

secrets_exist() { [ -s "$SECRETS_FILE" ]; }

secret_get() { dotenv_get "$SECRETS_FILE" "$1"; }

# _has <key>: the key has a non-empty value in secrets.env.
_has() { [ -n "$(secret_get "$1")" ]; }

# _secret_script: a bash script printing KEY=VALUE for every missing key. $S = scripts dir.
# JWT_KID/JWT_PRIVATE_KEY and each client's secret/hash are pairs: generated (and dropped) together.
# shellcheck disable=SC2016  # the $ belongs to the generated script, not to this shell
_secret_script() {
  local k pair
  printf 'set -eu\nhex() { openssl rand -hex "$1"; }\n'
  for k in $HEX24_SECRETS; do _has "$k" || printf 'echo "%s=$(hex 24)"\n' "$k"; done
  for k in $HEX32_SECRETS; do _has "$k" || printf 'echo "%s=$(hex 32)"\n' "$k"; done
  for k in $HEX16_SECRETS; do _has "$k" || printf 'echo "%s=$(hex 16)"\n' "$k"; done
  if ! _has JWT_KID || ! _has JWT_PRIVATE_KEY; then printf 'bash "$S/gen-jwt-keypair.sh"\n'; fi
  for pair in $SERVICE_CLIENTS_MAP; do
    if ! _has "${pair%%:*}_SERVICE_CLIENT_SECRET" || ! _has "${pair%%:*}_SERVICE_CLIENT_HASH"; then
      # gen-service-secret.sh prints SERVICE_CLIENT_SECRET=<s> and SERVICE_CLIENTS_ENTRY="<name>": "<sha256>"
      printf 'o="$(bash "$S/gen-service-secret.sh" %s)"\n' "${pair#*:}"
      printf 'printf "%%s\\n" "$o" | sed -n "s/^SERVICE_CLIENT_SECRET=/%s_SERVICE_CLIENT_SECRET=/p"\n' "${pair%%:*}"
      printf 'printf "%%s\\n" "$o" | sed -n "s/^SERVICE_CLIENTS_ENTRY=.*: \\"\\([0-9a-f]*\\)\\"$/%s_SERVICE_CLIENT_HASH=\\1/p"\n' "${pair%%:*}"
    fi
  done
}

# _run_secret_script: stdin script -> stdout, in the dev image (default) or on the host.
_run_secret_script() {
  if [ "${KMAEDU_DEV_TOOL_RUNNER:-docker}" = local ]; then
    S="$BE_DIR/scripts" bash -s
  else
    docker run --rm -i --network none -e S=/s -v "$BE_DIR/scripts:/s:ro" --entrypoint bash "$DEV_NODE_IMAGE" -s
  fi
}

# _drop_keys <key...>: remove half-present pairs before they are regenerated.
_drop_keys() {
  local k pattern=""
  [ -f "$SECRETS_FILE" ] || return 0
  for k in "$@"; do pattern="$pattern|^$k="; done
  grep -vE "${pattern#|}" "$SECRETS_FILE" | write_file_atomic "$SECRETS_FILE" || true
}

ensure_secrets() {
  local script out line key val pair
  ensure_gen_dir
  check_path_chars "$BE_DIR"
  script="$(_secret_script)" || exit 1
  [ "$(printf '%s\n' "$script" | wc -l | tr -d ' ')" -gt 2 ] || return 0
  out="$(printf '%s\n' "$script" | _run_secret_script)" || die "secret generation failed (scripts in $BE_DIR/scripts)"
  if ! _has JWT_KID || ! _has JWT_PRIVATE_KEY; then _drop_keys JWT_KID JWT_PRIVATE_KEY; fi
  for pair in $SERVICE_CLIENTS_MAP; do
    if ! _has "${pair%%:*}_SERVICE_CLIENT_SECRET" || ! _has "${pair%%:*}_SERVICE_CLIENT_HASH"; then
      _drop_keys "${pair%%:*}_SERVICE_CLIENT_SECRET" "${pair%%:*}_SERVICE_CLIENT_HASH"
    fi
  done
  {
    [ ! -f "$SECRETS_FILE" ] || cat "$SECRETS_FILE"
    while IFS= read -r line; do
      [[ "$line" =~ ^[A-Z][A-Z0-9_]*=. ]] || continue
      key="${line%%=*}" val="${line#*=}"
      case "$val" in *"'"*) die "generated $key holds a quote" ;; esac
      printf "%s='%s'\n" "$key" "$val"
    done <<<"$out"
  } | write_file_atomic "$SECRETS_FILE" || die "cannot write $SECRETS_FILE"
  _verify_secrets
  log "Local secrets: $SECRETS_FILE"
}

# _verify_secrets: every expected key is now present (a script failure must not go unnoticed).
_verify_secrets() {
  local k pair missing=""
  for k in $HEX24_SECRETS $HEX32_SECRETS $HEX16_SECRETS JWT_KID JWT_PRIVATE_KEY; do _has "$k" || missing="$missing $k"; done
  for pair in $SERVICE_CLIENTS_MAP; do
    _has "${pair%%:*}_SERVICE_CLIENT_SECRET" || missing="$missing ${pair%%:*}_SERVICE_CLIENT_SECRET"
    _has "${pair%%:*}_SERVICE_CLIENT_HASH" || missing="$missing ${pair%%:*}_SERVICE_CLIENT_HASH"
  done
  [ -z "$missing" ] || die "secret generation incomplete, missing:$missing"
}

# service_clients_json: auth's SERVICE_CLIENTS ({"<name>":"<sha256 of the caller's secret>"}).
service_clients_json() {
  local pair out=""
  for pair in $SERVICE_CLIENTS_MAP; do
    out="$out,\"${pair#*:}\":\"$(secret_get "${pair%%:*}_SERVICE_CLIENT_HASH")\""
  done
  printf '{%s}\n' "${out#,}"
}
