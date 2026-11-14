"""GraphIndex queue + atomic graph replacement against a real Postgres."""

import asyncio
import json

import asyncpg
import pytest

from src.graphrag import store
from src.graphrag.types import (
    GraphCommunityRow,
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
)


def graph(tag: str = "a", n: int = 2) -> GraphData:
    entities = [GraphEntityRow(f"{tag}e{i}", f"Name {i}", f"name {i}", "concept", f"desc {tag}", 1, degree=1, rank=1.0) for i in range(n)]
    rels = [GraphRelationshipRow(f"{tag}r0", f"{tag}e0", f"{tag}e1", "links", 3.0)] if n > 1 else []
    return GraphData(entities, rels, [(f"chunk_{tag}_0", e.id) for e in entities])


async def status_row(pool, sid):
    return await pool.fetchrow('SELECT * FROM "GraphIndex" WHERE "userStorageId" = $1', sid)


async def counts(pool, sid) -> dict[str, int]:
    return {t: await pool.fetchval(f'SELECT count(*) FROM "{t}" WHERE "userStorageId" = $1', sid) for t in store.GRAPH_TABLES}


async def test_upsert_pending_creates_a_pending_row_with_the_signature(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    row = await status_row(pool, "s1")
    assert (row["status"], row["chunkSignature"], row["attempts"]) == ("PENDING", "sig1", 0)


async def test_upsert_pending_with_the_same_signature_leaves_ready_and_building_rows_alone(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    claim = await store.claim_next(pool)
    lease = (await status_row(pool, "s1"))["leaseUntil"]
    await store.upsert_pending(pool, "s1", "sig1")  # re-emitted event while building
    row = await status_row(pool, "s1")
    assert (row["status"], row["leaseUntil"]) == ("BUILDING", lease)
    assert await store.replace_graph(pool, "s1", claim.chunk_signature, graph(), {})
    await store.upsert_pending(pool, "s1", "sig1")
    assert (await status_row(pool, "s1"))["status"] == "READY"


async def test_upsert_pending_with_a_new_signature_requeues_and_clears_the_lease(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.upsert_pending(pool, "s1", "sig2")
    row = await status_row(pool, "s1")
    assert (row["status"], row["chunkSignature"], row["leaseUntil"], row["attempts"]) == ("PENDING", "sig2", None, 0)


async def test_upsert_pending_requeues_a_failed_index_with_fresh_attempts(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.mark_failed(pool, "s1", "sig1", "boom")
    await store.upsert_pending(pool, "s1", "sig1")
    row = await status_row(pool, "s1")
    assert (row["status"], row["attempts"], row["error"]) == ("PENDING", 0, None)


async def test_claim_takes_a_pending_row_and_sets_building_with_a_15_minute_lease(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    claim = await store.claim_next(pool)
    assert claim == store.Claim("s1", "sig1", 0)
    row = await status_row(pool, "s1")
    assert row["status"] == "BUILDING"
    minutes = await pool.fetchval(
        "SELECT extract(epoch FROM (\"leaseUntil\" - (now() AT TIME ZONE 'UTC'))) / 60 FROM \"GraphIndex\""
    )
    assert 14 < minutes <= 15
    assert await store.claim_next(pool) is None  # nothing else runnable


async def test_two_concurrent_claimers_on_one_row_only_one_wins(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    results = await asyncio.gather(*(store.claim_next(pool) for _ in range(4)))
    assert [r.storage_id for r in results if r] == ["s1"]


async def test_concurrent_claimers_get_distinct_rows(pool):
    for i in range(3):
        await store.upsert_pending(pool, f"s{i}", f"sig{i}")
    results = await asyncio.gather(*(store.claim_next(pool) for _ in range(3)))
    assert sorted(r.storage_id for r in results if r) == ["s0", "s1", "s2"]


async def test_an_expired_lease_is_reclaimed_and_counts_as_an_attempt(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    assert await store.claim_next(pool) is None  # lease still valid
    await pool.execute('UPDATE "GraphIndex" SET "leaseUntil" = (now() AT TIME ZONE \'UTC\') - interval \'1 minute\'')
    claim = await store.claim_next(pool)
    assert claim is not None and claim.attempts == 1


async def test_a_lease_that_keeps_expiring_ends_failed_instead_of_looping_forever(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    for _ in range(store.MAX_ATTEMPTS):  # three runs, each one lost
        assert await store.claim_next(pool) is not None
        await pool.execute('UPDATE "GraphIndex" SET "leaseUntil" = (now() AT TIME ZONE \'UTC\') - interval \'1 minute\'')
    assert await store.claim_next(pool) is None
    row = await status_row(pool, "s1")
    assert row["status"] == "FAILED" and "lease" in row["error"]


async def test_mark_failed_increments_attempts_and_sets_the_backoff(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    expected = []
    for attempt in (1, 2, 3):
        await pool.execute('UPDATE "GraphIndex" SET "nextAttemptAt" = (now() AT TIME ZONE \'UTC\') - interval \'1 second\' WHERE "status" = \'FAILED\'')
        claim = await store.claim_next(pool, max_attempts=9)
        assert await store.mark_failed(pool, "s1", claim.chunk_signature, "x" * 900)
        row = await status_row(pool, "s1")
        seconds = await pool.fetchval(
            "SELECT extract(epoch FROM (\"nextAttemptAt\" - (now() AT TIME ZONE 'UTC'))) FROM \"GraphIndex\""
        )
        assert (row["status"], row["attempts"], len(row["error"])) == ("FAILED", attempt, store.ERROR_CHARS)
        expected.append(round(seconds / 10) * 10)
    assert expected == [60, 300, 1800]


async def test_a_failed_row_is_only_claimable_after_its_backoff_and_below_max_attempts(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    claim = await store.claim_next(pool)
    await store.mark_failed(pool, "s1", claim.chunk_signature, "boom")
    assert await store.claim_next(pool) is None  # inside the 60 s backoff
    await pool.execute('UPDATE "GraphIndex" SET "nextAttemptAt" = (now() AT TIME ZONE \'UTC\') - interval \'1 second\'')
    assert (await store.claim_next(pool)).attempts == 1
    await store.mark_failed(pool, "s1", "sig1", "boom")
    await pool.execute('UPDATE "GraphIndex" SET "attempts" = $1, "nextAttemptAt" = (now() AT TIME ZONE \'UTC\') - interval \'1 second\'', store.MAX_ATTEMPTS)
    assert await store.claim_next(pool) is None  # retries exhausted


async def test_mark_failed_with_a_stale_signature_does_not_touch_a_requeued_row(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.upsert_pending(pool, "s1", "sig2")  # document re-uploaded during the build
    assert await store.mark_failed(pool, "s1", "sig1", "late") is False
    assert (await status_row(pool, "s1"))["status"] == "PENDING"


async def test_release_lease_returns_a_building_row_to_pending(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    assert await store.release_lease(pool, "s1", "sig1") is True
    row = await status_row(pool, "s1")
    assert (row["status"], row["leaseUntil"], row["attempts"]) == ("PENDING", None, 0)
    assert (await store.claim_next(pool)).storage_id == "s1"


async def test_replace_graph_writes_everything_and_marks_ready(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    assert await store.replace_graph(pool, "s1", "sig1", graph("a"), {"chunks": 1})
    row = await status_row(pool, "s1")
    assert (row["status"], row["attempts"], row["error"], row["leaseUntil"]) == ("READY", 0, None, None)
    assert row["builtAt"] is not None and "chunks" in row["stats"]
    assert await counts(pool, "s1") == {
        "GraphTextUnitEntity": 2, "GraphRelationship": 1, "GraphCommunity": 0, "GraphEntity": 2, "GraphIndex": 1,
    }


async def test_replace_graph_replaces_the_old_graph_completely(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.replace_graph(pool, "s1", "sig1", graph("a", 3), {})
    await pool.execute(
        'INSERT INTO "GraphCommunity" (id, "userStorageId", level, "communityKey") VALUES (\'old\', \'s1\', 0, 0)'
    )
    assert await store.replace_graph(pool, "s1", "sig1", graph("b", 2), {})
    assert sorted(r["id"] for r in await pool.fetch('SELECT id FROM "GraphEntity"')) == ["be0", "be1"]
    assert await pool.fetchval('SELECT count(*) FROM "GraphCommunity"') == 0


async def test_replace_graph_failure_midway_leaves_the_old_graph_and_status(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.replace_graph(pool, "s1", "sig1", graph("a", 3), {})
    await pool.execute('UPDATE "GraphIndex" SET "status" = \'BUILDING\'')
    broken = graph("b", 2)
    duplicate = GraphEntityRow("bdup", "Name 0", "name 0", "concept", "x", 1)  # unique (storage, type, normName)
    bad = GraphData([*broken.entities, duplicate], broken.relationships, broken.links)
    with pytest.raises(asyncpg.UniqueViolationError):
        await store.replace_graph(pool, "s1", "sig1", bad, {})
    assert sorted(r["id"] for r in await pool.fetch('SELECT id FROM "GraphEntity"')) == ["ae0", "ae1", "ae2"]
    assert await pool.fetchval('SELECT count(*) FROM "GraphRelationship"') == 1
    assert await pool.fetchval('SELECT count(*) FROM "GraphTextUnitEntity"') == 3
    assert (await status_row(pool, "s1"))["status"] == "BUILDING"


async def test_replace_graph_with_a_changed_signature_writes_nothing(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.upsert_pending(pool, "s1", "sig2")
    assert await store.replace_graph(pool, "s1", "sig1", graph("a"), {}) is False
    assert (await counts(pool, "s1"))["GraphEntity"] == 0
    assert (await status_row(pool, "s1"))["status"] == "PENDING"


async def test_replace_graph_for_a_deleted_document_writes_nothing(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.delete_for(pool, ["s1"])
    assert await store.replace_graph(pool, "s1", "sig1", graph("a"), {}) is False
    assert all(v == 0 for v in (await counts(pool, "s1")).values())


async def test_delete_for_clears_all_five_tables_for_the_given_ids_only(pool):
    for sid in ("s1", "s2", "keep"):
        await store.upsert_pending(pool, sid, f"sig-{sid}")
        await store.replace_graph(pool, sid, f"sig-{sid}", graph(sid), {})
        await pool.execute(
            'INSERT INTO "GraphCommunity" (id, "userStorageId", level, "communityKey") VALUES ($1, $2, 0, 0)', f"c{sid}", sid
        )
    await store.delete_for(pool, ["s1", "s2"])
    for sid in ("s1", "s2"):
        assert all(v == 0 for v in (await counts(pool, sid)).values()), sid
    assert (await counts(pool, "keep"))["GraphEntity"] == 2 and (await counts(pool, "keep"))["GraphCommunity"] == 1


def community(cid="cm0", level=0, parent=None, vector=None, **kw):
    return GraphCommunityRow(cid, level, 0, parent, ["ae0", "ae1"], 2, embedding=vector, **kw)


async def test_replace_graph_stores_entity_and_community_embeddings_and_report_fields(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    base = graph("a")
    entities = [GraphEntityRow(e.id, e.name, e.norm_name, e.type, e.description, 1, degree=1, rank=1.0, embedding=[0.25, -1.5, 3e-05]) for e in base.entities]
    communities = [
        community("cm0", vector=[1.0, 2.0], title="Mã hóa", summary="Tóm tắt", findings=[{"summary": "ý", "explanation": "giải thích"}], rating=7.5),
        community("cm1", level=1, parent="cm0"),  # a report that failed: no vector, no rating
    ]
    assert await store.replace_graph(pool, "s1", "sig1", GraphData(entities, base.relationships, base.links, communities), {})
    rows = await pool.fetch('SELECT extensions.vector_dims("embedding") AS dims, "embedding"::text AS text FROM "GraphEntity"')
    assert {r["dims"] for r in rows} == {3} and rows[0]["text"] == "[0.25,-1.5,3e-05]"
    top, child = await pool.fetchrow('SELECT * FROM "GraphCommunity" WHERE id = \'cm0\''), await pool.fetchrow('SELECT * FROM "GraphCommunity" WHERE id = \'cm1\'')
    assert (top["title"], top["summary"], top["rating"], top["size"], top["level"]) == ("Mã hóa", "Tóm tắt", 7.5, 2, 0)
    assert json.loads(top["findings"]) == [{"summary": "ý", "explanation": "giải thích"}]
    assert json.loads(top["entityIds"]) == ["ae0", "ae1"]
    assert await pool.fetchval('SELECT "embedding"::text FROM "GraphCommunity" WHERE id = \'cm0\'') == "[1,2]"
    assert (child["parentId"], child["embedding"], child["rating"], child["findings"]) == ("cm0", None, None, "[]")


async def test_a_community_insert_failure_rolls_back_the_whole_replacement(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.replace_graph(pool, "s1", "sig1", graph("a", 3), {})
    await pool.execute('UPDATE "GraphIndex" SET "status" = \'BUILDING\'')
    base = graph("b", 2)
    clash = GraphData(base.entities, base.relationships, base.links, [community("same"), community("same")])  # duplicate primary key
    with pytest.raises(asyncpg.UniqueViolationError):
        await store.replace_graph(pool, "s1", "sig1", clash, {})
    assert sorted(r["id"] for r in await pool.fetch('SELECT id FROM "GraphEntity"')) == ["ae0", "ae1", "ae2"]
    assert await pool.fetchval('SELECT count(*) FROM "GraphCommunity"') == 0
    assert (await status_row(pool, "s1"))["status"] == "BUILDING"


async def test_release_lease_ignores_a_row_that_moved_to_a_new_signature(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await store.upsert_pending(pool, "s1", "sig2")
    claim = await store.claim_next(pool)  # another worker now builds sig2
    assert claim.chunk_signature == "sig2"
    assert not await store.release_lease(pool, "s1", "sig1")  # the stale worker must not reset it
    assert (await status_row(pool, "s1"))["status"] == "BUILDING"


async def test_release_lease_with_a_delay_is_not_claimable_until_it_passes(pool):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    assert await store.release_lease(pool, "s1", "sig1", retry_after_seconds=60)
    row = await status_row(pool, "s1")
    assert row["status"] == "PENDING" and row["nextAttemptAt"] is not None
    assert await store.claim_next(pool) is None


async def test_the_last_allowed_failure_is_logged_as_terminal(pool, caplog):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    await pool.execute('UPDATE "GraphIndex" SET "attempts" = $1 WHERE "userStorageId" = \'s1\'', store.MAX_ATTEMPTS - 1)
    with caplog.at_level("ERROR", logger="src.graphrag.store"):
        assert await store.mark_failed(pool, "s1", "sig1", "boom")
    assert any("permanently FAILED" in r.message and "s1" in r.message for r in caplog.records)


async def test_an_early_failure_is_not_logged_as_terminal(pool, caplog):
    await store.upsert_pending(pool, "s1", "sig1")
    await store.claim_next(pool)
    with caplog.at_level("ERROR", logger="src.graphrag.store"):
        assert await store.mark_failed(pool, "s1", "sig1", "boom")
    assert not any("permanently FAILED" in r.message for r in caplog.records)
