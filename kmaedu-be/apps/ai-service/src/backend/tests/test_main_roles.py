"""ROLE parsing for ``python -m src.main``."""

import pytest

from src.main import parse_roles


def test_default_role_is_api():
    assert parse_roles(None) == {"api"} and parse_roles("") == {"api"}


def test_roles_are_a_comma_separated_set():
    assert parse_roles("api, worker") == {"api", "worker"}
    assert parse_roles("worker") == {"worker"}


@pytest.mark.parametrize("raw", ["admin", "api,nope", "migrate,api", "migrate,worker"])
def test_unknown_roles_and_migrate_mixes_are_rejected(raw):
    with pytest.raises(ValueError):
        parse_roles(raw)


def test_migrate_alone_is_allowed():
    assert parse_roles("migrate") == {"migrate"}
