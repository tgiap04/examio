#!/usr/bin/env bash
# Database per service, inside ONE Postgres database (phase 11).
#
# Runs once, by the postgres image entrypoint, on an EMPTY data directory only.
# Creates for every service schema <s>: role <s>_svc (LOGIN, own password from
# <S>_DB_PASSWORD), schema <s> owned by that role, and a role-level search_path
# "<s>, extensions". A role can use only its own schema: PUBLIC loses every
# privilege on the database and on `public`, so `content_svc` selecting from
# auth."User" fails with "permission denied".
#
# All ten schemas/roles exist from day one so later phases add Prisma
# schema files, never init SQL (the former `exam` schema was split into
# `content` and `assessment`). Passwords are passed to psql as variables, never
# spliced into SQL text, and are not echoed.
set -euo pipefail

SVCS="auth finance admin content assessment studyroom vocabulary aichat document ai"

# Fail fast, before creating anything, if any password is missing.
missing=""
for s in $SVCS; do
    pw_var="$(printf '%s' "$s" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
    if [ -z "${!pw_var:-}" ]; then
        missing="$missing $pw_var"
    fi
done
if [ -n "$missing" ]; then
    echo "postgres init: refusing to continue, these passwords are empty:$missing" >&2
    exit 1
fi

PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc -U "$POSTGRES_USER" -d "$POSTGRES_DB")

"${PSQL[@]}" -v db="$POSTGRES_DB" <<'SQL'
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
SQL

for s in $SVCS; do
    pw_var="$(printf '%s' "$s" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
    "${PSQL[@]}" -v db="$POSTGRES_DB" -v role="${s}_svc" -v schema="$s" -v pw="${!pw_var}" <<'SQL'
CREATE ROLE :"role" LOGIN PASSWORD :'pw' CONNECTION LIMIT 40;
GRANT CONNECT ON DATABASE :"db" TO :"role";
CREATE SCHEMA :"schema" AUTHORIZATION :"role";
ALTER ROLE :"role" SET search_path = :"schema", extensions;
SQL
done

echo "postgres init: created schemas and roles for: $SVCS"
