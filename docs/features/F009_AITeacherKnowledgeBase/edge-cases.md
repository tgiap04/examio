# Edge Cases — F009_AITeacherKnowledgeBase

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| User uploads an unsupported file type (e.g., .exe) | API returns 400; error shown in upload dialog | "This file type is not supported. Please upload a PDF, DOC, or TXT file." |
| User deletes a folder that contains files | Folder and all contained files are cascade-deleted | "Folder and all files inside have been deleted." |
| File reprocessing fails a second time | Status remains FAILED; retry button stays visible | "Processing failed again. Please check the file and try once more." |
| User deletes a file that is currently referenced in an AI chat session | Chat session loses grounding context for that file | "One of the knowledge files used in this chat has been deleted." |
| Dataset import job exceeds expected duration | Job remains in PROCESSING state; no automatic timeout | "Your dataset import is still in progress. Please check back later." |
| User uploads a file larger than the maximum allowed size | API returns 413 or 400 with size limit message | "This file is too large. Maximum file size is [X] MB." |
| User tries to upload when storage quota is exceeded | API returns 402 or 429; quota exceeded message shown | "Storage quota exceeded. Please delete some files or purchase additional storage." |
| Polling for dataset import job returns FAILED after 30 minutes | User sees failed badge; retry option available | "Dataset import failed. Please check your file format and try again." |
| User attempts to reprocess a file that is still PROCESSING | UI disables the reprocess button while status is PROCESSING | None — button is disabled; no action available |
| User attempts to delete a file during active AI chat session | File is deleted; chat session silently loses that grounding context | "File deleted successfully." |
| User creates a folder with a duplicate name | API returns 400 or creates with duplicate (behavior unverified) | "A folder with this name already exists." |
