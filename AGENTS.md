# CLAUDE.md

Tệp này cung cấp hướng dẫn cho Claude Code (claude.ai/code) khi làm việc với mã nguồn trong repository này.

## Cấu trúc repository

- Repository này được chia thành hai workspace chính:
  - `examio-be/`: repository backend polyglot gồm các microservice NestJS và một AI service viết bằng Python.
  - `examio-fe/`: frontend React 19 + Vite.
- Hãy xem backend và frontend là hai package root riêng biệt. Chạy lệnh trong đúng thư mục con thay vì ở thư mục gốc repository.
- Không có package manager workspace dùng chung ở thư mục gốc cho cả hai app.

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
yarn dev:content
yarn dev:assessment
yarn dev:study-room
yarn dev:vocabulary
yarn dev:document
yarn dev:ai-chat
yarn dev:finance
yarn dev:gateway
yarn dev:r2
yarn dev:admin
yarn dev:ai
yarn dev:all
yarn proto:lint
yarn proto:gen
yarn prisma:generate               # sinh client cho mọi apps/*/prisma (scripts/prisma-generate.sh) vào apps/<svc>-service/src/generated/prisma (gitignore)
PRISMA_ADMIN_URL=... scripts/prisma-migrate-dev.sh <auth|finance|admin|content|assessment|studyroom|vocabulary|document|aichat> <name>   # tạo migration (chỉ local; = yarn prisma:migrate)
yarn prisma:deploy <svc>           # prisma migrate deploy cho schema của service
yarn prisma:status <svc>
scripts/prisma-schema-path.sh <svc>   # in đường dẫn schema của service
yarn seed:dev                      # seed:dev:auth → finance → admin → ai-chat → vocabulary (mỗi seed đọc DATABASE_URL / <SVC>_DATABASE_URL)
yarn prisma:seed                   # seed:admin + seed:ai-chat + seed:vocabulary
yarn bootstrap:admin               # đồng bộ ADMIN_EMAILS (auth-service CLI)
yarn bootstrap:admin:list
yarn bootstrap:admin:grant <email> [--teacher]
yarn bootstrap:admin:revoke <email>
yarn finance:reconcile-teachers    # đảm bảo mỗi TEACHER có ví (finance-service CLI)
yarn check:ownership               # mỗi model Prisma chỉ một service đọc/ghi (scripts/check-model-ownership.ts --strict; CI chạy)
yarn check:deps                    # dependency-cruiser (.dependency-cruiser.cjs) chặn import chéo giữa service; CI chạy
yarn typecheck                     # tsc --noEmit cho từng service (typecheck:<auth|content|assessment|study-room|vocabulary|document|ai-chat|finance|admin|r2|gateway>)
yarn gen:permissions-doc           # sinh docs/system/permissions.md (phần generated) + docs/generated/permissions-matrix.md từ libs/auth-jwt
scripts/changed-services.sh <base> <head>   # in {"wave1":[...],"wave2":[...]}: service nào cần build/deploy (trước đây deploy.yml dùng; wave1 = server của proto package đổi; auth đầu mỗi wave, gateway cuối)
scripts/lint-migrations.sh <base> <head>     # chặn SQL phá hủy (DROP/RENAME/ALTER TYPE/SET NOT NULL...) trừ khi MIGRATION_CONTRACT=1 (label PR migration:contract); CI chạy
yarn smoke:cutover                 # smoke sau cutover production (scripts/cutover-smoke.ts; xem deploy/cutover-runbook.md)
scripts/gen-jwt-keypair.sh         # in JWT_KID + JWT_PRIVATE_KEY (không commit)
scripts/gen-service-secret.sh <content|assessment|studyroom|vocabulary|document|ai-chat|finance|admin>  # in secret + hash cho SERVICE_CLIENTS
```

### Chạy một test backend cụ thể

```bash
cd examio-be
yarn test apps/auth-service/src/auth-service.controller.spec.ts
yarn test --testNamePattern="AuthServiceController"
yarn test --runInBand apps/assessment-service/src/modules/examsession/examsession-public.mapper.spec.ts
```

### Chạy e2e test backend trực tiếp

```bash
cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/content-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/assessment-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
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

Script backend `yarn dev:ai` giả định rằng virtualenv đã tồn tại tại `examio-be/apps/ai-service/venv`. Script chạy `python -m src.main` với `ROLE=api,worker` (gRPC `AiService` cổng 50051 + `/health` + consumer event/outbox). Lần đầu phải tạo schema `ai` bằng `ROLE=migrate` (Alembic, xem dưới).

```bash
cd examio-be/apps/ai-service
ROLE=migrate ./venv/bin/python -m src.main     # alembic upgrade head (schema ai), rồi thoát
ROLE=api,worker ./venv/bin/python -m src.main  # tương đương yarn dev:ai (yarn dev:ai còn đặt thêm PYTHONPATH, SSL_CERT_FILE)
./venv/bin/ruff check src
./venv/bin/black src
./venv/bin/isort src
```

Nếu `pytest` đã được cài trong môi trường local, có thể chạy một test riêng như sau:

```bash
cd examio-be/apps/ai-service
./venv/bin/pytest src/backend/tests/test_no_foreign_tables.py
```

## Hạ tầng local

