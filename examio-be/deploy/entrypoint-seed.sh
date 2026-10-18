#!/bin/sh
set -e

# Report presence only; never echo a secret's value into container logs.
describe_secret() {
    if [ -n "${1:-}" ]; then
        echo "<set>"
    else
        echo "<unset>"
    fi
}

echo "==> Running dev seed (idempotent)..."
echo "    DATABASE_URL=$(describe_secret "${DATABASE_URL:-}")"
echo "    ADMIN_EMAILS=${ADMIN_EMAILS:-<unset>}"
echo "    ADMIN_DEFAULT_PASSWORD=$(describe_secret "${ADMIN_DEFAULT_PASSWORD:-}")"

cd /app
yarn run seed:dev
