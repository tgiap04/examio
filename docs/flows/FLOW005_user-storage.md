# FLOW005_UserStorageLifecycle

**Entity:** `UserStorage` (MODEL-029)
**State Field:** `processingStatus` (DISC-013)
**Source:** `kmaedu-be/apps/document-service/prisma/schema.prisma` (UserStorage), moved from exam-service in phase 15
**Last Updated:** 2026-11-10

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING : POST /ai/upload (document.uploaded written in the same tx)
    [*] --> PENDING : POST /ai/quick-upload (not queued yet)
    [*] --> PENDING : gRPC CreateUpload (queued at once)
    PENDING --> COMPLETED : ai.document.processed
    PENDING --> FAILED : ai.document.failed
    FAILED --> PENDING : EnsureProcessed re-emits document.uploaded
    PENDING --> PENDING : EnsureProcessed (never queued, or queued more than 15 min ago)
    PENDING --> [*] : delete
    COMPLETED --> [*] : delete
    FAILED --> [*] : delete
```

Uploads are not charged and have no monthly quota (the credit and quota machinery was removed with the wallet/subscription/payment feature).

## State Transitions

| ID | From | Trigger | To | Side Effects | Source |
|----|------|---------|----|--------------|--------|
| T1 | INIT | user-action | PENDING | `POST /api/v1/ai/upload` (JSON, object already in R2): row inserted with `queuedAt` set and outbox `document.uploaded` (with presigned `downloadUrl`) in one tx; a duplicate R2 key resumes the winner's row | `kmaedu-be/apps/document-service/src/modules/upload/document-register.service.ts` |
| T4 | INIT | user-action | PENDING | `POST /api/v1/ai/quick-upload`: `queuedAt` null (not processed until first use) | `.../upload/document-upload.service.ts` (`quick`) |
| T4b | INIT | service-call | PENDING | gRPC `CreateUpload`: bytes stored in R2, row inserted with `queuedAt` set and outbox `document.uploaded` in one tx. With `reuseDuplicate`, a matching file (name + size) is returned as is, no new row | `.../upload/document-upload.service.ts` (`createFromBytes`) |
| T5 | PENDING | event | COMPLETED | `ai.document.processed`: `pageCount` stored | `kmaedu-be/apps/document-service/src/modules/events/document-events.handler.ts` |
| T6 | PENDING | event | FAILED | `ai.document.failed` (ignored for a COMPLETED row): status only, nothing to refund | `.../events/document-events.handler.ts`, `.../upload/document-processing.service.ts` (`markFailed`) |
| T7 | FAILED, PENDING | user-action / service-call | PENDING | `EnsureProcessed` (from ai-chat or generation) re-emits `document.uploaded` | `.../upload/document-processing.service.ts` (`ensureProcessed`) |
| T8 | any | user-action | DELETED | `DELETE /api/v1/ai/upload/:id` or `DeleteDocuments`: one tx = rows removed + `r2_delete_tasks` + outbox `document.deleted` | `.../upload/document-delete.service.ts` |

`PROCESSING` stays a valid value but document-service does not write it today.

**Events around the file** (outbox in document-service, queue `document.events` for the answers): `document.uploaded` (storageId, userId, filename, mimetype, presigned `downloadUrl` valid 1 hour) starts OCR, chunking and embedding in ai-service; `ai.document.processed` / `ai.document.failed` come back (T5, T6). `document.deleted` (`storageIds[]`, `userId`) is consumed by ai-service (vectors, entities, graph), content-service (nulls `HistoryGenerated*.userStorageId`) and ai-chat-service (drops `AIChatDocument` links). Callers that need a document ask document-service over gRPC (`GetDocumentsByIds`, `AssertOwnership`, `EnsureProcessed`, `DeleteDocuments`, `ListDocuments`, `GetQuota` for usage counts only) with the user's forwarded token; no service reads the `document` schema directly.

## Trigger Types (3)

1. **user-action**: User-driven trigger (button click, form submit, API call)
2. **event**: RabbitMQ event (`ai.document.*`)
3. **service-call**: gRPC call from another service

## Integration with Feature Specs

- **F010_AITool** — file upload, OCR status and content generation from a file
- AI chat (ai-chat-service, `docs/features` has no separate spec) — consumes COMPLETED files via document gRPC (`GetDocumentsByIds`, waits for OCR up to `AI_CHAT_DOCUMENT_WAIT_MS`)
- F009_AITeacherKnowledgeBase — removed from the code (no knowledge-folder or dataset-import routes exist any more)

## Cross-References

- DISC-013 (UserStorage.processingStatus) in `docs/generated/entities.md`
- No-charge rules: `docs/system/business-rules.md` § AI generation has no charge
