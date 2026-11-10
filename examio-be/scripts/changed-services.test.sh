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
    'examio-be/libs/grpc/x.ts'

expect "proto server goes to wave 1, the other changed service to wave 2" \
    '{"wave1":["content"],"wave2":["assessment"]}' \
    $'examio-be/proto/examio/content/v1/a.proto\nexamio-be/apps/assessment-service/x.ts'

expect "proto common selects every service including ai" \
    "{\"wave1\":[],\"wave2\":[$ALL]}" \
    'examio-be/proto/examio/common/v1/x.proto'

expect "proto events selects every service including ai" \
    "{\"wave1\":[],\"wave2\":[$ALL]}" \
    'examio-be/proto/examio/events/v1/x.proto'

expect "ai-service source selects only ai" \
    '{"wave1":[],"wave2":["ai"]}' \
    'examio-be/apps/ai-service/x.py'

expect "docs only selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    $'docs/journals/x.md\nexamio-be/deploy/README.md\n.github/workflows/ci.yml\nexamio-fe/src/a.ts'

expect "empty diff selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    ''

expect "compose file selects its service" \
    '{"wave1":[],"wave2":["content"]}' \
    'examio-be/deploy/compose/content.yml'

expect "compose file keeps the hyphenated key" \
    '{"wave1":[],"wave2":["study-room"]}' \
    'examio-be/deploy/compose/study-room.yml'

expect "env example selects its service through the env name (studyroom -> study-room)" \
    '{"wave1":[],"wave2":["ai-chat","study-room"]}' \
    $'examio-be/deploy/env/studyroom.env.example\nexamio-be/deploy/env/aichat.env.example'

expect "infra and seed compose files select nothing" \
    '{"wave1":[],"wave2":[]}' \
    $'examio-be/deploy/compose/infra.yml\nexamio-be/deploy/compose/seed.yml'

expect "Dockerfile.node and the entrypoint rebuild every node service" \
    "{\"wave1\":[],\"wave2\":[$ALL_NODE]}" \
    $'examio-be/deploy/Dockerfile.node\nexamio-be/deploy/docker-entrypoint.sh'

expect "yarn.lock rebuilds every node service but not ai" \
    "{\"wave1\":[],\"wave2\":[$ALL_NODE]}" \
    'examio-be/yarn.lock'

expect "a service in wave 1 is not repeated in wave 2" \
    '{"wave1":["content"],"wave2":[]}' \
    $'examio-be/proto/examio/content/v1/a.proto\nexamio-be/apps/content-service/src/a.ts'

expect "gateway is last inside a wave" \
    '{"wave1":["auth","gateway"],"wave2":["admin"]}' \
    $'examio-be/proto/examio/gateway/v1/g.proto\nexamio-be/proto/examio/auth/v1/a.proto\nexamio-be/apps/admin-service/x.ts'

expect "unknown proto package selects nothing" \
    '{"wave1":[],"wave2":[]}' \
    'examio-be/proto/examio/nonesuch/v1/x.proto'

expect "paths without the examio-be prefix work too" \
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

# Every service key must be a compose service name and have a compose file.
for k in $(node -e 'const c=require(process.argv[1]);for(const g of Object.values(c))for(const k of Object.keys(g))console.log(k)' "$here/../deploy/services.json"); do
    if [ ! -f "$here/../deploy/compose/$k.yml" ]; then
        echo "FAIL - services.json key '$k' has no deploy/compose/$k.yml"
        fail=1
    fi
done
[ "$fail" -eq 0 ] && echo "all changed-services tests passed"
exit "$fail"
