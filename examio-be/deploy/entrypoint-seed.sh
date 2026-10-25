#!/bin/sh
set -e

# Report presence only; never echo a secret's value (or a URL carrying one) into
# container logs.
describe_secret() {
    if [ -n "${1:-}" ]; then
        echo "<set>"
    else
        echo "<unset>"
    fi
}

echo "==> Running per-service dev seeds (idempotent)..."
echo "    ADMIN_EMAILS=${ADMIN_EMAILS:-<unset>}"
echo "    ADMIN_DEFAULT_PASSWORD=$(describe_secret "${ADMIN_DEFAULT_PASSWORD:-}")"

cd /app

# Order matters: auth users first, then finance wallets/payments, admin audit
# and flags, then the ai-chat subjects (AI teachers), and finally the vocabulary categories.
# Each seed gets only its own service's URL, as that service's role.
# Contract with the seed scripts: `yarn run seed:dev:<name>` reads DATABASE_URL. Entries are
# `<script name>:<role/schema name>` (the ai-chat app's role and schema are called aichat).
for entry in auth:auth finance:finance admin:admin ai-chat:aichat vocabulary:vocabulary; do
    svc="${entry%%:*}"
    var="$(printf '%s' "${entry##*:}" | tr '[:lower:]' '[:upper:]')_DATABASE_URL"
    url="$(printenv "$var" || true)"
    if [ -z "$url" ]; then
        echo "ERROR: $var is not set" >&2
        exit 1
    fi
    echo "==> Seeding $svc ($var=$(describe_secret "$url"))"
    DATABASE_URL="$url" yarn run "seed:dev:$svc"
done

echo "==> Seeds complete."
