# Phase 01 — Lõi sinh file: services, .env, secret, compose.env, compose.yaml + bats

## Context Links

- [plan.md](plan.md), [clarifications.md](clarifications.md)
- Mẫu: `/Users/tgiap.dev/devs/devt/devt-docker-development/{project,lib/common.sh,lib/render-generated.sh,lib/jwt-keys.sh,test/run-tests.sh,test/Dockerfile,test/helpers/test-helper.bash,test/fixtures/expected/compose.yaml}`
- Nguồn biến: `kmaedu-be/deploy/.env.example`, `kmaedu-be/deploy/env/*.env.example`, `kmaedu-be/deploy/compose/*.yml` (`${VAR:?}`), `kmaedu-be/deploy/ci-dummy.env.sh` (cùng ý tưởng "template là nguồn duy nhất")
- Script tái dùng: `kmaedu-be/scripts/gen-jwt-keypair.sh`, `kmaedu-be/scripts/gen-service-secret.sh`

## Overview

- Priority P1 trong plan, status done (2026-11-11), 5h. Bằng chứng: reports/implementer-261111-docker-development.md. Lệch so với plan: `SERVICE_CLIENTS` dựng lúc render từ `*_SERVICE_CLIENT_HASH` trong `secrets.env`, không lưu JSON.
- Viết phần bash thuần (không cần Docker daemon) sinh mọi thứ trong `.generated/`: đọc `services`, đọc `docker-development/.env`, sinh/giữ secret, render `compose.env` + `env/<name>.env` + `compose.yaml`. Kèm khung test bats chạy trong container bash 3.2 như devt.

## Key Insights

- **Include của compose tự nạp `.env` trong `project_directory` khi entry không khai `env_file`.** Include thẳng `deploy/docker-compose.yml` thì các include lồng bên trong (không có `env_file`) sẽ nạp `deploy/.env` thật. Vì vậy generator include từng `deploy/compose/<x>.yml` (lấy danh sách từ các dòng `- path: compose/...` của `deploy/docker-compose.yml`) và **luôn** ghi `env_file:` tường minh. File compose mới thêm vào deploy tự được nhận; thiếu overlay dev tương ứng thì `up` dừng (nếu không, service đó sẽ trỏ `env_file: env/<x>.env` thật).
- Template là nguồn đầy đủ (CI `ci-dummy.env.sh` đã dựa vào điều này): mọi dòng `KEY=` không comment trong `deploy/.env.example` và `deploy/env/<name>.env.example` phải có một dòng trong file sinh ra. Key không có luật → giá trị rỗng + cảnh báo một lần (không chết), trừ khi key nằm trong `${KEY:?}` của compose → chết, nêu tên key.
- JWT private key là PEM một dòng có `\n` (auth tự chuẩn hóa). Trong env file của compose, giá trị không trích dẫn được giữ nguyên `\n`; `SERVICE_CLIENTS` là JSON nên ghi trong nháy đơn (literal, không nội suy `$`).
- Secret phải **ổn định**: script init Postgres chỉ chạy trên volume rỗng. Mất `secrets.env` mà volume `<project>_postgres_data` còn → mật khẩu lệch. Phase 03 kiểm tra trường hợp này; phase này cung cấp hàm `secrets_exist`.
- Tên client trong `SERVICE_CLIENTS` khác tên biến: `STUDYROOM_SERVICE_CLIENT_SECRET` ↔ `studyroom`, `AICHAT_SERVICE_CLIENT_SECRET` ↔ `ai-chat`.
- `AI_FREE_MODE` không còn ai đọc (git grep rỗng): không sinh.

## Requirements

