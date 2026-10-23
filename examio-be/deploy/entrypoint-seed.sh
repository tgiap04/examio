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
# and flags, and finally the exam (legacy) reference data.
# Each seed gets only its own service's URL, as that service's role.
# Contract with the seed scripts: `yarn run seed:dev:<svc>` reads DATABASE_URL.
for svc in auth finance admin exam; do
    var="$(printf '%s' "$svc" | tr '[:lower:]' '[:upper:]')_DATABASE_URL"
    url="$(printenv "$var" || true)"
    if [ -z "$url" ]; then
        echo "ERROR: $var is not set" >&2
        exit 1
    fi
    echo "==> Seeding $svc ($var=$(describe_secret "$url"))"
    DATABASE_URL="$url" yarn run "seed:dev:$svc"
done

echo "==> Seeds complete."
