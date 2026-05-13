---
title: "Student Programming Trust Score"
description: "Improve the existing student-programming evaluation into a fast trust score plus deeper asynchronous verification"
status: pending
priority: P1
effort: 6h
branch: main
tags: [ai, student-programming, trust-score, performance]
created: 2026-04-19
blockedBy: []
blocks: []
---

# Student Programming Trust Score

## Goal
Nâng tính năng `Tính tín nhiệm` hiện có thành mô hình 2 tầng: trả quick score sớm, sau đó cập nhật deep evaluation khi backend hoàn tất.

## Current State
- Frontend đã có nút `Tính tín nhiệm` và UI hiển thị kết quả.
- Backend đã có evaluation job async, polling, benchmark matching, sandbox execution.
- Điểm hiện tại gần như chỉ phản ánh benchmark/rule execution, chưa tách rõ quick vs deep, chưa tối ưu UX cho perceived latency.

## Decision
Giữ kiến trúc async hiện tại, không thêm pipeline mới. Chỉ mở rộng payload + stage + UI để:
1. trả **quick trust score** rất sớm,
2. tiếp tục **deep verification** ở background,
3. cập nhật lại cùng một evaluation card.

## Phases
- [Phase 1](./phase-01-backend-trust-score-contract.md) — Chuẩn hóa contract quick/deep score ở backend.
- [Phase 2](./phase-02-frontend-trust-score-ux.md) — Cập nhật store/UI để hiển thị điểm tạm thời và tiến trình.
- [Phase 3](./phase-03-validation-and-rollout.md) — Kiểm thử, đo thời gian phản hồi, tinh chỉnh ngưỡng.

## Key Files
- `examio-be/apps/ai-service/src/backend/services/student_programming_evaluation_service.py`
- `examio-be/apps/ai-service/src/backend/api/tutor.py`
- `examio-be/apps/exam-service/src/modules/ai/ai.controller.ts`
- `examio-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`
- `examio-fe/src/apis/aiStudentApi.ts`
- `examio-fe/src/stores/useAIStudentStore.ts`
- `examio-fe/src/app/k/ai-student/page.tsx`

## Risks
- UX nhầm quick score là final score.
- Quick score lệch nhiều với deep score nếu heuristic quá đơn giản.
- Polling dày làm tăng load nếu nhiều người dùng chấm cùng lúc.

## Success Criteria
- Người dùng thấy trạng thái đánh giá ban đầu trong ~1-3s ở trường hợp phổ biến.
- Deep evaluation vẫn giữ sandbox/benchmark hiện tại.
- UI phân biệt rõ `tạm thời` và `cuối cùng`.
- Không phá vỡ API/session/message flow hiện có.

## Notes
Không tạo service riêng hoặc queue riêng nếu chưa cần. Tái dùng evaluation job hiện có để giữ diff nhỏ, dễ ship.
