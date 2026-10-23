# [CLAUDE.md](http://CLAUDE.md)

Tệp này cung cấp hướng dẫn cho Claude Code (claude.ai/code) khi làm việc với mã nguồn trong repository này.

## Cấu trúc repository

- Repository này được chia thành ba workspace chính:
  - `examio-be/`: repository backend polyglot gồm các microservice NestJS và một AI service viết bằng Python.
  - `examio-fe/`: frontend React 19 + Vite.
  - `examio-app/`: mobile app Kotlin Multiplatform (Android Jetpack Compose + iOS SwiftUI), dùng chung business logic/networking qua module `shared/`. Gọi lại API hiện có của backend, không có backend riêng cho mobile. Xem `examio-app/user-stories.md` cho phạm vi tính năng.
- Hãy xem backend, frontend và mobile app là ba package root riêng biệt. Chạy lệnh trong đúng thư mục con thay vì ở thư mục gốc repository.
- Không có package manager workspace dùng chung ở thư mục gốc cho các app.
- **[QUAN TRỌNG]** Khi sửa UI trên mobile thì cần sửa cả `iosApp` và `androidApp` trong `examio-app/` để đảm bảo feature parity (đã ghi trong CLAUDE.md § Note ở cuối file).

## Các tệp hướng dẫn hiện có

- `AGENTS.md` đã tồn tại ở thư mục gốc repo và đã ghi lại các convention quan trọng, riêng cho repo này. Hãy đọc nó trước khi thực hiện thay đổi lớn.
- Không có `CLAUDE.md` nào trước đó khi tệp này được tạo.
- Không tìm thấy Cursor rules trong `.cursor/rules/` hoặc `.cursorrules`.
- Không tìm thấy Copilot instructions trong `.github/copilot-instructions.md`.

## Các lệnh thường dùng

### Backend (`examio-be`)

```bash
cd examio-be
yarn install
yarn build
yarn test
yarn test:watch
yarn test:cov
yarn test:debug
yarn dev:auth
yarn dev:exam
yarn dev:study-room
yarn dev:vocabulary
yarn dev:finance
yarn dev:gateway
yarn dev:r2
yarn dev:admin
yarn dev:ai
yarn dev:all
yarn proto:lint
yarn proto:gen
yarn prisma:generate               # sinh client cho mọi apps/*/prisma (scripts/prisma-generate.sh) vào apps/<svc>-service/src/generated/prisma (gitignore)
PRISMA_ADMIN_URL=... scripts/prisma-migrate-dev.sh <auth|finance|admin|exam|studyroom|vocabulary> <name>   # tạo migration (chỉ local; = yarn prisma:migrate)
yarn prisma:deploy <svc>           # prisma migrate deploy cho schema của service
yarn prisma:status <svc>
scripts/prisma-schema-path.sh <svc>   # in đường dẫn schema của service
yarn seed:dev                      # seed:dev:auth → finance → admin → exam → vocabulary (mỗi seed đọc DATABASE_URL / <SVC>_DATABASE_URL)
yarn prisma:seed                   # seed:admin + seed:exam + seed:vocabulary
yarn bootstrap:admin               # đồng bộ ADMIN_EMAILS (auth-service CLI)
yarn bootstrap:admin:list
yarn bootstrap:admin:grant <email> [--teacher]
yarn bootstrap:admin:revoke <email>
yarn finance:reconcile-teachers    # đảm bảo mỗi TEACHER có ví (finance-service CLI)
yarn check:ownership               # mỗi model Prisma chỉ một service đọc/ghi (scripts/check-model-ownership.ts --strict; CI chạy)
yarn check:deps                    # dependency-cruiser (.dependency-cruiser.cjs) chặn import chéo giữa service; CI chạy
scripts/gen-jwt-keypair.sh         # in JWT_KID + JWT_PRIVATE_KEY (không commit)
scripts/gen-service-secret.sh <exam|studyroom|vocabulary|finance|admin>  # in secret + hash cho SERVICE_CLIENTS
```

### Chạy một test backend cụ thể

```bash
cd examio-be
yarn test apps/auth-service/src/auth-service.controller.spec.ts
yarn test --testNamePattern="AuthServiceController"
yarn test --runInBand apps/exam-service/src/exam-service.controller.spec.ts
```

### Chạy e2e test backend trực tiếp

```bash
cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/exam-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/finance-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/app.e2e-spec.ts
```

Môi trường test: `examio-be/jest.config.js` và mọi `test/jest-e2e.json` nạp `test/jest-env.setup.js` (setupFiles) đặt `NODE_ENV=test` và `MAIL_TRANSPORT=json`, nên jest không bao giờ gửi mail thật dù shell hay `.env` có `EMAIL_USER`/`EMAIL_PASS`. Khi chạy service local mà không muốn gửi mail thật, đặt `MAIL_TRANSPORT=json`; production (`NODE_ENV=production`) bắt buộc có `EMAIL_USER` và `EMAIL_PASS` (transport tạo lười ở lần gửi đầu, `libs/common/src/config/mail.config.ts`). Quản lý role/ban qua admin UI (`/admin/roles`) không có lệnh riêng; CLI `yarn bootstrap:admin*` vẫn là đường cấp admin đầu tiên.

### Frontend (`examio-fe`)

```bash
cd examio-fe
yarn install
yarn dev
yarn build
yarn start
yarn lint
yarn lint:fix
yarn test        # vitest run (src/**/*.test.ts, môi trường node)
```

Ghi chú:

- Frontend dev server chạy trên port `5173` qua `vite --host 0.0.0.0 --port 5173`.
- Frontend có `yarn test` (vitest, cấu hình `vitest.config.ts`); test hiện tập trung vào logic thuần trong `src/lib/**` (rbac, quiz-practice, admin-roles).
- `src/types/permissions.generated.ts` được sinh từ `examio-be/libs/auth-jwt/src/permissions.ts`: không sửa tay, chạy `yarn gen:fe-permissions` trong `examio-be` sau khi đổi catalog; CI job `fe-permissions-drift` fail nếu file lệch.

