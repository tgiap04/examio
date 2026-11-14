#!/usr/bin/env bash
# Fixture tests for changed-services.sh (no git needed: CHANGED_FILES feeds the file list).
#   bash scripts/changed-services.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/changed-services.sh"
fail=0

ALL_NODE='"auth","admin","ai-chat","assessment","content","document","r2","study-room","vocabulary","gateway"'
ALL='"auth","admin","ai","ai-chat","assessment","content","document","r2","study-room","vocabulary","gateway"'

# expect <name> <expected json> <newline-separated files> [VAR=value ...]
expect() {
    local name="$1" want="$2" files="$3"
    shift 3
    local got
    got="$(env "$@" CHANGED_FILES="$files" bash "$script" base head)"
    if [ "$got" = "$want" ]; then
        echo "ok   - $name"
    else
        echo "FAIL - $name"
        echo "  want: $want"
        echo "  got:  $got"
        fail=1
    fi
}

expect "libs change rebuilds every node service, wave 2, gateway last" \
    "{\"wave1\":[],\"wave2\":[$ALL_NODE]}" \
    'kmaedu-be/libs/grpc/x.ts'

expect "proto server goes to wave 1, the other changed service to wave 2" \
    '{"wave1":["content"],"wave2":["assessment"]}' \
    $'kmaedu-be/proto/kmaedu/content/v1/a.proto\nkmaedu-be/apps/assessment-service/x.ts'

expect "proto common selects every service including ai" \
    "{\"wave1\":[],\"wave2\":[$ALL]}" \
    'kmaedu-be/proto/kmaedu/common/v1/x.proto'

expect "proto events selects every service including ai" \
    "{\"wave1\":[],\"wave2\":[$ALL]}" \
    'kmaedu-be/proto/kmaedu/events/v1/x.proto'

expect "ai-service source selects only ai" \
    '{"wave1":[],"wave2":["ai"]}' \
    'kmaedu-be/apps/ai-service/x.py'

expect "docs only selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    $'docs/journals/x.md\nkmaedu-be/deploy/README.md\n.github/workflows/ci.yml\nkmaedu-fe/src/a.ts'

expect "empty diff selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    ''

expect "compose file selects its service" \
    '{"wave1":[],"wave2":["content"]}' \
    'kmaedu-be/deploy/compose/content.yml'

expect "compose file keeps the hyphenated key" \
    '{"wave1":[],"wave2":["study-room"]}' \
    'kmaedu-be/deploy/compose/study-room.yml'

expect "env example selects its service through the env name (studyroom -> study-room)" \
    '{"wave1":[],"wave2":["ai-chat","study-room"]}' \
    $'kmaedu-be/deploy/env/studyroom.env.example\nkmaedu-be/deploy/env/aichat.env.example'

expect "infra and seed compose files select nothing" \
    '{"wave1":[],"wave2":[]}' \
    $'kmaedu-be/deploy/compose/infra.yml\nkmaedu-be/deploy/compose/seed.yml'

expect "Dockerfile.node and the entrypoint rebuild every node service" \
    "{\"wave1\":[],\"wave2\":[$ALL_NODE]}" \
    $'kmaedu-be/deploy/Dockerfile.node\nkmaedu-be/deploy/docker-entrypoint.sh'

expect "yarn.lock rebuilds every node service but not ai" \
    "{\"wave1\":[],\"wave2\":[$ALL_NODE]}" \
    'kmaedu-be/yarn.lock'

expect "a service in wave 1 is not repeated in wave 2" \
    '{"wave1":["content"],"wave2":[]}' \
    $'kmaedu-be/proto/kmaedu/content/v1/a.proto\nkmaedu-be/apps/content-service/src/a.ts'

expect "gateway is last inside a wave" \
    '{"wave1":["auth","gateway"],"wave2":["admin"]}' \
    $'kmaedu-be/proto/kmaedu/gateway/v1/g.proto\nkmaedu-be/proto/kmaedu/auth/v1/a.proto\nkmaedu-be/apps/admin-service/x.ts'

expect "unknown proto package selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    'kmaedu-be/proto/kmaedu/nonesuch/v1/x.proto'

expect "paths without the kmaedu-be prefix work too" \
    '{"wave1":[],"wave2":["auth"]}' \
    'apps/auth-service/src/a.ts'

expect "FORCE_ALL=1 selects everything" \
    "{\"wave1\":[],\"wave2\":[$ALL]}" \
    'docs/x.md' FORCE_ALL=1

# Without CHANGED_FILES: an empty / zero / unknown base means everything.
for b in "" "0000000000000000000000000000000000000000" "not-a-rev-$$"; do
    got="$(env -u CHANGED_FILES bash "$script" "$b" HEAD)"
    if [ "$got" = "{\"wave1\":[],\"wave2\":[$ALL]}" ]; then
        echo "ok   - base '${b}' selects everything"
    else
        echo "FAIL - base '${b}'"
        echo "  got:  $got"
        fail=1
    fi
done

# Real git: a diff of HEAD against itself touches nothing.
got="$(env -u CHANGED_FILES bash "$script" HEAD HEAD)"
if [ "$got" = '{"wave1":[],"wave2":[]}' ]; then
    echo "ok   - git diff HEAD HEAD selects nothing"
else
    echo "FAIL - git diff HEAD HEAD: $got"
    fail=1
fi

# A huge diff (repo-wide rename touched ~2.5k files; 7000 here also beats macOS ARG_MAX) must not hit the per-argument/env size limit
# (Linux MAX_ARG_STRLEN = 128 KiB): the file list never travels through argv or one env var.
big_repo="$(mktemp -d)"
(
    set -e
    mkdir -p "$big_repo/kmaedu-be/scripts" "$big_repo/kmaedu-be/deploy"
    cp "$script" "$big_repo/kmaedu-be/scripts/"
    cp "$here/../deploy/services.json" "$big_repo/kmaedu-be/deploy/"
    cd "$big_repo"
    git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
    dir="kmaedu-be/apps/content-service/src/$(printf 'x%.0s' {1..120})"
    mkdir -p "$dir"
    for i in $(seq 1 7000); do : > "$dir/file-$i.ts"; done
    git add -A && git -c user.email=t@t -c user.name=t commit -q -m big
) >/dev/null 2>&1
got="$(bash "$big_repo/kmaedu-be/scripts/changed-services.sh" HEAD~1 HEAD 2>&1)"
rm -rf "$big_repo"
if [ "$got" = '{"wave1":[],"wave2":["content"]}' ]; then
    echo "ok   - a 7000-file diff does not overflow the argument size limit"
else
    echo "FAIL - 7000-file diff: $got"
    fail=1
fi

# Every service key must be a compose service name and have a compose file.
for k in $(node -e 'const c=require(process.argv[1]);for(const g of Object.values(c))for(const k of Object.keys(g))console.log(k)' "$here/../deploy/services.json"); do
    if [ ! -f "$here/../deploy/compose/$k.yml" ]; then
        echo "FAIL - services.json key '$k' has no deploy/compose/$k.yml"
        fail=1
    fi
done
[ "$fail" -eq 0 ] && echo "all changed-services tests passed"
exit "$fail"
