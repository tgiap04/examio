"""indexer.build end to end on a real Postgres with a fake LLM and a fake embedder."""

import asyncio
import json
from dataclasses import dataclass

import pytest
from graphrag_fakes import DIM, vector_for

from src.graphrag import indexer, store
from src.graphrag.index_worker import IndexWorker
from src.graphrag.types import GraphragSettings

SETTINGS = GraphragSettings(concurrency=2, max_tokens=256, merge_threshold=0.92)
REPORT = json.dumps(
    {"title": "Chủ đề", "summary": "Tóm tắt nhóm", "findings": [{"summary": "s", "explanation": "e"}], "rating": 6}, ensure_ascii=False
)


@dataclass
class Chunk:
    id: str
    content: str
    page_range: str = "1"


def extraction(*entities: tuple[str, str], rels: tuple[tuple[str, str], ...] = ()) -> str:
    return json.dumps(
        {
            "entities": [{"name": n, "type": "concept", "description": d} for n, d in entities],
            "relationships": [{"source": s, "target": t, "description": f"{s} to {t}", "strength": 6} for s, t in rels],
        },
        ensure_ascii=False,
    )


CHUNKS = [
    Chunk("c0", "text zero"),
    Chunk("c1", "text one"),
    Chunk("c2", "text two"),
    Chunk("c3", "text three"),
]
ANSWERS = {
    "text zero": extraction(("Mã hóa AES", "block cipher"), ("Khóa", "secret one"), rels=(("Mã hóa AES", "Khóa"),)),
    "text one": extraction(("Ma hoa AES", "AES again"), ("Khóa", "secret two"), ("DES", "old cipher"), rels=(("Ma hoa AES", "DES"),)),
    "text two": extraction(("Khóa", "secret three"), ("DES", "legacy")),
    "text three": extraction(("Alpha", "a"), ("Beta", "b"), ("Gamma", "g"), rels=(("Alpha", "Beta"), ("Beta", "Gamma"), ("Alpha", "Gamma"))),
}


def make_llm(report: str | None = REPORT, log: list[str] | None = None):
    async def complete(prompt: str, max_tokens: int) -> str:
        if log is not None:
            log.append(prompt)
        if "You extract a knowledge graph" in prompt:
            return next(reply for text, reply in ANSWERS.items() if f"<document>\n{text}\n" in prompt)
        if "Merge these descriptions" in prompt:
            return "Một khóa bí mật dùng chung."
        if "community report" in prompt:
            if report is None:
                raise ConnectionError("model down")
            return report
        raise AssertionError(f"unexpected prompt: {prompt[:60]}")

    return complete


def twin_embedder():
    async def embed(texts):
        return [vector_for("AES") if t.startswith(("Mã hóa AES", "Ma hoa AES")) else vector_for(t) for t in texts]

    return embed


async def queue(pool, chunks=CHUNKS, sid="s1"):
    await store.upsert_pending(pool, sid, indexer.chunk_signature((c.id, c.content) for c in chunks))
    return await store.claim_next(pool)


def loader(chunks=CHUNKS):
    async def load(storage_id):
        return chunks

    return load


async def run(pool, llm, embedder, claim=None):
    claim = claim or await queue(pool)
    return await indexer.build(claim, pool=pool, llm=llm, embedder=embedder, settings=SETTINGS, load_chunks=loader())


async def snapshot(pool):
    entities = await pool.fetch('SELECT "name", "type", "description", "descriptionCount", "degree", "rank" FROM "GraphEntity" ORDER BY "name"')
    names = {r["id"]: r["name"] for r in await pool.fetch('SELECT "id", "name" FROM "GraphEntity"')}
    communities = await pool.fetch('SELECT "level", "entityIds", "title", "parentId", "id" FROM "GraphCommunity"')
    shape = sorted((c["level"], tuple(sorted(names[i] for i in json.loads(c["entityIds"])))) for c in communities)
    return [dict(e) for e in entities], shape


async def test_full_pipeline_merges_summarises_embeds_clusters_and_reports(pool):
    out = await run(pool, make_llm(), twin_embedder())
    assert out.status == "READY" and out.entities == 6 and out.communities >= 3
    rows = {r["name"]: r for r in await pool.fetch('SELECT * FROM "GraphEntity"')}
    assert set(rows) == {"Mã hóa AES", "Khóa", "DES", "Alpha", "Beta", "Gamma"}  # "Ma hoa AES" folded into the first
    assert rows["Mã hóa AES"]["descriptionCount"] == 2 and rows["Mã hóa AES"]["description"] == "block cipher | AES again"
    assert rows["Khóa"]["description"] == "Một khóa bí mật dùng chung." and rows["Khóa"]["descriptionCount"] == 3  # >= 3 mentions
    assert rows["DES"]["description"] == "old cipher | legacy"  # only 2: joined, no LLM
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity" WHERE "embedding" IS NULL') == 0
    assert {await pool.fetchval('SELECT extensions.vector_dims("embedding") FROM "GraphEntity" LIMIT 1')} == {DIM}
    assert rows["Mã hóa AES"]["degree"] == 2 and rows["Mã hóa AES"]["rank"] == 1.0  # Khóa + DES
    assert rows["Alpha"]["degree"] == 2 and 0 < rows["Khóa"]["rank"] < 1.0

    communities = await pool.fetch('SELECT * FROM "GraphCommunity" ORDER BY "level", "communityKey"')
    level0 = [c for c in communities if c["level"] == 0]
    assert len(level0) >= 2 and all(c["title"] == "Chủ đề" and c["summary"] and c["embedding"] for c in level0)
    ids = {c["id"] for c in level0}
    assert all(c["parentId"] in ids for c in communities if c["level"] == 1) and any(c["level"] == 1 for c in communities)
    assert json.loads(level0[0]["findings"]) == [{"summary": "s", "explanation": "e"}] and level0[0]["rating"] == 6
    assert sorted(len(json.loads(c["entityIds"])) for c in level0) == sorted(c["size"] for c in level0)