### Python AI service (`examio-be/apps/ai-service`)

Script backend `yarn dev:ai` giả định rằng virtualenv đã tồn tại tại `examio-be/apps/ai-service/venv`.

```bash
cd examio-be/apps/ai-service
./venv/bin/uvicorn src.backend.main:app --reload --port 8000
./venv/bin/ruff check src
./venv/bin/black src
./venv/bin/isort src
```

Nếu `pytest` đã được cài trong môi trường local, có thể chạy một test riêng như sau:

```bash
cd examio-be/apps/ai-service
./venv/bin/pytest src/score/test_score_tool.py
```

## Hạ tầng local

- File docker compose dùng cho production/deploy của backend là `examio-be/deploy/docker-compose.yml`.
- Cấu hình compose đó bao gồm PostgreSQL, Redis, RabbitMQ, gateway, auth, exam, study-room, vocabulary, finance, admin, r2, ai và các container migration one-shot `<svc>-migrate` (auth, finance, admin, exam, study-room, vocabulary). Compose chia theo service trong `deploy/compose/*.yml`, ghép bằng `include:` trong `docker-compose.yml`.
- Backend hiện được thiết kế xoay quanh PostgreSQL + Redis + RabbitMQ cho persistence và messaging.
- Compose dùng 3 network: `edge` (gateway + nginx FE), `internal` (không ra ngoài; mọi service + postgres/redis/rabbitmq) và `egress`. Postgres/Redis/RabbitMQ không publish port ra host; gateway chỉ publish `127.0.0.1:6369` (dev local chạy `yarn dev:gateway` vẫn dùng port `PORT` trong `.env`). Truy cập DB: `docker compose exec postgres psql ...` (hoặc `psql postgresql://<svc>_svc:…@…/examio` bằng role của service). Chi tiết: `examio-be/deploy/README.md`.
- Cookie auth chỉ do auth-service set: `accessToken` và `refreshToken` (HttpOnly, SameSite=Lax, Secure ở production); cookie cũ `token`/`session_id` chỉ bị xóa khi logout. `POST /auth/refresh` xoay refresh token mỗi lần gọi và set lại cả hai cookie (token cũ chỉ còn hiệu lực trong khoảng grace ngắn). Route credential (login, register, ...) giới hạn 5 req/phút.
- `examio-be/docker-compose.example.yml` có tồn tại nhưng chỉ mô tả một service tối giản kiểu frontend và không phản ánh đầy đủ stack backend.

## Kiến trúc backend

### Topology các service

Backend là một root package dùng Yarn, tổ chức theo kiểu Nest monorepo với nhiều service nằm trong `examio-be/apps/`:

- `gateway-service`: điểm vào HTTP public; streaming proxy cấu hình bằng YAML (`apps/gateway-service/config/routes.yaml`), verify JWT, kiểm tra revoke/stale (Redis), rate limit, WS upgrade `/ws/study`. Không có DB và không còn proxy controller.
- `auth-service`: xác thực, OAuth providers, quản lý profile/session/device và các gRPC endpoint liên quan auth.
- `exam-service`: domain chính cho thi cử và học tập (quiz, flashcard, exam room/session, AI chat/generation, document). Không còn gRPC server; study room và word-family đã tách ra hai service dưới đây.
- `study-room-service`: phòng học chung. HTTP `/api/v1/studyrooms/*` và Socket.io `/ws/study` (Redis adapter `key: 'studyroom'`). Consume `auth.user.authz_changed` (gửi `auth:reauth` rồi ngắt socket) và `auth.user.updated` (xóa cache profile) trên queue `studyroom.events` ngay trong process API. Một container, không có gRPC server, không có env `ROLE`; có SIGTERM drain.
- `vocabulary-service`: word family. HTTP `/api/v1/word-family/*` (trừ `POST /api/v1/word-family/:id/to-flashcard`, vẫn ở exam) và gRPC `examio.vocabulary.v1` (`WordFamilyAdminService` cho admin, `WordFamilyService.GetWordFamily` cho exam; proto `proto/examio/vocabulary/v1/word_family.proto`). Chạy `ROLE=api,worker` trong một process (worker = poller `r2_delete_tasks`). Không dùng RabbitMQ.
- `finance-service`: ví, thanh toán, subscription và luồng khởi tạo ví theo event.
- `r2-service`: service lưu trữ tệp.
- `ai-service`: FastAPI service viết bằng Python cho RAG, OCR/xử lý tài liệu và các luồng AI chat/generation.

### Shared backend libraries

Mã hạ tầng dùng chung nằm trong `examio-be/libs/`:

