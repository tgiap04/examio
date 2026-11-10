"""Transactional outbox writer: the event is published iff the caller's tx commits."""

from __future__ import annotations

import json
from typing import Any

import asyncpg

from . import envelope as env

SOURCE = "ai"

INSERT_SQL = """
INSERT INTO outbox_events (id, source, type, envelope)
VALUES ($1, $2, $3, $4::jsonb)
"""


async def add(
    conn: asyncpg.Connection,
    type: str,  # noqa: A002 - mirrors the envelope field
    data: Any,
    correlation_id: str | None = None,
) -> env.Envelope:
    """Record ``type`` in the outbox on ``conn`` (call inside the business transaction)."""
    envelope = env.build(type, data, SOURCE, correlation_id)
    await conn.execute(INSERT_SQL, envelope.id, envelope.source, type, json.dumps(envelope.to_dict()))
    return envelope
