from src.graphrag.query.context_builder import (
    Section,
    SourceUnit,
    build_context,
    build_sources,
    dedupe_units,
    format_unit,
)


def unit(i: int, text: str = "x" * 50, title: str | None = "T") -> SourceUnit:
    return SourceUnit(f"c{i}", str(i), title, text)


def test_context_never_exceeds_the_budget_and_cuts_a_section_to_its_share():
    sections = [Section("A", ["a" * 100] * 10, 0.2), Section("B", ["b" * 100] * 10, 0.8)]
    context = build_context(sections, 500)
    assert len(context) <= 500
    first, second = context.split("\n\n")
    assert len(first) <= 100 and first.startswith("## A")
    assert second.startswith("## B")


def test_empty_sections_print_no_title_and_nothing_at_all_gives_none():
    context = build_context([Section("Empty", [], 0.2), Section("Units", ["u1"], 0.8)], 200)
    assert "Empty" not in context and context == "## Units\nu1"
    assert build_context([Section("Empty", [], 1.0)], 200) is None
    assert build_context([Section("A", ["x"], 1.0)], 0) is None


def test_unused_share_rolls_forward_to_the_next_section():
    small = Section("Small", ["tiny"], 0.5)
    big = Section("Big", ["z" * 370], 0.5)
    assert "z" * 370 in build_context([small, big], 400)  # 200 alone would cut it
    assert "z" * 370 not in build_context([big, small], 400)


def test_a_cut_item_ends_the_section_and_whole_items_are_kept_while_they_fit():
    context = build_context([Section("S", ["a" * 30, "b" * 30, "c" * 30], 1.0)], 80)
    assert context == "## S\n" + "a" * 30 + "\n" + "b" * 30 and "c" not in context


def test_dedupe_and_sources_keep_the_citation_shape():
    units = [unit(1, "y" * 400, title=None), unit(1), unit(2), unit(3), unit(4)]
    assert [u.chunk_id for u in dedupe_units(units)] == ["c1", "c2", "c3", "c4"]
    sources = build_sources(units, 3)
    assert [s["chunkId"] for s in sources] == ["c1", "c2", "c3"]
    assert sources[0] == {"content": "y" * 300, "page": "1", "title": None, "chunkId": "c1"}


def test_format_unit_carries_the_page():
    assert format_unit(unit(7, "hello")) == "[Trang 7]: hello"
