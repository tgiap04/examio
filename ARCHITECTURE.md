# Kiến trúc Microservice — KMAEdu (kiến trúc đã dựng trên nhánh `refactor/microservice-rbac`)

> **Mục đích:** mô tả kiến trúc microservice mà KMAEdu **đã dựng** (phase 01–16, nhánh `refactor/microservice-rbac`), và lộ trình migration đã đi.
>
> - Mục **2** ghi hiện trạng **trước đây** (bản 17/10/2026, trước refactor), giữ lại làm bối cảnh. Đây là nội dung legacy.
> - Các mục **3–11** là kiến trúc như đã dựng; chỗ nào chưa làm được ghi `[DEFERRED]`.
> - Mục **12** là lộ trình migration theo phase.
>
> **Nguồn:** đọc code `kmaedu-be/`, `kmaedu-fe/`, `deploy/`, `.github/workflows/` (bản gốc 17/10/2026, đồng bộ lại với code ở phase 19), đối chiếu với kiến trúc cụm ssv-wsm (Gateway + JWT verify phân tán + DB per service + gRPC contract-first + event bus).
> Chỗ nào ghi *(cần xác nhận)* là chưa kiểm chứng đủ trong code.
>
> **Phạm vi:** backend `kmaedu-be` (NestJS + Python). Đường dẫn API public `/api/v1/...` **giữ nguyên**. Nhưng client **có** phải đổi: web (phase 09) đã đổi theo shape `/auth/me` và mã lỗi mới (xem 4.6). Hệ thống chỉ có client web.

### Thay đổi so với bản 17/10/2026

Phase 19 đồng bộ file này với code thực tế. Khi plan và code lệch nhau thì code thắng.

