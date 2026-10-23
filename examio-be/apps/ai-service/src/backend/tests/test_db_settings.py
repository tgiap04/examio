"""Tests for the ai-service PostgreSQL settings helpers."""

import asyncio

from src.backend.services.graph_storage_service import GraphStorageService
from src.db_settings import (
    DEFAULT_POOL_MAX,
    DEFAULT_SEARCH_PATH,
    pg_server_settings,
    pool_max_size,
    runtime_ddl_enabled,
)


def test_search_path_defaults_to_exam_and_extensions(monkeypatch):
    """Without DB_SEARCH_PATH the pool pins exam,extensions."""
    monkeypatch.delenv("DB_SEARCH_PATH", raising=False)
    assert pg_server_settings() == {"search_path": "exam,extensions"}
    assert DEFAULT_SEARCH_PATH == "exam,extensions"


def test_search_path_is_overridable_and_blank_falls_back(monkeypatch):
    """DB_SEARCH_PATH overrides the default; a blank value falls back."""
    monkeypatch.setenv("DB_SEARCH_PATH", "ai,extensions")
    assert pg_server_settings() == {"search_path": "ai,extensions"}
    monkeypatch.setenv("DB_SEARCH_PATH", "  ")
    assert pg_server_settings() == {"search_path": "exam,extensions"}


def test_runtime_ddl_is_off_unless_explicitly_enabled(monkeypatch):
    """Runtime DDL stays off unless AI_RUNTIME_DDL is truthy."""
    monkeypatch.delenv("AI_RUNTIME_DDL", raising=False)
    assert runtime_ddl_enabled() is False
    monkeypatch.setenv("AI_RUNTIME_DDL", "false")
    assert runtime_ddl_enabled() is False
    monkeypatch.setenv("AI_RUNTIME_DDL", "true")
    assert runtime_ddl_enabled() is True


def test_ensure_graph_schema_issues_no_ddl_when_disabled(monkeypatch):
    """With the guard off, ensure_graph_schema never opens a pool."""
    monkeypatch.delenv("AI_RUNTIME_DDL", raising=False)
    service = GraphStorageService()

    async def fail_pool():
        raise AssertionError("must not open a pool (and so run DDL) while AI_RUNTIME_DDL is off")

    monkeypatch.setattr(service, "_get_pool", fail_pool)
    asyncio.run(service.ensure_graph_schema())


def test_default_pool_sizes_fit_the_ai_svc_connection_limit():
    """The five pools together stay well under ai_svc CONNECTION LIMIT 40."""
    assert sum(DEFAULT_POOL_MAX.values()) <= 30


def test_pool_max_size_is_overridable_and_bad_values_fall_back(monkeypatch):
    """AI_DB_POOL_MAX_<NAME> overrides; blank, junk, zero and negative fall back to the default."""
    monkeypatch.delenv("AI_DB_POOL_MAX_OCR", raising=False)
    assert pool_max_size("OCR") == DEFAULT_POOL_MAX["OCR"]
    monkeypatch.setenv("AI_DB_POOL_MAX_OCR", "3")
    assert pool_max_size("OCR") == 3
    for bad in ("", "abc", "0", "-2"):
        monkeypatch.setenv("AI_DB_POOL_MAX_OCR", bad)
        assert pool_max_size("OCR") == DEFAULT_POOL_MAX["OCR"]
