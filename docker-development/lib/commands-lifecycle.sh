# up / down. bash 3.2 safe.
# up: prerequisites -> user files -> dev image -> secrets/volume check -> render -> infra (wait) -> apps.
# shellcheck shell=bash

# ensure_user_files: first run copies services.example / .env.example (gitignored copies).
ensure_user_files() {
  if [ ! -f "$SERVICES_FILE" ]; then
    cp "$SELF_DIR/services.example" "$SERVICES_FILE" || die "cannot create $SERVICES_FILE"
    log "Created $SERVICES_FILE from services.example (edit it to choose the apps)"
  fi
  if [ ! -f "$DEV_ENV_FILE" ]; then
    cp "$SELF_DIR/.env.example" "$DEV_ENV_FILE" || die "cannot create $DEV_ENV_FILE"
    log "Created $DEV_ENV_FILE from .env.example (add your R2 / Gemini / Google keys there)"
  fi
}

build_dev_image() {
  log "Building $DEV_NODE_IMAGE (cached after the first run)"
  docker build -q -t "$DEV_NODE_IMAGE" -f "$SELF_DIR/images/node-dev.Dockerfile" "$SELF_DIR/images" >/dev/null ||
    die "building $DEV_NODE_IMAGE failed (see the docker output above)"
}

# check_secret_volume_consistency: Postgres creates its roles only on an EMPTY volume. Lost secrets +
# an old volume = every service password wrong; only a reset of the dev volume recovers.
check_secret_volume_consistency() {
  secrets_exist && return 0
  if docker volume inspect "${PROJECT_NAME}_postgres_data" >/dev/null 2>&1; then
    die "$SECRETS_FILE is missing but the Postgres volume ${PROJECT_NAME}_postgres_data exists: its roles use the old passwords. Run ./project db:reset (drops local dev data) to start clean."
  fi
}

# ensure_yarn_cache: the external yarn cache volume of deps and fe. A new one is seeded from the host's
# yarn cache (KMAEDU_HOST_YARN_CACHE, default ~/.yarn/berry/cache; read-only, public packages only) so the
# first install does not download every package again. Seeding is best effort.
ensure_yarn_cache() {
  local host="${KMAEDU_HOST_YARN_CACHE-$HOME/.yarn/berry/cache}"
  docker volume inspect "$YARN_CACHE_VOLUME" >/dev/null 2>&1 && return 0
  docker volume create "$YARN_CACHE_VOLUME" >/dev/null || die "cannot create the docker volume $YARN_CACHE_VOLUME"
  [ -n "$host" ] && [ -d "$host" ] || return 0
  check_path_chars "$host"
  log "Seeding the yarn cache volume $YARN_CACHE_VOLUME from $host (once)"
  docker run --rm -v "$host:/src:ro" -v "$YARN_CACHE_VOLUME:/dst" "$DEV_NODE_IMAGE" cp -R /src/. /dst/ </dev/null ||
    warn "copying $host into $YARN_CACHE_VOLUME failed: the deps job downloads the packages instead"
}

# stop_unneeded <needed...>: remove running app containers the services file no longer lists. Defined
# services are not orphans, so --remove-orphans misses them. Infra, deps and migrate jobs stay.
stop_unneeded() {
  local svc stale=""
  for svc in $(dc ps --format '{{.Service}}' </dev/null); do
    case " $INFRA_SERVICES rabbitmq-defs deps $* " in *" $svc "*) continue ;; esac
    case "$svc" in *-migrate) continue ;; esac
    stale="$stale $svc"
  done
  [ -n "$stale" ] || return 0
  log "Removing apps no longer in $SERVICES_FILE:$stale"
  # shellcheck disable=SC2086  # word-split service names on purpose
  dc rm -s -f $stale
}

cmd_up() {
  local needed
  check_prerequisites
  assert_project_owned
  ensure_user_files
  needed="$(needed_services)" || exit 1
  build_dev_image
  check_secret_volume_consistency
  ensure_yarn_cache
  ensure_owner_marker
  render_all
  log "Starting infra (project $PROJECT_NAME): $INFRA_SERVICES"
  # shellcheck disable=SC2086
  dc up -d --wait --remove-orphans $INFRA_SERVICES || die "infra did not become healthy (./project logs postgres rabbitmq)"
  # shellcheck disable=SC2086
  stop_unneeded $needed
  log "Starting apps: $needed"
  log "The first run installs node_modules in the deps job (several minutes): ./project logs deps"
  # shellcheck disable=SC2086
  dc up -d $needed || die "starting the apps failed (./project ps, ./project logs <name>)"
  print_urls
}

# down: containers and networks go, volumes stay (`./project db:reset` drops the Postgres one).
cmd_down() {
  check_prerequisites
  assert_project_owned
  if [ -f "$GEN_DIR/compose.yaml" ] && dc config -q >/dev/null 2>&1; then
    dc down --remove-orphans
  else
    warn "generated compose missing or not loadable - stopping project '$PROJECT_NAME' by name"
    docker compose -p "$PROJECT_NAME" down --remove-orphans
  fi
}

print_urls() {
  log "Ready (apps keep starting in the background: ./project ps, ./project logs <name>):"
  printf '    %-44s %s\n' "http://localhost:$WEB_PORT" "web app (Vite, /api/ and /ws/ same origin)"
  printf '    %-44s %s\n' "http://localhost:$HTTP_PORT/api/v1" "API (gateway)"
  printf '    %-44s %s\n' "http://localhost:$HTTP_PORT/_traefik/dashboard/" "Traefik dashboard"
  printf '    %-44s %s\n' "http://localhost:$HTTP_PORT/_rabbitmq/" "RabbitMQ management (user kmaedu, password: RABBITMQ_PASS)"
  printf '    %-44s %s\n' "postgres 127.0.0.1:$PG_PORT" "superuser kmaedu (POSTGRES_PASSWORD), db kmaedu"
  printf '    %-44s %s\n' "redis 127.0.0.1:$REDIS_PORT" "password: REDIS_PASSWORD"
  printf '    %-44s %s\n' "amqp 127.0.0.1:$RABBITMQ_PORT" "per-service users (RABBITMQ_<SVC>_PASS)"
  printf '    passwords: %s\n' "$SECRETS_FILE"
}
