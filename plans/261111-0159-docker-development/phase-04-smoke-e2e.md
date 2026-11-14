# Phase 04 — Smoke thật: gateway + auth + fe qua Traefik

## Context Links

- [plan.md](plan.md), phase [01](phase-01-generation-core-and-bats.md) / [02](phase-02-dev-compose-overlays.md) / [03](phase-03-project-commands.md)
- Mẫu: `devt-docker-development/test/{smoke-infra-up.sh,smoke-e2e-fixtures.sh}` (project riêng, dọn sạch, cổng đổi được)
- Seed: `kmaedu-be/apps/auth-service/prisma/seed.ts`, `kmaedu-be/libs/common/src/seed/dev-seed-users.ts` (`devSeedAdminEmail`)
- Route: `kmaedu-be/apps/gateway-service/config/routes.yaml`, `POST /api/v1/auth/login` (`auth.controller.ts`)

## Overview

- 3h, done (2026-11-11, báo cáo: [reports/tester-261111-docker-development-smoke.md](reports/tester-261111-docker-development-smoke.md)). Một script chạy Docker thật, chứng minh đường đi trình duyệt → Traefik → gateway → auth → Postgres và Vite + HMR, rồi dọn sạch. Sửa lỗi phát hiện được ngay trong file của phase 01–03 (không mở rộng phạm vi).

## Key Insights

- Smoke phải không đụng stack dev thật của người dùng: `KMAEDU_DEV_PROJECT=kmaedu-dev-smoke-$$`, `KMAEDU_DEV_GEN_DIR` tạm, file `services` và `.env` tạm (biến `KMAEDU_SERVICES_FILE`, `KMAEDU_DEV_ENV_FILE`), cổng lệch (`15173`, `18000`, `15432`, `16379`, `15672`). `trap` dọn `down -v` + xóa thư mục tạm kể cả khi fail.
- `.env` tạm chỉ có `ADMIN_EMAILS=smoke-admin@kmaedu.local`: chứng minh luôn rằng thiếu R2/Gemini/Google không chặn `up`.
- volume `be_node_modules` riêng theo project → lần smoke đầu cài lại toàn bộ (chậm, chấp nhận). Cho phép `KMAEDU_SMOKE_KEEP=1` giữ stack để soi lỗi.

## Requirements

`test/smoke-up.sh` với `services` = `gateway auth fe`:

| # | Kiểm | Kỳ vọng |
|---|---|---|
| 1 | `./project up` | exit 0; `ps` thấy `postgres redis rabbitmq traefik auth gateway-a fe` running, `deps auth-migrate` exited 0; **không** có `content`, `r2`, `gateway-b`, `ai` |
| 2 | `curl :15173/` | 200, `text/html`, có `/@vite/client` |
| 3 | `curl :15173/api/v1/auth/me` | 401 JSON có `code` (gateway trả, không phải Traefik 404/502) |
| 4 | `./project seed` rồi `POST :15173/api/v1/auth/login` với `smoke-admin@kmaedu.local` + `ADMIN_DEFAULT_PASSWORD` đọc từ secrets tạm | 200, `Set-Cookie: accessToken=...; HttpOnly` |
| 5 | `GET :15173/api/v1/auth/me` với cookie vừa nhận | 200, `user.isSystemAdmin == true` |
| 6 | Bắt tay websocket HMR: `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: …' -H 'Sec-WebSocket-Protocol: vite-hmr' :15173/` | `101` |
| 7 | `:18000/_traefik/dashboard/`, `:18000/_rabbitmq/` | 200; cùng đường dẫn trên `:15173` → 404 hoặc rơi vào Vite (không lộ trang quản trị) |
| 8 | `:18000/api/v1/auth/me` | 401 (API có trên cổng backend) |
| 9 | `nc -z 127.0.0.1 15432` / `16379` / `15672`(amqp) | mở |
| 10 | `docker compose exec auth cat /workspace/apps/auth-service/.env` | rỗng (đè `.env` host thành công) |
| 11 | `git status --porcelain kmaedu-be/deploy` | rỗng (không ghi `definitions.json` vào deploy) |
| 12 | `./project down` rồi `docker volume ls` của project smoke (trap `down -v`) | không còn gì |