- File docker compose dùng cho production/deploy của backend là `examio-be/deploy/docker-compose.yml`.
- Cấu hình compose đó bao gồm PostgreSQL, Redis, RabbitMQ, gateway (hai instance `gateway-a`/`gateway-b`, alias `gateway`), auth, content, assessment, study-room, vocabulary, document, ai-chat, finance, admin, r2, ai (kèm `ai-worker`) và các container migration one-shot `<svc>-migrate` (auth, finance, admin, content, assessment, study-room, vocabulary, document, ai-chat) cùng `ai-migrate` (Alembic). Compose chia theo service trong `deploy/compose/*.yml`, ghép bằng `include:` trong `docker-compose.yml`.
- Backend hiện được thiết kế xoay quanh PostgreSQL + Redis + RabbitMQ cho persistence và messaging.
- Compose dùng 3 network: `edge` (gateway + nginx FE), `internal` (không ra ngoài; mọi service + postgres/redis/rabbitmq) và `egress`. Postgres/Redis/RabbitMQ không publish port ra host; không container backend nào publish port ra host; cổng host duy nhất là nginx FE (`FE_PORT`, mặc định 6368) proxy `/api/` và `/ws/` tới `gateway-a`/`gateway-b` (upstream `gw` trong `examio-fe/nginx.conf`); cổng loopback 6369 cũ đã bỏ (dev local chạy `yarn dev:gateway` vẫn dùng port `PORT` trong `.env`). Truy cập DB: `docker compose exec postgres psql ...` (hoặc `psql postgresql://<svc>_svc:…@…/examio` bằng role của service). Chi tiết: `examio-be/deploy/README.md`.
- Image và env (phase 16): mọi service Node build từ một recipe `examio-be/deploy/Dockerfile.node` (build arg `SERVICE`, target `runtime` và `seed`); ai-service từ `apps/ai-service/Dockerfile` (context `examio-be`). `deploy/docker-entrypoint.sh` chọn việc theo `ROLE`: `api` | `worker` | `api,worker` | `migrate` | `seed` (`SEED_PROFILE=prod|dev`); không bao giờ chạy `db push` hay `migrate resolve`. Image là `ghcr.io/cychipo/examio-<key>:<sha>|main`, danh mục ở `deploy/services.json`. Mỗi container nhận `env_file: deploy/env/<name>.env` (bắt buộc, xem `deploy/env/README.md`); `deploy/.env` chỉ dành cho compose nội suy `${VAR}`: `ADMIN_EMAILS`/`ADMIN_DEFAULT_PASSWORD` nằm ở `env/auth.env`, `GEMINI_*`/`AI2_API_KEY` ở `env/ai.env`, `R2_ACCOUNT_ID` đã bỏ. Mọi container có `mem_limit`; `ai-worker` có healthcheck heartbeat (`/tmp/worker-heartbeat`). Cần Docker Compose 2.24+.
- Deploy: chưa có pipeline CD. `.github/workflows/deploy.yml` đã bị xóa (2026-11-10), flow CD sẽ làm lại. Các script deploy (`deploy/deploy-service.sh`, `scripts/changed-services.sh`, `deploy/cutover-runbook.md`) vẫn giữ để dùng tay hoặc cho CD mới. Migration phải tương thích ngược (expand); phần phá hủy (contract) ở PR sau với label `migration:contract`. Flow nhánh: tách feature từ `develop` → PR vào `develop`; release = PR `develop` → `main` (`main` được bảo vệ, chỉ nhận PR).
- Cookie auth chỉ do auth-service set: `accessToken` và `refreshToken` (HttpOnly, SameSite=Lax, Secure ở production); cookie cũ `token`/`session_id` chỉ bị xóa khi logout. `POST /auth/refresh` xoay refresh token mỗi lần gọi và set lại cả hai cookie (token cũ chỉ còn hiệu lực trong khoảng grace ngắn). Route credential (login, register, ...) giới hạn 5 req/phút.
- `examio-be/docker-compose.example.yml` có tồn tại nhưng chỉ mô tả một service tối giản kiểu frontend và không phản ánh đầy đủ stack backend.

## Kiến trúc backend

### Topology các service

Backend là một root package dùng Yarn, tổ chức theo kiểu Nest monorepo với nhiều service nằm trong `examio-be/apps/`:

