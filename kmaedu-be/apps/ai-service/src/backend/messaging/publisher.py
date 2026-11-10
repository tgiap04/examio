"""Confirmed publishing through aio-pika, behind a tiny protocol the tests fake."""

from __future__ import annotations

from typing import Protocol

import aio_pika
from aio_pika.abc import AbstractRobustChannel


class Publisher(Protocol):
    """Anything that can publish a raw message and resolve on broker confirm."""

    async def publish(
        self,
        exchange: str,
        routing_key: str,
        body: bytes,
        *,
        message_id: str | None = None,
        headers: dict[str, int] | None = None,
        content_type: str = "application/json",
    ) -> None:
        """Publish ``body`` and return once the broker confirmed it."""
        ...


class AmqpPublisher:
    """Publishes on a confirm-mode channel (aio-pika enables confirms by default)."""

    def __init__(self, channel: AbstractRobustChannel, timeout: float = 10.0) -> None:
        """Publish on ``channel``; a confirm slower than ``timeout`` seconds is a failure."""
        self._channel = channel
        self._timeout = timeout

    async def publish(
        self,
        exchange: str,
        routing_key: str,
        body: bytes,
        *,
        message_id: str | None = None,
        headers: dict[str, int] | None = None,
        content_type: str = "application/json",
    ) -> None:
        """Publish persistently; raises on nack, return or timeout."""
        target = await self._channel.get_exchange(exchange, ensure=False)
        await target.publish(
            aio_pika.Message(
                body,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                message_id=message_id,
                content_type=content_type,
                headers=headers or {},
            ),
            routing_key=routing_key,
            timeout=self._timeout,
        )
