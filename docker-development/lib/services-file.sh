# The services file: which apps run (from source). One key per line, # comments. bash 3.2 safe.
# shellcheck shell=bash

SERVICE_KEYS="gateway auth admin content assessment study-room vocabulary document ai-chat r2 ai fe"

# key_services <key>: compose services of a key (gateway runs one instance; ai is api + worker).
key_services() {
  case "$1" in
    gateway) printf '%s\n' gateway-a ;;
    ai) printf '%s\n' "ai ai-worker" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

is_service_key() { case " $SERVICE_KEYS " in *" $1 "*) return 0 ;; esac; return 1; }

# read_service_keys: valid, de-duplicated keys of $SERVICES_FILE in file order, one per line.
read_service_keys() {
  local line key seen=" "
  [ -f "$SERVICES_FILE" ] || die "services file not found: $SERVICES_FILE (copy services.example)"
  while IFS= read -r line || [ -n "$line" ]; do
    key="${line%%#*}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || continue
    is_service_key "$key" || die "unknown service '$key' in $SERVICES_FILE. Valid keys: $SERVICE_KEYS"
    case "$seen" in *" $key "*) continue ;; esac
    seen="$seen$key "
    printf '%s\n' "$key"
  done <"$SERVICES_FILE"
  [ "$seen" != " " ] || die "no service listed in $SERVICES_FILE (add at least one of: $SERVICE_KEYS)"
}

# needed_services: compose services of every listed key, space-separated.
needed_services() {
  local keys key out=""
  keys="$(read_service_keys)" || exit 1
  for key in $keys; do out="$out $(key_services "$key")"; done
  printf '%s\n' "${out# }"
}
