#!/usr/bin/env bash
# CI only. Prints `::add-mask::` commands and `NAME=value` lines with a FRESH RS256
# key and service-client secrets generated in the job itself, so nothing key-like
# is ever committed. The workflow echoes the `::` lines (masking) and appends the
# rest to $GITHUB_ENV:
#   JWT_KID, JWT_PRIVATE_KEY      auth signing key (scripts/gen-jwt-keypair.sh)
#   SERVICE_CLIENTS               {"exam":"<sha256>","studyroom":"<sha256>","vocabulary":"<sha256>","document":"<sha256>","finance":"<sha256>","admin":"<sha256>"}
#   SERVICE_CLIENT_SECRET         one shared secret: boot/health checks never call auth
set -euo pipefail
cd "$(dirname "$0")"

keypair="$(./gen-jwt-keypair.sh)"
key_line="$(printf '%s\n' "$keypair" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
echo "::add-mask::${key_line}"

secret="$(openssl rand -hex 32)"
echo "::add-mask::${secret}"
hash="$(printf '%s' "$secret" | openssl dgst -sha256 -hex | awk '{print $NF}')"

printf '%s\n' "$keypair"
echo "SERVICE_CLIENT_SECRET=${secret}"
echo "SERVICE_CLIENTS={\"exam\":\"${hash}\",\"studyroom\":\"${hash}\",\"vocabulary\":\"${hash}\",\"document\":\"${hash}\",\"finance\":\"${hash}\",\"admin\":\"${hash}\"}"
