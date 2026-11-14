"""Assemble a chat context from labelled sections within a character budget."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SEPARATOR = "\n\n"
MIN_ITEM_CHARS = 40  # a section is cut here rather than ending in a stub of a few characters
SOURCE_CONTENT_CHARS = 300


@dataclass(frozen=True)
class Section:
    """A titled group of text items that may use ``share`` (0..1) of the budget, plus what earlier sections left."""

    title: str
    items: list[str]
    share: float


@dataclass(frozen=True)
class SourceUnit:
    """A text unit (a stored chunk) offered to the model and cited back to the user."""

    chunk_id: str
    page_range: str
    title: str | None
    content: str


@dataclass(frozen=True)
class QueryOutcome:
    """What one search step hands to ``graphrag_retrieval``."""

    context: str | None
    sources: list[dict[str, Any]]
    entities: int = 0
    reports: int = 0
    units: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


def build_context(sections: list[Section], budget: int) -> str | None:
    """Join the non-empty sections, each cut to its share of ``budget`` (unused share rolls forward).

    The result is never longer than ``budget``; a section without items prints no title.
    """
    parts: list[str] = []
    spare = 0
    for section in sections:
        limit = int(budget * section.share) + spare - (len(SEPARATOR) if parts else 0)
        text = _fit(section, limit)
        spare = max(0, limit - len(text))
        if text:
            parts.append(text)
    return SEPARATOR.join(parts)[:budget].strip() or None


def _fit(section: Section, limit: int) -> str:
    lines = [f"## {section.title}"]
    used = len(lines[0])
    for item in section.items:
        remaining = limit - used - 1  # the newline in front of this item
        if remaining < MIN_ITEM_CHARS and lines[1:]:
            break
        if remaining <= 0:
            break
        line = item if len(item) <= remaining else item[:remaining].rstrip()
        if not line:
            continue
        lines.append(line)
        used += len(line) + 1
        if len(line) < len(item):
            break
    return "\n".join(lines) if lines[1:] else ""


def format_unit(unit: SourceUnit) -> str:
    """One excerpt line with its page, as the previous retriever wrote it."""
    return f"[Trang {unit.page_range}]: {unit.content}"


def dedupe_units(units: list[SourceUnit]) -> list[SourceUnit]:
    """Drop repeated chunk ids, keeping the first occurrence."""
    seen: set[str] = set()
    unique: list[SourceUnit] = []
    for unit in units:
        if unit.chunk_id not in seen:
            seen.add(unit.chunk_id)
            unique.append(unit)
    return unique


def build_sources(units: list[SourceUnit], limit: int) -> list[dict[str, Any]]:
    """Citation dicts in the shape ai-chat and the web client already read (``content``, ``page``, ``title``, ``chunkId``)."""
    return [
        {"content": u.content[:SOURCE_CONTENT_CHARS], "page": u.page_range, "title": u.title, "chunkId": u.chunk_id}
        for u in dedupe_units(units)[:limit]
    ]
