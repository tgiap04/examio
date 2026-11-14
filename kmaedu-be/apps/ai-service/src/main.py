"""ai-service entrypoint: ``python -m src.main`` with ``ROLE`` selecting what runs.

``ROLE`` is a comma-separated set of:

* ``api``     gRPC ``AiService`` on :50051 (``GRPC_PORT``) + FastAPI ``/health`` on ``PORT``
* ``worker``  event consumer + outbox relay + daily purge
* ``migrate`` ``alembic upgrade head`` and exit (one-shot container); exclusive
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import signal
import sys
from pathlib import Path

logger = logging.getLogger("src.main")

ROLES = ("api", "worker", "migrate")
SERVICE_ROOT = Path(__file__).resolve().parent.parent


def parse_roles(raw: str | None) -> set[str]:
    """Parse ``ROLE`` (default ``api``); unknown names and ``migrate`` mixes are errors."""
    roles = {part.strip() for part in (raw or "api").split(",") if part.strip()}
    unknown = roles - set(ROLES)
    if unknown or not roles:
        raise ValueError(f"Invalid ROLE {raw!r}: expected a subset of {', '.join(ROLES)}")
    if "migrate" in roles and len(roles) > 1:
        raise ValueError("ROLE=migrate cannot be combined with other roles")
    return roles


def run_migrations() -> None:
    """Apply every pending Alembic revision (blocking; runs before any event loop)."""
    from alembic.config import Config

    from alembic import command

    config = Config(str(SERVICE_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(SERVICE_ROOT / "alembic"))
    command.upgrade(config, "head")


async def _serve_http(stop: asyncio.Event) -> None:
    import uvicorn

    class _Server(uvicorn.Server):
        """Signals are owned by ``run`` so gRPC and uvicorn stop together."""

        def install_signal_handlers(self) -> None:  # uvicorn < 0.30
            return None

        @contextlib.contextmanager
        def capture_signals(self):  # uvicorn >= 0.30
            yield

    config = uvicorn.Config(
        "src.backend.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "3000")),
        log_level="info",
    )
    server = _Server(config)
    task = asyncio.create_task(server.serve())
    await stop.wait()
    server.should_exit = True
    await task


async def run(roles: set[str]) -> None:
    """Run the selected long-lived roles until SIGTERM/SIGINT."""
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    coroutines = []
    if "api" in roles:
        from src.grpc_server import serve

        coroutines += [serve(stop), _serve_http(stop)]
    if "worker" in roles:
        from src.backend.messaging.worker import run_worker

        coroutines.append(run_worker(stop))
    await asyncio.gather(*coroutines)


def main() -> int:
    """Entry point; returns the process exit code."""
    # force: libraries imported earlier may already have configured the root logger
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", force=True)
    try:
        roles = parse_roles(os.environ.get("ROLE"))
    except ValueError as exc:
        logger.error("%s", exc)
        return 2
    if "migrate" in roles:
        run_migrations()
        return 0
    asyncio.run(run(roles))
    return 0


if __name__ == "__main__":
    sys.exit(main())
