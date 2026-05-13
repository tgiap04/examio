# Phase 01 — Contract and Metadata

## Overview

Priority: Critical  
Status: completed

Chuẩn hóa contract evaluation để FE phân biệt điểm testcase thật và điểm ước lượng.

## Context Links

- `src/apis/aiStudentApi.ts`
- `src/app/k/ai-student/page.tsx`
- `../examio-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `../examio-be/apps/ai-service/src/backend/services/student_programming_chat_service.py`

## Requirements

- Thêm metadata vào evaluation response:
  - `scoreSource`: `benchmark | synthetic_tests | llm_judge | static_only | unavailable`
  - `isEstimated`: boolean
  - `confidenceLevel`: `high | medium | low`
- Giữ backward compatibility với `scorePhase`, `isFinal`, `benchmark` hiện có.
- FE type `AIStudentEvaluationResult` phải phản ánh field mới.

## Implementation Steps

1. Cập nhật Python result dict ở các nhánh:
   - benchmark matched → `scoreSource=benchmark`, `isEstimated=false`, `confidenceLevel=high`
   - rule fallback → `scoreSource=synthetic_tests`, `isEstimated=false`, `confidenceLevel=medium`
   - unavailable → `scoreSource=unavailable`, `isEstimated=false`, `confidenceLevel=low`
2. Cập nhật TypeScript interface trong `src/apis/aiStudentApi.ts`.
3. Cập nhật store mapping trong `src/stores/useAIStudentStore.ts` để giữ fields mới khi poll job.

## Success Criteria

- Existing UI không vỡ khi backend chưa trả field mới.
- Polling evaluation giữ đủ metadata mới.

## Risks

- Metadata đang lưu trong DB dạng JSON; cần đảm bảo `attach_evaluation_to_message` không drop field.

## Todo

- [x] Backend result fields
- [x] FE interface
- [x] Store mapping
