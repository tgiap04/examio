"""Shared fixtures: real Postgres / RabbitMQ come from env, never from a ``.env`` file.

``AI_TEST_DATABASE_URL`` must point at a throwaway pgvector database where the
``ai_svc`` role owns schema ``ai`` (deploy/postgres/init/01-service-schemas.sh);
``AI_TEST_RABBITMQ_URL`` at a throwaway broker. Without them the integration
tests skip, unless ``REQUIRE_INTEGRATION=1`` (CI) turns the skip into a failure.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import dotenv
import pytest


def _no_dotenv(*_args: object, **_kwargs: object) -> bool:
    """Ignore ``load_dotenv`` calls made while the tests import service modules."""
    return False


# ``src.llm.config`` and ``src.llm.model_manager`` call ``load_dotenv()`` at import
# time. A developer's real ``.env`` (real API keys, a remote DATABASE_URL) must never
# reach the tests, so the call is a no-op for the whole session.
dotenv.load_dotenv = _no_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[3]
# Helper modules live next to the tests that use them (auth/, messaging/).
for _helpers in ("auth", "messaging"):
    sys.path.insert(0, str(Path(__file__).resolve().parent / _helpers))
SEARCH_PATH = {"search_path": "ai,extensions"}
TABLES = (
    '"Document", "DocumentEntity", "UserStorageGraph", "UserStorageGraphGroup",'
    " outbox_events, processed_events"
)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        if os.environ.get("REQUIRE_INTEGRATION") == "1":
            pytest.fail(f"{name} is required (REQUIRE_INTEGRATION=1)")
        pytest.skip(f"{name} not set: integration test needs a throwaway container")
    return value


@pytest.fixture(scope="session")
def database_url() -> str:
    """URL of the throwaway database (``ai_svc`` role)."""
    return _require("AI_TEST_DATABASE_URL")


@pytest.fixture(scope="session")
def rabbitmq_url() -> str:
    """URL of the throwaway broker."""
    return _require("AI_TEST_RABBITMQ_URL")


def run_alembic(database_url: str, *args: str) -> subprocess.CompletedProcess:
    """Run the alembic CLI with a minimal, explicit environment."""
    env = {
        "PATH": os.environ.get("PATH", ""),
        "DATABASE_URL": database_url,
        "DB_SEARCH_PATH": SEARCH_PATH["search_path"],
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=SERVICE_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.fixture(scope="session")
def migrated(database_url: str) -> str:
    """Bring schema ``ai`` to head once per session."""
    result = run_alembic(database_url, "upgrade", "head")
    assert result.returncode == 0, result.stderr
    return database_url


@pytest.fixture
async def pool(migrated: str) -> AsyncIterator[asyncpg.Pool]:
    """A pool on schema ``ai`` with every table emptied before the test."""
    created = await asyncpg.create_pool(migrated, min_size=1, max_size=4, server_settings=SEARCH_PATH)
    async with created.acquire() as conn:
        await conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    try:
        yield created
    finally:
        await created.close()
