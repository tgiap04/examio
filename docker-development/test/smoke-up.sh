#!/usr/bin/env bash
# Real smoke test (host Docker): `./project up` with services = gateway auth fe, then browser -> Traefik ->
# gateway -> auth -> Postgres, Vite + HMR websocket, admin UIs, seed + login, env masks, a second `up` that
# skips the deps job, and a clean teardown.
# Own compose project (KMAEDU_SMOKE_PROJECT, default kmaedu-dev-smoke), scratch generated dir, services
# file and .env, shifted ports: a developer's real kmaedu-dev stack and .generated/ are never touched, and a
# project that already has containers or volumes (other than a KEEP_MODULES leftover) is refused.
#   KMAEDU_SMOKE_KEEP=1          leave the stack running for debugging (prints how to remove it)
#   KMAEDU_SMOKE_KEEP_MODULES=1  keep the node_modules volumes (next run skips the full install)
# bash 3.2 safe. Needs docker, curl, jq, nc, git.
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(dirname "$SELF")"
cd "$SELF"

export KMAEDU_DEV_PROJECT="${KMAEDU_SMOKE_PROJECT:-kmaedu-dev-smoke}"
export KMAEDU_WEB_PORT="${KMAEDU_WEB_PORT:-15173}" KMAEDU_HTTP_PORT="${KMAEDU_HTTP_PORT:-18000}"
export KMAEDU_PG_PORT="${KMAEDU_PG_PORT:-15432}" KMAEDU_REDIS_PORT="${KMAEDU_REDIS_PORT:-16379}"
export KMAEDU_RABBITMQ_PORT="${KMAEDU_RABBITMQ_PORT:-15672}"
WEB="http://localhost:$KMAEDU_WEB_PORT"
API="http://localhost:$KMAEDU_HTTP_PORT"
P="$KMAEDU_DEV_PROJECT"
ADMIN=smoke-admin@kmaedu.local
TIMEOUT="${KMAEDU_SMOKE_TIMEOUT:-900}"
FAILED=0
# shellcheck source=test/helpers/smoke-lib.bash
. "$SELF/test/helpers/smoke-lib.bash"

for c in docker curl jq nc git; do command -v "$c" >/dev/null || { echo "error: $c not found" >&2; exit 1; }; done
# The cleanup deletes every volume of $P: refuse any project this run cannot prove is a smoke leftover.
OWNER="${P}_kmaedu-dev-owner"
refuse() { echo "error: compose project '$P' $* - pick another KMAEDU_SMOKE_PROJECT; nothing was changed" >&2; exit 1; }
[ "$P" != kmaedu-dev ] || refuse "is the default dev project"
project_volumes() { docker volume ls -q --filter "label=com.docker.compose.project=$P"; }
[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$P")" ] || refuse "already has containers"
VOLS="$(project_volumes)"
if [ -n "$VOLS" ]; then # only what KMAEDU_SMOKE_KEEP_MODULES=1 keeps: node_modules + the owner marker
  case " $(printf '%s' "$VOLS" | tr '\n' ' ') " in *" $OWNER "*) ;; *) refuse "has volumes without the docker-development marker" ;; esac
  for v in $VOLS; do case "$v" in "$OWNER" | *_node_modules) ;; *) refuse "already has volume $v" ;; esac; done
