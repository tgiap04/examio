# Phase 02 — Overlay compose dev, image dev, Traefik, RabbitMQ

## Context Links

- [plan.md](plan.md), [phase-01](phase-01-generation-core-and-bats.md) (bảng biến overlay, `env/<name>.env`, `empty.env`)
- Nguồn được phủ: `kmaedu-be/deploy/compose/{infra,auth,admin,content,assessment,study-room,vocabulary,document,ai-chat,gateway,r2,ai,seed}.yml`
- `kmaedu-be/deploy/Dockerfile.node`, `kmaedu-be/apps/ai-service/Dockerfile`, `kmaedu-be/deploy/rabbitmq/{rabbitmq.conf,render-definitions.cjs}`
- `kmaedu-fe/vite.config.ts`, `kmaedu-fe/package.json`
- Mẫu Traefik/RabbitMQ: `devt-docker-development/compose.infra.yaml`, `infra/traefik/infra-routes.yaml`, `infra/rabbitmq/90-devt-management.conf`

## Overview

- 5h, done (2026-11-11; bằng chứng: implementer report + fix round, W1 mở rộng che `.env*` + tmpfs `deploy/env`, thêm `definitions.json`). Viết YAML overlay tĩnh (tracked) cho từng file compose deploy, cộng `dev-extras.yaml` (job `deps`, `traefik`, `fe`) và image Node dev. Không sửa file nào trong `kmaedu-be/deploy`.

## Key Insights

- **Network `internal: true` không publish cổng được.** Overlay `infra.dev.yaml` đặt `networks.internal.internal: false` và đổi `name` của cả 3 network thành `${KMAEDU_DEV_PROJECT}-{edge,internal,egress}`. Dev không cần cô lập egress; đổi tên để không đụng network `kmaedu-*` của stack deploy trên cùng máy.
- **`rabbitmq-defs` ghi `definitions.json` vào `deploy/rabbitmq/`** (bind `./rabbitmq:/defs`). Chạy nguyên thì đè file production đã render. Overlay: mount `deploy/rabbitmq` read-only ở `/defs`, mount `${KMAEDU_DEV_GEN_DIR}/rabbitmq` ở `/out`, `command: !override [node, render-definitions.cjs, --out, /out/definitions.json]`; `rabbitmq` đọc `definitions.json` từ `/out` đó và thêm `90-dev-management.conf` (`management.path_prefix = /_rabbitmq`).
- **`depends_on` giữa app kéo cả stack**: `gateway` cần 8 service healthy, `auth`/`content`/`document` cần `r2`, `document`/`ai` cần `auth`. Overlay thay `depends_on: !override` bằng: `deps` (completed), `<svc>-migrate` (completed), và đúng hạ tầng service đó dùng. Kết quả: chỉ service trong `services` chạy; client gRPC đã lazy nên service vắng chỉ làm request liên quan trả 503/502.
- **`.env` của host lọt vào container**: `admin-service`/`ai-chat-service` gọi `dotenv.config()` trên `apps/<svc>/.env` (git grep `from 'dotenv'`), các file này đang trỏ DB remote. dotenv không ghi đè biến có sẵn nhưng thêm biến thiếu. Overlay mount `${KMAEDU_DEV_GEN_DIR}/empty.env` read-only đè lên `/workspace/.env` và `/workspace/apps/<svc>/.env` của mỗi container Node. (Nếu file host chưa có, Docker tạo file rỗng ở host; đã gitignore bởi rule `.env`.) ai-service chỉ mount `src/` và `alembic/`, nên `apps/ai-service/.env` không nằm trong container.
- **`dist/` dùng chung là bẫy**: `nest-cli.json` bật `webpack` + `deleteOutDir`. Mỗi container Node có volume ẩn danh riêng ở `/workspace/dist`: không ghi vào cây host, không xóa chéo.
- **node_modules của host là bản darwin**: volume có tên `be_node_modules` ở `/workspace/node_modules`, `fe_node_modules` ở `/workspace-fe/node_modules`. Prisma client sinh ra dùng `engineType = "client"` (TS thuần), dùng chung với host được; `libs/contracts/src/generated` cũng vậy.
- **Vite sau Traefik**: trình duyệt ở `localhost:5173` (Traefik), `/api/` và `/ws/` đi thẳng vào gateway nên proxy trong `vite.config.ts` không được dùng (vô hại, không sửa). HMR client mặc định nối về `location.port` của trang, nên đổi `KMAEDU_WEB_PORT` vẫn chạy. Biến process thắng `kmaedu-fe/.env` của host, nên overlay đặt đủ `VITE_API_URL=/api/v1`, `VITE_BACKEND_URL=http://gateway:3000`, `VITE_TURNSTILE_SITE_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_MEASUREMENT_ID`, `VITE_COOKIE_DOMAIN=` (rỗng), `VITE_GENAI_TUTOR_ALLOWED_EMAILS`.
- `gateway-b` vẫn được định nghĩa (không reset được service bằng overlay) nhưng không bao giờ nằm trong danh sách `up`; khóa `gateway` chỉ map tới `gateway-a`, mang alias `gateway`.

