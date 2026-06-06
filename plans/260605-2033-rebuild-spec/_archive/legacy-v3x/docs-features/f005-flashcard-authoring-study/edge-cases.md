# F005 Edge Cases - Flashcard Authoring & Study

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in and opens `/k/flash-card` | ProtectedRoute redirects to login and stores return target. | Please sign in to continue. |
| User opens `/study-flashcard/:id` without access | API rejects loading the set. | You do not have access to this flashcard set. |
| Flashcard set was deleted while user is studying | Next load/progress call fails; study should stop. | This flashcard set is no longer available. |
| Set has no cards | Study cannot begin until cards exist. | Add flashcards before starting study. |
| Progress submission fails | Keep current local state and allow retry. | Could not save your progress. Try again. |
| Shared/public access rule is ambiguous | Treat as Needs verification; do not expose private cards without backend approval. | Access to this set could not be verified. |
| Mobile user opens study screen | Current platform UI may use mock state, not real repository calls. | Needs verification. |
