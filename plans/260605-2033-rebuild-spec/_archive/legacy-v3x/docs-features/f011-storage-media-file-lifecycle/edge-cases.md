# F011 - Storage, Media & File Lifecycle Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| File exceeds limit | Upload is rejected by client or backend. Exact backend limit Needs verification. | File is too large to upload. |
| Unsupported mimetype | Upload/processing should be rejected. Supported type list Needs verification. | This file type is not supported. |
| R2 upload succeeds but DB write fails | Orphan remote object may exist unless compensation runs; behavior Needs verification. | Upload could not be saved. Please try again. |
| DB delete succeeds but R2 delete fails | Metadata may disappear while remote object remains; cleanup Needs verification. | File was removed from your library, but storage cleanup may retry. |
| Signed URL expired | Client must request a fresh URL. | File link expired. Please reopen the file. |
| OCR processing fails | Document status should show failed and allow retry if supported. | We could not process this document. |
| Old avatar/banner remains after replacement | Old media cleanup Needs verification. | Profile image updated. |
| User requests another user's file | Access is denied by ownership/service auth. | You do not have access to this file. |
