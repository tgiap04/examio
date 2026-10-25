"""FastAPI app of the ai-service: liveness (``/``) and ``/health`` only.

All real traffic is gRPC (``src/grpc_server.py``), guarded by service tokens.
There is no business HTTP route and no shared secret on this listener.
"""

from __future__ import annotations

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
    # Nothing but liveness is served over HTTP: no schema or docs pages either.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Keep the ``{success, error, status_code}`` error body (e.g. a 404 on an unknown path)."""
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
