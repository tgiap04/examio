# Phase 03 — Frontend: thư mục, chữ hiển thị, i18n, logo, favicon

## Context Links
- [plan.md](plan.md) · [phase-01](phase-01-rename-script-and-dry-run.md)

## Overview
Ưu tiên cao. Script đã đổi thư mục `kmaedu-fe/` và chữ `Examio` → `KMAEdu` trong `index.html` và các file dịch vi/en/ja. Phase này lo phần script không làm được: wordmark, ảnh logo, favicon, soát câu chữ.

## Key Insights
- `src/components/atoms/Logo.tsx` vẽ wordmark chữ thường "exam" màu coral + "io" màu mực. Script sẽ biến nó thành "kmaedu", hỏng ý đồ thiết kế, nên phải viết tay lại: "KMA" coral + "Edu" màu mực, bỏ `lowercase`.
- Ảnh `public/logo_light.png`, `public/logo_dark.png`, `public/favicon.ico` là hình Examio. Giữ nguyên tên file để không phải sửa code.
- Khóa localStorage `examio.locale` thành `kmaedu.locale`: người dùng mất lựa chọn ngôn ngữ một lần. Không viết code chuyển khóa cũ (YAGNI, stack chưa deploy).
- Câu trong file dịch kiểu "Examio uses AI..." sau khi thay là "KMAEdu uses AI...", vẫn đúng ngữ pháp; cần đọc lại bản tiếng Việt.

## Requirements
- `<title>KMAEdu - Ôn tập và thi cùng với AI</title>`.
- Wordmark "KMAEdu" hiển thị đúng ở cả chế độ sáng và tối.
- Logo chữ tạm: SVG nguồn lưu ở `kmaedu-fe/public/brand/kmaedu-logo.svg`, xuất ra `logo_light.png` và `logo_dark.png` cùng kích thước ảnh cũ. Favicon "K" nhiều cỡ (16/32/48) trong `favicon.ico`. Dùng `magick` (đã có trên máy).
- Màu và font lấy từ token sẵn có (coral, ink, cream; font Fredoka) trong `DESIGN.md` / `globals.css`, không tự đặt màu mới.

## Related Code Files
- Đổi tên (script): `examio-fe/` → `kmaedu-fe/`
- Sửa tay: `kmaedu-fe/src/components/atoms/Logo.tsx`
- Thay ảnh: `kmaedu-fe/public/logo_light.png`, `logo_dark.png`, `favicon.ico`
- Tạo: `kmaedu-fe/public/brand/kmaedu-logo.svg`
- Soát (script đã sửa): `index.html`, `public/locales/{vi,en,ja}/*.json`, `nginx.conf`, `Dockerfile`, `docker-compose.yml`, `package.json` (`name`)

## Implementation Steps
1. Đọc `identify` kích thước ảnh cũ trước khi ghi đè.
2. Vẽ SVG logo chữ (hai biến thể nền sáng/tối) → `magick` xuất PNG đúng kích thước; favicon `magick -define icon:auto-resize=48,32,16`.
3. Sửa `Logo.tsx` (wordmark + chú thích).
4. Đọc lại file dịch vi/en/ja có chữ KMAEdu: câu nào gượng thì sửa tay.
5. `yarn install --immutable && yarn lint && yarn build && yarn test`.
6. Mở `yarn dev`, chụp màn hình trang landing, login và sidebar ở cả hai chế độ (một lượt kiểm tra giao diện).

## Todo
- [x] Favicon "K" mới (logo PNG không có chữ Examio nên giữ nguyên, không vẽ lại)
- [x] Wordmark trong `Logo.tsx`
- [x] Soát i18n vi/en/ja
- [x] build, test
- [ ] Xem giao diện bằng mắt (chưa làm; cần mở trình duyệt kiểm tra landing/login/sidebar)

## Success Criteria
- `git grep -i examio -- kmaedu-fe` rỗng; `yarn build` và `yarn test` xanh.
- Ảnh chụp landing, login, sidebar hiện KMAEdu ở cả chế độ sáng và tối.

## Risk Assessment
Logo tạm nhìn chưa đẹp: chấp nhận, vì bạn thay logo thật chỉ cần ghi đè 3 file.

## Security Considerations
Không có.

## Next Steps
Phase 07 chạy lại build FE trong lượt kiểm tra chung.
