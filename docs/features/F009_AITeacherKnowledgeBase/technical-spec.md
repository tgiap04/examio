# F009_AITeacherKnowledgeBase

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

AITeacherKnowledgeBase enables authenticated users to build a personal AI tutor knowledge base by uploading documents, organizing them into folders, triggering AI processing (chunking + embedding), reprocessing files, bulk-importing datasets, and viewing knowledge base statistics. The processed documents serve as the grounding context for the AI chat feature. The feature spans `SCR025/REG001` (FolderPanel), `SCR025/REG002` (FilePanel), `SCR025/REG003` (DatasetImportPanel), and `SCR025/REG004` (StatsPanel). Backend lives in `examio-be/apps/exam-service/src/modules/ai-tutor/` and the AI processing pipeline in `examio-be/apps/ai-service/`.

## Polymorphic Behavior

### DISC-014 — UserStorage.processingStatus

| Value | Render | Validation | Persistence |
|-------|--------|------------|-------------|
| PENDING | Yellow "Pending" badge; file appears in list but cannot be used for AI chat | Cannot be used as knowledge base source | Queued for processing |
| PROCESSING | Blue "Processing" badge with progress indicator | Cannot be used as AI chat source | OCR + chunking + embedding pipeline running |
| COMPLETED | Green "Ready" badge; file enabled for AI chat and generation | Eligible as knowledge base source | Chunks and embeddings stored in `Document` and `UserStorageGraph` |
| FAILED | Red "Failed" badge; "Retry" button visible | Must be reprocessed before use | Error reason logged; no chunks/embeddings created |

**Source:** `data-model.md` § `MODEL-016 UserStorage > Discriminator Fields`

N/A — no other discriminator fields in AITeacherKnowledgeBase Key Entities.

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|------------------|------------|
| FR-009_01 | Users list their knowledge folders | `GET /api/v1/ai/tutor/knowledge-folders` | yes |
| FR-009_02 | Users create a knowledge folder | `POST /api/v1/ai/tutor/knowledge-folders` | yes |
| FR-009_03 | Users update a knowledge folder | `PUT /api/v1/ai/tutor/knowledge-folders/:id` | yes |
| FR-009_04 | Users delete a knowledge folder | `DELETE /api/v1/ai/tutor/knowledge-folders/:id` | yes |
| FR-009_05 | Users list their knowledge files | `GET /api/v1/ai/tutor/knowledge-files` | yes |
| FR-009_06 | Users upload a knowledge file | `POST /api/v1/ai/tutor/knowledge-files` | yes |
| FR-009_07 | Users delete a knowledge file | `DELETE /api/v1/ai/tutor/knowledge-files/:id` | yes |
| FR-009_08 | Users reprocess a knowledge file | `POST /api/v1/ai/tutor/knowledge-files/:id/reprocess` | yes |
| FR-009_09 | Users list dataset import jobs | `GET /api/v1/ai/tutor/dataset-imports` | yes |
| FR-009_10 | Users start a dataset import job | `POST /api/v1/ai/tutor/dataset-imports` | yes |
| FR-009_11 | Users view knowledge base statistics | `GET /api/v1/ai/tutor/knowledge-stats` | yes |

### Business Rules


None.
### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations

**INT-009_01 — Document Processing Pipeline**
**Linked FR:** FR-009_06, FR-009_08
**Source:** `examio-be/apps/exam-service/src/modules/ai-tutor/knowledge-file.controller.ts` (inferred)
**Type:** api-call
**Target:** `ai-service` (Python FastAPI)
**Trigger:** File upload or reprocess request
**Payload:** `{ fileId, userId, folderId? }`
**Failure handling:** File status set to FAILED; user can retry via reprocess button

**INT-009_02 — Dataset Import Job**
**Linked FR:** FR-009_10
**Source:** `examio-be/apps/exam-service/src/modules/ai-tutor/dataset-import.controller.ts` (inferred)
**Type:** queue-job
**Target:** `ai-service`
**Trigger:** User submits dataset import form
**Payload:** `{ datasetFile, importParameters }`
**Failure handling:** Job status set to failed; user notified via polling

