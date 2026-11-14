# Phase 03 — Lệnh ./project: up, down, ps, logs, sh, seed, db:reset

## Context Links

- [plan.md](plan.md), [phase-01](phase-01-generation-core-and-bats.md), [phase-02](phase-02-dev-compose-overlays.md)
- Mẫu: `devt-docker-development/lib/{commands-lifecycle.sh,commands-inspect.sh,command-db-reset.sh,prerequisites.sh}`, `test/{up-and-pull-flow.bats,inspect-and-db-reset.bats,cli-and-prerequisites.bats}`, docker shim trong `test/helpers/test-helper.bash`
- Seed: `kmaedu-be/deploy/compose/seed.yml`, `kmaedu-be/apps/auth-service/prisma/seed.ts` (mật khẩu dev = `SEED_PASSWORD` ?? `ADMIN_DEFAULT_PASSWORD`)

## Overview

- 4h, done (2026-11-11; bằng chứng: implementer report + fix round: `assert_project_owned` trong up/down/seed/db:reset/sh, `db:reset` dùng `ps -a`; `db:reset -y` chạy thật trên full stack, exit 0 trong 31 s). Nối phần sinh file (01) và overlay (02) thành các lệnh người dùng gõ. Test bằng bats với `docker` giả (shim ghi lại lời gọi), như devt.

## Key Insights

- `docker compose up <svc...>` tự kéo phụ thuộc cứng còn lại sau overlay (`deps`, `*-migrate`, hạ tầng); `--remove-orphans` không gỡ service vẫn có trong file. Cần `stop_unneeded` như devt: container app đang chạy mà không còn trong tập cần → `rm -s -f`. Hạ tầng, `traefik`, `deps`, `*-migrate` không bao giờ bị gỡ bởi bước này.
- Lần chạy đầu `deps` cài node_modules (vài phút) và các migrate chờ nó; `up` phải in gợi ý `./project logs deps` trước khi chờ.
- Secret lệch volume: `secrets.env` không có mà volume `<project>_postgres_data` có → chết với hướng dẫn `./project db:reset` (init Postgres không chạy lại trên volume cũ).
- `db:reset` đơn giản và an toàn nhất: xóa đúng volume Postgres của project dev rồi `up` lại (init script tạo lại 9 role/schema, migrate chạy lại). Không reset từng schema (init script chỉ chạy trên volume rỗng, tự viết lại là lặp logic). Redis/RabbitMQ giữ nguyên: khóa cache trỏ user đã mất chỉ hết hạn tự nhiên.

## Requirements

| Lệnh | Việc làm |
|---|---|
| `up` | kiểm điều kiện → chép `services`/`.env` từ `.example` nếu chưa có (báo ra) → `docker build` image `kmaedu-dev-node:local` (cache) → kiểm secret/volume → `ensure_secrets` → render → in khối cảnh báo key thiếu → `dc up -d --wait postgres redis rabbitmq traefik` → `stop_unneeded` → `dc up -d <needed>` → in URL |
| `down` | `dc down --remove-orphans` (giữ volume). Compose sinh ra không load được → `docker compose -p <project> down` |
| `ps` | bảng `SERVICE STATE STATUS` (gồm hạ tầng) + URL |
| `logs [khóa...]` | khóa `services` hoặc tên compose; không tên = tất cả; chuyển tiếp cờ |
| `sh <tên>` | `exec` bash, không có thì sh |
| `seed` | `dc --profile seed run --rm seed` (chạy 4 migrate cần thiết nếu chưa) rồi in tài khoản admin: email từ `ADMIN_EMAILS`, mật khẩu ở `.generated/secrets.env` key `ADMIN_DEFAULT_PASSWORD` (in đường dẫn, không in mật khẩu) |
| `db:reset [-y]` | hỏi xác nhận (bỏ qua bằng `-y`, không TTY mà thiếu `-y` → chết) → `dc rm -s -f` mọi service đang chạy trừ redis/rabbitmq/traefik → `docker volume rm <project>_postgres_data` → `up` → gợi ý `./project seed` |
| `help` | usage, liệt kê khóa `services` và biến `KMAEDU_*` |

- Điều kiện: Docker daemon chạy, Compose ≥ 2.24, cổng hợp lệ và `WEB != HTTP`, tên project `^[a-z][a-z0-9_-]*$`.
- `up` in sau cùng: `http://localhost:5173` (web), `http://localhost:8000/api/v1` (API), `/_traefik/dashboard/`, `/_rabbitmq/` (user `kmaedu`, mật khẩu: key `RABBITMQ_PASS` trong `.generated/secrets.env`), Postgres/Redis/RabbitMQ `127.0.0.1:<port>`.

