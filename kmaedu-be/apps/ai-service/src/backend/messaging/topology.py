"""Broker topology, byte-identical to ``libs/messaging/src/topology.ts``.

Queue/exchange arguments must match what the Nest services declare: a mismatch
makes the broker answer ``PRECONDITION_FAILED`` and kills the channel.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import aio_pika

EVENTS_EXCHANGE = "kmaedu.events"
RETRY_DELAY_MS = 30_000
MAX_RETRIES = 5
PREFETCH = 1  # ai work is heavy (OCR + embeddings): one message at a time

# Routing keys this service consumes, and who may publish each domain.
CONSUMED_KEYS = ("document.uploaded", "document.deleted", "content.generation.requested")
ALLOWED_SOURCES: dict[str, frozenset[str]] = {
    "document": frozenset({"document"}),
    "content": frozenset({"content"}),
}


@dataclass(frozen=True)
class TopologyNames:
    """Per-service exchange and queue names."""

    events: str
    retry_exchange: str
    retry_queue: str
    requeue_exchange: str
    dead_exchange: str
    dlq: str


def topology_names(svc: str) -> TopologyNames:
    """Return the names ``declare_topology`` creates for ``svc``."""
    return TopologyNames(
        events=f"{svc}.events",
        retry_exchange=f"{svc}.retry",
        retry_queue=f"{svc}.retry.30s",
        requeue_exchange=f"{svc}.requeue",
        dead_exchange=f"{svc}.dead",
        dlq=f"{svc}.dlq",
    )


@dataclass
class Topology:
    """Declared exchanges/queues (handles needed after declaration)."""

    names: TopologyNames
    events_exchange: aio_pika.abc.AbstractExchange
    retry_exchange: aio_pika.abc.AbstractExchange
    events_queue: aio_pika.abc.AbstractQueue


async def declare_topology(channel: aio_pika.abc.AbstractChannel, svc: str) -> Topology:
    """Idempotently declare the shared topic exchange and the per-service topology.

    Retry and DLQ routing use per-service fanout exchanges (never the default
    exchange): fanout without ``x-dead-letter-routing-key`` keeps the original
    routing key while dead-lettering.
    """
    n = topology_names(svc)
    events_exchange = await channel.declare_exchange(
        EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    fanouts: dict[str, aio_pika.abc.AbstractExchange] = {}
    for name in (n.retry_exchange, n.requeue_exchange, n.dead_exchange):
        fanouts[name] = await channel.declare_exchange(
            name, aio_pika.ExchangeType.FANOUT, durable=True
        )
    events_args: dict[str, Any] = {"x-dead-letter-exchange": n.dead_exchange}
    retry_args: dict[str, Any] = {
        "x-message-ttl": RETRY_DELAY_MS,
        "x-dead-letter-exchange": n.requeue_exchange,
    }
    events_queue = await channel.declare_queue(n.events, durable=True, arguments=events_args)
    retry_queue = await channel.declare_queue(n.retry_queue, durable=True, arguments=retry_args)
    dlq = await channel.declare_queue(n.dlq, durable=True)
    await retry_queue.bind(fanouts[n.retry_exchange], routing_key="")
    await events_queue.bind(fanouts[n.requeue_exchange], routing_key="")
    await dlq.bind(fanouts[n.dead_exchange], routing_key="")
    return Topology(
        names=n,
        events_exchange=events_exchange,
        retry_exchange=fanouts[n.retry_exchange],
        events_queue=events_queue,
    )
