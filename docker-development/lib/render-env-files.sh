# compose.env (compose interpolation) and env/<name>.env (container env_file) in $GEN_DIR.
# Key NAMES come only from the committed templates (deploy/.env.example, deploy/env/*.env.example), the
# same single source CI uses (deploy/ci-dummy.env.sh); VALUES come from the rules below, secrets.env and
# docker-development/.env. deploy/.env and deploy/env/*.env (real secrets) are never opened. bash 3.2 safe.
# shellcheck shell=bash

# auth's passport Google strategy throws on an empty clientID and stops the service; with this value auth
# starts and only Google login fails (VITE_GOOGLE_CLIENT_ID stays empty).
GOOGLE_PLACEHOLDER_CLIENT_ID=not-configured.apps.googleusercontent.com
_WARNED_KEYS=" "

_user() { dotenv_get "$DEV_ENV_FILE" "$1"; }
_user_or() { local v; v="$(_user "$1")"; printf '%s\n' "${v:-$2}"; }

# _url_host <url>: host part (no scheme, credentials, port or path).
_url_host() {
  local h="${1#*://}"
  h="${h%%/*}"
  h="${h##*@}"
  printf '%s\n' "${h%%:*}"
}

# _resolve <key> <template>: sets VAL for one template key (see the table in phase-01 of the plan).
_resolve() {
  local key="$1" tpl="$2" v
  case "$key" in
    FRONTEND_URL) VAL="http://localhost:$WEB_PORT" ;;
    GOOGLE_CALLBACK_URL) VAL="http://localhost:$WEB_PORT/api/v1/auth/google/callback" ;;
    POSTGRES_USER | POSTGRES_DB | RABBITMQ_USER) VAL=kmaedu ;;
    SERVICE_CLIENTS) VAL="$(service_clients_json)" ;;
    JWT_RETIRED_PUBLIC_KEYS | EMAIL_USER | EMAIL_PASS) VAL="" ;;
    JWT_ISSUER | JWT_AUDIENCE) VAL="$(_user_or "$key" "$(dotenv_get "$tpl" "$key")")" ;;
    ADMIN_DEFAULT_PASSWORD) VAL="$(_user_or "$key" "$(secret_get "$key")")" ;;
    GOOGLE_CLIENT_ID) VAL="$(_user_or "$key" "$GOOGLE_PLACEHOLDER_CLIENT_ID")" ;;
    R2_ALLOWED_HOSTS)
      v="$(_user R2_ENDPOINT)"
      VAL="$(_user "$key")"
      [ -n "$VAL" ] || [ -z "$v" ] || VAL="$(_url_host "$v")" ;;
    POSTGRES_PASSWORD | *_DB_PASSWORD | REDIS_PASSWORD | RABBITMQ_PASS | RABBITMQ_*_PASS | JWT_KID | JWT_PRIVATE_KEY | \
      *_SERVICE_CLIENT_SECRET | REFRESH_TOKEN_ENC_KEY | QUIZ_JWT_SECRET | QUIZ_AES_KEY)
      VAL="$(secret_get "$key")" ;;
    R2_* | ADMIN_EMAILS | GOOGLE_CLIENT_SECRET | GEMINI_API_KEYS | GEMINI_MODEL_NAMES | AI2_API_KEY)
      VAL="$(_user "$key")" ;;
    *)
      VAL="$(_user "$key")"
      if [ -z "$VAL" ]; then
        case "$_WARNED_KEYS" in *" $key "*) ;; *)
          _WARNED_KEYS="$_WARNED_KEYS$key "
          warn "no rule for template key $key: rendered empty (set it in $DEV_ENV_FILE if a service needs it)" ;;
        esac
      fi ;;
  esac
}

# _env_line <key> <value>: single quotes = literal for compose (no $ interpolation, JSON safe).
# JWT_PRIVATE_KEY stays unquoted: a one-line PEM whose \n escapes auth normalises itself.
_env_line() {
  case "$2" in *"'"* | *$'\n'*) die "value of $1 holds a quote or a newline" ;; esac
  if [ "$1" = JWT_PRIVATE_KEY ]; then printf '%s=%s\n' "$1" "$2"; else printf "%s='%s'\n" "$1" "$2"; fi
}

