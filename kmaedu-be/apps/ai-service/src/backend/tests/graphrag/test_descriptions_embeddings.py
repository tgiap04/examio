"""Description summaries and batched, validated embeddings (fake model, no network)."""

import pytest
from graphrag_fakes import vector_for

from src.graphrag.descriptions import MAX_WORDS, summarize_descriptions
from src.graphrag.embeddings import BATCH_SIZE, embed_entities, embed_texts
from src.graphrag.types import GraphEntityRow


def row(eid, desc, count=1, embedding=None):
    return GraphEntityRow(eid, f"Name {eid}", f"name {eid}", "concept", desc, count, embedding=embedding)


async def test_entities_with_three_descriptions_are_summarised_and_lose_their_vector():
    prompts = []

    async def llm(prompt, max_tokens):
        prompts.append(prompt)
        return "```\n" + " ".join(["word"] * 90) + "\n```"

    rows, done, failed = await summarize_descriptions([row("x", "one | two | three", 3, [1.0])], llm, 2, 128)
    assert (done, failed) == (1, 0)
    assert len(rows[0].description.split()) == MAX_WORDS and "`" not in rows[0].description
    assert rows[0].embedding is None and rows[0].description_count == 3
    assert "Name x" in prompts[0] and "- one\n- two\n- three" in prompts[0]


async def test_one_or_two_descriptions_are_left_alone_without_a_model_call():
    async def llm(prompt, max_tokens):
        raise AssertionError("must not be called")

    keep = [row("a", ""), row("b", "only one"), row("c", "first | second", 2, [1.0])]
    rows, done, failed = await summarize_descriptions(keep, llm, 2, 128)
    assert rows == keep and (done, failed) == (0, 0)


@pytest.mark.parametrize("answer", ["", "   ", ConnectionError("429")])
async def test_a_failing_or_empty_summary_keeps_the_joined_description_and_the_vector(answer):
    async def llm(prompt, max_tokens):
        if isinstance(answer, Exception):
            raise answer
        return answer

    original = row("x", "one | two | three", 3, [1.0])
    rows, done, failed = await summarize_descriptions([original, row("y", "solo")], llm, 2, 128)
    assert rows[0] == original and (done, failed) == (0, 1)


async def test_texts_are_embedded_in_order_in_batches_of_fifty():
    calls = []

    async def embed(texts):
        calls.append(len(texts))
        return [vector_for(t) for t in texts]

    texts = [f"text {i}" for i in range(BATCH_SIZE * 2 + 20)]
    vectors = await embed_texts(embed, texts, concurrency=3)
    assert sorted(calls) == [20, 50, 50] and vectors == [vector_for(t) for t in texts]
    assert await embed_texts(embed, []) == []


async def test_embed_entities_only_fills_rows_that_have_no_vector():
    seen = []

    async def embed(texts):
        seen.extend(texts)
        return [vector_for(t) for t in texts]

    rows = await embed_entities([row("a", "desc a"), row("b", "", embedding=[9.0, 9.0]), row("c", "")], embed, 2)
    assert seen == ["Name a: desc a", "Name c"]
    assert rows[1].embedding == [9.0, 9.0] and rows[0].embedding == vector_for("Name a: desc a")


@pytest.mark.parametrize(
    "reply",
    [lambda t: [], lambda t: [[1.0]] * (len(t) + 1), lambda t: [[1.0, 2.0], [1.0]][: len(t)] if len(t) == 2 else [[]] * len(t),
     lambda t: [[float("inf")]] * len(t)],
)
async def test_an_embedder_that_returns_the_wrong_count_size_or_values_is_rejected(reply):
    async def embed(texts):
        return reply(texts)

    with pytest.raises(ValueError):
        await embed_texts(embed, ["a", "b"])


async def test_default_embedder_embeds_a_batch_concurrently_in_order(monkeypatch):
    import asyncio

    import src.llm.gemini_embeddings as gemini
    from src.graphrag import embeddings

    state = {"now": 0, "peak": 0}

    class FakeClient:
        async def create_embedding(self, text, task_type="retrieval_document"):
            state["now"] += 1
            state["peak"] = max(state["peak"], state["now"])
            await asyncio.sleep(0.01)
            state["now"] -= 1
            return [float(len(text))]

    monkeypatch.setattr(gemini, "GeminiEmbeddings", FakeClient)
    texts = [f"t{'x' * i}" for i in range(12)]
    vectors = await embeddings.default_embedder()(texts)
    assert vectors == [[float(len(t))] for t in texts]  # order kept
    assert 1 < state["peak"] <= embeddings.EMBED_CONCURRENCY
