# Phase 3 — Validation and rollout

## Context Links
- `examio-be/apps/ai-service/src/backend/tests/test_student_programming_evaluation_service.py`
- `examio-fe/src/app/k/ai-student/page.tsx`
- `examio-fe/src/stores/useAIStudentStore.ts`

## Overview
- Priority: Medium
- Status: Pending
- Mục tiêu: chứng minh cải thiện tốc độ cảm nhận mà không làm giảm độ tin cậy deep evaluation.

## Key Insights
- Repo đã có test backend cho evaluation service.
- Frontend không có test script rõ ràng; validation chính sẽ là build + manual golden path.
- Đây là thay đổi UX + contract, nên regression dễ nằm ở polling/state transition.

## Requirements
- Có case quick score xuất hiện sớm.
- Có case final score update đúng sau đó.
- Có case unavailable vẫn hiển thị rõ lý do.

## Architecture
- Backend: thêm/điều chỉnh unit tests cho phase transitions và response shape.
- Frontend: manual test trên trang `/k/student-programming`.
- Performance: log thời gian từ click đến quick score, và từ click đến final score.

## Related Code Files
### Modify
- test backend hiện có nếu cần

### Create
- Không bắt buộc.

### Delete
- None.

## Implementation Steps
1. Update backend tests cho:
   - quick assessment available
   - no benchmark -> unavailable
   - final score overwrites quick score correctly
2. Chạy backend test mục tiêu cho evaluation service.
3. Chạy frontend build để bắt type error.
4. Manual test các luồng:
   - bài Python đơn giản có fallback
   - bài C++ match benchmark
   - câu trả lời dạng snippet không testable
5. Ghi nhận thời gian phản hồi quick/final và chỉnh poll interval nếu cần.

## Todo List
- [ ] Add/update backend tests
- [ ] Run targeted backend tests
- [ ] Run frontend build
- [ ] Manual verify page behavior
- [ ] Tune labels/intervals if UX còn chậm

## Success Criteria
- Quick score xuất hiện trong ~1-3s ở case phổ biến.
- Final score không mất dữ liệu benchmark hiện tại.
- Build frontend pass.
- Không có regression ở flow chat/generate hiện tại.

## Risk Assessment
- Môi trường local thiếu benchmark data có thể làm validation không ổn định.
- Nếu queue worker không chạy, chỉ test được partial path.

## Security Considerations
- Không tắt sandbox/timeouts để ép test pass.
- Không dùng fake result để mô phỏng quick score trong production path.

## Next Steps
Nếu UX tốt, có thể cân nhắc round 2: push update bằng SSE/WebSocket thay cho polling. Chưa làm ở round này.
