---
name: hybrid-code-confidence-scoring
status: completed
created: 2026-05-10
blockedBy: []
blocks: []
---

# Hybrid code confidence scoring không phụ thuộc dataset

## Mục tiêu

Mở rộng chấm điểm tín nhiệm cho `/k/student-programming` để vẫn trả được điểm tham khảo khi không có benchmark/dataset phù hợp, nhưng không đánh tráo điểm ước lượng thành điểm testcase thật.

## Context hiện tại

- FE gọi `POST /ai/tutor/student-programming/evaluate` qua `src/apis/aiStudentApi.ts`.
- Gateway/exam-service chỉ proxy request sang Python AI service.
- Logic chính nằm ở `kmaedu-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`.
- Hiện có 3 tầng:
  1. benchmark imported/smoke samples,
  2. `rule_based_fallback` cho vài bài pure-function đơn giản,
  3. `unavailable` nếu không match dataset/rule.

## Recommendation

Giữ benchmark là nguồn điểm mạnh nhất. Thêm fallback mới `llm_judge` sau rule-based fallback, dùng static/sandbox signals + LLM judge rubric để chấm ước lượng.

## Phases

| Phase | File | Status | Mục tiêu |
|---|---|---|---|
| 01 | [phase-01-contract-and-metadata.md](phase-01-contract-and-metadata.md) | completed | Chuẩn hóa response metadata cho nguồn điểm |
| 02 | [phase-02-backend-hybrid-judge.md](phase-02-backend-hybrid-judge.md) | completed | Thêm static/sandbox/LLM judge fallback |
| 03 | [phase-03-frontend-trust-labels.md](phase-03-frontend-trust-labels.md) | completed | FE hiển thị rõ benchmark vs estimated score |
| 04 | [phase-04-validation.md](phase-04-validation.md) | completed | Test các nhánh benchmark/rule/judge/unavailable |

## Non-goals

- Không bỏ benchmark/dataset hiện có.
- Không gọi AI provider trực tiếp từ FE.
- Không claim điểm LLM judge là correctness tuyệt đối.
- Không sinh testcase động để execute code không kiểm soát ngoài sandbox hiện có.

## Success criteria

- Nếu match benchmark: vẫn dùng testcase benchmark và `scoreSource=benchmark`.
- Nếu match rule fallback: vẫn dùng synthetic tests và `scoreSource=synthetic_tests`.
- Nếu không có dataset/rule nhưng có answer/code: trả điểm ước lượng `scoreSource=llm_judge`, `isEstimated=true`.
- FE hiển thị cảnh báo/label rõ: “Điểm tín nhiệm ước lượng”.
- Build/lint FE pass; AI service tests cho evaluator pass.

## Cook command

```bash
/cook /Users/tgiap.dev/devs/kma-edu/plans/260510-2301-hybrid-code-confidence-scoring/plan.md
```
