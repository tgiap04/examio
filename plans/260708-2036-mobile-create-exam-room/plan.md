# Bổ sung tính năng Phòng thi (Exam Room) cho examio-app — Android

## Bối cảnh
`examio-fe` có đủ luồng quản lý phòng thi (tạo phòng → tạo phiên thi). `examio-app` (KMP)
mới chỉ có `ExamRoomApiService` **read-only** và tab "Phòng thi" đang **mock tĩnh**.
Task: bổ sung luồng đầy đủ **Tạo phòng thi + Danh sách phòng + Tạo phiên thi** trên **Android**.

## Quyết định phạm vi (đã chốt với user)
- **Full scope**: tạo phòng + danh sách phòng + chi tiết phòng (list phiên thi) + tạo phiên thi.
- **Android trước**, iOS để phiên sau (tạm bỏ feature parity theo yêu cầu user — sẽ làm iOS Swift sau).
- **Lối vào**: tab **Đề thi (DeThi)** — thêm mục "Phòng thi" mở luồng con.
- SDD mode = off → không có stage spec.

## Contract backend (nguồn sự thật — đã xác minh trong examio-be)
- `POST /examrooms` body `{title, description?, quizSetId}` → `{message, examRoom}`
- `GET /examrooms/list?page&limit&search?` → `{examRooms[], total, page, limit, totalPages}`
- `GET /examrooms/detail/:id` → `ExamRoom` (kèm quizSet, host)
- `DELETE /examrooms/:id` → `{message}`
- `GET /examrooms/:id/sessions?page&limit` → `{sessions[], total, page, limit, totalPages, totalDistinctParticipants}`
- `POST /examsessions` body (xem phase-03) → `{message, examSession}`
- `GET /examsessions/room/:roomId/available-labels` → `{totalQuestions, labels[], unlabeledCount}`
- `GET /examsessions/users/search?q=` → user list (cho whitelist)
- Enums: `ASSESS_TYPE` PUBLIC=0/PRIVATE=1 · `QUESTION_SELECTION_MODE` ALL=0/RANDOM_TOTAL=1/RANDOM_BY_LABEL=2

## Phát hiện cần sửa
- `ExamRoom`/`ExamSession` model hiện tại **lệch** shape BE (isPublic, startsAt/endsAt/status) và **không nơi nào dùng** → viết lại tự do.
- `list()`/`sessions()` đang map sai vào `PaginatedResponse` (BE trả `examRooms`/`sessions`, không phải `data`).
- JSON client đã bật `ignoreUnknownKeys` → model chỉ cần field dùng tới.

## Các phase
| Phase | Nội dung | Trạng thái |
|-------|----------|-----------|
| [phase-01](phase-01-shared-data-layer.md) | Shared Kotlin: models + API services + repository + DI | ✅ DONE |
| [phase-02](phase-02-rooms-list-create-detail.md) | Android UI: list phòng + tạo phòng + chi tiết phòng | ✅ DONE |
| [phase-03](phase-03-create-session-form.md) | Android UI: form tạo phiên thi (đầy đủ setting) | ✅ DONE |
| [phase-04](phase-04-build-and-qa.md) | Build verify + QA thủ công | ✅ BUILD PASS, QA PENDING |

## Phụ thuộc
- phase-02, 03 phụ thuộc phase-01 (data layer).
- phase-04 chạy cuối.

## Ngoài phạm vi
- iOS Swift (làm sau).
- Sửa/cập nhật phòng thi (update) — chỉ tạo + xóa. Update phiên thi cũng ngoài phạm vi (chỉ tạo).
- Thống kê phiên thi (analytics) — ngoài phạm vi.
