# docker-development

Chạy cả KMAEdu trên máy bằng một lệnh, từ source, có hot reload. `./project up` dựng Postgres, Redis, RabbitMQ,
Traefik, rồi các service bạn chọn trong file `services`. Không cần tự chép file `.env` nào, không cần cài Node hay Python trên máy.

Nó dựng lại trên compose của `kmaedu-be/deploy/` (thêm một lớp overlay dev), không đọc `deploy/.env` hay `deploy/env/*.env`,
và chạy dưới project riêng `kmaedu-dev` nên không đụng stack deploy trên cùng máy.

## Yêu cầu

- Docker với Compose >= 2.24 (Docker Desktop trên macOS), bash 3.2+ (bash mặc định của macOS là đủ).
- RAM cấp cho Docker: đủ 12 service cần khoảng 7 GiB lúc cao điểm (đo trên Docker Desktop 7,75 GiB: đỉnh 7,0 GiB, ổn định
  khoảng 6,3 GiB), tức là gần hết một máy 8 GB. Muốn nhẹ, chỉ bật `gateway auth content assessment fe` (riêng `gateway auth fe` đo được khoảng 1,8 GiB).
- Mạng kéo được image và package: lần đầu chậm (xem "Lần chạy đầu").

## Bắt đầu nhanh

```bash
cd docker-development
./project up      # lần đầu tự chép services.example -> services, .env.example -> .env
./project seed    # tùy chọn: user mẫu và dữ liệu tham chiếu
./project ps      # trạng thái từng container và các URL
```

Mở `http://localhost:5173`. Muốn có tài khoản admin: điền `ADMIN_EMAILS` trong `docker-development/.env`, chạy `./project up`
(hoặc `./project seed`), rồi đăng nhập bằng email đó. Mật khẩu của admin và user seed là khóa `ADMIN_DEFAULT_PASSWORD` trong
`docker-development/.generated/secrets.env` (đặt `ADMIN_DEFAULT_PASSWORD` trong `.env` nếu muốn mật khẩu riêng).

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `./project up` | Dựng image dev, sinh secret và env, bật hạ tầng, rồi các service trong `services` |
| `./project down` | Dừng và xóa container + network, giữ volume (dữ liệu còn) |
| `./project ps` | Bảng service, trạng thái, rồi các URL |
| `./project logs [tên...]` | Theo dõi log (không tên = tất cả; cờ như `-t` được chuyển tiếp) |
| `./project sh <tên>` | Mở shell trong container (bash, không có thì sh) |
| `./project seed` | Chạy seed dev (auth, admin, ai-chat, vocabulary), in ra tài khoản admin |
| `./project db:reset [-y]` | Xóa volume Postgres (mất hết dữ liệu local), dựng lại, chạy lại migration |

`<tên>` là khóa trong `services` hoặc service compose như `postgres`, `redis`, `rabbitmq`, `traefik`, `deps`, `auth-migrate`.
`ps`, `logs`, `sh`, `seed` và `db:reset` dùng file của lần `up` gần nhất; chưa `up` thì chúng báo "run ./project up first".

## File `services`

Mỗi dòng một khóa (`#` là ghi chú). **Không ghi thì không chạy**: request cần service đó sẽ nhận 502/503. Hạ tầng, job `deps` và
các job `<svc>-migrate` luôn tự chạy theo. Mặc định (từ `services.example`) bật cả 12 khóa.

| Khóa | Chạy |
|---|---|
| `gateway` | `gateway-a` |
| `auth` `admin` `content` `assessment` `study-room` `vocabulary` `document` `ai-chat` `r2` | service Nest cùng tên (`yarn dev:<svc>`) |
| `ai` | `ai` + `ai-worker` (Python, `watchfiles` tự khởi động lại khi sửa) |
| `fe` | Vite dev server của `kmaedu-fe` |

Máy ít RAM: giữ `gateway auth content assessment fe`. Sửa `services` rồi `./project up` lại; service bị bỏ khỏi file sẽ được gỡ.

## File `.env`

Chỉ chứa khóa cho dịch vụ ngoài (mẫu: `.env.example`, đã gitignore). Để trống thì `up` vẫn chạy, chỉ tính năng đó lỗi.

| Khóa | Bật tính năng |
|---|---|
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL` | Upload, ảnh, tài liệu (dùng Cloudflare R2 thật) |
| `GEMINI_API_KEYS`, `GEMINI_MODEL_NAMES`, `AI2_API_KEY` | ai-service: chat AI, OCR, sinh quiz/flashcard |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Đăng nhập Google (callback `http://localhost:5173/api/v1/auth/google/callback`) |
| `ADMIN_EMAILS` | Các email này thành SYSTEM_ADMIN khi auth khởi động và trong `./project seed` |

