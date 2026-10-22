# F016_WordFamily

**Priority**: P2
**Type**: ui
**Generated**: 2026-07-03

## Overview

AI-assisted vocabulary study grouped by root-word family. Students browse categories (`WordFamilyCategory`), generate new root-word groups via the Python AI service (deduplicated per category, concurrency-locked per user), save families to a personal collection, and can bridge selected words into a new `FlashCardSet` for spaced-repetition study. A read-only generation-status endpoint lets the category page detect an already-running job on load/reload and poll until it clears; a root-scoped counterpart (`GET /generation-status/:slug/:rootWord`) does the same for single-root regeneration, which itself runs as an unawaited background job so the request never blocks on the AI call. Two parallel admin CRUD surfaces exist for category management (admin-service primary, exam-service legacy). Redis caches every read path with a 30-minute TTL.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities. (The AI-returned `data` JSON blob on `WordFamily` has an internal `words[]` shape but is not a DB-level discriminator.)

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Student can list active categories | `WordFamilyController.getCategories` | yes |
| FR-002 | Student can list root words within a category | `WordFamilyController` `GET /categories/:slug/roots` | yes |
| FR-003 | Student can view a word family's detail | `WordFamilyController` `GET /category/:categorySlug/:rootWord` | yes |
| FR-004 | Student can generate new root words via AI, excluding existing ones | `WordFamilyService.generateWordFamily` | yes |
| FR-005 | Student can save/remove a word family to/from a personal collection | `WordFamilyService.saveToCollection` / `removeFromCollection` | yes |
| FR-006 | Student can convert selected words into a new flashcard deck | `WordFamilyBridgeService.createFlashcardDeck` | yes |
| FR-007 | Admin can CRUD categories (create, update, soft-delete) | `AdminWordFamilyController` (admin-service) to exam gRPC `WordFamilyAdminService` | yes |
| FR-008 | On page load/reload, student sees whether an AI generation job is already running for the category and gets a "generating" state until it finishes | `WordFamilyController` `GET /generation-status/:slug` | yes |
| FR-009 | A specific root word's family can be (re-)generated on-demand as a background job — the endpoint acquires a root-specific lock and returns immediately (no gateway timeout), and the client polls a root-scoped status endpoint until the AI call completes and the record is overwritten | `WordFamilyController` `POST /word-family/generate-root` → `WordFamilyService.generateWordFamilyForRoot`; status via `GET /word-family/generation-status/:slug/:rootWord` → `getRootGenerationStatus` | yes |

**Source:** `examio-be/apps/exam-service/src/modules/word-family/word-family.controller.ts:33-208`, `examio-be/apps/exam-service/src/modules/word-family/word-family-bridge.service.ts:24-97`, `examio-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.controller.ts:32-69`

### Business Rules

