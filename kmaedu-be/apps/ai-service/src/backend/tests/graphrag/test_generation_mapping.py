"""Mapping a generated item's ``concept`` back to the slot it was generated for."""

from src.graphrag.generation_mapping import assign_slots
from src.graphrag.generation_planner import Slot

AES = Slot("e:1:0", "AES", "block cipher", "definition", "k1", "Crypto")
AES2 = Slot("e:1:1", "AES", "block cipher", "application", "k1", "Crypto")
RSA = Slot("e:2:0", "RSA", "public key", "definition", "k1", "Crypto")

VECTORS = {
    "AES: block cipher": [1.0, 0.0, 0.0],
    "RSA: public key": [0.0, 1.0, 0.0],
    "advanced encryption standard": [0.99, 0.05, 0.0],
    "totally unrelated": [0.0, 0.0, 1.0],
    "What does the block cipher do?": [0.9, 0.1, 0.0],
}


async def embedder(texts):
    embedder.calls.append(list(texts))
    return [VECTORS[t] for t in texts]


embedder.calls = []


async def broken(texts):
    raise RuntimeError("down")


def item(concept=None, question="q"):
    return {"question": question, **({"concept": concept} if concept is not None else {})}


async def test_exact_names_map_ignoring_case_and_spacing():
    items = [item(" rsa "), item("AES")]
    await assign_slots(items, [AES, RSA], None)
    assert [i["concept"] for i in items] == [RSA.key, AES.key]


async def test_a_repeated_concept_gets_the_same_key_so_the_dedupe_drops_it():
    items = [item("AES"), item("aes")]
    await assign_slots(items, [AES, RSA], None)
    assert items[0]["concept"] == items[1]["concept"] == AES.key


async def test_slots_that_share_a_name_are_handed_out_in_order():
    items = [item("AES"), item("AES"), item("AES")]
    await assign_slots(items, [AES, AES2], None)
    assert [i["concept"] for i in items] == [AES.key, AES2.key, AES2.key]


async def test_an_unknown_name_maps_to_the_nearest_slot_by_cosine():
    embedder.calls.clear()
    items = [item("Advanced Encryption Standard")]
    items[0]["concept"] = "advanced encryption standard"
    await assign_slots(items, [AES, RSA], embedder)
    assert items[0]["concept"] == AES.key


async def test_a_concept_nothing_is_close_to_is_dropped_but_the_item_stays():
    items = [item("totally unrelated")]
    await assign_slots(items, [AES, RSA], embedder)
    assert "concept" not in items[0] and items[0]["question"] == "q"


async def test_a_missing_concept_maps_by_the_question():
    items = [item(None, "What does the block cipher do?")]
    await assign_slots(items, [AES, RSA], embedder)
    assert items[0]["concept"] == AES.key


async def test_without_a_working_embedder_unresolved_items_just_lose_the_concept():
    for emb in (None, broken):
        items = [item("mystery"), item("RSA")]
        await assign_slots(items, [AES, RSA], emb)
        assert "concept" not in items[0] and items[1]["concept"] == RSA.key
