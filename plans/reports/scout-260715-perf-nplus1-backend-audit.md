# Backend Performance Audit — N+1 & Algorithmic Complexity

Date: 2026-07-15 · Scope: all `kmaedu-be/apps/*` services · Method: 4 parallel readers over every `*.service.ts`/repository (skipped specs).

## Verdict
No classic `await find()` inside a `for` loop across a large dataset survived scrutiny — the codebase is generally disciplined (admin-service especially: pagination, `groupBy`, Map-joins, Redis caching throughout). The real hotspots are **unbounded `findMany` + in-memory aggregation** (loading whole histories to sum/count/count-length) and **two O(n·m·k) in-memory scans** in the save-history paths.

Total: **4 HIGH · 12 MEDIUM · 6 LOW**. auth-service, gateway, ocr = clean.

---

## HIGH — fix first (scale with data on hot paths)

| # | Location | Problem | Fix |
|---|----------|---------|-----|
| H1 | `finance-service/.../wallet/wallettransaction.repository.ts:155` `getUsageBreakdownByType` | Unbounded `findMany` of every SUBTRACT tx for the wallet, then `reduce` to sum per type. On hot `GET /wallet/details`. Grows with every AI spend. | `groupBy({ by:['type'], where:{walletId,direction:'SUBTRACT'}, _sum:{amount} })` |
| H2 | `exam-service/.../ai-chat/ai-chat.service.ts:196,329` (repo `findMessagesByChatId`) | Every `sendMessage`/`streamMessage` loads the **entire** chat history, then `trimHistoryForAI` keeps only last 4. Cost grows forever with conversation length. | Add `findRecentMessages(chatId, n)`: `orderBy createdAt desc, take 5`, reverse in memory |
| H3 | `exam-service/.../examattempt/examattempt.service.ts:581` `getExamAttemptsByRoom` (distinctUser branch) | Host dashboard: unbounded `findMany` of all room attempts, dedup by userId + `slice` paginate in JS. Scales participants × retries, full set into memory every page. | Prisma `distinct:['userId']` + `orderBy` + `skip/take`; separate distinct count for total |
| H4 | `exam-service/.../student/student.service.ts:31-33` `getRecentFlashcards` | `include detailsFlashCard {select id}` for every set on a public feed just to read `.length` for `flashcardCount` — pulls thousands of card rows to count them. | `_count:{ select:{ detailsFlashCard:true } }` → read `set._count.detailsFlashCard` |

---

## MEDIUM

**In-memory aggregation / unbounded reads**
- `finance/.../wallettransaction.repository.ts:121` `getStatistics` → `findByWalletId(…,1000)` then JS sum. **Also a correctness bug**: hard `take:1000` makes totals silently wrong past 1000 tx. Fix: `groupBy(['direction'], {_sum:{amount},_count})`.
- `finance/.../sepay/payment.repository.ts:84` `getUserStatistics` — unbounded reads + JS sum (latent, no caller). Fix: `aggregate`/`groupBy(['status'])`.
- `exam/.../examattempt.service.ts:905` `getExamAttemptsBySession` (distinctUser) — same pattern as H3. Fix: `groupBy(['userId'], {_sum:{violationCount},_count})` then page.
- `exam/.../examattempt.service.ts:1499` `getHistoryStats` — loads every COMPLETED attempt to sum minutes in JS (5-min cache mitigates). Fix: SQL `SUM(EXTRACT(EPOCH FROM finishedAt-startedAt))`.
- `exam/.../examattempt.service.ts:1102` `createExamAttempt` (legacy) — `findAll(...).length` for a count; `countUserAttempts` already exists → use `count()`.
- `exam/.../examroom.service.ts:366` `getExamSessions` — `findMany distinct userId` across all sessions only to read `.length`. Fix: `groupBy(['userId'])` or `COUNT(DISTINCT)`.

**Sequential writes in a loop**
- `exam/.../quizset/quizset.service.ts:840-850` — N sequential `updateMany` in tx (scales quizzes × quizsetIds). Batch by `labelId`.
- `exam/.../flashcardset/flashcardset.service.ts:819-829` — same pattern in `saveHistoryToFlashcardSet`. Batch by `labelId`.

**O(n·m·k) in-memory scan**
- `exam/.../quizset/quizset.service.ts:780-787` (loop @739→773) — `existingQuestions.find(...)` re-scans array + recomputes `hashQuestion()` per iteration. Pre-build a `Map<"setId|hash", detail>`.
- `exam/.../flashcardset/flashcardset.service.ts:759-765` (loop @720→752) — same. Pre-index `Map<"setId|question|answer", detail>`.

**Missing pagination on detail/list**
- `exam/.../quizset.service.ts:124-156,245-271` `getQuizSetById`/`…PublicById` — include ALL questions, no `take` (paginated variant exists).
- `exam/.../flashcardset.service.ts:131-156,259-297` — same for cards.
- `exam/.../ai-chat.service.ts:154` `getMessages` — full message list, no pagination.
- `finance/.../sepay/payment.repository.ts:20` `findByUserId` — no `take/skip` (latent; live endpoint paginates elsewhere).
- `r2-service/src/r2-service.service.ts:180` `deleteDirectory` — one `DeleteObjectCommand` per object (use `DeleteObjectsCommand`, ≤1000/call) **and** `listFiles` caps at 1000 keys with no `ContinuationToken` → dirs >1000 objects silently under-deleted.

---

## LOW
- `exam/.../quizset.service.ts:656-698` & `flashcardset.service.ts:630-681` — sequential per-set label find/create (bounded by user input; parallelize if it grows).
- `exam/.../word-family/word-family.repository.ts:170-185,74-87` — `findMany` no pagination (Redis-cached, per-user/category).
- `exam/.../ai-chat.service.ts:726` `clearChat` — `findUnique` per documentId (N small; R2 delete is per-file anyway). Pre-load with one `findMany(in:)`.
- `finance/.../payment.repository.ts:36,53` `findPendingByUser`/`findPaidByUser` — no `take` (only feed the uncalled getUserStatistics).
- `admin/.../admin-users/admin-users.service.ts:224-238` `updateUser` — one audit `create` per changed field in a Serializable tx (≤5 fields). Use `createMany` (sibling `updateCategory` already does).
- `admin/.../admin-bootstrap/admin-bootstrap.service.ts:140-159` — `findUnique` per email in loop (bounded by env CSV, runs at init).

---

## Verified clean (checked, not flagged)
auth-service (all batch `updateMany`, bounded/cached reads) · gateway (pure proxy, bounded in-memory loops) · ocr-service · `cheatinglog.repository` (groupBy/aggregate + single include) · `admin-stats.service` (Promise.all count/aggregate, `$queryRaw` date_trunc GROUP BY, Map-join, cached) · `submitExamAttempt`/secure-quiz paths (single include + O(1) Map over bounded set) · `flashcard-study.getProgressBatch` (`in:` batch) · finance `paginateByWalletId`/`getPaymentHistory` (proper pagination).
