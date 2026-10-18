#!/bin/sh
set -e

SCHEMA="libs/database/src/schema.prisma"

echo "==> Applying database migrations..."
npx prisma migrate deploy --schema=$SCHEMA

echo "==> Migration complete."
