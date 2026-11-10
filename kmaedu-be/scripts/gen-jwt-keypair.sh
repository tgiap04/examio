#!/usr/bin/env bash
# Prints a fresh RS256 signing key as env lines (stdout only; nothing is written
# to disk):
#   JWT_KID=<sha256 of the public key, first 16 hex chars>
#   JWT_PRIVATE_KEY=<PKCS8 PEM on one line, newlines escaped as \n>
# The auth-service normalises the escaped newlines (apps/auth-service/src/token/keys.ts).
#
# Local/CI use only unless you are rotating production keys:
#   eval "$(scripts/gen-jwt-keypair.sh | sed 's/^/export /')"      # shell
#   scripts/gen-jwt-keypair.sh >> "$GITHUB_ENV"                    # GitHub Actions job
# Rotation: publish the OLD public key in JWT_RETIRED_PUBLIC_KEYS
#   (JSON [{"kid":"...","pem":"-----BEGIN PUBLIC KEY-----..."}]); see --public below.
#
#   --public   print the PUBLIC key PEM of the key read from $JWT_PRIVATE_KEY instead
#              (use it to build JWT_RETIRED_PUBLIC_KEYS before swapping keys).
set -euo pipefail

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

escape_newlines() { awk 'BEGIN { ORS = "" } { print (NR > 1 ? "\\n" : "") $0 }'; }

if [[ "${1:-}" == "--public" ]]; then
    : "${JWT_PRIVATE_KEY:?JWT_PRIVATE_KEY must be set}"
    printf '%b' "$JWT_PRIVATE_KEY" | openssl pkey -pubout
    exit 0
fi

pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
kid="$(printf '%s' "$pem" | openssl pkey -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -hex | awk '{print substr($NF, 1, 16)}')"

echo "JWT_KID=$kid"
printf 'JWT_PRIVATE_KEY=%s\n' "$(printf '%s\n' "$pem" | escape_newlines)"
