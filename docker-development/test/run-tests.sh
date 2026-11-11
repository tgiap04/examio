#!/usr/bin/env bash
# Run shellcheck + bats inside a bash 3.2 container.
# Usage: ./test/run-tests.sh [bats args...]   (default: every test/*.bats)
# The container sees STAGED read-only copies, never the live trees: docker-development/ without its
# gitignored files (the user's .env with real R2/Gemini keys, services, .generated/ with local secrets) and
# the git-tracked files of kmaedu-be/deploy and kmaedu-be/scripts (no deploy/.env, deploy/env/*.env).
set -euo pipefail

DEV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(dirname "$DEV")"
IMAGE="${KMAEDU_TEST_IMAGE:-kmaedu-docker-development-test:local}"

command -v docker >/dev/null 2>&1 || { echo "error: docker CLI not found" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "error: git not found" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "error: Docker daemon not reachable" >&2; exit 1; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/kmaedu-dev-test.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
(
  cd "$ROOT"
  # tracked + untracked-but-not-ignored: docker-development/ may not be committed yet
  { git ls-files -z kmaedu-be/deploy kmaedu-be/scripts
    git ls-files -z --cached --others --exclude-standard docker-development; } | while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    mkdir -p "$STAGE/$(dirname "$f")"
    cp -p "$f" "$STAGE/$f"
  done
)

docker build -q -t "$IMAGE" -f "$DEV/test/Dockerfile" "$DEV/test" >/dev/null

if [ "$#" -eq 0 ]; then
  set -- /repo/docker-development/test
fi

docker run --rm \
  -v "$STAGE/docker-development":/repo/docker-development:ro \
  -v "$STAGE/kmaedu-be":/repo/kmaedu-be:ro \
  -e TERM="${TERM:-dumb}" \
  "$IMAGE" \
  bash -c '
    set -e
    cd /repo/docker-development
    echo "shellcheck (bash 3.2 container)..."
    shellcheck -s bash -x project lib/*.sh test/*.sh test/helpers/*.bash
    shellcheck -s sh images/*.sh
    echo "bats..."
    bats --print-output-on-failure "$@"
  ' _ "$@"
