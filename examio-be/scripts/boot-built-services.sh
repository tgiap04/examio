#!/usr/bin/env bash
# Boots every built service from dist (as the Docker image does) and requires
# /health/live to answer. Catches runtime-only breakage that typecheck/jest miss
# (missing proto assets, bad client registration, unresolved externals).
# Needs `yarn build:all` first and the infra env (DATABASE_URL, REDIS_*, RABBITMQ_URL,
# JWT_SECRET, REFRESH_TOKEN_ENC_KEY). Services run one at a time on the same ports.
set -uo pipefail
cd "$(dirname "$0")/.."

SERVICES="${SERVICES:-auth exam finance admin r2 gateway}"
GRPC_SERVICES="${GRPC_SERVICES:-auth finance r2}"
export PORT="${PORT:-3000}"
export GRPC_PORT="${GRPC_PORT:-50051}"
failed=0

for svc in ${SERVICES}; do
    log="$(mktemp)"
    node "dist/apps/${svc}-service/main.js" >"${log}" 2>&1 &
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
