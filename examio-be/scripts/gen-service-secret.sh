#!/usr/bin/env bash
# Usage: scripts/gen-service-secret.sh <service-name>
# Prints a random client secret for the service and the sha256 hex that goes
# into auth's SERVICE_CLIENTS JSON ({"<name>": "<sha256-hex>"}). Give the SECRET
# to that service only (SERVICE_CLIENT_SECRET); give the HASH to auth only.
# Rotation = new hash in SERVICE_CLIENTS + redeploy the caller with the new secret.
set -euo pipefail

name="${1:-}"
if [[ ! "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "usage: $0 <service-name>   (lowercase, e.g. exam, finance, admin)" >&2
    exit 1
fi

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

secret="$(openssl rand -hex 32)"
hash="$(printf '%s' "$secret" | openssl dgst -sha256 -hex | awk '{print $NF}')"

echo "SERVICE_NAME=$name"
echo "SERVICE_CLIENT_SECRET=$secret"
echo "SERVICE_CLIENTS_ENTRY=\"$name\": \"$hash\""
