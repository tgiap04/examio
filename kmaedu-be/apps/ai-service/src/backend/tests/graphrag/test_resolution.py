"""Entity resolution: name normalisation, exact merge in assembly, cosine merge, relationship remapping."""

from src.graphrag.assembly import assemble_graph
from src.graphrag.resolution import merge_entities
from src.graphrag.types import (
    ChunkExtraction,
    ExtractedEntity,
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
    normalize_name,
)


def test_normalize_name_ignores_case_spacing_and_edge_punctuation_but_keeps_vietnamese_diacritics():
    assert normalize_name("Mã hóa AES") == normalize_name("  mã   hóa aes ")
    assert normalize_name('(AES),') == normalize_name("aes")
    assert normalize_name("mã hóa") != normalize_name("ma hoa")  # embeddings decide that, not the name key
    assert normalize_name("C#") == "c#" and normalize_name("C++") == "c++"
    assert normalize_name("...") == "..."  # never collapses to an empty key


def test_assembly_merges_case_and_spacing_variants_but_not_types_or_diacritics():
    extraction = ChunkExtraction(
        "c0",
        [
            ExtractedEntity("Mã hóa AES", "concept", "d1"),
            ExtractedEntity("mã  hóa aes", "concept", "d2"),
            ExtractedEntity("Mã hóa AES", "formula", "f"),
            ExtractedEntity("Ma hoa AES", "concept", "no diacritics"),
        ],
    )
    graph = assemble_graph([extraction])
    assert sorted((e.norm_name, e.type) for e in graph.entities) == [
        ("ma hoa aes", "concept"),
        ("mã hóa aes", "concept"),
        ("mã hóa aes", "formula"),
    ]
    merged = next(e for e in graph.entities if e.norm_name == "mã hóa aes" and e.type == "concept")
    assert merged.description_count == 2 and merged.description == "d1 | d2"


def entity(eid, name, type_="concept", desc="", count=1, degree=0):
    return GraphEntityRow(eid, name, normalize_name(name), type_, desc, count, degree=degree, embedding=[0.0, 1.0])


def graph_of():
    entities = [
        entity("a", "Mã hóa AES", desc="d-a", count=2, degree=2),
        entity("b", "Ma hoa AES", desc="d-b", count=1, degree=1),
        entity("c", "Khóa", desc="d-c", degree=2),
        entity("d", "Mã hóa AES", "formula", desc="d-d"),
        entity("e", "Bảo mật", desc="d-e", degree=0),
    ]
    rels = [
        GraphRelationshipRow("r1", "a", "c", "uses", 3.0),
        GraphRelationshipRow("r2", "b", "c", "uses key", 4.0),  # b merges into a: weight adds up
        GraphRelationshipRow("r3", "a", "b", "same thing", 2.0),  # becomes a self-loop: dropped
    ]
    links = [("k0", "a"), ("k0", "b"), ("k1", "b"), ("k1", "c")]
    return GraphData(entities, rels, links)


def vectors(**by_id):
    return {k: v for k, v in by_id.items()}


def test_same_type_entities_above_the_threshold_merge_into_the_highest_degree_one():
    vec = vectors(a=[1.0, 0.0], b=[0.99, 0.05], c=[0.0, 1.0], d=[1.0, 0.0], e=[0.5, 0.5])
    merged, pairs = merge_entities(graph_of(), vec, 0.92)
    by_id = {e.id: e for e in merged.entities}
    assert set(by_id) == {"a", "c", "d", "e"}  # b folded into a; d has the same vector but another type
    assert pairs == [("Ma hoa AES", "Mã hóa AES")]
    survivor = by_id["a"]
    assert survivor.name == "Mã hóa AES" and survivor.description == "d-a | d-b" and survivor.description_count == 3
    assert survivor.embedding is None  # its text changed: re-embedded later
    assert by_id["c"].embedding == [0.0, 1.0]  # untouched rows keep their vector


def test_relationships_and_links_follow_the_merge_and_degrees_are_recomputed():
    vec = vectors(a=[1.0, 0.0], b=[0.99, 0.05], c=[0.0, 1.0], d=[1.0, 0.0], e=[0.5, 0.5])
    merged, _ = merge_entities(graph_of(), vec, 0.92)
    assert [(r.source_id, r.target_id, r.weight, r.description) for r in merged.relationships] == [("a", "c", 7.0, "uses | uses key")]
    assert merged.links == [("k0", "a"), ("k1", "a"), ("k1", "c")]  # (k0,b) collapsed onto (k0,a)
    by_id = {e.id: e for e in merged.entities}
    assert (by_id["a"].degree, by_id["c"].degree, by_id["e"].degree) == (1, 1, 0)
    assert (by_id["a"].rank, by_id["e"].rank) == (1.0, 0.0)


def test_below_the_threshold_nothing_merges_and_the_graph_is_returned_as_is():
    graph = graph_of()
    vec = vectors(a=[1.0, 0.0], b=[0.8, 0.6], c=[0.0, 1.0], d=[1.0, 0.0], e=[-0.5, 0.5])
    merged, pairs = merge_entities(graph, vec, 0.92)
    assert pairs == [] and merged is graph


def test_chains_of_similar_entities_collapse_into_one_survivor():
    entities = [entity("x1", "Entropy", degree=0), entity("x2", "Entropie", degree=3), entity("x3", "Entropia", degree=1)]
    graph = GraphData(entities, [], [])
    vec = vectors(x1=[1.0, 0.0], x2=[0.97, 0.24], x3=[0.88, 0.47])  # x1~x2 and x2~x3 but not x1~x3
    merged, pairs = merge_entities(graph, vec, 0.92)
    assert [e.id for e in merged.entities] == ["x2"] and len(pairs) == 2


def test_entities_without_a_vector_are_never_merged():
    graph = GraphData([entity("p", "Alpha"), entity("q", "Alpha beta")], [], [])
    merged, pairs = merge_entities(graph, {"p": [1.0, 0.0]}, 0.5)
    assert pairs == [] and len(merged.entities) == 2
