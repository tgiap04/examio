"""Service-token verification: RS256 only, aud=ai, SERVICE role, caller allow-list."""

import grpc
import pytest
from token_helpers import CountingJwks, Keypair, hs256_token, mint, unsigned_token

from src.backend.auth.service_token import (
    ALLOWED_CALLERS,
    ServiceTokenVerifier,
    TokenError,
)

KEY = Keypair("kid-1")


def verifier(jwks: CountingJwks, **kwargs) -> ServiceTokenVerifier:
    return ServiceTokenVerifier(jwks, "examio-auth", cooldown_seconds=kwargs.pop("cooldown_seconds", 0), **kwargs)


async def code_of(v: ServiceTokenVerifier, token: str) -> grpc.StatusCode:
    with pytest.raises(TokenError) as caught:
        await v.verify(token)
    return caught.value.code


async def test_valid_ai_chat_token_is_accepted():
    caller = await verifier(CountingJwks(KEY)).verify(mint(KEY, sub="svc:ai-chat"))
    assert caller.subject == "svc:ai-chat"


@pytest.mark.parametrize("sub", sorted(ALLOWED_CALLERS))
async def test_every_allow_listed_caller_is_accepted(sub):
    assert (await verifier(CountingJwks(KEY)).verify(mint(KEY, sub=sub))).subject == sub


def test_allow_list_is_the_code_constant_from_the_plan():
    assert ALLOWED_CALLERS == {"svc:ai-chat", "svc:vocabulary", "svc:content"}


async def test_user_token_is_permission_denied():
    token = mint(KEY, sub="user-1", roles=["STUDENT"], extra={"sid": "s", "av": 0, "email_verified": True})
    assert await code_of(verifier(CountingJwks(KEY)), token) == grpc.StatusCode.PERMISSION_DENIED


async def test_wrong_audience_is_unauthenticated():
    assert await code_of(verifier(CountingJwks(KEY)), mint(KEY, aud="finance")) == grpc.StatusCode.UNAUTHENTICATED


async def test_wrong_issuer_and_expired_are_unauthenticated():
    v = verifier(CountingJwks(KEY))
    assert await code_of(v, mint(KEY, iss="evil")) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, mint(KEY, exp_in=-60)) == grpc.StatusCode.UNAUTHENTICATED


async def test_hs256_and_none_are_unauthenticated():
    v = verifier(CountingJwks(KEY))
    assert await code_of(v, hs256_token("shared-secret", KEY.kid)) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, unsigned_token(KEY.kid)) == grpc.StatusCode.UNAUTHENTICATED


async def test_hs256_signed_with_the_public_modulus_is_still_rejected():
    # classic algorithm confusion: HMAC keyed with the JWKS public material
    assert await code_of(verifier(CountingJwks(KEY)), hs256_token(KEY.jwk["n"], KEY.kid)) == grpc.StatusCode.UNAUTHENTICATED


async def test_unknown_service_is_permission_denied():
    assert await code_of(verifier(CountingJwks(KEY)), mint(KEY, sub="svc:admin")) == grpc.StatusCode.PERMISSION_DENIED


async def test_the_retired_exam_service_is_permission_denied():
    assert await code_of(verifier(CountingJwks(KEY)), mint(KEY, sub="svc:exam")) == grpc.StatusCode.PERMISSION_DENIED


async def test_malformed_claims_are_unauthenticated():
    v = verifier(CountingJwks(KEY))
    assert await code_of(v, mint(KEY, roles=["SERVICE", "ADMIN"])) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, mint(KEY, sub="svc:content", roles=["STUDENT"])) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, mint(KEY, sub="user-1", roles=["SERVICE"])) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, mint(KEY, roles=[])) == grpc.StatusCode.UNAUTHENTICATED
    assert await code_of(v, mint(KEY, typ="JWT")) == grpc.StatusCode.UNAUTHENTICATED


async def test_garbage_and_missing_metadata_are_unauthenticated():
    v = verifier(CountingJwks(KEY))
    assert await code_of(v, "not-a-jwt") == grpc.StatusCode.UNAUTHENTICATED
    for metadata in ((), (("authorization", "Basic abc"),), (("authorization", "Bearer "),)):
        with pytest.raises(TokenError) as caught:
            await v.authorize(metadata)
        assert caught.value.code == grpc.StatusCode.UNAUTHENTICATED


async def test_authorize_reads_the_bearer_header_case_insensitively():
    v = verifier(CountingJwks(KEY))
    caller = await v.authorize((("Authorization", f"bearer {mint(KEY)}"),))
    assert caller.subject == "svc:ai-chat"


async def test_unknown_kid_triggers_exactly_one_refetch_and_then_verifies():
    rotated = Keypair("kid-2")
    jwks = CountingJwks(KEY)
    v = verifier(jwks)
    await v.verify(mint(KEY))
    assert jwks.calls == 1
    jwks.keys = [KEY.jwk, rotated.jwk]  # auth rotated its signing key
    assert (await v.verify(mint(rotated))).subject == "svc:ai-chat"
    assert jwks.calls == 2
    await v.verify(mint(rotated))  # warm now: no further fetch
    assert jwks.calls == 2


async def test_kid_that_stays_unknown_is_rejected_after_one_refetch():
    jwks = CountingJwks(KEY)
    v = verifier(jwks)
    await v.verify(mint(KEY))
    assert await code_of(v, mint(Keypair("kid-x"))) == grpc.StatusCode.UNAUTHENTICATED
    assert jwks.calls == 2


async def test_refetch_is_rate_limited_by_the_cooldown():
    jwks = CountingJwks(KEY)
    v = ServiceTokenVerifier(jwks, "examio-auth", cooldown_seconds=60)
    await v.verify(mint(KEY))
    for _ in range(3):
        assert await code_of(v, mint(Keypair("kid-y"))) == grpc.StatusCode.UNAUTHENTICATED
    assert jwks.calls == 1  # a stream of random kids cannot hammer the auth service


async def test_jwks_outage_fails_closed():
    jwks = CountingJwks(KEY)
    jwks.fail = True
    assert await code_of(verifier(jwks), mint(KEY)) == grpc.StatusCode.UNAUTHENTICATED
