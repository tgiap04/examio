"""Plain data carried between the GraphRAG steps."""

from __future__ import annotations

import os
import re
import unicodedata
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

ENTITY_TYPES = frozenset({"concept", "definition", "formula", "process", "example", "person_or_org", "other"})

# prompt, max_tokens -> raw completion text. Injected so tests never reach a model.
LLMComplete = Callable[[str, int], Awaitable[str]]

_WHITESPACE = re.compile(r"\s+")
_EDGE_PUNCTUATION = " .,;:!?\"'()[]{}<>«»“”‘’…–—-"  # not # + * / : "C#" and "C++" keep their symbol


def normalize_name(name: str) -> str:
    """Canonical key for matching entity names: NFKC, casefolded, single-spaced, edge punctuation trimmed.

    Diacritics are kept ("mã hóa" != "ma hoa"); telling those apart is the embedding step's job.
    """
    spaced = _WHITESPACE.sub(" ", unicodedata.normalize("NFKC", name)).strip().casefold()
    return spaced.strip(_EDGE_PUNCTUATION) or spaced


@dataclass(frozen=True)
class ExtractedEntity:
    """One entity an LLM found in a chunk."""

    name: str
    type: str
    description: str = ""


@dataclass(frozen=True)
class ExtractedRelationship:
    """A directed relation between two entity names of the same chunk."""

    source: str
    target: str
    description: str = ""
    strength: int = 5


@dataclass(frozen=True)
class ChunkExtraction:
    """Validated extraction result of one chunk."""

    chunk_id: str
    entities: list[ExtractedEntity] = field(default_factory=list)
    relationships: list[ExtractedRelationship] = field(default_factory=list)


@dataclass(frozen=True)
class GraphEntityRow:
    """A merged entity ready to be stored (one row of ``GraphEntity``)."""

    id: str
    name: str
    norm_name: str
    type: str
    description: str
    description_count: int
    degree: int = 0
    rank: float = 0.0  # degree / max degree of the document, 0..1
    embedding: list[float] | None = None  # of "name: description"; None until the embed step


@dataclass(frozen=True)
class GraphRelationshipRow:
    """A merged relationship ready to be stored (one row of ``GraphRelationship``)."""

    id: str
    source_id: str
    target_id: str
    description: str
    weight: float


@dataclass(frozen=True)
class GraphCommunityRow:
    """A detected community (one row of ``GraphCommunity``); title/summary/findings come from its report."""

    id: str
    level: int
    community_key: int
    parent_id: str | None
    entity_ids: list[str]
    size: int
    title: str = ""
    summary: str = ""
    findings: list[dict[str, str]] = field(default_factory=list)
    rating: float | None = None
    embedding: list[float] | None = None  # of "title: summary"; None when the report failed


@dataclass(frozen=True)
class GraphData:
    """Everything ``store.replace_graph`` writes for one document."""

    entities: list[GraphEntityRow]
    relationships: list[GraphRelationshipRow]
    links: list[tuple[str, str]]  # (chunk_id, entity_id)
    communities: list[GraphCommunityRow] = field(default_factory=list)


@dataclass(frozen=True)
class GraphragSettings:
    """Runtime knobs, read from the environment."""

    concurrency: int = 5
    max_tokens: int = 8192  # reasoning models (Faye-AI) spend most of it before the JSON
    llm_model: str | None = None
    merge_threshold: float = 0.92  # cosine at which two same-type entities become one
    build_timeout_minutes: float = 40.0  # one index build; a reasoning model needs ~10 s-60 s per call

    @classmethod
    def from_env(cls) -> GraphragSettings:
        """Read ``GRAPHRAG_CONCURRENCY`` / ``_MAX_TOKENS`` / ``_LLM_MODEL`` / ``_MERGE_THRESHOLD`` / ``_BUILD_TIMEOUT_MINUTES``."""
        return cls(
            concurrency=_positive_int("GRAPHRAG_CONCURRENCY", cls.concurrency),
            max_tokens=_positive_int("GRAPHRAG_MAX_TOKENS", cls.max_tokens),
            llm_model=os.environ.get("GRAPHRAG_LLM_MODEL", "").strip() or None,
            merge_threshold=_threshold("GRAPHRAG_MERGE_THRESHOLD", cls.merge_threshold),
            build_timeout_minutes=_positive_int("GRAPHRAG_BUILD_TIMEOUT_MINUTES", int(cls.build_timeout_minutes)),
        )


def _positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _threshold(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, "").strip())
    except ValueError:
        return default
    return value if 0.0 < value <= 1.0 else default


@dataclass(frozen=True)
class EntityHit:
    """An entity returned by a vector lookup; ``distance`` is cosine distance (lower is closer)."""

    id: str
    name: str
    type: str
    description: str
    rank: float
    distance: float


@dataclass(frozen=True)
class TextUnitHit:
    """A chunk (``Document`` row) linked to queried entities; ``matched`` = how many of them it mentions."""

    chunk_id: str
    page_range: str
    content: str
    matched: int
