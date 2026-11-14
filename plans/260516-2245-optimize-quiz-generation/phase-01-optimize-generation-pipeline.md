# Phase 1: Optimize Generation Pipeline

## Context

- [generation_service.py](../../kmaedu-be/apps/ai-service/src/backend/services/generation_service.py)
- [hybrid_retrieval_service.py](../../kmaedu-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py)

## Overview

- **Priority:** High
- **Status:** Pending
- **Effort:** 1-2 ngày

Bottleneck chính: LLM generation gọi nhiều batch (MAX_ITEMS_PER_CALL=6, concurrency=2). Với 10 câu → 2 batches tuần tự. Tăng batch size + concurrency → giảm 50%+ thời gian.

## Key Insights

- Prompt size: ~270 tokens static + ~500 tokens/chunk = ~770 tokens input
- Output cho 6 items: ~600-900 tokens → cho 10-12 items: ~1000-1800 tokens (vẫn trong max_tokens=4096)
- Models hiện tại không có context window limit enforce → safe để tăng batch
- Concurrency bị cap ở 3 (`DEFAULT_GENERATION_MAX_CONCURRENCY_CAP=3`)

## Requirements

### Functional
- Sinh 10 câu quiz trong 1 LLM call thay vì 2
- Sinh 20+ câu vẫn chạy parallel hiệu quả hơn

### Non-functional
- Không giảm quality output
- Backward compatible (env vars override vẫn hoạt động)

## Related Code Files

### Modify
- `kmaedu-be/apps/ai-service/src/backend/services/generation_service.py`

### Read (context)
- `kmaedu-be/apps/ai-service/src/llm/model_manager.py`
- `kmaedu-be/apps/ai-service/src/backend/utils/prompt_utils.py`

## Implementation Steps

### 1. Tăng MAX_ITEMS_PER_CALL: 6 → 12

```python
# generation_service.py
MAX_ITEMS_PER_CALL = 12  # was 6
```

Lý do: Output 12 items ≈ 1800 tokens, vẫn trong budget 4096 max_tokens. Giảm số batch calls 50%.

### 2. Tăng DEFAULT_GENERATION_MAX_CONCURRENCY: 2 → 3

```python
DEFAULT_GENERATION_MAX_CONCURRENCY = 3  # was 2
```

### 3. Tăng DEFAULT_GENERATION_MAX_CONCURRENCY_CAP: 3 → 5

```python
DEFAULT_GENERATION_MAX_CONCURRENCY_CAP = 5  # was 3
```

Cho phép env var `GENERATION_MAX_CONCURRENCY=5` hoạt động khi cần.

### 4. Optimize prompt cho batch lớn hơn

Thêm instruction rõ ràng hơn trong prompt để LLM không bị confused khi sinh 10-12 items cùng lúc:
- Nhấn mạnh "generate EXACTLY N items"
- Giảm verbose instructions (tiết kiệm tokens)

### 5. Tăng MAX_SOURCE_CHUNKS: 8 → 10

```python
MAX_SOURCE_CHUNKS = 10  # was 8
```

Cho phép retrieval lấy nhiều context hơn → ít trùng lặp câu hỏi giữa các batch.

## Todo

- [ ] Update `MAX_ITEMS_PER_CALL` → 12
- [ ] Update `DEFAULT_GENERATION_MAX_CONCURRENCY` → 3
- [ ] Update `DEFAULT_GENERATION_MAX_CONCURRENCY_CAP` → 5
- [ ] Update `MAX_SOURCE_CHUNKS` → 10
- [ ] Test với 10 câu quiz → verify 1 batch call
- [ ] Test với 20 câu quiz → verify parallel batches
- [ ] Benchmark trước/sau: log `[AI_TIMING]` so sánh

## Success Criteria

- 10 câu quiz: 1 LLM call (thay vì 2)
- 20 câu quiz: 2 LLM calls parallel (thay vì 4 calls, 2 sequential rounds)
- Thời gian giảm 40-60%

## Risk Assessment

- **Risk:** LLM output quality giảm khi sinh 12 items cùng lúc
  - **Mitigation:** Meta-document retry logic vẫn hoạt động, structured output validation vẫn enforce
- **Risk:** Rate limit khi concurrency cao
  - **Mitigation:** Cap vẫn có, retry logic với backoff đã có sẵn