- `gateway-service`: điểm vào HTTP public; streaming proxy cấu hình bằng YAML (`apps/gateway-service/config/routes.yaml`), verify JWT, kiểm tra revoke/stale (Redis), rate limit, WS upgrade `/ws/study`. Không có DB và không còn proxy controller.
- `auth-service`: xác thực, OAuth providers, quản lý profile/session/device và các gRPC endpoint liên quan auth.
- `content-service`: quiz set, flashcard set (kèm chia sẻ, practice, tiến độ study), `GenerationJob` + `HistoryGenerated*` (sinh quiz/flashcard từ file; luồng tiền Debit/Refund với tư cách caller `content`) và route `/student/*` phần nội dung (`modules/student-content`). HTTP cục bộ 3013 / gRPC 50057 (container 3000/50051). Schema `content`, role `content_svc`, Redis prefix `content:`, user broker `content` (publish `^content\.`). Chạy `ROLE=api,worker`: worker = outbox relay + poller `r2_delete_tasks` (gọi r2 `DeleteObjects` với tư cách `content`). gRPC `examio.content.v1.ContentService` (proto `proto/examio/content/v1/content.proto`): `GetQuizSetSnapshot` / `GetQuizSetsByIds` chỉ nhận token user được chuyển tiếp + `quizset:manage` + chủ sở hữu (service token → `PERMISSION_DENIED`, quá 50 id → `INVALID_ARGUMENT`), `GetUserContentStats` nhận mọi user. Publish `content.quizset.deleted`, `content.generation.requested`; consume `ai.generation.*`, `document.deleted`, `auth.user.updated` (queue `content.events`). Gọi Cloudflare Turnstile (flashcard study) nên cần mạng `egress` và `TURNSTILE_SECRET_KEY`.
- `assessment-service` (đổi tên từ `exam-service`): phòng thi, phiên thi, lượt làm bài và cheating log (`ExamRoom`, `ExamSession`, `ExamAttempt`, `CheatingLog`) cùng route `/student/*` phần thi. HTTP cục bộ 3014, không có gRPC server. Schema `assessment`, role `assessment_svc`, Redis prefix `assessment:`, user broker `assessment`. Không có FK sang quiz set: `ExamRoom.quizSetId` là chuỗi, phòng giữ `sourceDeleted` và `quizSetTitle`; `ExamSession.quizSnapshot` + `quizSnapshotHash` đóng băng lúc tạo phiên và mọi đường quiz/chấm điểm/labels chỉ đọc snapshot (LRU trong process, khóa `<sessionId>:<hash>`). Tạo phiên trả 422 `QUIZSET_DELETED` / `QUIZSET_TOO_LARGE` (snapshot tối đa 1 MB). `POST /examsessions/:id/refresh-snapshot` chỉ chạy khi phiên còn UPCOMING và 0 lượt làm bài, ngược lại 409 `SNAPSHOT_LOCKED` (dùng chung khóa hàng `FOR UPDATE` với lúc bắt đầu làm bài); view của host có `snapshotOutdated` / `canRefreshSnapshot`. Consume `content.quizset.deleted` và `auth.user.updated` (queue `assessment.events`). Cần `egress` + `TURNSTILE_SECRET_KEY` (Turnstile ở bước bắt đầu làm bài). Upload file đã tách sang `document-service`; study room, word-family và AI chat (cùng subjects) đã tách ra các service khác.
- `study-room-service`: phòng học chung. HTTP `/api/v1/studyrooms/*` và Socket.io `/ws/study` (Redis adapter `key: 'studyroom'`). Consume `auth.user.authz_changed` (gửi `auth:reauth` rồi ngắt socket) và `auth.user.updated` (xóa cache profile) trên queue `studyroom.events` ngay trong process API. Một container, không có gRPC server, không có env `ROLE`; có SIGTERM drain.
- `vocabulary-service`: word family. HTTP `/api/v1/word-family/*` (trừ `POST /api/v1/word-family/:id/to-flashcard`, vẫn ở content) và gRPC `examio.vocabulary.v1` (`WordFamilyAdminService` cho admin, `WordFamilyService.GetWordFamily` cho content; proto `proto/examio/vocabulary/v1/word_family.proto`). Chạy `ROLE=api,worker` trong một process (worker = poller `r2_delete_tasks`). Không dùng RabbitMQ.
- `document-service`: file user tải lên, hạn mức upload theo tháng và trạng thái xử lý (OCR). HTTP `/api/v1/ai/upload` (JSON), `/ai/quick-upload`, `GET|DELETE /ai/upload/:id`, `/ai/upload-image`, `/api/v1/r2/image` (`recent-uploads` do content phục vụ, lấy danh sách qua RPC `ListDocuments`); gRPC `examio.document.v1.DocumentService` (`CreateUpload`, `GetDocumentsByIds`, `AssertOwnership`, `GetQuota`, `EnsureProcessed`, `DeleteDocuments`, `ListDocuments`, `GetDownloadUrl`; chỉ nhận token user được chuyển tiếp, không service nào được gọi thay user). Schema `document`, role `document_svc`. Chạy `ROLE=api,worker`: worker = outbox relay, consumer `document.events`, reaper/sweeper hoàn tiền và poller `r2_delete_tasks` (gọi r2 với tư cách `document`). Publish `document.uploaded` / `document.deleted`, consume `ai.document.processed` / `ai.document.failed`.
- `ai-chat-service`: hội thoại AI. HTTP `/api/v1/ai-chat/*` (16 route, SSE ở `:chatId/stream` và `message/:id/regenerate-stream`, không đổi path; `DELETE :chatId?deleteFiles=true` xóa luôn file đính kèm) và `/api/v1/subjects/*` (public; `systemPrompt` không bao giờ nằm trong response). Schema `aichat`, role `aichat_svc`; model `AIChat`, `AIChatMessage`, `AIChatDocument` (`documentId` không FK), `SubjectCategory`, `Subject`. Không có gRPC server. Chạy `ROLE=api,worker`: worker = poller `r2_delete_tasks` (ảnh trong tin nhắn, gọi r2 với tư cách `ai-chat`); consumer queue `aichat.events` (`document.deleted` xóa liên kết, `finance.subscription.changed` xóa cache `aichat:benefits:<id>`) chạy trong process API; user broker `aichat` không có quyền publish.
- `finance-service`: ví, thanh toán, subscription và luồng khởi tạo ví theo event.
- `r2-service`: service lưu trữ tệp.
- `ai-service`: service Python cho RAG, OCR/xử lý tài liệu, AI chat và sinh nội dung. Sở hữu schema `ai` (Alembic, container one-shot `ai-migrate`; `DB_SEARCH_PATH=ai,extensions`): một pool asyncpg dùng chung, không DDL lúc chạy, không SQL lên bảng của service khác (cờ `AI_RUNTIME_DDL` đã bỏ). gRPC `examio.ai.v1.AiService` (`StreamChat`, `Query`, `GenerateWordFamily`, `ListModels`) cổng 50051, chỉ nhận service token (RS256, `aud=ai`, role đúng SERVICE, caller thuộc `svc:ai-chat|vocabulary|content`). Event qua `src/backend/messaging` (bản Python của `libs/messaging`: queue `ai.events` + retry 30s + DLQ, outbox relay, purge). `ROLE` = `api` | `worker` | `migrate` (compose `ai`, `ai-worker`, `ai-migrate`). HTTP chỉ còn `/` và `/health` (các route compat, `AI_HTTP_COMPAT` và `INTERNAL_SERVICE_TOKEN` đã bỏ ở phase 13).

