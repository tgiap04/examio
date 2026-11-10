# F009_AITeacherKnowledgeBase

**Priority**: P1
**Type**: ui
**Status**: REMOVED (2026-06-14)
**Last Updated**: 2026-10-29

## Overview

This feature no longer exists. The GenAI Knowledge page (`/k/genai-knowledge`) was removed from the frontend (commit `f1ed596`) and the whole `modules/ai-tutor` backend with its `/api/v1/ai/tutor/*` routes (knowledge folders, knowledge files, dataset imports, knowledge stats, tutor graph) was removed from the backend (commit `343fa97`). `git grep` finds no `ai-tutor`, `ai/tutor` or knowledge-folder code in `kmaedu-be` or `kmaedu-fe/src` today; two orphan files remain in the frontend (`kmaedu-fe/src/types/genai-knowledge.ts`, `kmaedu-fe/src/lib/genai-knowledge-cache.ts`) and are not imported by any page.

## What replaced it

| Old capability | Where it lives now |
|---|---|
| Upload a file, OCR, chunk, embed | document-service (`POST /api/v1/ai/upload`, `quick-upload`) publishes `document.uploaded`; ai-service processes it. See [FLOW005](../../flows/FLOW005_user-storage.md) and [F010_AITool](../F010_AITool/technical-spec.md) |
| Delete a file and its vectors | `DELETE /api/v1/ai/upload/:id` or gRPC `DeleteDocuments`; `document.deleted` cleans ai-service, content and ai-chat |
| Ground an AI chat in the user's documents | ai-chat-service attaches documents (`AIChatDocument`) and reads them over document gRPC; ai-service retrieves from the `Document` / `DocumentEntity` / `UserStorageGraph` tables in schema `ai` |
| Folders, dataset imports, knowledge statistics | none (dropped) |

## Retired codes

These codes are kept here so older references resolve; none of them is implemented: `FR-009_01` to `FR-009_11`, `US038` to `US043`, `SCR025` with regions `REG001` (FolderPanel), `REG002` (FilePanel), `REG003` (DatasetImportPanel) and `REG004` (StatsPanel). The processing-status discriminator it used is `DISC-014` (`UserStorage.processingStatus`), still defined in `docs/generated/entities.md` and owned by document-service.
