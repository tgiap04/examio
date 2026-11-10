# Frontend Responsive Mockups Plan

## Mục tiêu
Tạo bộ mockups HTML trong `kmaedu-fe/mockups/` để dùng làm tham chiếu refactor UI frontend, tuân thủ `kmaedu-app/DESIGN.md` và `kmaedu-app/ui-design.html`.

## Scope
- Bao phủ các route app đã audit từ `kmaedu-fe/src/routes/index.tsx`.
- Loại trừ landing/public marketing: `/`, `/about`, `/contact`.
- Mobile có thể giữ tương tự `kmaedu-app/mockups/`.
- Bổ sung responsive preview cho desktop, tablet, mobile trong mỗi file.

## Files tạo
- `kmaedu-fe/mockups/index.html`
- `kmaedu-fe/mockups/auth-flow.html`
- `kmaedu-fe/mockups/student-dashboard.html`
- `kmaedu-fe/mockups/teacher-dashboard.html`
- `kmaedu-fe/mockups/profile-settings.html`
- `kmaedu-fe/mockups/subscription-wallet.html`
- `kmaedu-fe/mockups/student-materials.html`
- `kmaedu-fe/mockups/student-exams.html`
- `kmaedu-fe/mockups/ai-student-programming.html`
- `kmaedu-fe/mockups/history.html`
- `kmaedu-fe/mockups/ai-generator.html`
- `kmaedu-fe/mockups/genai-knowledge.html`
- `kmaedu-fe/mockups/manage-exams.html`
- `kmaedu-fe/mockups/manage-flashcards.html`
- `kmaedu-fe/mockups/manage-exam-rooms.html`

## Cách triển khai
1. Dùng dữ liệu route và nội dung từ bộ mobile mockups hiện có.
2. Sinh HTML tự chứa CSS cho từng file để mở trực tiếp bằng browser.
3. Mỗi file có responsive board gồm desktop 1440, tablet 834 và mobile 390.
4. Desktop/tablet dùng sidebar/topbar/table/card layout gần frontend web hiện tại nhưng đồng bộ theme cream/coral/dark.
5. Mobile giữ bottom nav tối đa 5 mục và touch target >=44px.
6. `index.html` có gallery, coverage matrix, và link đến từng mockup.

## Validation
- Kiểm tra đủ 15 HTML files trong `kmaedu-fe/mockups/`.
- Parse bằng Python `html.parser`.
- Verify coverage matrix chứa đủ 27 app routes.
