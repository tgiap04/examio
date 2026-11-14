#!/usr/bin/env bash
# Regenerates the Python gRPC stubs from the shared contracts in kmaedu-be/proto.
# Only the packages ai-service consumes are generated (r2, common, ai, document, events).
# Usage: ./scripts/gen_grpc.sh   (from apps/ai-service; needs ./venv with grpcio-tools)
set -euo pipefail

cd "$(dirname "$0")/.."
PROTO_ROOT="../../proto"
OUT="src/backend/grpc_generated"
PY="${PYTHON:-./venv/bin/python}"

rm -rf "${OUT}/kmaedu"
mkdir -p "${OUT}"

"${PY}" -m grpc_tools.protoc \
    -I "${PROTO_ROOT}" \
    --python_out="${OUT}" \
    --pyi_out="${OUT}" \
    --grpc_python_out="${OUT}" \
    "${PROTO_ROOT}/kmaedu/common/v1/pagination.proto" \
    "${PROTO_ROOT}/kmaedu/r2/v1/r2.proto" \
    "${PROTO_ROOT}/kmaedu/ai/v1/ai.proto" \
    "${PROTO_ROOT}/kmaedu/document/v1/document.proto" \
    "${PROTO_ROOT}/kmaedu/events/v1/document_events.proto" \
    "${PROTO_ROOT}/kmaedu/events/v1/ai_events.proto" \
    "${PROTO_ROOT}/kmaedu/events/v1/content_events.proto"

# protoc emits absolute imports (`from kmaedu.r2.v1 import r2_pb2`); rewrite them
# to package-relative ones so the stubs import without touching sys.path.
find "${OUT}/kmaedu" -name '*_pb2_grpc.py' -o -name '*_pb2.py' | while read -r file; do
    dir="$(dirname "${file}")"
    pkg="$(echo "${dir#"${OUT}"/}" | tr '/' '.')"
    sed -i.bak -E "s/^from ${pkg//./\\.} import /from . import /" "${file}"
    rm -f "${file}.bak"
done

# Package markers
find "${OUT}/kmaedu" -type d -exec touch {}/__init__.py \;
touch "${OUT}/__init__.py"
echo "generated -> ${OUT}/kmaedu"
