# ps / logs / sh: look at the running dev stack. Names are services keys (gateway, ai, ...) or compose
# service names (postgres, auth-migrate, gateway-b, ...). bash 3.2 safe.
# shellcheck shell=bash

# name_services <name>: compose services of a services key, else the name itself (compose rejects unknown ones).
name_services() {
  [[ "$1" =~ ^[a-z][a-z0-9-]*$ ]] || die "invalid service name '$1'"
  if is_service_key "$1"; then key_services "$1"; else printf '%s\n' "$1"; fi
}

cmd_ps() {
  local states
  check_prerequisites
  require_generated
  states="$(dc ps -a --format '{{.Service}}|{{.State}}|{{.Status}}' </dev/null)" || die "docker compose ps failed"
  printf '%-22s %-10s %s\n' SERVICE STATE STATUS
  [ -z "$states" ] || printf '%s\n' "$states" | sort | awk -F'|' '{ printf "%-22s %-10s %s\n", $1, $2, $3 }'
  print_urls
}

# logs [flags] [name...]: follow the last 100 lines (everything when no name is given).
cmd_logs() {
  local arg svcs
  local -a args=()
  check_prerequisites
  require_generated
  for arg in "$@"; do
    case "$arg" in
      -*) args+=("$arg") ;;
      *) svcs="$(name_services "$arg")" || exit 1
        # shellcheck disable=SC2206  # word-split service names on purpose
        args+=($svcs) ;;
    esac
  done
  dc logs -f --tail=100 ${args[@]+"${args[@]}"}
}

# sh <name>: interactive shell (bash when the image has it, else sh) in the first container of the name.
cmd_sh() {
  [ "$#" -ge 1 ] || usage_error "sh needs a service name"
  local svcs
  check_prerequisites
  require_generated
  assert_project_owned
  svcs="$(name_services "$1")" || exit 1
  dc exec "${svcs%% *}" sh -c 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'
}
