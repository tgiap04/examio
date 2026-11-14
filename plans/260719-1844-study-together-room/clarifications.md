# Clarifications

## Session 2026-07-19

- Q: Ai điều khiển timer/nhạc/video trong phòng? → A: Host + co-host được uỷ quyền
- Q: Nguồn nhạc và video lấy từ đâu? → A: YouTube cho cả nhạc lẫn video (YouTube IFrame API)
- Q: Phạm vi nền tảng lần đầu? → A: Chỉ web (kmaedu-fe), mobile để phase sau
- Q: Cách vào phòng và loại phòng? → A: Phòng riêng tư, join bằng mã mời 6 số, model StudyRoom mới tách khỏi ExamRoom
- Q: Lớp social nào cần ở bản đầu? → A: Live roster (học/nghỉ) + chat text + thống kê thời gian tập trung/leaderboard; KHÔNG WebRTC
- Q: Vòng đời và sức chứa phòng? → A: Phòng nhỏ ~10–20 người, bền theo host, host đóng/mở lại được
- Q: Transport real-time? → A: Path B — Socket.io/WebSocket (user chọn, khác khuyến nghị SSE của consultant)
- Q: Gateway chưa proxy được WS upgrade, đi hướng nào? → A: (a) Thêm WS upgrade proxy vào gateway-service, giữ một điểm vào duy nhất
- Q: Chat trong phòng lưu thế nào? → A: Ephemeral trong Redis (list có cap, mất khi phòng đóng) — KHÔNG tạo model StudyRoomMessage
- Q: Pomodoro có long-break không? → A: Có ngay từ đầu (longBreakMinutes + cyclesBeforeLongBreak)
