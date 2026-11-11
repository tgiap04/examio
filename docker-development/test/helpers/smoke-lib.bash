# Helpers of test/smoke-up.sh (sourced): result lines, HTTP polling, health polling. Uses $TIMEOUT, dc
# and FAILED from the caller. bash 3.2 safe.
# shellcheck shell=bash
# shellcheck disable=SC2034  # FAILED is read by smoke-up.sh

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; FAILED=1; }
expect_eq() { if [ "$2" = "$3" ]; then pass "$1 ($2)"; else fail "$1 (got '$2', want '$3')"; fi; }
check() { local label="$1"; shift; if "$@"; then pass "$label"; else fail "$label"; fi; }
now() { date +%s; }
# http_code <curl args...>: status code only ("000" when unreachable)
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" || true; }
# wait_http <url> <code> <label>: poll every 2 s up to $TIMEOUT
wait_http() {
  local start code
  start="$(now)"
  while :; do
    code="$(http_code "$1")"
    [ "$code" = "$2" ] && { printf '      %s ready after %ss\n' "$3" "$(($(now) - start))"; return 0; }
    [ $(($(now) - start)) -lt "$TIMEOUT" ] || { fail "$3: $1 still $code after ${TIMEOUT}s"; return 1; }
    sleep 2
  done
}
wait_healthy() { # wait_healthy <service>
  local start id st
  start="$(now)"
  while :; do
    id="$(dc ps -q "$1" 2>/dev/null || true)"
    st="$( [ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo none)"
    [ "$st" = healthy ] && { printf '      %s healthy after %ss\n' "$1" "$(($(now) - start))"; return 0; }
    [ $(($(now) - start)) -lt "$TIMEOUT" ] || { fail "$1 not healthy after ${TIMEOUT}s (state $st)"; return 1; }
    sleep 2
  done
}
