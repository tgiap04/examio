#!/usr/bin/env bash
# Tests for deploy-service.sh with a fake `docker` and `curl` (nothing real is touched).
#   bash deploy/deploy-service.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/deploy-service.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

# --- fake docker: logs every call; behaviour comes from env (see the cases) ---------------------
cat >"$work/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_LOG"
case "$1 $2" in
    "container inspect") exit 0 ;;
esac
[ "$1" = "exec" ] && exit 0
# compose --env-file A --env-file B <verb> ...: B is the tags file
tags="" verb=""
shift # compose
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) tags="$2"; shift 2 ;;
        *) verb="$1"; shift; break ;;
    esac
done
case "$verb" in
    pull) exit "${FAKE_PULL_RC:-0}" ;;
    run)
        [ -n "${FAKE_MIGRATE_OUT:-}" ] && echo "$FAKE_MIGRATE_OUT"
        exit "${FAKE_MIGRATE_RC:-0}"
        ;;
    up)
        # the "new image" is unhealthy: --wait fails while the tags file still holds FAKE_BAD_TAG
        if [ -n "${FAKE_BAD_TAG:-}" ] && grep -q "=${FAKE_BAD_TAG}\$" "$tags"; then
            echo "tag-at-up-time: $(cat "$tags")" >>"$FAKE_LOG"
            exit 1
        fi
        exit 0
        ;;
esac
exit 0
SHIM
cat >"$work/curl" <<'SHIM'
#!/usr/bin/env bash
{ echo "curl $*"; cat; } >>"$FAKE_ALERTS"
SHIM
chmod +x "$work/docker" "$work/curl"
: >"$work/dotenv"

# run <svc> <sha> [VAR=value ...]: fresh log/alerts, leaves $rc, $LOG, $ALERTS, $TAGS
run() {
    local svc="$1" sha="$2"
    shift 2
    LOG="$work/log"
    ALERTS="$work/alerts"
    TAGS="$work/tags.env"
    : >"$LOG"
    : >"$ALERTS"
    env DOCKER="$work/docker" CURL="$work/curl" ENV_FILE="$work/dotenv" TAGS_FILE="$TAGS" \
        FAKE_LOG="$LOG" FAKE_ALERTS="$ALERTS" TELEGRAM_TOKEN=t0k TELEGRAM_TO=42 \
        "$@" bash "$script" "$svc" "$sha" >"$work/out" 2>&1
    rc=$?
}

check() { # check <name> <exit code>: 0 = pass
    if [ "$2" -eq 0 ]; then
        echo "ok   - $1"
    else
        echo "FAIL - $1"
        sed 's/^/    out: /' "$work/out"
        sed 's/^/    log: /' "$LOG"
        fail=1
    fi
}
expect_ok() { local name="$1"; shift; "$@"; check "$name" $?; }
expect_no() { local name="$1"; shift; if "$@"; then check "$name" 1; else check "$name" 0; fi; }
# shellcheck disable=SC2329 # called through expect_ok / expect_no
has() { grep -qF -- "$1" "$2"; }
calls() { grep -c -- "$1" "$LOG"; }

# 1. success: pull, migrate, up; tag moves to the new sha; no alert
echo 'AUTH_TAG=oldsha' >"$work/tags.env"
echo 'ADMIN_TAG=keepme' >>"$work/tags.env"
run auth newsha
check "success exits 0" "$rc"
expect_ok "success pins the new sha" has 'AUTH_TAG=newsha' "$TAGS"
expect_ok "success leaves other tags alone" has 'ADMIN_TAG=keepme' "$TAGS"
expect_no "success drops the old line" has 'AUTH_TAG=oldsha' "$TAGS"
expect_ok "success runs the migrate one-shot" has 'run --rm --no-deps auth-migrate' "$LOG"
expect_ok "success recreates only auth with --wait" has 'up -d --no-deps --wait --wait-timeout 90 auth' "$LOG"
expect_ok "success sends no alert" [ ! -s "$ALERTS" ]
expect_ok "never calls down" [ "$(calls ' down')" -eq 0 ]

# 2. failing --wait: previous tag restored, old image recreated, non-zero exit, alert
echo 'AUTH_TAG=oldsha' >"$work/tags.env"
run auth badsha FAKE_BAD_TAG=badsha
expect_ok "failing --wait exits non-zero" [ "$rc" -ne 0 ]
expect_ok "failing --wait restores the previous tag" has 'AUTH_TAG=oldsha' "$TAGS"
expect_ok "failing --wait: second up recreates the old image" [ "$(calls ' up ')" -eq 2 ]
expect_ok "failing --wait alerts a rollback" has 'rollback' "$ALERTS"
expect_ok "alert is posted to the configured chat" has 'chat_id=42' "$ALERTS"
expect_no "the telegram token is not printed" has 't0k' "$work/out"

# 2b. first ever deploy (no previous tag) that fails: the tag line disappears (compose default :main)
rm -f "$work/tags.env"
run auth badsha FAKE_BAD_TAG=badsha
expect_ok "no previous tag: exits non-zero" [ "$rc" -ne 0 ]
expect_no "no previous tag: the new tag is removed again" has 'AUTH_TAG' "$TAGS"

