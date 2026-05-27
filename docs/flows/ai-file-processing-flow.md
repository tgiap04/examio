# FLOW002 - AI File Processing Flow

## Purpose
Document the cross-feature lifecycle for AI file upload, storage, OCR/RAG processing, and generated quiz/flashcard outputs.

## Actors/systems
- Authenticated web user on `/k/ai-tool`
- Web AI generator store and API clients
- Gateway `/api/v1/ai/*`
- Exam service AI modules
- R2 service over gRPC
- Python AI service for OCR, chunking, embeddings, RAG/generation
- PostgreSQL/Prisma `UserStorage`, `Document`, generated history models
- Optional RabbitMQ OCR events
- Mobile AI screens and shared KMP API services, currently mostly mock-backed

## State transitions
- File selected -> upload requested -> file stored in R2 -> `UserStorage` metadata created.
- `UserStorage` created -> processing requested -> OCR/chunking/embedding in progress -> processed or failed.
- Processed upload selected -> generation requested -> async job/history created -> polling -> completed result displayed/saved or failed/cancelled.
- Recent upload/history: created/processed/generated -> listed in recent uploads or PDF/generation history.
- Deletion path: uploaded/history record -> delete requested -> DB metadata and R2 object should be removed/updated. Exact ordering Needs verification.

## Trigger types
- User action: upload file/image, select file, generate quiz/flashcards, cancel/delete job or upload.
- Polling: client polls job status until terminal state.
- Backend async work: OCR/generation jobs update file or history status.
- Event-driven trigger: OCR requested/completed/failed events may be involved; exact topology Needs verification.
- Access/limit trigger: authenticated upload and credit/subscription checks; backend enforcement Needs verification.

## Source artifact refs
- `feature-list.md` F006, F011, F007
- `screen-flow.md` FLW040-FLW043, FLW107, FLW206
- `behavior-logic.md` BL050-BL056, BL065, BL074
- `data-model.md` MODEL022-MODEL028, MODEL034, MODEL035, MODEL039
- `features/f006-ai-file-upload-ocr-content-generation/technical-spec.md`
- `features/f011-storage-media-file-lifecycle/technical-spec.md`
- `features/f007-ai-chat-virtual-tutor/technical-spec.md`

## Edge cases / Needs verification
- Backend/R2 upload size limits and accepted MIME types.
- Whether OCR processing is direct HTTP/gRPC, event-driven, or mixed per path.
- Exact job status enum, retry behavior, cancellation behavior, and timeout policy.
- Credit/subscription enforcement when web `FREE_MODE = true` bypasses client checks.
- R2 cleanup when associated DB records or generated histories are deleted.
- Mobile AI upload/generation and SSE behavior is not production-wired; mobile SSE actuals throw `NotImplementedError`.