Functional
- `services`: mỗi dòng một khóa, bỏ dòng trống và `#`, cho phép comment cuối dòng, bỏ trùng; khóa lạ → chết kèm danh sách hợp lệ; file rỗng → chết ("không có service nào"). Bảng khóa → service compose: `gateway→gateway-a`, `ai→ai ai-worker`, còn lại cùng tên (`auth admin content assessment study-room vocabulary document ai-chat r2 fe`).
- `.env` người dùng: đọc `KEY=VALUE` không `eval`/`source`; chấp nhận nháy đơn/kép bao ngoài; giá trị chứa `'` hoặc xuống dòng → chết, nêu key. File không có → coi như rỗng (phase 03 chép từ `.env.example`).
- Secret (`.generated/secrets.env`, quyền 600): `POSTGRES_PASSWORD`, 9 `*_DB_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_PASS` + 8 `RABBITMQ_<SVC>_PASS`, `JWT_KID`, `JWT_PRIVATE_KEY`, 8 `*_SERVICE_CLIENT_SECRET` + `SERVICE_CLIENTS`, `REFRESH_TOKEN_ENC_KEY`, `QUIZ_JWT_SECRET`, `QUIZ_AES_KEY` (đúng 32 ký tự), `ADMIN_DEFAULT_PASSWORD` sinh (≥ 24 ký tự) nếu `.env` không đặt. Chỉ sinh key còn thiếu; không bao giờ ghi đè key đã có.
- Sinh bằng `docker run --rm kmaedu-dev-node:local` chạy đúng hai script trong `kmaedu-be/scripts` (mount read-only) — một nguồn logic, không cần openssl trên máy. Hàm chạy được inject (`KMAEDU_DEV_TOOL_RUNNER`) để bats thay bằng openssl local.
- Render: `compose.env`, `env/<name>.env` (tên lấy từ `deploy/env/*.env.example`), `compose.yaml`, `empty.env` (file rỗng dùng để che `.env` của host, xem phase 02). Ghi atomic (temp + mv), `umask 077`.

- Đường dẫn đổi được bằng biến (bats và smoke cần): `KMAEDU_SERVICES_FILE` (mặc định `docker-development/services`), `KMAEDU_DEV_ENV_FILE` (mặc định `docker-development/.env`), `KMAEDU_DEV_GEN_DIR`, `KMAEDU_BE_DIR` (mặc định `<repo>/kmaedu-be`, test đầu độc trỏ sang bản sao).

Non-functional
- bash 3.2 (không `declare -A`, không `${x,,}`, không `mapfile`), shellcheck sạch, mỗi file < 200 dòng.

### Bảng nguồn giá trị (inventory)

