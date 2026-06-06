# F006 Edge Cases - AI File Upload, OCR & Content Generation

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in | Workspace route/API blocks upload. | Please sign in to upload files. |
| File is too large | Client/backend should reject before processing; exact backend limit Needs verification. | File is too large to upload. |
| Unsupported file type | Upload or processing is rejected. | This file type is not supported. |
| R2 upload succeeds but DB record fails | System should not expose orphaned file; cleanup behavior Needs verification. | Upload could not be saved. Try again. |
| OCR/processing fails | `UserStorage.processingStatus` should show failure. | We could not process this file. |
| Generation job times out | Polling stops and user can retry/delete job. | Generation is taking too long. Try again later. |
| User lacks credits/subscription | Backend should reject generation if enforced; Needs verification. | You do not have enough credits for this action. |
| Mobile user generates content | UI may be mock-backed rather than API-backed. | Needs verification. |
