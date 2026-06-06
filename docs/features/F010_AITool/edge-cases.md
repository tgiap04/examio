# Edge Cases — F010_AITool

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| User attempts to generate from a PROCESSING document | Generate button is disabled; tooltip explains document is not ready | "This document is still being processed. Please wait until processing is complete." |
| User attempts to generate from a FAILED document | "Retry Processing" button shown instead of Generate | "This document failed to process. Please retry processing before generating content." |
| User attempts to generate with 0 credits and FREE_MODE=false | API returns 402; subscription page link shown in error | "You don't have enough credits. Purchase a subscription to continue generating content." |
| User navigates away during active polling and returns later | `useGenerationGuard` reads jobId from localStorage; PendingJobDialog reappears and polling resumes | Job status continues to update from where it left off |
| Job exceeds 60-minute polling timeout (360 attempts) | Client stops polling; job may still complete server-side | "Generation is taking longer than expected. Check the job status again later or try again." |
| User cancels a pending job while AI service is processing | Job is terminated server-side; partial content is discarded | "Generation cancelled." |
| AI service returns an error after credit deduction | Job status set to FAILED; credit refund policy is unverified | "Generation failed. Please try again." |
| User has no documents uploaded | Empty state shown with prompt to upload a document first | "No documents found. Upload a document to start generating content." |
| User selects a document but leaves the page before clicking Generate | Document selection is lost on page reload (no localStorage persistence) | "Please select a document before generating." |
| Concurrent generation requests: user clicks Generate twice rapidly | Two jobs may be created; second request is not blocked | "Generation started. Please wait for it to complete before starting another." |
| Generated content is unsatisfactory | User can cancel and retry with adjusted parameters; failed job record remains in history | "Content generation failed. Please try with different parameters." |
| User tries to generate from another user's document | API returns 403; document not visible to other users | "You do not have permission to use this document." |