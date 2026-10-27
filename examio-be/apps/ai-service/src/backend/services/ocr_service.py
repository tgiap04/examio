"""
OCR Processing Service - Xử lý OCR và embeddings cho files

Service này CHỈ xử lý AI tasks, từ event ``document.uploaded``:
1. Nhận storageId + presigned download URL
2. Download file (SSRF-validated)
3. OCR và chunk content
4. Tạo embeddings và lưu vào Document table (schema ai)

KHÔNG xử lý: upload file, trạng thái xử lý (document-service giữ trạng thái,
ai-service báo kết quả qua event ai.document.processed|failed).
"""

import asyncio
import ipaddress
import os
import logging
import socket
import tempfile
import time
import httpx
from typing import Optional, List, Tuple, Any, Dict
from datetime import datetime
from dataclasses import dataclass
from urllib.parse import urlparse

import asyncpg
from langchain_text_splitters import RecursiveCharacterTextSplitter

from src import db
from src.llm.gemini_embeddings import get_embedding_text_limit

logger = logging.getLogger(__name__)

DEFAULT_OCR_TEXT_CHUNK_OVERLAP = 200
DEFAULT_MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50MB


class FileExtractionError(Exception):
    """Raised when a file cannot be parsed into text."""


class DownloadValidationError(FileExtractionError):
    """Raised when a stored-file URL fails SSRF/security validation."""


class NoContentExtractedError(Exception):
    """Raised when OCR/text extraction returns no usable content."""


def _get_max_download_bytes() -> int:
    return _get_int_env("MAX_DOWNLOAD_BYTES", DEFAULT_MAX_DOWNLOAD_BYTES)


def _get_explicit_allowed_hosts() -> set[str]:
    """Return the hostnames listed in ``R2_ALLOWED_HOSTS`` (no fallback)."""
    raw = os.getenv("R2_ALLOWED_HOSTS", "")
    return {host.strip().lower() for host in raw.split(",") if host.strip()}


def _private_hosts_allowed(hostname: str) -> bool:
    """Tell whether ``hostname`` may resolve to a private address.

    Only when ``R2_ALLOW_PRIVATE_HOSTS`` is true (default false) AND the host
    is listed in ``R2_ALLOWED_HOSTS`` itself; the ``R2_PUBLIC_URL`` fallback
    never qualifies. Meant for private-network stacks (a local S3 stub, a
    self-hosted object store).
    """
    flag = os.getenv("R2_ALLOW_PRIVATE_HOSTS", "").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return False
    return hostname.lower() in _get_explicit_allowed_hosts()


def _get_allowed_download_hosts() -> set[str]:
    """Resolve the allow-listed hostnames for outbound file downloads.

    Prefers the explicit ``R2_ALLOWED_HOSTS`` allowlist; falls back to the
    hostname of the existing R2 public/CDN base URL (``R2_PUBLIC_URL``) used
    elsewhere in the repo. Returns an empty set if neither is configured.

    An empty set means the allowlist is NOT configured. Callers must treat
    that as fail-closed (reject the download) rather than "any public host
    is allowed" -- see ``_validate_download_url``.
    """
    hosts = _get_explicit_allowed_hosts()
    if hosts:
        return hosts

    r2_public_url = os.getenv("R2_PUBLIC_URL")
    if r2_public_url:
        hostname = urlparse(r2_public_url).hostname
        if hostname:
            return {hostname.lower()}

    return set()


