# Workshop Survey Report: `/k/ai-tool`

## Route Definition
- `examio-fe/src/routes/index.tsx:24` imports `AIToolPage` from `@/pages/k/AIToolPage`.
- `examio-fe/src/routes/index.tsx:243` defines `path: "/k/ai-tool"` and renders `<ProtectedRoute><KLayout><AIToolPage /></KLayout></ProtectedRoute>`.
- `examio-fe/src/routes/layouts/KLayout.tsx:44` resumes pending AI jobs and navigates back to `/k/ai-tool`.
- `examio-fe/src/components/organisms/k/SideBar.tsx:68` links the sidebar item to `/k/ai-tool`.

## Page Component
- `examio-fe/src/pages/k/AIToolPage.tsx` is the route page.
- `AIToolPage` wraps content in `TeacherRoute` and `Suspense`.
- `AIGeneratorContent` reads `?tab=` from the URL and defaults to `test`.
- Tabs:
  - `test` renders `examio-fe/src/components/organisms/k/TestGenerator.tsx`.
  - `flashcard` renders `examio-fe/src/components/organisms/k/FlashcardGenerator.tsx`.
- The same page also shows recent uploads via `useRecentUploadsStore`, with delete and select actions.

## Stores
- `examio-fe/src/stores/useAIGeneratorStore.ts` contains all AI generation state for this route:
  - `useJobStore`: shared current/pending job state, persistence in `localStorage` key `pending_generation_job`, cancel/resume logic.
  - `useTestGeneratorStore`: PDF/upload selection, quiz count, narrow-search keyword, selected model, generated quiz result, `generateTest()`.
  - `useFlashcardGeneratorStore`: PDF/upload selection, card count, narrow-search keyword, selected model, generated flashcards, current flashcard index, `generateFlashcards()`.
  - `useRecentUploadsStore`: recent file list, selected upload, delete, and load previous quiz/flashcard histories.
- `examio-fe/src/stores/useAIModelCatalogStore.ts` is used indirectly for default/selected AI model.
- `examio-fe/src/stores/useAuthStore.ts` is used for wallet balance checks, wallet updates, and user refresh after generation.

## API Calls
- New PDF generation uses `examio-fe/src/apis/examApi.ts`:
  - `POST /ai/generate-from-file`
  - multipart form fields: `file`, `typeResult`, `isNarrowSearch`, optional `quantityQuizz`, `quantityFlashcard`, `keyword`, `modelType`
  - returns `{ jobId, status, message, newBalance? }`.
- Regenerating from an already-uploaded recent file uses `examio-fe/src/apis/aiApi.ts`:
  - `POST /ai/regenerate/{uploadId}` with JSON `{ typeResult, quantityQuizz|quantityFlashcard, isNarrowSearch, keyword?, modelType? }`
  - returns `{ jobId, newBalance? }`.
- Job status/result polling uses:
  - `GET /ai/job/{jobId}`
  - expected response includes `status`, optional `progress`, `message`, `error`, and `result` with `quizzes` or `flashcards`, `historyId`, `fileInfo`.
- Cancel uses:
  - `DELETE /ai/job/{jobId}`.
- Recent upload/history APIs used by the page:
  - `GET /ai/recent-uploads?limit=10`
  - `GET /ai/upload/{uploadId}/history`
  - `DELETE /ai/upload/{uploadId}`
  - `GET /ai/upload/{uploadId}` exists but this page primarily uses the history endpoint.

## Quiz Generation Flow
- User opens `/k/ai-tool` or `/k/ai-tool?tab=test`; `AIToolPage` renders `TestGenerator`.
- User uploads a PDF through `FileUpload`; `TestGenerator` validates page count with `validatePdfPageCount()` and stores the file through `useTestGeneratorStore.setFile()`.
- `setFile()` also syncs the same file into `useFlashcardGeneratorStore`, so both tabs can use it.
- User configures model, quantity, optional narrow-search keyword, then clicks `Tạo đề kiểm tra`.
- `TestGenerator.handleGenerate()` validates the file again, then calls `useTestGeneratorStore.generateTest()`.
- `generateTest()` validates file/upload presence, validates keyword if narrow mode is on, checks wallet balance with `creditUtils`, then sets `isGenerating: true`.
- If using a recent upload (`uploadId` exists), it calls `POST /ai/regenerate/{uploadId}` with `typeResult: TypeResultGenerateExam.QUIZZ`.
- If using a new file, it calls `POST /ai/generate-from-file` with `typeResult: TypeResultGenerateExam.QUIZZ` and `quantityQuizz`.
- Store saves the returned `jobId` in `useJobStore.setCurrentJobId(jobId, "quiz")`, which persists to localStorage.
- Store starts polling `GET /ai/job/{jobId}` every 10 seconds, up to 360 attempts.
- On `completed`, it sets `generatedTest` from `result.quizzes`, stores `generatedTestId`, stops loading, refreshes recent uploads, refreshes user data, and shows a success toast.
- UI switches from `ModernLoader` to a scrollable quiz preview. Save action is via `DialogAddExam` with `DialogAddExamType.QUIZZ`.

