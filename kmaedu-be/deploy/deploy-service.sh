#!/usr/bin/env bash
# Deploy ONE service at a git sha: migrate gate, recreate with --wait, rollback on failure.
#   deploy/deploy-service.sh <svc> <sha>
#
# <svc> is a key of deploy/services.json (the compose service name, e.g. study-room, ai-chat,
# gateway). Images come from GHCR (ghcr.io/tgiap04/kmaedu-<svc>:<sha>) and are pinned through
# deploy/.tags.env (<SVC>_TAG=<sha>), passed to compose with a second --env-file.
#
#   1. set the tag, pull the images
#   2. db service: `<svc>-migrate` one-shot. Failure => restore the tag, never recreate the
#      service (the old container keeps running), alert, exit 1. P3009 (a failed migration is
#      recorded in _prisma_migrations) additionally asks for a manual fix by a human.
#   3. `up -d --no-deps --wait`; failure => restore the tag, recreate the old image, alert, exit 1
#   4. `instances` (gateway-a, gateway-b): one at a time. The FE nginx re-resolves both names every
#      5 s and retries the other instance on a refused connect, so it needs no reload (a reload closes
#      idle client keep-alive connections, which a client reusing one sees as a reset).
#
# Never auto-resolves a failed migration, never pushes the schema, never runs `down`: a failed
# migration needs a human, and a single-service deploy must not touch any other container.
# The GHCR login is done once by the workflow, not here.
#
# Env: DRY_RUN=1 (print the docker commands, run nothing), DOCKER (docker binary, default docker),
#      CURL (default curl), TELEGRAM_TOKEN + TELEGRAM_TO (alerts; no-op when unset),
#      ENV_FILE (compose-level env, default deploy/.env), TAGS_FILE (default deploy/.tags.env),
#      SERVICES_JSON, WAIT_TIMEOUT (default 90).
set -uo pipefail

if [ $# -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
    echo "usage: deploy-service.sh <svc> <sha>" >&2
    exit 64
fi
SVC="$1"
SHA="$2"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER="${DOCKER:-docker}"
CURL="${CURL:-curl}"
DRY_RUN="${DRY_RUN:-}"
ENV_FILE="${ENV_FILE:-$HERE/.env}"
TAGS_FILE="${TAGS_FILE:-$HERE/.tags.env}"
SERVICES_JSON="${SERVICES_JSON:-$HERE/services.json}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-90}"

case "$SHA" in
    *[!A-Za-z0-9._-]*)
        echo "ERROR: sha '$SHA' has characters outside [A-Za-z0-9._-]" >&2
        exit 64
        ;;
esac

log() { echo "[deploy-service:$SVC] $*"; }

alert() {
    log "ALERT: $*"
    [ -n "$DRY_RUN" ] && return 0
    [ -n "${TELEGRAM_TOKEN:-}" ] && [ -n "${TELEGRAM_TO:-}" ] || return 0
    # The token goes through stdin (-K -), never on the command line.
    printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TELEGRAM_TOKEN" |
        "$CURL" -fsS -m 10 -K - \
            --data-urlencode "chat_id=${TELEGRAM_TO}" \
            --data-urlencode "text=kmaedu deploy ${SVC}@${SHA}: $*" >/dev/null 2>&1 ||
        log "warning: telegram alert could not be sent"
    return 0
}

# ---- services.json -----------------------------------------------------------------------
# Prints: <db true|false> <workerService or -> <comma list of instances or ->
read_meta() {
    jq -er --arg s "$SVC" '
        [.[][$s] | select(. != null)][0]
        | select(. != null)
        | "\(.db == true) \(.workerService // "-") \((.instances // []) | join(",") | if . == "" then "-" else . end)"
    ' "$SERVICES_JSON"
}

command -v jq >/dev/null || {
    echo "ERROR: jq is required on the deploy host (apt-get install jq)" >&2
    exit 64
}
meta="$(read_meta)" || {
    echo "ERROR: '$SVC' is not a key of $SERVICES_JSON" >&2
    exit 64
}
read -r HAS_DB WORKER_SVC INSTANCES_CSV <<<"$meta"
[ "$WORKER_SVC" = "-" ] && WORKER_SVC=""
INSTANCES=()
if [ "$INSTANCES_CSV" != "-" ]; then
    IFS=',' read -r -a INSTANCES <<<"$INSTANCES_CSV"
fi

