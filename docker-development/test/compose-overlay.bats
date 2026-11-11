#!/usr/bin/env bats
# Dev overlays: invariants of the merged stack, checked with the real `docker compose config` (no daemon).

NODE_APPS="auth admin content assessment study-room vocabulary document ai-chat r2 gateway-a gateway-b"

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

@test "compose config succeeds with the generated env" {
  config_json
  [ "$(q '.services | length')" -ge 25 ]
}

@test "container env comes from the generated env files; deploy env files are never referenced" {
  config_json
  # `config` folds env_file into environment: a secrets.env value proves the generated file was read
  want="$(sed -n "s/^REFRESH_TOKEN_ENC_KEY='\(.*\)'$/\1/p" "$GEN/secrets.env")"
  [ -n "$want" ] && [ "$(q '.services.auth.environment.REFRESH_TOKEN_ENC_KEY')" = "$want" ]
  [ "$(q '.services.content.environment.TURNSTILE_SECRET_KEY')" = 1x0000000000000000000000000000000AA ]
  [ "$(q '.services.ai.environment | has("GEMINI_API_KEYS")')" = true ]
  run grep -E '/deploy/env/|/deploy/\.env' "$CFG"
  assert_failure
  # every deploy env_file is replaced by a generated one in the overlays
  for f in "$KMAEDU_BE_DIR"/deploy/compose/*.yml; do
    n="$(grep -c 'path: env/' "$f" || true)"
    o="$(grep -c 'path: ${KMAEDU_DEV_GEN_DIR}/env/' "$DEV_ROOT/compose/$(basename "$f" .yml).dev.yaml" || true)"
    [ "$o" -ge "$n" ] || fail "$(basename "$f"): $n deploy env_file(s), $o overridden" # gateway: one anchor, two services
  done
}

@test "no container_name; only infra and traefik publish ports, all on 127.0.0.1" {
  config_json
  [ "$(q '[.services[] | select(has("container_name"))] | length')" = 0 ]
  [ "$(q '[.services | to_entries[] | select(.value.ports) | .key] | sort | join(" ")')" = "postgres rabbitmq redis traefik" ]
  [ "$(q '[.services[] | .ports // [] | .[] | select(.host_ip != "127.0.0.1")] | length')" = 0 ]
  [ "$(q '.services.traefik.ports | map("\(.published)>\(.target)") | sort | join(" ")')" = "5173>5173 8000>80" ]
}

@test "networks are not internal and carry the project prefix" {
  KMAEDU_DEV_PROJECT=kmaedu-dev-x config_json
  [ "$(q '[.networks[] | select(.internal == true)] | length')" = 0 ]
  [ "$(q '[.networks[] | .name] | sort | join(" ")')" = "kmaedu-dev-x-edge kmaedu-dev-x-egress kmaedu-dev-x-internal" ]
}

@test "rabbitmq-defs reads deploy/rabbitmq read-only and writes only into the generated dir" {
  config_json
  run q '.services["rabbitmq-defs"].volumes[] | select(.source | test("/deploy/rabbitmq")) | .read_only'
  assert_output true
  [ "$(q '[.services["rabbitmq-defs"].volumes[] | select(.read_only != true) | .source] | join(" ")')" = "$GEN/rabbitmq" ]
  run q '.services.rabbitmq.volumes[] | select(.source | test("/deploy/rabbitmq/definitions.json"))'
  assert_output ''
}

@test "app depends_on holds only deps, migrate jobs and infra" {
  config_json
  run q '.services | to_entries[] | select(.key | test("^(postgres|redis|rabbitmq|rabbitmq-defs|traefik|deps)$|-migrate$") | not)
    | .key as $s | (.value.depends_on // {} | keys[]) | select(test("^(deps|postgres|redis|rabbitmq|ai-migrate)$|-migrate$") | not) | "\($s) -> \(.)"'
  assert_output ''
}

@test "Node apps: dev image, yarn dev:<svc>, development env" {
  config_json
  for s in $NODE_APPS; do
    key="${s%-[ab]}"
    [ "$(q ".services[\"$s\"].image")" = kmaedu-dev-node:local ] || fail "$s image"
    [ "$(q ".services[\"$s\"].build // \"none\"")" = none ] || fail "$s still builds"
    [ "$(q ".services[\"$s\"].command | join(\" \")")" = "yarn dev:$key" ] || fail "$s command"
    [ "$(q ".services[\"$s\"].environment.NODE_ENV")" = development ] || fail "$s NODE_ENV"
    [ "$(q ".services[\"$s\"].environment.MAIL_TRANSPORT")" = json ] || fail "$s MAIL_TRANSPORT"
  done
}

@test "migrate jobs run prisma:deploy from source after deps" {
  config_json
  for s in auth admin content assessment study-room vocabulary document ai-chat; do
    [ "$(q ".services[\"$s-migrate\"].image")" = kmaedu-dev-node:local ] || fail "$s-migrate image"
    q ".services[\"$s-migrate\"].command | join(\" \")" | grep -q "yarn prisma:deploy $s" || fail "$s-migrate command"
    [ "$(q ".services[\"$s-migrate\"].depends_on | keys | sort | join(\" \")")" = "deps postgres" ] || fail "$s-migrate deps"
  done
}

@test "ai services: dev ai image, source mounted, env from the generated ai.env" {
  config_json
  for s in ai ai-worker ai-migrate; do
    [ "$(q ".services[\"$s\"].image")" = kmaedu-dev-ai:local ] || fail "$s image"
    q ".services[\"$s\"].volumes[] | .target" | grep -qx /app/src || fail "$s src mount"
  done
  [ "$(q '.services.ai.depends_on | has("auth")')" = false ]
}

@test "auth gets a one-line PEM and SERVICE_CLIENTS as JSON with 8 clients" {
  config_json
  pem="$(q '.services.auth.environment.JWT_PRIVATE_KEY')"
  case "$pem" in '-----BEGIN PRIVATE KEY-----\n'*) ;; *) fail "PEM mangled" ;; esac
  [ "$(q '.services.auth.environment.SERVICE_CLIENTS | fromjson | length')" = 8 ]
  [ "$(q '.services.auth.environment.EMAIL_USER')" = "" ]
}

@test "traefik, fe and deps come from dev-extras; gateway-a answers as gateway" {
  config_json
  for s in traefik fe deps; do [ "$(q ".services | has(\"$s\")")" = true ] || fail "$s missing"; done
  [ "$(q '.services["gateway-a"].networks.internal.aliases | join(" ")')" = gateway ]
  [ "$(q '.services.fe.environment.VITE_API_URL')" = /api/v1 ]
}

@test "poisoned deploy/.env and deploy/env/*.env never reach the merged stack" {
  copy_be
  sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1=POISON_\1/p' "$BE_COPY/deploy/.env.example" >"$BE_COPY/deploy/.env"
  printf 'NODE_ENV=POISON_NODE_ENV\nKMAEDU_DEV_GEN_DIR=POISON_GEN\n' >>"$BE_COPY/deploy/.env"
  for tpl in "$BE_COPY"/deploy/env/*.env.example; do
    { sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1=POISON_\1/p' "$tpl"; echo "POISON_MARKER=POISON"; } >"${tpl%.example}"
  done
  config_json
  run grep -c POISON "$CFG"
  assert_output 0
}

@test "deps and fe keep the yarn cache in the shared external volume kmaedu-dev-yarn-cache" {
  config_json
  for s in deps fe; do
    [ "$(q ".services[\"$s\"].volumes[] | select(.target == \"/root/.yarn/berry/cache\") | .source")" = yarn_cache ] ||
      fail "$s has no yarn cache mount"
  done
  [ "$(q '.volumes.yarn_cache.name')" = kmaedu-dev-yarn-cache ]
  [ "$(q '.volumes.yarn_cache.external')" = true ]
}

@test "every EXISTING host .env is covered by the read-only empty.env; a missing one gets no mount" {
  copy_be
  mkdir -p "$BE_COPY/apps/auth-service" "$BE_COPY/apps/gateway-service" "$SANDBOX/fe"
  : >"$BE_COPY/.env"
  : >"$BE_COPY/apps/auth-service/.env"
  : >"$SANDBOX/fe/.env"
  COMPOSE_PROFILES=seed KMAEDU_FE_DIR="$SANDBOX/fe" config_json
  mask() { q ".services[\"$1\"].volumes[] | select(.target == \"$2\") | \"\(.source) \(.read_only)\""; }
  for s in auth auth-migrate seed; do
    [ "$(mask "$s" /workspace/apps/auth-service/.env)" = "$GEN/empty.env true" ] || fail "$s: auth .env not masked"
  done
  for s in auth auth-migrate content content-migrate gateway-a gateway-b r2 seed deps; do
    [ "$(mask "$s" /workspace/.env)" = "$GEN/empty.env true" ] || fail "$s: kmaedu-be/.env not masked"
  done
  [ "$(mask fe /workspace-fe/.env)" = "$GEN/empty.env true" ]
  # no mount for a file that does not exist: Docker would create it (empty, root-owned on Linux) in the host tree
  [ "$(q '[.services[] | .volumes // [] | .[] | select(.target | test("/apps/(content|gateway|admin)-service/\\.env$"))] | length')" = 0 ]
}

@test "no host .env at all: no .env mount anywhere" {
  copy_be
  COMPOSE_PROFILES=seed KMAEDU_FE_DIR="$SANDBOX/fe" config_json
  [ "$(q '[.services[] | .volumes // [] | .[] | select(.target | endswith("/.env"))] | length')" = 0 ]
}
