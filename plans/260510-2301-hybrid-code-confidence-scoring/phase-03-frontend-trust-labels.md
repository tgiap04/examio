# Phase 03 — Frontend Trust Labels

## Overview

Priority: High  
Status: completed

Cập nhật `/k/student-programming` để hiển thị rõ nguồn điểm: benchmark thật, synthetic tests, hoặc điểm ước lượng từ judge fallback.

## Context Links

- `src/apis/aiStudentApi.ts`
- `src/stores/useAIStudentStore.ts`
- `src/app/k/ai-student/page.tsx`

## Requirements

- Không hiển thị `llm_judge` như benchmark/testcase thật.
- Label rõ:
  - `benchmark`: “Chấm bằng benchmark”
  - `synthetic_tests`: “Chấm bằng rule fallback”
  - `llm_judge`: “Điểm tín nhiệm ước lượng”
  - `static_only`: “Điểm phân tích tĩnh”
  - `unavailable`: “Chưa đủ dữ liệu để chấm”
- Với `isEstimated=true`, hiển thị mô tả: “Không có benchmark/testcase chuẩn, điểm này được tính bằng phân tích code + AI judge.”
- Giữ UI hiện có, chỉ thay text/label/summary cần thiết.

## Implementation Steps

1. Mở rộng `AIStudentEvaluationResult` fields.
2. Cập nhật mapping trong store khi poll job.
3. Cập nhật `getEvaluationSummary` trong `src/app/k/ai-student/page.tsx`.
4. Cập nhật badge/label trong card evaluation để user biết điểm ước lượng.
5. Nếu có `issues/strengths` trong metadata/response thì có thể hiển thị ngắn; không cần UI phức tạp phase đầu.

## Success Criteria

- User luôn hiểu vì sao điểm được tính.
- Estimated score không bị nhầm là điểm test correctness.
- UI không bị vỡ với evaluation cũ không có fields mới.

## Risks

- Quá nhiều metadata có thể làm UI rối; phase đầu chỉ hiển thị label + summary.

## Todo

- [x] Extend FE type
- [x] Store mapping
- [x] Summary function
- [x] Evaluation card labels