def _validate_download_url(url: str) -> str:
    """Validate a stored file URL before fetching it (SSRF hardening).

    Requires an https scheme, a configured and allow-listed host, and a
    resolved address that is not private/loopback/link-local/reserved.
    ``R2_ALLOW_PRIVATE_HOSTS=true`` lifts the private/loopback refusal for
    hosts listed in ``R2_ALLOWED_HOSTS`` only (link-local and reserved
    addresses stay refused).
    Redirects are kept disabled by the caller (httpx follow_redirects=False).

    The allowlist is fail-closed: if neither ``R2_ALLOWED_HOSTS`` nor
    ``R2_PUBLIC_URL`` is configured, downloads are refused entirely instead
    of silently permitting any public host.

    Returns:
        The single validated IP address the caller must connect to. Returning
        it (rather than just validating and letting the caller re-resolve
        the hostname) closes the DNS-rebinding TOCTOU window where the name
        could resolve to a different (internal) address between validation
        time and connect time.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise DownloadValidationError(
            f"Refusing to download from non-https URL scheme: {parsed.scheme!r}"
        )

    hostname = parsed.hostname
    if not hostname:
        raise DownloadValidationError("Download URL has no hostname")

    allowed_hosts = _get_allowed_download_hosts()
    if not allowed_hosts:
        raise DownloadValidationError(
            "Download host allowlist is not configured (set R2_ALLOWED_HOSTS "
            "or R2_PUBLIC_URL); refusing to download to fail closed"
        )
    if hostname.lower() not in allowed_hosts:
        raise DownloadValidationError(
            f"Host {hostname!r} is not in the allowed download host list"
        )

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise DownloadValidationError(
            f"Could not resolve download host {hostname!r}: {exc}"
        ) from exc

    link_local_v4 = ipaddress.ip_network("169.254.0.0/16")
    private_ok = _private_hosts_allowed(hostname)
    validated_ip: Optional[str] = None
    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])
        # Link-local (incl. the 169.254.169.254 metadata endpoint) is never allowed.
        link_local = ip.is_link_local or (ip.version == 4 and ip in link_local_v4)
        internal = ip.is_private or ip.is_loopback
        # ::1 is also in the IPv6 reserved block: loopback is judged as internal, not reserved.
        if (
            link_local
            or (ip.is_reserved and not ip.is_loopback)
            or (internal and not private_ok)
        ):
            raise DownloadValidationError(
                f"Refusing to download from {hostname!r}: resolves to disallowed address {ip}"
            )
        if validated_ip is None:
            validated_ip = str(ip)

    if validated_ip is None:
        raise DownloadValidationError(
            f"Could not resolve any address for download host {hostname!r}"
        )

    return validated_ip


def _get_int_env(name: str, default: int, min_value: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default

    try:
        value = int(raw)
        return max(min_value, value)
    except ValueError:
        logger.warning(f"Invalid {name}={raw!r}, using default={default}")
        return default


def _resolve_text_splitter_config() -> tuple[int, int, int]:
    embed_limit = get_embedding_text_limit()
    configured_chunk_size = _get_int_env("OCR_TEXT_CHUNK_SIZE", embed_limit)
    chunk_size = min(configured_chunk_size, embed_limit)

    default_overlap = min(DEFAULT_OCR_TEXT_CHUNK_OVERLAP, max(0, chunk_size - 1))
    configured_overlap = _get_int_env("OCR_TEXT_CHUNK_OVERLAP", default_overlap, min_value=0)
    chunk_overlap = min(configured_overlap, max(0, chunk_size - 1))

    if configured_chunk_size > chunk_size:
        logger.info(
            f"OCR_TEXT_CHUNK_SIZE={configured_chunk_size} exceeds GEMINI_EMBED_MAX_LENGTH={embed_limit}; using chunk_size={chunk_size}"
        )
    if configured_overlap != chunk_overlap:
        logger.info(
            f"OCR_TEXT_CHUNK_OVERLAP={configured_overlap} exceeds allowed range for chunk_size={chunk_size}; using chunk_overlap={chunk_overlap}"
        )

    return chunk_size, chunk_overlap, embed_limit


@dataclass
class FileInfo:
    """What the OCR pipeline needs to know about a stored file (from document.uploaded)."""
    id: str
    filename: str
    url: str  # presigned download URL
    mimetype: str


@dataclass
class DocumentChunk:
    """Document chunk with embedding"""
    id: str
    user_storage_id: str
    page_range: str
    title: Optional[str]
    content: str
    created_at: datetime


class OCRProcessingService:
    """Service xử lý OCR và embeddings (stateless, lưu vào Document trong schema ai)."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def _get_pool(self) -> asyncpg.Pool:
        """Return the shared ai-service pool."""
        return await db.get_pool()

    async def get_document_chunks(self, user_storage_id: str) -> List[DocumentChunk]:
        """Get all OCR'd chunks for a file"""
        pool = await self._get_pool()

        query = """
            SELECT id, "userStorageId", "pageRange", title, content, "createdAt"
            FROM "Document"
            WHERE "userStorageId" = $1
            ORDER BY "createdAt"
        """

        start_time = time.perf_counter()
        chunks = []
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, user_storage_id)

            for row in rows:
                chunks.append(DocumentChunk(
                    id=row['id'],
                    user_storage_id=row['userStorageId'],
                    page_range=row['pageRange'],
                    title=row['title'],
                    content=row['content'],
                    created_at=row['createdAt']
                ))

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(
            f"[AI_TIMING] stage=document_chunks_load user_storage_id={user_storage_id} chunks={len(chunks)} elapsed_ms={elapsed_ms}"
        )
        return chunks

    async def store_document_chunk(
        self,
        chunk_id: str,
        user_storage_id: str,
        page_range: str,
        title: Optional[str],
        content: str,
        embeddings: List[float]
    ):
        """Store document chunk with embeddings"""
        pool = await self._get_pool()

        embedding_str = "[" + ",".join(map(str, embeddings)) + "]"

        query = """
            INSERT INTO "Document"
                (id, "userStorageId", "pageRange", title, content, embeddings, "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6::vector, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                embeddings = EXCLUDED.embeddings,
                "updatedAt" = NOW()
        """

        async with pool.acquire() as conn:
            await conn.execute(
                query, chunk_id, user_storage_id, page_range, title, content, embedding_str
            )

    async def download_file_from_r2(self, url: str) -> Tuple[bytes, str]:
        """
        Download file from R2 public URL
        Returns: (file_content, temp_file_path)
        """
        from urllib.parse import quote, urlunparse

        # SSRF hardening: only fetch https URLs pointing at an allow-listed,
        # non-private/loopback/link-local/reserved host. The returned IP is
        # the exact address we connect to below -- pinning it here closes
        # the DNS-rebinding TOCTOU window between validation and connect
        # (otherwise httpx/the OS resolver could re-resolve the hostname to
        # a different, internal address at connect time).
        validated_ip = _validate_download_url(url)

        # Encode URL path to handle spaces and special characters
        parsed = urlparse(url)
        original_hostname = parsed.hostname
        encoded_path = quote(parsed.path, safe='/')

        # Rebuild the URL with the host swapped for the pinned IP, keeping
        # the original Host header + TLS SNI so vhost routing and
        # certificate verification still work correctly.
        ip_obj = ipaddress.ip_address(validated_ip)
        host_for_netloc = f"[{validated_ip}]" if ip_obj.version == 6 else validated_ip
        userinfo = ""
        if parsed.username:
            userinfo = parsed.username
            if parsed.password:
                userinfo += f":{parsed.password}"
            userinfo += "@"
        netloc = f"{userinfo}{host_for_netloc}"
        if parsed.port:
            netloc += f":{parsed.port}"
        pinned_url = urlunparse(parsed._replace(netloc=netloc, path=encoded_path))

        logger.info(f"Downloading from {original_hostname!r} pinned to resolved address {validated_ip}")

        max_bytes = _get_max_download_bytes()

        # Redirects stay disabled (httpx default / explicit below) so a
        # validated host can't redirect us to an internal address.
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
            async with client.stream(
                "GET",
                pinned_url,
                headers={"Host": original_hostname},
                extensions={"sni_hostname": original_hostname},
            ) as response:
                response.raise_for_status()

                content_length = response.headers.get("content-length")
                if content_length is not None:
                    try:
                        if int(content_length) > max_bytes:
                            raise FileExtractionError(
                                f"File too large: Content-Length={content_length} "
                                f"exceeds limit of {max_bytes} bytes"
                            )
                    except ValueError:
                        logger.warning(f"Invalid Content-Length header: {content_length!r}")

                # Stream with a hard byte cap so a missing/lying Content-Length
                # can't be used to exhaust memory.
                buffer = bytearray()
                async for chunk in response.aiter_bytes():
                    buffer.extend(chunk)
                    if len(buffer) > max_bytes:
                        raise FileExtractionError(
                            f"File exceeds maximum allowed download size of {max_bytes} bytes"
                        )
                content = bytes(buffer)

        # Determine file extension from URL
        ext = os.path.splitext(url.split('?')[0])[1] or '.pdf'

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
            f.write(content)
            temp_path = f.name

        return content, temp_path

    def _is_pdf_file(self, file_info: FileInfo) -> bool:
        """Check whether the current file should use the PDF OCR flow."""
        return file_info.mimetype == "application/pdf" or file_info.url.lower().endswith('.pdf')

    def _create_text_splitter(self, is_pdf: bool) -> RecursiveCharacterTextSplitter:
        """Create a text splitter aligned with the HTTP ingest path."""
        chunk_size, chunk_overlap, embed_limit = _resolve_text_splitter_config()
        logger.info(
            f"Text splitter config: chunk_size={chunk_size}, chunk_overlap={chunk_overlap}, embed_limit={embed_limit}"
        )

        splitter_kwargs: Dict[str, Any] = {
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
        }
        if is_pdf:
            splitter_kwargs["separators"] = ["\n\n", "\n", ". ", " ", ""]

        return RecursiveCharacterTextSplitter(**splitter_kwargs)

    def _build_pdf_documents_to_store(
        self,
        user_storage_id: str,
        chunk_results: List[Tuple[int, str]]
    ) -> List[Dict[str, Any]]:
        """Convert PDF OCR chunk results into vector-store documents."""
        text_splitter = self._create_text_splitter(is_pdf=True)
        documents_to_store: List[Dict[str, Any]] = []
        chunk_idx = 0

        for page_chunk_index, page_chunk_text in chunk_results:
            if not page_chunk_text or not page_chunk_text.strip():
                continue

            text_chunks = text_splitter.split_text(page_chunk_text)
            logger.info(
                f"📝 Page chunk {page_chunk_index}: {len(page_chunk_text)} chars → {len(text_chunks)} text chunks"
            )

            for text_chunk in text_chunks:
                content = text_chunk.strip()
                if not content:
                    continue

                documents_to_store.append({
                    "id": f"{user_storage_id}_chunk_{chunk_idx}",
                    "user_storage_id": user_storage_id,
                    "content": content,
                    "page_range": str(page_chunk_index),
                    "title": f"Chunk {chunk_idx + 1}",
                })
                chunk_idx += 1

        return documents_to_store

    def _build_text_documents_to_store(self, user_storage_id: str, text: str) -> List[Dict[str, Any]]:
        """Split plain extracted text into vector-store documents."""
        text_splitter = self._create_text_splitter(is_pdf=False)
        documents_to_store: List[Dict[str, Any]] = []

        for chunk_index, text_chunk in enumerate(text_splitter.split_text(text)):
            content = text_chunk.strip()
            if not content:
                continue

            documents_to_store.append({
                "id": f"{user_storage_id}_chunk_{chunk_index}",
                "user_storage_id": user_storage_id,
                "content": content,
                "page_range": str(chunk_index + 1),
                "title": f"Chunk {chunk_index + 1}",
            })

        return documents_to_store

    async def prepare_documents_to_store(
        self,
        user_storage_id: str,
        file_info: FileInfo,
        file_bytes: Optional[bytes] = None,
        temp_path: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Prepare OCR/extracted chunks in the batch document shape used by the vector store."""
        should_cleanup_temp = False

        if file_bytes is None or temp_path is None:
            file_bytes, temp_path = await self.download_file_from_r2(file_info.url)
            should_cleanup_temp = True

        try:
            prepare_start = time.perf_counter()
            if self._is_pdf_file(file_info):
                logger.info("📄 Processing PDF with local Tesseract/PyPDF...")
                from src.backend.services.pdf_ocr_service import pdf_ocr_service

                ocr_start = time.perf_counter()
                chunk_results = await asyncio.to_thread(
                    pdf_ocr_service.process_pdf_with_chunks, file_bytes
                )
                ocr_ms = int((time.perf_counter() - ocr_start) * 1000)
                split_start = time.perf_counter()
                documents_to_store = await asyncio.to_thread(
                    self._build_pdf_documents_to_store, user_storage_id, chunk_results
                )
                split_ms = int((time.perf_counter() - split_start) * 1000)
                logger.info(
                    f"[AI_TIMING] stage=ocr_pdf_prepare user_storage_id={user_storage_id} page_chunks={len(chunk_results)} documents={len(documents_to_store)} ocr_ms={ocr_ms} split_ms={split_ms}"
                )
            else:
                logger.info(f"📝 Processing non-PDF file: {file_info.mimetype}")
                from src.rag.retriever import extract_text_from_file

                extract_start = time.perf_counter()
                extracted_text = await asyncio.to_thread(
                    extract_text_from_file, temp_path, file_info.mimetype
                )
                extract_ms = int((time.perf_counter() - extract_start) * 1000)
                if (
                    extracted_text.startswith("Error")
                    or extracted_text.startswith("Unsupported")
                    or extracted_text.startswith("No readable text content")
                    or "not available" in extracted_text
                ):
                    raise FileExtractionError(extracted_text)

                split_start = time.perf_counter()
                documents_to_store = await asyncio.to_thread(
                    self._build_text_documents_to_store, user_storage_id, extracted_text
                )
                split_ms = int((time.perf_counter() - split_start) * 1000)
                logger.info(
                    f"[AI_TIMING] stage=ocr_text_prepare user_storage_id={user_storage_id} chars={len(extracted_text)} documents={len(documents_to_store)} extract_ms={extract_ms} split_ms={split_ms}"
                )

            if not documents_to_store:
                raise NoContentExtractedError("No content could be extracted from file")

            total_ms = int((time.perf_counter() - prepare_start) * 1000)
            logger.info(
                f"[AI_TIMING] stage=ocr_prepare_total user_storage_id={user_storage_id} documents={len(documents_to_store)} elapsed_ms={total_ms}"
            )
            return documents_to_store
        finally:
            if should_cleanup_temp and temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)

    async def delete_documents(self, user_storage_id: str) -> int:
        """Delete all documents for a file"""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                'DELETE FROM "Document" WHERE "userStorageId" = $1',
                user_storage_id
            )
            count = int(result.split()[-1])
            logger.info(f"Deleted {count} documents for file {user_storage_id}")
            return count

    async def search_similar_documents(
        self,
        user_storage_ids: List[str],
        query_embedding: List[float],
        limit: int = 5,
        similarity_threshold: float = 0.7
    ) -> List[Tuple[DocumentChunk, float]]:
        """Search similar documents using cosine similarity"""
        pool = await self._get_pool()

        embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"

        query = """
            SELECT id, "userStorageId", "pageRange", title, content, "createdAt",
                   1 - (embeddings <=> $1::vector) as similarity
            FROM "Document"
            WHERE "userStorageId" = ANY($2::text[])
              AND 1 - (embeddings <=> $1::vector) >= $3
            ORDER BY embeddings <=> $1::vector
            LIMIT $4
        """

        results = []
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, embedding_str, user_storage_ids, similarity_threshold, limit)

            for row in rows:
                chunk = DocumentChunk(
                    id=row['id'],
                    user_storage_id=row['userStorageId'],
                    page_range=row['pageRange'],
                    title=row['title'],
                    content=row['content'],
                    created_at=row['createdAt']
                )
                results.append((chunk, row['similarity']))

        return results



def page_count_of(chunks) -> int:
    """Number of distinct page ranges across chunks (dicts or DocumentChunk rows)."""
    ranges = {
        (c["page_range"] if isinstance(c, dict) else c.page_range) for c in chunks
    }
    return len(ranges)


# Singleton instance
ocr_service = OCRProcessingService()
