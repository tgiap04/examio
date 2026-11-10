# Phase 02 — Android UI: list + tạo phòng + chi tiết phòng

**Priority:** Cao · **Status:** ✅ DONE · **Phụ thuộc:** phase-01

## Mục tiêu
Mở luồng phòng thi từ tab DeThi: xem danh sách phòng, tạo phòng mới (form 3 field),
mở chi tiết phòng (header + danh sách phiên thi + nút tạo phiên).

## Pattern hiện có (theo đúng repo)
- VM: `androidx.lifecycle.ViewModel` + `MutableStateFlow<State>`, `init{load()}`, `viewModelScope.launch`, khởi tạo `remember { XxxViewModel(repo) }`.
- Nav con: state-based `when` trong composable (giống `DeThiScreen` → `managing?.let { QuizSetManageScreen }`).
- UI dùng `ExamioCard`, `ExamioCardShape`, `MaterialTheme.colorScheme`, tiếng Việt.
- Mỗi file < 200 dòng → tách VM và screen riêng.

## Files tạo (`androidApp/.../features/exams/room/`)
- `ExamRoomsNavState.kt` — `sealed interface`: `List`, `Create`, `Detail(roomId,title)`, `CreateSession(roomId,roomTitle)`
- `ExamRoomsScreen.kt` — điều phối nav con + màn list (LazyColumn phòng, FAB "Tạo phòng thi", click → Detail). Nhận `examRepository`, `onBack`.
- `ExamRoomsViewModel.kt` — state `{isLoading, rooms:List<ExamRoom>, error}`; `load()`, `deleteRoom(id)`.
- `CreateExamRoomScreen.kt` — form: `title` (bắt buộc ≤200), `description` (tùy chọn ≤1000), `quizSetId` (dropdown từ quiz sets). Nút "Tạo phòng thi". Validate client-side như FE.
- `CreateExamRoomViewModel.kt` — state `{quizSets, isLoading, isSubmitting, error}`; `loadQuizSets()`, `submit(title,desc,quizSetId, onSuccess)`.
- `ExamRoomDetailScreen.kt` — header phòng (title, bộ đề, số phiên) + list phiên thi + nút "Tạo phiên thi" (→ CreateSession, xử lý ở phase-03). Mỗi phiên hiển thị: thời gian, trạng thái (suy ra từ startTime/endTime/isActive), mã truy cập nếu có, nút xóa.
- `ExamRoomDetailViewModel.kt` — state `{room, sessions, isLoading, error}`; `load(roomId)`, `deleteSession(id)`.

## Files sửa
- `DeThiScreen.kt` — thêm 1 mục/nút "Quản lý phòng thi" (card hoặc OutlinedButton) mở `ExamRoomsScreen` qua local state `var showRooms by remember { mutableStateOf(false) }`; `showRooms` true → render `ExamRoomsScreen(examRepository, onBack={showRooms=false})` rồi `return` (giống pattern `managing`). Cập nhật mô tả header có "phòng thi".

## Chi tiết form tạo phòng (khớp FE)
- title: bắt buộc, "Tiêu đề không được để trống", ≤200 → "Tiêu đề tối đa 200 ký tự"
- description: tùy chọn, ≤1000
- quizSetId: bắt buộc, dropdown `ExposedDropdownMenuBox` hiển thị "title (N câu hỏi)", empty → "Không có bộ đề nào"
- Submit → `repository.createExamRoom(...)`; thành công → về list + reload + toast/snackbar "Tạo phòng thi thành công".

## Trạng thái phiên (hiển thị)
Suy ra: chưa tới startTime → "Sắp diễn ra"; trong khoảng & isActive → "Đang diễn ra"; qua endTime → "Đã kết thúc".

## Todo
- [x] ExamRoomsNavState.kt
- [x] ExamRoomsViewModel.kt + ExamRoomsScreen.kt (list + FAB + nav con)
- [x] CreateExamRoomViewModel.kt + CreateExamRoomScreen.kt
- [x] ExamRoomDetailViewModel.kt + ExamRoomDetailScreen.kt (SessionDisplay helper)
- [x] Hook vào DeThiScreen.kt (nút "Quản lý phòng thi")
- [x] Build android pass

## Success criteria
Từ tab Đề thi mở được danh sách phòng, tạo phòng mới thấy xuất hiện trong list, mở chi tiết thấy danh sách phiên (rỗng nếu chưa có), nút tạo phiên dẫn sang form phase-03.

## Rủi ro
- Giữ file < 200 dòng: tách card/empty/loading thành composable con trong cùng file hoặc file `components/`.
