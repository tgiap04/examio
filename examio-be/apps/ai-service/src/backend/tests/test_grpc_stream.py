"""gRPC AiService end to end over a real in-process server (fake model layer)."""

import asyncio
from collections.abc import AsyncIterator

import grpc
import pytest
from token_helpers import CountingJwks, Keypair, mint

from src import grpc_server
from src.backend.auth.service_token import ServiceTokenVerifier
from src.backend.grpc_generated.examio.ai.v1 import ai_pb2, ai_pb2_grpc
from src.backend.services.chat_service import ChatInputError
from src.llm.model_manager import ModelUnavailableError

KEY = Keypair("grpc-kid")


@pytest.fixture
async def stub() -> AsyncIterator[ai_pb2_grpc.AiServiceStub]:
    verifier = ServiceTokenVerifier(CountingJwks(KEY), "examio-auth", cooldown_seconds=0)
    server = grpc_server.build_server(verifier)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
        yield ai_pb2_grpc.AiServiceStub(channel)
    await server.stop(grace=1)


def auth(sub: str = "svc:ai-chat", **kwargs):
    return (("authorization", f"Bearer {mint(KEY, sub=sub, **kwargs)}"),)


def request(query: str = "hi") -> ai_pb2.StreamChatRequest:
    return ai_pb2.StreamChatRequest(query=query)


async def test_stream_yields_started_chunks_then_done(stub, monkeypatch):
    async def frames(params):
        assert params.query == "hi" and params.user_storage_id is None
        yield {"type": "started"}
        yield {"type": "chunk", "data": "Hel"}
        yield {"type": "chunk", "data": "lo"}
        yield {"type": "done", "answer": "Hello", "sources": [{"content": "c", "page": "3", "title": None, "chunkId": "k"}]}

    monkeypatch.setattr(grpc_server, "stream_chat", frames)
    got = [r async for r in stub.StreamChat(request(), metadata=auth())]

    assert [r.WhichOneof("event") for r in got] == ["started", "chunk", "chunk", "done"]
    assert got[1].chunk + got[2].chunk == "Hello"
    done = got[3].done
    assert done.assistant_message.role == "assistant" and done.assistant_message.content == "Hello"
    assert done.created_at > 0 and done.sources[0].chunk_id == "k" and done.sources[0].title == ""


async def test_stream_error_frame_keeps_the_model_code(stub, monkeypatch):
    async def frames(params):
        yield {"type": "started"}
        yield {"type": "error", "message": "Internal error while streaming response (ref: abc)", "code": "MODEL_RUNTIME_ERROR"}

    monkeypatch.setattr(grpc_server, "stream_chat", frames)
    last = [r async for r in stub.StreamChat(request(), metadata=auth())][-1]
    assert last.error.code == "MODEL_RUNTIME_ERROR" and "ref: abc" in last.error.message


async def test_client_cancel_stops_the_upstream_stream(stub, monkeypatch):
    closed = asyncio.Event()
    started = asyncio.Event()

    async def frames(params):
        try:
            yield {"type": "started"}
            started.set()
            while True:  # an LLM that keeps talking until told to stop
                yield {"type": "chunk", "data": "x"}
                await asyncio.sleep(0.02)
        finally:
            closed.set()

    monkeypatch.setattr(grpc_server, "stream_chat", frames)
    call = stub.StreamChat(request(), metadata=auth())
    assert (await call.read()).WhichOneof("event") == "started"
    await asyncio.wait_for(started.wait(), 2)
    call.cancel()
    with pytest.raises(asyncio.CancelledError):
        await call.read()
    await asyncio.wait_for(closed.wait(), 2)  # CancelledError handled: generator closed


async def test_pre_stream_errors_are_statuses_not_frames(stub, monkeypatch):
    async def too_long(params):
        raise ChatInputError("query exceeds 8000 characters")
        yield

    monkeypatch.setattr(grpc_server, "stream_chat", too_long)
    with pytest.raises(grpc.aio.AioRpcError) as bad:
        [r async for r in stub.StreamChat(request(), metadata=auth())]
    assert bad.value.code() == grpc.StatusCode.INVALID_ARGUMENT

    async def offline(params):
        raise ModelUnavailableError("model offline", code="MODEL_INSUFFICIENT_VRAM")
        yield

    monkeypatch.setattr(grpc_server, "stream_chat", offline)
    with pytest.raises(grpc.aio.AioRpcError) as unavailable:
        [r async for r in stub.StreamChat(request(), metadata=auth())]
    assert unavailable.value.code() == grpc.StatusCode.UNAVAILABLE
    assert unavailable.value.trailing_metadata()["x-error-code"] == "MODEL_INSUFFICIENT_VRAM"


async def test_unexpected_failure_is_internal_with_a_reference_and_no_raw_text(stub, monkeypatch):
    async def boom(params):
        raise RuntimeError("secret connection string leaked")
        yield

    monkeypatch.setattr(grpc_server, "stream_chat", boom)
    with pytest.raises(grpc.aio.AioRpcError) as caught:
        [r async for r in stub.StreamChat(request(), metadata=auth())]
    assert caught.value.code() == grpc.StatusCode.INTERNAL
    assert "secret" not in caught.value.details() and "ref:" in caught.value.details()


