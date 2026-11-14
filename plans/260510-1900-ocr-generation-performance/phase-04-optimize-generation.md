# Phase 04 — Optimize Quiz and Flashcard Generation

## Context Links
- `../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`
- `../kmaedu-be/apps/ai-service/src/llm/llm_factory.py`
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py`

## Overview
Priority: high  
Status: implemented  
Reduce wall-clock generation time by tuning batching and bounded concurrency while preserving output quality.

## Key Insights
- `MAX_ITEMS_PER_CALL = 6`, so larger quiz/flashcard requests become multiple LLM calls.
- `DEFAULT_GENERATION_MAX_CONCURRENCY = 1`, so those calls are sequential unless `GENERATION_MAX_CONCURRENCY` is set.
- Generation already builds task lists and runs them through `_run_generation_tasks()`, so concurrency support exists.
- More concurrency can improve wall-clock but may overload the model runtime or reduce output consistency.

## Requirements
- Make generation concurrency intentionally configured per deployment, not accidentally serial.
- Keep item allocation and group merging behavior intact unless quality evaluation says otherwise.
- Avoid increasing prompt size beyond model context limits.
- Keep errors explicit when model runtime is unavailable or out of VRAM.

## Related Code Files
Modify:
- `../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`

Read:
- `../kmaedu-be/apps/ai-service/src/llm/model_registry.py`
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py`

## Implementation Steps
1. Benchmark `GENERATION_MAX_CONCURRENCY=1`, `2`, and `3` for same model, file, and item count.
2. If safe, raise the default to `2` or document required env for production.
3. Review `MAX_ITEMS_PER_CALL`; test whether `8` reduces calls without hurting quality or causing JSON parse failures.
4. Keep `_run_generation_tasks()` bounded by semaphore and preserve ordered aggregation.
5. Add per-batch timing logs with batch size, group index, model id, and elapsed ms.
6. If generation often returns fewer items than requested, add a measured retry-for-shortfall path only after confirming it does not double latency in common cases.

## Todo List
- [ ] Benchmark generation concurrency candidates.
- [ ] Benchmark `MAX_ITEMS_PER_CALL` candidates.
- [ ] Add per-batch timing if missing.
- [ ] Choose safe default/env recommendation.
- [ ] Verify output quality and JSON parse reliability.

## Success Criteria
- Quiz/flashcard generation p50 improves by at least 30% for multi-batch requests.
- p95 does not regress due to model overload.
- Generated item count and schema validity remain stable.
- Runtime errors remain user-visible and do not reintroduce endless polling.

## Risk Assessment
- Higher concurrency can create GPU/CPU contention and slower p95.
- Larger item batches can reduce LLM answer quality or increase malformed JSON.

## Security Considerations
- Do not log full prompts or generated sensitive document excerpts.

## Next Steps
Proceed to Phase 05 after selecting safe generation defaults.
