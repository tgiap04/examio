# Phase 03 — Android UI: form tạo phiên thi

**Priority:** Cao · **Status:** ✅ DONE · **Phụ thuộc:** phase-01, phase-02

## Mục tiêu
Form tạo phiên thi (ExamSession) trong 1 phòng, đầy đủ setting như FE:
thời gian, quyền truy cập, cấu hình câu hỏi, các switch, điểm đạt.

## Files tạo (`androidApp/.../features/exams/room/`)
- `CreateExamSessionScreen.kt` — form (dùng LazyColumn để cuộn; có thể tách section thành composable con để < 200 dòng, hoặc thêm `CreateExamSessionSections.kt`).
- `CreateExamSessionViewModel.kt` — state `{availableLabels, totalQuestions, unlabeledCount, isSubmitting, searchUsers, error}`; `loadLabels(roomId)`, `searchUsers(q)`, `submit(request, onSuccess)`.

## Các field form (default & validate khớp BE/FE)
| Field | UI | Default | Validate |
|-------|----|---------|----------|
| startTime | DatePicker + TimePicker (Material3) | now + 30' | bắt buộc |
| endTime | DatePicker + TimePicker, cho phép trống | trống | nếu có phải > startTime |
| Quyền truy cập | 3 tab: Công khai / Mã số / Whitelist | Công khai (assessType=0) | Mã số & Whitelist ⇒ assessType=1 |
| → Mã truy cập (khi Mã số) | text 6 số + nút random | "" | regex `^\d{6}$` bắt buộc |
| → Whitelist (khi Whitelist) | search user (`searchUsers`) + chips đã chọn | [] | ≥1 user; gửi `whitelist=[userId]` |
| Cấu hình câu hỏi | 3 mode (xem dưới) | ALL(0) | theo mode |
| Xáo trộn câu hỏi | Switch | false | — |
| Xem đáp án sau nộp | Switch | true | — |
| Cho phép làm lại | Switch | false | — |
| → Số lần tối đa (khi làm lại) | number | 1 | 1–10 |
| Điểm đạt (%) | number | 40 | 0–100 |

## Cấu hình câu hỏi (QUESTION_SELECTION_MODE)
- `ALL=0`: dùng tất cả (không gửi questionCount/labelConfig).
- `RANDOM_TOTAL=1`: input `questionCount` (1..totalQuestions), gửi `questionCount`.
- `RANDOM_BY_LABEL=2`: `loadLabels(roomId)` → mỗi label + "Chưa gán nhãn"(labelId="unlabeled") input count (0..questionCount của label); gửi `labelQuestionConfig=[{labelId,count>0}]`. Tổng count > 0.

## Thời gian → ISO-8601
Dùng `java.time` trong androidApp (platform code cho phép): ghép ngày+giờ →
`LocalDateTime` → `.atZone(ZoneId.systemDefault()).toInstant().toString()` (ra dạng `...Z`).
BE nhận `z.string().datetime()` (chấp nhận offset/Z). Kiểm tra minSdk hỗ trợ java.time
(nếu < 26 cần coreLibraryDesugaring — xác minh `build.gradle.kts` androidApp; nếu thiếu thì bật desugaring hoặc dùng cách format thủ công UTC).

## Mã ngẫu nhiên
`(100000..999999).random().toString()` cho nút tạo mã 6 số.

## Submit
Dựng `CreateExamSessionRequest` từ form → `repository.createExamSession(req)`;
thành công → về ExamRoomDetail + reload sessions + toast "Tạo phiên thi thành công".

## Todo
- [x] CreateExamSessionViewModel.kt
- [x] CreateExamSessionScreen.kt + CreateExamSessionSections.kt
- [x] Nối CreateSession vào ExamRoomsScreen nav (từ ExamRoomDetail)
- [x] Xác minh java.time / desugaring cho datetime (java.time working on minSdk)
- [x] Build android pass

## Ghi chú thực thi
- Date/time: dùng java.time (LocalDateTime, ZoneId, Instant.toString) → ISO-8601 Z format.
- CreateExamSessionConfig.kt tách riêng để giữ file < 200 dòng.
- Whitelist search: race condition fixed với debounce + isSearching flag.
- Field `isActive` trên BE thay bằng `status` Int (0 pending, 1 active, 2 ended) → ViewModel map đúng.
- Reviewer findings 07/08: DONE_WITH_CONCERNS — 2 critical fixes applied + 1 medium (UTC picker init).

## Success criteria
Tạo được phiên thi công khai đơn giản; tạo phiên mã số (6 số) hợp lệ; chọn mode câu hỏi
RANDOM_TOTAL và RANDOM_BY_LABEL gửi payload đúng; phiên mới xuất hiện trong chi tiết phòng.

## Rủi ro
- DatePicker/TimePicker Material3 API verbose → tách composable riêng.
- Desugaring java.time: nếu minSdk thấp phải cấu hình; fallback format UTC thủ công.
- Whitelist user-search phụ thuộc endpoint `users/search` trả đúng shape → giữ SearchUser lean.
