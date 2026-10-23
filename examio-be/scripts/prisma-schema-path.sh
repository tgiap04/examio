#!/bin/sh
# Prints the Prisma schema path of a service: a single file, or the multi-file
# folder (exam). Usage: scripts/prisma-schema-path.sh <auth|finance|admin|exam>
# POSIX sh: it also runs in the node:alpine build images (no bash there).
set -eu
svc="${1:?service required (auth|finance|admin|exam)}"
root="$(cd "$(dirname "$0")/.." && pwd)"
base="apps/${svc}-service/prisma"
if [ -f "$root/$base/schema.prisma" ]; then
    echo "$base/schema.prisma"
elif [ -d "$root/$base/schema" ]; then
    echo "$base/schema"
else
    echo "no Prisma schema for service '$svc' ($base)" >&2
    exit 1
fi
