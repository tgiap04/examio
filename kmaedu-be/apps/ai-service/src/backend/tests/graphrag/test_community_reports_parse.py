"""Strict parsing of the community-report completion (untrusted LLM output)."""

import json

import pytest

from src.graphrag.community_reports import (
    MAX_FINDINGS,
    MAX_SUMMARY_WORDS,
    MAX_TITLE_CHARS,
    ReportParseError,
    parse_report,
)

GOOD = {
    "title": "Mã hóa đối xứng",
    "summary": "AES và DES dùng chung một khóa.",
    "findings": [{"summary": "AES nhanh", "explanation": "Chạy tốt trên phần cứng."}],
    "rating": 7.5,
}


def test_a_well_formed_report_parses():
    report = parse_report(json.dumps(GOOD, ensure_ascii=False))
    assert report.title == "Mã hóa đối xứng"
    assert report.summary == "AES và DES dùng chung một khóa."
    assert report.findings == [{"summary": "AES nhanh", "explanation": "Chạy tốt trên phần cứng."}]
    assert report.rating == 7.5


def test_json_wrapped_in_a_markdown_fence_or_chatter_still_parses():
    assert parse_report("Here you go:\n```json\n" + json.dumps(GOOD) + "\n```").title == GOOD["title"]


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "sorry, I cannot",
        '{"title": "Cut off", "summary": "Half a sent',  # truncated
        "[1, 2, 3]",
        json.dumps({"summary": "no title"}),
        json.dumps({"title": "no summary"}),
        json.dumps({"title": "  ", "summary": "blank title"}),
        json.dumps({"title": "T", "summary": 42}),
    ],
)
def test_malformed_or_incomplete_output_raises_instead_of_returning_a_partial_report(raw):
    with pytest.raises(ReportParseError):
        parse_report(raw)


def test_long_fields_are_bounded():
    raw = json.dumps(
        {
            "title": "t" * 500,
            "summary": " ".join(["word"] * 400),
            "findings": [{"summary": f"s{i}", "explanation": "e" * 2000} for i in range(9)],
            "rating": 3,
        }
    )
    report = parse_report(raw)
    assert len(report.title) == MAX_TITLE_CHARS
    assert len(report.summary.split()) == MAX_SUMMARY_WORDS
    assert len(report.findings) == MAX_FINDINGS and all(len(f["explanation"]) <= 600 for f in report.findings)


@pytest.mark.parametrize(("rating", "expected"), [(11, 10.0), (-4, 0.0), ("8", 8.0), ("high", None), (None, None), (True, None)])
def test_rating_is_clamped_to_zero_ten_and_junk_becomes_none(rating, expected):
    assert parse_report(json.dumps({**GOOD, "rating": rating})).rating == expected


def test_malformed_findings_are_dropped_not_fatal():
    raw = json.dumps({**GOOD, "findings": ["text", {"summary": ""}, {"summary": "ok"}, {"explanation": "no summary"}]})
    assert parse_report(raw).findings == [{"summary": "ok", "explanation": ""}]
