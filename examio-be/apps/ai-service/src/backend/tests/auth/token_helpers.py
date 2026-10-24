"""RSA keys, JWKS documents and token minting for the service-token tests."""

from __future__ import annotations

import base64
import json
import time
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt

ISSUER = "examio-auth"


class Keypair:
    """An RSA keypair with its public JWK."""

    def __init__(self, kid: str) -> None:
        self.kid = kid
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        public_pem = key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.jwk: dict[str, Any] = {**jwk.construct(public_pem, "RS256").to_dict(), "kid": kid, "use": "sig"}


def mint(
    keypair: Keypair,
    *,
    sub: str = "svc:ai-chat",
    roles: list[str] | None = None,
    aud: str = "ai",
    iss: str = ISSUER,
    exp_in: int = 900,
    typ: str = "at+jwt",
    extra: dict[str, Any] | None = None,
) -> str:
    """Sign an RS256 token with the claims the auth service puts on service tokens."""
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "roles": ["SERVICE"] if roles is None else roles,
        "aud": aud,
        "iss": iss,
        "iat": now - 1,
        "exp": now + exp_in,
        **(extra or {}),
    }
    return jwt.encode(claims, keypair.private_pem, algorithm="RS256", headers={"kid": keypair.kid, "typ": typ})


def _b64(data: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def unsigned_token(kid: str) -> str:
    """A well-formed ``alg: none`` token claiming to be an allowed service."""
    header = {"alg": "none", "typ": "at+jwt", "kid": kid}
    claims = {"sub": "svc:exam", "roles": ["SERVICE"], "aud": "ai", "iss": ISSUER, "exp": int(time.time()) + 900, "iat": 1}
    return f"{_b64(header)}.{_b64(claims)}."


def hs256_token(secret: str, kid: str) -> str:
    """An HS256 token (algorithm-confusion attempt) with valid-looking claims."""
    now = int(time.time())
    claims = {"sub": "svc:exam", "roles": ["SERVICE"], "aud": "ai", "iss": ISSUER, "exp": now + 900, "iat": now - 1}
    return jwt.encode(claims, secret, algorithm="HS256", headers={"kid": kid, "typ": "at+jwt"})


class CountingJwks:
    """A JWKS fetcher that counts calls and serves a replaceable key set."""

    def __init__(self, *keypairs: Keypair) -> None:
        self.keys = [k.jwk for k in keypairs]
        self.calls = 0
        self.fail = False

    async def __call__(self) -> list[dict[str, Any]]:
        self.calls += 1
        if self.fail:
            raise ConnectionError("auth unreachable")
        return list(self.keys)