## Flashcard Generation Flow
- User switches to `/k/ai-tool?tab=flashcard`; `AIToolPage` renders `FlashcardGenerator`.
- Upload, model, count, and narrow-search setup mirror the quiz flow.
- `FlashcardGenerator.handleGenerate()` calls `useFlashcardGeneratorStore.generateFlashcards()`.
- If using a recent upload, it calls `POST /ai/regenerate/{uploadId}` with `typeResult: TypeResultGenerateExam.FLASHCARD` and `quantityFlashcard`.
- If using a new file, it calls `POST /ai/generate-from-file` with `typeResult: TypeResultGenerateExam.FLASHCARD` and `quantityFlashcard`.
- Store saves the returned `jobId` in `useJobStore.setCurrentJobId(jobId, "flashcard")` and starts the same 10-second polling loop.
- On `completed`, it sets `generatedCards` from `result.flashcards`, stores `generatedCardsId`, resets `currentCard` to `0`, stops loading, refreshes recent uploads/user data, and shows success toast.
- UI switches from `ModernLoader` to a flip-card preview with previous/next controls. Save action is via `DialogAddExam` with `DialogAddExamType.FLASH_CARD`.

## Result Delivery: Polling, Not SSE
- The `/k/ai-tool` quiz/flashcard generation flow uses job polling, not SSE.
- Poll helper: `pollJobStatus()` in `examio-fe/src/stores/useAIGeneratorStore.ts:297`.
- Poll interval: `JOB_POLL_INTERVAL_MS = 10_000`.
- Max attempts: `JOB_POLL_MAX_ATTEMPTS = 360`, roughly 60 minutes.
- SSE streaming exists elsewhere for AI chat in `examio-fe/src/apis/aiChatApi.ts` and `useAITeacherStore.ts`, but it is not used by `/k/ai-tool` quiz/flashcard generation.

## Pending Job / Resume Behavior
- `useGenerationGuard()` warns on browser unload while `isGenerating` and `currentJobId` are active.
- Jobs continue server-side if the user leaves/reloads.
- `useJobStore` persists current jobs in `localStorage` under `pending_generation_job` with `jobId` and expected type.
- `checkForPendingJob()` can detect `pending`/`processing` jobs and show `PendingJobDialog`.
- `PendingJobDialog` is rendered by `KLayout` and lets the user continue polling or cancel the job.
- Continuing calls `resumePendingJob()` and navigates to `/k/ai-tool`.

## Relevant Files
- `examio-fe/src/routes/index.tsx` - route definition for `/k/ai-tool`.
- `examio-fe/src/pages/k/AIToolPage.tsx` - page shell, tabs, recent upload list.
- `examio-fe/src/components/organisms/k/TestGenerator.tsx` - quiz generation UI and trigger.
- `examio-fe/src/components/organisms/k/FlashcardGenerator.tsx` - flashcard generation UI and trigger.
- `examio-fe/src/stores/useAIGeneratorStore.ts` - Zustand stores, generation actions, polling, pending job resume/cancel.
- `examio-fe/src/apis/examApi.ts` - new-file generation API call.
- `examio-fe/src/apis/aiApi.ts` - regenerate, job status/cancel, recent uploads/history APIs.
- `examio-fe/src/hooks/useGenerationGuard.ts` - unload/network visibility guard during generation.
- `examio-fe/src/components/organisms/PendingJobDialog.tsx` - resume/cancel pending job UI.
- `examio-fe/src/routes/layouts/KLayout.tsx` - renders pending job dialog and navigates back to AI tool on resume.

## Unresolved Questions
- I did not verify backend implementation details for `/ai/generate-from-file`, `/ai/regenerate/{uploadId}`, or `/ai/job/{jobId}`.
- I did not inspect `DialogAddExam` save behavior in detail because the request focused on generation and result delivery.