### Shared backend libraries

Mã hạ tầng dùng chung nằm trong `examio-be/libs/`:

- `@examio/common`: export các Nest module dùng chung, mail/password/id services, event helpers, utils (gRPC client helpers và file protobuf đã chuyển sang `@examio/grpc`, `@examio/contracts` và thư mục `examio-be/proto/`).
- Không còn `@examio/database`: mỗi service sở hữu DB schema riêng (xem "Hình dạng dữ liệu"); Prisma module nằm trong `apps/<svc>-service/src/prisma` (adapter `PrismaPg`, pool 5, có `ReadinessCheck` cho DB).
- `@examio/redis`: Redis module/service dùng chung; `RedisUnavailableFilter` (content-service, assessment-service, study-room, vocabulary và ai-chat đăng ký global) đổi lỗi mất kết nối Redis trên HTTP thành 503 `SERVICE_UNAVAILABLE`, và client subscriber có listener `error`.
- `@examio/contracts`: type/decorator gRPC sinh bằng ts-proto từ `examio-be/proto/examio/<svc>/v1` (buf). Thư mục `libs/contracts/src/generated/` bị gitignore; chạy `yarn proto:gen` sau khi clone hoặc sửa `.proto` (`yarn proto:lint` để lint). Python ai-service sinh stub bằng `apps/ai-service/scripts/gen_grpc.sh`.
- `@examio/grpc`: gRPC client module, deadline/retry, ánh xạ lỗi gRPC, metadata helper.
- `@examio/http`: HTTP error envelope filter dùng chung.
- `@examio/observability`: logger pino JSON (`LoggerModule`, redact các trường nhạy cảm, `requestId`) và health probe `GET /health/live` / `GET /health/ready` (`HealthModule`, `ReadinessCheck` do từng service đăng ký). Metrics/OTel nằm ở phase 17 (hoãn).
- `@examio/auth-jwt`: authn/authz stateless dùng chung (thay `AuthGuard`/`AdminGuard` cũ của `@examio/common`): verify JWT RS256 qua JWKS của auth (không query DB mỗi request), `JwtAuthGuard` → `PermissionsGuard` deny-by-default đăng ký global bởi `AuthJwtModule.forRoot({ serviceName })`, decorator `@Public`/`@Authenticated`/`@AllowUnverified`/`@RequirePermissions`/`@RequireOwnerOrPermission`/`@ServiceOnly`/`@RequirePermissionsOrService`, catalog permission + `ROLE_PERMISSIONS` trong `libs/auth-jwt/src/permissions.ts`, `ServiceTokenClient` (service token), `assertSelfOrService` (chống IDOR cho RPC có `user_id`). Route mới không khai báo decorator sẽ bị 403 `NO_AUTHZ_DECLARED`.
- Endpoint mới trong content/assessment/finance/admin/r2: khai báo đúng một decorator — `@RequirePermissions('<perm>')` (mặc định), `@RequireOwnerOrPermission(perm, OwnerResolver)` khi chủ sở hữu cũng được vào (ví dụ giáo viên xem trước bộ thẻ của mình), hoặc `@Public()`. `@Authenticated()` trơn chỉ dành cho handler nằm trong `examio-be/test/authz/authenticated-allowlist.ts` và phải có spec 2 user (hoặc `selfScoped`). `yarn test test/authz` sẽ fail nếu thiếu khai báo (cả HTTP lẫn WS gateway). Resource không thuộc người gọi trả 404 (không lộ tồn tại), thiếu quyền mới trả 403; check truy cập chỉ dựa vào `isPublic`/`whitelist`/code/`ownerId`, không đọc role của chủ sở hữu. Mã truy cập 6 số đi qua `modules/common/access-code-guard.ts` (khóa 5 lần sai/15 phút), tìm user qua `modules/common/user-search.service.ts`. Chi tiết: `docs/system/permissions.md` § Per-endpoint enforcement.
- RPC gRPC làm thay đổi trạng thái (ví `Debit`/`Credit`/`Refund`, `FinanceAdmin*`, auth `SetUserRole`/`SetSystemAdmin`/`SetUserStatus`, `GatewayControl*`, r2 xóa/upload) phải có token user kèm đúng permission hoặc service token của caller nằm trong allowlist (`@ServiceOnly(...)`, `@RequirePermissionsOrService`); RPC chỉ đọc cũng khai báo quyền tối thiểu đủ dùng (permission, kiểm tra chủ sở hữu hoặc allowlist service, ví dụ `GetQuizSetSnapshot` cần `quizset:manage` + chủ sở hữu, `GetPageFlags` là `@ServiceOnly('gateway')`); `@RequirePermissionsOrService([])` (mọi token hợp lệ) chỉ dành cho dữ liệu công khai như public profile, hoặc dữ liệu của chính user khi handler gọi `assertSelfOrService` (ví dụ `GetWallet`, `GetUserBenefits`). Không tin vị trí mạng hay header `x-user-id`; actor là `sub` của token, không phải `actor_id` trong body.
- `@examio/messaging`: envelope v1, transactional outbox (`outbox_events`) + relay claim-then-publish, consumer idempotent (`processed_events`, `@EventHandler`), validate `source`, một tầng retry 30s + DLQ theo service (`<svc>.dlq`), purge hằng ngày, env `ROLE` (`api` | `worker` | `api,worker`). Auth, finance, study-room, document, content và assessment dùng lib này (`alsoPublishes` cho phép một service ghi outbox với `source` của domain khác; hiện chưa app nào dùng); ai-service dùng bản Python tương đương.

