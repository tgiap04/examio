"""Event envelope v1, identical to ``libs/messaging/src/envelope.ts``.

``{id: "evt_<ulid>", type, version: 1, occurredAt, source, correlationId, data}``.
``type`` doubles as the routing key and its first segment is the owning domain,
which must equal ``source``. There is no ``traceparent`` yet (deferred).
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from .errors import PermanentEventError

ENVELOPE_VERSION = 1

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_EVENT_ID = re.compile(r"^evt_")


def ulid() -> str:
    """Return a 26-char ULID: 48-bit millisecond timestamp + 80 random bits."""
    value = (int(time.time() * 1000) << 80) | int.from_bytes(os.urandom(10), "big")
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def domain_of(routing_key: str) -> str:
    """Return the owning domain: the routing key's first segment."""
    return routing_key.split(".", 1)[0]


@dataclass(frozen=True)
class Envelope:
    """A validated event envelope."""

    id: str
    type: str
    version: int
    occurredAt: str  # noqa: N815 - wire name
    source: str
    correlationId: str  # noqa: N815 - wire name
    data: Any

    def to_dict(self) -> dict[str, Any]:
        """Return the JSON-serialisable wire form."""
        return asdict(self)


def build(
    type: str,  # noqa: A002 - mirrors the TS signature
    data: Any,
    source: str,
    correlation_id: str | None = None,
) -> Envelope:
    """Create an envelope; ``source`` must equal the domain of ``type``."""
    if domain_of(type) != source:
        raise ValueError(
            f'Envelope source "{source}" must equal the domain of type "{type}"'
        )
    return Envelope(
        id=f"evt_{ulid()}",
        type=type,
        version=ENVELOPE_VERSION,
        occurredAt=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        source=source,
        correlationId=correlation_id or f"cor_{ulid()}",
        data=data,
    )


def _invalid_envelope() -> PermanentEventError:
    return PermanentEventError("INVALID_ENVELOPE", "Envelope failed schema validation")


def parse(body: bytes | str) -> Envelope:
    """Validate an inbound payload; every failure is permanent (never retried)."""
    try:
        raw = json.loads(body)
    except (ValueError, TypeError) as exc:
        raise PermanentEventError("INVALID_JSON", "Body is not valid JSON") from exc
    if not isinstance(raw, dict):
        raise _invalid_envelope()

    def _text(key: str) -> str:
        value = raw.get(key)
        if not isinstance(value, str) or not value:
            raise _invalid_envelope()
        return value

    event_id = _text("id")
    if not _EVENT_ID.match(event_id) or "data" not in raw:
        raise _invalid_envelope()
    version = raw.get("version")
    if isinstance(version, bool) or not isinstance(version, int | float):
        raise _invalid_envelope()
    envelope = Envelope(
        id=event_id,
        type=_text("type"),
        version=version,
        occurredAt=_text("occurredAt"),
        source=_text("source"),
        correlationId=_text("correlationId"),
        data=raw["data"],
    )
    if envelope.version != ENVELOPE_VERSION:
        raise PermanentEventError(
            "UNSUPPORTED_VERSION", f"Unsupported envelope version {envelope.version}"
        )
    return envelope
