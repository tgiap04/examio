"""Concept-slot planning against a real Postgres: allocation, fallbacks, narrow mode, evidence."""

import logging

import pytest
from generation_seed import add_chunk, seed_graph
from graphrag_fakes import vector_for

from src.graphrag import reads, store
from src.graphrag.generation_planner import ANGLES, plan_slots

SID = "s1"


def flat(batches):
    return [slot for batch in batches for slot in batch.slots]


async def keyword_embedder(texts):
    return [vector_for(t) for t in texts]


async def broken_embedder(texts):
    raise RuntimeError("embedding service down")


async def three_communities(pool):
    return await seed_graph(
        pool,
        SID,
        [("Crypto", ["AES", "RSA", "SHA", "DES"], 8.0), ("Network", ["TCP", "UDP", "IP"], 5.0), ("Disk", ["RAID", "SSD"], 2.0)],
    )


async def test_total_is_exact_and_every_community_gets_a_slot(pool):
    await three_communities(pool)
    for total in (3, 4, 7, 9):
        slots = flat(await plan_slots(pool, SID, total))
        assert len(slots) == total
        assert len({s.key for s in slots}) == total
        assert {s.community_title for s in slots} == {"Crypto", "Network", "Disk"}


async def test_heavier_communities_get_more_slots(pool):
    await three_communities(pool)
    slots = flat(await plan_slots(pool, SID, 9))
    count = {t: sum(1 for s in slots if s.community_title == t) for t in ("Crypto", "Network", "Disk")}
    assert count["Crypto"] >= count["Network"] >= count["Disk"]
    assert count["Crypto"] > count["Disk"]


async def test_fewer_slots_than_communities_keeps_the_strongest_communities(pool):
    await three_communities(pool)
    slots = flat(await plan_slots(pool, SID, 2))
    assert len(slots) == 2
    assert {s.community_title for s in slots} == {"Crypto", "Network"}


async def test_more_slots_than_entities_uses_relationships_then_new_angles(pool):
    await seed_graph(pool, SID, [("Crypto", ["AES", "RSA"], 5.0)], relationships=[("AES", "RSA", 3.0)])
    slots = flat(await plan_slots(pool, SID, 6))
    assert len(slots) == 6
    assert [(s.name, s.angle) for s in slots[:2]] == [("AES", ANGLES[0]), ("RSA", ANGLES[0])]
    assert (slots[2].name, slots[2].angle) == ("AES - RSA", "relationship")
    assert [s.angle for s in slots[3:]] == [ANGLES[1], ANGLES[1], ANGLES[2]]
    assert {s.name for s in slots[3:]} == {"AES", "RSA"}
    assert len({s.key for s in slots}) == 6


async def test_an_empty_graph_plans_nothing(pool):
    assert await plan_slots(pool, "nothing", 5) == []
    await store.upsert_pending(pool, SID, "sig")
    assert await plan_slots(pool, SID, 5) == []


async def test_nonpositive_total_plans_nothing(pool):
    await three_communities(pool)
    assert await plan_slots(pool, SID, 0) == []


async def test_narrow_mode_only_asks_about_seed_entities_and_neighbours(pool):
    names = [f"Topic{i}" for i in range(12)]
    ids = await seed_graph(pool, SID, [("All", names, 5.0)], relationships=[("Topic0", "Topic11", 4.0)])
    seeds = await reads.top_entities_by_vector(pool, SID, vector_for("Topic0"), 8)
    allowed = {h.id for h in seeds} | {ids["Topic11"]}
    slots = flat(await plan_slots(pool, SID, 9, keyword="Topic0", narrow=True, embedder=keyword_embedder))
    assert len(slots) == 9
    used = {s.name for s in slots if s.angle != "relationship"}
    assert slots[0].name == "Topic0"  # the entity nearest to the keyword is asked about first
    assert {ids[n] for n in used} <= allowed
    assert len(allowed) < 12


async def test_narrow_keyword_matching_nothing_falls_back_to_the_whole_document(pool, caplog):
    await seed_graph(pool, SID, [("Crypto", ["AES", "RSA"], 5.0), ("Net", ["TCP", "UDP"], 5.0)], embed_entities=False)
    with caplog.at_level(logging.INFO, logger="src.graphrag.generation_planner"):
        slots = flat(await plan_slots(pool, SID, 4, keyword="zzz", narrow=True, embedder=keyword_embedder))
    assert len(slots) == 4
    assert {s.community_title for s in slots} == {"Crypto", "Net"}
    assert "no entity matches" in caplog.text


async def test_narrow_keyword_embedding_failure_falls_back_to_the_whole_document(pool):
    await seed_graph(pool, SID, [("Crypto", ["AES", "RSA"], 5.0)])
    slots = flat(await plan_slots(pool, SID, 2, keyword="AES", narrow=True, embedder=broken_embedder))
    assert len(slots) == 2


async def test_evidence_is_at_most_three_units_nearest_to_the_entity_first(pool):
    ids = await seed_graph(pool, SID, [("Crypto", ["AES", "RSA"], 5.0)])
    await add_chunk(pool, SID, "best", "9", "the AES chapter", vector_for("AES"))
    for chunk in ("best", f"{SID}c1", "other1", "other2"):
        if chunk.startswith("other"):
            await add_chunk(pool, SID, chunk, "8", chunk)
        await pool.execute(
            'INSERT INTO "GraphTextUnitEntity" ("userStorageId", "chunkId", "entityId") VALUES ($1, $2, $3)',
            SID, chunk, ids["AES"],
        )
    aes = next(s for s in flat(await plan_slots(pool, SID, 2)) if s.name == "AES")
    assert len(aes.evidence) == 3 and aes.evidence[0].chunk_id == "best"


async def test_evidence_survives_chunk_vectors_of_another_size(pool):
    ids = await seed_graph(pool, SID, [("Crypto", ["AES", "RSA"], 5.0)])
    await add_chunk(pool, SID, "tiny", "7", "short vector chunk", [1.0, 2.0, 3.0])
    await pool.execute(
        'INSERT INTO "GraphTextUnitEntity" ("userStorageId", "chunkId", "entityId") VALUES ($1, $2, $3)', SID, "tiny", ids["AES"]
    )
    slots = flat(await plan_slots(pool, SID, 2))
    assert len(slots) == 2 and all(s.evidence for s in slots)


async def test_slots_are_packed_into_calls_of_at_most_max_batch(pool):
    await three_communities(pool)
    batches = await plan_slots(pool, SID, 20, max_batch=6)
    assert sum(len(b.slots) for b in batches) == 20
    assert all(0 < len(b.slots) <= 6 for b in batches)
    assert len({s.key for s in flat(batches)}) == 20


@pytest.mark.parametrize("total", [1, 5, 13])
async def test_each_entity_slot_names_an_entity_of_its_community(pool, total):
    await three_communities(pool)
    members = {"Crypto": {"AES", "RSA", "SHA", "DES"}, "Network": {"TCP", "UDP", "IP"}, "Disk": {"RAID", "SSD"}}
    for slot in flat(await plan_slots(pool, SID, total)):
        assert slot.name in members[slot.community_title]
