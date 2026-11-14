"""Duplicate filter for generated items: same concept or near-identical question."""

import logging

import numpy as np

from src.graphrag.dedupe import Deduper, duplicate_pairs

VECTORS = {
    "what is aes": [1.0, 0.0, 0.0],
    "define aes": [0.99, 0.05, 0.0],  # cosine ~0.9987 to the first
    "what is rsa": [0.0, 1.0, 0.0],
    "what is tcp": [0.0, 0.0, 1.0],
}


def make_embedder():
    async def embed(texts):
        embed.calls.append(list(texts))
        return [VECTORS[t.lower()] for t in texts]

    embed.calls = []
    return embed


async def broken(texts):
    raise RuntimeError("embedding service down")


def item(question, concept=None):
    return {"question": question, "answer": "a", **({"concept": concept} if concept else {})}


async def test_items_with_the_same_concept_keep_only_the_first():
    deduper = Deduper(make_embedder())
    kept, dropped = await deduper.add([item("What is AES", "AES"), item("What is RSA", " aes "), item("What is TCP", "TCP")])
    assert [i["question"] for i in kept] == ["What is AES", "What is TCP"]
    assert dropped == 1


async def test_a_question_too_close_to_an_earlier_one_is_dropped():
    deduper = Deduper(make_embedder(), threshold=0.9)
    kept, dropped = await deduper.add([item("What is AES"), item("Define AES"), item("What is RSA")])
    assert [i["question"] for i in kept] == ["What is AES", "What is RSA"]
    assert dropped == 1


async def test_distinct_items_all_survive_and_order_is_kept():
    kept, dropped = await Deduper(make_embedder()).add([item("What is TCP", "c1"), item("What is AES", "c2"), item("What is RSA")])
    assert [i["question"] for i in kept] == ["What is TCP", "What is AES", "What is RSA"]
    assert dropped == 0


async def test_later_batches_are_compared_with_what_was_already_kept_without_re_embedding():
    embedder = make_embedder()
    deduper = Deduper(embedder)
    await deduper.add([item("What is AES", "AES")])
    kept, dropped = await deduper.add([item("Define AES", "other"), item("What is TCP", "AES"), item("What is RSA", "RSA")])
    assert [i["question"] for i in kept] == ["What is RSA"]
    assert dropped == 2
    assert embedder.calls == [["What is AES"], ["Define AES", "What is TCP", "What is RSA"]]


async def test_embedding_failure_falls_back_to_concept_only_and_logs_once(caplog):
    deduper = Deduper(broken)
    with caplog.at_level(logging.WARNING, logger="src.graphrag.dedupe"):
        kept, dropped = await deduper.add([item("What is AES", "AES"), item("What is AES", "aes"), item("What is AES", "x")])
        more, _ = await deduper.add([item("What is AES", "y")])
    assert [i["concept"] for i in kept] == ["AES", "x"] and dropped == 1
    assert len(more) == 1
    assert deduper.embed_failed
    assert caplog.text.count("concept only") == 1


async def test_no_embedder_means_concept_only():
    kept, dropped = await Deduper(None).add([item("q1", "A"), item("q2", "A"), item("q3")])
    assert len(kept) == 2 and dropped == 1


async def test_blank_questions_are_kept_and_never_embedded():
    embedder = make_embedder()
    kept, dropped = await Deduper(embedder).add([item(""), item("What is AES")])
    assert len(kept) == 2 and dropped == 0
    assert embedder.calls == [["What is AES"]]


def test_duplicate_pairs_moved_here_keeps_its_behaviour():
    vecs = [[1.0, 0.0], [0.99, 0.01], [0.0, 1.0]]
    assert duplicate_pairs(vecs, 0.9) == [(0, 1)]
    assert duplicate_pairs([], 0.9) == [] and duplicate_pairs([[1.0, 0.0]], 0.9) == []
    assert duplicate_pairs(np.array([[0.0, 0.0], [0.0, 0.0]]), 0.5) == []
