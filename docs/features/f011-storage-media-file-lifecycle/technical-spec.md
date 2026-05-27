# F011 - Storage, Media & File Lifecycle Technical Spec

## Functional Requirements
- FR001: Upload user files/media through gateway/exam-service to R2 and store metadata in the database.
- FR002: Generate or fetch signed/file URLs for user-scoped files.
- FR003: List recent uploads and file metadata for AI/history/knowledge workflows.
- FR004: Delete uploaded files and associated metadata where supported.
- FR005: Upload profile avatar/banner media through the R2 image API.
- FR006: Preserve processed document chunks/status for AI, OCR, RAG, and knowledge flows.

## Business Rules
- BR001: File access and lifecycle operations must be user-scoped or service-authorized. Linked FR: FR001-FR004.
- BR002: AI/PDF uploads require authenticated user access and upload limits; exact backend limits Need verification. Linked FR: FR001, FR003.
- BR003: Profile/media image upload is part of own-profile management. Linked FR: FR005.
- BR004: When deleting a DB record that has an R2 asset, the R2 object should also be deleted per repo rule; current implementation behavior Needs verification. Linked FR: FR004.
- BR005: OCR/document processing status should remain aligned with storage metadata. Linked FR: FR006.

## State Machines
- SM001: File lifecycle: selected -> uploaded to R2 -> DB metadata created -> processing requested -> processed/failed -> listed or deleted. Linked FR: FR001, FR003, FR004, FR006.
- SM002: Profile image lifecycle: selected -> uploaded through image API -> profile avatar/banner updated -> old asset cleanup Need verification. Linked FR: FR005.
- SM003: OCR lifecycle: upload/document -> OCR requested -> completed or failed. Exact retry behavior Needs verification. Linked FR: FR006.

## Algorithms
- ALG001: Upload flow streams or forwards client files to gateway/exam-service, then R2 gRPC `UploadFile`, then writes `UserStorage` metadata. Linked FR: FR001.
- ALG002: Delete flow should call R2 gRPC `DeleteFile` and remove or update DB metadata; ordering/compensation Need verification. Linked FR: FR004.

## Integrations
- INT001: R2 Storage API/gRPC (API012) includes `UploadFile`, `GetFileUrl`, `DeleteFile`, and `ListUserFiles`; HTTP proxy route list Needs verification. Linked FR: FR001-FR004.
- INT002: OCR Service API/gRPC (API013) processes PDFs through `ProcessPdf` and `HealthCheck`. Linked FR: FR006.
- INT003: AI Upload/Generation API (API006) uses storage for quick upload, generate-from-file, upload, recent uploads, and upload deletion. Linked FR: FR001, FR003, FR004.
- INT004: Service events include `ocr.requested`, `ocr.completed`, and `ocr.failed`. Linked FR: FR006.
- INT005: Profile avatar/banner upload uses R2 image API from web profile flows. Linked FR: FR005.

## Key Entities
- MODEL027 UserStorage: filename, url, mimetype, size, keyR2, processingStatus, creditCharged.
- MODEL025 HistoryGeneratedQuizz and MODEL026 HistoryGeneratedFlashcard: generated history linked to UserStorage.
- MODEL034 r2.proto: `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles`.
- MODEL035 ocr.proto: `ProcessPdf`, `HealthCheck`.
- MODEL024 AIChatDocument: links chat to user storage for multi-document support.

## Artifact References
- `feature-list.md` F011.
- `user-stories.md` US008, US015, US018.
- `screen-list.md` profile upload, AI upload flows, GenAI knowledge file manager; exact SCR refs Need verification.
- `behavior-logic.md` BL050, BL053, BL057.
- `data-model.md` MODEL024, MODEL025-MODEL027, MODEL034, MODEL035.
- `api-map.md` API012, API013, API006, API018.
- `permissions.md` PERM018, PERM029, PERM033, PERM038 where applicable.
- Source paths cited by artifacts: web `/r2/image`, AI upload clients, R2 gRPC service; exact source paths Need verification.
