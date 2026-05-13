# Mobile UI Mockups Plan

## Mục tiêu
Tạo bộ mockups mobile UI bằng HTML trong `examio-app/mockups/`, dựa trên `examio-app/user-stories.html` và tuân thủ `examio-app/DESIGN.md` + `examio-app/ui-design.html`.

## Design direction
- Nền kem `#faf9f5`, card kem `#efe9de`, CTA coral `#cc785c`, dark surface `#181715`.
- Headline serif editorial, body sans, code/AI surface dùng monospace.
- Mobile-first: khung máy 390px, safe-area, touch target >=44px, bottom nav tối đa 5 mục.
- Không dùng emoji làm icon cấu trúc; dùng icon SVG inline đơn giản.

## Frontend route audit
Nguồn audit: `examio-fe/src/routes/index.tsx`, `src/pages/**`, `src/app/k/**`, `KLayout`, `SideBar`, các template route chính.

### Loại khỏi mockup vì là landing/public marketing
- `/` — `HomePage`
- `/about` — `AboutPage`
- `/contact` — `ContactPage`

### Không cần mockup riêng
- `/k` — redirect theo role.
- `/k/ai-teacher` — redirect sang `/k/student-programming`.
- `*` — 404 đơn giản.

### App pages cần phủ mockup
- `/login` — đăng nhập.
- `/register` — đăng ký + chọn role.
- `/forgot-password` — gửi yêu cầu reset.
- `/reset-password` — đặt mật khẩu mới.
- `/k/dashboard-student` — dashboard học sinh.
- `/k/dashboard-teacher` — dashboard giáo viên.
- `/k/profile` — hồ sơ, đổi mật khẩu, quản lý thiết bị/session.
- `/k/verify` — xác minh tài khoản/email.
- `/k/subscription` — gói đăng ký, mua credit, lịch sử giao dịch, QR payment.
- `/k/my-materials` — tài liệu/flashcard đã xem, chia sẻ tài liệu.
- `/k/flash-card` — quản lý flashcard set.
- `/k/history` — lịch sử tổng hợp, hoạt động gần đây, PDF, exam.
- `/k/history/exam` — lịch sử bài thi.
- `/k/history/pdf` — lịch sử PDF/tài liệu.
- `/study-flashcard/:id` — học flashcard.
- `/exam-session/:id` — phòng thi, hướng dẫn, system check, điều khoản.
- `/exam-session/:id/quiz` — làm bài thi, timer, câu hỏi, nộp bài.
- `/k/manage-exam` — quản lý đề thi/quiz set.
- `/k/manage-quiz-set/:id` — chi tiết quiz set, quản lý câu hỏi/label/config.
- `/k/manage-flashcard-set/:id` — chi tiết flashcard set, quản lý thẻ/label/share.
- `/k/ai-tool` — AI generator: tab tạo đề kiểm tra và flashcard từ PDF.
- `/k/genai-knowledge` — kho tri thức GenAI: folder, upload, status, graph, dataset import.
- `/k/manage-exam-room` — quản lý phòng thi.
- `/k/manage-exam-room/:id` — chi tiết phòng thi/session/participant.
- `/k/manage-exam-room/:id/session/:sessionId` — analytics phiên thi.
- `/k/my-exams` — bài thi/luyện tập của học sinh, detail dialog.
- `/k/student-programming` — AI hỏi lập trình, chat sessions, model selector, điểm tín nhiệm code.

### Trang con/tab cần thể hiện trong mockup dù không có route riêng
- Settings/Profile: theme, interface, notifications, privacy, account, integrations, billing.
- Subscription: monthly/yearly plans, credit slider, payment QR dialog, usage breakdown.
- AI Tool: test generator, flashcard generator, recent uploads, pending job dialog.
- GenAI Knowledge: folder sheet, upload queue, file grid, filter/status, graph dialog, dataset import dialog, destructive confirmations.
- Exam management: create/edit/delete quiz set modal, question editor, label manager, practice settings.
- Flashcard management: create/edit/delete/share set, inline card editor.
- Exam room: create room modal, create session modal, participants, room stats.
- Exam quiz: cheating warning, fullscreen confirm, autosave/network status, submit confirm.

## File sẽ tạo
- `examio-app/mockups/index.html` — gallery tổng quan, route coverage matrix và link đến từng mockup.
- `examio-app/mockups/auth-flow.html` — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/k/verify`.
- `examio-app/mockups/student-dashboard.html` — `/k/dashboard-student`, quick tasks, upcoming exams, recent activity.
- `examio-app/mockups/teacher-dashboard.html` — `/k/dashboard-teacher`, stats, posts/activity, teacher shortcuts.
- `examio-app/mockups/profile-settings.html` — `/k/profile` + settings tabs: account, privacy, notification, interface, theme, integrations, billing.
- `examio-app/mockups/subscription-wallet.html` — `/k/subscription`, credit purchase, plans, transaction history, QR payment.
- `examio-app/mockups/student-materials.html` — `/k/my-materials`, `/study-flashcard/:id`, share dialog, empty/loading states.
- `examio-app/mockups/student-exams.html` — `/k/my-exams`, `/exam-session/:id`, `/exam-session/:id/quiz`, result/detail dialog.
- `examio-app/mockups/ai-student-programming.html` — `/k/student-programming`, sessions, chat, code block, evaluation score, sources.
- `examio-app/mockups/history.html` — `/k/history`, `/k/history/exam`, `/k/history/pdf`.
- `examio-app/mockups/ai-generator.html` — `/k/ai-tool`, test generator, flashcard generator, recent uploads, pending job.
- `examio-app/mockups/genai-knowledge.html` — `/k/genai-knowledge`, folder/file management, upload, graph, dataset import.
- `examio-app/mockups/manage-exams.html` — `/k/manage-exam`, `/k/manage-quiz-set/:id`, question editor, label manager, practice settings.
- `examio-app/mockups/manage-flashcards.html` — `/k/flash-card`, `/k/manage-flashcard-set/:id`, card editor, share flow.
- `examio-app/mockups/manage-exam-rooms.html` — `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/k/manage-exam-room/:id/session/:sessionId`.

## Cách triển khai
1. Tạo folder `examio-app/mockups/`.
2. Mỗi HTML là file tự chứa CSS để mở trực tiếp trên browser.
3. Dùng chung một visual language nhưng không tạo file CSS riêng để giữ từng mockup độc lập.
4. Mỗi file chứa nhiều màn hình mobile đặt cạnh nhau trong desktop gallery, mỗi màn hình mô phỏng khung điện thoại.
5. Nội dung UI bằng tiếng Việt, bám user story, route audit từ frontend và MVP đề xuất.
6. Mỗi route app trong danh sách audit phải xuất hiện trong coverage matrix của `index.html` và có ít nhất một screen mockup tương ứng.

## Validation
- Kiểm tra file tồn tại bằng `ls examio-app/mockups`.
- Chạy một script nhẹ để parse HTML bằng Python `html.parser`, đảm bảo các file đọc được.
- Không chạy dev server vì đây là static HTML mockup.

## Unresolved questions
- Có muốn mockup theo iOS chrome hay Android chrome cụ thể không? Nếu không, dùng khung mobile trung tính.
