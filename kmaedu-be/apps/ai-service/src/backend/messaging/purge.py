"""Daily retention: published outbox rows > 7 d, ``processed_events`` > 14 d."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import asyncpg

logger = logging.getLogger(__name__)

PURGE_BATCH = 5000
RUN_AT_HOUR_UTC = 3
NOW = "(now() AT TIME ZONE 'UTC')"

PURGE_OUTBOX_SQL = f"""
DELETE FROM outbox_events WHERE seq IN (
    SELECT seq FROM outbox_events
    WHERE published_at < {NOW} - interval '7 days' LIMIT {PURGE_BATCH})
"""

PURGE_PROCESSED_SQL = f"""
DELETE FROM processed_events WHERE (consumer, event_id) IN (
    SELECT consumer, event_id FROM processed_events
    WHERE processed_at < {NOW} - interval '14 days' LIMIT {PURGE_BATCH})
"""


def seconds_until_next_run(now: datetime | None = None) -> float:
    """Seconds from ``now`` (UTC) to the next 03:00 UTC."""
    now = now or datetime.now(UTC)
    target = now.replace(hour=RUN_AT_HOUR_UTC, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


class OutboxPurge:
    """Deletes expired outbox / ledger rows in bounded batches."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        """Purge expired rows through ``pool``."""
        self._pool = pool
        self._stop = asyncio.Event()

    async def purge(self) -> dict[str, int]:
        """Run one purge pass and return the deleted row counts."""
        outbox = await self._delete_in_batches(PURGE_OUTBOX_SQL)
        processed = await self._delete_in_batches(PURGE_PROCESSED_SQL)
        logger.info("Purged outbox_events=%d processed_events=%d", outbox, processed)
        return {"outbox": outbox, "processed": processed}

    async def _delete_in_batches(self, sql: str) -> int:
        total = 0
        while True:
            status = await self._pool.execute(sql)
            deleted = int(status.rsplit(" ", 1)[-1])
            total += deleted
            if deleted < PURGE_BATCH:
                return total

    async def run(self) -> None:
        """Purge every day at 03:00 UTC until :meth:`stop`."""
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), seconds_until_next_run())
                return
            except TimeoutError:
                pass
            try:
                await self.purge()
            except Exception as exc:
                logger.error("Outbox purge failed: %s", exc)

    def stop(self) -> None:
        """Ask :meth:`run` to return."""
        self._stop.set()
