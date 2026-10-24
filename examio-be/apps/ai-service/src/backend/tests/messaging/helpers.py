"""Fakes shared by the messaging tests (no broker needed)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from src.backend.messaging import envelope as env


@dataclass
class FakeMessage:
    """Stands in for ``aio_pika.IncomingMessage``."""

    routing_key: str
    body: bytes
    headers: dict[str, Any] = field(default_factory=dict)
    message_id: str | None = None
    content_type: str | None = "application/json"
    acked: bool = False
    nacked: bool = False
    requeued: bool | None = None

    async def ack(self) -> None:
        """Record an ack."""
        self.acked = True

    async def nack(self, requeue: bool = True) -> None:
        """Record a nack."""
        self.nacked = True
        self.requeued = requeue


@dataclass
class FakePublisher:
    """Records publishes; ``fail`` makes every publish raise."""

    published: list[dict[str, Any]] = field(default_factory=list)
    fail: bool = False

    async def publish(self, exchange, routing_key, body, *, message_id=None, headers=None, content_type="application/json"):
        """Record (or reject) a publish."""
        if self.fail:
            raise ConnectionError("broker unavailable")
        self.published.append(
            {"exchange": exchange, "routing_key": routing_key, "body": body, "message_id": message_id, "headers": headers}
        )


def message_for(type_: str, data: Any, source: str | None = None, headers: dict | None = None) -> FakeMessage:
    """Build a delivery carrying a valid envelope (``source`` overridable)."""
    envelope = env.build(type_, data, source or env.domain_of(type_))
    body = envelope.to_dict()
    return FakeMessage(type_, json.dumps(body).encode(), headers or {}, envelope.id)


def raw_message(type_: str, envelope_dict: dict[str, Any]) -> FakeMessage:
    """Build a delivery from a hand-made envelope dict."""
    return FakeMessage(type_, json.dumps(envelope_dict).encode(), {}, envelope_dict.get("id"))
