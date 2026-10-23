#!/usr/bin/env bash
# Boots every built service from dist (as the Docker image does) and requires
# /health/live to answer. Catches runtime-only breakage that typecheck/jest miss
# (missing proto assets, bad client registration, unresolved externals).
# Needs `yarn build:all` first and the infra env (DATABASE_URL, REDIS_*, RABBITMQ_URL,
# JWT_SECRET, REFRESH_TOKEN_ENC_KEY). Services run one at a time on the same ports.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

# COMPOSE_DEFAULTS=1 boots with the feature flags deploy/docker-compose.yml turns on
# (auth -> gateway control plane, api+worker roles). Their code paths load extra
# protos/clients that a flag-off boot never touches.
if [[ "${COMPOSE_DEFAULTS:-0}" == "1" ]]; then
    export GATEWAY_CONTROL_ENABLED="${GATEWAY_CONTROL_ENABLED:-true}"
    export GATEWAY_GRPC_URL="${GATEWAY_GRPC_URL:-127.0.0.1:50051}"
    export ROLE="${ROLE:-api,worker}"
fi
# BOOT_CWD: run from a directory without service .env files (default: the repo root).
BOOT_CWD="${BOOT_CWD:-$ROOT}"

SERVICES="${SERVICES:-auth exam finance admin r2 gateway}"
GRPC_SERVICES="${GRPC_SERVICES:-auth finance r2 gateway}"
export PORT="${PORT:-3000}"
export GRPC_PORT="${GRPC_PORT:-50051}"
failed=0

for svc in ${SERVICES}; do
    log="$(mktemp)"
    # Database per service: <SVC>_DATABASE_URL (when set) is that service's own URL.
    url_var="$(echo "${svc}" | tr 'a-z' 'A-Z')_DATABASE_URL"
    svc_db_url="${!url_var:-${DATABASE_URL:-}}"
    (cd "${BOOT_CWD}" && DATABASE_URL="${svc_db_url}" exec node "${ROOT}/dist/apps/${svc}-service/main.js") >"${log}" 2>&1 &
    pid=$!
    http=0
    for _ in $(seq 1 60); do
        kill -0 "${pid}" 2>/dev/null || break
        if curl -fsS "http://127.0.0.1:${PORT}/health/live" >/dev/null 2>&1; then http=1; break; fi
        sleep 1
    done

    grpc="n/a"
    if [[ " ${GRPC_SERVICES} " == *" ${svc} "* ]]; then
        grpc="down"
        if (exec 3<>"/dev/tcp/127.0.0.1/${GRPC_PORT}") 2>/dev/null; then grpc="up"; fi
    fi

    kill "${pid}" 2>/dev/null
    wait "${pid}" 2>/dev/null

    if [[ "${http}" == 1 && "${grpc}" != "down" ]]; then
        echo "ok   ${svc}-service (http ${PORT}, grpc ${grpc})"
    else
        echo "FAIL ${svc}-service (http=${http}, grpc=${grpc}); last log lines:"
        tail -n 25 "${log}"
        failed=1
    fi
    rm -f "${log}"
done

exit "${failed}"