| # | Mục | Thay đổi |
|---|---|---|
| 1 | 5.3, 11 | gRPC: mạng không cấp quyền. Token user được chuyển tiếp qua metadata `authorization`; việc hệ thống dùng **service token** (`POST /internal/token`). Bỏ việc tin metadata cũ (legacy: `x-user-id`/`x-user-roles`). |
| 2 | 6.2 | Cờ ts-proto đúng như `proto/buf.gen.yaml`; bỏ cờ cũ (legacy) `outputServices=grpc-js`; stub Python sinh bằng `apps/ai-service/scripts/gen_grpc.sh`. |
| 3 | 7.1 | `search_path` đặt bằng `ALTER ROLE ... SET search_path` trong init script, không chỉ `?schema=`. |
| 4 | 4.1, 10.1 | Mạng `edge`/`internal`/`egress`; `gateway-a` + `gateway-b` sau upstream `gw` của nginx FE; không reload nginx khi rollout; không publish cổng backend; có host reverse proxy ở production. |
| 5 | 10.2 | Một recipe `deploy/Dockerfile.node`, runtime `node:22-alpine`, giữ `node_modules` production trong image; không có `webpack.service.js`; Prisma `engineType = "client"`. |
| 6 | 10.2, 11 | Node 22. |
| 7 | 5.1, 5.5, 8.4 | Claims `roles` ∈ `STUDENT`/`TEACHER` (+ `SYSTEM_ADMIN`), `av`, `typ: at+jwt`; guard của `libs/auth-jwt`. |
| 8 | 5.4, 9.5 | `authzVersion` (`av`) thay cơ chế cũ (trước đây: `invalid_before`); `TOKEN_STALE`; hai đường báo cho gateway. |
| 9 | 4.2, 5.4 | WS auth ở upgrade; Redis lỗi thì fail-closed cho admin và route ghi. |
| 10 | 4.4, 6.3, 9.2 | Ví tạo khi `auth.user.authz_changed` role=TEACHER; danh mục event mới; không có `auth.user.deleted` `[DEFERRED]` và `auth.user.logged_in`. |
| 11 | 6.2 | Danh mục RPC theo proto hiện có. |
| 12 | 7.2, 7.3 | Xóa user `[DEFERRED]`; snapshot đề, `r2_delete_tasks`, `sourceDeleted`. |
| 13 | 12 | Bảng phase đối chiếu phase 01–16 của plan; P8 và phần observability của P7 `[DEFERRED]`. |
| 14 | 13 | Checklist thêm service theo đường dẫn thực tế. |
| 15 | 14.2 | Câu hỏi 3 đã đóng; RAM theo bảng `mem_limit`, chưa đo thực tế. |
| 16 | 10.3 | CI/CD theo `.github/workflows/deploy.yml`: wave, migration lint, cutover. |
| 17 | 4.5, 4.7, 8.3, 10.4 | Hạ tầng quan sát và Redis ACL `[DEFERRED]` (phase 17); KPI admin qua RPC tổng hợp. |
| 18 | 4.6 | Mã lỗi 403, `TOKEN_STALE`, `/auth/me` đổi shape; web đã đồng bộ (phase 09). |
| 19 | 1, 3, 4.3–4.4, 5, 6, 7, 8, 9, 10, 15 | Bỏ tính năng ví, gói và thanh toán: không còn finance-service, proto `finance/v1`, quyền `wallet:use`/`subscription:manage`/`finance:admin`, luồng trừ/hoàn tiền và giới hạn theo gói. Mục 2, 12 và phụ lục C là lịch sử, giữ nguyên. |

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Hiện trạng (legacy): vì sao là "microservice đểu"](#2-hiện-trạng-vì-sao-là-microservice-đểu-legacy)
3. [Sơ đồ tổng thể (đích)](#3-sơ-đồ-tổng-thể-đích)
4. [Các thành phần](#4-các-thành-phần)
5. [Danh tính và phân quyền](#5-danh-tính-và-phân-quyền)
6. [Giao tiếp giữa các service](#6-giao-tiếp-giữa-các-service)
7. [Dữ liệu](#7-dữ-liệu)
8. [Cấu trúc một service](#8-cấu-trúc-một-service)
9. [Các luồng mẫu](#9-các-luồng-mẫu)
10. [Hạ tầng và triển khai](#10-hạ-tầng-và-triển-khai)
11. [Bảng quy ước](#11-bảng-quy-ước)
12. [Lộ trình migration](#12-lộ-trình-migration)
13. [Checklist thêm một service mới](#13-checklist-thêm-một-service-mới)
14. [Quyết định đã chốt và câu hỏi mở](#14-quyết-định-đã-chốt-và-câu-hỏi-mở)
15. [Phụ lục](#15-phụ-lục)

---

## 1. Tổng quan

**Bài toán:** nền tảng học tập B2C.
- Người dùng tạo quiz/flashcard (thủ công hoặc sinh bằng AI từ tài liệu), tổ chức phòng thi, học nhóm realtime, chat với "giáo viên AI".
- Không có ví, gói hay thanh toán (đã bỏ); chi phí AI chỉ được chặn bằng rate limit ở gateway.
- Client: web SPA (`kmaedu-fe`), chỉ nói chuyện với một cửa vào duy nhất.

**Nguyên tắc kiến trúc:**

| # | Nguyên tắc | Cách làm ở KMAEdu (đích) |
|---|---|---|
| 1 | Một cửa vào | Mọi request từ client đi qua **gateway-service**. Service nghiệp vụ không có cổng public, chỉ nằm trong mạng `internal`. |
| 2 | Đăng nhập tập trung, kiểm tra phân tán | **auth-service** ký JWT **RS256**, công khai **JWKS**. Gateway và từng service tự verify bằng public key. **Không query DB, không gọi auth** cho mỗi request. |
| 3 | Database per service | Mỗi service một database (giai đoạn đầu: một schema Postgres riêng + role riêng). Dữ liệu của service khác chỉ lưu **ID**. Không có FK xuyên service. |
| 4 | Contract-first | Giao tiếp nội bộ đồng bộ bằng **gRPC**. Proto quản lý tập trung bằng **buf** (lint + kiểm tra breaking change), code sinh tự động cho cả TypeScript và Python. |
| 5 | Event cho tác vụ lan toả | **RabbitMQ** topic exchange, event đặt tên theo **domain** (`auth.user.authz_changed`). Ghi event qua **outbox**, consumer **idempotent**, có **DLQ**. |
| 6 | Không có tenant | KMAEdu là B2C, không có multi-tenancy. Cô lập dữ liệu theo `userId` lấy từ claim `sub`. |
| 7 | Một image, nhiều vai trò | Mỗi service một image riêng, chạy được các vai trò `api` / `worker` / `migrate` (mục 8.3). |
| 8 | Nhiều ngôn ngữ cùng chạy | NestJS và Python (FastAPI + gRPC) nói chuyện với nhau qua gRPC và RabbitMQ với cùng một contract. |
| 9 | Triển khai độc lập | Sửa một service chỉ build, test và deploy service đó. Chạy Docker Compose trên VPS, thiết kế sẵn để chuyển sang K8s/Helm mà không phải sửa code (K8s: `[DEFERRED]` phase 17). |

---

## 2. Hiện trạng: vì sao là "microservice đểu" [LEGACY]

> **Trước đây (legacy):** mục này ghi lại backend **trước** refactor (bản 17/10/2026). Mọi điểm dưới đây đã được xử lý ở phase 01–16; giữ lại để hiểu vì sao có kiến trúc đích. Đường dẫn và tên file trong mục này là của code cũ, nhiều file đã bị xóa.

Trước đây backend là **distributed monolith**: tách process nhưng vẫn dính nhau ở database, auth, thư viện chung và deploy. Đổi một chỗ vẫn phải build và deploy lại tất cả.

| # | Triệu chứng | Bằng chứng | Hệ quả |
|---|---|---|---|
| 1 | **Một database, một schema cho tất cả** | Mọi service nhận cùng `DATABASE_URL` (`deploy/docker-compose.yml`). (trước đây) `yarn prisma:merge` gộp `libs/database/src/models/*.prisma` thành một `schema.prisma`. | Không service nào sở hữu dữ liệu của mình. Đổi schema là đụng tất cả. |
| 2 | **Python ai-service ghi thẳng vào DB chung, tự chạy DDL** | `asyncpg.create_pool(DATABASE_URL)` ở 7 chỗ (6 trong luồng chính + `score/database.py`). Ghi `UserStorage`, `Document`, `HistoryGenerated*`. `CREATE TABLE` cho `UserStorageGraph*`, `BenchmarkItem` (`apps/ai-service/src/backend/services/*`). | Hai nguồn sửa schema không phối hợp với nhau. `BenchmarkItem` đã từng bị lệch schema. |
| 3 | **24 FK trỏ về `User`, đều `onDelete: Cascade`** | `exam.prisma` (11), `user.prisma` (4), `payment.prisma` (2), `study-room.prisma` (2), `storage`, `ai-chat`, `user.session`, `word-family`, `admin-audit` (mỗi file 1). Ngoài ra `ExamRoom → QuizSet` cũng cascade (`exam.prisma:148,156`). | Xoá một user, hay một quiz set, là xoá dây chuyền ở tầng DB, xuyên mọi domain. File trên R2 không bị xoá theo. |
| 4 | **Mỗi request 2 query DB để xác thực, ở mọi service** | `libs/common/src/guard/auth.guard.ts:43,55` (`userSession` + `user`); `admin.guard.ts:31,43` cũng vậy. Khoảng 120 chỗ `@UseGuards` ở exam, và có ở cả auth, admin, finance, gateway. | Mọi service phụ thuộc bảng của auth. Không có cache. |
| 5 | **(trước đây) Một `JWT_SECRET` HS256 dùng chung** | `auth.module.ts:36-42`, `libs/common/src/auth/auth.module.ts:14-17` (thêm một cấu hình `expiresIn: '7d'` nữa). Claim chỉ có `{userId, sessionId}`. | Lộ secret ở một service là ai cũng ký được token. Không có roles trong token. |
| 6 | **admin-service ghi thẳng vào bảng của finance và auth** | `admin-finance.service.ts:102-337` ghi `wallet`, `walletTransaction`, `payment`, `userSubscription`. `admin-users.service.ts:218-407` ghi `User`. `admin-stats.service.ts` chạy raw SQL trên `"User"`, `"Payment"`. | Bỏ qua nghiệp vụ của finance (`UpdateBalance`). Cache `wallet:user:*` bị cũ. |
| 7 | **Gateway viết tay 208 route, chỉ 3 controller kiểm tra JWT** | 17 file `*-proxy.controller.ts` (+ `config.controller.ts`), 11 file chép lại helper `h()`/`t()`. `AuthGuard` chỉ có ở ai, ai-chat, một method admin và một method config. Các hàm `ProxyService.forward*` chỉ trả `response.data`, làm mất status và header (trừ `forwardWithRedirect`). Chỉ admin-logs và config là tự stream. | Thêm endpoint phải sửa hai nơi. SSE của AI chat bị gom hết rồi mới trả (`proxy.service.ts:189-225`), nên không stream. |
| 8 | **gRPC dùng nửa vời** | Proto nạp lúc chạy, interface TS viết tay và phải thêm biến thể camelCase không có trong proto (`fileId?`, `keyR2?` ở `r2-client.service.ts`). Không ai gọi `auth.proto`. `admin.proto` được tham chiếu nhưng không tồn tại. `ocr` và `finance` cùng cổng `50053`. | Contract không phải nguồn sự thật. |
| 9 | **Event bus mong manh** | Chỉ có một luồng thật là `user.created` (auth → finance). Không có outbox. Consumer ack cả khi lỗi, không có DLQ (`event-subscriber.service.ts:50-55`). Luồng `ai.ocr.requested` không ai publish. | Mất event là không biết. Ví có thể không được tạo. |
| 10 | **`libs/common` chứa nghiệp vụ** | Mail, password, refresh-token cipher, PDF, OAuth guard, `sanitizeUser`, enum event của mọi domain, `BaseRepository` dùng `prisma[modelName]`. | Sửa lib là rebuild và redeploy mọi service. |
| 11 | **Deploy khoá chặt với nhau** | Một `deploy/Dockerfile` build cả monorepo theo `SERVICE_NAME`. CI chạy `docker compose build` → `down` → `up` cho **toàn bộ** backend. Không có registry, image tag, test hay lint trong CI. | Downtime mỗi lần deploy. Không rollback được từng service. |
| 12 | **Lộ hạ tầng và bảo mật lỏng** | Postgres publish ra host `5411`. `entrypoint-seed.sh` in `DATABASE_URL` ra log. Cookie bị set hai lần (auth 7 ngày, gateway 30 ngày, `SameSite=None`). | Bề mặt tấn công lớn. |
| 13 | **Không có observability** | Health check trả tĩnh `{status:'ok'}`, không kiểm tra DB. Không có tracing hay metrics. Log đẩy vào Redis list và admin đọc file. Rate limit lưu in-memory theo instance. | Khó lần lỗi xuyên service. Scale ngang thì rate limit sai. |

**Chỗ đã làm đúng, giữ làm mẫu:** exam gọi finance qua gRPC (`wallet.proto`, `subscription.proto`) để kiểm tra và trừ credit (`finance-client.service.ts`). Ngoài ra refresh token dạng opaque, mã hoá AES-GCM, có rotation và grace window, là thiết kế tốt nên giữ nguyên.

---

## 3. Sơ đồ tổng thể (đích)

```
                                 Web SPA (kmaedu-fe)
                            │  /api/v1/...  ·  WS /ws/study  ·  SSE
                            ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  Edge: Cloudflare → reverse proxy host → nginx (kmaedu-fe container)   │
   └───────────────────────────────┬───────────────────────────────────────┘
                                   │ mạng "edge"
                    ┌──────────────▼──────────────┐   gRPC (revoke/invalidate,
                    │ gateway-service             │◄── page flags) từ auth/admin
                    │ route YAML · verify JWT     │
                    │ (JWKS) · revoke check Redis │
                    │ rate limit Redis · stream   │
                    └──────────────┬──────────────┘
                                   │ HTTP proxy (stream) + Bearer JWT    mạng "internal"
   ┌──────────┬─────────┼─────────┬──────────┬──────────┬───────────┬─────────┐
   ▼          ▼         ▼         ▼          ▼          ▼           ▼         ▼
 auth     content  assessment study-room vocabulary  ai-chat   document   admin
 (JWT,    (quiz,   (phòng thi, (Socket.io (word      (chat,    (file,    (audit,
 user,    flash-   phiên, bài  realtime)  family)    subject)  OCR)      flags,
 session) card)    làm)                                                  KPI)
   │          │         │         │          │          │           │         │
   └──────────┴────┬────┴─────────┴────┬─────┴──────────┴───────────┴─────────┘
                   │ gRPC (đồng bộ)     │ RabbitMQ           │ gRPC
                   ▼                    ▼ kmaedu.events      ▼
            service khác        (outbox → exchange →     ai-service (Python)
            r2-service (blob)    queue/service + DLQ)    RAG · LLM · OCR · pgvector

   Dữ liệu:  Postgres (mỗi service 1 schema + role riêng) · Redis (prefix theo service)
             · RabbitMQ · Cloudflare R2
```

---

## 4. Các thành phần

### 4.1 Edge

| Môi trường | Công cụ | Định tuyến |
|---|---|---|
| Production (VPS) | Cloudflare → reverse proxy trên host (nginx/Caddy) → nginx trong container `kmaedu-frontend` | `/` → SPA. `/api/` và `/ws/` → upstream `gw` (`kmaedu-gateway-a:3000`, `kmaedu-gateway-b:3000`). `proxy_buffering off` cho SSE (`kmaedu-fe/nginx.conf`). |
| Local | Vite dev proxy → gateway | `VITE_BACKEND_URL=http://localhost:3000` |

- Container FE chỉ publish `FE_PORT` (mặc định 6368) trên `127.0.0.1` (`FE_BIND`); host reverse proxy là đường vào duy nhất. IP thật của client lấy từ `CF-Connecting-IP`, chỉ tin khi kết nối tới từ dải Cloudflare hoặc dải private của Docker (`kmaedu-fe/nginx/cloudflare-real-ip.conf`).
- Chỉ **gateway** (và nginx FE) nằm trên mạng `edge`. Mọi service nghiệp vụ, Postgres, Redis, RabbitMQ chỉ nằm trong mạng `internal`, **không publish cổng ra host** (cổng `5411` và `6369` cũ đã bỏ; truy cập DB bằng `docker compose exec postgres psql` hoặc SSH tunnel).

### 4.2 gateway-service

**Stack:** NestJS (giữ để đồng bộ với team) + `http-proxy-middleware`, `jose` (verify JWKS), Redis, `@grpc/grpc-js`.

**Gateway làm gì:**
- Proxy theo **file cấu hình YAML** (mỗi môi trường một file). Thay toàn bộ 208 handler viết tay bằng **một** middleware đọc route table.
- **Stream thẳng** request/response: giữ nguyên status, header và body. Không buffer multipart, SSE hay file download.
- Verify JWT (chữ ký RS256 qua JWKS, `exp`, `iss`, `aud`).
- Kiểm tra thu hồi trong Redis của gateway: `gw:revoked:sid:<sid>` và `gw:user:<id>:av` (mục 5.4).
- Rate limit lưu trong Redis (đúng khi chạy nhiều instance). Có giới hạn riêng cho WS upgrade.
- **Redis lỗi:** fail-closed cho `/api/v1/admin/*` và mọi phương thức khác GET/HEAD/UPGRADE (trả `503 AUTH_STATE_UNAVAILABLE`); chỉ fail-open cho GET, HEAD và WS UPGRADE không phải admin (có log, có đếm).
- Proxy WebSocket `/ws/study` → `study-room-service`. Token ở bước upgrade chỉ lấy từ header `Authorization: Bearer` hoặc cookie `accessToken` (không đọc `auth.token` của socket.io, không đọc query string). Middleware `server.use` của socket verify lại token (chữ ký, `aud`, `exp`, `email_verified`), đòi quyền `study_room:join`, kiểm tra `av`, hẹn ngắt socket đúng lúc `exp`, và ngắt socket của user khi nhận `auth.user.authz_changed`.
- Phục vụ `GET /api/v1/config/pages` và SSE `/api/v1/config/stream` (page feature flags) từ Redis của chính gateway.
- Gắn `X-Request-Id`, log access (pino) có `userId`. `traceparent` / OpenTelemetry: `[DEFERRED]` phase 17.
- Chạy **gRPC server `GatewayControl` (:50051)** để auth và admin báo thu hồi token và đổi page flags.

**Gateway KHÔNG làm:** gộp dữ liệu nhiều service (BFF), truy cập Postgres, sửa body, set cookie. Cookie chỉ do auth set.

**Cấu hình route mẫu** (rút gọn từ `apps/gateway-service/config/routes.yaml`, một file cho mọi môi trường, `${VAR}` nội suy từ env; rate limit khai báo ở khối `rateLimits` riêng, không nằm trong từng route):

```yaml
upstreams:
  content: ${CONTENT_SERVICE_URL:-http://localhost:3013}       # compose: http://content:3000
  assessment: ${ASSESSMENT_SERVICE_URL:-http://localhost:3014}
  studyroom: ${STUDYROOM_SERVICE_URL:-http://localhost:3009}
  document: ${DOCUMENT_SERVICE_URL:-http://localhost:3011}

routes:
  - id: quizsets
    upstream: content
    match: { prefix: /api/v1/quizsets }
    auth: required                    # required | optional | none
    pageFlag: manage-exam             # cờ trang tắt thì gateway từ chối

  - id: student-content               # một prefix /student tách về hai service theo path con
    upstream: content
    match: { path: '/api/v1/student/(recent-flashcards|pin-flashcard/[^/]+)' }
    auth: required

  - id: student-exam
    upstream: assessment
    match: { path: '/api/v1/student/(recent-exams|pin-exam-room/[^/]+)' }
    auth: required

  - id: ai-recent-uploads             # khai báo trước ai-upload; content giữ route này
    upstream: content
    match: { path: '/api/v1/ai/recent-uploads' }
    auth: required
    permissions: [document:upload]
    pageFlag: ai-tool
    timeout: 120s

  - id: ai-upload
    upstream: document
    match: { path: '/api/v1/ai/(upload(/[^/]+)?|quick-upload|upload-image)' }
    auth: required
    permissions: [document:upload]
    pageFlag: ai-tool
    maxBodySize: 50mb
    timeout: 120s

  - id: study-ws
    upstream: studyroom
    match: { prefix: /ws/study }
    auth: required                    # verify token ở bước upgrade
    pageFlag: study-room              # tắt cờ thì từ chối upgrade
    websocket: true
    timeout: 0
```

**Pipeline xử lý một request:**

1. **Match route.** Không khớp route nào → 404. Thứ tự ưu tiên: `path` regex trước, `prefix` dài nhất sau.
2. **Lấy token.** Từ cookie `accessToken` (web) hoặc header `Authorization: Bearer` (client không dùng cookie, ví dụ script và test). **Không** nhận token qua query string, kể cả ở WS handshake (`src/ws/ws-upgrade.handler.ts` dùng cùng bộ kiểm tra với HTTP). Không có token → `401 TOKEN_MISSING` (route `optional` thì đi tiếp ẩn danh).
3. **Verify JWT** bằng JWKS (cache key theo `kid`, tự refetch khi gặp `kid` lạ).
   - Chữ ký sai, `iss`/`aud` sai hoặc token không hợp lệ → `401 TOKEN_INVALID`; chỉ khi hết hạn (`exp`) mới là `401 TOKEN_EXPIRED`. Client tự gọi `/auth/refresh`; luồng này đã có trong `kmaedu-fe/src/apis/api.ts`.
   - `sid` nằm trong `gw:revoked:sid:<sid>` → `401 SESSION_REVOKED`.
   - `av` của token < `gw:user:<sub>:av` → `401 TOKEN_STALE`. Refresh để nhận claims mới.
4. **Kiểm tra quyền thô theo route:** `permissions: [...]` → các quyền suy từ `roles` qua `ROLE_PERMISSIONS` phải đủ (route có `permissions`).
5. **Rate limit** (Redis, key theo `userId` hoặc IP).
6. **Proxy** sang upstream, giữ `Authorization: Bearer <jwt>` (lấy từ cookie nếu cần), thêm `X-Request-Id`, `X-Forwarded-*`.

**Các key Redis của gateway** (prefix `gw:`; Redis ACL theo service: `[DEFERRED]` phase 17):

| Key | Ý nghĩa |
|---|---|
| `gw:revoked:sid:<sid>` | Session đã logout hoặc bị thu hồi. TTL = TTL còn lại của access token. |
| `gw:user:<id>:av` | `authzVersion` mới nhất của user. Token có `av` nhỏ hơn phải refresh (đổi role, bị ban, đổi mật khẩu). |
| `gw:config:pages` | Page feature flags hiện hành |
| `gw:rl:*` | Bộ đếm rate limit |

**gRPC API của gateway** (`proto/kmaedu/gateway/v1/gateway_control.proto`): `RevokeSession(sid, exp)`, `InvalidateUser(user_id, authz_version)`, `SetPageFlags(flags)`. Mỗi lệnh chỉ ghi Redis. Bên gọi là auth (logout, ban, đổi quyền) và admin (page flags). Đây là đường nhanh; đường **bền** là worker của gateway consume `auth.user.authz_changed` và `auth.session.revoked` (queue `gateway.events`), `SET` idempotent nếu `av` lớn hơn.

### 4.3 auth-service

**Stack:** NestJS, `jose` (ký RS256), Passport (Google, Facebook, GitHub), Prisma (DB `auth`).

**auth làm gì:**
- Sở hữu `User`, `UserSession`, `VerifyAccountCode`, `ResetPasswordCode`.
- Đăng ký, đăng nhập (email/password + OAuth), cấp access token và refresh token, rotation, logout, quản lý thiết bị (`X-Device-ID`), profile.
- Công khai `GET /.well-known/jwks.json`, chỉ trong mạng `internal`. Hỗ trợ nhiều `kid` để xoay khoá.
- Cung cấp **gRPC** `AuthService` / `AuthUserService` (danh mục ở 6.2) và `POST /internal/token` cho service token (5.3).
- Publish `auth.user.authz_changed` (sự kiện duy nhất về danh tính/quyền), `auth.user.updated`, `auth.session.revoked`; `auth.user.registered` vẫn được publish nhưng không còn consumer. **Không có** `auth.user.deleted` (`[DEFERRED]`, xem 7.2) và không có `auth.user.logged_in`.
- Đăng ký không tạo ví hay gói nào (tính năng đã bỏ).
- Gửi mail (verify, reset) vẫn nằm ở auth. Chỉ tách notification-service khi có service thứ hai cần gửi mail (YAGNI).

Chi tiết token, cookie và thu hồi ở mục 5.

### 4.4 Service nghiệp vụ

| Service | Vai trò | Sở hữu dữ liệu | Gọi ra (gRPC) | Event |
|---|---|---|---|---|
| `content-service` | Quiz set, flashcard set, câu hỏi, nhãn, luyện tập, tiến độ học flashcard, **sinh quiz/flashcard bằng AI** | `QuizSet*`, `QuizQuestion`, `DetailsQuizQuestion`, `FlashCardSet*`, `FlashCard`, `DetailsFlashCard`, `HistoryGenerated{Quizz,Flashcard}`, `QuizPracticeAttempt`, `FlashCardViewHistory`, `UserPinnedFlashcard`, `FlashcardStudyProgress` | auth, document, r2 | Pub: `content.generation.requested`, `content.quizset.deleted`. Sub: `ai.generation.*`, `document.deleted`, `auth.user.updated` |
| `assessment-service` | Phòng thi, phiên thi, bài làm, chống gian lận, mã hoá đề (`QUIZ_AES_KEY`), màn "student" | `ExamRoom`, `ExamSession`, `ExamAttempt`, `CheatingLog`, `UserPinnedExamRoom` | content (snapshot đề), auth | Sub: `content.quizset.deleted`, `auth.user.updated` |
| `study-room-service` | Phòng học nhóm realtime: timer, playlist YouTube, chat, kiểm duyệt | `StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock` + state sống trong Redis | auth (tên, avatar) | Sub: `auth.user.authz_changed`, `auth.user.updated` |
| `vocabulary-service` | Word family, danh mục, từ đã lưu, sinh word family bằng AI | `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` | ai (`GenerateWordFamily`) | — (không dùng RabbitMQ) |
| `ai-chat-service` | Hội thoại AI, giáo viên AI theo môn (`Subject.systemPrompt`), đính kèm tài liệu | `AIChat`, `AIChatMessage`, `AIChatDocument`, `SubjectCategory`, `Subject` | ai (`StreamChat`), document | Sub: `document.deleted` |
| `document-service` | File người dùng tải lên (metadata), số lượt upload (chỉ thống kê, không giới hạn), trạng thái xử lý | `UserStorage` | r2 | Pub: `document.uploaded`, `document.deleted`. Sub: `ai.document.processed`, `ai.document.failed` |
| `r2-service` | Hạ tầng blob: presigned URL, xoá object, ảnh public/private | — (bucket R2) | — | — |
| `admin-service` | Dashboard admin, audit, page feature flags, KPI | `AdminAudit`, `PageFeatureFlag` | auth, vocabulary, gateway (RPC, token admin được chuyển tiếp) | — (KPI lấy qua RPC tổng hợp `GetUserStats`, cache Redis 5 phút; KPI tổng quan là `totalUsers`/`activeToday`/`active30d`; không có read model) |
| `ai-service` (Python) | RAG, OCR/parse tài liệu, embedding, knowledge graph, sinh nội dung, LLM streaming | `Document` (chunk + `vector`), `GraphIndex`, `GraphEntity`, `GraphRelationship`, `GraphTextUnitEntity`, `GraphCommunity` | — | Sub: `document.uploaded`, `document.deleted`, `content.generation.requested`. Pub: `ai.document.processed/failed`, `ai.generation.completed/failed` |

**Đã bỏ:**
- `ocr-service` (NestJS). OCR nằm trong ai-service.
- `exam-service`, đã tách xong thành content, assessment, study-room, vocabulary, ai-chat và document.

**Ghi chú về ranh giới:**
- **content và assessment** tách theo vòng đời: content là "soạn và tự học", assessment là "tổ chức thi có giám sát". Khi tạo phiên thi, assessment lấy **snapshot** đề từ content (`GetQuizSetSnapshot`) và lưu trong `ExamSession` (7.3). Sau đó tác giả sửa hay xoá quiz cũng không ảnh hưởng tới phiên thi và kết quả đã có.
- **document và ai-service:** document giữ metadata và trạng thái (cái người dùng thấy). ai-service giữ chunk, vector, entity, graph (cái để truy hồi). Hai bên chỉ trao đổi qua event và `storageId`.
- **Màn "student"** (`/api/v1/student/*`) trộn flashcard và phòng thi; route tách theo path con về content và assessment (xem route mẫu ở 4.2).

### 4.5 ai-service (Python)

**Stack:** FastAPI (chỉ còn `/` và `/health`), **gRPC server** (`grpcio`, :50051), `aio-pika`, LangChain/LangGraph, Gemini, pgvector, Docling.

- **DB riêng `ai`** (Postgres + extension `vector`). Schema quản lý bằng **Alembic**. Bỏ mọi `CREATE TABLE` lúc chạy.
- **gRPC `AiService`:**
  - `StreamChat` (server-streaming): thay `POST /chat/stream`.
  - `Query`: thay `POST /chat/query`.
  - `GenerateWordFamily`
  - `ListModels`
- **Việc chạy lâu dùng event:**
  - Xử lý tài liệu: nhận `document.uploaded`, trả `ai.document.processed` hoặc `ai.document.failed`.
  - Sinh quiz/flashcard: nhận `content.generation.requested`, trả `ai.generation.completed` hoặc `ai.generation.failed`, payload có kết quả hoặc con trỏ tới kết quả.
- Đọc file từ R2 bằng presigned URL do service gửi kèm trong event. Không giữ credentials R2 ghi.
- Code cũ `src/score/` (bảng `students`, `subjects`, `scores`), dev agent, benchmark index và `BenchmarkItem` đã bị xóa ở phase 01.

### 4.6 Frontend

- **Không đổi URL.** Mọi đường dẫn `/api/v1/...` và `/ws/study` giữ nguyên. Gateway tự định tuyến về service mới. Hợp đồng response thì **có** đổi, xem bên dưới.
- Web dùng cookie httpOnly do auth set. Client không dùng cookie thì gửi `Authorization: Bearer`, token nhận trong body của `/auth/login` và `/auth/refresh`.
- Mã lỗi 401: `TOKEN_EXPIRED`, `TOKEN_STALE` (`av` cũ) → client refresh **một lần** rồi retry; `SESSION_REVOKED` → về login. Mã lỗi 403: `PERMISSION_DENIED` (client báo và nạp lại `/auth/me`) và `EMAIL_NOT_VERIFIED` (chuyển tới `/k/verify`).
- Câu "client không phải sửa" của bản cũ là **sai**: web (phase 09) đã đổi. `/auth/me` trả `{ user, roles, permissions }` với `user.isSystemAdmin` (không còn `isAdmin`) và **không có `wallet`** (tính năng ví đã bỏ, route `/wallet/*` không còn).
- SSE của AI chat sẽ **stream thật** sau khi gateway chuyển sang proxy dạng stream (hiện tại bị gom).

### 4.7 Hạ tầng dùng chung

| Thành phần | Dùng cho | Ghi chú |
|---|---|---|
| Postgres 16 + pgvector | Mỗi service một database (giai đoạn đầu: một schema) + role riêng | Một server cho VPS. Tách server khi cần, chỉ phải đổi URL. |
| Redis 7 | Cache, rate limit, revoke list, state realtime của study-room, Socket.io adapter | Tách theo **prefix** từng service. Redis ACL theo service: `[DEFERRED]` phase 17. Có thể tách instance riêng cho study-room nếu tải lớn. |
| RabbitMQ 3.13 | Event bus | Exchange `kmaedu.events` (topic). Mỗi service một queue `<svc>.events`, một RabbitMQ user riêng. |
| Cloudflare R2 | Lưu file | Chỉ `r2-service` giữ credentials ghi. Service khác dùng presigned URL. |
| Container registry (GHCR) | Image theo service | `ghcr.io/tgiap04/kmaedu-<key>:<git-sha>` |
| Log, health | pino JSON (`libs/observability`), `/health/live`, `/health/ready`; admin đọc log qua Redis list/pub-sub hiện có | Đã dựng. |
| Grafana + Loki + Tempo + Prometheus, OpenTelemetry | Log tập trung, trace, metrics | `[DEFERRED]` phase 17; admin đọc log từ Loki cũng `[DEFERRED]`. |

---

## 5. Danh tính và phân quyền

### 5.1 Token

| Thông số | Hiện trạng | Đích |
|---|---|---|
| Thuật toán | (trước đây) HS256, `JWT_SECRET` dùng chung | **RS256**, header `typ: at+jwt`. Private key chỉ ở auth, public key qua JWKS. |
| Access token TTL | 15 phút (một chỗ khác cấu hình 7 ngày) | **15 phút**, một cấu hình duy nhất |
| Refresh token | Opaque, AES-GCM, lưu trong `UserSession`, rotation + grace | **Giữ nguyên** |
| Session TTL | 30 ngày | 30 ngày |
| Verify ở service | JWT + 2 query DB | **Chỉ JWT** (JWKS, cache theo `kid`). Không query DB. |

**JWT claims (user token):**

```json
{
  "iss": "kmaedu-auth",
  "aud": "kmaedu",
  "sub": "<userId>",
  "sid": "<sessionId>",
  "roles": ["STUDENT"],
  "av": 3,
  "email_verified": true,
  "iat": 1760000000,
  "exp": 1760000900
}
```

- `roles`: một trong `STUDENT` hoặc `TEACHER` (loại trừ nhau), cộng thêm `SYSTEM_ADMIN` nếu là admin hệ thống. `av` là `User.authzVersion` (5.4).
- **Quyền không nằm trong token.** Quyền suy ra từ `roles` qua bảng `ROLE_PERMISSIONS` trong `kmaedu-be/libs/auth-jwt/src/permissions.ts` (nguồn sự thật; FE sinh bản sao `src/types/permissions.generated.ts` từ đó).
- Không có tier hay số dư trong token: KMAEdu không còn gói hay ví, và không có giới hạn nào suy ra từ gói.

### 5.2 Cookie (web)

| Thông số | Đích |
|---|---|
| Tên | `accessToken`, `refreshToken`. Bỏ các cookie trùng `token`, `session_id`. |
| Ai set | **Chỉ auth-service** (`libs/common/src/utils/cookie-config.ts`). Gateway không set cookie (trước đây: `auth-proxy.controller.ts:308-341`, đã xóa). |
| Thuộc tính | `HttpOnly; Secure` (production); `SameSite=Lax`; host-only, không đặt `Domain` (`.kmaedu.fayedark.com` chỉ dùng để xóa cookie cũ lúc logout). FE và API cùng origin qua nginx nên không cần `SameSite=None`. |
| `refreshToken` | `Path=/api/v1/auth`, thời hạn bằng session TTL |
| Thời hạn `accessToken` | Bằng TTL của access token |

### 5.3 Service kiểm tra token thế nào

- Thư viện `libs/auth-jwt` (không import Prisma) cung cấp: `JwtAuthGuard` rồi `PermissionsGuard`, cả hai đăng ký **global** bởi `AuthJwtModule.forRoot({ serviceName })`, **deny-by-default** (route không khai báo gì bị 403 `NO_AUTHZ_DECLARED`; context `ws` bỏ qua). Decorator: `@Public()`, `@Authenticated()` (từ chối user chưa xác minh email: 403 `EMAIL_NOT_VERIFIED`), `@AllowUnverified()`, `@RequirePermissions()`, `@RequireOwnerOrPermission()`, `@ServiceOnly(...callers)`, `@RequirePermissionsOrService()`, `@CurrentUser()`. Thay cho `AuthGuard`/`AdminGuard`/`RolesGuard('admin')`/`OptionalJwtAuthGuard` cũ.
- Gateway đã kiểm tra thu hồi. Service vẫn verify lại chữ ký, `iss`, `aud` bằng JWKS (phòng thủ nhiều lớp), nhưng không query DB.
- **gRPC nội bộ: vị trí mạng không cấp quyền gì.**
  - *Gọi do user khởi tạo:* bên gọi chuyển tiếp **access token của user** trong metadata `authorization`, qua tham số `metadata` tường minh của client wrapper (không dùng AsyncLocalStorage). Bên nhận verify lại bằng `libs/auth-jwt`; người thực hiện là `sub` của token, không bao giờ là `actor_id` trong body.
  - *Gọi của hệ thống (event, cron, worker):* dùng **service token**. Caller gọi `POST /internal/token` của auth (chỉ trong mạng `internal`, không route qua gateway; kiểu `client_credentials`, mỗi service một `SERVICE_CLIENT_SECRET`, auth chỉ giữ hash trong `SERVICE_CLIENTS`) và nhận JWT RS256 với `sub=svc:<name>`, `aud=<service đích>`, `roles=["SERVICE"]`, TTL 5 phút; caller cache lại.
  - *RPC đổi trạng thái* (auth `SetUserRole/SetSystemAdmin/SetUserStatus`, `GatewayControl*`, r2 xóa/upload) cần token user có đúng quyền, hoặc service token của caller nằm trong allowlist (`@ServiceOnly(...)`, `@RequirePermissionsOrService`). RPC chỉ đọc cũng khai báo quyền tối thiểu đủ dùng (permission, kiểm tra chủ sở hữu hoặc allowlist service, ví dụ `GetQuizSetSnapshot` cần `quizset:manage` + chủ sở hữu, `GetPageFlags` là `@ServiceOnly('gateway')`); `@RequirePermissionsOrService([])` (mọi token hợp lệ) chỉ dành cho dữ liệu công khai như public profile, hoặc dữ liệu của chính user khi handler gọi `assertSelfOrService` (ví dụ r2 `ListUserFiles`).
  - (Trước đây) metadata `x-user-id`/`x-user-roles` được tin vì cổng gRPC "chỉ mở trong mạng internal"; cách đó đã bỏ, không service nào đọc các header này.
  - mTLS (Linkerd) trên K8s: `[DEFERRED]` phase 17.

### 5.4 Logout, ban, đổi quyền

1. **Logout / thu hồi một session:**
   - auth xoá `UserSession`.
   - auth gọi gateway `RevokeSession(sid, exp)`, gateway ghi `gw:revoked:sid:<sid>` với TTL = `exp - now`; auth cũng publish `auth.session.revoked` (đường bền).
2. **Đổi role / đổi cờ admin / ban / đổi mật khẩu:**
   - `User.authzVersion` tăng **trong cùng transaction** với thay đổi. Token mang claim `av`.
   - Refresh ký token mới trong một transaction đọc `role, isSystemAdmin, authzVersion` (`FOR SHARE`), nên token mới luôn thấy trạng thái mới nhất.
   - Gateway giữ `gw:user:<id>:av`. Token có `av` nhỏ hơn → `401 TOKEN_STALE` → client refresh một lần.
   - Hai đường báo cho gateway: gRPC nhanh `InvalidateUser(user_id, authz_version)`, và đường **bền** là worker của gateway consume `auth.user.authz_changed` (`SET` idempotent nếu lớn hơn). Event này mang `{userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}`.
   - Đổi role và đổi mật khẩu **không** thu hồi session (refresh nhặt trạng thái mới). **Ban** thu hồi session (auth `SetUserStatus`).
   - study-room nhận `auth.user.authz_changed` để gửi `auth:reauth` rồi ngắt socket.
   - Bảo vệ "admin cuối cùng": `pg_advisory_xact_lock` khi đổi role và khi ban.
3. Vì access token chỉ sống 15 phút, rủi ro còn lại tối đa 15 phút ngay cả khi gọi thẳng service. Chấp nhận được vì service không có đường vào từ ngoài và mọi RPC đều đòi token (5.3).

### 5.5 Phân quyền

| Cấp | Nằm ở đâu | Ý nghĩa |
|---|---|---|
| Đã đăng nhập | Gateway (`auth: required`) + guard ở service | Có token hợp lệ, chưa bị thu hồi |
| Quyền theo role | Claim `roles` → `ROLE_PERMISSIONS` | `SYSTEM_ADMIN` được vào `/api/v1/admin/*` (quyền `admin:access`); TEACHER có quyền quản lý nội dung, phòng thi |
| Sở hữu tài nguyên | Từng service (`@RequireOwnerOrPermission`; tài nguyên không thuộc người gọi trả 404, thiếu quyền trả 403) | Sửa hoặc xoá quiz, phòng thi, tài liệu… |
| Theo phòng | assessment, study-room | Host/cohost, whitelist, mã mời, ban/mute |

**Multi-tenancy:** không áp dụng. Nếu sau này bán cho trường học (B2B) thì thêm claim `org_id` và cột `org_id` theo mô hình "tenant theo cột" của hệ thống tham chiếu.

---

## 6. Giao tiếp giữa các service

### 6.1 Khi nào dùng kiểu nào

| Nhu cầu | Kiểu | Ví dụ |
|---|---|---|
| Client gọi backend | **REST qua gateway** (+ SSE, WS) | `POST /api/v1/quizsets` |
| Cần kết quả ngay (đọc, hoặc ghi cần phản hồi) | **gRPC** đồng bộ | assessment lấy snapshot đề; content kiểm tra tài liệu qua document (`AssertOwnership`) |
| Stream kết quả LLM | **gRPC server-streaming** | ai-chat → ai `StreamChat`, rồi ai-chat phát lại cho client bằng SSE |
| Báo cho service khác tự xử lý, không cần chờ | **RabbitMQ** event | `auth.user.authz_changed` → gateway cập nhật `av`, study-room ngắt socket |
| Việc chạy lâu (giây → phút) | **RabbitMQ** request/completed | `document.uploaded` → `ai.document.processed` |
| Thu hồi token, đổi cấu hình edge | **gRPC** sang gateway | `RevokeSession`, `SetPageFlags` |
| HTTP giữa các service | **Cấm** | HTTP nội bộ và `INTERNAL_SERVICE_TOKEN` đã bỏ; thay bằng gRPC hoặc event |
| Truy cập DB của service khác | **Cấm tuyệt đối** (`yarn check:ownership`, `yarn check:deps` chạy trong CI) | admin đổi role qua auth `SetUserRole`, không ghi bảng `User` |

### 6.2 gRPC

**Quy ước proto** (`kmaedu-be/proto/`, quản lý bằng buf):

```proto
syntax = "proto3";
package kmaedu.document.v1;                        // kmaedu.<svc>.v<major>

service DocumentService {
  rpc GetDocumentsByIds (GetDocumentsByIdsRequest) returns (GetDocumentsByIdsResponse); // batch, tránh N+1
  rpc AssertOwnership (AssertOwnershipRequest) returns (AssertOwnershipResponse);
  rpc DeleteDocuments (DeleteDocumentsRequest) returns (DeleteDocumentsResponse);       // idempotent
}

message GetDocumentsByIdsRequest {
  repeated string ids = 1;      // chỉ trả bản ghi của người gọi
}
```

- Tên RPC theo dạng `GetX`, `GetXsByIds` (batch), `ListX`, `CreateX`, `UpdateX`, `DeleteX`, hoặc động từ nghiệp vụ (`AssertOwnership`, `RevokeSession`).
- **Thay đổi tương thích ngược:** chỉ thêm field hoặc RPC. Muốn breaking thì tạo package `v2` và chạy song song. `buf breaking` chặn ngay trong CI.
- **RPC ghi trạng thái quan trọng** phải idempotent (ví dụ `DeleteDocuments` xóa lặp lại không lỗi; event có `id` để consumer bỏ trùng).

**Pipeline sinh code:**

```
proto/**/*.proto ──► buf lint ──► buf breaking (so với main) ──► buf generate
                                                                  │
                         ┌────────────────────────────────────────┼─────────────────────┐
                         ▼                                        ▼                     ▼
              libs/contracts/src/generated/          apps/ai-service/src/       (sau này: package
              (ts-proto: nestJs=true,                (grpc_tools.protoc,        npm/pypi có version
               addGrpcMetadata=true,                  apps/ai-service/           nếu tách repo)
               addNestjsRestParameter=true)           scripts/gen_grpc.sh)
```

- Cờ ts-proto trong `kmaedu-be/proto/buf.gen.yaml`: `nestJs=true`, `addGrpcMetadata=true`, `addNestjsRestParameter=true`, `esModuleInterop=true`, `env=node`, `forceLong=string`. Stub Python sinh bằng `grpc_tools.protoc` (`gen_grpc.sh`), không phải plugin buf.
- Code sinh ra **không commit** (`libs/contracts/src/generated/` bị gitignore) mà sinh ở bước build (`yarn proto:gen`; `yarn proto:lint` để lint). `buf breaking` chạy trên PR so với base (`.github/workflows/ci.yml`).

**gRPC server (NestJS):** mỗi service là **hybrid app** gồm HTTP `:3000` và gRPC `:50051` trong cùng process (vai trò `api`). Khi cần scale riêng thì tách thành vai trò `grpc`.

```ts
// apps/document-service/src/modules/upload/document.grpc.controller.ts
@Controller()
@documentV1.DocumentServiceControllerMethods()      // sinh từ ts-proto
export class DocumentGrpcController implements documentV1.DocumentServiceController {
  // mỗi method khai báo quyền (@RequirePermissions) và gọi cùng Service layer với HTTP controller
}
```

**gRPC client:**
- `libs/grpc` cung cấp `GrpcClientModule.register({ name, package, url })`, kèm:
  - deadline mặc định 3 giây (AI 60 giây, stream không giới hạn),
  - retry có backoff cho `UNAVAILABLE`, **chỉ với RPC trong allowlist idempotent** (`IDEMPOTENT_RPCS`; ví dụ upload file không bao giờ được retry),
  - metadata (`authorization`) truyền qua tham số tường minh, không ngầm,
  - chuyển gRPC status sang HTTP.
- Mỗi service gói lời gọi ra ngoài trong một class `clients/<x>.client.ts` (ví dụ `AuthClient`, `DocumentClient`). Code nghiệp vụ không gọi stub trực tiếp.

| gRPC status | HTTP (ở service gọi) |
|---|---|
| `INVALID_ARGUMENT` | 400 |
| `UNAUTHENTICATED` / `PERMISSION_DENIED` | 401 / 403 |
| `NOT_FOUND` | 404 |
| `ALREADY_EXISTS` / `ABORTED` | 409 |
| `FAILED_PRECONDITION` | 422 |
| `RESOURCE_EXHAUSTED` | 429 |
| `UNAVAILABLE` / `DEADLINE_EXCEEDED` | 503 / 504 |

**Địa chỉ:** `<key>:50051` theo tên service trong compose (ví dụ `auth:50051`, `vocabulary:50051`; trên K8s là `<svc>-service.<ns>.svc.cluster.local:50051`). Container dùng **cùng một cổng** (HTTP `3000`, gRPC `50051`) vì mỗi container có network namespace riêng, nên hết lỗi trùng cổng của bản cũ. Khi chạy local (`yarn dev:*`) mỗi service dùng cổng riêng trong `.env`.

**Danh mục RPC (đích):**

| Proto | RPC | Server | Client |
|---|---|---|---|
| `auth/v1` | `GetUser`, `GetUsersByIds` (đặc quyền: service token + `user:manage`), `GetPublicProfilesByIds` (chỉ field công khai), `FindUserByEmail`, `ListUsers`, `SetUserRole`, `SetSystemAdmin`, `SetUserStatus`, `ListRoleChanges`; `AuthUserService`: `UpdateUserAdmin`, `SearchUsers`, `GetUserStats(range)`, `GetUserAdminDetail` | auth | content, assessment, study-room, admin |
| `gateway/v1` | `RevokeSession`, `InvalidateUser`, `SetPageFlags` | gateway | auth, admin |
| `r2/v1` | `UploadFile`, `GetFileUrl`, `DeleteFile`, `ListUserFiles`, `DeleteObjects(keys[])`, `CreatePresignedDownload` (HTTP `internal/upload` và `INTERNAL_SERVICE_TOKEN` đã bỏ) | r2 | document, content, ai-chat, vocabulary, auth |
| `document/v1` | `CreateUpload`, `GetDocumentsByIds`, `AssertOwnership`, `GetQuota`, `EnsureProcessed`, `DeleteDocuments`, `ListDocuments`, `GetDownloadUrl` | document | content, ai-chat |
| `content/v1` | `GetQuizSetSnapshot`, `GetQuizSetsByIds`, `GetUserContentStats` | content | assessment, admin |
| `ai/v1` | `StreamChat`, `Query`, `GenerateWordFamily`, `ListModels` | ai-service | ai-chat, vocabulary, content |
| `vocabulary/v1` | `WordFamilyService.GetWordFamily`; `WordFamilyAdminService`: `ListCategories`, `UpsertCategory`, `DeleteCategory` | vocabulary | content, admin |
| `admin/v1` | `GetPageFlags` | admin | gateway (lúc khởi động) |

Không có RPC `DeleteUser` (xóa user là `[DEFERRED]`, 7.2). Danh mục trên khớp `kmaedu-be/proto/kmaedu/*/v1/*.proto`.

### 6.3 RabbitMQ

**Topology:**

```
exchange: kmaedu.events (topic, durable)            exchange: kmaedu.dlx (topic)
   │ routing key = <domain>.<entity>.<verb-past>        │
   ├─► queue gateway.events     (bind auth.user.authz_changed, auth.session.revoked)
   ├─► queue document.events    (bind ai.document.*)
   ├─► queue ai.events          (bind document.uploaded, document.deleted, content.generation.requested)
   ├─► queue content.events     (bind ai.generation.*, document.deleted, auth.user.updated)
   ├─► ...                       mỗi queue: x-dead-letter-exchange=kmaedu.dlx
   └─►                           retry: một tầng <svc>.retry.30s (TTL 30 giây) → về queue chính
                                 quá 5 lần → <svc>.dlq (cảnh báo + replay thủ công)
```

- **Topic theo domain event, không theo service nhận** (đây là cải tiến so với hệ thống tham chiếu). Bên gửi không cần biết ai nghe. Service nào cần thì tự bind.
- Mỗi service **một queue** `<svc>.events`, tên lấy theo service. Bỏ fallback `common-queue`.
- **Một RabbitMQ user cho mỗi service**: chỉ được publish lên `kmaedu.events` với routing key khớp `^<domain>\.`, chỉ đọc queue của mình (user/permission render từ `deploy/rabbitmq/definitions.template.json`). Consumer kiểm tra `source` của envelope khớp domain của routing key.
- `prefetch` = 10–20. Ack **sau khi** xử lý xong và commit DB. Lỗi tạm thời thì nack vào retry queue, lỗi vĩnh viễn (dữ liệu sai) thì đưa thẳng vào DLQ.

**Envelope chung** (dùng cho cả Nest và Python):

```json
{
  "id": "evt_01JAB...",
  "type": "auth.user.updated",
  "version": 1,
  "occurredAt": "2026-10-17T08:00:00Z",
  "source": "auth",
  "correlationId": "req_01JAB...",
  "data": { "userId": "usr_01J...", "email": "a@example.com", "name": "Nguyen Van A" }
}
```

- Schema `data` của từng event khai báo trong `proto/kmaedu/events/v1/*.proto` (hoặc JSON Schema). Kiểu sinh ra dùng chung cho producer và consumer.
- Header AMQP mang `traceparent`: `[DEFERRED]` cùng OpenTelemetry (phase 17).
- Event **trạng thái** mang thêm `version` (số tăng dần); consumer chỉ áp dụng nếu mới hơn bản đã có.

**Producer — outbox pattern:**
1. Trong **cùng transaction** với thay đổi nghiệp vụ, ghi một dòng vào bảng `outbox_events` của service.
2. Vai trò `worker` chạy **relay**: claim các dòng chưa gửi trong một transaction ngắn (`FOR UPDATE SKIP LOCKED`), publish **ngoài** transaction với **publisher confirms**, rồi đánh dấu đã gửi. Dọn hằng ngày: `outbox_events` quá 7 ngày, `processed_events` quá 14 ngày.
3. Nhờ đó không mất event khi DB commit xong mà broker lỗi (trước đây auth publish kiểu fire-and-forget).

**Consumer — idempotent:**
- Bảng `processed_events(event_id PK, processed_at)` trong DB của service consumer. Ghi dòng này trong cùng transaction với tác dụng của event. Event trùng thì bỏ qua.
- Handler phân loại theo `type`:

  ```ts
  @EventHandler('auth.user.authz_changed')
  async onAuthzChanged(envelope: Envelope) {
    // gateway-service/src/events/authz-changed.handler.ts (rút gọn)
    await this.state.raiseAuthzVersion(data.userId, data.authzVersion); // gw:user:<id>:av
  }
  ```

**Danh mục event:**

| Event | Bên gửi | Bên nhận | Tác dụng |
|---|---|---|---|
| `auth.user.authz_changed` `{userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}` | auth | gateway, study-room | Event duy nhất về danh tính/quyền (không có `role_changed`). Gateway cập nhật `gw:user:<id>:av`; study-room ngắt socket. |
| `auth.session.revoked` | auth | gateway | Ghi `gw:revoked:sid:<sid>` (đường bền) |
| `auth.user.updated` `{…, version}` | auth | study-room, content, assessment, ai-chat | Xoá cache tên/avatar. |
| `auth.user.registered` | auth | — (không còn consumer) | Chỉ để tương thích. |
| `auth.user.deleted` | auth | — | `[DEFERRED]` (xóa user, 7.2): chưa tồn tại. |
| `document.uploaded` | document | ai-service | Parse, OCR, chunk, embed, dựng graph |
| `ai.document.processed` / `ai.document.failed` | ai-service | document | Cập nhật `processingStatus` (`failed` chỉ đánh dấu file lỗi, không có bước hoàn tiền). |
| `document.deleted` (mảng id) | document | ai-service, content, ai-chat | Xoá vector. Gỡ liên kết `storageId`. |
| `content.generation.requested` | content | ai-service | Sinh quiz/flashcard |
| `ai.generation.completed` / `ai.generation.failed` | ai-service | content | Ghi quiz/flashcard, lịch sử sinh; `failed` → job `FAILED`, không có hoàn tiền |
| `content.quizset.deleted` (mảng id) | content | assessment | Đánh dấu phòng thi `sourceDeleted`. Phiên thi vẫn dùng snapshot. |

### 6.4 Không có transaction phân tán

- Nhất quán giữa các service đạt được dần qua event (eventual consistency) + outbox + consumer idempotent.
- **Không có luồng tiền.** KMAEdu không còn ví, gói hay thanh toán, nên không có bước trừ/hoàn tiền cần bù.
- **Trường hợp cần bù trừ** (ví dụ AI sinh lỗi): content chỉ đổi trạng thái job (`FAILED`); watchdog fail job `QUEUED`/`PROCESSING` quá hạn. Không có saga hoàn tiền.

---

## 7. Dữ liệu

### 7.1 Nguyên tắc

- **Mỗi service một database.**
  - Giai đoạn đầu: một server Postgres, mỗi service một **schema** (`auth`, `content`…) + một **role** chỉ có quyền trên schema đó.
  - Prisma kết nối bằng `DATABASE_URL=postgresql://content_svc:***@postgres:5432/kmaedu?schema=content`. Nhưng `?schema=` **không đủ** cho raw SQL qua `@prisma/adapter-pg`, nên init script `deploy/postgres/init/01-service-schemas.sh` còn chạy `ALTER ROLE <svc>_svc SET search_path = <svc>, extensions`. pgvector nằm trong schema `extensions`. ai-service (Python) đặt `search_path` cho từng pool (`DB_SEARCH_PATH=ai,extensions`) và kết nối **không** dùng `?schema=`.
  - Giai đoạn sau: mỗi service một database riêng. Chỉ phải `pg_dump --schema` sang DB mới và đổi URL, code không đổi.
- **Không FK xuyên service.**
  - Cột như `userId`, `quizSetId`, `storageId` trỏ sang service khác chỉ là `String` có index.
  - FK **trong** cùng service giữ nguyên (ví dụ `QuizQuestion → QuizSet`, `AIChat → Subject`).
- **Đọc dữ liệu service khác:** gọi RPC **batch** (`GetPublicProfilesByIds` cho tên/avatar), cache Redis TTL ngắn (5–10 phút) và xoá cache khi nhận event `*.updated`. **Không** lưu bản sao lâu dài, trừ snapshot có chủ đích (7.3).
- **Migration thuộc về service:** mỗi service có `prisma/schema.prisma` và `prisma/migrations/` riêng. Vai trò `migrate` chạy `prisma migrate deploy` trước vai trò `api`. **Bỏ `db push`** trên production. ai-service dùng Alembic.

### 7.2 Xóa user: `[DEFERRED]`

Các FK xuyên service đã bị bỏ (giữ `userId` + `@@index`), nên xóa `User` không còn cascade xuyên domain. **Chưa có** luồng xóa user: không có `auth.user.deleted`, không có RPC `DeleteUser`, chưa có fan-out xóa dữ liệu (mục roadmap, `[DEFERRED]`). Thiết kế dự kiến: auth xóa mềm, publish event qua outbox, mỗi service xóa dữ liệu của mình trong một transaction, rồi xóa cứng sau N ngày.

**Đã có:** xóa bản ghi sở hữu file R2 (quy tắc bắt buộc của repo) ghi `r2_delete_tasks` **trong cùng transaction** với việc xóa/thay ảnh (schema `auth`, `content`, `vocabulary`, `document`); một worker (`libs/messaging/src/r2-delete`) rút bảng và gọi r2 `DeleteObjects` có backoff. Không bao giờ gọi R2 sau commit trong event handler.

### 7.3 Snapshot có chủ đích

| Nơi lưu | Snapshot | Lý do |
|---|---|---|
| `ExamSession.quizSnapshot` + `quizSnapshotHash` (assessment) | Câu hỏi và đáp án lúc tạo phiên (snapshot v1, tối đa 1 MB, hash nội dung) | Kết quả thi bất biến. Không gọi content mỗi lần làm bài. |

- Tên thí sinh lấy qua `GetPublicProfilesByIds` (có cache). `ExamAttempt.userDisplayName` và read model `admin_metrics_daily` **không có**: KPI admin qua RPC tổng hợp (4.4).
- Quiz set bị xóa **không** cascade sang `ExamRoom`: phòng giữ `sourceDeleted` và `quizSetTitle`; phiên thi vẫn dùng snapshot (tạo phiên mới trả 422 `QUIZSET_DELETED` / `QUIZSET_TOO_LARGE`).
- Banner "Đề đã thay đổi" (`snapshotOutdated`) và `POST /examsessions/:id/refresh-snapshot`: chỉ khi phiên còn UPCOMING và 0 lượt làm bài, ngược lại 409 `SNAPSHOT_LOCKED`.
- **Sinh quiz/flashcard:** job được tạo thẳng ở `QUEUED` + outbox trong một transaction (không có bước tính phí); watchdog fail job quá hạn (`GENERATION_JOB_TIMEOUT_MINUTES`); hủy (`DELETE /ai/job/:id`) và lỗi sinh chỉ đổi trạng thái.

### 7.4 Redis

| Prefix | Chủ sở hữu | Dùng cho |
|---|---|---|
| `gw:` | gateway | Revoke list, page flags, rate limit |
| `auth:` | auth | Mã OAuth exchange một lần, cache user |
| `content:` | content | Cache quiz/flashcard, khoá sinh AI `content:gen:lock:<userId>:<type>` |
| `assessment:` | assessment | Cache phòng thi, phiên thi |
| `studyroom:` | study-room | State sống (timer, media, chat, presence) + Socket.io adapter |
| `vocab:`, `aichat:`, `doc:`, `admin:` | service tương ứng | Cache |
| `cache:user:` | mỗi service tự giữ bản của mình (`content:cache:user:<id>`) | Cache tên/avatar lấy từ `GetPublicProfilesByIds` (TTL 600 giây) |

- Mỗi service dùng prefix của mình. **Redis ACL user theo service: `[DEFERRED]`** (phase 17); hiện các service dùng chung một Redis và chỉ tuân theo quy ước prefix.
- **Session nằm ở Postgres** của auth. Redis chỉ là cache, mất Redis không mất dữ liệu.

---

## 8. Cấu trúc một service

### 8.1 Phân tầng

```
HTTP route ─► Controller ─► DTO (zod / nestjs-zod) validate
                  │
gRPC method ─► GrpcController (implements <Svc>ServiceController, sinh từ proto)
                  │
Event ─────► EventHandler (@EventHandler('<type>'), idempotent)
                  │
                  ▼
              Service (nghiệp vụ; mở transaction; ghi outbox)
                  │            └─► clients/<X>Client (gRPC ra ngoài, có deadline)
                  ▼
              Repository (Prisma client CỦA SERVICE, không dùng prisma[modelName])
                  │
                  ▼
              Postgres schema của service
Response ◄── Mapper/serializer (bỏ field nhạy cảm) ── error filter (envelope chung)
```

Nguyên tắc: HTTP controller, gRPC controller và event handler **dùng chung Service layer**. Logic nghiệp vụ không nằm trong controller hay handler.

### 8.2 Cây thư mục chuẩn (monorepo `kmaedu-be`)

```
kmaedu-be/
├─ proto/                                 # NGUỒN GỐC mọi contract
│  ├─ buf.yaml  buf.gen.yaml
│  └─ kmaedu/
│     ├─ common/v1/*.proto                # pagination
│     ├─ auth/v1/auth.proto
│     ├─ gateway/v1/gateway_control.proto
│     ├─ ...
│     └─ events/v1/*.proto                # schema data của event
├─ apps/
│  ├─ gateway-service/
│  │  └─ config/routes.yaml                # một file, ${VAR} nội suy từ env
│  ├─ <svc>-service/
│  │  ├─ prisma/  schema.prisma  migrations/   seed.ts
│  │  ├─ src/
│  │  │  ├─ main.ts                       # đọc ROLE: api | worker | migrate
│  │  │  ├─ app.module.ts  worker.module.ts
│  │  │  ├─ modules/<feature>/
│  │  │  │  ├─ <feature>.controller.ts  <feature>.grpc.controller.ts
│  │  │  │  ├─ <feature>.service.ts     <feature>.repository.ts
│  │  │  │  └─ dto/
│  │  │  ├─ events/  handlers/*.handler.ts   (consumer)
│  │  │  ├─ clients/ auth.client.ts  document.client.ts  (gRPC ra ngoài)
│  │  │  └─ config/  env.schema.ts       # zod validate env lúc khởi động
│  │  ├─ test/  *.e2e-spec.ts  contract/
│  │  └─ .env.example
│  └─ ai-service/                         # Python: alembic/, src/grpc_server.py, src/workers/
├─ libs/                                  # CHỈ hạ tầng, KHÔNG nghiệp vụ, KHÔNG Prisma dùng chung
│  ├─ contracts/      # code sinh từ proto (build-time)
│  ├─ auth-jwt/       # JWKS verify, JwtAuthGuard + PermissionsGuard, decorator, service-token client
│  ├─ grpc/           # client factory: deadline, retry, metadata, error mapping
│  ├─ messaging/      # publisher (confirm), outbox relay, consumer (idempotent, retry, DLQ)
│  ├─ observability/  # pino logger (nestjs-pino, JSON) + health /health/{live,ready} (terminus); OpenTelemetry, /metrics: [DEFERRED]
│  ├─ http/           # error envelope filter
│  └─ redis/          # Redis module/service dùng chung
├─ deploy/
│  ├─ Dockerfile.node     # ARG SERVICE; một recipe cho mọi service Node
│  ├─ docker-compose.yml  # include: compose/<key>.yml; mỗi service: <key>, <key>-migrate (ai thêm ai-worker)
│  ├─ services.json       # danh mục service (key = tên compose = proto package)
│  ├─ deploy-service.sh   # deploy một service theo sha (migrate gate, rollback)
│  ├─ cutover-runbook.md  # runbook cutover production (một lần)
│  └─ k8s/                # [DEFERRED] phase 17: Helm chart chuẩn dùng chung
└─ .dependency-cruiser.cjs # cấm apps/A import apps/B; cấm libs import @prisma/client
```

**Đi đâu những thứ đang nằm trong `libs/common`:**

| Hiện ở `libs/common` | Chuyển về |
|---|---|
| Guard đọc Prisma (`auth.guard.ts`, `admin.guard.ts`, `optional-auth.guard.ts`) | `libs/auth-jwt` (bản không DB; guard cũ đã xóa) |
| Mail, password, refresh-token cipher, Google OAuth guard, `sanitizeUser` | auth-service |
| PDF, image processing | document-service hoặc ai-service |
| Enum và payload event của mọi domain | `proto/kmaedu/events/v1` |
| `BaseRepository` (`prisma[modelName]`) | Bỏ. Mỗi service viết repository kiểu tường minh. |
| `grpc-clients.module.ts`, `protos/` | `libs/grpc` + `libs/contracts` + `proto/` |
| `AuditWriterService` | admin-service |
| (trước đây) `libs/database` (Prisma chung) | **Đã bỏ.** Mỗi service có Prisma riêng. |

### 8.3 Một image, nhiều vai trò

Mỗi service build **một image riêng** từ một recipe chung (`deploy/Dockerfile.node`, xem 10.2). Vai trò chọn qua biến `ROLE`, `deploy/docker-entrypoint.sh` chọn việc theo vai trò (không bao giờ chạy `db push` hay `migrate resolve`).

| Vai trò | Lệnh | Compose service | Có ở |
|---|---|---|---|
| `api` | HTTP `:3000` + gRPC `:50051` (hybrid) | `<key>` | mọi service |
| `worker` | Outbox relay, consumer, reaper, poller `r2_delete_tasks` | trong `<key>` khi `ROLE=api,worker` | service có event/worker (xem `services.json`) |
| `migrate` | `prisma migrate deploy` rồi thoát (one-shot) | `<key>-migrate` | service có DB |
| `seed` | seed của service (`SEED_PROFILE=prod\|dev`) | `seed` (compose/seed.yml) | auth, admin, ai-chat, vocabulary |

Service Node chạy `ROLE=api,worker` trong **một container** (không có `<svc>-worker` riêng); `admin` và `study-room` không có worker riêng. ai-service là ngoại lệ: ba container `ai` (`ROLE=api`: gRPC + health), `ai-worker` (`ROLE=worker`: consumer, xử lý tài liệu nặng, có healthcheck heartbeat) và `ai-migrate` (`ROLE=migrate`: `alembic upgrade head`).

### 8.4 Quy ước REST

- Đường dẫn ngoài là `/api/v1/<resource>`, **giữ nguyên như hiện tại**. Service tự mount đúng prefix nên gateway không phải rewrite.
- Phân quyền: mỗi handler khai báo đúng một decorator của `libs/auth-jwt` (`@RequirePermissions`, `@RequireOwnerOrPermission`, `@Public`, hoặc `@Authenticated` nằm trong allowlist; 5.3). Kiểm tra sở hữu làm ở Service; `yarn test test/authz` fail nếu thiếu khai báo.
- Response thành công giữ shape hiện tại để FE không vỡ. Phân trang `{ data, meta: { page, limit, total } }`.
- Lỗi, chốt một envelope chung (áp dụng cho endpoint mới; endpoint cũ chuyển dần cùng FE):

  ```json
  { "statusCode": 422, "code": "INSUFFICIENT_BALANCE", "message": "Số dư không đủ", "requestId": "req_01J..." }
  ```

### 8.5 Biến môi trường chính của một service

Ví dụ rút gọn, lấy từ `deploy/compose/content.yml` (danh sách đầy đủ: `deploy/env/README.md`):

```dotenv
NODE_ENV=production
ROLE=api,worker
PORT=3000
GRPC_PORT=50051
DATABASE_URL=postgresql://content_svc:***@postgres:5432/kmaedu?schema=content
REDIS_HOST=redis
RABBITMQ_URL=amqp://content:***@rabbitmq:5672
AUTH_JWKS_URL=http://auth:3000/.well-known/jwks.json
AUTH_TOKEN_URL=http://auth:3000/internal/token
SERVICE_CLIENT_SECRET=***          # secret của riêng service, auth giữ hash trong SERVICE_CLIENTS
JWT_ISSUER=kmaedu-auth
JWT_AUDIENCE=kmaedu
AUTH_GRPC_URL=auth:50051
DOCUMENT_GRPC_URL=document:50051
R2_GRPC_URL=r2:50051
AI_GRPC_URL=ai:50051
```

- **Không còn `JWT_SECRET` ở service nào.** auth giữ `JWT_PRIVATE_KEY` (PEM) + `JWT_KID`; các service chỉ cần `AUTH_JWKS_URL`.
- Mỗi container nhận `env_file: deploy/env/<name>.env` (bắt buộc; mẫu là `*.env.example`), thay cho một `.env` chung chứa mọi secret. `deploy/.env` chỉ để compose nội suy `${VAR}`.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: `[DEFERRED]` cùng OpenTelemetry.

---

## 9. Các luồng mẫu

### 9.1 Đăng nhập rồi gọi API

```mermaid
sequenceDiagram
    participant B as Browser
    participant G as Gateway
    participant A as Auth
    participant C as Content

    B->>G: POST /api/v1/auth/login
    G->>A: proxy (route auth: none)
    A->>A: kiểm tra mật khẩu, tạo UserSession, ký JWT RS256 (sub, sid, roles, av)
    A-->>B: Set-Cookie accessToken, refreshToken (HttpOnly, Lax)
    B->>G: POST /api/v1/ai/generate-from-file (cookie)
    G->>G: verify JWKS, check gw:revoked:sid, gw:user:av, rate limit
    G->>C: proxy + Authorization Bearer
    C->>C: JwtAuthGuard (chỉ verify chữ ký, không query DB)
    C->>C: INSERT GenerationJob(QUEUED) + outbox(content.generation.requested), một transaction
    C-->>B: 202 { jobId }
```

### 9.2 Cấp quyền TEACHER → báo gateway và study-room (outbox + consumer idempotent)

```mermaid
sequenceDiagram
    participant A as Auth
    participant ADB as auth DB
    participant R as RabbitMQ
    participant G as Gateway
    participant S as Study-room

    A->>ADB: BEGIN; UPDATE User (role, authzVersion+1); INSERT outbox_events(auth.user.authz_changed); COMMIT
    A-->>A: (relay trong auth-worker) đọc outbox SKIP LOCKED
    A->>R: publish (confirm) → kmaedu.events / auth.user.authz_changed
    R-->>G: queue gateway.events
    G->>G: ghi gw:user:<id>:av (token cũ → TOKEN_STALE)
    R-->>S: queue studyroom.events
    S->>S: gửi auth:reauth rồi ngắt socket
```

### 9.3 Upload tài liệu → AI xử lý

```mermaid
sequenceDiagram
    participant B as Browser
    participant D as Document
    participant R2 as r2-service
    participant Q as RabbitMQ
    participant AI as ai-service worker

    B->>D: POST /api/v1/ai/upload (qua gateway, stream multipart)
    D->>R2: gRPC UploadFile (token svc:document)
    D->>D: INSERT UserStorage(PENDING) + outbox(document.uploaded, presigned GET URL), một transaction
    D-->>B: 201 { uploadId, status: PENDING }
    Q-->>AI: document.uploaded
    AI->>AI: tải file, OCR/parse, chunk, embed, lưu vào DB ai (pgvector)
    AI->>Q: ai.document.processed { storageId, pages }
    Q-->>D: ai.document.processed
    D->>D: UPDATE UserStorage status=COMPLETED
    Note over D: ai.document.failed → UserStorage FAILED (không hoàn tiền: upload không tính phí)
    B->>D: GET /api/v1/ai/upload/:id (poll; sau này có thể đẩy SSE)
```

### 9.4 Mở phiên thi với snapshot đề

```mermaid
sequenceDiagram
    participant H as Host (Browser)
    participant AS as Assessment
    participant C as Content
    participant S as Student

    H->>AS: POST /api/v1/examsessions { examRoomId }
    AS->>C: gRPC GetQuizSetSnapshot(quizSetId), token host chuyển tiếp
    C-->>AS: câu hỏi + đáp án
    AS->>AS: INSERT ExamSession(quizSnapshot, quizSnapshotHash)
    S->>AS: POST /api/v1/examattempts/start
    AS-->>S: đề đã mã hoá AES (từ snapshot, không gọi content)
    S->>AS: POST /api/v1/examattempts/:id/secure-submit
    AS->>AS: chấm theo snapshot
```

### 9.5 Ban user làm token cũ hết hiệu lực

```mermaid
sequenceDiagram
    participant AD as Admin
    participant A as Auth
    participant G as Gateway
    participant R as Redis (gw:)
    participant SR as Study-room
    participant B as Browser (user bị ban)

    AD->>A: gRPC SetUserStatus(user_id, BANNED), token admin chuyển tiếp
    A->>A: tx: UPDATE User, authzVersion+1, DELETE UserSession*, outbox(auth.user.authz_changed)
    A->>G: gRPC InvalidateUser(user_id, authz_version)
    G->>R: SET gw:user:{id}:av (nếu lớn hơn)
    A-->>G: (event bền) auth.user.authz_changed → cùng SET, idempotent
    A-->>SR: (event) auth.user.authz_changed
    SR->>B: auth:reauth + disconnect socket
    B->>G: request với token cũ
    G->>R: av của token < gw:user:av
    G-->>B: 401 TOKEN_STALE → refresh → session đã xoá → 401 → về login
```

---

## 10. Hạ tầng và triển khai

### 10.1 Docker Compose trên VPS

Stack nằm ở `kmaedu-be/deploy/docker-compose.yml`, ghép từ `deploy/compose/<key>.yml` bằng `include:` (cần Docker Compose 2.24+). Ví dụ rút gọn:

```yaml
networks:
  edge:      {}                       # nginx FE ↔ gateway
  internal:  { internal: true }       # gateway ↔ service ↔ data; không ra Internet trực tiếp
  egress:    {}                       # chỉ service cần gọi ra ngoài (ai, r2, auth/OAuth/mail)

services:
  gateway-a:                          # gateway-b giống hệt; alias mạng: gateway
    image: ghcr.io/tgiap04/kmaedu-gateway:${GATEWAY_TAG}
    networks: { edge: {}, internal: {} }   # KHÔNG publish cổng ra host
  content-migrate:
    image: ghcr.io/tgiap04/kmaedu-content:${CONTENT_TAG}
    environment: [ROLE=migrate]
    restart: "no"
  content:
    image: ghcr.io/tgiap04/kmaedu-content:${CONTENT_TAG}
    environment: [ROLE=api,worker]
    networks: [internal]              # (+ egress với service gọi ra ngoài)
    depends_on: { content-migrate: { condition: service_completed_successfully } }
  postgres:
    image: pgvector/pgvector:pg16
    networks: [internal]              # KHÔNG publish cổng
```

- Cổng host duy nhất là nginx FE (`FE_PORT`, mặc định 6368, bind `127.0.0.1` qua `FE_BIND`; host reverse proxy đứng trước). Không container backend nào publish cổng; `6369` cũ đã bỏ.
- **Hai gateway** `gateway-a` và `gateway-b` sau upstream `gw` của nginx FE (`kmaedu-fe/nginx.conf`): `resolve` (nginx ≥ 1.27.3; image `nginx:1.27-alpine`), `max_fails=1 fail_timeout=5s`, `proxy_next_upstream error timeout http_502 http_503` chỉ cho method idempotent, `proxy_connect_timeout 3s`. Có `location /api/` (SSE: `proxy_buffering off`) và `location /ws/` (WebSocket), và khối `real_ip` (`CF-Connecting-IP`, 4.1). Rollout gateway **không reload nginx**: `deploy-service.sh` thay lần lượt `gateway-a` rồi `gateway-b`.
- `depends_on` chỉ dùng cho quan hệ `migrate → api` của chính service đó (và hạ tầng healthy). Bỏ chuỗi "gateway chờ mọi service". Service tự chịu được phụ thuộc chưa sẵn sàng: retry khi kết nối, readiness trả 503 tới khi kết nối được.
- Health: `/health/live` (process còn sống) và `/health/ready` (DB, Redis, broker) qua `@nestjs/terminus`, từ `libs/observability`. `ai-worker` không có cổng HTTP nên dùng healthcheck heartbeat (`/tmp/worker-heartbeat`).
- **Tài nguyên (RAM):** mỗi container có `mem_limit` (cap cứng, không phải reservation). Bảng `mem_limit` trong `kmaedu-be/deploy/README.md` cộng lại khoảng **10,5 GB** cho các container chạy thường trực (gateway 256m ×2; auth, assessment, content, document, ai-chat, study-room 512m; admin, vocabulary, r2 384m; `ai` 1536m; `ai-worker` 2g; postgres 1g; rabbitmq 512m; redis 256m). **Chưa đo RAM thực tế** trên VPS; README yêu cầu chạy `docker compose stats` sau cutover rồi hạ cap `ai-worker` và các cap Node trước khi dựa vào số này. Đã gộp `api` và `worker` thành một container (`ROLE=api,worker`) để tiết kiệm RAM.

### 10.2 Docker image

- **Một recipe** `kmaedu-be/deploy/Dockerfile.node` cho mọi service Node (`--build-arg SERVICE=<thư mục apps/>`). ai-service có `apps/ai-service/Dockerfile` riêng (context `kmaedu-be`).
  1. Stage `deps`: `yarn install --immutable` (cache).
  2. Stage `builder`: `yarn proto:gen`, `prisma generate --schema apps/<svc>/prisma/schema.prisma`, rồi `yarn build <svc>` (bundle webpack **mặc định của Nest**, `nest-cli.json` đặt `webpack: true`; node_modules để external). Không có file `webpack.service.js` tùy biến.
  3. Stage `prod-deps`: `yarn workspaces focus --production`.
  4. Stage `runtime` (`node:22-alpine`): `node_modules` **production** + `dist/` + phần `prisma/` cần cho `ROLE=migrate`/`seed`. Giữ `node_modules` production trong image là quyết định của người dùng ngày 27/10/2026 (không bundle hết); mỗi image Node khoảng 176 MB, `ai` khoảng 477 MB.
- Prisma dùng generator `prisma-client` với `engineType = "client"` và `moduleFormat = "cjs"`, `output = "../src/generated/prisma"` (gitignore): **không có engine native** lúc chạy; client được bundle vào `dist`.
- Runtime base là **Node 22** (`ARG NODE_IMAGE=node:22-alpine`).
- Image Node không chứa OCR (tesseract, ghostscript); OCR thuộc ai-service.
- Tag: `ghcr.io/tgiap04/kmaedu-<key>:<git-sha>` và `:main`; danh mục ở `deploy/services.json`. Rollback bằng cách đổi tag về sha cũ (`deploy-service.sh` tự làm khi lỗi).

### 10.3 CI/CD

Luồng nằm ở `.github/workflows/deploy.yml` (và `ci.yml` cho PR):

```
PR ───────────► lint · typecheck · unit/e2e · buf lint + buf breaking (so với base)
                 · dependency-cruiser · check:ownership · migration lint
                 (scripts/lint-migrations.sh; label `migration:contract` bỏ qua)
push main ────► detect: scripts/changed-services.sh <before> <sha> → {wave1, wave2}
             ──► build + push ghcr.io/tgiap04/kmaedu-<key>:<sha> cho từng service đổi
             ──► SSH VPS: deploy/deploy-service.sh <svc> <sha>, lần lượt theo wave
```

- **Wave:** wave 1 là server của package proto `proto/kmaedu/<x>/` vừa đổi (RPC mới có trước khi caller ra); wave 2 là phần còn lại. Trong mỗi wave: auth đầu (phát JWKS và service token), rồi theo thứ tự chữ cái, **gateway cuối**. `libs/**`, `Dockerfile.node` đổi thì chọn mọi service Node. Đổi proto → build lại server; `buf breaking` giữ client tương thích.
- **`deploy-service.sh`:** đặt tag, pull, chạy `<svc>-migrate` (cổng migrate), rồi `up -d --no-deps --wait`; lỗi thì đổi lại tag cũ, dựng lại image cũ, báo Telegram. Migrate lỗi hoặc `P3009` thì **dừng deploy**, báo Telegram, container cũ vẫn chạy, và **không bao giờ tự chạy** `migrate resolve` hay `db push`.
- **Migration expand → contract:** migration lint từ chối `DROP`, `RENAME`, `ALTER … TYPE`, `SET NOT NULL`, `ADD COLUMN … NOT NULL` không có default, trừ khi PR có label `migration:contract` (PR thứ hai của luồng hai PR).
- **Rabbit:** khi `deploy/rabbitmq/**` đổi, workflow nạp lại bằng `rabbitmqctl import_definitions`.
- **Cổng `CUTOVER_DONE`:** job deploy bị chặn cho tới khi repo variable `CUTOVER_DONE` là `true`; image vẫn được build.
- **Drain thành thật:** request không streaming được drain; client SSE/WS bị cắt khi gateway dừng và tự kết nối lại; một luồng chat AI đang chạy có thể bị cắt (người dùng gửi lại). Gateway chạy hai instance sau nginx để deploy gateway không gây downtime.
- **Cutover production (một lần):** lần deploy production đầu tiên là cutover có **reset DB**, không đi qua wave: backup → dừng stack cũ → drop volume → render định nghĩa RabbitMQ → migrate từng service theo wave → seed → bootstrap admin → smoke; rollback bằng image `:pre-cutover` và restore dump. Chi tiết và lệnh chỉ nằm ở [`kmaedu-be/deploy/cutover-runbook.md`](kmaedu-be/deploy/cutover-runbook.md) (đừng chép lại ở đây). Sau cutover thì wave áp dụng như trên.

### 10.4 Sẵn sàng cho K8s [DEFERRED] (phase 17, chưa làm)

| Compose | K8s tương ứng |
|---|---|
| `<svc>` (ROLE=api) | Deployment `<svc>` + Service (`http:3000`, `grpc:50051`) |
| worker (`ROLE=worker` hoặc `api,worker`) | Deployment tách riêng khi cần (HPA theo độ dài queue) |
| `<svc>-migrate` | Job (Helm pre-upgrade hook) |
| Mạng `internal` | NetworkPolicy: default deny + cho phép trong namespace (không có allow-list theo từng caller) |
| `env/<svc>.env` | ConfigMap + Secret (External Secrets) |
| — | Một Helm chart chuẩn `kmaedu-service`, mỗi service chỉ có `values-<svc>.yaml` |
| gRPC không mã hoá trong mạng internal | mTLS qua Linkerd (mọi RPC đã đòi token, 5.3) |

---

## 11. Bảng quy ước

| Hạng mục | Quy ước |
|---|---|
| Tên service | `<domain>-service` (`content-service`). Image `kmaedu-<domain>`. |
| Path public | `/api/v1/<resource>` (giữ nguyên); WS `/ws/<feature>` |
| Cổng | HTTP `3000`, gRPC `50051` ở **mọi** container |
| Host nội bộ | tên service trong compose (`auth`, `content`, `ai-chat`, `gateway`); `<domain>-service.<ns>.svc.cluster.local` (K8s, `[DEFERRED]`) |
| Env host gRPC | `<DOMAIN>_GRPC_URL=<key>:50051` (ví dụ `VOCABULARY_GRPC_URL=vocabulary:50051`) |
| Package proto | `kmaedu.<domain>.v<major>` |
| Service gRPC | `<Entity>Service`; controller `<feature>.grpc.controller.ts` |
| JWT | RS256, `typ: at+jwt`, `iss`/`aud` cố định; user token: `sub`, `sid`, `roles` (`STUDENT`\|`TEACHER` + `SYSTEM_ADMIN`), `av`, `email_verified`; service token: `sub=svc:<name>`, `aud=<đích>`, `roles=["SERVICE"]`, TTL 5 phút |
| Header xuống service | `Authorization: Bearer <jwt>`, `X-Request-Id` (`traceparent`: `[DEFERRED]`) |
| Metadata gRPC | `authorization: Bearer <token user được chuyển tiếp hoặc service token>`; người thực hiện là `sub`; **không** tin `x-user-id`/`x-user-roles` (đã bỏ) |
| Exchange | `kmaedu.events` (topic), `kmaedu.dlx` |
| Routing key / event type | `<domain>.<entity>.<verb quá khứ>`, snake_case cho nhiều từ (`auth.user.authz_changed`) |
| Queue | `<svc>.events`, `<svc>.retry.30s`, `<svc>.dlq` |
| Envelope | `{ id, type, version, occurredAt, source, correlationId, data }` |
| Bảng hạ tầng trong DB service | `outbox_events`, `processed_events` |
| DB | schema `<domain>`, role `<domain>_svc` |
| Redis | prefix `<domain>:` (ACL user theo service: `[DEFERRED]`) |
| ID | `cuid`/`ulid` dạng chuỗi (giữ như Prisma hiện tại) |
| Lỗi | `{ statusCode, code, message, requestId }`, `code` là UPPER_SNAKE |
| Image tag | `<git-sha>` và `main` (`ghcr.io/tgiap04/kmaedu-<key>`) |
| Branch | `main` = production (giữ như hiện tại) |

---

## 12. Lộ trình migration

**Chiến lược:** strangler fig, từng bước nhỏ, mỗi phase kiểm chứng được. URL public không đổi trong suốt quá trình. Riêng lần deploy production đầu tiên là **một lần cutover có reset DB** (10.3), không chạy song song cũ/mới.

**Trạng thái:** P0–P7 tương ứng phase 01–16 của plan `plans/261017-1547-microservice-refactor-rbac` (đã commit; phase 16 ký duyệt 28/10/2026). P8 (K8s) cùng phần quan sát và Redis ACL của P7 chuyển sang **phase 17 `[DEFERRED]`**. Thêm một phần ngoài bản gốc: RBAC (phase 04, 06–09).

```
P0 Rào chắn ─► P1 Edge & Auth ─► P2 Contract & Event ─► P3 Cắt truy cập chéo DB
                                                              │
         P5 Tách exam-service ◄─ P4 Tách schema per service
                     │
                     └─► P7 Deploy độc lập ─► (P8 K8s: [DEFERRED])
```

Thứ tự thực tế: **P6 (document + ai-service DB, phase 15) đi trước việc tách ai-chat (phase 13)** vì ai-chat cần document-service và gRPC `AiService`; order: 12 ∥ 15 → 13 → 14 → 16.

| Phase | Việc chính | Điều kiện xong | Rollback |
|---|---|---|---|
| **P0 — Rào chắn** (phase 01) | CI chạy unit/e2e hiện có. Snapshot danh sách route gateway (contract test FE). Health ready thật. pino + requestId. Bỏ publish Postgres `5411`, bỏ in `DATABASE_URL` ra log. Backup DB hằng ngày. (`dependency-cruiser` được cưỡng chế từ phase 10, không chỉ báo cáo.) | CI xanh. Có baseline log và latency. | — |
| **P1 — Edge & Auth** (phase 04–05; RBAC: 06–09) | auth ký **RS256 + JWKS**, phát token có `roles` + `av` (trước đây HS256; không chạy song song, cutover một lần). `libs/auth-jwt` (không DB) thay guard cũ ở mọi service. Gateway chuyển sang **route YAML + proxy stream** (sửa SSE AI chat). Thêm `GatewayControl` gRPC + revoke trong Redis. Cookie chỉ do auth set. Rate limit lưu Redis. Bỏ `DatabaseModule` khỏi gateway. | 0 query `userSession`/`user` ngoài auth. 208 handler → 1 file YAML. SSE stream thật. | Không có cờ legacy; rollback = image `:pre-cutover` + restore dump (`cutover-runbook.md`) |
| **P2 — Contract & Event** (phase 02–03) | Dựng `proto/` + buf + ts-proto/grpcio. Sinh code cho các proto hiện có. Sửa trùng cổng. Xoá code chết (ocr-service, `admin.proto`, `registerAuthClient`, `ExamProxyController`/`FinanceProxyController`, wallet client chưa dùng trong auth, `SessionValidationMiddleware`). `libs/messaging`: envelope v1, outbox, idempotency, retry, DLQ. Event danh tính chạy qua outbox (`auth.user.authz_changed`, `auth.user.updated`). | `buf breaking` chạy trong CI. Không còn interface gRPC viết tay. Một luồng event chạy qua outbox với DLQ. | — (cutover một lần) |
| **P3 — Cắt truy cập chéo DB** (phase 10) | finance thêm `Debit`/`Credit`/`Refund` (idempotent), `AdjustBalance`/`ChangeTier`/`ListPayments`. admin gọi các RPC này thay vì ghi `wallet`. auth thêm `ListUsers`/`SetUserStatus`. admin KPI qua RPC tổng hợp (`GetUserStats`, `GetRevenueStats`, cache Redis 5 phút), không có read model. auth bỏ tạo `UserSubscription`. Service đọc user qua `GetPublicProfilesByIds` + cache thay vì `include: { user }`. `PageFeatureFlag` đi qua `SetPageFlags`. | `dependency-cruiser` + một script quét `prisma.<model>` khẳng định mỗi model chỉ có một service chạm tới. | — (cutover một lần) |
| **P4 — Tách schema** (phase 11) | Mỗi service có `prisma/schema.prisma` riêng. `ALTER TABLE … SET SCHEMA <svc>` (không copy dữ liệu). Drop FK xuyên service, giữ cột + index. Role DB per service. Chuyển từ `db push` sang `migrate deploy`. Xóa user thay cho cascade: `[DEFERRED]` (7.2); xoá file R2 đi qua `r2_delete_tasks`. | Mỗi service kết nối bằng role chỉ thấy schema của mình. Không còn thư viện Prisma chung (legacy `libs/database`). | Do DB reset ở cutover: restore dump. |
| **P5 — Tách exam-service** (phase 12–14) | Thứ tự từ ít phụ thuộc tới nhiều: **study-room** (đã không có FK) → **vocabulary** → **ai-chat** (+ subject) → **content** → **assessment** (+ snapshot đề). Mỗi lần tách: tạo app mới, chuyển module, chuyển schema, đổi route trong YAML, chạy song song, rồi xoá khỏi exam. | `exam-service` bị xoá. Mỗi service mới deploy độc lập. | `exam-service` đã bị xóa; rollback toàn bộ theo cutover |
| **P6 — ai-service & document** (phase 15, đi trước phase 13) | Tạo document-service (`UserStorage`). DB `ai` + Alembic, chuyển `Document`, `DocumentEntity`, graph vào đó (`BenchmarkItem` đã xóa). Bỏ `CREATE TABLE` lúc chạy. ai-service chuyển sang gRPC (`StreamChat`…) + event (`document.uploaded`, `content.generation.requested`). Bỏ HTTP nội bộ và `INTERNAL_SERVICE_TOKEN`. | ai-service chỉ dùng `DATABASE_URL` của DB `ai`. Không còn HTTP giữa các service. | — (HTTP compat đã bỏ) |
| **P7 — Deploy độc lập** (phase 16) | Image riêng, GHCR, tag theo sha. CI build và deploy theo service, theo **wave** (`changed-services.sh`), có migration lint và cổng migrate. `env/<svc>.env` riêng. Một database vật lý riêng cho mỗi service chưa làm (vẫn một server, mỗi service một schema + role). Redis ACL, Grafana/Loki/Tempo/Prometheus, admin đọc log từ Loki: `[DEFERRED]` phase 17. | Đổi một service → chỉ service đó build và restart. | Đổi tag về sha trước (`deploy-service.sh` tự rollback) |
| **P8 — K8s** `[DEFERRED]` (phase 17) | Helm chart chuẩn, NetworkPolicy, Linkerd mTLS, HPA cho worker. | — | — |

**Nguyên tắc khi chạy migration:**
- Mỗi PR chỉ làm một bước, không trộn refactor với đổi hành vi.
- Mọi thay đổi schema theo kiểu expand → migrate → contract.
- Phase nào chạm tới tiền (P3, P5 content, P6) phải có test e2e cho luồng trừ, cộng và hoàn credit trước khi merge.
- Trước P4 và P7 phải có bản backup đã thử restore (cutover-runbook yêu cầu dump trước khi reset).

---

## 13. Checklist thêm một service mới

1. **Proto:** viết `proto/kmaedu/<svc>/v1/*.proto` (và `events/v1` nếu có event). Chạy `yarn proto:lint` và `yarn proto:gen`.
2. **App:** `nest g app <svc>-service` theo cây thư mục 8.2:
   - `main.ts` đọc `ROLE`; `config/env.schema.ts` validate env.
   - `libs/auth-jwt`, `libs/grpc`, `libs/messaging`, `libs/observability`, `libs/http`.
   - `prisma/schema.prisma` với `schema=<svc>`, có bảng `outbox_events` và `processed_events`; model mới thêm vào map trong `scripts/check-model-ownership.ts`.
3. **DB:** tạo schema `<svc>` + role `<svc>_svc` trong `deploy/postgres/init/01-service-schemas.sh` (thêm `<SVC>_DB_PASSWORD`; chỉ chạy trên volume rỗng). Dùng prefix Redis `<svc>:` (Redis ACL: `[DEFERRED]`). Thêm RabbitMQ user và quyền vào `deploy/rabbitmq/definitions.template.json`.
4. **Compose:** thêm `deploy/compose/<svc>.yml` (`<svc>-migrate`, `<svc>`) và một dòng `include:` trong `docker-compose.yml`; thêm `deploy/env/<svc>.env.example`.
5. **Gateway:** thêm upstream và route vào `apps/gateway-service/config/routes.yaml` (khóa `auth`, `permissions`, `pageFlag`, `public`, `maxBodySize`, `timeout`; rate limit ở khối `rateLimits`).
6. **Bên gọi:** thêm `<SVC>_GRPC_URL` và class `clients/<svc>.client.ts` ở service cần gọi; tạo secret `<SVC>_SERVICE_CLIENT_SECRET` và entry trong auth `SERVICE_CLIENTS` nếu service gọi service khác bằng service token (`scripts/gen-service-secret.sh`).
7. **Dữ liệu user:** nếu lưu dữ liệu theo `userId` thì ghi chú vào mục xóa user `[DEFERRED]` (7.2); file R2 xóa qua `r2_delete_tasks`.
8. **CI/Deploy:** thêm service vào `deploy/services.json` (key = tên compose = proto package; không có đồ thị client). Mỗi handler khai báo decorator quyền (5.3).
9. **Observability:** dùng `libs/observability` (pino + `/health/{live,ready}`). Dashboard Grafana, alert DLQ: `[DEFERRED]` phase 17.
10. **Docs:** cập nhật `docs/system/architecture.md` và bảng sở hữu dữ liệu (Phụ lục A).

---

## 14. Quyết định đã chốt và câu hỏi mở

### 14.1 Đã chốt (17/10/2026; cập nhật khi dựng)

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Event broker | **Giữ RabbitMQ**, thêm outbox, DLQ, idempotency, topic theo domain | Đã có sẵn. Quy mô hiện tại chưa cần replay log của Kafka. |
| Triển khai | **Compose trên VPS, thiết kế sẵn cho K8s** (image, registry, deploy theo service) | Chi phí vận hành thấp, chuyển sang Helm không phải sửa code |
| Tách exam-service | **Tách mạnh:** content, assessment, study-room, vocabulary, ai-chat | Theo yêu cầu. Ranh giới theo vòng đời dữ liệu, có snapshot để content và assessment không phụ thuộc runtime. |
| Dữ liệu tài liệu / RAG | **document-service** giữ metadata và trạng thái xử lý. **ai-service** có DB riêng cho chunk, vector, graph. | ai-service thôi ghi bảng của người khác. Trạng thái đồng bộ qua event. |
| Repo | Giữ **monorepo** `kmaedu-be`, ranh giới cưỡng chế bằng dependency-cruiser + image riêng | Ít overhead hơn polyrepo. Khi tách repo thì proto publish thành package. |
| Multi-tenancy | Không áp dụng (B2C) | — |
| Auth | RS256 + JWKS, access token 15 phút, revoke ở gateway; gRPC luôn mang token (user hoặc service) | Bỏ secret dùng chung và 2 query DB mỗi request; mạng không cấp quyền |
| Image Node | Giữ `node_modules` production trong image, không bundle hết (27/10/2026) | Đơn giản; image khoảng 176 MB |

### 14.2 Câu hỏi mở

1. Gateway: giữ NestJS hay chuyển sang Envoy/APISIX khi lên K8s? Đề xuất giữ NestJS tới P8.
2. ~~Trừ credit cho AI~~ **Đã đóng:** tính năng ví/credit đã bỏ; chi phí AI chỉ được chặn bằng rate limit của gateway (có cần hạn mức theo người dùng không là câu hỏi mở nếu sau này cần).
3. ~~`score/database.py` trong ai-service~~ **Đã đóng:** `src/score/`, dev agent, benchmark index và `BenchmarkItem` đã bị xóa ở phase 01.
4. Có cần notification-service (email, thông báo đẩy) trong 6 tháng tới không? Nếu có thì tách khỏi auth ở P7.
5. RAM trên một VPS: các cap `mem_limit` cộng lại khoảng 10,5 GB (bảng trong `kmaedu-be/deploy/README.md`). **Chưa có số đo thực tế** (chưa chạy trên VPS); phải đo bằng `docker compose stats` sau cutover. Đã gộp `api,worker` vào một container.
6. `[DEFERRED]` Xóa user (`auth.user.deleted`, fan-out và purger), phase 17 (K8s, Grafana/Loki/Tempo/Prometheus, Redis ACL, OpenTelemetry): chưa làm.

---

## 15. Phụ lục

### A. Bản đồ sở hữu dữ liệu (model → service sở hữu)

| Model | Service sở hữu | Tham chiếu ra ngoài sau khi cắt FK |
|---|---|---|
| `User`, `UserSession`, `VerifyAccountCode`, `ResetPasswordCode` | auth | — |
| `UserStorage` | document | `userId` |
| `Document` (vector), `GraphIndex`, `GraphEntity`, `GraphRelationship`, `GraphTextUnitEntity`, `GraphCommunity` | ai-service | `storageId`, `userId` |
| `QuizSet`, `QuizSetLabel`, `QuizQuestion`, `DetailsQuizQuestion`, `FlashCardSet`, `FlashCardSetLabel`, `FlashCard`, `DetailsFlashCard`, `HistoryGeneratedQuizz`, `HistoryGeneratedFlashcard`, `QuizPracticeAttempt`, `FlashCardViewHistory`, `UserPinnedFlashcard`, `FlashcardStudyProgress` | content | `userId`, `storageId` |
| `ExamRoom`, `ExamSession`, `ExamAttempt`, `CheatingLog`, `UserPinnedExamRoom` | assessment | `userId`/`hostId`, `quizSetId` (+ snapshot) |
| `StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock` | study-room | `hostId`, `userId` |
| `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` | vocabulary | `userId` |
| `AIChat`, `AIChatMessage`, `AIChatDocument`, `SubjectCategory`, `Subject` | ai-chat | `userId`, `storageId` |
| `AdminAudit`, `PageFeatureFlag` | admin | `adminId`, `targetId` |

### B. Bản đồ route public → service đích

*(bản đồ rút gọn; nguồn sự thật là `kmaedu-be/apps/gateway-service/config/routes.yaml` và `docs/generated/route-list.md`; cột "Hiện tại" là trước refactor)*

| Prefix / path | Hiện tại | Đích |
|---|---|---|
| `/api/v1/auth/*`, `/api/v1/profile`, `/api/v1/devices` | auth | auth |
| (trước đây) `/api/v1/exam/*`, `/api/v1/finance/*` (alias trong `exam-proxy`/`finance-proxy.controller.ts`) | **không chạy**: hai controller không được đăng ký | Đã xóa ở phase 01 |
| `/api/v1/quizsets/*`, `/flashcardsets/*`, `/flashcard-study/*` | exam | content |
| `/api/v1/ai/{generate-from-file, regenerate/:id, job/:id, upload/:id/history, models}` | exam | content |
| `/api/v1/student/{recent-flashcards, pin-flashcard/:id}` | exam | content |
| `/api/v1/examrooms/*`, `/examsessions/*`, `/examattempts/*`, `/cheatinglogs/*` | exam | assessment |
| `/api/v1/student/{recent-exams, pin-exam-room/:id}` | exam | assessment |
| `/api/v1/studyrooms/*`, WS `/ws/study` | exam | study-room |
| `/api/v1/word-family/*` | exam | vocabulary |
| `/api/v1/ai-chat/*`, `/api/v1/subjects/*` | exam | ai-chat |
| `/api/v1/ai/{upload, upload/:id, quick-upload, upload-image}`, `/api/v1/r2/image` | exam | document |
| `/api/v1/ai/recent-uploads`, `/api/v1/ai/upload/:id/history` | exam | content |
| `/api/v1/admin/*` | admin | admin |
| `/api/v1/config/*` | gateway | gateway |

### C. File tham chiếu hiện trạng (legacy, trước refactor; phần lớn đã bị xóa)

| Chủ đề | File |
|---|---|
| Schema chung (trước đây, đã xóa) | `kmaedu-be/libs/database/src/base.prisma`, `libs/database/src/models/*.prisma` |
| Guard đọc DB | `kmaedu-be/libs/common/src/guard/{auth,admin,optional-auth}.guard.ts` |
| Ký JWT | `kmaedu-be/apps/auth-service/src/auth.module.ts`, `auth.service.ts` |
| Refresh token (giữ) | `kmaedu-be/libs/common/src/services/refresh-token-cipher.service.ts` |
| Proxy gateway | `kmaedu-be/apps/gateway-service/src/controllers/*-proxy.controller.ts`, `services/proxy.service.ts`, `main.ts` (WS) |
| gRPC | `kmaedu-be/libs/common/src/protos/*.proto`, `libs/common/src/grpc/` |
| gRPC đúng mẫu (giữ) | `kmaedu-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` |
| Event | `kmaedu-be/libs/common/src/events/`, `apps/finance-service/src/events/user-event.handler.ts` |
| Admin ghi chéo | `kmaedu-be/apps/admin-service/src/modules/admin-finance/admin-finance.service.ts`, `admin-stats/admin-stats.service.ts` |
| ai-service ghi DB chung | `kmaedu-be/apps/ai-service/src/backend/services/{ocr_service,generation_service,benchmark_index_service}.py`, `src/rag/vector_store_pg.py` |
| Deploy | `kmaedu-be/deploy/{Dockerfile,docker-compose.yml,entrypoint-migration.sh}`, `.github/workflows/deploy.yml` |
| Kiến trúc hiện tại (docs) | `docs/system/architecture.md` |
