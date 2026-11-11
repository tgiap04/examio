# seed / db:reset. Only ever touches the dev project's own Postgres volume. bash 3.2 safe.
# shellcheck shell=bash

# seed: deploy's seed one-shot (profile seed) from source; compose runs the four migrate jobs first.
cmd_seed() {
  local emails pw_file
  check_prerequisites
  require_generated
  assert_project_owned
  log "Seeding dev data (auth -> admin -> ai-chat -> vocabulary)"
  dc --profile seed run --rm seed </dev/null || die "seed failed (./project logs auth-migrate admin-migrate)"
  emails="$(dotenv_get "$DEV_ENV_FILE" ADMIN_EMAILS)" || exit 1
  pw_file="$SECRETS_FILE"
  [ -z "$(dotenv_get "$DEV_ENV_FILE" ADMIN_DEFAULT_PASSWORD)" ] || pw_file="$DEV_ENV_FILE"
  log "Seeded. Admin accounts: ${emails:-none (set ADMIN_EMAILS in $DEV_ENV_FILE)}"
  printf '    password of admins and seeded dev users: key ADMIN_DEFAULT_PASSWORD in %s\n' "$pw_file"
}

# db:reset [-y]: drop the dev Postgres volume (Postgres re-creates the 9 roles/schemas on an empty
# volume, the migrate jobs run again). Redis and RabbitMQ keep their data.
cmd_db_reset() {
  local yes=0 arg ans running svc stop="" volume="${PROJECT_NAME}_postgres_data"
  for arg in "$@"; do
    case "$arg" in
      -y | --yes) yes=1 ;;
      *) usage_error "db:reset: unknown argument $arg (only -y)" ;;
    esac
  done
  check_prerequisites
  require_generated
  assert_project_owned
  if [ "$yes" != 1 ]; then
    [ -t 0 ] || die "db:reset deletes every local database: confirm in a terminal or pass -y"
    printf 'This deletes the Postgres volume %s (all local dev data). Continue? [y/N] ' "$volume" >&2
    ans=""
    read -r ans || true
    case "$ans" in y | Y | yes | YES) ;; *) die "aborted: $volume untouched" ;; esac
  fi
  # -a: a STOPPED container (postgres above all) still holds the volume
  running="$(dc ps -a --format '{{.Service}}' </dev/null)" || die "docker compose ps failed"
  for svc in $running; do
    case "$svc" in redis | rabbitmq | traefik) continue ;; esac
    stop="$stop $svc"
  done
  if [ -n "$stop" ]; then
    log "Removing:$stop"
    # shellcheck disable=SC2086  # word-split service names on purpose
    dc rm -s -f $stop </dev/null || die "could not remove$stop"
  fi
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    log "Deleting volume $volume"
    docker volume rm "$volume" >/dev/null || die "could not delete $volume (still in use?)"
  fi
  cmd_up
  log "Database reset. Create the dev accounts with: ./project seed"
}