## Architecture

```
project ─▶ lib/prerequisites.sh ─▶ lib/services-file.sh ─▶ lib/local-secrets.sh ─▶ lib/render-*.sh
        └▶ lib/commands-lifecycle.sh (up, down, stop_unneeded, print_urls)
        └▶ lib/commands-inspect.sh (ps, logs, sh)
        └▶ lib/commands-database.sh (seed, db:reset)
dc() = docker compose -p $KMAEDU_DEV_PROJECT -f $GEN/compose.yaml --env-file $GEN/compose.env
```

## Related Code Files

Tạo: `docker-development/lib/{prerequisites.sh,commands-lifecycle.sh,commands-inspect.sh,commands-database.sh}`, `docker-development/test/{cli-and-prerequisites.bats,up-flow.bats,inspect-and-database.bats}`.
Sửa: `docker-development/project` (dispatcher đủ lệnh), `docker-development/test/helpers/test-helper.bash` (shim docker: `compose ps`, `volume inspect`, `build`).

## Implementation Steps

1. Mở rộng docker shim (từ devt) cho `volume inspect`, `build`, `compose ... run`.
2. Test RED theo bảng dưới.
3. `prerequisites.sh` (chép devt, đổi biến).
4. `commands-lifecycle.sh`: `cmd_up`, `cmd_down`, `stop_unneeded`, `check_secret_volume_consistency`, `print_urls`.
5. `commands-inspect.sh`: `ps`, `logs` (map khóa → service qua `services-file.sh`), `sh`.
6. `commands-database.sh`: `seed`, `db:reset`.
7. Dispatcher trong `project`, `usage`.
8. `./test/run-tests.sh` xanh.

## Todo

- [x] Shim docker mở rộng
- [x] prerequisites + test
- [x] up/down + stop_unneeded + kiểm secret/volume + test
- [x] ps/logs/sh + test
- [x] seed/db:reset + test
- [x] dispatcher + usage

## Test matrix (bats, docker giả)

| Ca | Kỳ vọng |
|---|---|
| Lần đầu không có `services`/`.env` | chép từ `.example`, báo tên file |
| `services` = `auth fe` | lời gọi cuối là `compose ... up -d auth fe`; không có `gateway-b`, `gateway-a` |
| `services` = `gateway ai` | `up -d gateway-a ai ai-worker` |
| Bỏ `content` khỏi `services` khi nó đang chạy | `rm -s -f content`; không đụng `postgres`, `deps`, `content-migrate` |
| Không có secret, volume Postgres có | exit ≠ 0, thông báo nhắc `db:reset` |
| Compose < 2.24 / daemon tắt / cổng 70000 / WEB=HTTP | exit ≠ 0, nêu nguyên nhân |
| Thiếu key R2 trong `.env` | vẫn gọi `up`, stderr có cảnh báo R2 |
| `db:reset` không TTY, không `-y` | exit ≠ 0, không gọi `volume rm` |
| `db:reset -y` | thứ tự: `rm -s -f` app → `volume rm <project>_postgres_data` → `up` |
| `seed` | gọi `--profile seed run --rm seed`; output không chứa giá trị mật khẩu |
| `logs fe gateway` | `logs -f fe gateway-a` |
| Lệnh lạ | exit 2 + usage |

## Success Criteria

- [x] Toàn bộ bats xanh trong bash 3.2, shellcheck sạch (100/100).
- [x] `./project help` liệt kê đủ lệnh và khóa (reviewer: met).

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Đối sách |
|---|---|---|---|
| `db:reset` xóa nhầm volume stack deploy | Thấp | Cao | tên volume luôn dựng từ `KMAEDU_DEV_PROJECT` đã kiểm regex; từ chối project `deploy`/`kmaedu`; test khẳng định tên |
| `up` treo lâu lần đầu (yarn install, build image ai) | Cao | Thấp | in gợi ý `logs deps`, `logs ai-migrate` |
| `stop_unneeded` gỡ nhầm job | Thấp | Trung bình | danh sách giữ lại tường minh + test |

## Security Considerations

- Không lệnh nào in giá trị secret; chỉ in tên key + đường dẫn file.
- `db:reset` chỉ đụng volume của project dev; cần xác nhận.

## Next Steps

Phase 04 chạy smoke thật.

## Câu hỏi mở

1. `services.example` mặc định bật **đủ 12 khóa** (đúng ý "chỉ cần `./project up` là chạy được dự án", cần khoảng 10–12 GB RAM cho Docker Desktop) hay một tập nhỏ (`gateway auth content assessment fe`)? Plan đang chọn đủ 12 khóa, kèm comment gợi ý tập nhỏ; đổi chỉ là sửa một file.
