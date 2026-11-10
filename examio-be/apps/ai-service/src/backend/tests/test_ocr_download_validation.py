"""SSRF validation of stored-file download URLs, including the private-host switch."""

from __future__ import annotations

import importlib
import socket
import sys
from pathlib import Path
from unittest import mock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# ``src.backend.services`` re-exports an ``ocr_service`` instance that shadows the module name.
ocr_module = importlib.import_module("src.backend.services.ocr_service")
DownloadValidationError = ocr_module.DownloadValidationError
_validate_download_url = ocr_module._validate_download_url

HOST = "store.internal.example"
URL = f"https://{HOST}/bucket/file.pdf"


def _resolve_to(address: str):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    infos = [(family, socket.SOCK_STREAM, 6, "", (address, 0))]
    return mock.patch.object(ocr_module.socket, "getaddrinfo", return_value=infos)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("R2_ALLOWED_HOSTS", "R2_PUBLIC_URL", "R2_ALLOW_PRIVATE_HOSTS"):
        monkeypatch.delenv(name, raising=False)


def test_public_allowlisted_host_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    with _resolve_to("93.184.216.34"):
        assert _validate_download_url(URL) == "93.184.216.34"


@pytest.mark.parametrize("address", ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1"])
def test_private_loopback_link_local_are_refused_by_default(
    monkeypatch: pytest.MonkeyPatch, address: str
) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    with _resolve_to(address), pytest.raises(DownloadValidationError, match="disallowed address"):
        _validate_download_url(URL)


@pytest.mark.parametrize("value", ["false", "0", "", "no"])
def test_switch_off_values_keep_the_default(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", value)
    with _resolve_to("10.0.0.5"), pytest.raises(DownloadValidationError):
        _validate_download_url(URL)


@pytest.mark.parametrize("address", ["10.0.0.5", "172.16.3.4", "127.0.0.1", "fd00::1", "::1"])
def test_switch_allows_an_allowlisted_private_host(
    monkeypatch: pytest.MonkeyPatch, address: str
) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with _resolve_to(address):
        assert _validate_download_url(URL) == address


@pytest.mark.parametrize("address", ["169.254.169.254", "169.254.1.1", "fe80::1"])
def test_switch_never_allows_link_local(monkeypatch: pytest.MonkeyPatch, address: str) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with _resolve_to(address), pytest.raises(DownloadValidationError, match="disallowed address"):
        _validate_download_url(URL)


def test_switch_does_not_help_a_host_that_is_not_allowlisted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", "other.example")
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with _resolve_to("10.0.0.5"), pytest.raises(DownloadValidationError, match="not in the allowed"):
        _validate_download_url(URL)


def test_switch_ignores_the_r2_public_url_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only an explicit R2_ALLOWED_HOSTS entry may be private; the CDN fallback never is."""
    monkeypatch.setenv("R2_PUBLIC_URL", f"https://{HOST}")
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with _resolve_to("10.0.0.5"), pytest.raises(DownloadValidationError, match="disallowed address"):
        _validate_download_url(URL)


def test_switch_still_refuses_reserved_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with _resolve_to("240.0.0.1"), pytest.raises(DownloadValidationError, match="disallowed address"):
        _validate_download_url(URL)


def test_switch_does_not_relax_the_scheme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("R2_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("R2_ALLOW_PRIVATE_HOSTS", "true")
    with pytest.raises(DownloadValidationError, match="non-https"):
        _validate_download_url(f"http://{HOST}/f.pdf")