- `@examio/common`: export các Nest module dùng chung, mail/password/id services, event helpers, utils (gRPC client helpers và file protobuf đã chuyển sang `@examio/grpc`, `@examio/contracts` và thư mục `examio-be/proto/`).
- Không còn `@examio/database`: mỗi service sở hữu DB schema riêng (xem "Hình dạng dữ liệu"); Prisma module nằm trong `apps/<svc>-service/src/prisma` (adapter `PrismaPg`, pool 5, có `ReadinessCheck` cho DB).
- `@examio/redis`: Redis module/service dùng chung; `RedisUnavailableFilter` (exam-service đăng ký global) đổi lỗi mất kết nối Redis trên HTTP thành 503 `SERVICE_UNAVAILABLE`, và client subscriber có listener `error`.
- `@examio/contracts`: type/decorator gRPC sinh bằng ts-proto từ `examio-be/proto/examio/<svc>/v1` (buf). Thư mục `libs/contracts/src/generated/` bị gitignore; chạy `yarn proto:gen` sau khi clone hoặc sửa `.proto` (`yarn proto:lint` để lint). Python ai-service sinh stub bằng `apps/ai-service/scripts/gen_grpc.sh`.
- `@examio/grpc`: gRPC client module, deadline/retry, ánh xạ lỗi gRPC, metadata helper.
- `@examio/http`: HTTP error envelope filter dùng chung.
- `@examio/auth-jwt`: authn/authz stateless dùng chung (thay `AuthGuard`/`AdminGuard` cũ của `@examio/common`): verify JWT RS256 qua JWKS của auth (không query DB mỗi request), `JwtAuthGuard` → `PermissionsGuard` deny-by-default đăng ký global bởi `AuthJwtModule.forRoot({ serviceName })`, decorator `@Public`/`@Authenticated`/`@AllowUnverified`/`@RequirePermissions`/`@RequireOwnerOrPermission`/`@ServiceOnly`/`@RequirePermissionsOrService`, catalog permission + `ROLE_PERMISSIONS` trong `libs/auth-jwt/src/permissions.ts`, `ServiceTokenClient` (service token), `assertSelfOrService` (chống IDOR cho RPC có `user_id`). Route mới không khai báo decorator sẽ bị 403 `NO_AUTHZ_DECLARED`.
- Endpoint mới trong exam/finance/admin/r2: khai báo đúng một decorator — `@RequirePermissions('<perm>')` (mặc định), `@RequireOwnerOrPermission(perm, OwnerResolver)` khi chủ sở hữu cũng được vào (ví dụ giáo viên xem trước bộ thẻ của mình), hoặc `@Public()`. `@Authenticated()` trơn chỉ dành cho handler nằm trong `examio-be/test/authz/authenticated-allowlist.ts` và phải có spec 2 user (hoặc `selfScoped`). `yarn test test/authz` sẽ fail nếu thiếu khai báo (cả HTTP lẫn WS gateway). Resource không thuộc người gọi trả 404 (không lộ tồn tại), thiếu quyền mới trả 403; check truy cập chỉ dựa vào `isPublic`/`whitelist`/code/`ownerId`, không đọc role của chủ sở hữu. Mã truy cập 6 số đi qua `modules/common/access-code-guard.ts` (khóa 5 lần sai/15 phút), tìm user qua `modules/common/user-search.service.ts`. Chi tiết: `docs/system/permissions.md` § Per-endpoint enforcement.
- `@examio/messaging`: envelope v1, transactional outbox (`outbox_events`) + relay claim-then-publish, consumer idempotent (`processed_events`, `@EventHandler`), validate `source`, một tầng retry 30s + DLQ theo service (`<svc>.dlq`), purge hằng ngày, env `ROLE` (`api` | `worker` | `api,worker`). Auth và finance dùng lib này; exam/ai vẫn dùng module events cũ trong `@examio/common`.

Ưu tiên dùng các shared library này thay vì lặp lại code hạ tầng trong từng service.

### Mẫu giao tiếp giữa các service

Backend không phải là một monolith duy nhất dù các service dùng chung Prisma và shared libs.

