#!/bin/sh
# Generates every service's Prisma client (apps/<svc>-service/src/generated/prisma).
# `generate` never touches a database; DATABASE_URL only has to parse.
# POSIX sh: it also runs in the node:alpine build images (no bash there).
set -eu
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgresql://generate:generate@127.0.0.1:5432/generate}"
for dir in apps/*-service/prisma; do
    [ -e "$dir/schema.prisma" ] || [ -d "$dir/schema" ] || continue
    svc="$(basename "$(dirname "$dir")")"
    svc="${svc%-service}"
    node_modules/.bin/prisma generate --schema "$(scripts/prisma-schema-path.sh "$svc")"
done