# 3. migrate output with P3009: exit 1, "manual" alert, up never called, tag restored
echo 'CONTENT_TAG=oldsha' >"$work/tags.env"
run content newsha FAKE_MIGRATE_RC=1 FAKE_MIGRATE_OUT='Error: P3009 migrate found failed migrations in the target database'
expect_ok "P3009 exits 1" [ "$rc" -eq 1 ]
expect_ok "P3009 alert says manual" has 'manual' "$ALERTS"
expect_ok "P3009 alert names the code" has 'P3009' "$ALERTS"
expect_ok "P3009: up is never called" [ "$(calls ' up ')" -eq 0 ]
expect_ok "P3009 restores the previous tag" has 'CONTENT_TAG=oldsha' "$TAGS"
expect_ok "P3009: no automatic resolve" [ "$(calls 'migrate resolve')" -eq 0 ]

# 4. migrate failure without P3009: same, without "manual"
echo 'CONTENT_TAG=oldsha' >"$work/tags.env"
run content newsha FAKE_MIGRATE_RC=1 FAKE_MIGRATE_OUT='Error: P1001 cannot reach database'
expect_ok "migrate failure exits 1" [ "$rc" -eq 1 ]
expect_ok "migrate failure alerts" has 'migrate failed' "$ALERTS"
expect_no "migrate failure (no P3009) does not ask for a manual resolve" has 'manual' "$ALERTS"
expect_ok "migrate failure: up is never called" [ "$(calls ' up ')" -eq 0 ]
expect_ok "migrate failure restores the previous tag" has 'CONTENT_TAG=oldsha' "$TAGS"

# 5. instances: a then b, never an nginx reload; no migrate for a db-less service
echo 'GATEWAY_TAG=oldsha' >"$work/tags.env"
run gateway newsha
check "gateway exits 0" "$rc"
order="$(grep -E 'up -d' "$LOG" | sed -E 's/.*(gateway-[ab])$/\1/' | tr '\n' ' ')"
expect_ok "gateway order is a, b (got: $order)" [ "$order" = "gateway-a gateway-b " ]
expect_ok "gateway rollout never reloads nginx" [ "$(calls 'nginx -s reload')" -eq 0 ]
expect_ok "gateway has no migrate step" [ "$(calls 'gateway-migrate')" -eq 0 ]
expect_ok "gateway pins the sha" has 'GATEWAY_TAG=newsha' "$TAGS"

# 5b. gateway-b fails: tag restored, both halves recreated on the old image
echo 'GATEWAY_TAG=oldsha' >"$work/tags.env"
run gateway badsha FAKE_BAD_TAG=badsha
expect_ok "gateway failure exits non-zero" [ "$rc" -ne 0 ]
expect_ok "gateway failure restores the tag" has 'GATEWAY_TAG=oldsha' "$TAGS"

# 6. worker-only container from services.json (ai -> ai-worker) and the python migrate one-shot
echo 'AI_TAG=oldsha' >"$work/tags.env"
run ai newsha
check "ai exits 0" "$rc"
expect_ok "ai recreates api and worker together" has 'up -d --no-deps --wait --wait-timeout 90 ai ai-worker' "$LOG"
expect_ok "ai runs ai-migrate" has 'run --rm --no-deps ai-migrate' "$LOG"
expect_ok "ai pulls all three images" has 'pull ai ai-worker ai-migrate' "$LOG"

# 6b. hyphenated key maps to <KEY>_TAG
run study-room newsha
expect_ok "study-room writes STUDY_ROOM_TAG" has 'STUDY_ROOM_TAG=newsha' "$TAGS"

# 7. pull failure: nothing recreated, tag restored
echo 'AUTH_TAG=oldsha' >"$work/tags.env"
run auth newsha FAKE_PULL_RC=1
expect_ok "pull failure exits 1" [ "$rc" -eq 1 ]
expect_ok "pull failure: no up" [ "$(calls ' up ')" -eq 0 ]
expect_ok "pull failure: no migrate" [ "$(calls 'run --rm')" -eq 0 ]
expect_ok "pull failure restores the tag" has 'AUTH_TAG=oldsha' "$TAGS"

# 8. arguments, DRY_RUN, alerts without credentials
run nope newsha
expect_ok "unknown service exits 64" [ "$rc" -eq 64 ]
run auth 'bad sha'
expect_ok "a sha with spaces exits 64" [ "$rc" -eq 64 ]
echo 'AUTH_TAG=oldsha' >"$work/tags.env"
run auth newsha DRY_RUN=1
check "DRY_RUN exits 0" "$rc"
expect_ok "DRY_RUN never calls docker" [ ! -s "$LOG" ]
expect_ok "DRY_RUN leaves the tags file alone" has 'AUTH_TAG=oldsha' "$TAGS"
echo 'AUTH_TAG=oldsha' >"$work/tags.env"
run auth badsha FAKE_BAD_TAG=badsha TELEGRAM_TOKEN= TELEGRAM_TO=
expect_ok "no telegram credentials: still fails" [ "$rc" -ne 0 ]
expect_ok "no telegram credentials: alert is a no-op" [ ! -s "$ALERTS" ]

# 9. static guarantees
expect_ok "script never runs migrate resolve" [ "$(grep -c 'migrate resolve' "$script")" -eq 0 ]
expect_ok "script never runs db push" [ "$(grep -c 'db push' "$script")" -eq 0 ]
expect_no "script never runs compose down" grep -E 'compose.*[[:space:]]down([[:space:]]|$)|dc down' "$script" >/dev/null
expect_no "script does not log in to GHCR" grep -q 'docker login' "$script"

[ "$fail" -eq 0 ] && echo "all deploy-service checks passed"
exit "$fail"
