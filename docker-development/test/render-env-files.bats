#!/usr/bin/env bats
# compose.env + env/<name>.env from the deploy templates (the only source of key names).

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

render() { "$PROJECT" render; }

@test "every uncommented key of deploy/.env.example is in compose.env" {
  run render
  assert_success
  for k in $(template_keys "$KMAEDU_BE_DIR/deploy/.env.example"); do
    grep -q "^$k=" "$GEN/compose.env" || fail "$k missing from compose.env"
  done
  n_tpl="$(template_keys "$KMAEDU_BE_DIR/deploy/.env.example" | wc -l)"
  n_gen="$(grep -cE '^[A-Z][A-Z0-9_]*=' "$GEN/compose.env")"
  [ "$n_gen" -ge "$n_tpl" ]
}

@test "every env/<name>.env.example has a rendered env/<name>.env with all its keys" {
  render
  for tpl in "$KMAEDU_BE_DIR"/deploy/env/*.env.example; do
    name="$(basename "$tpl" .env.example)"
    [ -f "$GEN/env/$name.env" ] || fail "env/$name.env missing"
    for k in $(template_keys "$tpl"); do
      grep -q "^$k=" "$GEN/env/$name.env" || fail "$k missing from env/$name.env"
    done
  done
}

@test "every \${VAR:?} of deploy/compose/*.yml has a non-empty value" {
  render
  . "$DEV_ROOT/lib/common.sh"
  . "$DEV_ROOT/lib/dotenv-reader.sh"
  for k in $(grep -ohE '\$\{[A-Z][A-Z0-9_]*:\?' "$KMAEDU_BE_DIR"/deploy/compose/*.yml | sed -E 's/^\$\{//; s/:\?$//' | sort -u); do
    [ -n "$(dotenv_get "$GEN/compose.env" "$k")" ] || fail "$k is empty"
  done
}

@test "missing R2/Gemini/Google keys only warn: exit 0, warning names the features" {
  run render
  assert_success
  assert_output --partial "R2"
  assert_output --partial "GEMINI_API_KEYS"
  assert_output --partial "GOOGLE_CLIENT_ID"
  assert_output --partial "ADMIN_EMAILS"
}

@test "FRONTEND_URL and GOOGLE_CALLBACK_URL follow KMAEDU_WEB_PORT" {
  KMAEDU_WEB_PORT=5999 render
  grep -qx "FRONTEND_URL='http://localhost:5999'" "$GEN/compose.env"
  grep -qx "GOOGLE_CALLBACK_URL='http://localhost:5999/api/v1/auth/google/callback'" "$GEN/env/auth.env"
  grep -qx "KMAEDU_WEB_PORT='5999'" "$GEN/compose.env"
}

@test "R2_ALLOWED_HOSTS is derived from R2_ENDPOINT and the bucket's virtual host; an explicit value wins" {
  printf 'R2_ENDPOINT=https://abc123.r2.cloudflarestorage.com/\nR2_PUBLIC_URL=https://pub.example.com\nR2_ACCESS_KEY_ID=a\nR2_SECRET_ACCESS_KEY=b\nR2_BUCKET_NAME=c\n' >"$KMAEDU_DEV_ENV_FILE"
  run render
  assert_success
  refute_output --partial "R2 (uploads"
  # presigned GETs are virtual-hosted (<bucket>.<endpoint host>), so that host must be allowed too
  grep -qx "R2_ALLOWED_HOSTS='c.abc123.r2.cloudflarestorage.com,abc123.r2.cloudflarestorage.com'" "$GEN/compose.env"
  grep -qx "R2_PUBLIC_URL='https://pub.example.com'" "$GEN/env/r2.env"
  printf 'R2_ALLOWED_HOSTS=other.example.com\n' >>"$KMAEDU_DEV_ENV_FILE"
  render
  grep -qx "R2_ALLOWED_HOSTS='other.example.com'" "$GEN/compose.env"
}

@test "user values land where the services read them; no Turnstile key anywhere" {
  printf 'ADMIN_EMAILS=a@x.io,b@x.io\nGEMINI_API_KEYS=k1,k2\nGOOGLE_CLIENT_ID=gid\nADMIN_DEFAULT_PASSWORD=Local-Admin-Pass-123\n' >"$KMAEDU_DEV_ENV_FILE"
  render
  grep -qx "ADMIN_EMAILS='a@x.io,b@x.io'" "$GEN/env/auth.env"
  grep -qx "ADMIN_DEFAULT_PASSWORD='Local-Admin-Pass-123'" "$GEN/env/auth.env"
  grep -qx "GEMINI_API_KEYS='k1,k2'" "$GEN/env/ai.env"
  grep -qx "VITE_GOOGLE_CLIENT_ID='gid'" "$GEN/compose.env"
  run grep -rq TURNSTILE "$GEN/env" "$GEN/compose.env"
  assert_failure
  grep -qx "EMAIL_USER=''" "$GEN/env/auth.env"
}

@test "generated files are 600, the dir 700, empty.env exists and is empty" {
  render
  [ "$(stat -c %a "$GEN")" = 700 ]
  for f in "$GEN/compose.env" "$GEN/env/auth.env" "$GEN/compose.yaml"; do
    [ "$(stat -c %a "$f")" = 600 ] || fail "$f not 600"
  done
  [ -f "$GEN/empty.env" ] && [ ! -s "$GEN/empty.env" ]
  [ -d "$GEN/rabbitmq" ]
}

@test "a compose \${VAR:?} with no value dies and names the key" {
  copy_be
  sed -i 's/R2_TAG:-main/R2_TAG:-main}${BRAND_NEW_REQUIRED:?x/' "$BE_COPY/deploy/compose/r2.yml"
  run render
  assert_failure
  assert_output --partial "BRAND_NEW_REQUIRED"
}

@test "a template key without a rule renders empty with one warning" {
  copy_be
  printf 'SOME_NEW_KEY=x\n' >>"$BE_COPY/deploy/.env.example"
  printf 'SOME_NEW_KEY=y\n' >>"$BE_COPY/deploy/env/gateway.env.example"
  run render
  assert_success
  [ "$(printf '%s\n' "$output" | grep -c 'SOME_NEW_KEY')" = 1 ]
  grep -qx "SOME_NEW_KEY=''" "$GEN/compose.env"
}

@test "secret values never reach stdout/stderr" {
  run render
  pw="$(sed -n "s/^POSTGRES_PASSWORD='\(.*\)'$/\1/p" "$GEN/secrets.env")"
  [ -n "$pw" ]
  refute_output --partial "$pw"
}

@test "no GOOGLE_CLIENT_ID: auth gets a placeholder (passport refuses an empty clientID), the FE gets none" {
  : >"$KMAEDU_DEV_ENV_FILE"
  run render
  assert_success
  grep -qx "GOOGLE_CLIENT_ID='not-configured.apps.googleusercontent.com'" "$GEN/env/auth.env"
  grep -qx "VITE_GOOGLE_CLIENT_ID=''" "$GEN/compose.env"
}

@test "a render that dies half-way leaves no temp file (they hold secrets) in the generated dir" {
  # dies inside the rendering of compose.env (_overlay_vars), after every secret line was written
  KMAEDU_REPO_ROOT="$SANDBOX/re'po" KMAEDU_FE_DIR="$SANDBOX/fe" run render
  assert_failure
  assert_output --partial "KMAEDU_REPO_ROOT"
  run find "$GEN" -name '*.tmp.*'
  assert_output ''
}
