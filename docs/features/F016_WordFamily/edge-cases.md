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
| vocabulary-service crashes/restarts mid-generation | Redis lock is never released and lingers until its 30-minute TTL expires; `GET /generation-status/:slug` keeps reporting `generating: true` until then | FE polling caps out at ~11 min (past the 10-min AI timeout) and shows a "taking longer than expected, try again later" message rather than polling forever |
| A user queries `generation-status/:slug` hoping to see another user's in-progress job | Lock key is always built from the server-side authenticated `req.user.id`, never a client-supplied id, so the status can only ever reflect the caller's own generation | None — reports `generating: false` for that user regardless of other users' activity |
| A specific root word's family is regenerated via `generate-root` while a category-wide `generate` is also running for the same user | Both proceed — the lock key is scoped per `userId:categorySlug:rootWord` for `generate-root`, distinct from the per-category lock used by `generate`, so the two don't contend | None — both complete independently |
| Regenerating a root word that already has a saved/displayed family | Existing `[rootWord, categorySlug]` row is overwritten in place (same `id`, new `data`) rather than creating a duplicate | Word family content refreshes; any personal-collection save pointing at that `id` remains valid |
