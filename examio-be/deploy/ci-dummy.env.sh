#!/usr/bin/env bash
# Dummy values for every variable the deploy templates declare, so `docker compose config` (CI) and the
# cutover rehearsal render the stack without real secrets. One source: the committed templates.
#   bash ci-dummy.env.sh                 print deploy/.env content (every uncommented KEY= of .env.example)
#   bash ci-dummy.env.sh --service-envs  write deploy/env/<name>.env from each env/<name>.env.example
#                                        (files that already exist are kept)
# A compose `${VAR:?}` that is missing from .env.example makes `docker compose config` fail, and a
# service variable missing from its env example never reaches the container: keep the templates complete.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dummy="ci-dummy"

# KEY=value lines (not comments) -> KEY=ci-dummy; URL-safe, so it also fits DB/broker URLs.
fill() { sed -nE "s/^([A-Z][A-Z0-9_]*)=.*/\\1=${dummy}/p" "$1"; }

case "${1:-}" in
    "")
        fill "$here/.env.example"
        ;;
    --service-envs)
        for example in "$here"/env/*.env.example; do
            target="${example%.example}"
            [ -f "$target" ] || fill "$example" >"$target"
        done
        ;;
    *)
        echo "usage: ci-dummy.env.sh [--service-envs]" >&2
        exit 64
        ;;
esac
