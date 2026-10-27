"""``ROLE=worker``: event consumer + outbox relay + daily purge on one broker connection."""

from __future__ import annotations

import asyncio
import logging
import os

from src import db

from .consumer import EventConsumer, Handler
from .document_handlers import on_document_deleted, on_document_uploaded
from .generation_handler import on_generation_requested
from .heartbeat import clear_heartbeat, run_heartbeat
from .outbox_relay import OutboxRelay
from .purge import OutboxPurge

logger = logging.getLogger(__name__)

HANDLERS: dict[str, Handler] = {
    "document.uploaded": on_document_uploaded,
    "document.deleted": on_document_deleted,
    "content.generation.requested": on_generation_requested,
}
CONNECT_BACKOFF_SECONDS = 5.0


async def _connect(consumer: EventConsumer, url: str, stop: asyncio.Event) -> bool:
    """Connect with a fixed backoff so a broker outage at boot is survivable."""
    while not stop.is_set():
        try:
            await consumer.start(url)
            return True
        except Exception as exc:
            logger.warning("Broker not reachable (%s); retrying in %.0fs", exc, CONNECT_BACKOFF_SECONDS)
            try:
                await asyncio.wait_for(stop.wait(), CONNECT_BACKOFF_SECONDS)
            except TimeoutError:
                pass
    return False


async def run_worker(stop: asyncio.Event) -> None:
    """Run until ``stop`` is set, then drain in-flight work and close resources."""
    url = os.environ.get("RABBITMQ_URL", "").strip()
    if not url:
        raise RuntimeError("RABBITMQ_URL is required for ROLE=worker")
    clear_heartbeat()
    pool = await db.get_pool()
    relay_pool = await db.get_relay_pool()
    consumer = EventConsumer(pool, HANDLERS, publisher=None)
    if not await _connect(consumer, url, stop):
        return
    relay = OutboxRelay(relay_pool, consumer.publisher)
    purge = OutboxPurge(relay_pool)
    tasks = [asyncio.create_task(relay.run(), name="outbox-relay"), asyncio.create_task(purge.run(), name="outbox-purge")]

    def is_healthy() -> bool:
        """Broker connected and no worker task (relay, purge, heartbeat) has ended."""
        return consumer.is_connected and not any(task.done() for task in tasks)

    tasks.append(asyncio.create_task(run_heartbeat(stop, is_healthy), name="worker-heartbeat"))
    logger.info("ai worker running")
    await stop.wait()
    relay.stop()
    purge.stop()
    await consumer.stop()
    await asyncio.gather(*tasks, return_exceptions=True)
    await db.close_pools()
