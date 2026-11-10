# Study Report: AI giám sát phòng thi (khuôn mặt, tư thế, buồn ngủ)

Ngày: 2026-11-10 · 5 lượt tìm kiếm · nguồn 2022–2025

## Summary
Khả thi trong phạm vi đồ án nếu chạy **trên trình duyệt** bằng MediaPipe Face Landmarker: phát hiện không có mặt / nhiều mặt, quay đầu/nhìn ra ngoài (head pose), nhắm mắt lâu (buồn ngủ). Chỉ gửi **sự kiện** (không gửi video) vào `CheatingLog` sẵn có của assessment-service. Không làm "nhận diện danh tính" (face recognition) — đó là dữ liệu sinh trắc học nhạy cảm theo Nghị định 13/2023. Kết quả chỉ là **cảnh báo để giáo viên xem**, không tự đánh trượt (tỉ lệ báo nhầm là rủi ro đã được ghi nhận).

## Key Findings
1. **Công nghệ**: MediaPipe Face Landmarker (npm `@mediapipe/tasks-vision`) chạy web, LIVE_STREAM, nhiều mặt, 52 blendshapes (có eyeBlink), ma trận biến đổi 4×4 để suy yaw/pitch/roll; cờ `outputFaceBlendshapes`, `outputFacialTransformationMatrixes` mặc định tắt. Kalidokit đã deprecated. [Google docs](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [tutorial](https://medium.com/@kenzic/real-time-face-tracking-in-the-browser-with-mediapipe-7c818c96b4ca) · [head pose](https://medium.com/@susanne.thierfelder/head-pose-estimation-with-mediapipe-and-opencv-in-javascript-c87980df3acb)
2. **Dự án tham khảo**: ProctorAI (TF.js + MediaPipe, head pose) [repo](https://github.com/jeeva5655/ProctorAI); `@sdcams/proctor` (no/multi face, gaze, yaw; MIT; ngưỡng 20°/25°) [pkg](https://www.pkgstats.com/pkg:@sdcams/proctor); iExam (2022): phát hiện mặt realtime 90.4%, nhận diện sau thi 98.4% [arXiv](https://arxiv.org/pdf/2206.13356v3). Chưa kiểm hoạt động bảo trì — dùng làm tham khảo, tự viết logic.
3. **Buồn ngủ**: EAR ~0.25 qua nhiều khung hình, ~92% trên 10 người (preprint 11/2025), giảm khi thiếu sáng / kính phản quang. PERCLOS là chỉ số phổ biến nhất. [arXiv 2511.13618](https://arxiv.org/pdf/2511.13618) · [PERCLOS+EAR+MAR](https://journal.lembagakita.com/ijsecs/article/download/7106/4524)
4. **Pháp lý VN**: dữ liệu sinh trắc học (ảnh khuôn mặt...) là dữ liệu cá nhân nhạy cảm; cần biện pháp chặt hơn + hồ sơ đánh giá tác động. NĐ 13/2023 hiệu lực 01/07/2023. [luatminhkhue](https://luatminhkhue.vn/du-lieu-ve-sinh-trac-hoc-la-dlcn-nhay-cam-hay-dlcn-co-ban.aspx) · [tapchicongthuong](https://tapchicongthuong.vn/hoan-thien-he-thong-phat-luat-ve-bao-ve-du-lieu-ca-nhan-dua-tren-danh-gia-nghi-dinh-so-13-2023-nd-cp-144661.htm) · [VCCI](https://vcci.com.vn/en/legal-document/nghi-dinh-132023nd-cp-ve-bao-ve-du-lieu-ca-nhan) — nguồn thứ cấp, cần đối chiếu văn bản gốc.
5. **Rủi ro báo nhầm/thiên lệch**: EFF chỉ trích báo nhầm và thiên lệch, ProctorU ngừng bán giám sát tự động hoàn toàn [EFF](https://www.eff.org/node/105261); nghiên cứu 2025: báo nhầm ~1% khi không có người duyệt, có thiên lệch xác nhận [ACL 2025](https://aclanthology.org/2025.aimecon-wip.11). Số liệu vendor (30–50%) không có nguồn — bỏ qua.

## Recommendation
- Làm: không có mặt, nhiều mặt, quay đầu/nhìn đi lâu, nhắm mắt lâu (buồn ngủ, chỉ nhắc nhở học sinh, không tính gian lận).
- Hướng mở rộng (stretch): cử chỉ tay / điện thoại (MediaPipe Hand/Object detection) — khó, nhiều báo nhầm.
- Không làm: nhận diện danh tính, lưu/gửi video hay ảnh.
- Kiến trúc: hook FE mới cạnh `kmaedu-fe/src/hooks/useCheatingDetection.ts`; gửi loại vi phạm mới vào `CheatingLog` (assessment-service) qua API cheating log sẵn có; ngưỡng theo thời gian (vd. >3–5 s) để giảm nhiễu; giáo viên xem tổng hợp.
- Đồng ý: màn xin quyền camera + thông báo rõ dữ liệu xử lý tại máy, chỉ gửi loại sự kiện + thời điểm.

## Unresolved Questions
- Bắt buộc bật camera hay tùy chọn theo phòng thi?
- Học sinh từ chối camera thì xử lý ra sao (không cho thi / ghi chú)?
- Cần đo độ chính xác trên dữ liệu thật để đưa vào phần "thử nghiệm và nhận xét".
