# =============================================================================
# KMAEdu AI Service - LIGHTWEIGHT (Optimized for Local OCR & API AI)
# Build context is kmaedu-be/ (the gRPC stubs are generated from ../../proto):
#   docker build -f apps/ai-service/Dockerfile -t kmaedu-ai kmaedu-be
# =============================================================================

# Stage 0: regenerate the gRPC stubs from the shared contracts, so the image never
# ships stubs older than proto/ (same script as local dev: scripts/gen_grpc.sh).
FROM python:3.12-slim AS protogen
WORKDIR /w/apps/ai-service
# Keep in sync with requirements.txt / pyproject.toml.
RUN pip install --no-cache-dir grpcio-tools==1.71.2 protobuf==5.29.6
COPY apps/ai-service/scripts/gen_grpc.sh scripts/gen_grpc.sh
COPY proto /w/proto
RUN PYTHON=python bash scripts/gen_grpc.sh

FROM python:3.12-slim AS builder
WORKDIR /build

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ build-essential libc6-dev python3-dev && \
    rm -rf /var/lib/apt/lists/*

COPY apps/ai-service/requirements.txt .

# Install dependencies (NO TORCH - saves ~500MB)
RUN pip install --no-cache-dir --user -r requirements.txt

# AGGRESSIVE CLEANUP of site-packages
RUN find /root/.local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -name "*.pyc" -delete 2>/dev/null || true && \
    find /root/.local -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Minimal runtime
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies for OCR and Image Processing
# - tesseract-ocr & tesseract-ocr-vie: Required for local OCR
# - poppler-utils: Required for pdf2image (PDF to Image conversion)
# - libgl1 & libglib2.0-0: Required for OpenCV (image preprocessing)
# - curl: For container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    libc6-dev \
    tesseract-ocr \
    tesseract-ocr-vie \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    curl && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean && \
    rm -rf /tmp/* /var/tmp/*

# Copy installed python packages from builder
COPY --from=builder /root/.local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /root/.local/bin /usr/local/bin

# ROLE picks what runs (python -m src.main): api = gRPC :50051 + /health on PORT,
# worker = event consumer + outbox relay, migrate = `alembic upgrade head` then exit.
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=3000 GRPC_PORT=50051 ROLE=api

# Copy source code and schema migrations
COPY apps/ai-service/src /app/src
COPY apps/ai-service/alembic.ini /app/alembic.ini
COPY apps/ai-service/alembic /app/alembic
COPY --from=protogen /w/apps/ai-service/src/backend/grpc_generated /app/src/backend/grpc_generated

# gRPC is internal-only (no host port); /health is for the container healthcheck.
EXPOSE 3000 50051
# Only meaningful for ROLE=api; compose disables it for worker and migrate.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://localhost:%s/health' % os.environ.get('PORT', '3000'), timeout=4)"]

CMD ["python", "-m", "src.main"]
