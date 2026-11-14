# Clarifications

## Session 2026-11-11
- Q: Dạng tên kỹ thuật (thư mục, npm scope, proto, docker, env)? → A: `kmaedu` (thay 1-1 cho `examio`); hiển thị `KMAEdu`; hằng viết hoa `KMAEDU`.
- Q: Tài liệu lịch sử (plans cũ, journals, review-archive, changelog cũ, docx) có đổi không? → A: Đổi tất cả; lịch sử commit git không viết lại.
- Q: Tên miền mới? → A: `kmaedu.fayedark.com`.
- Q: API host? → A: Cùng host: web `https://kmaedu.fayedark.com`, API `https://kmaedu.fayedark.com/api/v1` (OAuth callback cũng vậy).
- Q: Repo GitHub và image Docker? → A: Đổi repo thành `tgiap04/kmaedu`; image `ghcr.io/tgiap04/kmaedu-*`.
- Q: Logo và favicon? → A: Claude vẽ logo chữ tạm "KMAEdu" (sáng/tối) + favicon "K"; giữ tên file để thay logo thật sau.
- Q: Đổi thư mục máy `/Users/tgiap.dev/devs/examio`? → A: Đổi, làm bước cuối sau merge; chuyển cả thư mục trí nhớ Claude Code.
- Q: examio-app (mobile, không còn trong repo) được nhắc trong docs? → A: Xoá các chỗ nhắc tới mobile trong tài liệu hiện hành; plan/tài liệu lịch sử chỉ đổi tên như mọi file khác.
- Q: R2 tạo bucket/host mới `kmaedu` hay giữ cũ? → A: Giữ bucket `examio` và host `https://examio-r2.fayedark.com`; không tạo mới.
