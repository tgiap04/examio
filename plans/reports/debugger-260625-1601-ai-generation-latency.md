# Debug Report — AI Data-Generation Latency (OCR / Embedding / Generate)

> Date: 2026-06-25 · Scope: `examio-be/apps/ai-service` (Python FastAPI) + `exam-service` orchestration
> Verdict: User's intuition is correct — **LLM is fast; the flow/algorithm is the bottleneck.** Root cause proven below with file:line evidence.

## Executive Summary

The slow "time-to-first-content" is **NOT** the LLM. It is dominated by work that runs *before* the LLM is even called, plus low concurrency once it is. Two issues account for most of the wall-clock:

1. **[CRITICAL] Graph build re-embeds the entire document synchronously, blocking the async event loop** — on every cold-cache generation request. The chunks were already embedded during OCR; the graph build embeds them *again*, one-by-one, with blocking calls.
2. **[HIGH] LLM batch concurrency is capped at 3** (hard cap 5). Even though the LLM is fast per call, batches serialize 3-at-a-time.

Secondary: PDF OCR runs sync in the event loop; httpx client recreated per LLM call; sync graph BFS; redundant per-request DB queries.

## Pipeline shape (proven)

`exam-service` makes **two sequential blocking HTTP calls** (`ai.service.ts:601`, `ai.service.ts:646`):
```
POST /ai/process-file   → OCR + chunk + embed + store        (ocr_ms)
POST /generate/quiz     → retrieve(+graph build) + LLM gen    (generation_ms)
```
The `generation_ms` stage internally splits into **retrieval (incl. graph build)** then **LLM generation**. The user sees the LLM "take long to start" because graph build sits *inside* `generation_ms` before any LLM token.

---

## Root Cause #1 — Synchronous full-document re-embed during graph build (CRITICAL)

**Trigger:** `hybrid_retrieval_service.py:544` → `_build_graph_cache_entry` (runs whenever memory cache + DB persisted state both miss — i.e. first generation after restart, or new doc).

**The blocking chain:**
- `hybrid_retrieval_service.py:488` — `builder._add_semantic_edges(documents)` called **with no `run_in_executor`/`to_thread`** inside an `async def`.
- `graph_builder.py:178-193` — `_add_semantic_edges` loops and calls `self.embeddings.embed_documents(batch)`.
- `gemini_embeddings.py:138-139`:
  ```python
  def embed_documents(self, texts):
      return [self._embed_sync(text[:self.embed_max_length], "retrieval_document") for text in texts]
  ```
  A **synchronous list comprehension** of blocking `_embed_sync` (`gemini_embeddings.py:110`) calls — one network round-trip per chunk, **on the event loop thread**.
- Then `partition_by_community_detection` (`hybrid_retrieval_service.py:491`) runs Louvain (CPU-bound, sync).

**Why it's slow:** A 69-chunk document (your log: `chunks=69`) makes ~69 blocking embedding round-trips *again* (already embedded during OCR), while freezing the whole event loop — no other request progresses. This is `[AI_TIMING] stage=graph_build` and is the dominant pre-LLM delay.

**Fix direction (ordered):**
1. **Don't re-embed.** Chunks were embedded during OCR and stored in pgvector. Load those vectors for graph build instead of calling the embedding API again. (Biggest win, removes N network calls.)
2. If re-embed is unavoidable, use the existing **async** `create_embeddings_batch` (`gemini_embeddings.py:162`, already gather+semaphore) instead of sync `embed_documents`.
3. Wrap the whole `_build_graph_cache_entry` body (esp. Louvain) in `await asyncio.to_thread(...)` so it never blocks the loop.
4. **Warm the graph asynchronously right after OCR completes** (background `asyncio.create_task`) so it's ready before the user requests generation — turns a cold build into a cache hit.

---

## Root Cause #2 — LLM batch concurrency capped at 3 (HIGH)

**Evidence:** `generation_service.py:138-141`
```python
MAX_SOURCE_CHUNKS = 10
MAX_ITEMS_PER_CALL = 12
DEFAULT_GENERATION_MAX_CONCURRENCY = 3
DEFAULT_GENERATION_MAX_CONCURRENCY_CAP = 5
```
`_get_generation_max_concurrency` (`:324-350`) clamps to `min(3, cap=5)=3`. The semaphore (`generation_service.py:461`) lets only **3 LLM batches run at once**. For 100 questions → ceil(100/12)=9 batches → 3 serialized rounds even though each LLM call is fast.

**Fix direction:** Raise `DEFAULT_GENERATION_MAX_CONCURRENCY` to ~6–10 and `_CAP` to ~15 (LLM calls are IO-bound). Tune via `GENERATION_MAX_CONCURRENCY` env. Confirm the Faye-AI server's rate limit first to avoid 429s.

---

## Secondary findings

| # | Sev | Issue | Evidence | Fix |
|---|-----|-------|----------|-----|
| 3 | HIGH | PDF OCR (pdf2image @300dpi + Tesseract + OpenCV) runs **sync in event loop**; pages & chunks processed sequentially | `pdf_ocr_service.py:189,210-236,320-336` called un-awaited at `ocr_service.py:368` | `asyncio.to_thread` + parallelize per-page over a `ProcessPoolExecutor` |
| 4 | MED | External OCR call uses sync `requests.post(timeout=300)` blocking loop | `pdf_ocr_service.py:152` | switch to `httpx.AsyncClient` await |
| 5 | MED | `httpx.AsyncClient` created **fresh per LLM batch** → new TCP+TLS each call (~50–200ms each) | `model_manager.py:458` (and `:254`) | create one client at `ModelManager` init, reuse |
| 6 | LOW | Sync NetworkX BFS on event loop | `hybrid_retrieval_service.py:593` | offload via `run_in_executor` |
| 7 | LOW | `_enrich_groups_with_entities` does 2 DB queries every request | `hybrid_retrieval_service.py:768-769,873-904` | cache for graph-cache TTL |
| 8 | LOW | N+1 per-row insert in DB store **fallback** path only | `vector_store_pg.py:226-229,247-255` | low priority (primary path batches OK) |

---

## Verify with real logs (grep markers)

Pull these from a real run to rank fixes by measured ms:
```
grep -E "AI_TIMING|AI_RETRIEVAL|AI_GROUPS" <exam-service+ai-service logs>
```
Key stages to compare:
- `stage=ocr_ms` (exam-service) — OCR+embed+store total
- `stage=graph_build … elapsed_ms=` — **expect this large on cold cache (RC#1)**
- `stage=graph_cache … elapsed_ms=0` — warm hit (what we want)
- `stage=generation_ms` (exam-service) vs sum of `stage=generation_batch` — gap = retrieval/graph overhead
- `stage=quiz_generation_config … generation_max_concurrency=3` — confirms RC#2

> **Recommendation:** Fix RC#1 (don't re-embed + background-warm) and RC#2 (raise concurrency) first — together they target the exact symptom ("long before LLM starts"). Get one real `[AI_TIMING]` dump to confirm the split before implementing, so we measure the win.

## Unresolved questions
1. What is the Faye-AI server's concurrent-request / rate limit? (needed to safely raise RC#2 concurrency)
2. Are OCR-time embeddings retrievable cheaply for graph build, or does the graph need a different embedding task_type? (determines RC#1 fix #1 vs #2)
3. Typical document size (pages/chunks) in production — to weight OCR (RC#3) vs graph (RC#1).