## Requirements

Functional
- Mỗi service Node (`auth admin content assessment study-room vocabulary document ai-chat r2 gateway-a gateway-b`): `image: kmaedu-dev-node:local`, `build: !reset null`, `pull_policy: never`, `container_name: !reset null`, `working_dir: /workspace`, `command: ["yarn", "dev:<svc>"]`, `env_file: !override [${KMAEDU_DEV_GEN_DIR}/env/<name>.env]`, `environment` thêm `NODE_ENV: development`, `MAIL_TRANSPORT: json`, `CHOKIDAR_USEPOLLING`/`WATCHPACK_POLLING: ${KMAEDU_WATCH_POLL}`, `mem_limit: !reset null`, healthcheck giữ lệnh nhưng `start_period: 180s`, `interval: 10s`.
- Mỗi `<svc>-migrate`: image dev, `command: ["sh", "-c", "yarn prisma:deploy <schema-name>"]`, `depends_on: deps` + `postgres`, mount như service.
- `seed`: image dev, `build: !reset null`, `command: ["yarn", "seed:dev"]`, `env_file` → `env/auth.env` sinh ra, giữ 4 `*_DATABASE_URL` của deploy, thêm `deps` vào `depends_on`.
- `ai-migrate`, `ai`, `ai-worker`: `image: kmaedu-dev-ai:local` (giữ `build` của deploy để compose build từ Dockerfile thật), bind `apps/ai-service/src:/app/src`, `apps/ai-service/alembic:/app/alembic`, `alembic.ini`; `ai`/`ai-worker` chạy `watchfiles --filter python "python -m src.main" /app/src` (watchfiles đi kèm `uvicorn[standard]`); `env_file` → `env/ai.env`; `ai` bỏ `depends_on.auth`.
- `infra.dev.yaml`: publish `127.0.0.1:${KMAEDU_PG_PORT}:5432`, `127.0.0.1:${KMAEDU_REDIS_PORT}:6379`, `127.0.0.1:${KMAEDU_RABBITMQ_PORT}:5672`; bỏ `container_name`; rabbitmq-defs/rabbitmq như trên; `max_connections` giữ.
- `dev-extras.yaml`:
  - `deps` (one-shot): image dev, `sh -c "yarn install --immutable && yarn proto:gen && yarn prisma:generate"`, mount như Node service (không cần che `.env`).
  - `traefik` (`traefik:v3.6`), hai entrypoint `fe :5173` / `web :80`, `--api.basePath=/_traefik`, file provider `${KMAEDU_DEV_DIR}/infra/traefik`, publish `127.0.0.1:${KMAEDU_WEB_PORT}:5173` và `127.0.0.1:${KMAEDU_HTTP_PORT}:80`, network `internal` + `edge`.
  - `fe`: image dev, `working_dir: /workspace-fe`, bind `kmaedu-fe`, `sh -c "yarn install --immutable && yarn dev"`, biến `VITE_*` ở trên, network `edge`.
- `infra/traefik/routes.yaml` (tĩnh): router `api` `PathPrefix(/api/) || PathPrefix(/ws/)` trên cả `fe` và `web` → `http://gateway:3000`; router `web-root` `PathPrefix(/)` chỉ `fe`, priority thấp nhất → `http://fe:5173`; `/_traefik` (`api@internal`) và `/_rabbitmq` (`http://rabbitmq:15672`) chỉ trên `web`; `allowEncodedSlash` cho `%2F`.
- `images/node-dev.Dockerfile`: `node:22-alpine`, `corepack prepare yarn@4.9.2 --activate`, `apk add bash openssl git`, `USER node` không đặt (bind mount macOS ánh xạ quyền qua virtiofs).

Non-functional
- Mỗi YAML < 200 dòng; anchor `x-dev-node` lặp trong từng file (anchor không vượt file, giống deploy).
- Overlay chỉ dùng tag Compose 2.24 (`!reset`, `!override`).

## Architecture

```
Trình duyệt ──:5173──▶ Traefik(fe) ── /api/, /ws/ ──▶ gateway-a(alias gateway):3000 ──▶ auth/content/... :3000 / gRPC :50051
                                   └─ /  ─────────▶ fe (vite :5173, HMR websocket cùng đường)
curl/Postman ─:8000──▶ Traefik(web) ─ /api/, /ws/ ─▶ gateway   ;  /_traefik ─▶ dashboard ; /_rabbitmq ─▶ rabbitmq:15672
DBeaver/psql ─127.0.0.1:5432─▶ postgres   redis-cli ─:6379─▶ redis   amqp ─:5672─▶ rabbitmq

Khởi động: postgres/redis/rabbitmq(+rabbitmq-defs) ─▶ deps (install, proto:gen, prisma:generate)
           ─▶ <svc>-migrate (prisma migrate deploy từ source) ─▶ <svc> (nest start --watch)
```