Ưu tiên dùng các shared library này thay vì lặp lại code hạ tầng trong từng service.

### Mẫu giao tiếp giữa các service

Backend không phải là một monolith duy nhất dù các service dùng chung Prisma và shared libs.

- Gateway public các HTTP route và đẩy request xuống downstream service theo bảng route trong `examio-be/apps/gateway-service/config/routes.yaml` (một dispatcher duy nhất + `http-proxy-middleware`, stream body, không body parser). **Thêm route mới = sửa `routes.yaml`** (upstream, `auth`, `permissions`, `pageFlag`, `maxBodySize`, `timeout`, `rateLimits`), không tạo controller.
- Auth, finance, vocabulary, admin và storage giao tiếp qua gRPC (content là gRPC server cho assessment; assessment chỉ là client, không có gRPC server) client/proto từ `@examio/grpc` và `@examio/contracts` (URL qua env `AUTH_GRPC_URL`, `R2_GRPC_URL`, `FINANCE_GRPC_URL`, `GATEWAY_GRPC_URL`, `VOCABULARY_GRPC_URL`, `ADMIN_GRPC_URL`; container dùng HTTP `3000` / gRPC `50051`, `GRPC_PORT`).
- **Mỗi model Prisma do đúng một service sở hữu** (map trong `examio-be/scripts/check-model-ownership.ts`; DB vẫn dùng chung). Service khác không đọc/ghi model đó (kể cả qua `include`/`select`/nested write): gọi RPC của owner. `yarn check:ownership` và `yarn check:deps` chạy trong CI; model mới phải thêm vào map.
- Các workflow bất đồng bộ giữa service dùng RabbitMQ: auth/finance qua `@examio/messaging` (outbox, event `auth.user.registered` không còn consumer, `auth.user.authz_changed` do finance consume); study-room cũng dùng `@examio/messaging` (chỉ consume; vocabulary không có RabbitMQ); document, content và assessment dùng nó cho event tài liệu/sinh nội dung/quiz set (queue `document.events`, `content.events`, `assessment.events`); ai-service dùng bản Python (queue `ai.events`). Mỗi service có RabbitMQ user riêng (`RABBITMQ_URL` riêng; mật khẩu `RABBITMQ_<SVC>_PASS` phải URL-safe) chỉ được publish routing key của domain mình (`content` → `^content\.`, `assessment` → `^assessment\.`); user/permission render từ `deploy/rabbitmq/definitions.template.json` bởi container one-shot `rabbitmq-defs` (`definitions.json` bị gitignore). RabbitMQ 3.13.
- Ví dụ từ wiring hiện tại:
  - gateway biết URL của downstream service qua env `AUTH_SERVICE_URL`, `CONTENT_SERVICE_URL`, `ASSESSMENT_SERVICE_URL`, `FINANCE_SERVICE_URL`, `ADMIN_SERVICE_URL` (nội suy vào `routes.yaml`).
  - auth gọi gRPC `GatewayControl` của gateway (`RevokeSession`, `InvalidateUser`; `GATEWAY_GRPC_URL`, `GATEWAY_CONTROL_ENABLED`); gateway còn consume bền `auth.user.authz_changed` và `auth.session.revoked` (queue `gateway.events`, `RABBITMQ_GATEWAY_PASS`). Redis keys: `gw:revoked:sid:*`, `gw:user:*:av`, `gw:rl:*`.
  - service-to-service: caller lấy service token từ auth (`POST /internal/token`, env `AUTH_TOKEN_URL`, `SERVICE_CLIENT_SECRET`) và gửi trong gRPC metadata `authorization`; admin-service gọi auth gRPC (`AUTH_GRPC_URL`: `SetUserRole`, `SetSystemAdmin`, `SetUserStatus`, `ListUsers`, `ListRoleChanges`) kèm token của admin đang thao tác (màn `/admin/roles`, ban/unban).
  - content đăng ký R2 client và dùng finance client chung ở `libs/grpc` (`FinanceClient`): `WalletService.Debit`/`Credit`/`Refund` mang `idempotency_key` (lặp lại cùng key → `already_applied`, khác nội dung → `IDEMPOTENCY_KEY_REUSED`); `UpdateBalance` đã bị xóa. content chuyển tiếp access token của người gọi khi `Debit` (finance `MONEY_CALLERS` = `content`, `document`); finance chỉ tạo ví chào mừng khi token là TEACHER. `AI_FREE_MODE` chỉ có tác dụng ngoài production (production luôn bị ép tắt). Content và assessment cũng gọi auth `GetPublicProfilesByIds` (`AUTH_GRPC_URL`) để gắn tên/avatar user vào response (client + cache + tombstone dùng chung ở `libs/grpc/src/clients/{public-profile.client,public-profile-cache,public-user,user-enricher}.ts`, prefix cache do từng service truyền vào: content `content:cache:user:<id>`, assessment `assessment:cache:user:<id>`, study-room `studyroom:cache:user:<id>`, TTL 600s, xóa khi nhận `auth.user.updated`; không trả email; user/host có thể `null`). Consumer `auth.user.updated` của content và assessment đăng ký trong `modules/user-profile/user-profile.module.ts`.
  - finance tạo ví cho TEACHER qua handler `auth.user.authz_changed` (không còn dùng `auth.user.registered`).
  - admin-service không đụng DB của service khác: gọi auth (`AuthUserService`: `UpdateUserAdmin`, `SearchUsers`, `GetUserStats`, `GetUserAdminDetail`), finance (`FinanceAdminService` cần `finance:admin`, `FinanceStatsService.GetRevenueStats`), gateway (`SetPageFlags`) và vocabulary (`WordFamilyAdminService`, `VOCABULARY_GRPC_URL=vocabulary:50051`) bằng token admin được chuyển tiếp (`AUTH_TOKEN_URL`, `SERVICE_CLIENT_SECRET`); gateway lúc boot kéo `AdminService.GetPageFlags` từ admin (`ADMIN_GRPC_URL`, token service `gateway` qua `GATEWAY_SERVICE_CLIENT_SECRET`; hash `gateway` phải có trong auth `SERVICE_CLIENTS`).
  - upload file (document-service): token user được chuyển tiếp để `GetUserBenefits`/`Debit` (finance), token `svc:document` để gọi r2 (`UploadFile`, `CreatePresignedDownload`, `DeleteObjects`) và `Refund`. Phí upload tính 3 bước với key `doc:<id>`: insert `UserStorage` ở `PENDING_CHARGE` → `Debit` → xác nhận `PENDING` + outbox `document.uploaded`. `Debit` không rõ kết quả thì giữ hàng ở `FAILED` (kèm xếp xóa key R2) rồi `Refund`; reaper 60 giây thử lại mọi khoản hoàn còn mở và chỉ coi `Refund NOT_FOUND` là "chưa từng trừ" sau 2 phút (`refundSettledAt`). `ai.document.failed` cho file đã trừ tiền → `Refund`. ai-service tải file qua `downloadUrl` (presigned GET 1 giờ), không có quyền ghi R2.
  - sinh quiz/flashcard từ file (content `modules/ai`): `GenerationJob` đi `PENDING_CHARGE` → `Debit` key `gen:<jobId>` → `QUEUED` + outbox `content.generation.requested` (mang `downloadUrl`) → ai-service trả `ai.generation.completed|failed` → `COMPLETED`/`FAILED`. Hủy (`DELETE /ai/job/:id`), sinh lỗi và job quá hạn đều `Refund`; reaper hủy job kẹt `PENDING_CHARGE` quá 10 phút, watchdog fail job `QUEUED`/`PROCESSING` không đổi trạng thái sau `GENERATION_JOB_TIMEOUT_MINUTES` (mặc định 60, tối thiểu 10), sweeper thử lại hoàn tiền chưa xong (`refundedAt`). Phí: file mới = upload + 5; dùng lại file `COMPLETED`/`FAILED`/`PENDING` = 5 (không còn thử lại miễn phí); `regenerate` = `ceil(số item/10)`. Content gọi document qua gRPC (`CreateUpload`, `AssertOwnership`, `GetDocumentsByIds`, `EnsureProcessed`, `DeleteDocuments`, `ListDocuments`, `GetQuota`) và ai-service qua gRPC `ListModels` (token `svc:content`, `aud=ai`).
  - gateway: `ai-upload-history` và `ai-recent-uploads` → content, khai báo trước `ai-upload` → document; `r2-image` → document (`DOCUMENT_SERVICE_URL`); env mới `DOCUMENT_GRPC_URL`, `AI_GRPC_URL`, `DOCUMENT_SERVICE_CLIENT_SECRET` (+ entry `document` trong auth `SERVICE_CLIENTS`; `SERVICE_AUDIENCES` có `document` và `ai`), `RABBITMQ_DOCUMENT_PASS`, `R2_ALLOWED_HOSTS` (ai-service, allowlist host tải file; `R2_ALLOW_PRIVATE_HOSTS=true` trong `env/ai.env` chỉ cho host trong allowlist trỏ về IP private/loopback, địa chỉ link-local như 169.254.169.254 luôn bị chặn), `GENERATION_JOB_TIMEOUT_MINUTES`. r2 không còn `internal/upload` và `INTERNAL_SERVICE_TOKEN`; thêm `CreatePresignedDownload` (chỉ `document`).
  - content → vocabulary: `POST /api/v1/word-family/:id/to-flashcard` nằm ở content (`modules/flashcardset/word-family-to-flashcard.*`), đọc word family qua gRPC `WordFamilyService.GetWordFamily` (`VOCABULARY_GRPC_URL`, token service audience `vocabulary` nên auth `SERVICE_AUDIENCES` phải có `vocabulary`; `test/cross-app/service-audiences.spec.ts` canh điều này) và gán trước id cho card để không nối nhầm card của user khác. Gateway: route `wf-to-flashcard` (POST) khớp trước prefix `word-family`; upstream tên `studyroom` / `vocabulary` (`STUDYROOM_SERVICE_URL`, `VOCABULARY_SERVICE_URL`).
  - content và assessment (phase 14): gateway upstream `content` / `assessment` (`CONTENT_SERVICE_URL`, `ASSESSMENT_SERVICE_URL`; không còn `EXAM_SERVICE_URL`). assessment lấy dữ liệu quiz qua gRPC `ContentService` (`CONTENT_GRPC_URL`) bằng token user được chuyển tiếp, nên `SERVICE_AUDIENCES` không có `content`/`assessment`; student view không bao giờ gọi content (đọc `quizSetTitle` đã lưu, teacher view làm mới title + `questionCount` bằng một batch call có cache). `history-stats` giữ khóa `examsCreated`/`flashcardSets`/`totalPDFs`, mỗi khóa là `null` khi content/document không trả lời. Env mới: `CONTENT_SERVICE_CLIENT_SECRET`, `ASSESSMENT_SERVICE_CLIENT_SECRET` (+ entry `content`, `assessment` trong auth `SERVICE_CLIENTS`), `RABBITMQ_CONTENT_PASS`, `RABBITMQ_ASSESSMENT_PASS`, `CONTENT_DB_PASSWORD`, `ASSESSMENT_DB_PASSWORD`; toàn bộ env `EXAM_*` đã bỏ. Client DocumentService + ánh xạ lỗi nằm ở `libs/grpc` (`document.client`, `document-errors`) dùng chung cho content, assessment và ai-chat.
  - ai-chat-service: `/chat/query` → gRPC `AiService.Query` (deadline 60 giây), `/chat/stream` → `AiService.StreamChat` (server-stream, không deadline, rxjs idle `timeout({each: 60_000})`), cả hai bằng service token `svc:ai-chat` (`ServiceMetadata.attach(md, 'ai')`, ai-service allowlist `ai-chat`). SSE viết tay: `text/event-stream`, `X-Accel-Buffering: no`, `: hb` mỗi 15 giây; chưa có frame đầu từ ai-service thì lỗi là HTTP status (`RESOURCE_EXHAUSTED` → 429, `PERMISSION_DENIED`/`UNAUTHENTICATED` → 502, `UNAVAILABLE` → 503), sau đó là frame `event: error`. Client ngắt (`res.on('close')`) → hủy gRPC call, lưu phần text đã nhận. document-service và finance (`GetUserBenefits`, cache `aichat:benefits:<id>` 5 phút) gọi bằng token user được chuyển tiếp; r2 `DeleteObjects` bằng `svc:ai-chat` (r2 `@ServiceOnly` có `ai-chat`). Xóa chat: `DeleteDocuments` một lần (503 nếu document-service không trả lời, chat được giữ) rồi một transaction `r2_delete_tasks` (chỉ ảnh `images/<ownerId>/…` của chính chủ, URL ngoài/của người khác bị bỏ qua) + xóa dòng. Rate limit 5 tin/phút gói Free (`FREE_TIER_BENEFITS.messagesPerMinute`) → 429 `RATE_LIMITED`; chat đầy → 403 `CHAT_LIMIT_REACHED`. Regenerate bị từ chối (429/403/404) không xóa tin nào (chỉ xóa tin bị thay sau khi được nhận và ai-service mở stream), và giới hạn mỗi chat không tính các tin mà regenerate sẽ thay. Gateway: upstream tên `aichat` (`AICHAT_SERVICE_URL`) cho `ai-chat-stream`, `ai-chat`, `subjects`. Env: `AICHAT_DB_PASSWORD`, `AICHAT_SERVICE_CLIENT_SECRET` (+ entry `ai-chat` trong auth `SERVICE_CLIENTS`), `RABBITMQ_AICHAT_PASS`, `AI_CHAT_DOCUMENT_WAIT_MS` (đợi OCR, mặc định 120000 ms). `INTERNAL_SERVICE_TOKEN`, `AI_SERVICE_URL`, `AI_HTTP_COMPAT` không còn ở đâu; gateway không còn loại header `x-internal-service-token` (không service nào đọc nó).
  - study-room-service: bắt buộc `FRONTEND_URL` ở production (CORS cho WS; thiếu thì service từ chối khởi động); user broker `studyroom` (`RABBITMQ_STUDYROOM_PASS`); secret `STUDYROOM_SERVICE_CLIENT_SECRET` và entry `studyroom` trong auth `SERVICE_CLIENTS`; Redis prefix `studyroom:`. PUT phòng bởi người không phải host trả 403 (hành vi giữ nguyên khi chuyển; ánh xạ 404 để sau).
  - vocabulary-service: secret `VOCABULARY_SERVICE_CLIENT_SECRET` và entry `vocabulary` trong auth `SERVICE_CLIENTS`; Redis prefix `vocab:`. Sinh word family bằng AI gọi ai-service qua gRPC `AiService.GenerateWordFamily` (deadline 60 giây, không retry, token `svc:vocabulary`, `AI_GRPC_URL`), miễn phí, chỉ TEACHER, tối đa 20 lần/ngày.

