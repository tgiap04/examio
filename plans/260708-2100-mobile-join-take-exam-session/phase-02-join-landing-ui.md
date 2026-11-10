# Phase 02 — Android UI: join + landing + wiring

**Priority:** Cao · **Status:** ✅ DONE · **Phụ thuộc:** phase-01

## Files tạo (`androidApp/.../features/exams/session/`)
- `JoinSessionScreen.kt` — 1 ô nhập "dán link hoặc ID phiên thi" + nút "Tiếp tục". Tách sessionId từ link bằng helper (dùng `parseDeepLink` cho examio://, examio.vn; fallback: nếu chứa "exam-session/" lấy segment sau, else dùng nguyên input trim). Gọi `onOpen(sessionId)`.
- `ExamSessionLandingViewModel.kt` — state `{isLoading, info: SessionPublicInfo?, access: SessionAccessCheck?, needCode, code, codeError, verifying, verified, error}`; `load()` = checkAccess + publicInfo (song song/tuần tự); `verifyCode(code)`; `canStart = access.hasAccess || verified`.
- `ExamSessionLandingScreen.kt` — hiển thị info phiên (tiêu đề, mô tả, người tạo, thời gian, trạng thái). Nếu `accessType == denied` → thông báo "Phiên thi riêng tư, bạn không có quyền". Nếu `code_required` và chưa verify → ô nhập mã 6 số + nút "Xác nhận mã" (gọi verifyCode; sai → lỗi). Khi `canStart` → nút "Bắt đầu làm bài" → `onStart(title)`.

## Wiring
- `ExamNavState.kt` (features/exams/) — thêm: `data object Joining`, `data class SessionLanding(val sessionId: String)`.
- `ExamioApp.kt`:
  - Overlay `Joining` → `JoinSessionScreen(onBack={Idle}, onOpen={id-> examNav = SessionLanding(id)})`.
  - Overlay `SessionLanding` → `ExamSessionLandingScreen(sessionId, examRepository, onBack={Idle}, onStart={title-> examNav = TakingExam(sessionId, title)})`.
  - `MyExamsScreen(onJoinSession = { examNav = ExamNavState.Joining }, ...)`.
  - `DeThiScreen(onTakeSession = { id, title -> examNav = ExamNavState.TakingExam(id, title) }, ...)`.
- `MyExamsScreen.kt` — thêm param `onJoinSession: () -> Unit`; thêm nút "Tham gia phiên thi" (OutlinedButton/Card) ở đầu list, gọi onJoinSession.
- `DeThiScreen.kt` — thêm param `onTakeSession: (String, String) -> Unit`; truyền xuống `ExamRoomsScreen`.
- `ExamRoomsScreen.kt` — thêm param `onTakeSession`; truyền xuống `ExamRoomDetailScreen` (ở nhánh Detail).
- `ExamRoomDetailScreen.kt` — `SessionCard` thêm nút/onClick "Vào làm bài" → `onTakeSession(session.id, roomTitle)`. Giữ nút Xóa.

## Ghi chú
- Trạng thái phiên dùng `sessionStatusLabel`/`formatSessionTime` đã có (SessionDisplay.kt).
- Không lưu accessCode sau verify (giống FE) — start chỉ cần sessionId.
- Giữ mỗi file < 200 dòng.

## Todo
- [x] JoinSessionScreen.kt (+ helper tách id)
- [x] ExamSessionLandingViewModel.kt + ExamSessionLandingScreen.kt
- [x] ExamNavState.kt (+2 state)
- [x] ExamioApp.kt wiring (2 overlay + 2 callback)
- [x] MyExamsScreen.kt (nút Tham gia)
- [x] DeThiScreen.kt + ExamRoomsScreen.kt + ExamRoomDetailScreen.kt (nút Vào làm bài, thread callback)
- [x] Build android pass

## Success criteria
- Từ tab Bài thi → Tham gia → dán ID/link phiên công khai → thấy info → Bắt đầu → vào ExamTakingScreen.
- Phiên private có mã → nhập mã đúng → Bắt đầu; sai mã → báo lỗi.
- Trong phòng của mình → SessionCard "Vào làm bài" → vào làm bài.