**INT-009_03 — Knowledge Graph Build**
**Linked FR:** FR-009_06
**Source:** `examio-be/apps/ai-service/` (inferred)
**Type:** event-publish
**Target:** `UserStorageGraph` + `UserStorageGraphGroup`
**Trigger:** Document processing completion
**Payload:** `{ userStorageId, chunks }`
**Failure handling:** Graph not built; document still marked COMPLETED for chat eligibility

### Verification

- **SC-009_01** — File with COMPLETED status is selectable in AI chat context (covers DISC-014)
- **SC-009_02** — Folder deletion cascades to contained files (covers FR-009_04)
- **SC-009_03** — Reprocess action resets file status to PROCESSING (covers FR-009_08)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`screen-flow.md`](../../docs/system/screen-flow.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US038 — Manage Knowledge Folders (Priority: P2)

**What happens:** A user opens GenAIKnowledgePage and uses FolderPanel to create, rename, or delete folders. Folders organize files for the AI tutor. Deleting a folder cascades to all contained files.
**Why this priority:** Folders provide organizational structure for large knowledge bases; without them, files are flat and hard to manage.
**Independent Test:** POST `/api/v1/ai/tutor/knowledge-folders` with name returns 201 and the folder appears in the panel.

**Acceptance Scenarios:**

1. **Given** the user is on GenAIKnowledgePage, **When** they create a folder named "Physics Notes", **Then** the folder appears in FolderPanel with a file count of 0.
2. **Given** a folder contains files, **When** the user deletes the folder, **Then** all contained files are also deleted.
3. **Given** a folder exists, **When** the user renames it, **Then** the new name is persisted.

**Requirements fulfilled:**
- **FR-009_02** Users create a knowledge folder — `POST /api/v1/ai/tutor/knowledge-folders`
- **FR-009_03** Users update a knowledge folder — `PUT /api/v1/ai/tutor/knowledge-folders/:id`
- **FR-009_04** Users delete a knowledge folder — `DELETE /api/v1/ai/tutor/knowledge-folders/:id`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

---

### US039 — Upload Knowledge File (Priority: P2)

**What happens:** A user opens FilePanel and clicks "Upload". A file picker accepts PDF, DOC, or other supported document types. The file is uploaded to R2 storage, then a processing job is queued. The file appears in the list with a PENDING badge, then transitions to PROCESSING, and finally COMPLETED or FAILED.
**Why this priority:** Knowledge files are the raw material for the AI tutor — without uploaded documents, the AI has no domain knowledge to answer from.
**Independent Test:** POST `/api/v1/ai/tutor/knowledge-files` with a valid file returns 201 and the file appears in the list with `processingStatus: PENDING`.

**Acceptance Scenarios:**

1. **Given** the user selects a valid PDF, **When** they upload it, **Then** the file appears in FilePanel with a PENDING badge.
2. **Given** the user selects an unsupported file type, **When** they attempt upload, **Then** a validation error is shown.
3. **Given** the upload succeeds, **When** processing completes, **Then** the badge changes to COMPLETED and the file is usable in AI chat.

**Requirements fulfilled:**
- **FR-009_06** Users upload a knowledge file — `POST /api/v1/ai/tutor/knowledge-files`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

**Verification:**
- **SC-009_04** File upload creates a UserStorage record with processingStatus=PENDING (covers FR-009_06)

---

### US040 — Reprocess Knowledge File (Priority: P3)

**What happens:** A user clicks "Reprocess" on a file with FAILED or COMPLETED status. The file status transitions to PROCESSING, the AI service re-runs chunking and embedding, and the result replaces the previous embeddings.
**Why this priority:** Users may update source documents and need to regenerate embeddings; also a recovery path when initial processing failed.
**Independent Test:** POST `/api/v1/ai/tutor/knowledge-files/:id/reprocess` returns 200 and the file status transitions to PROCESSING.

**Acceptance Scenarios:**

1. **Given** a file has FAILED status, **When** the user clicks Reprocess, **Then** the status becomes PROCESSING and eventually COMPLETED.
2. **Given** a file has COMPLETED status, **When** the user reprocesses it, **Then** existing embeddings are replaced with the new result.

**Requirements fulfilled:**
- **FR-009_08** Users reprocess a knowledge file — `POST /api/v1/ai/tutor/knowledge-files/:id/reprocess`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

---

### US041 — Delete Knowledge File (Priority: P3)

**What happens:** A user clicks delete on a file in FilePanel. A confirmation dialog appears. On confirm, the file, its Document chunks, and its UserStorageGraph entries are removed.
**Why this priority:** Allows cleanup of outdated or unwanted files from the knowledge base.
**Independent Test:** DELETE `/api/v1/ai/tutor/knowledge-files/:id` returns 200 and the file no longer appears in the list.

**Acceptance Scenarios:**

1. **Given** a file exists, **When** the user confirms deletion, **Then** the file and all associated chunks and embeddings are removed.
2. **Given** the file is currently being used in an AI chat session, **When** the user deletes it, **Then** the chat session loses the grounding context for that file.

**Requirements fulfilled:**
- **FR-009_07** Users delete a knowledge file — `DELETE /api/v1/ai/tutor/knowledge-files/:id`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

---

### US042 — Import Dataset (Priority: P3)

**What happens:** A user opens DatasetImportPanel and submits a dataset file for bulk import. A job is created and status is pollable. Progress is shown during import. On completion, content is added to the knowledge base.
**Why this priority:** Enables bulk-loading of existing structured content (e.g., lecture notes, past exam papers) into the knowledge base.
**Independent Test:** POST `/api/v1/ai/tutor/dataset-imports` returns a job ID; polling the job returns status transitions.

**Acceptance Scenarios:**

1. **Given** the user submits a valid dataset file, **When** the import starts, **Then** a job is created and the panel shows progress.
2. **Given** the import job fails, **When** the user views the status, **Then** a failed badge is shown with a retry option.

**Requirements fulfilled:**
- **FR-009_09** Users list dataset import jobs — `GET /api/v1/ai/tutor/dataset-imports`
- **FR-009_10** Users start a dataset import job — `POST /api/v1/ai/tutor/dataset-imports`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

---

### US043 — View Knowledge Statistics (Priority: P3)

**What happens:** A user opens StatsPanel and sees: total files uploaded, total chunks created, total graph nodes, and total AI chat sessions. A refresh button reloads from the server.
**Why this priority:** Gives users visibility into the scale of their knowledge base and helps identify when more content is needed.
**Independent Test:** GET `/api/v1/ai/tutor/knowledge-stats` returns file count, chunk count, and graph node count.

**Acceptance Scenarios:**

1. **Given** the user has uploaded files, **When** StatsPanel loads, **Then** all three statistics are displayed.
2. **Given** the user clicks Refresh, **When** the data is retrieved, **Then** the panel updates with current values.

**Requirements fulfilled:**
- **FR-009_11** Users view knowledge base statistics — `GET /api/v1/ai/tutor/knowledge-stats`

**Rules enforced:** PERM037 (AIKnowledgeBaseManage)

---

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User uploads an unsupported file type (e.g., .exe) | API returns 400; error shown in upload dialog | "This file type is not supported. Please upload a PDF, DOC, or TXT file." |
| User deletes a folder that contains files | Folder and all contained files are cascade-deleted | "Folder and all files inside have been deleted." |
| File reprocessing fails a second time | Status remains FAILED; retry button stays visible | "Processing failed again. Please check the file and try once more." |
| User deletes a file that is currently referenced in an AI chat session | Chat session loses grounding context for that file | "One of the knowledge files used in this chat has been deleted." |
| Dataset import job exceeds expected duration | Job remains in PROCESSING state; no automatic timeout | "Your dataset import is still in progress. Please check back later." |
| User uploads a file larger than the maximum allowed size | API returns 413 or 400 with size limit message | "This file is too large. Maximum file size is [X] MB." |
| User tries to upload when storage quota is exceeded | API returns 402 or 429; quota exceeded message shown | "Storage quota exceeded. Please delete some files or purchase additional storage." |
| Polling for dataset import job returns FAILED after 30 minutes | User sees failed badge; retry option available | "Dataset import failed. Please check your file format and try again." |
| User attempts to reprocess a file that is still PROCESSING | UI disables the reprocess button while status is PROCESSING | None — button is disabled; no action available |

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| UserStorage | `UserStorage` | id, userId, filename, mimetype, processingStatus, storageKey | Uploaded knowledge files; source for AI processing |
| Document | `Document` | id, userStorageId, chunks, embeddings | Chunked and embedded document content for AI retrieval |
| UserStorageGraph | `UserStorageGraph` | id, userStorageId, status | Graph representation of document knowledge |
| UserStorageGraphGroup | `UserStorageGraphGroup` | id, userStorageGraphId, userStorageId | Junction table grouping graph nodes |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F009 | [x] |
| Screens | [screens.md](./screens.md) | SCR025/REG001–REG004 | [x] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | BL005, BL007 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM002, PERM003, PERM037 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US038, US039, US040, US041, US042, US043 | [x] |
| Data Model | [data-model.md](../../docs/system/data-model.md) | MODEL-016, MODEL-017, MODEL-022, MODEL-023 | [x] |

## Assumptions

- Folder deletion cascades to all contained UserStorage records and their associated Document/Graph entries.
- Dataset import uses the same processing pipeline as single-file upload but in batch mode.
- Maximum file size for upload is enforced at the API gateway or R2 service level.
- Storage quota is tracked per user via UserStorage record count or total byte size.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| KnowledgeFolderController | `examio-be/apps/exam-service/src/modules/ai-tutor/knowledge-folder.controller.ts` | REST endpoints for folder CRUD |
| KnowledgeFileController | `examio-be/apps/exam-service/src/modules/ai-tutor/knowledge-file.controller.ts` | REST endpoints for file upload, delete, reprocess |
| DatasetImportController | `examio-be/apps/exam-service/src/modules/ai-tutor/dataset-import.controller.ts` | Dataset import job endpoints |
| KnowledgeStatsController | `examio-be/apps/exam-service/src/modules/ai-tutor/knowledge-stats.controller.ts` | Knowledge base statistics endpoint |
| R2ClientService | `examio-be/apps/exam-service/src/modules/r2/r2-client.service.ts` | File upload to R2 storage (BL005) |
| OcrService | `examio-be/apps/exam-service/src/modules/ocr/ocr-client.service.ts` | Document OCR processing (BL007) |
| FolderPanel | `examio-fe/src/components/k/genai-knowledge/FolderPanel.tsx` | Folder CRUD UI panel |
| FilePanel | `examio-fe/src/components/k/genai-knowledge/FilePanel.tsx` | File list and upload UI panel |
| DatasetImportPanel | `examio-fe/src/components/k/genai-knowledge/DatasetImportPanel.tsx` | Dataset import job UI |
| StatsPanel | `examio-fe/src/components/k/genai-knowledge/StatsPanel.tsx` | Knowledge base statistics display |

## Unresolved Questions

1. **Maximum file size limit**: What is the per-file upload size limit? Is it enforced at the gateway, R2 service, or AI service level?
2. **Supported file formats**: Which MIME types are accepted for knowledge file upload? Is there a difference between what can be uploaded and what the AI service can process?
3. **Storage quota**: Is there a per-user storage quota? If so, what happens when it is exceeded — upload blocked or soft limit with warning?
4. **Chunking strategy**: How does the AI service determine chunk boundaries — fixed token count, paragraph-based, or semantic segmentation?
5. **Graph build failure recovery**: If the graph build fails after document chunking succeeds, is the document still usable in AI chat (without graph grounding)?