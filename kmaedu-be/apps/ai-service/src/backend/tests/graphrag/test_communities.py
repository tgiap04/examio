"""Community detection: determinism, two levels with parents, co-occurrence structure, degenerate graphs."""

from src.graphrag.communities import detect
from src.graphrag.types import (
    GraphData,
    GraphEntityRow,
    GraphRelationshipRow,
    normalize_name,
)


def entity(eid):
    return GraphEntityRow(eid, eid.upper(), normalize_name(eid), "concept", "", 1)


def two_clusters() -> GraphData:
    ids = ["a1", "a2", "a3", "b1", "b2", "b3"]
    pairs = [("a1", "a2"), ("a2", "a3"), ("a1", "a3"), ("b1", "b2"), ("b2", "b3"), ("b1", "b3"), ("a3", "b1")]
    rels = [GraphRelationshipRow(f"r{i}", s, t, "", 8.0 if (s, t) != ("a3", "b1") else 1.0) for i, (s, t) in enumerate(pairs)]
    return GraphData([entity(i) for i in ids], rels, [])


def shape(communities):
    return [(c.level, c.community_key, sorted(c.entity_ids), c.size) for c in communities]


def test_two_dense_clusters_become_two_level_zero_communities():
    level0 = [c for c in detect(two_clusters()) if c.level == 0]
    assert sorted(sorted(c.entity_ids) for c in level0) == [["a1", "a2", "a3"], ["b1", "b2", "b3"]]
    assert all(c.parent_id is None and c.size == 3 for c in level0)


def test_the_same_graph_gives_the_same_communities_every_time():
    assert shape(detect(two_clusters())) == shape(detect(two_clusters()))


def test_level_one_communities_point_at_the_level_zero_community_they_overlap_most():
    communities = detect(two_clusters())
    by_id = {c.id: c for c in communities}
    level1 = [c for c in communities if c.level == 1]
    assert level1
    for community in level1:
        parent = by_id[community.parent_id]
        assert parent.level == 0
        overlap = {p.id: len(set(p.entity_ids) & set(community.entity_ids)) for p in communities if p.level == 0}
        assert overlap[parent.id] == max(overlap.values()) > 0


def test_entities_sharing_a_chunk_form_a_community_even_without_relationships():
    graph = GraphData([entity(i) for i in ("x1", "x2", "x3", "lone")], [], [("k0", "x1"), ("k0", "x2"), ("k0", "x3")])
    level0 = [c for c in detect(graph) if c.level == 0]
    assert [sorted(c.entity_ids) for c in level0] == [["x1", "x2", "x3"]]  # "lone" is a singleton: no community row


def test_empty_one_node_and_edgeless_graphs_yield_no_communities():
    assert detect(GraphData([], [], [])) == []
    assert detect(GraphData([entity("solo")], [], [("k0", "solo")])) == []
    assert detect(GraphData([entity("p"), entity("q")], [], [])) == []


def test_communities_are_ordered_by_size_and_keyed_per_level():
    graph = two_clusters()
    graph = GraphData(graph.entities + [entity("c1"), entity("c2")], graph.relationships + [GraphRelationshipRow("rc", "c1", "c2", "", 9.0)], [])
    level0 = [c for c in detect(graph) if c.level == 0]
    assert [c.community_key for c in level0] == list(range(len(level0)))
    assert [c.size for c in level0] == sorted((c.size for c in level0), reverse=True)
