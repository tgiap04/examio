# Edge Cases — F007_FlashcardAuthoring

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| User without ownership attempts to edit a flashcard set | Backend returns 403 Forbidden; UI shows error toast | "You do not have permission to edit this flashcard set." |
| User creates a flashcard with empty front text | API validation rejects with 400; field highlighted | "Front text cannot be empty." |
| User creates a flashcard with empty back text | API validation rejects with 400; field highlighted | "Back text cannot be empty." |
| Generate flashcards from a PROCESSING document | UI disables generate button; tooltip shown | "This document is still being processed. Please wait until it is ready." |
| Delete a flashcard set that has active study sessions | API returns 409 or cascades deletion | "This flashcard set cannot be deleted while students are studying it." |
| Delete a label that has tagged flashcards | Label tag removed from cards (SetNull); cards remain | None — silent; cards stay intact |
| User cancels an in-progress AI flashcard generation job | Job terminated server-side; no cards are generated | "Generation cancelled." |
| Two users simultaneously edit the same flashcard set | Last-write-wins; earlier save is overwritten | "Your changes were saved. Note: another user may have edited this set." |
| User sets visibility to private without an access code | Set becomes owner-only; no code required to study | "This deck is now private. Only you can access it." |
| User attempts to study a private deck without the access code | Access is blocked; code entry dialog shown | "This deck is private. Enter the access code to study." |
| AI generation job exceeds 60-minute timeout | Client polling stops; job may still complete server-side | "Generation is taking longer than expected. Check back later." |