Thiếu khóa Google thì auth tự dùng một client id giữ chỗ, chỉ đăng nhập Google lỗi; đăng nhập email vẫn chạy.
Cloudflare Turnstile mặc định dùng khóa test luôn-qua của Cloudflare. Các khóa tùy chọn khác nằm cuối `.env.example`.

Secret còn lại (mật khẩu DB/Redis/RabbitMQ, JWT, service secret) được sinh một lần vào `.generated/secrets.env` (quyền 700,
gitignore). Xóa file này mà volume Postgres còn thì `up` dừng và bảo chạy `./project db:reset`, vì role DB giữ mật khẩu cũ.

## Hai cổng

| Cổng | Dùng cho |
|---|---|
| `5173` | Web (Vite, hot reload) và API cùng origin: `/api/` và `/ws/` đi vào gateway, giống môi trường thật, không CORS |
| `8000` | API cho curl/Postman (`/api/v1/...`) và trang quản trị: `/_traefik/dashboard/` (cần dấu `/` cuối), `/_rabbitmq/` |

Trang quản trị chỉ ở 8000; trên 5173 các đường dẫn đó rơi vào SPA. Đổi cổng bằng `KMAEDU_WEB_PORT`, `KMAEDU_HTTP_PORT` (hai
cổng phải khác nhau).

Hạ tầng mở ra máy chỉ ở `127.0.0.1`: Postgres `5432`, Redis `6379`, RabbitMQ `5672`. Thông tin đăng nhập nằm trong
`.generated/secrets.env`; `./project up` in sẵn tên khóa. Dùng được để chạy một service ngoài Docker (xem `README.md` gốc).

## Biến môi trường `KMAEDU_*`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `KMAEDU_DEV_PROJECT` | `kmaedu-dev` | Tên compose project (không được là `deploy` hay `kmaedu`) |
| `KMAEDU_WEB_PORT` / `KMAEDU_HTTP_PORT` | `5173` / `8000` | Cổng Traefik |
| `KMAEDU_PG_PORT` / `KMAEDU_REDIS_PORT` / `KMAEDU_RABBITMQ_PORT` | `5432` / `6379` / `5672` | Cổng hạ tầng trên `127.0.0.1` |
| `KMAEDU_WATCH_POLL` | `false` | `true` thì hot reload dò file định kỳ (khi watch không nhận thay đổi) |
| `KMAEDU_SERVICES_FILE`, `KMAEDU_DEV_ENV_FILE` | `./services`, `./.env` | Đường dẫn file của bạn |
| `KMAEDU_DEV_GEN_DIR` | `./.generated` | Nơi sinh secret, env, compose |
| `KMAEDU_HOST_YARN_CACHE` | `~/.yarn/berry/cache` | Cache yarn của máy, chép một lần vào volume khi tạo mới |
| `KMAEDU_DEPS_FORCE` | `0` | `1` thì job `deps` cài và sinh code lại dù đầu vào không đổi |

## Cách hoạt động cần biết

- **File env trên máy bị che khỏi mọi container.** Mỗi container mount `kmaedu-be` thấy `.env`, `.env.*` ở gốc, ở `deploy/` và ở
  mọi `apps/*/` là file rỗng, còn `deploy/env/` là thư mục rỗng và `deploy/rabbitmq/definitions.json` (nếu có) cũng rỗng; container `fe` thấy `kmaedu-fe/.env`, `.env.local`,
  `.env.development*`... rỗng (`*.example` vẫn đọc được). Script chỉ kiểm tra file có tồn tại, không mở nội dung. Env thật của
  container đến từ `.generated/`. Tạo thêm một file env sau khi `up` thì nó chỉ bị che từ lần `./project up` kế tiếp.
- **Job `deps` bỏ qua khi không có gì đổi.** Nó lưu một mã băm của `yarn.lock`, `.yarnrc.yml`, `package.json`, `proto/**`,
  `apps/*/prisma/schema*` và phiên bản node/yarn trong volume node_modules; `up` lại mà mã băm khớp (và code sinh ra vẫn còn)
  thì không cài, không chạy `buf generate`/`prisma generate` dưới các watcher đang chạy. Ép chạy: `KMAEDU_DEPS_FORCE=1 ./project up`.
