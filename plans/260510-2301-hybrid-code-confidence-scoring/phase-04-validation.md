# Phase 04 — Validation

## Overview

Priority: High  
Status: completed

Xác thực đầy đủ các nhánh chấm điểm để đảm bảo benchmark thật, synthetic tests, LLM judge fallback và unavailable được phân biệt đúng ở cả backend response và frontend UI.

## Context Links

- `phase-01-contract-and-metadata.md`
- `phase-02-backend-hybrid-judge.md`
- `phase-03-frontend-trust-labels.md`
- `src/apis/aiStudentApi.ts`
- `src/stores/useAIStudentStore.ts`
- `src/app/k/ai-student/page.tsx`
- `../examio-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `../examio-be/apps/ai-service/src/backend/tests/test_student_programming_evaluation_service.py`

## Requirements

- Backend tests phải cover đủ các source:
  - `benchmark`
  - `synthetic_tests`
  - `llm_judge` hoặc `static_only`
  - `unavailable`
- FE build phải pass sau khi thêm fields mới.
- UI không vỡ với evaluation cũ không có `scoreSource`, `isEstimated`, `confidenceLevel`.
- Không có case `llm_judge` bị hiển thị như benchmark/testcase thật.

## Implementation Steps

1. Chạy test backend cho evaluator sau khi phase 01–02 hoàn tất.
2. Chạy build/lint frontend sau khi phase 03 hoàn tất.
3. Test thủ công `/k/student-programming` với ít nhất 3 tình huống:
   - câu hỏi match benchmark,
   - câu hỏi match rule fallback,
   - câu hỏi không có dataset/rule nhưng có code answer.
4. Kiểm tra response job trong network tab có metadata đúng.
5. Kiểm tra copy UI hiển thị đúng label và summary cho estimated score.
6. Ghi lại limitation nếu LLM judge timeout và rơi về `static_only`.

## Validation Commands

Frontend:

```bash
cd /Users/tgiap.dev/devs/kma-edu/examio-fe
yarn build
yarn lint
```

AI service:

```bash
cd /Users/tgiap.dev/devs/kma-edu/examio-be/apps/ai-service
./venv/bin/pytest src/backend/tests/test_student_programming_evaluation_service.py
```

## Success Criteria

- Benchmark path giữ `scoreSource=benchmark`, `isEstimated=false`, `confidenceLevel=high`.
- Rule fallback path giữ `scoreSource=synthetic_tests`, `isEstimated=false`, `confidenceLevel=medium`.
- No benchmark/rule but code answer trả `scoreSource=llm_judge` hoặc `static_only`, không trả `unavailable` nếu còn đủ dữ liệu judge.
- `unavailable` chỉ xuất hiện khi không đủ answer/code để judge trung thực.
- FE label và summary làm rõ điểm nào là ước lượng.
- Build/lint FE và evaluator tests pass.

## Risks

- Local venv có thể thiếu dependency test; nếu vậy cần ghi rõ blocker thay vì bỏ qua validation.
- LLM judge phụ thuộc provider backend nên test unit nên mock provider boundary, không gọi network thật.

## Limitations

- Chưa chạy manual browser/network validation trong phiên này; cần kiểm tra `/k/student-programming` khi dev server đang chạy.
- `yarn lint` pass với 0 errors nhưng còn warnings cũ từ AntD adapter migration.

## Todo

- [x] Backend evaluator tests
- [x] FE build
- [x] FE lint
- [ ] Manual UI/network validation
- [x] Record limitations
