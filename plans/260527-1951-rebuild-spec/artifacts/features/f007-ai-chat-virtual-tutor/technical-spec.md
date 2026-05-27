# F007 Technical Spec - AI Chat & Virtual Tutor

## Functional Requirements
- FR001: Authenticated users can create/open AI chat sessions.
- FR002: Users can send messages and receive streamed tutor responses on web.
- FR003: Users can select subjects/model context where available.
- FR004: Users can attach uploaded documents or images to provide context.
- FR005: Chat messages are persisted with role/content/image/document references.
- FR006: Teachers/admins can manage GenAI tutor knowledge files/folders/datasets/graphs from `/k/genai-knowledge`; authorization Needs verification.
- FR007: Mobile AI chat UI exists, but SSE clients are stubbed and feature screens are mock-backed.

## Business Rules
- BR001: AI chat requires authentication. Source: PERM032.
- BR002: Chat image/document uploads require authenticated ownership/access. Source: PERM033.
- BR003: Subject list is public according to permissions. Source: PERM036.
- BR004: Tutor knowledge management is admin/teacher-like but exact allowed-email/admin backend rule Needs verification. Source: PERM034, PERM035.
- BR005: Subscription checks may apply through finance benefits; exact product limits Need verification. Source: BL064.

## State Management
- SM001: Web `useAITeacherStore` manages chat sessions/messages/streaming state.
- SM002: Web `aiChatApi.ts` handles chat CRUD/message/SSE calls.
- SM003: Subject/model catalogs are loaded through subject/model APIs and cached/lazy-loaded.
- SM004: Mobile shared `AIChatRepository` exists but Android/iOS SSE actuals throw `NotImplementedError`.

## Algorithms
- ALG001: Streaming chat sends message/context to gateway/exam-service/Python and appends SSE chunks until completion.
- ALG002: Multi-document chat resolves selected `UserStorage` records, links them through `AIChatDocument`, and sends relevant context to Python AI service.
- ALG003: Knowledge ingestion imports/uploads files, processes them, and exposes graph/stat views; exact graph persistence Needs verification.

## Integrations
- INT001: API007 `/ai-chat/*` and Python `/api/chat/*` for chat and streaming.
- INT002: API008 `/subjects` and `/ai/models` for subject/model catalog.
- INT003: API011 Python AI processing for document context and RAG.
- INT004: API014 `/api/v1/ai/tutor/*` and Python `/api/tutor/*` for tutor knowledge management.
- INT005: API012 R2 may store chat images/documents.

## Key Entities
- MODEL022 `AIChat`
- MODEL023 `AIChatMessage`
- MODEL024 `AIChatDocument`
- MODEL027 `UserStorage`
- MODEL028 `Document`
- MODEL050 mobile `AIChatModels.kt`
- Subject/category models Need verification.

## Artifact References
- `feature-list.md` F007
- `user-stories.md` US009, US018
- `screen-list.md` SCR024, SCR025, SCR108, SCR208
- `screen-flow.md` FLW042, FLW043, FLW107, FLW206
- `behavior-logic.md` BL054-BL056, BL064, BL074
- `api-map.md` API007, API008, API011, API014
- `permissions.md` PERM032-PERM036
- Source paths: web `src/apis/aiChatApi.ts`, `src/apis/subjectApi.ts`, `src/apis/genaiTutorKnowledgeApi.ts`, `src/stores/useAITeacherStore.ts`, `src/stores/useGenAIKnowledgeStore.ts`; Python AI chat/tutor APIs; exact backend files Need verification.
