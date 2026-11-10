"""Claim-then-publish outbox relay, the Python twin of ``outbox-relay.service.ts``.

The claim is ONE autocommitted statement (a short tx that sets ``locked_until``),
the broker round-trip happens with no DB lock held, and the outcome is marked
afterwards. A crash between publish and mark re-publishes once the 30 s claim
lock expires; consumers dedupe on the event id.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import asyncpg

from .outbox import SOURCE
from .publisher import Publisher
from .topology import EVENTS_EXCHANGE

logger = logging.getLogger(__name__)

# Columns are TIMESTAMP(3) without time zone holding UTC (Prisma convention).
NOW = "(now() AT TIME ZONE 'UTC')"

POLL_SECONDS = 0.5
BATCH = 100
LOCK_SECONDS = 30
STALE_CHECK_SECONDS = 60
STALE_AFTER_MINUTES = 5

CLAIM_SQL = f"""
UPDATE outbox_events SET locked_until = {NOW} + interval '{LOCK_SECONDS} seconds'
WHERE seq IN (
    SELECT seq FROM outbox_events
    WHERE source = $1 AND published_at IS NULL AND next_attempt_at <= {NOW}
      AND (locked_until IS NULL OR locked_until < {NOW})
    ORDER BY seq LIMIT {BATCH} FOR UPDATE SKIP LOCKED)
RETURNING seq, envelope, attempts
"""

MARK_PUBLISHED_SQL = f"""
UPDATE outbox_events SET published_at = {NOW}, locked_until = NULL
WHERE seq = ANY($1::bigint[])
"""

MARK_FAILED_SQL = f"""
UPDATE outbox_events AS o
SET attempts = o.attempts + 1,
    next_attempt_at = {NOW} + make_interval(secs => LEAST(power(2, o.attempts), 300)),
    last_error = f.err,
    locked_until = NULL
FROM unnest($1::bigint[], $2::text[]) AS f(seq, err)
WHERE o.seq = f.seq
"""

STALE_SQL = f"""
SELECT count(*)::int AS n FROM outbox_events
WHERE source = $1 AND published_at IS NULL
  AND created_at < {NOW} - interval '{STALE_AFTER_MINUTES} minutes'
"""


@dataclass(frozen=True)
class _Row:
    seq: int
    envelope: dict[str, Any]


def _as_dict(raw: Any) -> dict[str, Any]:
    return json.loads(raw) if isinstance(raw, str | bytes) else raw


class OutboxRelay:
    """Publishes unpublished ``outbox_events`` rows of ``source`` in ``seq`` order."""

    def __init__(self, pool: asyncpg.Pool, publisher: Publisher, source: str = SOURCE) -> None:
        """Relay rows of ``source`` from ``pool`` (the relay pool) through ``publisher``."""
        self._pool = pool
        self._publisher = publisher
        self._source = source
        self._stop = asyncio.Event()
        self._last_stale_check = 0.0

    async def run(self) -> None:
        """Poll until :meth:`stop`; a failing tick is logged, never fatal."""
        while not self._stop.is_set():
            claimed = 0
            try:
                claimed = await self.tick()
                await self._check_stale()
            except Exception as exc:
                logger.error("Outbox relay tick failed: %s", exc)
            if claimed < BATCH:  # drain a full backlog without sleeping
                try:
                    await asyncio.wait_for(self._stop.wait(), POLL_SECONDS)
                except TimeoutError:
                    pass

    def stop(self) -> None:
        """Ask :meth:`run` to finish its current tick and return."""
        self._stop.set()

    async def tick(self) -> int:
        """One claim / publish / mark cycle; returns the number of rows claimed."""
        claimed = await self._pool.fetch(CLAIM_SQL, self._source)
        rows = sorted((_Row(r["seq"], _as_dict(r["envelope"])) for r in claimed), key=lambda r: r.seq)
        if not rows:
            return 0

        results = await asyncio.gather(*(self._publish(r) for r in rows), return_exceptions=True)
        published: list[int] = []
        failed: list[tuple[int, BaseException]] = []
        for row, res in zip(rows, results, strict=True):
            if isinstance(res, BaseException):
                logger.warning(
                    "Outbox publish failed id=%s type=%s: %s",
                    row.envelope.get("id"), row.envelope.get("type"), res,
                )
                failed.append((row.seq, res))
            else:
                published.append(row.seq)
        if published:
            await self._pool.execute(MARK_PUBLISHED_SQL, published)
        if failed:
            await self._pool.execute(
                MARK_FAILED_SQL,
                [seq for seq, _ in failed],
                [str(err)[:500] or type(err).__name__ for _, err in failed],
            )
        return len(rows)

    async def _publish(self, row: _Row) -> None:
        envelope = row.envelope
        await self._publisher.publish(
            EVENTS_EXCHANGE,
            envelope["type"],
            json.dumps(envelope).encode(),
            message_id=envelope["id"],
        )

    async def _check_stale(self) -> None:
        """Alert hook: any row unpublished for more than 5 minutes logs at error level."""
        now = time.monotonic()
        if now - self._last_stale_check < STALE_CHECK_SECONDS:
            return
        self._last_stale_check = now
        count = await self._pool.fetchval(STALE_SQL, self._source)
        if count:
            logger.error(
                "ALERT outbox: %d event(s) unpublished for more than %d minutes (source=%s)",
                count, STALE_AFTER_MINUTES, self._source,
            )