Khi thay đổi ranh giới giữa các service, hãy kiểm tra đồng thời route trong `routes.yaml`, gRPC contract, event publisher/consumer và các service URL cấu hình qua env.

### Cách tổ chức domain bên trong service

Các Nest service chủ yếu đi theo cấu trúc feature-module, không phải chỉ là một cặp controller/service phẳng.

- `content-service` ghép các module quiz set (kèm sharing), flashcard set, flashcard study, quiz practice, AI generation (`GenerationJob`), student content, finance client, document client (gRPC), R2 client và user-profile. `assessment-service` ghép exam room, exam session, exam attempt, cheating log, snapshot (`SnapshotStore`), quizset-events (consumer `content.quizset.deleted`), content client, document client, student exam và user-profile. `ExamSession.quizSnapshot` bị ẩn bằng Prisma `omit` toàn cục; `SnapshotStore` là nơi duy nhất đọc nó.
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
| content | `apps/content-service/prisma/schema.prisma` | `content` (role `content_svc`) |
| assessment | `apps/assessment-service/prisma/schema.prisma` | `assessment` (role `assessment_svc`) |
| ai-chat | `apps/ai-chat-service/prisma/schema.prisma` | `aichat` (role `aichat_svc`) |
| study-room | `apps/study-room-service/prisma/schema.prisma` | `studyroom` (role `studyroom_svc`) |
| vocabulary | `apps/vocabulary-service/prisma/schema.prisma` | `vocabulary` (role `vocabulary_svc`) |
| document | `apps/document-service/prisma/schema.prisma` | `document` (role `document_svc`) |
| ai (Python) | `apps/ai-service/alembic/versions` (Alembic, không dùng Prisma) | `ai` (role `ai_svc`) |

