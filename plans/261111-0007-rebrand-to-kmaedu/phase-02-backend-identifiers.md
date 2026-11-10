# Phase 02 — Backend: thư mục, @kmaedu, proto, broker, JWT, DB, deploy

## Context Links
- [plan.md](plan.md) · [phase-01](phase-01-rename-script-and-dry-run.md)

## Overview
Ưu tiên cao. Chạy `rebrand.py --apply` cho cả cây một lần, rồi sửa những chỗ backend mà script không làm được: sinh lại code, cấu hình buf, kiểm tra wiring.

## Key Insights
- `@examio/*` được resolve qua `paths` trong `tsconfig.json`, `moduleNameMapper` trong `jest.config.js` và trong 10 file `apps/*/test/jest-e2e.json`. Không có package npm thật, nên không cần đổi `yarn.lock`.
- `nest-cli.json` chép `proto/examio/**` vào `dist/.../proto/examio/...`. Code nạp proto theo đường dẫn này; sau khi đổi thư mục, đường dẫn đọc proto lúc chạy phải khớp.
- Stub Python nằm trong `apps/ai-service/src/backend/grpc_generated/examio/` và có import tuyệt đối `from examio.r2.v1 import ...`. `gen_grpc.sh` xóa rồi sinh lại thư mục này.
- `proto/buf.yaml` đang có `ignore_only` tạm cho việc gỡ finance. Proto đổi package thì các mục này mất ý nghĩa, xóa luôn.
- buf breaking so với base sẽ báo hỏng toàn bộ (đổi package). Phase 04 thêm label `proto:breaking` để bỏ qua bước này có chủ đích.

## Requirements
- Thư mục `kmaedu-be/`, `kmaedu-be/proto/kmaedu/...`, package `kmaedu.<svc>.v1`.
- Exchange RabbitMQ `kmaedu.events` ở cả Node (`libs/messaging`) lẫn Python (`src/backend/messaging`) và `deploy/rabbitmq/definitions.template.json`.
- JWT mặc định `JWT_ISSUER=kmaedu-auth`, `JWT_AUDIENCE=kmaedu` (code, `.env.example`, compose, README).
- DB `kmaedu` (postgres init, compose, ví dụ `DATABASE_URL`); DB CI `kmaedu_ci`.
- Container `kmaedu-*`, network `kmaedu-edge|internal|egress`, image `ghcr.io/tgiap04/kmaedu-<key>` (`deploy/services.json`, compose).
- Tên miền ví dụ: `FRONTEND_URL=https://kmaedu.fayedark.com`, `GOOGLE_CALLBACK_URL=https://kmaedu.fayedark.com/api/v1/auth/google/callback`, `ADMIN_EMAILS=admin@kmaedu.fayedark.com`.

## Related Code Files
- Đổi tên (script): `examio-be/` → `kmaedu-be/`; `proto/examio/` → `proto/kmaedu/`; `grpc_generated/examio/` → `grpc_generated/kmaedu/`
- Sửa (script, rồi soát): `tsconfig.json`, `jest.config.js`, `apps/*/test/jest-e2e.json`, `nest-cli.json`, `package.json`, `proto/**/*.proto`, `proto/buf*.yaml`, `apps/ai-service/scripts/gen_grpc.sh`, `deploy/**`, `scripts/**`, `libs/**`, `apps/**`, `.env.example`
- Sửa tay: `proto/buf.yaml` (xóa `ignore_only` của finance và gateway/content nếu còn trỏ đường dẫn cũ; giữ lại những mục vẫn cần, đổi sang đường dẫn `kmaedu/...`)

## Implementation Steps
1. `python3 plans/.../scripts/rebrand.py --apply` ở gốc repo. Lưu thống kê vào `reports/apply.txt`. Chạy lại lần hai phải ra 0.
2. `cd kmaedu-be && yarn install --immutable` (lockfile không đổi), `yarn proto:lint`, `yarn proto:gen`, `yarn prisma:generate`.
3. `bash apps/ai-service/scripts/gen_grpc.sh`; `git status` không được còn file nào dưới `grpc_generated/examio`.
4. Sửa `proto/buf.yaml` như trên.
5. `git grep -n "proto/kmaedu\|kmaedu\.events\|kmaedu-auth"`: soát các điểm nối (loader proto lúc chạy, khai báo exchange, JWT) để chắc hai đầu khớp nhau.
6. `docker compose -f deploy/docker-compose.yml config -q` phải chạy được với `deploy/ci-dummy.env.sh`.
7. Kiểm tra nhanh: `yarn typecheck`, `yarn test` (đầy đủ ở phase 07).

## Todo
- [x] `--apply` + lần chạy thứ hai ra 0
- [x] Sinh lại proto TS, Prisma, stub Python
- [x] Dọn `buf.yaml`
- [x] Soát loader proto, exchange, JWT, compose config

## Success Criteria
- `yarn typecheck` và `yarn test` xanh; `yarn proto:lint` xanh.
- `git ls-files kmaedu-be | grep -i examio` rỗng.

## Risk Assessment
- Loader proto đọc đường dẫn cứng `proto/examio` ở chỗ script không nhận ra, ví dụ chuỗi ghép từng phần. Bước 5 kèm `be-boot` ở phase 07 sẽ bắt được.
- Xung đột với nhánh khác đang sửa `examio-be/...`: đổi thư mục gốc làm mọi nhánh mở phải rebase. Merge plan này khi không còn PR backend nào đang mở.

## Security Considerations
Không đọc hay sửa `.env` bị gitignore. Không đổi giá trị secret; chỉ đổi tên mặc định trong file ví dụ.

## Next Steps
Phase 04 cập nhật CI theo thư mục mới.