async def test_no_token_is_unauthenticated_and_the_servicer_never_runs(stub, monkeypatch):
    async def frames(params):
        raise AssertionError("must not run without a token")
        yield

    monkeypatch.setattr(grpc_server, "stream_chat", frames)
    for call in (stub.StreamChat(request()), stub.StreamChat(request(), metadata=(("authorization", "Bearer junk"),))):
        with pytest.raises(grpc.aio.AioRpcError) as caught:
            [r async for r in call]
        assert caught.value.code() == grpc.StatusCode.UNAUTHENTICATED
    with pytest.raises(grpc.aio.AioRpcError) as unary:
        await stub.Query(ai_pb2.QueryRequest(query="hi"))
    assert unary.value.code() == grpc.StatusCode.UNAUTHENTICATED


async def test_user_token_and_unknown_service_are_permission_denied(stub):
    user = auth("user-1", roles=["STUDENT"], extra={"sid": "s", "av": 0, "email_verified": True})
    for metadata in (user, auth("svc:admin")):
        with pytest.raises(grpc.aio.AioRpcError) as caught:
            await stub.ListModels(ai_pb2.ListModelsRequest(), metadata=metadata)
        assert caught.value.code() == grpc.StatusCode.PERMISSION_DENIED


async def test_query_maps_the_answer_and_sources(stub, monkeypatch):
    async def answer(params):
        assert (params.query, params.model_type, params.system_prompt, params.user_storage_id) == ("q", "m1", None, "doc1")
        assert params.history == [{"role": "user", "content": "earlier"}]
        return "42", [{"content": "c", "page": "1-2", "title": "T", "chunkId": "k1"}]

    monkeypatch.setattr(grpc_server, "answer_query", answer)
    reply = await stub.Query(
        ai_pb2.QueryRequest(
            query="q",
            model_type="m1",
            user_storage_id="doc1",
            history=[ai_pb2.ChatMessage(role="user", content="earlier")],
        ),
        metadata=auth("svc:content"),
    )
    assert reply.answer == "42" and reply.timestamp > 0
    assert (reply.sources[0].page, reply.sources[0].title, reply.sources[0].chunk_id) == ("1-2", "T", "k1")


async def test_list_models_maps_the_catalog(stub, monkeypatch):
    dto = {"id": "g1", "name": "G", "description": "d", "provider": "gemini", "runtimeModelName": "r", "badge": "",
           "disabled": False, "isDefault": True, "supportsStructuredOutput": True,
           "specs": [{"label": "ctx", "value": "1M"}], "available": False, "availabilityReason": "quota"}

    async def catalog():
        return {"embeddingModel": {**dto, "id": "emb"}, "generationModels": [dto], "defaultGenerationModel": "g1"}

    monkeypatch.setattr(grpc_server.model_manager, "get_frontend_model_catalog", catalog)
    reply = await stub.ListModels(ai_pb2.ListModelsRequest(), metadata=auth("svc:vocabulary"))
    assert reply.embedding_model.id == "emb" and reply.default_generation_model == "g1"
    (model,) = reply.generation_models
    assert model.available is False and model.availability_reason == "quota" and model.specs[0].value == "1M"


async def test_word_family_maps_success_and_model_errors(stub, monkeypatch):
    data = {"rootWord": "act", "categorySlug": "c", "words": [
        {"word": "action", "pos": "noun", "meaningEn": "e", "meaningVi": "v", "example": "ex",
         "affix": {"prefix": "", "root": "act", "suffix": "ion"}}]}
    outcome = {"value": {"success": True, "data": data}}

    async def generate(req):
        assert (req.category_slug, req.num_root_words, req.root_word) == ("c", 3, None)
        return outcome["value"]

    monkeypatch.setattr(grpc_server.generation_service, "generate_word_family", generate)
    monkeypatch.setattr(grpc_server, "resolve_model_id", lambda m: m)
    call = ai_pb2.GenerateWordFamilyRequest(category_slug="c", category_name="C", num_root_words=3)

    reply = await stub.GenerateWordFamily(call, metadata=auth("svc:vocabulary"))
    assert reply.data.root_word == "act" and reply.data.words[0].affix.suffix == "ion"

    outcome["value"] = {"success": False, "error": "down", "error_code": "MODEL_UNAVAILABLE", "status_code": 503}
    with pytest.raises(grpc.aio.AioRpcError) as caught:
        await stub.GenerateWordFamily(call, metadata=auth("svc:vocabulary"))
    assert caught.value.code() == grpc.StatusCode.UNAVAILABLE
    assert caught.value.trailing_metadata()["x-error-code"] == "MODEL_UNAVAILABLE"

    with pytest.raises(grpc.aio.AioRpcError) as bad:
        await stub.GenerateWordFamily(
            ai_pb2.GenerateWordFamilyRequest(category_slug="c", category_name="C", num_root_words=0),
            metadata=auth("svc:vocabulary"),
        )
    assert bad.value.code() == grpc.StatusCode.INVALID_ARGUMENT