- **BR-001**: Dedup is enforced at two layers — app-level (existing root words for the category are merged into the AI request's exclude-list) and DB-level (`@@unique([rootWord, categorySlug])` with `upsert` on write). If the AI still returns a duplicate, the existing row's `data` is silently updated rather than erroring. Source: `word-family.service.ts:114-116`, `word-family.repository.ts:117-131`.
- **BR-002**: Only one generation job per `userId:categorySlug` may run at a time — enforced by a Redis `SET NX EX` lock with a 30-minute TTL; a concurrent second request gets `ConflictException`; the lock is always released in `finally` even on failure. Source: `word-family.service.ts:119-126,196`.
- **BR-003**: No credit/quota check exists before AI generation — unlike other AI flows in the codebase (e.g. AI chat, which checks wallet/subscription via gRPC), word-family generation has no wallet gate.
- **BR-004**: Category deletion is soft-delete only (`isActive: false`) through the admin API (admin-service to exam gRPC `WordFamilyAdminService`; the exam HTTP category write routes were removed in phase 10); the Prisma `onDelete: Cascade` relation to `WordFamily`/`UserSavedWordFamily` exists but is unreachable via any exposed hard-delete route. Source: `word-family.prisma:28`, `admin-word-family.service.ts`.
- **BR-005**: Saving a word family is idempotent — `@@unique([userId, wordFamilyId])` on `UserSavedWordFamily` makes repeated saves a no-op rather than an error. Source: `word-family.prisma:47`.
- **BR-006**: Flashcard bridge content is HTML-escaped before being written to `FlashCard.question`/`answer` to prevent XSS from AI-generated text. Source: `word-family-bridge.service.ts:65-69,122-130`.
- **BR-007**: The flashcard bridge operation is atomic — `FlashCardSet` creation, batch `FlashCard` creation, and batch `DetailsFlashCard` join creation all run inside one `prisma.$transaction`. Source: `word-family-bridge.service.ts:72`.
- **BR-008**: If the AI response's `categorySlug` doesn't match the requested one, the Python service overrides it to the requested slug rather than failing the request. Source: `generation_service.py:944-953`.
- **BR-009**: Word-family user routes require both a valid session AND the `word-family` page flag enabled at the gateway (`@TogglePage('word-family')`), tying this feature into F015 PageFeatureFlags. Source: `word-family-proxy.controller.ts:24-31`.
- **BR-010**: Generation status is read-only and reuses the existing BR-002 lock rather than introducing new state — `GET /generation-status/:slug` reads `wf:gen:lock:{userId}:{categorySlug}` and reports `generating: true` for as long as that key exists, with `startedAt` set to the ISO timestamp stored in the lock value. Since the lock key is derived from the server-side authenticated user (`req.user.id`), the endpoint cannot leak another user's in-progress generation. Source: `word-family.service.ts:106-121`, `word-family.controller.ts:117-129`.
- **BR-011**: `generateWordFamilyForRoot` acquires the `userId:categorySlug:rootWord` lock synchronously (rejecting a concurrent call with `ConflictException` if already held), then fires the AI call + upsert via an unawaited `runRootGeneration` background worker and returns `{ generating: true, categorySlug, rootWord, startedAt }` immediately — the request no longer blocks on the AI response, avoiding a gateway proxy timeout on slow generations. The worker's AI request carries `numRootWords: 1`, `excludeRootWords: []`, and the `rootWord` field; on success it always overwrites via the existing `[rootWord, categorySlug]` upsert (BR-001), forcing the response's `rootWord`/`categorySlug` to match the request rather than trusting the AI's echo. The lock is released in the worker's `finally` regardless of outcome, and worker errors are only logged — never thrown, since no caller is still awaiting the request. The concurrency lock stays scoped per `userId:categorySlug:rootWord` (not just per category), so regenerating one root word does not block a concurrent category-level `generate` or a different root's `generate-root` call. Source: `word-family.service.ts:263-372`, `word-family.controller.ts:118-127`.
- **BR-012**: `getWordFamily` (`GET /category/:categorySlug/:rootWord`) flattens the stored record before returning it — `{ id, rootWord, categorySlug, words, createdAt, updatedAt }` — reading `words` out of the `data` JSON column, instead of the previous raw-record shape with the payload nested under `.data`. This matches the FE `WordFamilyData` type, which reads `words` directly off the response. Source: `word-family.service.ts:102-121`.

### Decision Logic

- **DEC-001** (flow): Whether a generation request proceeds or is rejected — decided by the Redis per-user-per-category lock. `user_visible_outcome`: generation starts, or the user sees a "already generating" conflict message. Source: `word-family.service.ts:119-126`.
- **DEC-002** (interaction): Which words are included when converting to a flashcard deck — student-selected subset via checkboxes, or all words if none selected. `user_visible_outcome`: the resulting flashcard deck's card count. Source: `word-family-bridge.service.ts:46-57`.

### State Machines

None.

### Algorithms

- **AI prompt + parse pipeline** (`generation_service.py`): builds a prompt requiring 3-5 word variations per root word with POS/meaning/example/affix breakdown, embeds the exclude-list as text, retries up to 2 times on parse failure or empty result, extracts JSON from the LLM response (handling markdown fences and brace-matching), and normalizes output — stripping stray list-prefixes, mapping POS abbreviations, defaulting invalid POS to `"noun"`, and forcing `affix.root` to match the requested root word. Source: `generation_service.py:862,935,959,1002,1031`.
- **Flashcard bridge ID re-matching**: since Prisma's `createMany` doesn't return created record IDs, the bridge re-queries created `FlashCard` rows by matching `question` text to build the `DetailsFlashCard` join batch — a low-risk fragility given root words are unique strings within a batch. Source: `word-family-bridge.service.ts:92-97`.

### External Integrations

- **Python AI service** — `POST {AI_SERVICE_URL}/generate/word-family`, 600s timeout, `x-internal-service-token` auth header, body `{categorySlug, categoryName, numRootWords, excludeRootWords, rootWord?}`. The optional `rootWord` field (added for BR-011) switches the prompt to generate variations for that exact root instead of proposing new roots. For `generate-root`, this call now happens inside the unawaited `runRootGeneration` background worker rather than on the request path. Returns 503 with `{code, message}` on `ModelUnavailableError`, 400 on other failures (category-level `generate` path only — the root-specific worker logs and swallows failures instead of propagating an HTTP error). Source: `word-family.service.ts:208-220,325-337`, `generation.py:69,235,263`, `generation_service.py:54,65,871-890,1048`.

### Verification

- **SC-001** — Requesting generation for a category with existing root words never returns a root word already present.
- **SC-002** — A second generation request for the same user+category while one is in-flight receives a conflict response, not a duplicate job.
- **SC-003** — Converting words to a flashcard deck creates exactly one `FlashCardSet` with one `FlashCard` per selected word, and the operation is all-or-nothing.
- **SC-004** — AI-generated word content rendered as flashcard question/answer cannot execute injected HTML/script.
- **SC-005** — Reloading the category page while a generation job is in-flight for that user+category shows the "generating" state (not a blank/normal list), and the state clears and the root-word list refreshes once the job completes.
- **SC-006** — Calling `generate-root` for a root word that already has a saved `WordFamily` record overwrites that exact record (same `id`, refreshed `data`) rather than creating a duplicate.
- **SC-007** — `POST /word-family/generate-root` responds immediately with `{ generating: true, ... }` rather than waiting for the AI call to finish; the detail page's poll against `GET /word-family/generation-status/:slug/:rootWord` reflects `generating: false` (and the refreshed detail) only once the background worker completes and releases the lock.

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

_See `business-context.md` for plain-language user story narrative._

### Edge Cases

See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| WordFamilyCategory | `WordFamilyCategory` | id, name (unique), slug (unique), isActive, order | Topic grouping for root words |
| WordFamily | `WordFamily` | id, rootWord, categoryId, categorySlug, data (Json) | One AI-generated root-word family; unique on `[rootWord, categorySlug]` |
| UserSavedWordFamily | `UserSavedWordFamily` | id, userId, wordFamilyId, savedAt | Personal collection membership; unique on `[userId, wordFamilyId]` |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|---------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F016 | [x] |
| Screen List | [screen-list.md](../../docs/generated/screen-list.md) | SCR040, SCR041, SCR042, SCR043 | [x] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM056, PERM057 | [x] |

## Assumptions

- Category writes have a single path since phase 10: admin-service HTTP (`/admin/word-family/categories*`, `word_family:admin`) calling exam's gRPC `WordFamilyAdminService`. Category images are pasted URLs; replacing or deleting one deletes the old R2 object, limited to the `word-family/` prefix.
- No credit/quota enforcement on AI generation is assumed intentional (feature launched without a wallet gate), not an oversight — flagged in Unresolved Questions for confirmation.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| WordFamilyCategory/WordFamily/UserSavedWordFamily (models) | `examio-be/libs/database/src/models/word-family.prisma:2-50` | Data models |
| WordFamilyController | `examio-be/apps/exam-service/src/modules/word-family/word-family.controller.ts:33-208` | User routes (category writes removed), incl. `GET /generation-status/:slug`, `POST /generate-root`, `GET /generation-status/:slug/:rootWord` |
| WordFamilyService | `examio-be/apps/exam-service/src/modules/word-family/word-family.service.ts:17-396` | Category CRUD, generation orchestration, collection CRUD, `getGenerationStatus`, `generateWordFamilyForRoot` (fires unawaited background job), `runRootGeneration` worker, `getRootGenerationStatus`, flattened `getWordFamily` response |
| WordFamilyBridgeService | `examio-be/apps/exam-service/src/modules/word-family/word-family-bridge.service.ts:24-130` | Transactional flashcard conversion |
| WordFamilyRepository | `examio-be/apps/exam-service/src/modules/word-family/word-family.repository.ts:18-196` | Redis-cached Prisma access, upsert dedup |
| AdminWordFamilyController | `examio-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.controller.ts:32-69` | Admin category CRUD (HTTP edge; forwards to exam gRPC `word-family-admin.grpc.controller.ts`) |
| AdminWordFamilyService | `examio-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.service.ts:41-179` | Transactional CRUD + audit diff |
| WordFamilyProxyController | `examio-be/apps/gateway-service/src/controllers/word-family-proxy.controller.ts:24-31,159-172,189-207` | Gateway proxy, `PageEnabledGuard`, incl. `POST generate-root`, `GET generation-status/:slug/:rootWord` |
| generation.py (AI endpoint) | `examio-be/apps/ai-service/src/backend/api/generation.py:69,235,263` | FastAPI word-family generation endpoint; `rootWord` request field |
| generation_service.py | `examio-be/apps/ai-service/src/backend/services/generation_service.py:862-1031` | Prompt build, parse, normalize; `root_word` param switches to single-root prompt (BR-011) |
| useWordFamilyStore | `examio-fe/src/stores/useWordFamilyStore.ts` | FE state, cached fetches (30min/5min TTLs); slug-scoped `generatingSlug` + `checkGenerationStatus`/`abandonGeneration` for the category-level resume-on-reload; root-scoped `regeneratingKey` (`categorySlug:rootWord`) + `checkRootGenerationStatus`/`abandonRootGeneration` for the background single-root regenerate flow (FR-009) — `generateWordFamilyForRoot` only fires the request, the poller triggers the refetch once the lock clears. |
| wordFamilyApi | `examio-fe/src/apis/wordFamilyApi.ts:53-193` | API client (11 user + 4 admin routes), incl. `getWordFamilyGenerationStatusApi`, `generateWordFamilyForRootApi` (now returns a background-job ack `{generating, categorySlug, rootWord, startedAt}`, not the full record), and `getRootWordFamilyGenerationStatusApi` (root-scoped status poll). |
| WordFamilyPage/CategoryPage/DetailPage | `examio-fe/src/pages/k/WordFamily*.tsx` | Student-facing screens; `WordFamilyCategoryPage` polls category-level generation status, `WordFamilyDetailPage` polls root-level generation status — both every 5s, capped ~11min, on mount and after triggering/resuming a job |
| AdminWordFamilyPage | `examio-fe/src/pages/admin/AdminWordFamilyPage.tsx` | Admin CRUD screen |

## Unresolved Questions

1. **Credit/quota gate**: Is the absence of a wallet/credit check on AI generation intentional, or should it be added to match other AI flows?
2. **Dual admin surface**: Should the legacy exam-service admin category CRUD (`word-family.controller.ts`) be removed now that admin-service is the primary surface?
3. **Saved collection page**: No dedicated "My Saved Word Families" page/route was found in the frontend — is this planned, or is inline save-state on the detail page the intended final UX?
4. **Hard delete path**: Is a hard-delete admin action planned for categories, or is soft-delete-only permanent by design?