- Mỗi service có migration riêng trong `apps/<svc>-service/prisma/migrations`; deploy chạy bằng container one-shot `<svc>-migrate` (`prisma migrate deploy`).
- Không có FK tới `User` nữa: bảng service khác giữ `userId String` + `@@index`. Join sang User thực hiện ở tầng ứng dụng qua auth.
- Ví dụ domain: auth (User, verify/reset code, session, RoleChangeLog, R2DeleteTask), finance (UserSubscription, Payment, Wallet, WalletTransaction), admin (AdminAudit, PageFeatureFlag), study-room (StudyRoom, StudyRoomMember, StudyRoomPlaylistItem, StudyRoomChatBlock), vocabulary (WordFamilyCategory, WordFamily, UserSavedWordFamily), content (quiz/flashcard set, practice, study progress, `GenerationJob` + `HistoryGenerated*`), assessment (ExamRoom, ExamSession, ExamAttempt, CheatingLog), document (UserStorage, UserMonthlyFileUpload), ai (Document, DocumentEntity, UserStorageGraph, UserStorageGraphGroup; vector/graph của file). Các service dùng `@examio/messaging` có `OutboxEvent`/`ProcessedEvent` (ai-service có `outbox_events`/`processed_events` trong schema `ai`); study-room chỉ có `ProcessedEvent`, vocabulary không có bảng nào trong hai bảng này.
- `DATABASE_URL` của từng service: `postgresql://<svc>_svc:…@postgres:5432/examio?schema=<svc>`. ai-service (Python) dùng `ai_svc` **không** có `?schema=`, `DB_SEARCH_PATH=ai,extensions`; không có quyền nào trên schema của service khác (grant tạm trên `exam` đã thu hồi, schema `exam` không còn). pgvector nằm trong schema `extensions`.
- Role/schema do `deploy/postgres/init/01-service-schemas.sh` tạo, chỉ chạy trên volume rỗng và cần `<SVC>_DB_PASSWORD` cho cả 10 role (`auth finance admin content assessment studyroom vocabulary aichat document ai`); stack dev cũ phải `docker compose down -v` một lần.
- Xóa file R2 bền vững: bảng `r2_delete_tasks` (schema `auth`, `content`, `vocabulary` và `document`) được ghi trong cùng transaction với việc xóa/thay ảnh, worker (`libs/messaging/src/r2-delete`) rút bảng và gọi r2-service. content, vocabulary và document chạy `ROLE=api,worker` (assessment cũng chạy `api,worker` cho outbox relay, không có `r2_delete_tasks`; document xóa file/ảnh upload và gọi r2 `DeleteObjects` với tư cách `document`; vocabulary có `r2_delete_tasks` riêng, gọi r2 `DeleteObjects` với tư cách `vocabulary`; ảnh category chỉ bị xóa khi key nằm dưới `word-family/`, URL R2 khác không bao giờ bị xóa). auth, content, vocabulary và document cần `R2_PUBLIC_URL` để suy key từ URL (`libs/common/src/utils/r2-key-from-url.ts`).
- Đổi schema của một service chỉ ảnh hưởng service đó và contract (gRPC/event/HTTP) của nó; vẫn cập nhật API client/store/component FE nếu response đổi. Test cô lập DB: `test/db-isolation` (CI chạy); `test/r2-delete` kiểm tra tĩnh.