- Gateway public các HTTP route và đẩy request xuống downstream service theo bảng route trong `examio-be/apps/gateway-service/config/routes.yaml` (một dispatcher duy nhất + `http-proxy-middleware`, stream body, không body parser). **Thêm route mới = sửa `routes.yaml`** (upstream, `auth`, `permissions`, `pageFlag`, `maxBodySize`, `timeout`, `rateLimits`), không tạo controller.
- Auth, finance, vocabulary, admin và storage giao tiếp qua gRPC (exam chỉ là client, không còn gRPC server) client/proto từ `@examio/grpc` và `@examio/contracts` (URL qua env `AUTH_GRPC_URL`, `R2_GRPC_URL`, `FINANCE_GRPC_URL`, `GATEWAY_GRPC_URL`, `VOCABULARY_GRPC_URL`, `ADMIN_GRPC_URL`; container dùng HTTP `3000` / gRPC `50051`, `GRPC_PORT`).
- **Mỗi model Prisma do đúng một service sở hữu** (map trong `examio-be/scripts/check-model-ownership.ts`; DB vẫn dùng chung). Service khác không đọc/ghi model đó (kể cả qua `include`/`select`/nested write): gọi RPC của owner. `yarn check:ownership` và `yarn check:deps` chạy trong CI; model mới phải thêm vào map.
- Các workflow bất đồng bộ giữa service dùng RabbitMQ: auth/finance qua `@examio/messaging` (outbox, event `auth.user.registered` không còn consumer, `auth.user.authz_changed` do finance consume); study-room cũng dùng `@examio/messaging` (chỉ consume; vocabulary không có RabbitMQ); exam/ai còn dùng events module cũ. Mỗi service có RabbitMQ user riêng (`RABBITMQ_URL` riêng; mật khẩu `RABBITMQ_<SVC>_PASS` phải URL-safe) chỉ được publish routing key của domain mình; user/permission render từ `deploy/rabbitmq/definitions.template.json` bởi container one-shot `rabbitmq-defs` (`definitions.json` bị gitignore). RabbitMQ 3.13.
- Ví dụ từ wiring hiện tại:
  - gateway biết URL của downstream service qua env `AUTH_SERVICE_URL`, `EXAM_SERVICE_URL`, `FINANCE_SERVICE_URL`, `ADMIN_SERVICE_URL` (nội suy vào `routes.yaml`).
  - auth gọi gRPC `GatewayControl` của gateway (`RevokeSession`, `InvalidateUser`; `GATEWAY_GRPC_URL`, `GATEWAY_CONTROL_ENABLED`); gateway còn consume bền `auth.user.authz_changed` và `auth.session.revoked` (queue `gateway.events`, `RABBITMQ_GATEWAY_PASS`). Redis keys: `gw:revoked:sid:*`, `gw:user:*:av`, `gw:rl:*`.
  - service-to-service: caller lấy service token từ auth (`POST /internal/token`, env `AUTH_TOKEN_URL`, `SERVICE_CLIENT_SECRET`) và gửi trong gRPC metadata `authorization`; admin-service gọi auth gRPC (`AUTH_GRPC_URL`: `SetUserRole`, `SetSystemAdmin`, `SetUserStatus`, `ListUsers`, `ListRoleChanges`) kèm token của admin đang thao tác (màn `/admin/roles`, ban/unban).
  - exam đăng ký R2 client và dùng finance client chung ở `libs/grpc` (`FinanceClient`): `WalletService.Debit`/`Credit`/`Refund` mang `idempotency_key` (lặp lại cùng key → `already_applied`, khác nội dung → `IDEMPOTENCY_KEY_REUSED`); `UpdateBalance` đã bị xóa. exam chuyển tiếp access token của người gọi khi `Debit`; finance chỉ tạo ví chào mừng khi token là TEACHER. `AI_FREE_MODE` chỉ có tác dụng ngoài production (production luôn bị ép tắt). Exam cũng gọi auth `GetPublicProfilesByIds` (`AUTH_GRPC_URL`) để gắn tên/avatar user vào response (client + cache + tombstone dùng chung ở `libs/grpc/src/clients/{public-profile.client,public-profile-cache,public-user,user-enricher}.ts`, prefix cache do từng service truyền vào: exam `exam:cache:user:<id>`, study-room `studyroom:cache:user:<id>`, TTL 600s, xóa khi nhận `auth.user.updated`; không trả email; user/host có thể `null`). Consumer `auth.user.updated` của exam đăng ký trong `modules/user-profile/user-profile.module.ts`.
  - finance tạo ví cho TEACHER qua handler `auth.user.authz_changed` (không còn dùng `auth.user.registered`).
  - admin-service không đụng DB của service khác: gọi auth (`AuthUserService`: `UpdateUserAdmin`, `SearchUsers`, `GetUserStats`, `GetUserAdminDetail`), finance (`FinanceAdminService` cần `finance:admin`, `FinanceStatsService.GetRevenueStats`), gateway (`SetPageFlags`) và vocabulary (`WordFamilyAdminService`, `VOCABULARY_GRPC_URL=vocabulary:50051`) bằng token admin được chuyển tiếp (`AUTH_TOKEN_URL`, `SERVICE_CLIENT_SECRET`); gateway lúc boot kéo `AdminService.GetPageFlags` từ admin (`ADMIN_GRPC_URL`, token service `gateway` qua `GATEWAY_SERVICE_CLIENT_SECRET`; hash `gateway` phải có trong auth `SERVICE_CLIENTS`).
  - AI chat trong exam cũng đăng ký finance subscription gRPC client.
  - exam → vocabulary: `POST /api/v1/word-family/:id/to-flashcard` nằm ở exam (`modules/flashcardset/word-family-to-flashcard.*`), đọc word family qua gRPC `WordFamilyService.GetWordFamily` (`VOCABULARY_GRPC_URL`, token service audience `vocabulary` nên auth `SERVICE_AUDIENCES` phải có `vocabulary`; `test/cross-app/service-audiences.spec.ts` canh điều này) và gán trước id cho card để không nối nhầm card của user khác. Gateway: route `wf-to-flashcard` (POST) khớp trước prefix `word-family`; upstream tên `studyroom` / `vocabulary` (`STUDYROOM_SERVICE_URL`, `VOCABULARY_SERVICE_URL`).
  - study-room-service: bắt buộc `FRONTEND_URL` ở production (CORS cho WS; thiếu thì service từ chối khởi động); user broker `studyroom` (`RABBITMQ_STUDYROOM_PASS`); secret `STUDYROOM_SERVICE_CLIENT_SECRET` và entry `studyroom` trong auth `SERVICE_CLIENTS`; Redis prefix `studyroom:`. PUT phòng bởi người không phải host trả 403 (hành vi giữ nguyên khi chuyển; ánh xạ 404 để sau).
  - vocabulary-service: secret `VOCABULARY_SERVICE_CLIENT_SECRET` và entry `vocabulary` trong auth `SERVICE_CLIENTS`; Redis prefix `vocab:`. Sinh word family bằng AI gọi ai-service qua HTTP với `INTERNAL_SERVICE_TOKEN` (tạm đến phase 13), miễn phí, chỉ TEACHER, tối đa 20 lần/ngày.

Khi thay đổi ranh giới giữa các service, hãy kiểm tra đồng thời route trong `routes.yaml`, gRPC contract, event publisher/consumer và các service URL cấu hình qua env.

### Cách tổ chức domain bên trong service

Các Nest service chủ yếu đi theo cấu trúc feature-module, không phải chỉ là một cặp controller/service phẳng.

- `exam-service` là domain service lớn nhất. `ExamServiceModule` ghép nhiều module chức năng như quiz set, flashcard, exam room, exam session, exam attempt, cheating log, subject, AI generation, AI chat, statistics, student, finance client integration và R2 integration.
- `auth-service` ghép `AuthModule`, device management, profile handling, OAuth strategy, repository, một gRPC controller, `token` (ký JWT RS256, `GET /.well-known/jwks.json`, `POST /internal/token`), `roles` (`RoleChangeService`, `RoleChangeLog`, outbox `auth.user.authz_changed`) và `admin-bootstrap` (CLI `bootstrap:admin*`).
- `finance-service` ghép wallet module, SePay module và có handler `auth.user.authz_changed` để tạo ví (+20 credit) cho TEACHER (STUDENT không có ví).
- `gateway-service` không còn proxy controller: `config/routes.yaml` + `src/routing` (matcher), `src/pipeline` (guard chain, header hygiene, body cap, rate limit), `src/ws` (upgrade), `src/control` (gRPC GatewayControl), `src/events` (consumer), cùng vài controller tự phục vụ (`status`, `config/pages`, `config/stream`). Lỗi trả dạng `{ statusCode, code, message, requestId }`; 401 có thể là `TOKEN_EXPIRED`, `SESSION_REVOKED`, `TOKEN_STALE`.