## Related Code Files

Tạo trong `docker-development/`:
- `compose/{infra,auth,admin,content,assessment,study-room,vocabulary,document,ai-chat,gateway,r2,ai,seed}.dev.yaml`
- `compose/dev-extras.yaml`
- `images/node-dev.Dockerfile`
- `infra/traefik/routes.yaml`, `infra/rabbitmq/90-dev-management.conf`
- `test/compose-overlay.bats`

Sửa / xóa: không. Tuyệt đối không sửa `kmaedu-be/deploy/**`.

## Implementation Steps

1. Viết `test/compose-overlay.bats` trước (RED): render bằng `./project render` với runner secret giả, rồi `docker compose -f .generated/compose.yaml config --format json` (CLI, không daemon) và kiểm các bất biến dưới.
2. `infra.dev.yaml` (network, cổng, rabbitmq-defs, rabbitmq).
3. `dev-extras.yaml` + `node-dev.Dockerfile` + Traefik + RabbitMQ conf.
4. Từng overlay service Node + migrate (mẫu chung, khác tên service/schema).
5. `ai.dev.yaml`, `seed.dev.yaml`, `gateway.dev.yaml` (cả `gateway-a` và `gateway-b`).
6. Test "đầu độc": chép `deploy/` sang thư mục tạm (chỉ file tracked: `git ls-files kmaedu-be/deploy`), thêm `.env` và `env/*.env` chứa `POISON_<KEY>`, trỏ generator vào đó (`KMAEDU_BE_DIR`), `config` → không có chuỗi `POISON`.
7. Chạy `node --test kmaedu-be/deploy/compose-topology.spec.cjs` và `git diff --exit-code kmaedu-be/deploy` để chứng minh deploy không đổi.

## Todo

- [x] test/compose-overlay.bats (RED)
- [x] infra.dev.yaml
- [x] dev-extras.yaml, node-dev.Dockerfile, traefik routes, rabbitmq conf
- [x] 10 overlay service Node + migrate
- [x] ai.dev.yaml, seed.dev.yaml, gateway.dev.yaml
- [x] test đầu độc + topology spec + diff deploy rỗng

## Test matrix (bats, `docker compose config`, không daemon)

| Bất biến | Vì sao |
|---|---|
| `config` thành công với env sinh ra | overlay hợp lệ, đủ biến |
| Không service nào có `env_file` ngoài `KMAEDU_DEV_GEN_DIR`; không chuỗi `/deploy/env/` hay `/deploy/.env` | không đọc secret thật |
| Không `container_name`; cổng publish chỉ ở postgres/redis/rabbitmq/traefik và đều `127.0.0.1` | cô lập, không lộ ra LAN |
| `networks.*.internal` không true; tên network có tiền tố project | publish được, không đụng stack deploy |
| `rabbitmq-defs` không mount `deploy/rabbitmq` ghi được | không đè `definitions.json` thật |
| `depends_on` của mọi app chỉ gồm `deps`, `*-migrate`, hạ tầng | file `services` thực sự quyết định |
| Mỗi service Node có mount `empty.env` đè `/workspace/.env` và `apps/<svc>/.env` | không lọt `.env` host |
| Test đầu độc: không có `POISON` | chứng minh bằng thực nghiệm |

## Success Criteria

- [x] `test/compose-overlay.bats` xanh (nằm trong 100/100); [x] `git diff --exit-code kmaedu-be/deploy` exit 0; [x] topology spec 46/46.

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Đối sách |
|---|---|---|---|
| Overlay override service trong include path-list không ăn | Thấp (devt dùng cách này) | Cao | bats `config` kiểm từng trường |
| Watch không nhận thay đổi qua bind mount macOS | Trung bình | Trung bình | `KMAEDU_WATCH_POLL=true` bật polling |
| 10 watcher Nest + ai vượt RAM Docker Desktop | Cao (full stack) | Trung bình | ghi yêu cầu RAM ở README; `services` chọn tập nhỏ |
| Healthcheck báo unhealthy khi build lần đầu chậm | Trung bình | Thấp | `start_period: 180s`; không app nào chờ health app khác |
| Tag compose của Traefik/Node trôi | Thấp | Thấp | ghim version |

## Security Considerations

- Cổng chỉ bind loopback. Dashboard Traefik và RabbitMQ UI không có auth thêm: chỉ chấp nhận vì loopback.
- Đè `.env` của host bằng file rỗng read-only; overlay không mount `deploy/env`.
- `fe` không nhận secret nào ngoài các `VITE_*` công khai.

## Next Steps

Phase 03 viết lệnh điều khiển dùng `needed_services` (phase 01) và các service ở đây.
