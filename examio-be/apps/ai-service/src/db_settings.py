"""Shared PostgreSQL settings for every asyncpg pool the ai-service opens.

The service connects as the ``ai_svc`` role. Per-service schemas mean the role
has no useful default ``search_path`` of its own for the tables it still reads
(exam-owned until phase 15), so each pool pins it explicitly. Moving to the
``ai`` schema later is an env change (``DB_SEARCH_PATH=ai,extensions``), not a
role change.
"""

import os
from typing import Dict

DEFAULT_SEARCH_PATH = "exam,extensions"


def pg_server_settings() -> Dict[str, str]:
    """Return the ``server_settings`` mapping for ``asyncpg.create_pool``."""
    search_path = os.environ.get("DB_SEARCH_PATH", "").strip() or DEFAULT_SEARCH_PATH
    return {"search_path": search_path}


# Default asyncpg ``max_size`` per pool. ai-service opens five pools, and the ``ai_svc`` role has
# CONNECTION LIMIT 40 (deploy/postgres/init/01-service-schemas.sh): 6+6+4+6+6 = 28 stays under it
# with headroom for ad-hoc connections. Override a pool with ``AI_DB_POOL_MAX_<NAME>``.
DEFAULT_POOL_MAX = {
    "GENERATION": 6,
    "GRAPH": 6,
    "ENTITY": 4,
    "OCR": 6,
    "VECTOR": 6,
}


def pool_max_size(name: str) -> int:
    """Return the asyncpg ``max_size`` for pool ``name`` (env ``AI_DB_POOL_MAX_<NAME>`` or default).

    A missing, blank, non-numeric or non-positive override falls back to the default.
    """
    default = DEFAULT_POOL_MAX[name]
    raw = os.environ.get(f"AI_DB_POOL_MAX_{name}", "").strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value >= 1 else default


def runtime_ddl_enabled() -> bool:
    """Whether the service may run CREATE TABLE/INDEX at startup (default: no).

    Schema changes ship as Prisma migrations run by the ``*-migrate`` containers;
    the ai_svc role is not meant to hold CREATE on the shared tables.
    """
    return os.environ.get("AI_RUNTIME_DDL", "false").strip().lower() in {"1", "true", "yes"}
