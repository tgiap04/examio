#!/bin/sh
set -e

SCHEMA="libs/database/src/schema.prisma"
MIGRATIONS_DIR="libs/database/src/migrations"

echo "==> Enabling required PostgreSQL extensions..."
npx prisma db execute --schema=$SCHEMA --stdin <<'SQL'
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "==> Pushing schema to database..."
npx prisma db push --schema=$SCHEMA --accept-data-loss=false --skip-generate

echo "==> Resolving existing migrations..."
if [ -d "$MIGRATIONS_DIR" ]; then
    for dir in "$MIGRATIONS_DIR"/*/; do
        migration_name=$(basename "$dir")
        echo "    Marking as applied: $migration_name"
        npx prisma migrate resolve --schema=$SCHEMA --applied "$migration_name" 2>/dev/null || true
    done
fi

echo "==> Migration complete."