Khi làm backend, hãy nghĩ theo feature module cộng với shared infra module, không chỉ theo từng file rời.

### Auth, role và permission (backend)

- Role: `User.role` (`STUDENT` mặc định | `TEACHER`, loại trừ nhau) + `User.isSystemAdmin` (thay `isAdmin`) + `User.authzVersion` (claim `av`). Chỉ SYSTEM_ADMIN cấp TEACHER/admin (CLI `bootstrap:admin:grant [--teacher]` hoặc admin UI qua auth `SetUserRole`/`SetSystemAdmin`); không tự đổi role của mình, không hạ admin cuối cùng; mọi thay đổi ghi `RoleChangeLog`. Bootstrap admin đã chuyển từ admin-service sang auth-service.
- Access token RS256 15 phút, claims `sub`, `sid`, `roles`, `email_verified`, `av`; refresh nạp lại role trong transaction. `GET /auth/me` (cùng login, refresh) trả `{ user, roles, permissions }` với `user.isSystemAdmin`, không còn wallet/subscription và auth không phụ thuộc finance; số dư lấy từ `GET /wallet/info`. Bảng role → permission: `docs/system/permissions.md`.
- Biến môi trường (chỉ tên): auth `JWT_PRIVATE_KEY`, `JWT_KID`, `JWT_RETIRED_PUBLIC_KEYS`, `JWT_ISSUER`, `JWT_AUDIENCE`, `SERVICE_CLIENTS`, `ADMIN_EMAILS`; mọi service verify cần `AUTH_JWKS_URL`; service gọi service khác cần `AUTH_TOKEN_URL` + `SERVICE_CLIENT_SECRET`; admin và finance cần `AUTH_GRPC_URL`. `AUTH_JWKS_URL`/`AUTH_TOKEN_URL` chỉ dùng http trên mạng nội bộ.

### Hình dạng dữ liệu

Database per service (phase 11): không còn schema Prisma dùng chung (`libs/database` và `@examio/database` đã bị xóa). Mỗi service sở hữu một schema riêng trong cùng một database Postgres, kết nối bằng role riêng `<svc>_svc` (role chỉ có quyền trên schema của mình; chọn bảng của service khác → `permission denied`). Dữ liệu của service khác chỉ lấy qua RPC/event.

| Service | Schema Prisma | Schema Postgres |
|---|---|---|
| auth | `apps/auth-service/prisma/schema.prisma` | `auth` |
| finance | `apps/finance-service/prisma/schema.prisma` | `finance` |
| admin | `apps/admin-service/prisma/schema.prisma` | `admin` |
| exam | `apps/exam-service/prisma/schema/*.prisma` (multi-file; migrations nằm trong `prisma/schema/migrations`) | `exam` (các role `content`, `assessment`, `aichat`, `document` đã tạo sẵn nhưng chưa có service; `ai` dùng tạm schema `exam` đến phase 15) |
| study-room | `apps/study-room-service/prisma/schema.prisma` | `studyroom` (role `studyroom_svc`) |
| vocabulary | `apps/vocabulary-service/prisma/schema.prisma` | `vocabulary` (role `vocabulary_svc`) |

- Mỗi service có migration riêng trong `apps/<svc>-service/prisma/migrations`; deploy chạy bằng container one-shot `<svc>-migrate` (`prisma migrate deploy`).
- Không có FK tới `User` nữa: bảng service khác giữ `userId String` + `@@index`. Join sang User thực hiện ở tầng ứng dụng qua auth.
- Ví dụ domain: auth (User, verify/reset code, session, RoleChangeLog, R2DeleteTask), finance (UserSubscription, Payment, Wallet, WalletTransaction), admin (AdminAudit, PageFeatureFlag), study-room (StudyRoom, StudyRoomMember, StudyRoomPlaylistItem, StudyRoomChatBlock), vocabulary (WordFamilyCategory, WordFamily, UserSavedWordFamily), exam (quiz/flashcard, assessment, AI chat + subject, document/UserStorage/graph). Các service dùng `@examio/messaging` có `OutboxEvent`/`ProcessedEvent`; study-room chỉ có `ProcessedEvent`, vocabulary không có bảng nào trong hai bảng này.
- `DATABASE_URL` của từng service: `postgresql://<svc>_svc:…@postgres:5432/examio?schema=<svc>`. ai-service (Python) dùng `ai_svc` **không** có `?schema=`, `DB_SEARCH_PATH=exam,extensions`, `AI_RUNTIME_DDL=false`; tạm có quyền đọc/ghi các bảng `exam` đến phase 15. pgvector nằm trong schema `extensions`.
- Role/schema do `deploy/postgres/init/01-service-schemas.sh` tạo, chỉ chạy trên volume rỗng và cần `<SVC>_DB_PASSWORD` cho cả 11 role; stack dev cũ phải `docker compose down -v` một lần.
- Xóa file R2 bền vững: bảng `r2_delete_tasks` (schema `auth`, `exam` và `vocabulary`) được ghi trong cùng transaction với việc xóa/thay ảnh, worker (`libs/messaging/src/r2-delete`) rút bảng và gọi r2-service. exam và vocabulary chạy `ROLE=api,worker` (vocabulary có `r2_delete_tasks` riêng, gọi r2 `DeleteObjects` với tư cách `vocabulary`; ảnh category chỉ bị xóa khi key nằm dưới `word-family/`, URL R2 khác không bao giờ bị xóa). auth, exam và vocabulary cần `R2_PUBLIC_URL` để suy key từ URL (`libs/common/src/utils/r2-key-from-url.ts`).
- Đổi schema của một service chỉ ảnh hưởng service đó và contract (gRPC/event/HTTP) của nó; vẫn cập nhật API client/store/component FE nếu response đổi. Test cô lập DB: `test/db-isolation` (CI chạy); `test/r2-delete` kiểm tra tĩnh.