| Key | Nguồn |
|---|---|
| `FRONTEND_URL` | `http://localhost:${KMAEDU_WEB_PORT}` |
| `POSTGRES_USER`, `POSTGRES_DB` | hằng `kmaedu` |
| `POSTGRES_PASSWORD`, `{AUTH,ADMIN,CONTENT,ASSESSMENT,STUDYROOM,VOCABULARY,AICHAT,DOCUMENT,AI}_DB_PASSWORD`, `REDIS_PASSWORD` | secret (`hex 24`) |
| `RABBITMQ_USER` | hằng `kmaedu`; `RABBITMQ_PASS`, `RABBITMQ_{AUTH,CONTENT,ASSESSMENT,STUDYROOM,DOCUMENT,AI,GATEWAY,AICHAT}_PASS` secret |
| `JWT_PRIVATE_KEY`, `JWT_KID` | secret qua `gen-jwt-keypair.sh`; `JWT_RETIRED_PUBLIC_KEYS` rỗng; `JWT_ISSUER`/`JWT_AUDIENCE` mặc định template |
| `SERVICE_CLIENTS`, `{CONTENT,ASSESSMENT,STUDYROOM,VOCABULARY,DOCUMENT,AICHAT,ADMIN,GATEWAY}_SERVICE_CLIENT_SECRET` | secret qua `gen-service-secret.sh` |
| `R2_PUBLIC_URL` | `.env`; `R2_ALLOWED_HOSTS` = `.env` hoặc suy từ host của `R2_ENDPOINT` |
| auth: `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `.env` (rỗng được) |
| auth: `ADMIN_DEFAULT_PASSWORD` | `.env`, không có thì secret |
| auth: `REFRESH_TOKEN_ENC_KEY` | secret (`hex 32`) |
| auth: `GOOGLE_CALLBACK_URL` | `http://localhost:${KMAEDU_WEB_PORT}/api/v1/auth/google/callback` |
| auth: `EMAIL_USER`, `EMAIL_PASS` | rỗng (overlay đặt `MAIL_TRANSPORT=json`) |
| r2: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL` | `.env` |
| ai: `GEMINI_API_KEYS`, `GEMINI_MODEL_NAMES`, `AI2_API_KEY` | `.env` |
| assessment: `QUIZ_JWT_SECRET`, `QUIZ_AES_KEY` | secret |
| content/assessment: `TURNSTILE_SECRET_KEY` | `.env`, mặc định secret test Cloudflare `1x0000000000000000000000000000000AA` (Turnstile vẫn bị bỏ qua ngoài production trừ khi `TURNSTILE_ENFORCE=1`) |
| fe (biến riêng của overlay, ghi vào `compose.env`) | `VITE_TURNSTILE_SITE_KEY` (mặc định `1x00000000000000000000AA`), `VITE_GOOGLE_CLIENT_ID` (= `GOOGLE_CLIENT_ID`), `VITE_MEASUREMENT_ID` rỗng |
| biến của overlay | `KMAEDU_REPO_ROOT`, `KMAEDU_DEV_DIR`, `KMAEDU_DEV_GEN_DIR`, `KMAEDU_DEV_PROJECT`, 5 cổng `KMAEDU_*_PORT`, `KMAEDU_WATCH_POLL` (`true`/`false`) |

Key `.env` thiếu (R2, Gemini, Google, `ADMIN_EMAILS`): `up` in một khối cảnh báo liệt kê tính năng sẽ lỗi, không dừng.

## Architecture

```
services ──parse──▶ danh sách khóa ──map──▶ service compose ─┐
.env ─────read────▶ giá trị người dùng ────────────────────┐ │
secrets.env ◀─ensure─ gen-*.sh (image dev) ───────────────┐│ │
deploy/.env.example + env/*.env.example ─keys─▶ render_env ┴┴─▶ compose.env, env/<name>.env
deploy/docker-compose.yml ─include paths─▶ render_compose ──▶ compose.yaml
                                     (mỗi entry: [deploy/compose/x.yml, compose/x.dev.yaml] + project_directory + env_file)
compose/dev-extras.yaml (deps, traefik, fe) ──────────────────▶ entry riêng trong compose.yaml
```

`compose.yaml` mẫu (đường dẫn tuyệt đối, kiểm ký tự `" \ $` newline như devt):

```yaml
# Generated by docker-development - do not edit.
name: kmaedu-dev
include:
  - path: ["<BE>/deploy/compose/infra.yml", "<DEV>/compose/infra.dev.yaml"]
    project_directory: "<BE>/deploy"
    env_file: "<GEN>/compose.env"
  # ... một entry cho mỗi file trong deploy/docker-compose.yml
  - path: "<DEV>/compose/dev-extras.yaml"
    project_directory: "<BE>/deploy"
    env_file: "<GEN>/compose.env"
```

## Related Code Files

Tạo (đều trong `docker-development/`):
- `project` (khung: resolve symlink, source lib, `usage`, dispatcher; phase 01 chỉ có lệnh ẩn `render`)
- `lib/common.sh` (log/warn/die, đường dẫn, `dc()`, `write_file_atomic`, kiểm cổng 1–65535 và `WEB != HTTP`)
- `lib/services-file.sh` (parse + map + `needed_services`)
- `lib/dotenv-reader.sh` (`dotenv_get <file> <key>`, `dotenv_keys <file>`)
- `lib/local-secrets.sh` (`ensure_secrets`, `secrets_exist`, runner inject được)
- `lib/render-env-files.sh` (bảng luật trên → `compose.env`, `env/<name>.env`)
- `lib/render-compose-include.sh`
- `services.example`, `.env.example`, `.gitignore` (`.generated/`, `services`, `.env`)
- `test/Dockerfile`, `test/run-tests.sh`, `test/helpers/test-helper.bash`
- `test/services-file.bats`, `test/dotenv-reader.bats`, `test/local-secrets.bats`, `test/render-env-files.bats`, `test/render-compose-include.bats`

Sửa / xóa: không.

## Implementation Steps

1. Chép khung `project`, `lib/common.sh`, `test/Dockerfile` (bash:3.2 + bats + shellcheck + docker-cli-compose + openssl), `test/run-tests.sh` từ devt; đổi tiền tố `DEVT_` → `KMAEDU_` / `KMAEDU_DEV_`.
2. Viết test RED cho từng lib trước (bảng Test matrix), rồi code cho xanh.
3. `services-file.sh`: parse bằng `while IFS= read -r`, cắt comment `#`, trim; map qua `case`.
4. `dotenv-reader.sh`: `KEY=VALUE` (chỉ `^[A-Z][A-Z0-9_]*=`), bỏ `export ` đầu dòng, gỡ một cặp nháy bao ngoài.
5. `local-secrets.sh`: đọc file hiện có, sinh key thiếu, append; `hex N` qua runner; JWT + service secret gọi hai script trong image (`docker run --rm -v <BE>/scripts:/s:ro kmaedu-dev-node:local bash /s/gen-...`). `SERVICE_CLIENTS` ghép từ các `SERVICE_CLIENTS_ENTRY`.
6. `render-env-files.sh`: lặp key của template, áp luật, ghi `KEY='value'` (giá trị đã kiểm không chứa `'`), riêng `JWT_PRIVATE_KEY` không nháy. Kiểm mọi `${VAR:?` trong `deploy/compose/*.yml` có giá trị khác rỗng.
7. `render-compose-include.sh`: đọc `- path: compose/<x>.yml` từ `deploy/docker-compose.yml`; với mỗi `<x>` cần `compose/<x>.dev.yaml` (thiếu → chết, nêu file và lý do secret); thêm entry `dev-extras.yaml`.
8. Lệnh ẩn `./project render` gọi đủ chuỗi trên (để debug và cho phase 02 dùng).
9. `./test/run-tests.sh` xanh, shellcheck sạch.

## Todo

- [x] Khung `project` + `lib/common.sh` + harness bats
- [x] services-file + test
- [x] dotenv-reader + test
- [x] local-secrets + test (idempotent, quyền 600, runner giả)
- [x] render-env-files + test (đủ key template, `${VAR:?}` không rỗng, thiếu R2 chỉ cảnh báo)
- [x] render-compose-include + test (env_file luôn có, thiếu overlay → chết)
- [x] `services.example`, `.env.example`, `.gitignore`

## Test matrix

| Mức | Cái chứng minh |
|---|---|
| Unit (bats) | parse `services`: comment, dòng trống, trùng, khóa lạ, file rỗng, `gateway→gateway-a`, `ai→ai ai-worker` |
| Unit (bats) | `.env`: nháy, `=` trong giá trị, `export`, giá trị có `'` → chết, thiếu file → rỗng |
| Unit (bats) | secret: lần 2 không đổi giá trị, chỉ thêm key thiếu, file 600, `QUIZ_AES_KEY` dài 32, `SERVICE_CLIENTS` là JSON hợp lệ có đúng 8 tên và hash = sha256(secret) |
| Unit (bats) | render env: mọi `KEY=` không comment của template thật có mặt; mọi `${VAR:?}` không rỗng; thiếu R2/Gemini → cảnh báo, exit 0; `FRONTEND_URL`/`GOOGLE_CALLBACK_URL` theo `KMAEDU_WEB_PORT`; `R2_ALLOWED_HOSTS` suy từ `R2_ENDPOINT` |
| Unit (bats) | compose include: khớp golden `test/fixtures/expected/compose.yaml`; mỗi entry có `env_file` và `project_directory`; file deploy thiếu overlay → chết; đường dẫn có `"`/`$` → chết |

## Success Criteria

- [x] `./test/run-tests.sh` exit 0 trong container bash 3.2; shellcheck không cảnh báo (cuối: 100/100, shellcheck bash + sh sạch).
- [x] Chạy `./project render` hai lần: `secrets.env` giống hệt (so sha256), các file khác ổn định (implementer report).
- [x] `grep -c` key trong `compose.env` ≥ số key không comment của `deploy/.env.example` (56 ≥ 40).

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Đối sách |
|---|---|---|---|
| Đọc nhầm `deploy/.env` thật qua include mặc định | Trung bình | Cao | `env_file` tường minh mọi entry; test "đầu độc" ở phase 02 |
| Template thêm key mới không có luật | Cao (theo thời gian) | Thấp/Trung bình | key rỗng + cảnh báo; key `:?` → chết rõ ràng |
| Định dạng env file (PEM `\n`, JSON, `$`) bị compose hiểu sai | Trung bình | Cao | nháy đơn, kiểm bằng `docker compose config` trong bats (CLI có trong image test, không cần daemon) |
| bash 4 lọt vào | Trung bình | Trung bình | test chạy trong `bash:3.2` |

## Security Considerations

- `.generated/` quyền 700, file 600; gitignore; không in secret ra log (chỉ in tên key và đường dẫn file).
- Không bao giờ mở `deploy/.env`, `deploy/env/*.env`, `kmaedu-be/.env`, `apps/*/.env`; chỉ đọc `*.example`.
- Secret dev là ngẫu nhiên thật (không hằng số) dù chỉ dùng local, để không ai chép nhầm sang môi trường thật.

## Next Steps

Phase 02 viết overlay dùng các biến trong bảng "biến của overlay" và các file `env/<name>.env`.
