# Tham gia & làm bài phiên thi (join/take exam session) — examio-app Android

## Bối cảnh
Vòng làm bài (`ExamTakingScreen`: startAttempt → giải mã → autosave → nộp → kết quả) **đã hoàn chỉnh**.
Thiếu **điểm vào** và **cổng access**:
1. Không join được phiên của người khác (không có màn nhập link/ID + cổng access/verify code + API study-session).
2. Không vào làm bài session trong phòng của chính mình (`SessionCard` chỉ có nút Xóa).

## Quyết định (đã chốt với user)
- Join phiên người khác: **dán link/ID + nhập mã 6 số** (KHÔNG wire deep link).
- Lối vào "Tham gia phiên thi": **tab Bài thi** (MyExamsScreen).
- Session phòng mình: thêm nút **"Vào làm bài"** trên SessionCard.
- Android only (iOS sau). SDD off.

## Contract backend (đã xác minh trong examio-be)
- `GET /examsessions/study/:id/access` → `{hasAccess, accessType, requiresCode?}` — accessType: public/owner/whitelist/code_required/denied
- `GET /examsessions/study/:id/info` → `{id, title, description?, startTime, endTime?, status, isPublic, requiresCode, creator{...}}` (public, no auth)
- `POST /examsessions/study/:id/verify-code` body `{accessCode}` → `{valid, message}` (403 nếu sai)
- Làm bài tái dùng nguyên: `POST /examattempts/start {examSessionId}` → secure-quiz → progress → secure-submit (đã có sẵn trong app).
- Lưu ý: BE chỉ gate access ở tầng `study/*`; `start` chỉ check auth + thời gian + retry limit. Nên cổng access nằm ở màn landing.

## Luồng
**Join người khác:** MyExamsScreen "Tham gia" → JoinSessionScreen (dán link/ID) → SessionLanding(checkAccess+info) → nếu `code_required` nhập mã → verifyCode → "Bắt đầu" → TakingExam (overlay sẵn có).
**Phòng mình:** ExamRoomDetail SessionCard "Vào làm bài" → TakingExam trực tiếp (owner có quyền; nếu ngoài giờ BE trả lỗi, hiển thị như FE).

## Các phase
| Phase | Nội dung | Trạng thái |
|-------|----------|-----------|
| [phase-01](phase-01-shared-study-api.md) | Shared: models + study API (checkAccess/info/verifyCode) + repository | ✅ DONE |
| [phase-02](phase-02-join-landing-ui.md) | Android UI: JoinSessionScreen + SessionLanding + wiring nav + nút "Vào làm bài" | ✅ DONE |
| [phase-03](phase-03-build-and-qa.md) | Build verify + review + QA | ✅ DONE |

## Ngoài phạm vi
- Deep link (bấm link ngoài mở app) — làm sau.
- iOS Swift.
- Thay đổi vòng làm bài đã có (ExamTakingScreen) — chỉ tái dùng.
