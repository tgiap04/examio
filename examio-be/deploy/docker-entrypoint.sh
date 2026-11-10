#!/bin/sh
# Entrypoint of deploy/Dockerfile.node. ROLE picks what the container does:
#   api | worker | api,worker  start the service (the app parses ROLE itself)
#   migrate                    prisma migrate deploy, then exit
#   seed                       run the service seed(s); SEED_PROFILE=prod (default) | dev
# Never runs `db push` or `migrate resolve`: a failed migration needs a human.
set -eu

die() {
    echo "ERROR: $*" >&2
    exit 64
}

# Presence only; a secret (or a URL carrying one) never goes into container logs.
describe_secret() {
    if [ -n "${1:-}" ]; then echo "<set>"; else echo "<unset>"; fi
}

role="${ROLE:-api}"
svc="${SERVICE:?SERVICE is not set in the image (build arg SERVICE)}"

run_migrate() {
    dir="apps/${svc}/prisma"
    if [ -d "$dir/schema" ]; then
        schema="$dir/schema"
    elif [ -f "$dir/schema.prisma" ]; then
        schema="$dir/schema.prisma"
    else
        die "ROLE=migrate: $svc has no Prisma schema ($dir)"
    fi
    [ -n "${DATABASE_URL:-}" ] || die "ROLE=migrate: DATABASE_URL is not set"
    echo "==> Applying ${svc} migrations..."
    ./node_modules/.bin/prisma migrate deploy --schema "$schema"
    echo "==> ${svc} migration complete."
}

run_seed() {
    profile="${SEED_PROFILE:-prod}"
    case "$profile" in
        # prod: reference data only (admin page flags, word-family categories, ai-chat subjects)
        prod) flag=""; seeds="admin-service ai-chat-service vocabulary-service" ;;
        # dev: users, wallets and sample rows on top; auth before finance (wallets need users)
        dev) flag="--dev"; seeds="auth-service finance-service admin-service ai-chat-service vocabulary-service" ;;
        *) die "ROLE=seed: SEED_PROFILE must be prod or dev (got '$profile')" ;;
    esac
    ran=0
    for dir in $seeds; do
        [ -f "apps/$dir/prisma/seed.ts" ] || continue
        # <NAME>_DATABASE_URL (the role/schema name: ai-chat -> AICHAT), else DATABASE_URL.
        var="$(printf '%s' "${dir%-service}" | tr -d '-' | tr '[:lower:]' '[:upper:]')_DATABASE_URL"
        url="$(printenv "$var" || true)"
        [ -n "$url" ] || url="${DATABASE_URL:-}"
        [ -n "$url" ] || die "ROLE=seed: neither $var nor DATABASE_URL is set"
        echo "==> Seeding $dir (profile=$profile, $var=$(describe_secret "$url"))"
        DATABASE_URL="$url" /opt/seed-tools/node_modules/.bin/ts-node --transpile-only "apps/$dir/prisma/seed.ts" $flag
        ran=$((ran + 1))
    done
    [ "$ran" -gt 0 ] || die "ROLE=seed: no seed for $svc in profile $profile"
    echo "==> Seeds complete."
}

case "$role" in
    migrate) run_migrate ;;
    seed) run_seed ;;
    *)
        for r in $(printf '%s' "$role" | tr ',' ' '); do
            case "$r" in
                api | worker) ;;
                *) die "unknown ROLE '$role' (expected api, worker, api,worker, migrate or seed)" ;;
            esac
        done
        exec node "dist/apps/${svc}/main"
        ;;
esac