## Kiến trúc phần AI

- Python AI service là một FastAPI app riêng nằm trong `examio-be/apps/ai-service`.
- README của service này mô tả hai vai trò lớn:
  - pipeline RAG/truy xuất tài liệu.
  - orchestration kiểu ReAct agent/tool.
- Project Python phụ thuộc vào LangChain, LangGraph, Gemini integration, FAISS, Docling, OCR/document tooling và graph/community tooling.
- `exam-service` phía Nest không tự xử lý toàn bộ hành vi AI; nó còn đóng vai trò điều phối các request AI thông qua các module như `modules/ai` và `modules/ai-chat`, rồi gọi sang Python AI service qua HTTP.
- AI chat trong `exam-service` có liên kết với tài liệu và subscription:
  - chat record, message và document đính kèm được lưu trong Prisma.
  - AI chat module import `R2Module` cùng với finance gRPC client để kiểm tra subscription/package.
- Frontend có các API client riêng cho AI chat và virtual teacher flow, bao gồm cả xử lý streaming kiểu SSE trong `src/apis/aiChatApi.ts`.

Khi chỉnh sửa AI chat hoặc generation flow, hãy kiểm tra đủ ba lớp: frontend API/store/UI, `exam-service` điều phối, và Python AI service.

## Kiến trúc frontend

### Framework và cấu trúc app

- Frontend là một ứng dụng React 19 + Vite, bootstrap từ `examio-fe/src/main.tsx` và `examio-fe/src/App.tsx`.
- Routing dùng React Router, được khai báo trong `src/routes/index.tsx`.
- Mọi route không public đi qua `guarded()` trong `src/routes/index.tsx` → `RequirePermission` (`src/routes/guards/RequirePermission.tsx`): chưa đăng nhập → `/login?from=`, thiếu permission → `/403` (`ForbiddenPage`), `/auth/me` không với tới được → màn `SessionUnavailable` (không đá về login). `/study-flashcard/:id` giờ cũng cần đăng nhập + `flashcard:study` hoặc `flashcardset:manage`. Chỉ là UX; backend mới là nơi enforce. `TeacherRoute` đã bị xóa.
- App được bọc bởi providers trong `src/provider/AppProviders.tsx`.

### Phân lớp frontend

Frontend được tổ chức quanh một số lớp khá ổn định:

- `src/pages`: page-level UI theo route.
- `src/apis`: các API client dựa trên Axios.
- `src/stores`: Zustand store cho state phía client.
- `src/components`: UI component.
- `src/hooks`, `src/lib`, `src/types`, `src/provider`: logic hỗ trợ.

Pattern phổ biến là:

1. route/page component render UI,
2. UI gọi Zustand store,
3. store gọi API wrapper trong `src/apis`,
4. API dùng Axios instance dùng chung từ `src/apis/api.ts`.

### Auth/session flow ở frontend

Auth không chỉ được xử lý bởi route guards phía client.

- `src/apis/api.ts` là nơi cấu hình Axios dùng chung (`withCredentials`, token nằm trong cookie httpOnly, không có token trong `localStorage`), gắn `X-Device-ID`, và ném `ApiRequestError` mang `status`/`code`/`requestId`. Chính sách 401/403 là hàm thuần trong `src/lib/rbac/api-error-policy.ts`: 401 `TOKEN_EXPIRED`/`TOKEN_STALE` → refresh một lần (single-flight `refreshAccessToken`) rồi retry; `SESSION_REVOKED` hoặc refresh bị từ chối → `/login`; 403 `PERMISSION_DENIED` → toast + refetch `/auth/me` (debounce 5s); 403 `EMAIL_NOT_VERIFIED` → `/k/verify`. Lỗi tạm thời (429/5xx/mạng) không đăng xuất.
- `src/stores/useAuthStore.ts` giữ `user`, `roles`, `permissions` (do server trả, không decode JWT, không persist) và `sessionUnavailable`; `getUser` chạy `probeSession` (`/auth/me` → tối đa một refresh → một retry), dùng chung một lần gọi. Đổi role hoặc logout gọi `resetRoleScopedState` (`src/stores/reset-role-scoped-state.ts`, đăng ký trong `routes/index.tsx`) để xóa cache store + `storeCache`. Số dư ví nằm ở `src/stores/useWalletStore.ts` (nạp một lần mỗi phiên từ `GET /wallet/info`, `null` khi thiếu `wallet:use`). Store khác gồm login, signup, reset password, verify account, OAuth redirect. Thao tác tài chính admin gửi header `Idempotency-Key` (`src/lib/idempotency-key.ts`, một key mỗi hành động); response có `alreadyApplied`.
- Gating theo permission: hook `useCan`/`useCanAny`/`useCanFn` (`src/hooks/useCan.ts`); sidebar và nav admin lấy từ `src/lib/rbac/nav-items.ts`; `/k` chuyển tới trang theo role qua `src/lib/rbac/landing-path.ts`. Bảng route → permission: `docs/system/permissions.md` § Frontend route guards.
- Study-room socket (`src/hooks/useStudyRoomSocket.ts`, `study-room-socket-recovery.ts`, `lib/rbac/socket-reconnect.ts`): `auth:reauth` / `TOKEN_*` → refresh rồi reconnect, `PERMISSION_DENIED` → rời phòng, `SERVICE_UNAVAILABLE` → backoff có giới hạn rồi báo bỏ cuộc.
- Nút login bằng OAuth redirect trực tiếp tới backend auth endpoint thông qua `NEXT_PUBLIC_API_URL`.