# _render_template <template>: one line per uncommented KEY= of the template (stdout).
_render_template() {
  local key
  # shellcheck disable=SC2013  # keys are single words
  for key in $(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$1"); do
    _resolve "$key" "$1"
    _env_line "$key" "$VAL"
  done
}

# _overlay_vars: what docker-development/compose/*.yaml interpolates.
_overlay_vars() {
  _env_line KMAEDU_REPO_ROOT "$REPO_ROOT"
  _env_line KMAEDU_BE_DIR "$BE_DIR"
  _env_line KMAEDU_FE_DIR "$FE_DIR"
  _env_line KMAEDU_DEV_DIR "$SELF_DIR"
  _env_line KMAEDU_DEV_GEN_DIR "$GEN_DIR"
  _env_line KMAEDU_DEV_PROJECT "$PROJECT_NAME"
  _env_line KMAEDU_WEB_PORT "$WEB_PORT"
  _env_line KMAEDU_HTTP_PORT "$HTTP_PORT"
  _env_line KMAEDU_PG_PORT "$PG_PORT"
  _env_line KMAEDU_REDIS_PORT "$REDIS_PORT"
  _env_line KMAEDU_RABBITMQ_PORT "$RABBITMQ_PORT"
  _env_line KMAEDU_WATCH_POLL "$WATCH_POLL"
  _env_line VITE_GOOGLE_CLIENT_ID "$(_user GOOGLE_CLIENT_ID)"
  _env_line VITE_MEASUREMENT_ID "$(_user VITE_MEASUREMENT_ID)"
  _env_line VITE_GENAI_TUTOR_ALLOWED_EMAILS "$(_user VITE_GENAI_TUTOR_ALLOWED_EMAILS)"
}

# _write_rendered <dest> <fn> [args]: fn's stdout -> dest atomically. Runs fn in this shell (warnings, die)
# with errexit in force (no `||` around it); the temp file holds secrets, so any exit removes it.
_write_rendered() {
  local dest="$1" tmp="$1.tmp.$$"
  shift
  # shellcheck disable=SC2064  # expand now: $tmp is local and gone when the trap runs
  trap "rm -f '$tmp'" EXIT
  (umask 077 && : >"$tmp")
  "$@" >>"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$dest"
  trap - EXIT
}

# _check_required_compose_vars: every ${VAR:?} of deploy/compose/*.yml has a value in compose.env.
_check_required_compose_vars() {
  local parsed key missing=""
  parsed="$(_dotenv_parse "$GEN_DIR/compose.env")" || exit 1
  # shellcheck disable=SC2013  # keys are single words
  for key in $(grep -ohE '\$\{[A-Z][A-Z0-9_]*:\?' "$BE_DIR"/deploy/compose/*.yml | sed -E 's/^\$\{//; s/:\?$//' | sort -u); do
    # here-string, not a pipe: grep -q exiting early would SIGPIPE printf and, under pipefail, flag a present key
    grep -qE "^$key"$'\t'"." <<<"$parsed" || missing="$missing $key"
  done
  [ -z "$missing" ] || die "deploy/compose requires${missing} but no value was rendered (add a rule in lib/render-env-files.sh or a line in deploy/.env.example)"
}

# _warn_missing_user_keys: features that will fail because docker-development/.env lacks their keys.
_warn_missing_user_keys() {
  local k miss lines=""
  miss=""; for k in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_ENDPOINT R2_PUBLIC_URL; do [ -n "$(_user "$k")" ] || miss="$miss $k"; done
  [ -z "$miss" ] || lines="$lines    R2 (uploads, images, documents):$miss"$'\n'
  [ -n "$(_user GEMINI_API_KEYS)" ] || lines="$lines    AI (chat, generation, OCR, word families): GEMINI_API_KEYS"$'\n'
  miss=""; for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do [ -n "$(_user "$k")" ] || miss="$miss $k"; done
  [ -z "$miss" ] || lines="$lines    Google login:$miss"$'\n'
  [ -n "$(_user ADMIN_EMAILS)" ] || lines="$lines    admin bootstrap (no admin account): ADMIN_EMAILS"$'\n'
  [ -n "$lines" ] || return 0
  printf 'warning: %s lacks these keys; the stack starts, these features fail:\n%s' "$DEV_ENV_FILE" "$lines" >&2
}

render_env_files() {
  local tpl name
  ensure_gen_dir
  [ -f "$BE_DIR/deploy/.env.example" ] || die "template not found: $BE_DIR/deploy/.env.example"
  _dotenv_parse "$DEV_ENV_FILE" >/dev/null || exit 1
  _write_rendered "$GEN_DIR/compose.env" _compose_env_body
  for tpl in "$BE_DIR"/deploy/env/*.env.example; do
    [ -f "$tpl" ] || die "no env templates in $BE_DIR/deploy/env"
    name="$(basename "$tpl" .env.example)"
    _write_rendered "$GEN_DIR/env/$name.env" _render_template "$tpl"
  done
  [ -f "$GEN_DIR/empty.env" ] || _write_rendered "$GEN_DIR/empty.env" true
  _check_required_compose_vars
  _warn_missing_user_keys
}

_compose_env_body() {
  printf '# Generated by docker-development - do not edit (./project up rewrites it).\n'
  _render_template "$BE_DIR/deploy/.env.example"
  _overlay_vars
}
