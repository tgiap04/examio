#!/usr/bin/env bash
# Which services must be rebuilt and redeployed for a diff?
#   scripts/changed-services.sh <base> <head>
# prints {"wave1":[...],"wave2":[...]} (compact JSON, one line, ready for $GITHUB_OUTPUT).
#
# Inputs
#   <base> <head>     git revs; head defaults to HEAD. An empty, all-zero or unknown base means
#                     "everything" (first push, force-push, shallow clone).
#   FORCE_ALL=1       everything, whatever the diff says.
#   CHANGED_FILES     newline-separated paths (repo-root or examio-be relative) used instead of
#                     `git diff --name-only`; lets the tests run without git.
#
# Rules (deploy/services.json is the service list):
#   apps/<dir>/**                                    -> that service
#   libs/**, package.json, yarn.lock, tsconfig*.json,
#   nest-cli.json, .yarnrc.yml, proto/buf*.yaml,
#   deploy/Dockerfile.node, deploy/docker-entrypoint.sh,
#   deploy/webpack.service.js                        -> every Node service
#   proto/examio/<x>/**                              -> the server of x, in wave 1
#   proto/examio/{common,events}/**                  -> every Node service + ai
#   deploy/compose/<key>.yml, deploy/env/<env>.env.example -> that service
# Wave 1 = servers of a changed proto package (new RPCs exist before any caller ships);
# wave 2 = every other changed service. Inside a wave: auth first (it serves the JWKS and service tokens every
# other service fetches at boot), then alphabetical, gateway last. A service
# is never in both waves. Anything else (docs, workflows, FE) selects nothing.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
base="${1:-}"
head="${2:-HEAD}"
force_all="${FORCE_ALL:-}"
files=""
use_all=""

if [ "$force_all" = "1" ]; then
    use_all=1
elif [ -n "${CHANGED_FILES+x}" ]; then
    files="$CHANGED_FILES"
elif [ -z "$base" ] || [[ "$base" =~ ^0+$ ]] \
    || ! git -C "$here" rev-parse --verify --quiet "${base}^{commit}" >/dev/null \
    || ! git -C "$here" rev-parse --verify --quiet "${head}^{commit}" >/dev/null; then
    use_all=1
else
    # Two-dot on purpose: deploy.yml hands over the exact before..sha push range.
    files="$(git -C "$here" diff --name-only "$base" "$head")"
fi

command -v node >/dev/null 2>&1 || { echo "changed-services.sh: node is required" >&2; exit 2; }

SERVICES_JSON="${SERVICES_JSON:-$here/../deploy/services.json}" \
USE_ALL="$use_all" CHANGED_LIST="$files" node - <<'NODE'
const fs = require('node:fs');

const catalog = JSON.parse(fs.readFileSync(process.env.SERVICES_JSON, 'utf8'));
const entries = [];
for (const [lang, group] of Object.entries(catalog)) {
    for (const [key, svc] of Object.entries(group)) {
        entries.push({ key, lang, dir: svc.dir, proto: svc.proto ?? key, env: svc.env ?? key });
    }
}
const nodeKeys = entries.filter((e) => e.lang === 'node').map((e) => e.key);
const allKeys = entries.map((e) => e.key);

const files = process.env.CHANGED_LIST.split('\n')
    .map((f) => f.trim().replace(/^examio-be\//, ''))
    .filter((f) => f !== '');

const changed = new Set();
const protoServers = new Set();
const addKeys = (keys) => keys.forEach((k) => changed.add(k));
const addWhere = (pick) => addKeys(entries.filter(pick).map((e) => e.key));

if (process.env.USE_ALL === '1') {
    addKeys(allKeys);
} else {
    const sharedNode = /^(libs\/|package\.json$|yarn\.lock$|tsconfig[^/]*$|nest-cli\.json$|\.yarnrc\.yml$|proto\/buf[^/]*\.yaml$|deploy\/(Dockerfile\.node|docker-entrypoint\.sh|webpack\.service\.js)$)/;
    for (const f of files) {
        let m;
        if ((m = f.match(/^apps\/([^/]+)\//))) {
            addWhere((e) => e.dir === m[1]);
        } else if (sharedNode.test(f)) {
            addKeys(nodeKeys);
        } else if ((m = f.match(/^proto\/examio\/([^/]+)\//))) {
            if (m[1] === 'common' || m[1] === 'events') {
                addKeys(allKeys);
            } else {
                const servers = entries.filter((e) => e.proto === m[1]).map((e) => e.key);
                addKeys(servers);
                servers.forEach((k) => protoServers.add(k));
            }
        } else if ((m = f.match(/^deploy\/compose\/([^/]+)\.yml$/))) {
            addWhere((e) => e.key === m[1]);
        } else if ((m = f.match(/^deploy\/env\/([^/]+)\.env\.example$/))) {
            addWhere((e) => e.env === m[1]);
        }
    }
}

// auth first, then alphabetical, gateway last.
const rank = (k) => (k === 'auth' ? -1 : k === 'gateway' ? 1 : 0);
const order = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
const wave1 = [...changed].filter((k) => protoServers.has(k)).sort(order);
const wave2 = [...changed].filter((k) => !protoServers.has(k)).sort(order);
process.stdout.write(`${JSON.stringify({ wave1, wave2 })}\n`);
NODE
