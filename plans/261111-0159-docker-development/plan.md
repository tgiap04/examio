---
title: "docker-development: chạy cả dự án bằng ./project up"
description: "Thư mục docker-development/ dựng stack dev từ source (hot reload) trên compose production, chọn service bằng file services, Traefik làm cổng vào."
status: in-progress
priority: P2
effort: 19h
branch: feat/docker-development (tách từ develop)
tags: [dev-env, docker, compose, traefik, dx]
created: 2026-11-11
---

# docker-development: `./project up` là chạy được dự án

Chạy dev hiện phải tự dựng Postgres/Redis/RabbitMQ, chép 11 file `.env`, generate, migrate rồi mở hàng chục terminal. Plan này thêm `docker-development/` ở gốc repo (mô phỏng `devt-docker-development`): điền file `services`, chạy `./project up`, mở `http://localhost:5173`. Quyết định đã chốt: [clarifications.md](clarifications.md).

## Kết quả

- Test: bats 100/100 (bash 3.2, shellcheck sạch), topology spec 46/46, `git diff kmaedu-be/deploy` rỗng; smoke thật 38/38 PASS, hai lần liên tiếp. Review 8/10 → 9/10, không còn warning.
- RAM đo được: tập nhỏ `gateway auth fe` ~1,8 GiB; đủ 12 khóa đỉnh ~7 GiB, ổn định ~6,3 GiB.
- Sau review: che thêm `.env*`, `deploy/env` (tmpfs), `definitions.json`; guard `assert_project_owned` (cả `./project sh`); deps stamp; `.gitignore` `.env*`.
- Mở: Linux chưa thử (container chạy root, file sinh có thể thuộc root); S2/S5/S6/S8 hoãn; N2/N5 chưa làm.
- Mở: phase 05 còn một bước, chạy tay lệnh trong README và đăng nhập admin seed qua trình duyệt. Xong bước đó thì đổi `status: completed`.

## Thiết kế một đoạn

- **Không viết compose song song.** `.generated/compose.yaml` `include:` từng file `kmaedu-be/deploy/compose/*.yml` (danh sách đọc từ `deploy/docker-compose.yml`), mỗi file ghép với overlay dev cùng tên `docker-development/compose/<file>.dev.yaml` (include `path:` dạng list, như devt), `project_directory` là `deploy/`, `env_file` trỏ **tường minh** vào `.generated/compose.env`. Nhờ vậy `deploy/.env` và `deploy/env/*.env` (secret thật) không bao giờ được đọc.
- **Overlay dev** (Compose 2.24+ `!override`/`!reset`): image dev `node:22-alpine` + yarn 4, bind-mount `kmaedu-be` vào `/workspace`, `yarn dev:<svc>`, `NODE_ENV=development`, `MAIL_TRANSPORT=json`, `env_file` sinh sẵn, bỏ `container_name`, network `internal` thành không-internal (để publish cổng hạ tầng ra `127.0.0.1`), `depends_on` giữa các app bị cắt, chỉ giữ hạ tầng + migrate + job `deps`.
- **File `services`** (gitignore, tự chép từ `services.example` lần đầu): khóa `gateway auth admin content assessment study-room vocabulary document ai-chat r2 ai fe`. Service không ghi thì không chạy; compose chỉ tự kéo theo phụ thuộc cứng còn lại sau overlay: hạ tầng, `<svc>-migrate`, `ai-migrate`, `deps`. Mọi thứ chạy đều chạy từ source.
- **Traefik** hai entrypoint như devt: `:5173` (web `/` → Vite, `/api/` `/ws/` → gateway, cùng origin), `:8000` (API + `/_traefik/dashboard/`, `/_rabbitmq/`).
- **Secret local** sinh một lần trong `.generated/secrets.env` (JWT bằng `scripts/gen-jwt-keypair.sh`, service secret bằng `scripts/gen-service-secret.sh`, chạy trong image dev). Key ngoài (R2, Gemini, Google, `ADMIN_EMAILS`) lấy từ `docker-development/.env`; thiếu thì vẫn `up`, chỉ tính năng đó lỗi.

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 01 | [Lõi sinh file: services, .env, secret, compose.env, compose.yaml + bats](phase-01-generation-core-and-bats.md) | 5h | done |
| 02 | [Overlay compose dev, image dev, Traefik, RabbitMQ](phase-02-dev-compose-overlays.md) | 5h | done |
| 03 | [Lệnh ./project: up, down, ps, logs, sh, seed, db:reset](phase-03-project-commands.md) | 4h | done |
| 04 | [Smoke thật: gateway + auth + fe qua Traefik](phase-04-smoke-e2e.md) | 3h | done |
| 05 | [Tài liệu: README gốc, CLAUDE.md, docker-development/README.md](phase-05-docs.md) | 2h | docs viết xong, kiểm chạy thử chưa chứng minh |

## Phụ thuộc

- 01 → 02 → 03 → 04 → 05. Một người làm, tuần tự. 02 chỉ cần hợp đồng biến/đường dẫn của 01 (bảng "Hợp đồng" trong phase-01) để viết YAML; test overlay của 02 chạy trên generator của 01.
- Không phase nào sửa `kmaedu-be/deploy/**`, `kmaedu-fe/**` hay code service. Mọi file mới nằm trong `docker-development/`; phase 05 sửa `README.md`, `CLAUDE.md`, `docs/project-changelog.md`.

## Hợp đồng chung (các phase dựa vào)

| Thứ | Giá trị |
|---|---|
| Compose project | `KMAEDU_DEV_PROJECT`, mặc định `kmaedu-dev` (smoke dùng `kmaedu-dev-smoke-<pid>`) |
| Cổng host | `KMAEDU_WEB_PORT` 5173, `KMAEDU_HTTP_PORT` 8000, `KMAEDU_PG_PORT` 5432, `KMAEDU_REDIS_PORT` 6379, `KMAEDU_RABBITMQ_PORT` 5672, chỉ bind `127.0.0.1` |
| Thư mục sinh | `KMAEDU_DEV_GEN_DIR`, mặc định `docker-development/.generated/` (gitignore, quyền 700) |
| Image dev | `kmaedu-dev-node:local` (Node BE + deps + migrate + seed + fe), `kmaedu-dev-ai:local` (ai-service) |

## Scope Contract (tóm tắt, chi tiết ở từng phase)

- **Changed:** thư mục mới `docker-development/`; docs.
- **Impacted:** không hành vi production nào. Cái có thể vỡ: secret thật bị đọc nhầm, `deploy/rabbitmq/definitions.json` bị ghi đè, cổng/volume/network đụng stack production trên cùng máy.
- **Will verify:** bats (bash 3.2 container) cho parse/sinh file; `docker compose config` (không cần daemon) cho overlay, kèm test "đầu độc" `deploy/.env`; smoke thật cho đường đi trình duyệt → Traefik → gateway → auth; `node --test deploy/compose-topology.spec.cjs` + `git diff --exit-code kmaedu-be/deploy` để chứng minh deploy không đổi.
- **Deliberately skipped:** test unit/e2e của service (code không đổi); chạy smoke trên Linux (chưa có máy, ghi lại); hot reload chỉ kiểm tay.

## Rollback

Toàn bộ là phần thêm. Gỡ: `docker compose -p kmaedu-dev down -v` rồi xóa `docker-development/` và revert docs. Không đụng volume/network của stack `deploy/` (tên khác).

## Câu hỏi mở

Xem cuối [phase-03](phase-03-project-commands.md#câu-hỏi-mở) (mặc định `services.example` bật đủ stack hay tập nhỏ).
