# Edge Cases — F006_QuizAuthoring

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Student opens a private quiz set with no grant | 404 (existence not revealed) | Not-found state |
| Student submits or saves an attempt already submitted | 409 `ALREADY_SUBMITTED` | Error state (wording set by the page) |
| Owner revokes access (whitelist removal, code rotation) during an open attempt | Open attempt answers 404; submitted attempts stay readable | Not-found state; unlock again to continue |
| Sharing list would exceed 2000 users | 409 `SHARE_LIST_FULL` | Server message: "A sharing list holds at most 2000 users" |
| User without ownership attempts to edit a quiz set | Backend rejects with 403 Forbidden; UI shows error toast | "You do not have permission to edit this quiz set." |
| User creates a question with fewer than 2 answer options | API validation rejects with 400; inline field error shown | "At least 2 answer options are required." |
| User attempts to generate a quiz from a document still in PROCESSING state | UI disables the generate button; tooltip explains document is not ready | "This document is still being processed. Please wait until processing is complete." |
| User attempts to generate a quiz with insufficient credits and FREE_MODE disabled | API returns 402 or 403; subscription page link displayed in error | "You don't have enough credits. Purchase a subscription to continue generating content." |
| AI generation job runs for more than 60 minutes | Client-side polling stops after 360 attempts; job may still complete server-side | "Generation is taking longer than expected. Check the job status later or try again." |
| User deletes a quiz set that is the source of an active ExamRoom | API returns 409 Conflict; deletion is blocked | "This quiz set cannot be deleted because it is linked to an active exam room." |
| User deletes a label that has tagged questions | Label is removed; questions retain their question text but lose the tag (SetNull) | None — silent; questions remain unchanged |
| User deletes a PDF history record | Record is removed from history; source document in R2 storage is unaffected | "PDF history record deleted." |
| User cancels an in-progress AI job | Job is terminated server-side; no content is generated | "Generation cancelled." |
| User navigates away during a pending AI job | `useGenerationGuard` resumes polling on next visit via localStorage; progress dialog reappears | Status continues to update from where it left off |
| User attempts to edit quiz set title to empty string | API validation rejects with 400; title field highlighted | "Quiz set title cannot be empty." |
| Concurrent edits: two teachers open the same quiz set for editing simultaneously | Last-write-wins on save; no optimistic locking detected | "Your changes were saved. Note: another user may have edited this set." |