fi

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/kmaedu-smoke.XXXXXX")"
chmod 700 "$SCRATCH"
export KMAEDU_DEV_GEN_DIR="$SCRATCH/gen" KMAEDU_SERVICES_FILE="$SCRATCH/services" KMAEDU_DEV_ENV_FILE="$SCRATCH/.env"
printf 'gateway\nauth\nfe\n' >"$KMAEDU_SERVICES_FILE"
# only ADMIN_EMAILS: proves missing R2 / Gemini / Google keys do not block `up`
printf 'ADMIN_EMAILS=%s\n' "$ADMIN" >"$KMAEDU_DEV_ENV_FILE"
GIT_BASELINE="$(git -C "$REPO" status --porcelain -- kmaedu-be kmaedu-fe)"
# names only (never contents) of the host .env files: a bind mount must not create one
env_files() {
  local f
  for f in "$REPO"/kmaedu-be/.env* "$REPO"/kmaedu-be/deploy/.env* "$REPO"/kmaedu-be/apps/*/.env* "$REPO"/kmaedu-fe/.env*; do
    if [ -e "$f" ]; then printf '%s\n' "${f#"$REPO"/}"; fi
  done
}
ENV_BASELINE="$(env_files)"

dc() { docker compose -p "$P" -f "$KMAEDU_DEV_GEN_DIR/compose.yaml" --env-file "$KMAEDU_DEV_GEN_DIR/compose.env" "$@"; }
remove_volumes() {
  local v
  for v in $(project_volumes); do
    case "$v" in *_node_modules | "$OWNER") [ "${KMAEDU_SMOKE_KEEP_MODULES:-0}" = 1 ] && continue ;; esac
    docker volume rm "$v" >/dev/null 2>&1 || true
  done
}
cleanup() {
  if [ "${KMAEDU_SMOKE_KEEP:-0}" = 1 ]; then
    printf 'KEPT: project %s, generated dir %s\n  remove: docker compose -p %s down -v; rm -rf %s\n' "$P" "$SCRATCH" "$P" "$SCRATCH"
    return
  fi
  docker compose -p "$P" down --remove-orphans >/dev/null 2>&1 || true
  remove_volumes
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

T0="$(now)"
./project up
T_UP="$(($(now) - T0))"
wait_http "$WEB/api/v1/auth/me" 401 "gateway via Traefik" || exit 1
wait_http "$WEB/" 200 "Vite via Traefik" || exit 1
wait_healthy auth || exit 1
printf '      up returned after %ss, stack ready after %ss\n' "$T_UP" "$(($(now) - T0))"

# 1. what runs: infra + listed apps; deps and auth-migrate exited 0; nothing unlisted
states="$(dc ps -a --format '{{.Service}}={{.State}}:{{.ExitCode}}' | sort | tr '\n' ' ')"
for s in postgres redis rabbitmq traefik auth gateway-a fe; do
  case " $states" in *" $s=running:"*) pass "1 $s running" ;; *) fail "1 $s not running ($states)" ;; esac
done
for s in deps auth-migrate; do
  case " $states" in *" $s=exited:0 "*) pass "1 $s exited 0" ;; *) fail "1 $s did not exit 0 ($states)" ;; esac
done
for s in content r2 gateway-b ai ai-worker admin; do
  case " $states" in *" $s="*) fail "1 unlisted $s exists" ;; *) pass "1 unlisted $s absent" ;; esac
done

# 2. Vite through Traefik
hdr="$(curl -s -D - -o "$SCRATCH/index.html" --max-time 20 "$WEB/" || true)"
check "2 / is text/html" grep -qi '^content-type: text/html' <<<"$hdr"
check "2 / loads /@vite/client" grep -q '/@vite/client' "$SCRATCH/index.html"

# 3. /api/ reaches the gateway (its JSON error, not a Traefik 404/502)
body="$(curl -s --max-time 20 "$WEB/api/v1/auth/me" || true)"
expect_eq "3 /api/v1/auth/me without cookie: gateway JSON code" "$(printf '%s' "$body" | jq -r '.code // empty' 2>/dev/null | grep -c . || true)" 1

# 4-5. seed, login as the bootstrapped admin, /auth/me with the cookie
./project seed
pw="$(sed -n "s/^ADMIN_DEFAULT_PASSWORD=//p" "$KMAEDU_DEV_GEN_DIR/secrets.env" | tr -d "'\"")"
[ -n "$pw" ] || fail "4 ADMIN_DEFAULT_PASSWORD missing from the generated secrets"
jq -n --arg c "$ADMIN" --arg p "$pw" '{credential:$c,password:$p}' >"$SCRATCH/login.json"
pw=""
code="$(curl -s -o "$SCRATCH/login.out" -D "$SCRATCH/login.hdr" -w '%{http_code}' --max-time 30 -c "$SCRATCH/jar" \
  -H 'Content-Type: application/json' --data-binary "@$SCRATCH/login.json" "$WEB/api/v1/auth/login" || true)"
rm -f "$SCRATCH/login.json"
# Nest answers a POST with 201 unless the handler sets a code; login does not
case "$code" in 200 | 201) pass "4 POST /api/v1/auth/login ($code)" ;; *) fail "4 POST /api/v1/auth/login (got $code)" ;; esac
check "4 Set-Cookie accessToken HttpOnly" grep -qiE '^set-cookie: accessToken=[^;]+;.*httponly' "$SCRATCH/login.hdr"
code="$(curl -s -o "$SCRATCH/me.json" -w '%{http_code}' --max-time 20 -b "$SCRATCH/jar" "$WEB/api/v1/auth/me" || true)"
expect_eq "5 GET /api/v1/auth/me with the cookie" "$code" 200
expect_eq "5 user.isSystemAdmin" "$(jq -r '.user.isSystemAdmin' "$SCRATCH/me.json" 2>/dev/null || echo invalid)" true

# 6. HMR websocket handshake through Traefik (token from /@vite/client, as the browser does)
token="$(curl -s --max-time 20 "$WEB/@vite/client" | sed -nE 's/.*const wsToken = "([^"]*)".*/\1/p' | head -n1 || true)"
line="$(curl -s -i -N --max-time 5 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Protocol: vite-hmr' \
  "$WEB/?token=$token" 2>/dev/null | head -n1 | tr -d '\r' || true)"
expect_eq "6 HMR websocket upgrade" "$(printf '%s' "$line" | awk '{print $2}')" 101

# 7. admin UIs on the API port only
expect_eq "7 $API/_traefik/dashboard/" "$(http_code "$API/_traefik/dashboard/")" 200
expect_eq "7 $API/_rabbitmq/" "$(http_code "$API/_rabbitmq/")" 200
for p in /_traefik/dashboard/ /_rabbitmq/; do
  curl -s -o "$SCRATCH/web-admin" --max-time 20 "$WEB$p" || true
  if grep -q '/@vite/client' "$SCRATCH/web-admin" || [ "$(http_code "$WEB$p")" = 404 ]; then
    pass "7 browser port $p is Vite or 404 (no admin UI)"
  else fail "7 browser port $p exposes something else"; fi
done

# 8. API on the backend port
expect_eq "8 $API/api/v1/auth/me" "$(http_code "$API/api/v1/auth/me")" 401

# 9. infra ports for host tools
for port in "$KMAEDU_PG_PORT" "$KMAEDU_REDIS_PORT" "$KMAEDU_RABBITMQ_PORT"; do
  check "9 127.0.0.1:$port open" nc -z 127.0.0.1 "$port"
done

# 10. every host env file reads empty in the containers (file NAMES listed, never contents), deploy/env is
# empty; the database is the local postgres (host name only, never the URL)
nonempty='find /workspace -maxdepth 3 -path /workspace/node_modules -prune -o \( -name .env -o -name ".env.*" \) ! -name "*.example" -type f -size +0c -print'
for s in auth gateway-a; do
  expect_eq "10 $s: non-empty env files visible" "$(dc exec -T "$s" sh -c "$nonempty" | tr '\n' ' ')" ""
  expect_eq "10 $s: entries in deploy/env" "$(dc exec -T "$s" sh -c 'ls -A /workspace/deploy/env | wc -l' | tr -d ' ')" 0
done
expect_eq "10 fe: non-empty env files visible" \
  "$(dc exec -T fe sh -c 'find /workspace-fe -maxdepth 1 -name ".env*" ! -name "*.example" -type f -size +0c' | tr '\n' ' ')" ""
expect_eq "10 auth DATABASE_URL host" "$(dc exec -T auth node -e 'console.log(new URL(process.env.DATABASE_URL).hostname)')" postgres

# 11. nothing written into the tracked tree
expect_eq "11 git status kmaedu-be/deploy" "$(git -C "$REPO" status --porcelain -- kmaedu-be/deploy)" ""
expect_eq "11 git status kmaedu-be kmaedu-fe unchanged" "$(git -C "$REPO" status --porcelain -- kmaedu-be kmaedu-fe)" "$GIT_BASELINE"
expect_eq "11 host .env files unchanged (none created by a mount)" "$(env_files)" "$ENV_BASELINE"

# 13. a second `up`, nothing changed: deps skips install + proto:gen + prisma:generate, the stack stays up
T1="$(now)"
./project up >/dev/null
printf '      second up returned after %ss\n' "$(($(now) - T1))"
check "13 second up: deps skipped" grep -q skipped <<<"$(dc logs --no-log-prefix deps | tail -n 1)"
wait_http "$WEB/api/v1/auth/me" 401 "gateway after the second up" || true

printf '\nMemory (docker stats --no-stream):\n'
# shellcheck disable=SC2046  # one argument per container id
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' $(dc ps -q) || true

[ "${KMAEDU_SMOKE_KEEP:-0}" = 1 ] && { echo "smoke: checks done, stack kept"; exit "$FAILED"; }

# 12. down, then no container and (after the volume cleanup) no volume of the smoke project
./project down
expect_eq "12 containers after down" "$(docker ps -aq --filter "label=com.docker.compose.project=$P" | wc -l | tr -d ' ')" 0
remove_volumes
left="$(project_volumes | grep -v -e '_node_modules$' -e "^$OWNER\$" || true)"
[ "${KMAEDU_SMOKE_KEEP_MODULES:-0}" = 1 ] || left="$(project_volumes)"
expect_eq "12 volumes left" "${left:-none}" none

if [ "$FAILED" = 0 ]; then echo "smoke: OK (up ${T_UP}s, total $(($(now) - T0))s)"; else echo "smoke: FAILED" >&2; exit 1; fi
