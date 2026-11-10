"""Envelope shape, ulid id, version and source rules (mirror of envelope.spec.ts)."""

import json
import re

import pytest

from src.backend.messaging import envelope as env
from src.backend.messaging.errors import PermanentEventError

ULID = re.compile(r"^evt_[0-9A-HJKMNP-TV-Z]{26}$")


def test_build_has_the_v1_shape():
    e = env.build("ai.document.processed", {"storageId": "s1"}, "ai", "cor_x")
    assert ULID.match(e.id)
    assert e.to_dict() == {
        "id": e.id,
        "type": "ai.document.processed",
        "version": 1,
        "occurredAt": e.occurredAt,
        "source": "ai",
        "correlationId": "cor_x",
        "data": {"storageId": "s1"},
    }
    assert re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$", e.occurredAt)


def test_correlation_id_defaults_and_ids_are_unique_and_sortable():
    first, second = env.build("ai.x", {}, "ai"), env.build("ai.x", {}, "ai")
    assert first.correlationId.startswith("cor_")
    assert first.id != second.id
    assert len(first.id) == len("evt_") + 26


def test_source_must_equal_the_domain_of_the_type():
    with pytest.raises(ValueError):
        env.build("document.uploaded", {}, "ai")


def test_parse_roundtrip():
    built = env.build("ai.generation.failed", {"jobId": "j"}, "ai")
    assert env.parse(json.dumps(built.to_dict())) == built


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(version=2),
        lambda d: d.update(version=None),
        lambda d: d.update(id="nope"),
        lambda d: d.pop("data"),
        lambda d: d.update(source=""),
        lambda d: d.pop("correlationId"),
    ],
)
def test_invalid_envelopes_are_permanent(mutate):
    d = env.build("ai.x", {}, "ai").to_dict()
    mutate(d)
    with pytest.raises(PermanentEventError):
        env.parse(json.dumps(d))


def test_version_two_is_reported_as_unsupported():
    d = env.build("ai.x", {}, "ai").to_dict()
    d["version"] = 2
    with pytest.raises(PermanentEventError) as caught:
        env.parse(json.dumps(d))
    assert caught.value.code == "UNSUPPORTED_VERSION"


@pytest.mark.parametrize("body", [b"not json", b"[]", b'"x"', b"null"])
def test_non_object_bodies_are_permanent(body):
    with pytest.raises(PermanentEventError):
        env.parse(body)