Nếu thay đổi hành vi auth, hãy cập nhật route guards, Axios behavior (`api.ts` + `lib/rbac/api-error-policy.ts`) và Zustand auth store cùng nhau.

### Sự gắn kết giữa API và UI

- Frontend hiện gắn khá chặt với surface route của gateway/backend thông qua nhiều file API chuyên biệt (`authApi`, `examApi`, `aiChatApi`, `examSessionApi`, v.v.).
- Shared state cũng được chia theo feature (`useAuthStore`, `useExamSessionStore`, `useFlashcardSetStore`, `useStatsStore`, v.v.).
- Repository này ưu tiên các module API/store theo từng feature thay vì gom toàn bộ vào một abstraction API toàn cục.

Khi backend thay đổi response shape, hãy cập nhật đồng thời API client tương ứng, store liên quan và component đang sử dụng nó.

## Style code và convention đã được repo áp dụng

### Backend

- Dùng NestJS + TypeScript với dependency injection và nhiều decorator trong module/controller.
- Format backend theo `examio-be/.prettierrc.json`, và các file hiện tại thường dùng:
  - dấu chấm phẩy
  - nháy đơn
  - thụt lề 4 spaces
- Ưu tiên import shared lib như `@examio/common` và `@examio/redis`.
- Các pattern backend hiện có gồm repository cho Prisma access và pattern DTO với `nestjs-zod`/Zod ở một số module.
- Controller exam-service nhận input phải gắn `@UsePipes(ZodValidationPipe)` ở cấp class (`nestjs-zod`; không có global pipe trong `main.ts`) và dùng DTO Zod; form multipart của quiz/flashcard set dùng `parseSetForm` (400 `VALIDATION_FAILED`).

### Frontend

- TypeScript `strict` đang bật.
- Dùng alias `@/*` trong `tsconfig.json` thay vì relative path dài.
- ESLint được cấu hình bằng `@antfu/eslint-config` trong `examio-fe/eslint.config.mjs`.
- Các rule về sort import và consistent type-import đã được nới lỏng có chủ đích; không nên churn file chỉ để reorder import.
- Cảnh báo `unused-imports` đang bật.
- ESLint bỏ qua các thư mục UI kiểu generated/vendor:
  - `src/components/kokonutui`
  - `src/components/magicui`
  - `src/components/ui`
- File frontend hiện dùng nháy kép và thụt lề 2 spaces; hãy match style của file đang sửa.

### Python AI service

- Python target là `>=3.12,<4.0` trong `pyproject.toml`.
- Ruff bật `E`, `F`, `I`, `D`, `D401`, `T201`, `UP` cùng một số ignore như `E501`.
- Pydocstyle dùng convention Google.

## Gợi ý thực tế cho các phiên Claude sau

- Trước tiên hãy xác định task thuộc backend, frontend hay cả hai; nhiều tính năng user-facing đi xuyên qua cả hai repo.
- Với thay đổi backend, hãy kiểm tra xem hành vi liên quan có chạm tới gateway proxy, gRPC contract, RabbitMQ event, Prisma schema hoặc Python AI service hay không.
- Với thay đổi frontend, hãy tìm API wrapper và Zustand store tương ứng trước khi sửa UI component.
- Với tính năng AI/tài liệu, cần dự đoán trước sự liên kết giữa Prisma model, `exam-service`, `ai-service` và các client AI chat/generation phía frontend.
- Tránh chạy lệnh ở thư mục gốc repository trừ khi lệnh đó thực sự dành cho root; đa số lệnh phải chạy trong `examio-be/` hoặc `examio-fe/`.
- Giữ diff gọn và tập trung. Repo này có convention format/style khác nhau giữa backend và frontend, vì vậy hãy match theo file đang sửa.

## Active Technologies

- TypeScript 5.x with React 19 + React 19, React DOM 19, Axios, Zustand, Tailwind CSS 4, Radix UI primitives, TipTap, Framer Motion, Recharts, react-google-recaptcha-v3 (001-migrate-fe-vite)
- Browser localStorage, browser cookies for auth sync, backend APIs as system of record (001-migrate-fe-vite)

## Quy tắc Tối ưu Hiệu năng (Performance Rules)

### Nguyên tắc Độ phức tạp Thuật toán

- **Ưu tiên O(1), O(log n)** - Không dùng O(n) hoặc cao hơn khi có thể
- **Tuyệt đối không N+1 query** - Luôn dùng `include`/`join` để fetch related data trong 1 query
- **Batch operations** - Xử lý nhiều records trong 1 câu query thay vì loop từng cái

### Database & Query Optimization

```typescript
// ✅ ĐÚNG: Dùng include để tránh N+1
const users = await prisma.user.findMany({
  include: { posts: true, profile: true }
});

// ❌ SAI: N+1 query trong loop
const users = await prisma.user.findMany();
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { userId: user.id } }); // N+1!
}
```

- Dùng `select` thay vì `include` khi chỉ cần vài fields
- Dùng `cursor`/`skip`/`take` cho pagination thay vì `offset` khi có nhiều records
- Index các fields thường dùng trong WHERE, ORDER BY

### Memory Management

- **Không leak memory** - Cleanup event listeners, subscriptions, timers
- **Stream large data** - Dùng cursor/streaming thay vì load toàn bộ vào memory
- **Limit response size** - Pagination, field selection, truncate long text
- **Dispose resources** - Close connections, clear caches khi không cần

### Python AI Service (FastAPI)

```python
# ✅ ĐÚNG: Dùng async và batch
embeddings = await ollama_embeddings.create_embeddings_batch(texts, batch_size=10)

# ❌ SAI: Loop sync trong async function
for text in texts:
    result.append(await ollama_embeddings.create_embedding(text))  # Chậm!
```