# ---- tags (deploy/.tags.env: <SVC>_TAG=<sha>) ----------------------------------------------
TAG_VAR="$(printf '%s' "$SVC" | tr 'a-z-' 'A-Z_')_TAG"

get_tag() {
    [ -f "$TAGS_FILE" ] || return 0
    grep -E "^${TAG_VAR}=" "$TAGS_FILE" | tail -n 1 | cut -d= -f2-
    return 0
}

# set_tag <value>; an empty value removes the line (compose falls back to ${..:-main}).
set_tag() {
    if [ -n "$DRY_RUN" ]; then
        log "(dry-run) ${TAG_VAR}=${1:-<unset>} in $TAGS_FILE"
        return 0
    fi
    local tmp
    tmp="$(mktemp "${TAGS_FILE}.XXXXXX")" || return 1
    { [ -f "$TAGS_FILE" ] && grep -vE "^${TAG_VAR}=" "$TAGS_FILE"; [ -z "$1" ] || echo "${TAG_VAR}=$1"; } >"$tmp"
    mv "$tmp" "$TAGS_FILE"
}

# ---- docker ---------------------------------------------------------------------------------
dc() {
    local cmd=("$DOCKER" compose --env-file "$ENV_FILE" --env-file "$TAGS_FILE" "$@")
    if [ -n "$DRY_RUN" ]; then
        log "(dry-run) ${cmd[*]}"
        return 0
    fi
    (cd "$HERE" && "${cmd[@]}")
}

# ---- run --------------------------------------------------------------------------------------
if [ ${#INSTANCES[@]} -gt 0 ]; then
    TARGETS=("${INSTANCES[@]}")
else
    TARGETS=("$SVC")
fi
# Worker-only container (ai-worker) rides with the first target; api,worker services have none.
EXTRA=()
[ -n "$WORKER_SVC" ] && EXTRA+=("$WORKER_SVC")

PREV="$(get_tag)"
PREV_IMAGE="${PREV:-main}" # what compose falls back to when the tag is unset
set_tag "$SHA" || {
    alert "cannot write $TAGS_FILE"
    exit 1
}
log "tag ${TAG_VAR}: ${PREV:-<unset>} -> $SHA"

restore_tag() { set_tag "$PREV" || log "ERROR: could not restore ${TAG_VAR} in $TAGS_FILE"; }

PULL=("${TARGETS[@]}" ${EXTRA[@]+"${EXTRA[@]}"})
[ "$HAS_DB" = "true" ] && PULL+=("$SVC-migrate")
if ! dc pull "${PULL[@]}"; then
    restore_tag
    alert "image pull failed (is ghcr.io/tgiap04/kmaedu-${SVC}:${SHA} pushed?); previous tag ${PREV_IMAGE} restored, nothing recreated"
    exit 1
fi

if [ "$HAS_DB" = "true" ]; then
    if [ -n "$DRY_RUN" ]; then
        dc run --rm --no-deps "$SVC-migrate"
    else
        out="$(dc run --rm --no-deps "$SVC-migrate" 2>&1)"
        rc=$?
        echo "$out"
        if [ $rc -ne 0 ]; then
            restore_tag # the running container keeps its image: it is never recreated here
            if grep -q 'P3009' <<<"$out"; then
                alert "P3009: a failed migration is recorded for $SVC; manual resolution (prisma CLI, see deploy/README.md) required after inspecting it. Deploy halted, previous image ${PREV_IMAGE} still running."
            else
                alert "migrate failed for $SVC@$SHA; previous image ${PREV_IMAGE} still running."
            fi
            exit 1
        fi
    fi
fi

DONE=()
for target in "${TARGETS[@]}"; do
    UP=("$target")
    # The worker-only container is recreated together with the first target.
    [ ${#DONE[@]} -eq 0 ] && UP+=(${EXTRA[@]+"${EXTRA[@]}"})
    if ! dc up -d --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" "${UP[@]}"; then
        restore_tag
        log "rollback: recreating ${DONE[*]:-} ${UP[*]} on ${PREV_IMAGE}"
        if dc up -d --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" ${DONE[@]+"${DONE[@]}"} "${UP[@]}"; then
            alert "rollback $SVC -> ${PREV_IMAGE}: $target did not become healthy within ${WAIT_TIMEOUT}s on $SHA"
        else
            alert "rollback of $SVC to ${PREV_IMAGE} FAILED too; manual intervention required"
        fi
        exit 1
    fi
    DONE+=("$target")
done

log "deployed $SVC@$SHA"
exit 0
