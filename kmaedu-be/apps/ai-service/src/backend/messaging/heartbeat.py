"""Liveness file for ``ROLE=worker`` (the container has no HTTP port).

The worker touches ``WORKER_HEARTBEAT_FILE`` (default ``/tmp/worker-heartbeat``) every
``HEARTBEAT_INTERVAL_SECONDS`` while ``is_healthy()`` holds; compose checks the file's age
(``find /tmp/worker-heartbeat -mmin -2``). A worker whose relay, purge or broker connection died
stops touching it and turns ``unhealthy`` within two minutes instead of staying ``running``.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_FILE = "/tmp/worker-heartbeat"  # noqa: S108 - fixed, container-local path read by the compose healthcheck
HEARTBEAT_INTERVAL_SECONDS = 30.0


def heartbeat_path() -> Path:
    """Where the heartbeat file lives (env override keeps tests off ``/tmp``)."""
    return Path(os.environ.get("WORKER_HEARTBEAT_FILE", DEFAULT_HEARTBEAT_FILE))


def clear_heartbeat(path: Path | None = None) -> None:
    """Drop a heartbeat left by a previous run, so a restarted worker is not healthy before it connects."""
    (path or heartbeat_path()).unlink(missing_ok=True)


async def run_heartbeat(
    stop: asyncio.Event,
    is_healthy: Callable[[], bool],
    path: Path | None = None,
    interval: float = HEARTBEAT_INTERVAL_SECONDS,
) -> None:
    """Touch the heartbeat file while healthy, until ``stop`` is set."""
    target = path or heartbeat_path()
    while not stop.is_set():
        if is_healthy():
            try:
                target.touch()
            except OSError as exc:
                logger.warning("Cannot write the worker heartbeat %s: %s", target, exc)
        else:
            logger.error(
                "Worker is unhealthy; the heartbeat %s is no longer refreshed", target
            )
        try:
            await asyncio.wait_for(stop.wait(), interval)
        except TimeoutError:
            pass
