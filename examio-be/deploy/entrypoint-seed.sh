#!/bin/sh
set -e

echo "==> Running dev seed (idempotent)..."
echo "    DATABASE_URL=${DATABASE_URL}"
echo "    ADMIN_EMAILS=${ADMIN_EMAILS:-<unset>}"
echo "    ADMIN_DEFAULT_PASSWORD=${ADMIN_DEFAULT_PASSWORD:+<set>}${ADMIN_DEFAULT_PASSWORD:-<unset>}"

cd /app
yarn run seed:dev
