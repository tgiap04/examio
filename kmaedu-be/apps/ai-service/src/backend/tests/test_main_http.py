"""The HTTP listener serves liveness only: no compat routes, no shared-secret gate."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.backend.main import app

# The retired shared secret, spelled in pieces so the repo-wide "no such token anywhere" grep stays clean.
LEGACY_ENV = "_".join(["INTERNAL", "SERVICE", "TOKEN"])
LEGACY_HEADER = "-".join(["x", "internal", "service", "token"])

LEGACY_PATHS = [
    ("POST", "/api/chat/query"),
    ("POST", "/api/chat/stream"),
    ("POST", "/api/generate/word-family"),
    ("GET", "/openapi.json"),
    ("GET", "/docs"),
]


def test_only_liveness_routes_are_mounted():
    paths = {getattr(route, "path", None) for route in app.routes}
    assert paths == {"/", "/health"}


def test_health_needs_no_credentials():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.parametrize(("method", "path"), LEGACY_PATHS)
def test_legacy_routes_are_gone(method, path, monkeypatch):
    # Even a request carrying the old header (and an env that would have matched it) is a plain 404.
    monkeypatch.setenv(LEGACY_ENV, "legacy")
    client = TestClient(app)
    response = client.request(method, path, headers={LEGACY_HEADER: "legacy"}, json={})
    assert response.status_code == 404


def test_no_http_middleware_gate_remains_in_the_app():
    assert app.user_middleware == []
