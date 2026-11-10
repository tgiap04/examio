"""gRPC ``kmaedu.ai.v1.AiService`` on :50051, guarded by service tokens.

``AiServicer`` wraps the existing chat / query / word-family / model-catalog
functions. Errors follow the contract in ``ai.proto``: model trouble ->
``UNAVAILABLE`` with the model code in the ``x-error-code`` trailer, bad input ->
``INVALID_ARGUMENT``, anything else -> ``INTERNAL`` with a correlation reference
(never raw error text).
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal

import grpc

from src.backend.ai_grpc_mapping import (
    ERROR_CODE_TRAILER,
    MODEL_ERROR_CODES,
    frame_to_proto,
    now_ms,
    to_catalog,
    to_sources,
    to_word_family,
)
from src.backend.auth.service_token import ServiceTokenInterceptor, ServiceTokenVerifier
from src.backend.grpc_generated.kmaedu.ai.v1 import ai_pb2, ai_pb2_grpc
from src.backend.services.chat_service import (
    ChatInputError,
    ChatParams,
    answer_query,
    new_error_ref,
    resolve_model_id,
    stream_chat,
)
from src.backend.services.generation_service import (
    WordFamilyRequest,
    generation_service,
)
from src.llm.model_manager import ModelUnavailableError, model_manager

logger = logging.getLogger(__name__)

MAX_CONCURRENT_RPCS = 64
SHUTDOWN_GRACE_SECONDS = 20
MAX_EXCLUDE_ROOT_WORDS = 50


def _params(request) -> ChatParams:
    return ChatParams(
        query=request.query,
        history=[{"role": m.role, "content": m.content} for m in request.history],
        user_storage_id=request.user_storage_id if request.HasField("user_storage_id") else None,
        model_type=request.model_type if request.HasField("model_type") else None,
        system_prompt=request.system_prompt if request.HasField("system_prompt") else None,
    )


async def _abort_internal(context: grpc.aio.ServicerContext, exc: Exception, what: str):
    ref = new_error_ref()
    logger.error("%s failed [%s]: %s", what, ref, exc, exc_info=True)
    await context.abort(grpc.StatusCode.INTERNAL, f"Internal error while {what} (ref: {ref})")


async def _abort_model(context: grpc.aio.ServicerContext, code: str, message: str):
    await context.abort(grpc.StatusCode.UNAVAILABLE, message, ((ERROR_CODE_TRAILER, code),))


class AiServicer(ai_pb2_grpc.AiServiceServicer):
    """Synchronous AI endpoints for ai-chat / vocabulary / content."""

    async def StreamChat(self, request, context):  # noqa: N802, D102
        try:
            async for frame in stream_chat(_params(request)):
                yield frame_to_proto(frame)
        except ChatInputError as exc:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ModelUnavailableError as exc:
            await _abort_model(context, exc.code, str(exc))
        except asyncio.CancelledError:
            # Client went away: aiter_blocking's finally already stopped the LLM stream.
            logger.info("StreamChat cancelled by the client")
            raise
        except Exception as exc:
            await _abort_internal(context, exc, "starting the stream")

    async def Query(self, request, context):  # noqa: N802, D102
        try:
            answer, sources = await answer_query(_params(request))
        except ChatInputError as exc:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ModelUnavailableError as exc:
            await _abort_model(context, exc.code, str(exc))
        except Exception as exc:
            await _abort_internal(context, exc, "processing the query")
        return ai_pb2.QueryResponse(answer=answer, sources=to_sources(sources), timestamp=now_ms())

    async def GenerateWordFamily(self, request, context):  # noqa: N802, D102
        model_type = request.model_type if request.HasField("model_type") else None
        root_word = request.root_word if request.HasField("root_word") else None
        try:
            if not root_word and not 1 <= request.num_root_words <= 20:
                raise ChatInputError("num_root_words must be between 1 and 20")
            if len(request.exclude_root_words) > MAX_EXCLUDE_ROOT_WORDS:
                raise ChatInputError(f"exclude_root_words exceeds {MAX_EXCLUDE_ROOT_WORDS} items")
            resolve_model_id(model_type)
            result = await generation_service.generate_word_family(
                WordFamilyRequest(
                    category_slug=request.category_slug,
                    category_name=request.category_name,
                    num_root_words=request.num_root_words or 1,
                    exclude_root_words=list(request.exclude_root_words),
                    root_word=root_word,
                    model_type=model_type,
                )
            )
        except ChatInputError as exc:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except ModelUnavailableError as exc:
            await _abort_model(context, exc.code, str(exc))
        except Exception as exc:
            await _abort_internal(context, exc, "generating the word family")
        if not result.get("success"):
            code = result.get("error_code")
            if code in MODEL_ERROR_CODES:
                await _abort_model(context, code, result.get("error") or "Model unavailable")
            await _abort_internal(context, RuntimeError(result.get("error", "unknown")), "generating the word family")
        return ai_pb2.GenerateWordFamilyResponse(data=to_word_family(result["data"]))

    async def ListModels(self, request, context):  # noqa: N802, D102
        try:
            return to_catalog(await model_manager.get_frontend_model_catalog())
        except Exception as exc:
            await _abort_internal(context, exc, "listing models")


def build_server(verifier: ServiceTokenVerifier | None = None) -> grpc.aio.Server:
    """Create the server (not started): interceptor, servicer, concurrency cap."""
    server = grpc.aio.server(
        interceptors=[ServiceTokenInterceptor(verifier or ServiceTokenVerifier.from_env())],
        maximum_concurrent_rpcs=MAX_CONCURRENT_RPCS,
    )
    ai_pb2_grpc.add_AiServiceServicer_to_server(AiServicer(), server)
    return server


async def serve(stop: asyncio.Event | None = None) -> None:
    """Serve until ``stop`` is set (or SIGTERM/SIGINT), then drain for 20 s."""
    port = int(os.environ.get("GRPC_PORT", "50051"))
    server = build_server()
    server.add_insecure_port(f"0.0.0.0:{port}")  # internal network only; no host port
    stop = stop or asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # non-main thread / Windows
            pass
    await server.start()
    logger.info("AiService listening on :%d", port)
    await stop.wait()
    logger.info("Stopping gRPC server (grace=%ds)", SHUTDOWN_GRACE_SECONDS)
    await server.stop(grace=SHUTDOWN_GRACE_SECONDS)
