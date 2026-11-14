"""Unit tests for the RAG eval metrics and judge parsing."""

from __future__ import annotations

import numpy as np

from src.backend.eval.judge import parse_answer_grade, parse_cluster_count
from src.backend.eval.metrics import duplicate_pairs, duplicate_rate, page_coverage


def test_duplicate_pairs_finds_near_identical_only():
    vecs = [[1.0, 0.0], [0.99, 0.01], [0.0, 1.0]]
    assert duplicate_pairs(vecs, 0.9) == [(0, 1)]


def test_duplicate_pairs_empty_and_single():
    assert duplicate_pairs([], 0.9) == []
    assert duplicate_pairs([[1.0, 0.0]], 0.9) == []


def test_duplicate_pairs_zero_vector_is_safe():
    assert duplicate_pairs(np.array([[0.0, 0.0], [0.0, 0.0]]), 0.5) == []


def test_duplicate_rate_counts_items_in_any_pair():
    vecs = [[1, 0], [1, 0.01], [1, 0.02], [0, 1]]
    assert duplicate_rate(vecs) == 0.75


def test_duplicate_rate_degenerate_inputs():
    assert duplicate_rate([]) == 0.0
    assert duplicate_rate([[1, 0]]) == 0.0


def test_page_coverage_ranges_and_clamp():
    assert page_coverage(["1", "3-5"], 10) == 0.4
    assert page_coverage(["8-20"], 10) == 0.3


def test_page_coverage_ignores_garbage_and_bad_total():
    assert page_coverage(["abc", "", None, "5-3", "0"], 10) == 0.0
    assert page_coverage(["1"], 0) == 0.0
    assert page_coverage([], 10) == 0.0


def test_parse_cluster_count():
    assert parse_cluster_count('```json\n{"clusters": 7}\n```', 10) == 7
    assert parse_cluster_count('{"clusters": [[1,2],[3]]}', 3) == 2
    assert parse_cluster_count("nope", 10) is None
    assert parse_cluster_count('{"clusters": 0}', 10) is None
    assert parse_cluster_count('{"clusters": 99}', 10) is None


def test_parse_answer_grade():
    g = parse_answer_grade('{"correct": 2, "key_points_covered": 1, "grounded": 1}', 2)
    assert g == {"correct": 2, "complete": 0.5, "grounded": 1.0}
    assert parse_answer_grade('{"correct": 5, "key_points_covered": 1, "grounded": 1}', 2) is None
    assert parse_answer_grade("garbage", 2) is None
