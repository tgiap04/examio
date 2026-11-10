"""Delivery / handler types shared by the consumer and the event handlers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

import asyncpg

from . import envelope as env
from .topology import MAX_RETRIES


class Delivery(Protocol):
    """The slice of ``aio_pika.IncomingMessage`` the consumer uses."""

    routing_key: str | None
    body: bytes
    headers: dict[str, Any] | None
    message_id: str | None
    content_type: str | None

    async def ack(self) -> None:
        """Acknowledge the delivery."""
        ...

    async def nack(self, requeue: bool = ...) -> None:
        """Reject the delivery."""
        ...


@dataclass(frozen=True)
class HandlerContext:
    """Everything a handler needs; ``conn`` is inside the dedupe transaction."""

    envelope: env.Envelope
    conn: asyncpg.Connection
    retry_count: int

    @property
    def is_last_attempt(self) -> bool:
        """True when a failure now dead-letters instead of retrying."""
        return self.retry_count >= MAX_RETRIES


Handler = Callable[[HandlerContext], Awaitable[None]]
