# Clarifications

## Session 2026-11-11
- Q: Thư mục và lệnh? → A: Thư mục `docker-development/` ở gốc repo, lệnh `./project up` (mô phỏng devt-docker-development); file `services` liệt kê service cần chạy.
- Q: Service không ghi trong file `services` chạy thế nào? → A: Không chạy; chỉ service được ghi (cộng phụ thuộc cứng `depends_on` mà compose tự kéo theo) và hạ tầng.
- Q: Dựng compose dev theo cách nào? → A: Dùng lại `kmaedu-be/deploy/docker-compose.yml` + một override dev (bind-mount source, `yarn dev:<svc>`, cổng hạ tầng ra 127.0.0.1, env local sinh sẵn).
- Q: R2 ở dev? → A: Dùng Cloudflare R2 thật, key do người dùng điền trong file env local gitignore; không sửa code r2-service.
- Q: Lối vào trình duyệt? → A: Thêm Traefik như devt: một cổng vào cho web + API, kèm trang quản trị (/_traefik, /_rabbitmq ...).
- Q: `services.example` bật mặc định những service nào? → A: Đủ 12 service (comment gợi ý tập nhỏ cho máy ít RAM).
