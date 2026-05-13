# Phase 1 — Backend trust-score contract

## Context Links
- `examio-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `examio-be/apps/ai-service/src/backend/api/tutor.py`
- `examio-be/apps/exam-service/src/modules/ai/ai.controller.ts`
- `examio-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`

## Overview
- Priority: High
- Status: Pending
- Mục tiêu: mở rộng evaluation job hiện có để xuất được quick score trước, deep score sau.

## Key Insights
- `create_job()` + `_run_job()` đã async sẵn, phù hợp để thêm stage.
- Frontend đang poll `status` và `metadata.stage`, nên có thể tận dụng thay vì thêm endpoint mới.
- Điểm hiện tại chủ yếu đến từ benchmark/rule execution; đó nên là phần `deep`.

## Requirements
- Thêm các field phản ánh 2 tầng đánh giá: `quickScore`, `finalScore` hoặc `scorePhase`, `scoreLabel`, `isFinal`.
- Quick score phải tính rất nhanh, không phụ thuộc benchmark import nặng hoặc sandbox dài.
- Deep evaluation vẫn giữ benchmark/rule-based fallback hiện tại.

## Architecture
1. Khi job bắt đầu, backend chạy bước `quick-assessment`:
   - detect language
   - extract code block
   - kiểm tra testability
   - optional syntax/structure heuristics nhẹ
   - optional benchmark signal strength
2. Ghi ngay kết quả tạm vào job metadata.
3. Tiếp tục bước benchmark/sandbox hiện tại.
4. Khi xong, ghi đè/hoàn tất bằng final score.

## Related Code Files
### Modify
- `examio-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `examio-be/apps/ai-service/src/backend/api/tutor.py`
- DTO/typing liên quan ở exam-service nếu cần

### Create
- Không tạo file mới nếu chưa cần.

### Delete
- None.

## Implementation Steps
1. Thiết kế shape kết quả thống nhất cho job status:
   - `score`
   - `scorePhase: quick | final`
   - `isFinal: boolean`
   - `subscores` nếu thực sự cần
2. Thêm hàm quick assessment thuần Python, không gọi LLM:
   - syntax/testability
   - function signal match
   - benchmark candidate confidence
3. Ở `_run_job()`, cập nhật job sang stage `quick-assessment-completed` trước khi vào sandbox.
4. Giữ `score` là giá trị hiển thị hiện tại; khi final xong thì overwrite bằng final score để tránh phá frontend cũ.
5. Bổ sung `quickRationale`/`rationale` để frontend giải thích rõ đây là điểm tạm hay điểm cuối.
6. Rà timeout/polling assumptions để tránh trường hợp quick score không được flush sớm.

## Todo List
- [ ] Chốt contract response tương thích ngược
- [ ] Implement quick assessment
- [ ] Update job stage transitions
- [ ] Preserve deep benchmark evaluation
- [ ] Verify exam/gateway passthrough không cần đổi hoặc chỉ đổi typing tối thiểu

## Success Criteria
- Poll đầu tiên hoặc vài poll đầu đã có dữ liệu quick score.
- Final score vẫn dựa trên benchmark/sandbox như trước.
- API cũ không bị break.

## Risk Assessment
- Heuristic quá yếu -> quick score vô nghĩa.
- Ghi đè `score` sai timing -> frontend nhảy trạng thái khó hiểu.

## Security Considerations
- Không nới sandbox policy.
- Không chạy thêm code ngoài sandbox chỉ để lấy quick score.

## Next Steps
Frontend sẽ dùng `scorePhase`/`isFinal` để render card 2 trạng thái.
