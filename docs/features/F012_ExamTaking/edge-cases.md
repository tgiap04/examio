# Edge Cases — F012_ExamTaking

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| No questions in the exam session | Error state with back button | "Bài thi này chưa có câu hỏi nào" |
| Network error during auto-save (30s interval) | Silent catch — request fails silently, quiz continues uninterrupted | None — silent handling |
| Tab switched away during exam | CheatingWarningModal appears, violation is logged | "Cảnh báo: Bạn đã chuyển tab" |
| Time limit reaches 30 seconds | Toast warning shown once | "Sắp hết thời gian! Còn 30 giây nữa sẽ tự động nộp bài" |
| Time limit reaches 0 | handleAutoSubmit fires, saves and submits, toast shown | "Đã hết thời gian — Bài thi đã được tự động nộp" |
| Submit with unanswered questions | Confirmation dialog shows count of unanswered | "Bạn mới trả lời X/Y câu hỏi. Bạn có chắc muốn nộp bài?" |
| Submit confirmed | Encrypted answers posted, results shown | "Nộp bài thành công!" |
| Tab closed before submit | sendBeacon fires final save to progress endpoint | (no message — silent) |
| Attempt already completed on load | Redirected directly to results view (no quiz UI) | "Đang xem kết quả" |
| Session access denied or invalid session | Error state with message | "Không thể bắt đầu bài thi" |
| 5 minutes remaining | Yellow warning panel appears in sidebar | "Còn 5 phút" (inline warning, no toast) |
| View past attempt with ?view=result&attemptId=X | Renders in isViewOnly mode — no quiz controls, just results | Results screen with "Đang xem kết quả" |