Kiểm tay (ghi kết quả vào báo cáo phase, không tự động): sửa một chuỗi trong `kmaedu-be/apps/auth-service/src` → log `auth` thấy recompile và restart; sửa một component FE → trang tự cập nhật; một lần `./project up` với đủ 12 khóa, ghi RAM đo được (`docker stats --no-stream`).

## Architecture

```
smoke-up.sh ─▶ (env tạm, project tạm) ─▶ ./project up ─▶ curl qua Traefik :15173/:18000 ─▶ ./project seed ─▶ login ─▶ trap: down -v + rm tmp
```

## Related Code Files

Tạo: `docker-development/test/smoke-up.sh`.
Sửa (chỉ khi smoke lộ lỗi): file đã tạo ở phase 01–03 trong `docker-development/`.

## Implementation Steps

1. Viết `smoke-up.sh` (bash 3.2, `set -euo pipefail`, `trap cleanup EXIT`), hàm `wait_http <url> <code> <timeout>` (poll 2 s, tối đa 600 s cho lần cài đầu).
2. Chạy, sửa lỗi phát sinh, chạy lại tới khi 12 bước xanh.
3. Làm phần kiểm tay, ghi `reports/smoke-<date>.md` (thời gian `up` lần đầu / lần sau, RAM, kết quả hot reload).
4. Chạy lại `./test/run-tests.sh` (bats) và `node --test kmaedu-be/deploy/compose-topology.spec.cjs` trên cây cuối.

## Todo

- [x] smoke-up.sh
- [x] 12 bước xanh
- [x] kiểm tay hot reload BE/FE + RAM full stack
- [x] gate cuối: bats + topology spec + `git diff --exit-code kmaedu-be/deploy`

## Scope Contract

- **Changed:** `docker-development/**` (mới).
- **Impacted:** không có hành vi production. Vùng an toàn quan trọng chạm tới: secret (sinh, lưu, không lộ), config/deploy (đọc, không sửa).
- **Will verify:** bats (unit, bash 3.2) cho logic sinh file và lệnh; `docker compose config` (integration tĩnh) cho overlay + test đầu độc; smoke thật (end-to-end) bước 1–12; topology spec + diff deploy để chứng minh deploy không đổi.
- **Deliberately skipped:** test Jest/Vitest/pytest của service (code không đổi); Linux (không có máy, ghi vào README); seed của content/assessment (không có seed).
- **AC → kiểm:** "`./project up` chạy được dự án" → bước 1–5; "service không ghi thì không chạy" → bước 1; "không đọc env thật" → bats đầu độc + bước 10–11; "Traefik + trang quản trị" → bước 2, 6–8; "thiếu R2 không chặn" → bước 1 với `.env` tạm; "cổng hạ tầng cho tool" → bước 9; "seed + admin" → bước 4–5; "db:reset" → bats phase 03 (smoke không chạy để giữ thời gian, chạy tay một lần và ghi báo cáo).

## Success Criteria

- [x] `docker-development/test/smoke-up.sh` exit 0 hai lần liên tiếp (run D 91 s, run E 63 s, 38/38 PASS; sau fix round chạy lại exit 0, `up` lần hai 6 s).
- [x] Báo cáo smoke có số đo thời gian và RAM (reports/tester-261111-docker-development-smoke.md; login trả 201, không phải 200).

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Đối sách |
|---|---|---|---|
| Smoke đụng cổng của stack dev đang chạy | Trung bình | Thấp | cổng lệch, đổi được bằng biến |
| Lần đầu quá chậm (yarn install × 2 workspace) | Cao | Thấp | timeout 600 s, thông báo tiến độ |
| Rate limit login (5 req/phút) làm fail khi chạy lại nhanh | Thấp | Thấp | chỉ một lần login mỗi lượt |

## Security Considerations

- Mật khẩu admin smoke chỉ đọc từ file secret tạm, không echo; thư mục tạm xóa trong `trap`.

## Next Steps

Phase 05 viết tài liệu theo kết quả đo thật.