async def test_stats_record_counts_merged_pairs_and_per_step_timings(pool):
    await run(pool, make_llm(), twin_embedder())
    stats = json.loads(await pool.fetchval('SELECT "stats" FROM "GraphIndex"'))
    assert (stats["entities_raw"], stats["entities"], stats["merged_count"]) == (7, 6, 1)
    assert stats["merged_pairs"] == [["Ma hoa AES", "Mã hóa AES"]]
    assert stats["descriptions_summarised"] == 1 and stats["reports"] == stats["communities"] and stats["reports_failed"] == 0
    assert {"extract", "embed_for_resolution", "resolve", "describe", "embed", "communities", "reports"} <= set(stats["timings_ms"])


async def test_rebuilding_the_same_document_gives_the_same_graph(pool):
    claim = await queue(pool)
    await run(pool, make_llm(), twin_embedder(), claim)
    first = await snapshot(pool)
    await run(pool, make_llm(), twin_embedder(), claim)  # replace_graph swaps the whole graph
    second = await snapshot(pool)
    assert first[0] == second[0] and first[1] == second[1]
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 6


async def test_a_report_that_never_parses_leaves_the_community_without_text_but_the_index_ready(pool):
    log: list[str] = []
    out = await run(pool, make_llm(report="not json at all", log=log), twin_embedder())
    assert out.status == "READY" and out.reports == 0 and out.communities >= 2
    community = await pool.fetchrow('SELECT * FROM "GraphCommunity" WHERE "level" = 0 ORDER BY "communityKey" LIMIT 1')
    assert community["summary"] == "" and community["embedding"] is None and community["title"]
    assert sum("community report" in p for p in log) == 2 * out.communities  # one try + one retry each
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 6


async def test_a_report_llm_that_fails_once_is_retried(pool):
    calls = {"n": 0}
    inner = make_llm()

    async def flaky(prompt, max_tokens):
        if "community report" in prompt:
            calls["n"] += 1
            if calls["n"] == 1:
                raise ConnectionError("blip")
        return await inner(prompt, max_tokens)

    out = await run(pool, flaky, twin_embedder())
    assert out.reports == out.communities > 0


async def test_all_model_calls_stay_under_the_shared_concurrency_limit(pool):
    inner, state = make_llm(), {"now": 0, "max": 0}

    async def watched(prompt, max_tokens):
        state["now"] += 1
        state["max"] = max(state["max"], state["now"])
        try:
            await asyncio.sleep(0.01)
            return await inner(prompt, max_tokens)
        finally:
            state["now"] -= 1

    await run(pool, watched, twin_embedder())
    assert 1 < state["max"] <= SETTINGS.concurrency


async def test_an_embedder_failure_writes_nothing_and_the_worker_records_failed_with_backoff(pool):
    async def broken(texts):
        raise ConnectionError("embedding quota")

    await store.upsert_pending(pool, "s1", indexer.chunk_signature((c.id, c.content) for c in CHUNKS))
    worker = IndexWorker(pool, settings=SETTINGS, llm=make_llm(), embedder=broken, load_chunks=loader(), poll_seconds=0.05)
    assert await worker.tick() is True
    row = await pool.fetchrow('SELECT * FROM "GraphIndex"')
    assert (row["status"], row["attempts"]) == ("FAILED", 1) and "embedding quota" in row["error"] and row["nextAttemptAt"]
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0


@pytest.mark.parametrize("bad", [lambda texts: [[1.0]], lambda texts: [[1.0, 2.0]] * len(texts) + [[1.0]], lambda texts: [[float("nan")]] * len(texts)])
async def test_an_embedder_returning_the_wrong_shape_is_rejected(pool, bad):
    async def embed(texts):
        return bad(texts)

    claim = await queue(pool)
    with pytest.raises(ValueError):
        await indexer.build(claim, pool=pool, llm=make_llm(), embedder=embed, settings=SETTINGS, load_chunks=loader())
    assert await pool.fetchval('SELECT count(*) FROM "GraphEntity"') == 0


async def test_a_document_without_entities_still_becomes_ready_with_an_empty_graph(pool):
    chunks = [Chunk("c0", "text zero")]

    async def empty(prompt, max_tokens):
        return json.dumps({"entities": [], "relationships": []})

    claim = await queue(pool, chunks)
    out = await indexer.build(claim, pool=pool, llm=empty, embedder=twin_embedder(), settings=SETTINGS, load_chunks=loader(chunks))
    assert (out.status, out.entities, out.communities) == ("READY", 0, 0)
