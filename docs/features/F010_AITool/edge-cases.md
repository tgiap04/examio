# Edge Cases — F010_AITool

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| User attempts to generate from a PROCESSING document | Generate button is disabled; tooltip explains document is not ready | "This document is still being processed. Please wait until processing is complete." |
| User attempts to generate from a FAILED document | "Retry Processing" button shown instead of Generate | "This document failed to process. Please retry processing before generating content." |
| User navigates away during active polling and returns later | `useGenerationGuard` reads jobId from localStorage; PendingJobDialog reappears and polling resumes | Job status continues to update from where it left off |
| Job exceeds 60-minute polling timeout (360 attempts) | Client stops polling; job may still complete server-side | "Generation is taking longer than expected. Check the job status again later or try again." |
| User cancels a pending job while AI service is processing | Job becomes CANCELLED and nothing to refund; a late AI result is ignored; the processed document stays reusable | "Generation cancelled." |
| AI service returns an error | Job status set to FAILED; a job with no progress for 60 minutes (`GENERATION_JOB_TIMEOUT_MINUTES`) fails with `GENERATION_TIMEOUT` | "Generation failed. Please try again." |
| User has no documents uploaded | Empty state shown with prompt to upload a document first | "No documents found. Upload a document to start generating content." |
| User selects a document but leaves the page before clicking Generate | Document selection is lost on page reload (no localStorage persistence) | "Please select a document before generating." |
| Concurrent generation requests: user clicks Generate twice rapidly | A per-user, per-type lock refuses the second request (409) until the first job ends | "Generation started. Please wait for it to complete before starting another." |
| Generated content is unsatisfactory | User can cancel and retry with adjusted parameters; failed job record remains in history | "Content generation failed. Please try with different parameters." |
| User tries to generate from another user's document | API returns 403; document not visible to other users | "You do not have permission to use this document." |