- **Tên project được canh giữ.** `up`, `down`, `seed`, `db:reset` từ chối khi project `KMAEDU_DEV_PROJECT` có container tạo từ file
  compose khác `.generated/compose.yaml`, hoặc có volume mà thiếu volume đánh dấu `<project>_kmaedu-dev-owner` (do `up` tạo):
  đó không phải stack dev này (ví dụ stack deploy cùng tên).
  Lỗi nói rõ lý do và không đổi gì. Cách xử lý: đặt `KMAEDU_DEV_PROJECT` sang tên khác; nếu đó là volume cũ của chính stack dev
  (tạo trước khi có volume đánh dấu) thì `docker volume rm` chúng rồi `up` lại.
- **node_modules nằm trong volume**, cài bởi job `deps` (`yarn install --immutable`, `buf generate`, `prisma generate`).
  Cache yarn ở volume `kmaedu-dev-yarn-cache`, dùng chung mọi project dev và còn sau `down -v`/`db:reset`;
  xóa bằng `docker volume rm kmaedu-dev-yarn-cache`.
- **Image `kmaedu-dev-ai:local`** chỉ build khi chưa có, `up` không tự build lại khi `requirements.txt` đổi. Sửa
  `requirements.txt` của ai-service thì chạy `docker image rm kmaedu-dev-ai:local` rồi `./project up`.
- Mail dev ghi ra JSON, không gửi thật (`MAIL_TRANSPORT=json`).

## Lần chạy đầu

Chậm là bình thường. Đo được: ảnh `kmaedu-dev-ai:local` (2,1 GB) build khoảng 30 phút trên mạng 80-175 KB/s; job `deps` khoảng 45
giây khi cache yarn đã ấm, lâu hơn nhiều khi chưa có (cache của máy chỉ chứa bản darwin, gói native cho linux vẫn tải lần đầu).
Theo dõi bằng `./project logs deps`. Lần sau `up` xong trong khoảng 1 phút với stack nhỏ.

## Test

```bash
./test/run-tests.sh   # shellcheck + bats trong container bash 3.2 (cần Docker, không cần node)
./test/smoke-up.sh    # chạy thật: gateway + auth + fe qua Traefik, seed, đăng nhập; project riêng, cổng 15173/18000
```

`smoke-up.sh` dùng project `kmaedu-dev-smoke` và thư mục sinh tạm, không đụng stack `kmaedu-dev` của bạn.
`KMAEDU_SMOKE_KEEP=1` giữ stack lại để gỡ lỗi. Script từ chối chạy khi project smoke đã có container, hoặc có volume không phải
phần node_modules do `KMAEDU_SMOKE_KEEP_MODULES=1` giữ lại.

## Giới hạn

- **Linux chưa được thử.** Container chạy bằng root, nên trên Linux code sinh ra trong cây (`libs/contracts/src/generated`,
  `apps/*/src/generated/prisma`) và file env rỗng mà Docker có thể tạo sẽ thuộc root; `yarn proto:gen` chạy trên máy sau đó
  báo `EACCES`. Cách xử lý: `sudo chown -R "$(id -u):$(id -g)" kmaedu-be/libs/contracts/src/generated kmaedu-be/apps/*/src/generated`.
  Trên macOS (Docker Desktop) quyền sở hữu được ánh xạ về user của bạn, không gặp lỗi này.

## Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `port is already allocated` | Cổng bận (Postgres/Redis trên máy?). Đổi `KMAEDU_PG_PORT`, `KMAEDU_REDIS_PORT`... hoặc tắt tiến trình đang giữ cổng |
| Sửa code mà service không tải lại | `KMAEDU_WATCH_POLL=true ./project up` |
| Container bị kill, `up` treo | Thiếu RAM: giảm `services` (xem bảng trên), tăng RAM cho Docker Desktop |
| `up` báo secrets mất nhưng volume Postgres còn | `./project db:reset` (xóa dữ liệu local) |
| Đổi tên DB, user hay mật khẩu mà DB vẫn cũ | Script khởi tạo Postgres chỉ chạy trên volume rỗng: `./project db:reset` |
| Trình duyệt vào được nhưng `/api` trả 502/503 | Service cần thiết chưa có trong `services`, hoặc đang khởi động: `./project ps` |
| `up`/`down`/`seed`/`db:reset` báo project "is not this dev stack" hoặc thiếu marker volume | Project `kmaedu-dev` đã có container/volume không do docker-development tạo. Đặt `KMAEDU_DEV_PROJECT` tên khác, hoặc xóa volume cũ của stack dev bằng `docker volume rm` |
| Docker Compose cũ | Cần >= 2.24 (overlay dùng `!override`/`!reset`) |
