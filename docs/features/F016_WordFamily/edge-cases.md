# Edge Cases — F016_WordFamily

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| AI generates a root word that already exists in the category | DB-level upsert updates the existing row's data instead of erroring (dedup safety net) | None — appears as a normal successful generation |
| Student triggers generation while one is already running for the same category | Redis lock rejects the second request (`ConflictException`) | "Đang tạo, vui lòng đợi" (generation in progress) |
| AI service is unavailable (`ModelUnavailableError`) | Python returns 503 with structured `{code, message}`; NestJS surfaces a retry-friendly error | Error message inviting retry |
| AI returns malformed/unparseable JSON | Python retries up to 2 times internally before failing | Generic generation-failed error after retries exhausted |
| AI returns a `categorySlug` different from the one requested | Backend overrides it to match the requested slug rather than failing | None — generation succeeds transparently |
| Student saves a word family they've already saved | No-op due to `@@unique([userId, wordFamilyId])` — idempotent | None — appears saved (already was) |
| Student selects zero words before converting to flashcards | Bridge falls back to using all words in the family | Deck created with every word |
| Two selected words produce identical escaped question text | Low-risk mis-mapping in the ID re-matching step (fragility, not a hard failure in practice since root words are unique strings) | None observed — theoretical edge case |
| Admin soft-deletes a category | Category `isActive = false`; existing `WordFamily` rows remain in DB (cascade defined but never triggered via API) | Category disappears from student-facing browse list |
| Admin toggles the `word-family` page flag off (F015) | Gateway blocks all word-family proxy routes with 404 | Page appears not found to students |
| Generation request completes after the 30-minute lock TTL expires mid-request | Lock is always released in `finally`, so a stuck lock cannot persist indefinitely | None — subsequent requests unaffected |
| AI-generated word content contains HTML/script-like text | Escaped via `escapeHtml` before being written into flashcard question/answer | None — rendered as plain text, not executed |
