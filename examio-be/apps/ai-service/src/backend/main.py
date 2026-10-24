"""FastAPI app of the ai-service: ``/health`` plus the optional HTTP compat routes.

All real traffic is gRPC (``src/grpc_server.py``). ``AI_HTTP_COMPAT=true`` keeps
``/api/chat/query``, ``/api/chat/stream`` and ``/api/generate/word-family`` alive,
guarded by ``INTERNAL_SERVICE_TOKEN``, for callers that move to gRPC in phase 13.
"""

from __future__ import annotations

import hmac
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

# Force Allow Duplicate Lib for some ML envs
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PUBLIC_PATHS = frozenset({"/", "/health"})


def http_compat_enabled() -> bool:
    """Whether the legacy HTTP routes are mounted (``AI_HTTP_COMPAT=true``)."""
    return os.environ.get("AI_HTTP_COMPAT", "false").strip().lower() in {"1", "true", "yes"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Release shared resources (LLM client, DB pools) on shutdown."""
    yield
    try:
        from src.llm.model_manager import model_manager

        await model_manager.aclose()
    except Exception as exc:
        logger.debug("AI2 client shutdown warning: %s", exc)
    from src import db

    await db.close_pools()


app = FastAPI(
    title="Examio AI Node",
    description="gRPC + event-driven AI node (OCR, vector search, generation)",
    version="3.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def require_internal_service_token(request: Request, call_next):
    """Fail closed on every compat route unless the legacy shared token matches."""
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    expected = os.getenv("INTERNAL_SERVICE_TOKEN")
    received = request.headers.get("x-internal-service-token")
    # Constant-time compare; an unset token short-circuits to reject.
    if not expected or not hmac.compare_digest(received or "", expected):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "error": "Invalid internal service token"},
        )
    return await call_next(request)


if http_compat_enabled():
    from .api import router as compat_router

    app.include_router(compat_router, prefix="/api")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Keep the legacy ``{success, error, status_code}`` error body."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail, "status_code": exc.status_code},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Never leak internal error text; return a correlation id instead."""
    error_id = uuid.uuid4().hex
    logger.error("Unhandled exception [%s]: %s", error_id, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "error": "Internal server error", "error_id": error_id},
    )


@app.get("/")
async def root():
    """Liveness banner."""
    return {"service": "Examio AI Node", "status": "online", "version": app.version}


@app.get("/health")
async def health_check():
    """Health check without DB dependencies."""
    return {"status": "healthy", "timestamp": datetime.now(UTC).isoformat()}
