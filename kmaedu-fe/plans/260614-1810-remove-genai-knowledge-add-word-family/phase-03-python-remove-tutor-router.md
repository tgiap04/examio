# Phase 3 — Backend: Remove Knowledge-Base Routes (Python AI Service)

## Context
- Parent plan: `plan.md` — Remove GenAI Knowledge + Add Word Family
- Depends on: Phase 2 (mirrors NestJS removal)
- Preserves: AI Chat (`chat.py`), file OCR (`file.py`), generation (`generation.py`), all shared services

## Overview
- Priority: P2
- Status: pending
- Description: Remove the Python tutor router, knowledge_base directory, tutor services, and related RabbitMQ consumers

## Scope

### Files to Delete
| File | Reason |
|------|--------|
| `apps/ai-service/src/backend/api/tutor.py` | Entire knowledge-base router (27 endpoints) |
| `apps/ai-service/src/backend/services/tutor_storage_service.py` | Knowledge storage |
| `apps/ai-service/src/backend/services/tutor_knowledge_storage_service.py` | Knowledge file/folder storage |
| `apps/ai-service/src/backend/services/tutor_dataset_import_service.py` | Dataset import |
| `apps/ai-service/src/backend/services/tutor_dataset_seed_service.py` | Dataset seeding |
| `apps/ai-service/src/genai_tutor/` (entire directory) | Knowledge base pipeline + code analyzer |
| `apps/ai-service/src/backend/scripts/run_tutor_dataset_bootstrap.py` | Bootstrap script |
| Test files: `test_tutor_*.py`, `test_graph_extractor.py`, `test_json_dataset_parser.py` | Knowledge tests |

### Files to Modify
| File | Change |
|------|--------|
| `apps/ai-service/src/backend/api/__init__.py` | Remove tutor_router import + include_router |
| `apps/ai-service/src/backend/main.py` | Remove tutor `ensure_schema()` calls in lifespan |
| `apps/ai-service/src/backend/rabbitmq_consumer.py` | Remove tutor knowledge/dataset-import message handlers |

### Files to Preserve
- `apps/ai-service/src/backend/api/chat.py` — AI Chat
- `apps/ai-service/src/backend/api/file.py` — File OCR/query
- `apps/ai-service/src/backend/api/generation.py` — Generation
- All shared services in `apps/ai-service/src/backend/services/`

## Implementation Steps

1. **Remove tutor router registration** from `api/__init__.py`
2. **Remove tutor lifespan calls** from `main.py`
3. **Remove tutor message handlers** from `rabbitmq_consumer.py`
4. **Delete tutor files** and `genai_tutor/` directory
5. **Verify build** — Python syntax check

## Success Criteria
- Python service starts without errors
- AI Chat endpoints still respond
- File upload/OCR endpoints still respond
- Generation endpoints still respond
