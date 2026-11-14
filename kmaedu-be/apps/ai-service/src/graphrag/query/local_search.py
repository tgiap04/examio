"""Local search: find the entities a question is about and gather what surrounds them.

Question -> nearest entities -> their relationships (among them, then one step out),
the level-1 reports of their communities and the chunks that mention them. The pieces
are laid out as labelled sections: reports 20%, entities and relationships 20%, excerpts 60%.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import asyncpg

from .. import reads
from . import chat_reads
from .context_builder import (
    QueryOutcome,
    Section,
    build_context,
    build_sources,
    dedupe_units,
    format_unit,
)

# question text -> its query embedding. Injected so tests never reach a model.
QueryEmbedder = Callable[[str], Awaitable[list[float]]]

TOP_ENTITIES = 10
MAX_RELATIONSHIPS = 30
MAX_REPORTS = 3
REPORT_LEVEL = 1
SOURCE_LIMIT = 3  # citations shown to the user, as the previous retriever did


async def local_search(
    pool: asyncpg.Pool,
    storage_id: str,
    query: str,
    embedder: QueryEmbedder,
    *,
    max_units: int,
    max_content_length: int,
) -> QueryOutcome | None:
    """Return the local context for ``query``, or ``None`` when the document has no entity to anchor on."""
    vector = await embedder(query)
    entities = await reads.top_entities_by_vector(pool, storage_id, vector, TOP_ENTITIES)
    if not entities:
        return None
    ids = [e.id for e in entities]
    relationships, reports, units = await asyncio.gather(
        chat_reads.relationships_around(pool, storage_id, ids, MAX_RELATIONSHIPS),
        chat_reads.reports_for_entities(pool, storage_id, ids, REPORT_LEVEL, MAX_REPORTS),
        chat_reads.units_for_entities(pool, storage_id, ids, vector, max_units),
    )
    units = dedupe_units(units)
    graph_lines = [f"- {e.name} ({e.type}): {e.description}" if e.description else f"- {e.name} ({e.type})" for e in entities]
    graph_lines += [f"- {r.source} -> {r.target}: {r.description}" if r.description else f"- {r.source} -> {r.target}" for r in relationships]
    context = build_context(
        [
            Section("Báo cáo chủ đề", [f"{r.title}: {r.summary}" for r in reports], 0.2),
            Section("Thực thể và quan hệ", graph_lines, 0.2),
            Section("Trích đoạn tài liệu", [format_unit(u) for u in units], 0.6),
        ],
        max_content_length,
    )
    return QueryOutcome(
        context,
        build_sources(units, SOURCE_LIMIT),
        entities=len(entities),
        reports=len(reports),
        units=len(units),
        metadata={"relationships": len(relationships)},
    )
