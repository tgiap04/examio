# Host prerequisite checks. Each failure: one-line cause + fix (bash 3.2 safe).
# shellcheck shell=bash

check_docker_cli() {
  have_cmd docker || die "docker CLI not found. Install Docker Desktop or Docker Engine: https://docs.docker.com/get-docker/"
}

check_compose_version() {
  local raw
  raw="$(docker compose version --short 2>/dev/null)" ||
    die "'docker compose' plugin not found. Install Docker Compose v2 (>= $MIN_COMPOSE_VERSION): https://docs.docker.com/compose/install/"
  version_ge "$raw" "$MIN_COMPOSE_VERSION" ||
    die "Docker Compose >= $MIN_COMPOSE_VERSION required (found $raw; the overlays use !reset/!override). Upgrade Docker Desktop / the compose plugin."
}

check_docker_daemon() {
  docker info >/dev/null 2>&1 ||
    die "Docker daemon is not reachable. Start Docker Desktop (macOS) or 'sudo systemctl start docker' (Linux)."
}

check_prerequisites() {
  check_port_knobs
  check_docker_cli
  check_compose_version
  check_docker_daemon
}

# require_generated: inspect commands work on the files of the last `up`.
require_generated() {
  if [ ! -f "$GEN_DIR/compose.yaml" ] || [ ! -f "$GEN_DIR/compose.env" ]; then
    die "no generated stack in $GEN_DIR - run ./project up first"
  fi
}