## Kiến trúc phần AI

- Python AI service nằm trong `examio-be/apps/ai-service`: gRPC `AiService` + worker event (FastAPI chỉ còn `/health` và các route compat).
- README của service này mô tả hai vai trò lớn:
  - pipeline RAG/truy xuất tài liệu.
  - orchestration kiểu ReAct agent/tool.
- Project Python phụ thuộc vào LangChain, LangGraph, Gemini integration, FAISS, Docling, OCR/document tooling và graph/community tooling.
- `content-service` phía Nest không tự xử lý hành vi AI; nó điều phối. Sinh quiz/flashcard (`modules/ai`) không còn gọi ai-service qua HTTP: content tạo `GenerationJob`, publish `content.generation.requested` và nhận `ai.generation.*`; OCR chạy bằng event `document.uploaded` giữa document-service và ai-service; danh sách model lấy qua gRPC `ListModels`.
- AI chat trong `ai-chat-service` (đã tách khỏi exam-service cũ) có liên kết với tài liệu và subscription:
  - chat record, message và liên kết tới document được lưu trong Prisma của ai-chat (schema `aichat`); metadata file nằm ở document-service, ai-chat đọc qua RPC (`GetDocumentsByIds`, `AssertOwnership`, `EnsureProcessed`, `DeleteDocuments`).
  - mỗi tin nhắn có file đính kèm đợi OCR xong (poll `GetDocumentsByIds`, tối đa `AI_CHAT_DOCUMENT_WAIT_MS`, mặc định 120000 ms; hết giờ thì trả lời không có ngữ cảnh file).
  - kiểm tra subscription/package qua finance gRPC client.
- Frontend có các API client riêng cho AI chat và virtual teacher flow, bao gồm cả xử lý streaming kiểu SSE trong `src/apis/aiChatApi.ts`.

Khi chỉnh sửa AI chat hoặc generation flow, hãy kiểm tra đủ ba lớp: frontend API/store/UI, `content-service` điều phối, và Python AI service.

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
- Controller content-service và assessment-service nhận input phải gắn `@UsePipes(ZodValidationPipe)` ở cấp class (`nestjs-zod`; không có global pipe trong `main.ts`) và dùng DTO Zod; form multipart của quiz/flashcard set dùng `parseSetForm` (400 `VALIDATION_FAILED`).

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
- Với tính năng AI/tài liệu, cần dự đoán trước sự liên kết giữa Prisma model, `content-service`, `ai-chat-service`, `document-service`, `ai-service` và các client AI chat/generation phía frontend.
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
- **Virtual scrolling** - Cho danh sách dài (>100 items)
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
