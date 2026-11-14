"""Alembic baseline: upgrade head on an empty schema, hand-written DDL, downgrade."""

from conftest import run_alembic

LEGACY = {"DocumentEntity", "UserStorageGraph", "UserStorageGraphGroup"}  # dropped by 0003
EXPECTED = {"Document", "outbox_events", "processed_events", "alembic_version"}
GRAPHRAG = {"GraphIndex", "GraphEntity", "GraphRelationship", "GraphTextUnitEntity", "GraphCommunity"}
TABLES = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai'"


async def test_upgrade_head_on_an_empty_schema_then_downgrade_then_upgrade(database_url, pool):
    assert run_alembic(database_url, "downgrade", "base").returncode == 0
    assert {r["table_name"] for r in await pool.fetch(TABLES)} <= {"alembic_version"}  # empty schema

    up = run_alembic(database_url, "upgrade", "head")
    assert up.returncode == 0, up.stderr
    assert {r["table_name"] for r in await pool.fetch(TABLES)} == EXPECTED | GRAPHRAG
    assert await pool.fetchval("SELECT version_num FROM ai.alembic_version") == "0003"
    assert run_alembic(database_url, "upgrade", "head").returncode == 0  # idempotent at head


async def test_baseline_keeps_the_columns_the_service_queries_rely_on(database_url, pool):
    run_alembic(database_url, "upgrade", "head")
    udt = "SELECT udt_name, udt_schema FROM information_schema.columns WHERE table_schema='ai' AND table_name='Document' AND column_name='embeddings'"
    row = await pool.fetchrow(udt)
    assert (row["udt_name"], row["udt_schema"]) == ("vector", "extensions")  # pgvector from the shared schema
    fks = await pool.fetch(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname='ai' AND contype='f'"
    )
    assert [f["conname"] for f in fks] == []  # no FK to UserStorage; the only one went with UserStorageGraphGroup
    indexes = {r["indexname"] for r in await pool.fetch("SELECT indexname FROM pg_indexes WHERE schemaname='ai'")}
    assert {"Document_userStorageId_createdAt_idx", "outbox_events_unpublished_idx"} <= indexes


async def test_0002_downgrade_drops_only_the_graphrag_tables_and_keeps_data(database_url, pool):
    run_alembic(database_url, "upgrade", "head")
    await pool.execute(
        'INSERT INTO "Document" (id, "userStorageId", "pageRange", content, embeddings)'
        " VALUES ('d1', 's1', '1', 'text', '[1,2,3]'::vector)"
    )
    down = run_alembic(database_url, "downgrade", "0001")
    assert down.returncode == 0, down.stderr
    assert {r["table_name"] for r in await pool.fetch(TABLES)} == EXPECTED | LEGACY
    assert await pool.fetchval("SELECT version_num FROM ai.alembic_version") == "0001"
    assert await pool.fetchval('SELECT count(*) FROM "Document"') == 1  # 0001 tables untouched
    assert run_alembic(database_url, "upgrade", "head").returncode == 0  # and it can come back


async def test_0002_adds_the_graphrag_indexes_vector_columns_and_no_foreign_keys(database_url, pool):
    run_alembic(database_url, "upgrade", "head")
    indexes = {r["indexname"] for r in await pool.fetch("SELECT indexname FROM pg_indexes WHERE schemaname='ai'")}
    assert {
        "GraphIndex_status_nextAttemptAt_idx",
        "GraphEntity_userStorageId_type_normName_key",
        "GraphEntity_userStorageId_idx",
        "GraphRelationship_userStorageId_idx",
        "GraphRelationship_sourceId_idx",
        "GraphRelationship_targetId_idx",
        "GraphTextUnitEntity_entityId_idx",
        "GraphTextUnitEntity_userStorageId_idx",
        "GraphCommunity_userStorageId_level_idx",
    } <= indexes
    vectors = await pool.fetch(
        "SELECT table_name, udt_name, udt_schema, is_nullable FROM information_schema.columns"
        " WHERE table_schema='ai' AND column_name='embedding' ORDER BY table_name"
    )
    assert [(v["table_name"], v["udt_name"], v["udt_schema"], v["is_nullable"]) for v in vectors] == [
        ("GraphCommunity", "vector", "extensions", "YES"),
        ("GraphEntity", "vector", "extensions", "YES"),
    ]
    fks = await pool.fetch(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname='ai' AND contype='f'"
    )
    assert [f["conname"] for f in fks] == []


async def test_graph_index_rejects_an_unknown_status(database_url, pool):
    import asyncpg
    import pytest

    run_alembic(database_url, "upgrade", "head")
    with pytest.raises(asyncpg.CheckViolationError):
        await pool.execute(
            'INSERT INTO "GraphIndex" ("userStorageId", status, "chunkSignature") VALUES (\'s1\', \'DONE\', \'x\')'
        )


async def test_role_cannot_read_another_services_schema(pool):
    import asyncpg
    import pytest

    with pytest.raises(asyncpg.PostgresError):
        await pool.fetchval('SELECT 1 FROM auth."User"')


async def test_0003_drops_the_legacy_tables_and_its_downgrade_restores_them_empty(database_url, pool):
    run_alembic(database_url, "upgrade", "head")
    assert not LEGACY & {r["table_name"] for r in await pool.fetch(TABLES)}
    down = run_alembic(database_url, "downgrade", "0002")
    assert down.returncode == 0, down.stderr
    assert {r["table_name"] for r in await pool.fetch(TABLES)} == EXPECTED | GRAPHRAG | LEGACY
    assert await pool.fetchval('SELECT count(*) FROM "UserStorageGraph"') == 0
    fks = await pool.fetch(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname='ai' AND contype='f'"
    )
    assert [f["conname"] for f in fks] == ["UserStorageGraphGroup_graphId_fkey"]  # 0001 DDL, as it was
    indexes = {r["indexname"] for r in await pool.fetch("SELECT indexname FROM pg_indexes WHERE schemaname='ai'")}
    assert {"UserStorageGraph_userStorageId_key", "DocumentEntity_name_type_idx", "UserStorageGraphGroup_graphId_groupIndex_key"} <= indexes
    up = run_alembic(database_url, "upgrade", "head")
    assert up.returncode == 0, up.stderr
    assert await pool.fetchval("SELECT version_num FROM ai.alembic_version") == "0003"
