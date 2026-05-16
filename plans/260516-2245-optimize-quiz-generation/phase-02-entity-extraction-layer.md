# Phase 2: Entity Extraction Layer

## Context

- [hybrid_retrieval_service.py](../../examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py)
- [ocr_service.py](../../examio-be/apps/ai-service/src/backend/services/ocr_service.py)
- [graph_builder.py](../../examio-be/apps/ai-service/src/graph_rag/graph_builder.py)
- Prisma schema: `examio-be/libs/database/src/schema.prisma`

## Overview

- **Priority:** Medium
- **Status:** Pending (blocked by Phase 1)
- **Effort:** 3-5 ngày

Thêm entity extraction layer chạy background lúc upload. Entities (concepts, definitions, relationships) được lưu DB → dùng cho retrieval chính xác hơn khi sinh quiz.

## Key Insights

- Hiện tại graph dùng chunk-level nodes → không biết "Khái niệm A liên quan Khái niệm B"
- Entity extraction 1 lần lúc upload (background) → amortize cost
- Dùng Gemini Flash cho extraction (nhanh, rẻ)
- Entities giúp generation prompt tập trung vào concepts thay vì raw text

## Requirements

### Functional
- Extract entities (concepts, definitions, formulas, processes) từ document chunks
- Lưu entities + relationships vào DB
- Retrieval dùng entities để chọn chunks chính xác hơn
- Background processing, không block upload flow

### Non-functional
- Entity extraction < 30s cho document 50 chunks
- Không ảnh hưởng generation time (đã extract sẵn)
- Graceful degradation: nếu entities chưa có → fallback về flow hiện tại

## Architecture

```
Upload → OCR → Chunks → [Background] Entity Extraction → DB
                                                          ↓
Generate Quiz → Retrieve (entity-aware) → LLM Generate → Result
```

### Entity Schema (new table)

```prisma
model DocumentEntity {
  id              String   @id @default(cuid())
  userStorageId   String
  chunkId         String
  name            String   // "Biến môi trường", "Docker", "CI/CD"
  type            String   // concept, definition, formula, process, example
  description     String?  // Brief description extracted
  relatedEntities String[] // IDs of related entities
  createdAt       DateTime @default(now())
  
  userStorage     UserStorage @relation(fields: [userStorageId], references: [id])
  
  @@index([userStorageId])
  @@index([chunkId])
}
```

### Entity Extraction Prompt (per chunk)

Gọi Gemini Flash với prompt:
```
Extract key educational entities from this text. For each entity:
- name: the concept/term name
- type: one of [concept, definition, formula, process, example, comparison]
- related_to: other entities in this text it relates to

Return JSON array. Max 5-8 entities per chunk.
```

Cost: ~200 input tokens + ~300 output tokens per chunk × 50 chunks = ~25K tokens per document (≈ $0.002 with Flash)

## Related Code Files

### Create
- `examio-be/apps/ai-service/src/backend/services/entity_extraction_service.py`

### Modify
- `examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py` — entity-aware retrieval
- `examio-be/apps/ai-service/src/backend/services/ocr_service.py` — trigger extraction after OCR
- `examio-be/libs/database/src/schema.prisma` — add DocumentEntity model

### Read (context)
- `examio-be/apps/ai-service/src/backend/services/generation_service.py`
- `examio-be/apps/ai-service/src/llm/model_manager.py`

## Implementation Steps

### 1. Add DocumentEntity model to Prisma schema
### 2. Create entity_extraction_service.py
- Batch extract entities from chunks (concurrency=5)
- Parse structured JSON output
- Save to DB
### 3. Trigger extraction after OCR completion
- Background task, non-blocking
- Status tracking (pending/processing/completed)
### 4. Modify hybrid_retrieval_service for entity-aware retrieval
- When entities available: use entity names as additional search terms
- Boost chunks that contain high-relevance entities
- Fallback to current behavior if no entities
### 5. Enhance generation prompt with entity context
- Include top entities in system prompt → LLM knows what concepts to ask about
- Reduces meta-document questions (asks about concepts, not page locations)

## Todo

- [ ] Design DocumentEntity schema
- [ ] Implement entity_extraction_service.py
- [ ] Integrate with OCR pipeline (background trigger)
- [ ] Modify retrieval to use entities
- [ ] Enhance generation prompts with entity context
- [ ] Test end-to-end: upload → extract → generate
- [ ] Benchmark accuracy improvement

## Success Criteria

- Entity extraction completes within 30s for 50-chunk document
- Meta-document question ratio drops from ~34% → <10%
- Retrieval returns more topically relevant chunks
- No regression in generation speed

## Risk Assessment

- **Risk:** Entity extraction quality varies by document type
  - **Mitigation:** Graceful fallback — if entities empty/low-quality, use current flow
- **Risk:** Additional DB storage
  - **Mitigation:** ~5-8 entities per chunk × 50 chunks = 250-400 rows per document. Negligible.
- **Risk:** Extraction adds upload time
  - **Mitigation:** Background job, user doesn't wait. Status indicator in UI.

## Security Considerations

- Entity data is user-scoped (tied to userStorageId)
- No PII extraction — only educational concepts
- Same auth/access control as existing document data
