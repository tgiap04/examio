"""Service-token gRPC interceptor (``python-jose``), mirroring ``libs/auth-jwt``.

A call is accepted only when its ``authorization`` metadata carries a bearer
token that is RS256-signed by the auth service (keys from ``AUTH_JWKS_URL``,
cached and refetched once on an unknown ``kid``), has ``typ=at+jwt``, the
configured issuer, ``aud=ai`` and a future ``exp``/``iat``, carries exactly the
``SERVICE`` role with ``sub = svc:<name>``, and ``<name>`` is on the code-level
allow-list. Missing or invalid token -> ``UNAUTHENTICATED``; a user token or a
service outside the allow-list -> ``PERMISSION_DENIED``.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import grpc
from jose import JWTError, jwt

from .jwks import (
    JWKS_CACHE_SECONDS,
    JWKS_REFETCH_COOLDOWN_SECONDS,
    JwksCache,
    JwksError,
    JwksFetcher,
    http_jwks_fetcher,
)

logger = logging.getLogger(__name__)

AUDIENCE = "ai"
SERVICE_ROLE = "SERVICE"
SERVICE_SUBJECT_PREFIX = "svc:"
ACCESS_TOKEN_TYP = "at+jwt"
# A code constant, not env: widening who may call the ai-service is a code review.
ALLOWED_CALLERS = frozenset({"svc:ai-chat", "svc:vocabulary", "svc:content"})


class TokenError(Exception):
    """A token that must be rejected, carrying the gRPC status to answer with."""

    def __init__(self, code: grpc.StatusCode, message: str) -> None:
        """Carry the gRPC ``code`` and client-visible ``message``."""
        super().__init__(message)
        self.code = code
        self.message = message


def _unauthenticated(message: str = "UNAUTHENTICATED") -> TokenError:
    return TokenError(grpc.StatusCode.UNAUTHENTICATED, message)


def _denied() -> TokenError:
    return TokenError(grpc.StatusCode.PERMISSION_DENIED, "PERMISSION_DENIED")


@dataclass(frozen=True)
class ServiceCaller:
    """A verified, allow-listed service caller (``svc:<name>``)."""

    subject: str


class ServiceTokenVerifier:
    """Verifies service tokens against a cached JWKS."""

    def __init__(
        self,
        fetch_jwks: JwksFetcher,
        issuer: str,
        audience: str = AUDIENCE,
        allowed_callers: frozenset[str] = ALLOWED_CALLERS,
        cooldown_seconds: float = JWKS_REFETCH_COOLDOWN_SECONDS,
        cache_seconds: float = JWKS_CACHE_SECONDS,
    ) -> None:
        """Create a verifier over ``fetch_jwks`` (cooldown rate-limits kid-miss refetches)."""
        self._jwks = JwksCache(fetch_jwks, cooldown_seconds, cache_seconds)
        self._issuer = issuer
        self._audience = audience
        self._allowed = allowed_callers

    @classmethod
    def from_env(cls) -> ServiceTokenVerifier:
        """Build from ``AUTH_JWKS_URL`` and ``JWT_ISSUER`` (default ``examio-auth``)."""
        url = os.environ.get("AUTH_JWKS_URL", "").strip()
        if not url:
            raise RuntimeError("AUTH_JWKS_URL is required to verify service tokens")
        return cls(http_jwks_fetcher(url), os.environ.get("JWT_ISSUER", "").strip() or "examio-auth")

    async def verify(self, token: str) -> ServiceCaller:
        """Return the caller or raise :class:`TokenError`."""
        try:
            header = jwt.get_unverified_header(token)
        except JWTError as exc:
            raise _unauthenticated() from exc
        kid = header.get("kid")
        if header.get("alg") != "RS256" or header.get("typ") != ACCESS_TOKEN_TYP or not kid:
            raise _unauthenticated()
        try:
            key = await self._jwks.key_for(kid)
        except JwksError as exc:
            raise _unauthenticated() from exc
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require_exp": True, "require_iat": True, "verify_at_hash": False},
            )
        except JWTError as exc:
            raise _unauthenticated() from exc
        return self._principal(claims)

    def _principal(self, claims: dict[str, Any]) -> ServiceCaller:
        sub, roles = claims.get("sub"), claims.get("roles")
        if not isinstance(sub, str) or not sub:
            raise _unauthenticated()
        if not isinstance(roles, list) or not roles or not all(isinstance(r, str) for r in roles):
            raise _unauthenticated()
        is_service_role = SERVICE_ROLE in roles
        if is_service_role != sub.startswith(SERVICE_SUBJECT_PREFIX):
            raise _unauthenticated()
        if not is_service_role:
            raise _denied()  # a user token never reaches the ai-service
        if roles != [SERVICE_ROLE] or sub == SERVICE_SUBJECT_PREFIX:
            raise _unauthenticated()
        if sub not in self._allowed:
            logger.warning("Service caller %s is not allowed on the ai-service", sub)
            raise _denied()
        return ServiceCaller(sub)

    async def authorize(self, metadata: Any) -> ServiceCaller:
        """Authorize a call from its invocation metadata (``authorization: Bearer ...``)."""
        raw = next((v for k, v in (metadata or ()) if k.lower() == "authorization"), None)
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", "ignore")
        if not raw:
            raise _unauthenticated()
        scheme, _, token = raw.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise _unauthenticated()
        return await self.verify(token.strip())


class ServiceTokenInterceptor(grpc.aio.ServerInterceptor):
    """Rejects every RPC that does not carry an allow-listed service token."""

    def __init__(self, verifier: ServiceTokenVerifier) -> None:
        """Guard every RPC with ``verifier``."""
        self._verifier = verifier

    async def intercept_service(self, continuation, handler_call_details):  # noqa: D102
        handler = await continuation(handler_call_details)
        if handler is None:
            return None
        verifier = self._verifier

        async def guard(context: grpc.aio.ServicerContext) -> None:
            try:
                await verifier.authorize(context.invocation_metadata())
            except TokenError as err:
                await context.abort(err.code, err.message)

        if handler.unary_unary:
            inner = handler.unary_unary

            async def unary_unary(request, context):
                await guard(context)
                return await inner(request, context)

            return grpc.unary_unary_rpc_method_handler(
                unary_unary, handler.request_deserializer, handler.response_serializer
            )
        if handler.unary_stream:
            inner_stream = handler.unary_stream

            async def unary_stream(request, context):
                await guard(context)
                stream = inner_stream(request, context)
                try:
                    async for item in stream:
                        yield item
                finally:  # client cancel / error: stop the upstream (LLM) stream too
                    await stream.aclose()

            return grpc.unary_stream_rpc_method_handler(
                unary_stream, handler.request_deserializer, handler.response_serializer
            )

        async def deny(request, context):
            await context.abort(grpc.StatusCode.UNIMPLEMENTED, "unsupported call type")

        return grpc.unary_unary_rpc_method_handler(deny)
