# FLOW005_UserStorageLifecycle

**Entity:** `UserStorage` (MODEL-029)
**State Field:** `processingStatus` (DISC-013)
**Source:** `examio-be/apps/document-service/prisma/schema.prisma` (UserStorage), moved from exam-service in phase 15
**Last Updated:** 2026-10-29

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING_CHARGE : POST /ai/upload (credits charged)
    [*] --> PENDING : POST /ai/quick-upload (free, not queued yet)
    [*] --> PENDING_CHARGE : gRPC CreateUpload with chargeCredits
    [*] --> PENDING : gRPC CreateUpload, caller charges (queued at once)
    PENDING_CHARGE --> PENDING : Debit doc:id ok, document.uploaded written
    PENDING_CHARGE --> FAILED : debit refused / ambiguous, or reaper after 10 min (hidden, not in quota)
    PENDING --> COMPLETED : ai.document.processed
    PENDING --> FAILED : ai.document.failed (refund if charged)
    FAILED --> PENDING : EnsureProcessed re-emits document.uploaded
    PENDING --> PENDING : EnsureProcessed (never queued, or queued more than 15 min ago)
    PENDING --> [*] : delete
    COMPLETED --> [*] : delete
    FAILED --> [*] : delete
```

## State Transitions

| ID | From | Trigger | To | Side Effects | Source |
|----|------|---------|----|--------------|--------|
| T1 | INIT | user-action | PENDING_CHARGE | `POST /api/v1/ai/upload` (JSON, object already in R2): row inserted, quota checked first | `examio-be/apps/document-service/src/modules/upload/document-register.service.ts` |
| T2 | PENDING_CHARGE | service-call | PENDING | `Debit(doc:<id>)` ok: `creditCharged=true`, outbox `document.uploaded` (with presigned `downloadUrl`) | `.../upload/document-charge.service.ts` (`chargeAndQueue`) |
| T3 | PENDING_CHARGE | service-call / schedule | FAILED | Debit refused or answer lost, or reaper after 10 min: `chargeFailedAt` set, R2 key queued for deletion, `Refund(doc:<id>)` if owed (sweeper retries; `refundSettledAt`) | `.../upload/document-charge.service.ts`, `document-reaper.service.ts` |
| T4 | INIT | user-action | PENDING | `POST /api/v1/ai/quick-upload`: no charge, `queuedAt` null (not processed until first use) | `.../upload/document-upload.service.ts` (`quick`) |
| T4a | INIT | service-call | PENDING_CHARGE | gRPC `CreateUpload` with `chargeCredits`: quota checked, bytes stored in R2, row inserted, then `chargeAndQueue` continues as T2/T3 | `.../upload/document-upload.service.ts` (`createFromBytes`) |
| T4b | INIT | service-call | PENDING | gRPC `CreateUpload` without `chargeCredits` (the caller charges itself): row inserted with `queuedAt` set and outbox `document.uploaded` in one tx. With `reuseDuplicate`, a matching file (name + size) is returned as is, no new row | `.../upload/document-upload.service.ts` (`createFromBytes`) |
| T5 | PENDING | event | COMPLETED | `ai.document.processed`: `pageCount` stored | `examio-be/apps/document-service/src/modules/events/document-events.handler.ts` |
| T6 | PENDING | event | FAILED | `ai.document.failed` (ignored for a COMPLETED or charge-failed row): if `creditCharged`, `Refund(doc:<id>)` and `creditCharged` cleared in the same tx | `.../events/document-events.handler.ts`, `.../upload/document-processing.service.ts` (`markFailed`) |
| T7 | FAILED, PENDING | user-action / service-call | PENDING | `EnsureProcessed` (from ai-chat or generation) re-emits `document.uploaded` | `.../upload/document-processing.service.ts` (`ensureProcessed`) |
| T8 | any | user-action | DELETED | `DELETE /api/v1/ai/upload/:id` or `DeleteDocuments`: one tx = rows removed + `r2_delete_tasks` + outbox `document.deleted` | `.../upload/document-delete.service.ts` |

`PROCESSING` stays a valid value but document-service does not write it today.

**Events around the file** (outbox in document-service, queue `document.events` for the answers): `document.uploaded` (storageId, userId, filename, mimetype, presigned `downloadUrl` valid 1 hour) starts OCR, chunking and embedding in ai-service; `ai.document.processed` / `ai.document.failed` come back (T5, T6). `document.deleted` (`storageIds[]`, `userId`) is consumed by ai-service (vectors, entities, graph), content-service (nulls `HistoryGenerated*.userStorageId`) and ai-chat-service (drops `AIChatDocument` links). Callers that need a document ask document-service over gRPC (`GetDocumentsByIds`, `AssertOwnership`, `EnsureProcessed`, `DeleteDocuments`, `ListDocuments`, `GetQuota`) with the user's forwarded token; no service reads the `document` schema directly.

## Trigger Types (3)

1. **user-action**: User-driven trigger (button click, form submit, API call)
2. **event**: RabbitMQ event (`ai.document.*`)
3. **service-call / schedule**: gRPC call from another service, or the 60-second reaper

## Integration with Feature Specs

- **F010_AITool** — file upload, OCR status and content generation from a file
- AI chat (ai-chat-service, `docs/features` has no separate spec) — consumes COMPLETED files via document gRPC (`GetDocumentsByIds`, waits for OCR up to `AI_CHAT_DOCUMENT_WAIT_MS`)
- F009_AITeacherKnowledgeBase — removed from the code (no knowledge-folder or dataset-import routes exist any more)
- [FLOW006](FLOW006_wallet-transaction.md) — the `doc:<id>` debit and refund

## Cross-References

- DISC-013 (UserStorage.processingStatus) in `docs/generated/entities.md`
- Refund rules: `docs/system/business-rules.md` § AI credits: charge and refund