- Dùng `async/await` cho I/O operations
- Dùng `concurrent.futures` hoặc `asyncio` cho parallel processing
- Cache embedding results nếu text giống nhau
- Giới hạn batch size và concurrency để tránh OOM

### Frontend Performance

- **Memo components** - Dùng `React.memo`, `useMemo`, `useCallback` cho expensive computations
- **Virtual scrolling** - Cho danh sách dài (&gt;100 items)
- **Code splitting** - Lazy load routes/components không cần thiết
- **Debounce/Throttle** - Input events, scroll handlers, resize observers
- **Zustand / Data call from api** - Cần cache kết quả API để tránh gọi lại quá nhiều, khi chuyển qua lại các trang cùng một phiên không cần gọi lại API, trừ khi thực hiện các action Create/Update/Delete data thì mới cần, hoặc load lại trang thì sẽ cần
- Khi sửa UI trên mobile thì cần sửa cả ios app (iosApp) và android app (androidApp) luôn nhé

### Monitoring & Testing

- Dùng `EXPLAIN ANALYZE` (PostgreSQL) để kiểm tra query plans
- Track N+1 queries bằng Prisma middleware hoặc query logging
- Benchmark trước/sau khi thay đổi quan trọng

### Note

- Tuyệt dối không commit code lên nếu người dùng không cho phép
- Tuyệt đối không sinh plan trong examio-fe hay examio-be hay examio-app mà sinh trong `/plans`
- Khi xóa bản ghi ( data ) ở database mà nó có ảnh lưu ở R2 thì đảm bảo cũng xóa luôna nhr đó trên R2

---

## Recent Changes

- 001-migrate-fe-vite: Added TypeScript 5.x with React 19 + React 19, React DOM 19, Axios, Zustand, Tailwind CSS 4, Radix UI primitives, TipTap, Framer Motion, Recharts, react-google-recaptcha-v3

## Git commit rules

### Commit với tên là `Claude`, claude là co author trailẻ, còn tôi là author chính, không push nếu không được sự cho phép, chỉ commit

### Quy tắc gen message commit:

## Commit Message Formats

### General Commit

```
<type>(<optional scope>): <description>empty line as separator<optional body>empty line as separator<optional footer>
```

### Initial Commit

```
chore: init
```

### Merge Commit

```
Merge branch '<branch name>'
```

Follows default git merge message

### Revert Commit

```
Revert "<reverted commit subject line>"
```

Follows default git revert message

### Types

- Changes relevant to the API or UI:
  - `feat` Commits that add, adjust or remove a feature to/of/from the API or UI
  - `fix` Commits that fix an API or UI bug of a preceded `feat` commit
- `refactor` Commits that rewrite or restructure code without altering API or UI behavior
  - `perf` Commits are special type of `refactor` commits that specifically improve performance
- `style` Commits that address code style (e.g., white-space, formatting, missing semi-colons) and do not affect application behavior
- `test` Commits that add missing tests or correct existing ones
- `docs` Commits that exclusively affect documentation
- `build` Commits that affect build-related components such as build tools, dependencies, project version, ...
- `ops` Commits that affect operational aspects like infrastructure (IaC), deployment scripts, CI/CD pipelines, backups, monitoring, or recovery procedures, ...
- `chore` Commits that represent tasks like initial commit, modifying `.gitignore`, ...

### Scopes

The `scope` provides additional contextual information.

- The scope is an **optional** part
- Allowed scopes vary and are typically defined by the specific project
- **Do not** use issue identifiers as scopes

### Breaking Changes Indicator

- A commit that introduce breaking changes **must** be indicated by an `!` before the `:` in the subject line e.g. `feat(api)!: remove status endpoint`
- Breaking changes **should** be described in the [commit footer section](#footer), if the [commit description](#description) isn't sufficiently informative

### Description

The `description` contains a concise description of the change.

- The description is a **mandatory** part
- Use the imperative, present tense: "change" not "changed" nor "changes"
  - Think of `This commit will...` or `This commit should...`
- **Do not** capitalize the first letter
- **Do not** end the description with a period (`.`)
- In case of breaking changes also see [breaking changes indicator](#breaking-changes-indicator)

### Body

The `body` should include the motivation for the change and contrast this with previous behavior.

- The body is an **optional** part
- Use the imperative, present tense: "change" not "changed" nor "changes"

### Footer

The `footer` should contain issue references and informations about **Breaking Changes**

- The footer is an **optional** part, except if the commit introduce breaking changes
- *Optionally* reference issue identifiers (e.g., `Closes #123`, `Fixes JIRA-456`)
- **Breaking Changes** **must** start with the word `BREAKING CHANGE:`
  - For a single line description just add a space after `BREAKING CHANGE:`
  - For a multi line description add two new lines after `BREAKING CHANGE:`

### Versioning

- **If** your next release contains commit with...
  - **Breaking Changes** incremented the **major version**
  - **API relevant changes** (`feat` or `fix`) incremented the **minor version**
- **Else** increment the **patch version**

### Examples

- 

```
feat: add email notifications on new direct messages
```

- 

```
feat(shopping cart): add the amazing button
```

- 

```
feat!: remove ticket list endpoint

refers to JIRA-1337

BREAKING CHANGE: ticket endpoints no longer supports list all entities.
```

- 

```
fix(shopping-cart): prevent order an empty shopping cart
```

- 

```
fix(api): fix wrong calculation of request body checksum
```

- 

```
fix: add missing parameter to service call

The error occurred due to <reasons>.
```

- 

```
perf: decrease memory footprint for determine unique visitors by using HyperLogLog
```

- 

```
build: update dependencies
```

- 

```
build(release): bump version to 1.0.0
```

- 

```
refactor: implement fibonacci number calculation as recursion
```

- 

```
style: remove empty line
```