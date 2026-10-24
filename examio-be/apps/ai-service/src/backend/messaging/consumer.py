"""Idempotent aio-pika consumer, the Python twin of ``event-consumer.service.ts``.

One queue ``ai.events``, ONE retry tier (``ai.retry.30s``, TTL 30 s, DLX back to
``ai.events``) and ``ai.dlq``. A delivery is settled exactly once: acked on
success, re-published to the retry exchange (then acked) on a transient failure,
or nacked without requeue (-> DLQ) when the failure is permanent or the retry
budget (``MAX_RETRIES``) is spent.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable

import aio_pika
import asyncpg

from . import envelope as env
from .delivery import Delivery, Handler, HandlerContext
from .errors import PermanentEventError
from .publisher import AmqpPublisher, Publisher
from .topology import (
    ALLOWED_SOURCES,
    MAX_RETRIES,
    PREFETCH,
    declare_topology,
    topology_names,
)

logger = logging.getLogger(__name__)

SERVICE = "ai"

INSERT_PROCESSED_SQL = """
INSERT INTO processed_events (consumer, event_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING
"""


class EventConsumer:
    """Routes validated envelopes to handlers with dedupe, retry and DLQ."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        handlers: dict[str, Handler],
        publisher: Publisher | None,
        service: str = SERVICE,
    ) -> None:
        """Create a consumer; ``publisher`` is set by :meth:`start` when ``None``."""
        self._pool = pool
        self._handlers = handlers
        self._publisher = publisher
        self._service = service
        self._names = topology_names(service)
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._queue: aio_pika.abc.AbstractQueue | None = None
        self._consumer_tag: str | None = None
        self._inflight = 0
        self._idle = asyncio.Event()
        self._idle.set()

    @property
    def publisher(self) -> Publisher:
        """The confirm-mode publisher (available after :meth:`start`)."""
        if self._publisher is None:
            raise RuntimeError("consumer is not connected")
        return self._publisher

    # ------------------------------------------------------------------ run

    async def start(self, url: str) -> None:
        """Connect, declare the topology, bind the handled keys and start consuming."""
        connection = await aio_pika.connect_robust(url)
        self._connection = connection
        publish_channel = await connection.channel()
        self._publisher = AmqpPublisher(publish_channel)
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=PREFETCH)
        topology = await declare_topology(channel, self._service)
        for key in self._handlers:
            await topology.events_queue.bind(topology.events_exchange, routing_key=key)
        self._queue = topology.events_queue
        self._consumer_tag = await topology.events_queue.consume(self.handle_message)
        logger.info("Consuming %s (keys=%s)", self._names.events, sorted(self._handlers))

    async def stop(self, drain_seconds: float = 20.0) -> None:
        """Stop consuming, let the in-flight delivery finish (bounded), then disconnect."""
        if self._queue is not None and self._consumer_tag is not None:
            try:
                await self._queue.cancel(self._consumer_tag)
            except Exception as exc:
                logger.warning("Could not cancel the consumer: %s", exc)
            self._consumer_tag = None
        try:
            await asyncio.wait_for(self._idle.wait(), drain_seconds)
        except TimeoutError:
            logger.warning("Closing with a delivery still in flight; the broker will redeliver it")
        if self._connection is not None:
            await self._connection.close()
            self._connection = None

    # -------------------------------------------------------------- deliver

    async def handle_message(self, message: Delivery) -> None:
        """Process one delivery; always settles it (ack, retry-then-ack, or nack to DLQ)."""
        routing_key = message.routing_key or ""
        envelope: env.Envelope | None = None
        retries = _retry_count(message)
        self._inflight += 1
        self._idle.clear()
        try:
            envelope = self._validate(routing_key, message)
            handler = self._handlers.get(routing_key)
            if handler is None:
                raise PermanentEventError("NO_HANDLER", f"No handler for {routing_key}")
            await self._run(handler, envelope, retries)
            await self._settle(message.ack())
        except Exception as exc:
            await self._fail(message, envelope, retries, exc)
        finally:
            self._inflight -= 1
            if self._inflight == 0:
                self._idle.set()

    def _validate(self, routing_key: str, message: Delivery) -> env.Envelope:
        envelope = env.parse(message.body)
        domain = env.domain_of(routing_key)
        allowed = ALLOWED_SOURCES.get(domain, frozenset({domain}))
        if envelope.type != routing_key or envelope.source not in allowed:
            logger.error(
                "SOURCE_MISMATCH id=%s type=%s source=%s routingKey=%s",
                envelope.id, envelope.type, envelope.source, routing_key,
            )
            raise PermanentEventError("SOURCE_MISMATCH", "Envelope disagrees with routing key")
        return envelope

    async def _run(self, handler: Handler, envelope: env.Envelope, retries: int) -> None:
        async with self._pool.acquire() as conn, conn.transaction():
            status = await conn.execute(INSERT_PROCESSED_SQL, self._service, envelope.id)
            if status.endswith(" 0"):
                logger.debug("Duplicate delivery skipped id=%s", envelope.id)
                return
            await handler(HandlerContext(envelope, conn, retries))

    async def _fail(
        self,
        message: Delivery,
        envelope: env.Envelope | None,
        retries: int,
        exc: Exception,
    ) -> None:
        key = message.routing_key or ""
        ref = f"id={envelope.id if envelope else message.message_id} type={envelope.type if envelope else key}"
        if isinstance(exc, PermanentEventError) or retries >= MAX_RETRIES:
            reason = exc.code if isinstance(exc, PermanentEventError) else "RETRIES_EXHAUSTED"
            logger.error("Dead-lettering %s reason=%s", ref, reason, exc_info=reason == "RETRIES_EXHAUSTED")
            await self._settle(message.nack(requeue=False))
            return
        logger.warning("Retry %d/%d %s: %s", retries + 1, MAX_RETRIES, ref, exc)
        try:
            await self.publisher.publish(
                self._names.retry_exchange,
                key,
                message.body,
                message_id=message.message_id,
                headers={"x-retry-count": retries + 1},
                content_type=message.content_type or "application/json",
            )
        except Exception as publish_exc:
            # The retry copy was not confirmed: give the original back to the queue.
            logger.error("Retry publish failed %s: %s", ref, publish_exc)
            await self._settle(message.nack(requeue=True))
            return
        await self._settle(message.ack())

    @staticmethod
    async def _settle(action: Awaitable[None]) -> None:
        """Run ack/nack, tolerating a closed channel (the broker redelivers; dedupe absorbs it)."""
        try:
            await action
        except Exception as exc:
            logger.warning("Could not settle delivery: %s", exc)


def _retry_count(message: Delivery) -> int:
    raw = (message.headers or {}).get("x-retry-count", 0)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0
