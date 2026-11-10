# Phase 02 — Backend Hybrid Judge Fallback

## Overview

Priority: Critical  
Status: completed

Thêm fallback chấm điểm không phụ thuộc dataset: static/sandbox signals + LLM judge rubric. Chỉ chạy khi benchmark và rule fallback không chấm được.

## Context Links

- `../kmaedu-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `../kmaedu-be/apps/ai-service/src/llm/model_manager.py`
- `../kmaedu-be/apps/ai-service/src/llm/llm_factory.py`
- `../kmaedu-be/apps/ai-service/src/backend/tests/test_student_programming_evaluation_service.py`

## Requirements

- Pipeline ưu tiên:
  1. benchmark testcase,
  2. rule-based fallback synthetic tests,
  3. LLM judge fallback,
  4. unavailable only nếu không có answer/code đủ để judge.
- LLM judge phải dùng backend provider hiện có, không gọi từ FE.
- Prompt judge phải yêu cầu JSON strict:
  - `score`: 0-100
  - `rationale`: ngắn, tiếng Việt
  - `issues`: list string
  - `strengths`: list string
- Score clamp 0-100; nếu parse JSON fail thì fallback static-only score.
- Không execute arbitrary generated tests ngoài sandbox hiện có.

## Proposed scoring rubric

- Correctness against prompt: 35
- Algorithm/logic quality: 25
- Edge cases: 15
- Readability/maintainability: 15
- Safety/performance: 10

## Static signals before LLM

- Có code block/extracted code hay không.
- Syntax/compile khả dụng nếu có thể kiểm tra an toàn.
- Có function/class/testable structure.
- Có xử lý edge cases trong content.
- Có I/O blocking pattern như `input()`/`cin >>` khiến sandbox khó chấm.

## Implementation Steps

1. Thêm helper `_build_static_judge_signals(question, answer, extracted_code, language)`.
2. Thêm helper async `_build_llm_judge_fallback(...)`.
3. Trong `_evaluate_answer`, sau `fallback_sample is None`, gọi LLM judge fallback trước `_build_unavailable_response`.
4. Thêm timeout ngắn cho LLM judge để không treo job.
5. Nếu LLM lỗi/timeout, trả `static_only` score thấp-vừa với rationale trung thực.
6. Thêm tests cho:
   - no benchmark + no rule + code answer → `llm_judge` hoặc `static_only`.
   - no code answer → `unavailable` hoặc low `static_only` tùy quyết định implementation.
   - benchmark/rule paths không đổi.

## Success Criteria

- Không còn phụ thuộc hoàn toàn vào dataset để có điểm tham khảo.
- Job vẫn completed nếu judge fallback chạy được.
- LLM failure không làm job failed nếu static fallback đủ dùng.

## Risks

- LLM judge có thể hallucinate điểm; phải label estimated.
- Chi phí/latency tăng; cần timeout và prompt ngắn.
- Security: không yêu cầu LLM sinh code test để execute.

## Todo

- [x] Static signals helper
- [x] LLM judge helper
- [x] Static-only fallback
- [x] Integrate into `_evaluate_answer`
- [x] Backend tests
