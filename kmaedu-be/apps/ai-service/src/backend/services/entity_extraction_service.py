"""Entity extraction service for document chunks.

Extracts educational entities (concepts, definitions, formulas, etc.)
from document chunks and persists them to the database.
Runs as a background task after OCR completion.
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import asyncpg

from src.backend.services.ocr_service import DocumentChunk, ocr_service
from src import db
from src.llm.model_manager import model_manager

logger = logging.getLogger(__name__)

EXTRACTION_CONCURRENCY = 5
MAX_ENTITIES_PER_CHUNK = 8
EXTRACTION_MODEL = "gemini-2.5-flash"

EXTRACTION_PROMPT = """Extract key educational entities from this text chunk.
For each entity, provide:
- name: the concept/term name (concise, 2-6 words max)
- type: one of [concept, definition, formula, process, example, comparison]
- description: one-sentence explanation (max 50 words)
- related_to: list of other entity names in this text it relates to

Rules:
- Max {max_entities} entities per chunk
- Only extract entities that test learnable knowledge
- Skip structural elements (headings, page numbers, table of contents)
- Prefer entities that would make good quiz questions or flashcards

Return ONLY a raw JSON array. No markdown blocks. No explanations.
Example: [{"name": "...", "type": "...", "description": "...", "related_to": ["..."]}]

Text (page {page_range}):
{content}"""


@dataclass
class ExtractedEntity:
    """A single extracted entity from a chunk."""

    name: str
    type: str
    description: Optional[str]
    related_names: List[str]
    chunk_id: str
    user_storage_id: str


class EntityExtractionService:
    """Extracts and persists educational entities from document chunks."""

    async def _get_pool(self) -> asyncpg.Pool:
        return await db.get_pool()

    async def extract_and_persist(self, user_storage_id: str) -> Dict[str, Any]:
        """Extract entities from all chunks of a document and save to DB.

        This is the main entry point, meant to be called as a background task.
        """
        start_time = time.perf_counter()
        chunks = await ocr_service.get_document_chunks(user_storage_id)
        if not chunks:
            logger.info(
                "[ENTITY] No chunks found for user_storage_id=%s", user_storage_id
            )
            return {"success": False, "error": "No chunks found"}

        # Clear existing entities for this document (re-extraction)
        await self._clear_entities(user_storage_id)

        # Extract entities from chunks with concurrency limit
        semaphore = asyncio.Semaphore(EXTRACTION_CONCURRENCY)
        all_entities: List[ExtractedEntity] = []

        async def _extract_one(chunk: DocumentChunk) -> List[ExtractedEntity]:
            async with semaphore:
                return await self._extract_from_chunk(chunk, user_storage_id)

        results = await asyncio.gather(
            *[_extract_one(chunk) for chunk in chunks], return_exceptions=True
        )

        for result in results:
            if isinstance(result, Exception):
                logger.warning("[ENTITY] Chunk extraction failed: %s", result)
                continue
            all_entities.extend(result)

        # Persist to DB
        if all_entities:
            await self._persist_entities(all_entities)

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(
            "[AI_TIMING] stage=entity_extraction user_storage_id=%s chunks=%s entities=%s elapsed_ms=%s",
            user_storage_id,
            len(chunks),
            len(all_entities),
            elapsed_ms,
        )
        return {
            "success": True,
            "chunks_processed": len(chunks),
            "entities_extracted": len(all_entities),
            "elapsed_ms": elapsed_ms,
        }

    async def _extract_from_chunk(
        self, chunk: DocumentChunk, user_storage_id: str
    ) -> List[ExtractedEntity]:
        """Extract entities from a single chunk via LLM."""
        prompt = EXTRACTION_PROMPT.format(
            max_entities=MAX_ENTITIES_PER_CHUNK,
            page_range=chunk.page_range,
            content=chunk.content[:2000],
        )

        try:
            response = await model_manager.generate_content_with_model(
                prompt, EXTRACTION_MODEL
            )
            return self._parse_extraction_response(response, chunk.id, user_storage_id)
        except Exception as e:
            logger.warning(
                "[ENTITY] LLM extraction failed for chunk=%s: %s", chunk.id, e
            )
            return []

    def _parse_extraction_response(
        self, response: str, chunk_id: str, user_storage_id: str
    ) -> List[ExtractedEntity]:
        """Parse LLM JSON response into ExtractedEntity list."""
        try:
            # Strip markdown code blocks if present
            text = response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

            start_idx = text.find("[")
            end_idx = text.rfind("]")
            if start_idx == -1 or end_idx == -1:
                return []

            items = json.loads(text[start_idx : end_idx + 1])
            entities: List[ExtractedEntity] = []

            for item in items[:MAX_ENTITIES_PER_CHUNK]:
                name = str(item.get("name", "")).strip()
                entity_type = str(item.get("type", "concept")).strip()
                if not name or len(name) < 2:
                    continue

                valid_types = {
                    "concept",
                    "definition",
                    "formula",
                    "process",
                    "example",
                    "comparison",
                }
                if entity_type not in valid_types:
                    entity_type = "concept"

                entities.append(
                    ExtractedEntity(
                        name=name[:200],
                        type=entity_type,
                        description=(item.get("description") or "")[:500] or None,
                        related_names=[
                            str(r)[:200] for r in (item.get("related_to") or [])[:5]
                        ],
                        chunk_id=chunk_id,
                        user_storage_id=user_storage_id,
                    )
                )
            return entities
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            logger.warning("[ENTITY] Parse failed for chunk=%s: %s", chunk_id, e)
            return []

    async def _persist_entities(self, entities: List[ExtractedEntity]) -> None:
        """Batch insert entities into DocumentEntity table."""
        pool = await self._get_pool()
        rows = [
            (
                str(uuid.uuid4()).replace("-", "")[:25],
                entity.user_storage_id,
                entity.chunk_id,
                entity.name,
                entity.type,
                entity.description,
                json.dumps(entity.related_names),
            )
            for entity in entities
        ]

        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO "DocumentEntity" (id, "userStorageId", "chunkId", name, type, description, "relatedNames")
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                """,
                rows,
            )

        logger.info("[ENTITY] Persisted %s entities", len(entities))

    async def _clear_entities(self, user_storage_id: str) -> None:
        """Remove existing entities for a document (for re-extraction)."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                'DELETE FROM "DocumentEntity" WHERE "userStorageId" = $1',
                user_storage_id,
            )

    async def get_entities_for_document(
        self, user_storage_id: str
    ) -> List[Dict[str, Any]]:
        """Retrieve all entities for a document."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, "chunkId", name, type, description, "relatedNames"
                FROM "DocumentEntity"
                WHERE "userStorageId" = $1
                ORDER BY "chunkId", name
                """,
                user_storage_id,
            )
        return [
            {
                "id": row["id"],
                "chunkId": row["chunkId"],
                "name": row["name"],
                "type": row["type"],
                "description": row["description"],
                "relatedNames": (
                    json.loads(row["relatedNames"])
                    if isinstance(row["relatedNames"], str)
                    else row["relatedNames"]
                ),
            }
            for row in rows
        ]

    async def has_entities(self, user_storage_id: str) -> bool:
        """Check if entities have been extracted for a document."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                'SELECT COUNT(*) FROM "DocumentEntity" WHERE "userStorageId" = $1',
                user_storage_id,
            )
        return count > 0


entity_extraction_service = EntityExtractionService()
