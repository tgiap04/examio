"""Readers for event payload fields, shared by the event handlers."""

from __future__ import annotations

from typing import Any

from .errors import PermanentEventError


def required_text(data: Any, key: str) -> str:
    """Return the non-empty string ``data[key]``; anything else is a permanent payload error."""
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, str) or not value:
        raise PermanentEventError("INVALID_PAYLOAD", f"missing {key}")
    return value


def optional_text(value: Any) -> str | None:
    """Return ``value`` when it is a non-empty string, else ``None``."""
    return value if isinstance(value, str) and value else None
