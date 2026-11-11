#!/bin/sh
# The `deps` one-shot (compose/dev-extras.yaml), run in kmaedu-dev-node:local with kmaedu-be at /workspace:
# yarn install + proto:gen + prisma:generate. proto:gen (buf `clean: true`) and prisma:generate rewrite
# generated code under the running Nest watchers, so a re-`up` skips all three when nothing they read
# changed since the last successful run: the node/yarn versions of the image, yarn.lock, .yarnrc.yml,
# package.json, proto/** and apps/*/prisma/schema*. The stamp lives in the node_modules volume (a new
# volume always installs); a missing generated output also forces a run. KMAEDU_DEPS_FORCE=1 forces it.
# POSIX sh (busybox ash in the image).
set -eu

cd "${KMAEDU_DEPS_WORKSPACE:-/workspace}"
STAMP=node_modules/.kmaedu-dev-deps-stamp

# inputs_hash: one sha256 over every input (paths included, so a rename or a new file counts).
inputs_hash() {
  {
    printf 'node %s yarn %s\n' "$(node --version)" "$(yarn --version)"
    for f in yarn.lock .yarnrc.yml package.json; do
      if [ -f "$f" ]; then sha256sum "$f"; fi
    done
    {
      if [ -d proto ]; then find proto -type f; fi
      for d in apps/*/prisma; do
        if [ -d "$d" ]; then find "$d" -path "$d/schema*" -type f; fi
      done
    } | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done
  } | sha256sum | cut -d' ' -f1
}

# outputs_present: the generated code a skip relies on is still in the (bind-mounted) tree.
outputs_present() {
  [ -d libs/contracts/src/generated ] || return 1
  for d in apps/*/prisma; do
    [ -d "$d" ] || continue
    [ -d "${d%/prisma}/src/generated/prisma" ] || return 1
  done
}

hash=""
if command -v sha256sum >/dev/null 2>&1; then hash="$(inputs_hash)" || hash=""; fi

if [ "${KMAEDU_DEPS_FORCE:-0}" != 1 ] && [ -n "$hash" ] && [ -f "$STAMP" ] &&
  [ "$(cat "$STAMP")" = "$hash" ] && outputs_present; then
  echo "deps: yarn.lock, proto and prisma schemas unchanged since the last run: skipped (KMAEDU_DEPS_FORCE=1 ./project up forces it)"
  exit 0
fi

# no valid stamp while a step runs: a failure retries everything next time
rm -f "$STAMP"
yarn install --immutable
yarn proto:gen
yarn prisma:generate
if [ -n "$hash" ]; then printf '%s\n' "$hash" >"$STAMP"; fi
echo "deps: installed and generated"
