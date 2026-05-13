# Phase 2 — Frontend trust-score UX

## Context Links
- `examio-fe/src/apis/aiStudentApi.ts`
- `examio-fe/src/stores/useAIStudentStore.ts`
- `examio-fe/src/app/k/ai-student/page.tsx`

## Overview
- Priority: High
- Status: Pending
- Mục tiêu: hiển thị quick score rất sớm nhưng không đánh lừa người dùng rằng đó là kết quả cuối.

## Key Insights
- UI card đánh giá đã tồn tại; chỉ cần mở rộng thay vì làm component mới hoàn toàn.
- Store đang poll mỗi 1.5s; đủ cho bản đầu, chưa cần SSE riêng cho evaluation.
- `message.evaluationJob.status` và `message.isEvaluating` đã có thể tận dụng để hiển thị tiến trình.

## Requirements
- Hiển thị nhãn rõ: `Điểm tạm thời` / `Điểm cuối cùng`.
- Khi quick score có rồi, card phải render ngay cả khi job vẫn đang chạy.
- Nút `Tính tín nhiệm` cần tránh spam và duplicate jobs.

## Architecture
- API typing mở rộng để đọc thêm `scorePhase`, `isFinal`, `quickRationale`, `metadata.stage`.
- Store coi mọi phản hồi poll có `score !== undefined` là partial result hợp lệ.
- Page render card theo 3 trạng thái:
  1. chưa có score,
  2. có quick score và đang deep-check,
  3. final completed.

## Related Code Files
### Modify
- `examio-fe/src/apis/aiStudentApi.ts`
- `examio-fe/src/stores/useAIStudentStore.ts`
- `examio-fe/src/app/k/ai-student/page.tsx`

### Create
- Không tạo file mới nếu card hiện tại vẫn chịu được.

### Delete
- None.

## Implementation Steps
1. Mở rộng `AIStudentEvaluationResult` và poll result typing.
2. Sửa `evaluateMessage()` để lưu partial evaluation khi job đang `running` nhưng đã có quick score.
3. Đổi copy UI:
   - `Đang chấm...` -> `Đã có điểm tạm, đang kiểm tra sâu...`
   - badge `score/100` kèm label phase.
4. Hiển thị rationale đúng theo phase.
5. Chỉ hiện final benchmark block khi `isFinal === true` hoặc `status === completed`.
6. Giữ fallback cũ nếu backend chưa trả field mới.

## Todo List
- [ ] Update API types
- [ ] Save partial score in Zustand polling loop
- [ ] Distinguish temporary vs final score in UI
- [ ] Prevent duplicate evaluation requests
- [ ] Verify existing evaluation card still readable on mobile

## Success Criteria
- User thấy điểm tạm mà không phải chờ full evaluation xong.
- Khi final score về, card tự cập nhật đúng.
- Không thêm route mới ở frontend.

## Risk Assessment
- Nếu label không rõ, user sẽ hiểu nhầm quick score là final.
- Polling update có thể overwrite partial state sai thứ tự.

## Security Considerations
- Không render raw stderr/stdout thiếu escape ngoài component hiện tại.
- Không tin tưởng field từ API ngoài các type mong đợi.

## Next Steps
Sau khi frontend ổn, đo perceived latency và tuning polling/backoff nếu cần.
