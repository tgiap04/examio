# F006 Technical Spec - AI File Upload, OCR & Content Generation

## Functional Requirements
- FR001: Authenticated users can upload supported files/images from `/k/ai-tool`.
- FR002: Uploaded files are stored through R2 and persisted as `UserStorage` records.
- FR003: The system processes files through OCR/chunking/embedding pipelines and updates processing status.
- FR004: Users can generate quizzes or flashcards from processed file content.
- FR005: Generation creates async job/history records and supports job polling/cancel/delete where available.
- FR006: Users can view recent uploads and generation history.
- FR007: Mobile AI upload/generation screens exist but are mock-backed; shared API wiring Needs verification.

## Business Rules
- BR001: Upload and generation require authentication. Source: PERM029, PERM030.
- BR002: Users may view/delete/regenerate only own uploads/jobs/history. Source: PERM031.
- BR003: Client notes a 50MB upload limit; backend/R2 exact limits Need verification. Source: PERM029.
- BR004: Web `FREE_MODE = true` bypasses client credit checks; backend subscription/credit enforcement Needs verification. Source: BL065.
- BR005: R2 asset deletion must be coordinated with DB record deletion; exact implementation Needs verification.

## State Management
- SM001: Web `useAIGeneratorStore` tracks upload, selected files, generation jobs, polling, credits, and recent uploads.
- SM002: Web `aiApi.ts`, `examApi.ts`, and `historyApi.ts` call gateway endpoints.
- SM003: AI model catalog is lazy-loaded and cached. Source: BL055.
- SM004: Mobile shared `AIGeneratorApiService` exists; Android/iOS screens are mock-backed.

## Algorithms
- ALG001: Upload flow: client -> gateway -> exam-service -> R2 gRPC -> `UserStorage` -> Python `process-file`.
- ALG002: Processing flow: OCR extracts text, chunks content, creates embeddings/documents, and updates file status.
- ALG003: Generation flow: selected upload + generation settings -> async job -> poll `/ai/job/:jobId` -> display/save quiz or flashcards.

## Integrations
- INT001: API006 `/api/v1/ai/*` for upload, generation, models, recent uploads, jobs, history.
- INT002: API011 Python `/api/ai/*` and `/api/generate/*` for processing and generation.
- INT003: API012 R2 gRPC for storage.
- INT004: API013 OCR service/gRPC for PDF OCR.
- INT005: API018 RabbitMQ OCR events may be involved; exact async topology Needs verification.

## Key Entities
- MODEL025 `HistoryGeneratedQuizz`
- MODEL026 `HistoryGeneratedFlashcard`
- MODEL027 `UserStorage`
- MODEL028 `Document`
- MODEL034 `r2.proto`
- MODEL035 `ocr.proto`
- MODEL039 OCR events

## Artifact References
- `feature-list.md` F006
- `user-stories.md` US008
- `screen-list.md` SCR024, SCR108, SCR109, SCR208
- `screen-flow.md` FLW040, FLW041, FLW107, FLW206
- `behavior-logic.md` BL050-BL053, BL055, BL065
- `api-map.md` API006, API011, API012, API013, API018
- `permissions.md` PERM029-PERM031, PERM038-PERM039
- Source paths: web `src/apis/aiApi.ts`, `src/apis/examApi.ts`, `src/apis/historyApi.ts`, `src/stores/useAIGeneratorStore.ts`; backend exam-service AI modules, R2 service, Python AI service; exact files Need verification.
