# Kiến trúc Microservice — Examio (kiến trúc đích và lộ trình migration)

> **Mục đích:** mô tả kiến trúc microservice **thực sự** mà Examio sẽ chuyển sang, và lộ trình đi từ hiện trạng tới đó.
>
> - Mục **2** ghi đúng hiện trạng, có dẫn file làm bằng chứng.
> - Các mục **3–11** là kiến trúc đích.
> - Mục **12** là lộ trình migration theo phase.
>
> **Nguồn:** đọc code `examio-be/`, `examio-fe/`, `deploy/`, `.github/workflows/` (17/10/2026), đối chiếu với kiến trúc cụm ssv-wsm (Gateway + JWT verify phân tán + DB per service + gRPC contract-first + event bus).
> Chỗ nào ghi *(cần xác nhận)* là chưa kiểm chứng đủ trong code.
>
> **Phạm vi:** backend `examio-be` (NestJS + Python). Đường dẫn API public `/api/v1/...` **giữ nguyên**, nên `examio-fe` và `examio-app` không phải đổi trong suốt quá trình migration.

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Hiện trạng: vì sao là "microservice đểu"](#2-hiện-trạng-vì-sao-là-microservice-đểu)
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
- Thanh toán bằng ví credit + gói subscription (SePay).
- Client: web SPA (`examio-fe`) và mobile (`examio-app`, Kotlin Multiplatform). Cả hai chỉ nói chuyện với một cửa vào duy nhất.

**Nguyên tắc kiến trúc:**

| # | Nguyên tắc | Cách làm ở Examio (đích) |
|---|---|---|
| 1 | Một cửa vào | Mọi request từ client đi qua **gateway-service**. Service nghiệp vụ không có cổng public, chỉ nằm trong mạng `internal`. |
| 2 | Đăng nhập tập trung, kiểm tra phân tán | **auth-service** ký JWT **RS256**, công khai **JWKS**. Gateway và từng service tự verify bằng public key. **Không query DB, không gọi auth** cho mỗi request. |
| 3 | Database per service | Mỗi service một database (giai đoạn đầu: một schema Postgres riêng + role riêng). Dữ liệu của service khác chỉ lưu **ID**. Không có FK xuyên service. |
| 4 | Contract-first | Giao tiếp nội bộ đồng bộ bằng **gRPC**. Proto quản lý tập trung bằng **buf** (lint + kiểm tra breaking change), code sinh tự động cho cả TypeScript và Python. |
| 5 | Event cho tác vụ lan toả | **RabbitMQ** topic exchange, event đặt tên theo **domain** (`auth.user.registered`). Ghi event qua **outbox**, consumer **idempotent**, có **DLQ**. |
| 6 | Không có tenant | Examio là B2C, không có multi-tenancy. Cô lập dữ liệu theo `userId` lấy từ claim `sub`. |
| 7 | Một image, nhiều vai trò | Mỗi service một image riêng, chạy được các vai trò `api` / `worker` / `migrate` (mục 8.3). |
| 8 | Nhiều ngôn ngữ cùng chạy | NestJS và Python (FastAPI + gRPC) nói chuyện với nhau qua gRPC và RabbitMQ với cùng một contract. |
| 9 | Triển khai độc lập | Sửa một service chỉ build, test và deploy service đó. Chạy Docker Compose trên VPS, thiết kế sẵn để chuyển sang K8s/Helm mà không phải sửa code. |

---

## 2. Hiện trạng: vì sao là "microservice đểu"

Hiện tại backend là **distributed monolith**: tách process nhưng vẫn dính nhau ở database, auth, thư viện chung và deploy. Đổi một chỗ vẫn phải build và deploy lại tất cả.

| # | Triệu chứng | Bằng chứng | Hệ quả |
|---|---|---|---|
| 1 | **Một database, một schema cho tất cả** | Mọi service nhận cùng `DATABASE_URL` (`deploy/docker-compose.yml`). `yarn prisma:merge` gộp `libs/database/src/models/*.prisma` thành một `schema.prisma`. | Không service nào sở hữu dữ liệu của mình. Đổi schema là đụng tất cả. |
| 2 | **Python ai-service ghi thẳng vào DB chung, tự chạy DDL** | `asyncpg.create_pool(DATABASE_URL)` ở 7 chỗ (6 trong luồng chính + `score/database.py`). Ghi `UserStorage`, `Document`, `HistoryGenerated*`. `CREATE TABLE` cho `UserStorageGraph*`, `BenchmarkItem` (`apps/ai-service/src/backend/services/*`). | Hai nguồn sửa schema không phối hợp với nhau. `BenchmarkItem` đã từng bị lệch schema. |
| 3 | **24 FK trỏ về `User`, đều `onDelete: Cascade`** | `exam.prisma` (11), `user.prisma` (4), `payment.prisma` (2), `study-room.prisma` (2), `storage`, `ai-chat`, `user.session`, `word-family`, `admin-audit` (mỗi file 1). Ngoài ra `ExamRoom → QuizSet` cũng cascade (`exam.prisma:148,156`). | Xoá một user, hay một quiz set, là xoá dây chuyền ở tầng DB, xuyên mọi domain. File trên R2 không bị xoá theo. |
| 4 | **Mỗi request 2 query DB để xác thực, ở mọi service** | `libs/common/src/guard/auth.guard.ts:43,55` (`userSession` + `user`); `admin.guard.ts:31,43` cũng vậy. Khoảng 120 chỗ `@UseGuards` ở exam, và có ở cả auth, admin, finance, gateway. | Mọi service phụ thuộc bảng của auth. Không có cache. |
| 5 | **Một `JWT_SECRET` HS256 dùng chung** | `auth.module.ts:36-42`, `libs/common/src/auth/auth.module.ts:14-17` (thêm một cấu hình `expiresIn: '7d'` nữa). Claim chỉ có `{userId, sessionId}`. | Lộ secret ở một service là ai cũng ký được token. Không có roles trong token. |
| 6 | **admin-service ghi thẳng vào bảng của finance và auth** | `admin-finance.service.ts:102-337` ghi `wallet`, `walletTransaction`, `payment`, `userSubscription`. `admin-users.service.ts:218-407` ghi `User`. `admin-stats.service.ts` chạy raw SQL trên `"User"`, `"Payment"`. | Bỏ qua nghiệp vụ của finance (`UpdateBalance`). Cache `wallet:user:*` bị cũ. |
| 7 | **Gateway viết tay 208 route, chỉ 3 controller kiểm tra JWT** | 17 file `*-proxy.controller.ts` (+ `config.controller.ts`), 11 file chép lại helper `h()`/`t()`. `AuthGuard` chỉ có ở ai, ai-chat, một method admin và một method config. Các hàm `ProxyService.forward*` chỉ trả `response.data`, làm mất status và header (trừ `forwardWithRedirect`). Chỉ admin-logs và config là tự stream. | Thêm endpoint phải sửa hai nơi. SSE của AI chat bị gom hết rồi mới trả (`proxy.service.ts:189-225`), nên không stream. |
| 8 | **gRPC dùng nửa vời** | Proto nạp lúc chạy, interface TS viết tay và phải thêm biến thể camelCase không có trong proto (`fileId?`, `keyR2?` ở `r2-client.service.ts`). Không ai gọi `auth.proto`. `admin.proto` được tham chiếu nhưng không tồn tại. `ocr` và `finance` cùng cổng `50053`. | Contract không phải nguồn sự thật. |
| 9 | **Event bus mong manh** | Chỉ có một luồng thật là `user.created` (auth → finance). Không có outbox. Consumer ack cả khi lỗi, không có DLQ (`event-subscriber.service.ts:50-55`). Luồng `ai.ocr.requested` không ai publish. | Mất event là không biết. Ví có thể không được tạo. |
| 10 | **`libs/common` chứa nghiệp vụ** | Mail, password, refresh-token cipher, turnstile, PDF, OAuth guard, `sanitizeUser`, enum event của mọi domain, `BaseRepository` dùng `prisma[modelName]`. | Sửa lib là rebuild và redeploy mọi service. |
| 11 | **Deploy khoá chặt với nhau** | Một `deploy/Dockerfile` build cả monorepo theo `SERVICE_NAME`. CI chạy `docker compose build` → `down` → `up` cho **toàn bộ** backend. Không có registry, image tag, test hay lint trong CI. | Downtime mỗi lần deploy. Không rollback được từng service. |
| 12 | **Lộ hạ tầng và bảo mật lỏng** | Postgres publish ra host `5411`. `entrypoint-seed.sh` in `DATABASE_URL` ra log. Cookie bị set hai lần (auth 7 ngày, gateway 30 ngày, `SameSite=None`). | Bề mặt tấn công lớn. |
| 13 | **Không có observability** | Health check trả tĩnh `{status:'ok'}`, không kiểm tra DB. Không có tracing hay metrics. Log đẩy vào Redis list và admin đọc file. Rate limit lưu in-memory theo instance. | Khó lần lỗi xuyên service. Scale ngang thì rate limit sai. |

**Chỗ đã làm đúng, giữ làm mẫu:** exam gọi finance qua gRPC (`wallet.proto`, `subscription.proto`) để kiểm tra và trừ credit (`finance-client.service.ts`). Ngoài ra refresh token dạng opaque, mã hoá AES-GCM, có rotation và grace window, là thiết kế tốt nên giữ nguyên.

---

## 3. Sơ đồ tổng thể (đích)

```
                     Web SPA (examio-fe)            Mobile (examio-app)
                            │  /api/v1/...  ·  WS /ws/study  ·  SSE
                            ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  Edge: Cloudflare → nginx (examio-fe container, TLS/SPA/static)        │
   └───────────────────────────────┬───────────────────────────────────────┘
                                   │ mạng "edge"
                    ┌──────────────▼──────────────┐   gRPC (revoke/invalidate,
                    │ gateway-service             │◄── page flags) từ auth/admin
                    │ route YAML · verify JWT     │
                    │ (JWKS) · revoke check Redis │
                    │ rate limit Redis · stream   │
                    └──────────────┬──────────────┘
                                   │ HTTP proxy (stream) + Bearer JWT    mạng "internal"
   ┌──────────┬──────────┬─────────┼─────────┬──────────┬──────────┬───────────┬─────────┐
   ▼          ▼          ▼         ▼         ▼          ▼          ▼           ▼         ▼
 auth     finance    content  assessment study-room vocabulary  ai-chat   document   admin
 (JWT,    (ví, gói,  (quiz,   (phòng thi, (Socket.io (word      (chat,    (file,    (audit,
 user,    payment)   flash-   phiên, bài  realtime)  family)    subject)  quota)    flags,
 session)            card)    làm)                                                  KPI)
   │          │          │         │         │          │          │           │         │
   └──────────┴────┬─────┴─────────┴────┬────┴──────────┴────┬─────┴───────────┴─────────┘
                   │ gRPC (đồng bộ)     │ RabbitMQ           │ gRPC
                   ▼                    ▼ examio.events      ▼
            service khác        (outbox → exchange →     ai-service (Python)
            r2-service (blob)    queue/service + DLQ)    RAG · LLM · OCR · pgvector

   Dữ liệu:  Postgres (mỗi service 1 DB/schema + role riêng) · Redis (ACL theo prefix)
             · RabbitMQ · Cloudflare R2
```

---

## 4. Các thành phần

### 4.1 Edge

| Môi trường | Công cụ | Định tuyến |
|---|---|---|
| Production (VPS) | Cloudflare → nginx trong container `examio-fe` | `/` → SPA. `/api/`, `/ws/` → `gateway-service:3000`. Bật `proxy_buffering off` cho SSE (đã có trong `examio-fe/nginx.conf`). |
| Local | Vite dev proxy → gateway | `VITE_BACKEND_URL=http://localhost:3000` |

- Chỉ **gateway** được nối với mạng `edge`. Mọi service nghiệp vụ, Postgres, Redis, RabbitMQ chỉ nằm trong mạng `internal`, **không publish cổng ra host** (bỏ `5411:5432` hiện tại; khi cần thì truy cập DB qua SSH tunnel).

### 4.2 gateway-service

**Stack:** NestJS (giữ để đồng bộ với team) + `http-proxy-middleware`, `jose` (verify JWKS), Redis, `@grpc/grpc-js`.

**Gateway làm gì:**
- Proxy theo **file cấu hình YAML** (mỗi môi trường một file). Thay toàn bộ 208 handler viết tay bằng **một** middleware đọc route table.
- **Stream thẳng** request/response: giữ nguyên status, header và body. Không buffer multipart, SSE hay file download.
- Verify JWT (chữ ký RS256 qua JWKS, `exp`, `iss`, `aud`).
- Kiểm tra thu hồi trong Redis của gateway: `revoked:sid:<sid>`, `user:<id>:invalid_before` (mục 5.4).
- Rate limit lưu trong Redis (đúng khi chạy nhiều instance). Có giới hạn riêng cho WS upgrade.
- Proxy WebSocket `/ws/study` → `study-room-service`.
- Phục vụ `GET /api/v1/config/pages` và SSE `/api/v1/config/stream` (page feature flags) từ Redis của chính gateway.
- Gắn `X-Request-Id` và `traceparent` (OpenTelemetry), log access có `userId`.
- Chạy **gRPC server `GatewayControl` (:50051)** để auth và admin báo thu hồi token và đổi page flags.

**Gateway KHÔNG làm:** gộp dữ liệu nhiều service (BFF), truy cập Postgres, sửa body, set cookie. Cookie chỉ do auth set.

**Cấu hình route mẫu** (`apps/gateway-service/config/routes.production.yaml`):

```yaml
upstreams:
  content:    http://content-service:3000
  assessment: http://assessment-service:3000
  document:   http://document-service:3000
  study-room: http://study-room-service:3000

routes:
  - id: quizsets
    upstream: content
    match: { prefix: /api/v1/quizsets }
    auth: required                    # required | optional | none
    rateLimit: { window: 60s, max: 100 }
    public:                           # ngoại lệ không cần JWT
      - { method: GET, path: ^/api/v1/quizsets/public/.* }

  - id: student-flashcards            # một prefix tách về hai service theo path con
    upstream: content
    match: { path: ^/api/v1/student/(recent-flashcards|pin-flashcard/.*)$ }
    auth: required

  - id: student-exams
    upstream: assessment
    match: { path: ^/api/v1/student/(recent-exams|pin-exam-room/.*)$ }
    auth: required

  - id: document-upload
    upstream: document
    match: { path: ^/api/v1/ai/(upload.*|quick-upload|recent-uploads)$ }
    auth: required
    maxBodySize: 100mb
    timeout: 120s

  - id: study-room-ws
    upstream: study-room
    match: { prefix: /ws/study }
    websocket: true
    auth: required                    # verify token ở handshake
    pageFlag: study-room              # tắt cờ thì từ chối upgrade
```

**Pipeline xử lý một request:**

1. **Match route.** Không khớp route nào → 404. Thứ tự ưu tiên: `path` regex trước, `prefix` dài nhất sau.
2. **Lấy token.** Từ cookie `accessToken` (web) hoặc header `Authorization: Bearer` (mobile). **Không** nhận token qua query string, trừ WS handshake dùng `auth.token`.
3. **Verify JWT** bằng JWKS (cache key theo `kid`, tự refetch khi gặp `kid` lạ).
   - Sai chữ ký hoặc hết hạn → `401 TOKEN_EXPIRED`. Client tự gọi `/auth/refresh`; luồng này đã có trong `examio-fe/src/apis/api.ts`.
   - `sid` nằm trong `revoked:sid:<sid>` → `401 SESSION_REVOKED`.
   - `iat` < `user:<sub>:invalid_before` → `401 TOKEN_STALE`. Refresh để nhận claims mới.
4. **Kiểm tra quyền thô theo route:** `roles: [admin]` → claim `roles` phải chứa `admin`.
5. **Rate limit** (Redis, key theo `userId` hoặc IP).
6. **Proxy** sang upstream, giữ `Authorization: Bearer <jwt>` (lấy từ cookie nếu cần), thêm `X-Request-Id`, `traceparent`, `X-Forwarded-*`.

**Các key Redis của gateway** (Redis ACL chỉ cho phép prefix `gw:`):

| Key | Ý nghĩa |
|---|---|
| `gw:revoked:sid:<sid>` | Session đã logout hoặc bị thu hồi. TTL = TTL còn lại của access token. |
| `gw:user:<id>:invalid_before` | Mốc thời gian. Token có `iat` nhỏ hơn mốc này phải refresh (đổi role, bị ban, đổi mật khẩu). |
| `gw:config:pages` | Page feature flags hiện hành |
| `gw:rl:*` | Bộ đếm rate limit |

**gRPC API của gateway** (`proto/examio/gateway/v1/gateway_control.proto`): `RevokeSession(sid, exp)`, `InvalidateUser(user_id)`, `SetPageFlags(flags)`. Mỗi lệnh chỉ ghi Redis. Bên gọi là auth (logout, ban, đổi quyền) và admin (page flags).

### 4.3 auth-service

**Stack:** NestJS, `jose` (ký RS256/EdDSA), Passport (Google, Facebook, GitHub), Prisma (DB `auth`).

**auth làm gì:**
- Sở hữu `User`, `UserSession`, `VerifyAccountCode`, `ResetPasswordCode`.
- Đăng ký, đăng nhập (email/password + OAuth), cấp access token và refresh token, rotation, logout, quản lý thiết bị (`X-Device-ID`), profile.
- Công khai `GET /.well-known/jwks.json`, chỉ trong mạng `internal`. Hỗ trợ nhiều `kid` để xoay khoá.
- Cung cấp **gRPC `AuthService`**: `GetUser`, `GetUsersByIds` (batch), `FindUserByEmail`, `ListUsers`, `SetUserStatus` (ban), `SetUserRoles`, `RevokeUserSessions`.
- Publish `auth.user.registered`, `auth.user.updated`, `auth.user.deleted`, `auth.user.logged_in`.
- **Không** tạo `UserSubscription` nữa (hiện đang tạo trong transaction đăng ký, `auth.service.ts:183,600`). finance tự tạo gói mặc định khi nhận `auth.user.registered`.
- Gửi mail (verify, reset) vẫn nằm ở auth. Chỉ tách notification-service khi có service thứ hai cần gửi mail (YAGNI).

Chi tiết token, cookie và thu hồi ở mục 5.

### 4.4 Service nghiệp vụ

| Service | Vai trò | Sở hữu dữ liệu | Gọi ra (gRPC) | Event |
|---|---|---|---|---|
| `finance-service` | Ví credit, giao dịch, thanh toán SePay, gói subscription | `Wallet`, `WalletTransaction`, `Payment`, `UserSubscription` | — | Pub: `finance.payment.succeeded`, `finance.subscription.changed`. Sub: `auth.user.registered`, `auth.user.deleted` |
| `content-service` | Quiz set, flashcard set, câu hỏi, nhãn, luyện tập, tiến độ học flashcard, **sinh quiz/flashcard bằng AI** | `QuizSet*`, `QuizQuestion`, `DetailsQuizQuestion`, `FlashCardSet*`, `FlashCard`, `DetailsFlashCard`, `HistoryGenerated{Quizz,Flashcard}`, `QuizPracticeAttempt`, `FlashCardViewHistory`, `UserPinnedFlashcard`, `FlashcardStudyProgress` | auth, finance, document, r2 | Pub: `content.generation.requested`, `content.quizset.deleted`. Sub: `ai.generation.*`, `document.deleted`, `auth.user.*` |
| `assessment-service` | Phòng thi, phiên thi, bài làm, chống gian lận, mã hoá đề (`QUIZ_AES_KEY`), màn "student" | `ExamRoom`, `ExamSession`, `ExamAttempt`, `CheatingLog`, `UserPinnedExamRoom` | content (snapshot đề), auth | Pub: `assessment.attempt.submitted`. Sub: `content.quizset.deleted`, `auth.user.*` |
| `study-room-service` | Phòng học nhóm realtime: timer, playlist YouTube, chat, kiểm duyệt | `StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock` + state sống trong Redis | auth (tên, avatar) | Sub: `auth.user.*` |
| `vocabulary-service` | Word family, danh mục, từ đã lưu, sinh word family bằng AI | `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` | ai (`GenerateWordFamily`), finance | Sub: `auth.user.deleted` |
| `ai-chat-service` | Hội thoại AI, giáo viên AI theo môn (`Subject.systemPrompt`), đính kèm tài liệu | `AIChat`, `AIChatMessage`, `AIChatDocument`, `SubjectCategory`, `Subject` | ai (`StreamChat`), finance (`GetUserBenefits`), document | Sub: `document.deleted`, `auth.user.deleted` |
| `document-service` | File người dùng tải lên (metadata), quota upload theo tháng, trạng thái xử lý, trừ credit xử lý | `UserStorage`, `UserMonthlyFileUpload` | r2, finance | Pub: `document.uploaded`, `document.deleted`. Sub: `ai.document.processed`, `ai.document.failed`, `auth.user.deleted` |
| `r2-service` | Hạ tầng blob: presigned URL, xoá object, ảnh public/private | — (bucket R2) | — | — |
| `admin-service` | Dashboard admin, audit, page feature flags, KPI | `AdminAudit`, `PageFeatureFlag`, read model `admin_metrics_*` | auth, finance, vocabulary (RPC admin) | Sub: `auth.user.registered`, `auth.user.logged_in`, `finance.payment.succeeded`, `assessment.attempt.submitted` |
| `ai-service` (Python) | RAG, OCR/parse tài liệu, embedding, knowledge graph, sinh nội dung, LLM streaming | `Document` (chunk + `vector`), `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`, `BenchmarkItem` | — | Sub: `document.uploaded`, `document.deleted`, `content.generation.requested`. Pub: `ai.document.processed/failed`, `ai.generation.completed/failed` |

**Bỏ đi:**
- `ocr-service` (NestJS). OCR đã nằm trong ai-service, service này không deploy và còn trùng cổng với finance.
- `exam-service`, sau khi đã tách xong thành content, assessment, study-room, vocabulary, ai-chat và document.

**Ghi chú về ranh giới:**
- **content và assessment** tách theo vòng đời: content là "soạn và tự học", assessment là "tổ chức thi có giám sát". Khi tạo phiên thi, assessment lấy **snapshot** đề từ content (`GetQuizSetSnapshot`) và lưu trong `ExamSession`. Sau đó tác giả sửa hay xoá quiz cũng không ảnh hưởng tới phiên thi và kết quả đã có.
- **document và ai-service:** document giữ metadata và trạng thái (cái người dùng thấy). ai-service giữ chunk, vector, entity, graph (cái để truy hồi). Hai bên chỉ trao đổi qua event và `storageId`.
- **Màn "student"** (`/api/v1/student/*`) hiện trộn flashcard và phòng thi. Route sẽ tách theo path con về content và assessment (xem route mẫu ở 4.2). FE không phải đổi.

### 4.5 ai-service (Python)

**Stack:** FastAPI (chỉ còn `/health`, `/metrics` và endpoint dev), **gRPC server** (`grpcio`, :50051), `aio-pika`, LangChain/LangGraph, Gemini, pgvector, Docling.

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
- `score/database.py` đang đọc các bảng `students`, `subjects`, `scores` không thuộc Prisma. Đây là code cũ, *(cần xác nhận)* rồi xoá hoặc chuyển vào DB `ai`.

### 4.6 Frontend và mobile

- **Không đổi URL.** Mọi đường dẫn `/api/v1/...` và `/ws/study` giữ nguyên. Gateway tự định tuyến về service mới.
- Web dùng cookie httpOnly do auth set. Mobile dùng `Authorization: Bearer`, token nhận trong body của `/auth/login` và `/auth/refresh`.
- Mã lỗi mới `TOKEN_EXPIRED`, `SESSION_REVOKED`, `TOKEN_STALE` đều là 401. Client đã có luồng 401 → refresh → retry nên không phải sửa. Riêng `SESSION_REVOKED` thì refresh cũng thất bại, sẽ về màn login như hiện tại.
- SSE của AI chat sẽ **stream thật** sau khi gateway chuyển sang proxy dạng stream (hiện tại bị gom).

### 4.7 Hạ tầng dùng chung

| Thành phần | Dùng cho | Ghi chú |
|---|---|---|
| Postgres 16 + pgvector | Mỗi service một database (giai đoạn đầu: một schema) + role riêng | Một server cho VPS. Tách server khi cần, chỉ phải đổi URL. |
| Redis 7 | Cache, rate limit, revoke list, state realtime của study-room, Socket.io adapter | **ACL theo service** (`~content:*`, `~gw:*`…). Có thể tách instance riêng cho study-room nếu tải lớn. |
| RabbitMQ 3.13 | Event bus | Exchange `examio.events` (topic) + `examio.dlx`. Mỗi service một queue. |
| Cloudflare R2 | Lưu file | Chỉ `r2-service` giữ credentials ghi. Service khác dùng presigned URL. |
| Container registry (GHCR) | Image theo service | `ghcr.io/<owner>/examio-<svc>:<git-sha>` |
| Grafana + Loki + Tempo + Prometheus | Log, trace, metrics | Thay việc admin đọc file log và log đẩy vào Redis list. |

---

## 5. Danh tính và phân quyền

### 5.1 Token

| Thông số | Hiện trạng | Đích |
|---|---|---|
| Thuật toán | HS256, `JWT_SECRET` dùng chung | **RS256** (hoặc EdDSA). Private key chỉ ở auth, public key qua JWKS. |
| Access token TTL | 15 phút (một chỗ khác cấu hình 7 ngày) | **15 phút**, một cấu hình duy nhất |
| Refresh token | Opaque, AES-GCM, lưu trong `UserSession`, rotation + grace | **Giữ nguyên** |
| Session TTL | 30 ngày | 30 ngày |
| Verify ở service | JWT + 2 query DB | **Chỉ JWT** (JWKS, cache theo `kid`). Không query DB. |

**JWT claims (đích):**

```json
{
  "iss": "https://examio.top/auth",
  "aud": "examio-api",
  "sub": "usr_01J...",
  "sid": "ses_01J...",
  "roles": ["user"],
  "name": "Nguyen Van A",
  "email_verified": true,
  "iat": 1760000000,
  "exp": 1760000900
}
```

- `roles`: `["user"]`, `["user","admin"]`. Thay cho việc `AdminGuard` đọc `User.isAdmin` từ DB.
- **Không** đưa tier subscription hay số dư vào token, vì những giá trị này đổi liên tục. Service nào cần thì gọi finance `GetUserBenefits` (có cache ngắn).

### 5.2 Cookie (web)

| Thông số | Đích |
|---|---|
| Tên | `accessToken`, `refreshToken`. Bỏ các cookie trùng `token`, `session_id`. |
| Ai set | **Chỉ auth-service.** Gateway không set lại như hiện tại (`auth-proxy.controller.ts:308-341`). |
| Thuộc tính | `HttpOnly; Secure; SameSite=Lax; Domain=.examio.top`. FE và API cùng origin qua nginx nên không cần `SameSite=None`. |
| `refreshToken` | `Path=/api/v1/auth`, thời hạn bằng session TTL |
| Thời hạn `accessToken` | Bằng TTL của access token |

### 5.3 Service kiểm tra token thế nào

- Thư viện `libs/auth-jwt` cung cấp `JwtAuthGuard` (verify bằng JWKS), `@CurrentUser()` (trả `{ id, sid, roles }`), `RolesGuard`, `OptionalJwtAuthGuard`. **Không import Prisma.**
- Gateway đã kiểm tra thu hồi rồi. Service verify lại chữ ký (phòng thủ nhiều lớp), nhưng **không** kiểm tra session. Mạng `internal` bảo đảm chỉ gateway (và service nội bộ qua gRPC) với tới được service.
- **gRPC nội bộ:** bên gọi chuyển tiếp danh tính bằng metadata `x-user-id`, `x-user-roles`, `x-request-id`, `traceparent`. Service nhận tin metadata này vì cổng gRPC chỉ mở trong mạng `internal`. Khi lên K8s thì bổ sung mTLS (Linkerd).

### 5.4 Logout, ban, đổi quyền

1. **Logout / thu hồi một session:**
   - auth xoá `UserSession`.
   - auth gọi gateway `RevokeSession(sid, exp)`, gateway ghi `gw:revoked:sid:<sid>` với TTL = `exp - now`.
2. **Ban user / đổi role / đổi mật khẩu:**
   - auth cập nhật DB và thu hồi mọi session (`RevokeUserSessions`).
   - auth gọi gateway `InvalidateUser(user_id)`, gateway ghi `gw:user:<id>:invalid_before = now`.
   - auth publish `auth.user.updated`. study-room nhận event này để kick socket đang mở.
3. Vì access token chỉ sống 15 phút, rủi ro còn lại tối đa 15 phút ngay cả khi gọi thẳng service. Điều này chấp nhận được vì service không có đường vào từ ngoài.

### 5.5 Phân quyền

| Cấp | Nằm ở đâu | Ý nghĩa |
|---|---|---|
| Đã đăng nhập | Gateway (`auth: required`) + guard ở service | Có token hợp lệ, chưa bị thu hồi |
| Vai trò | Claim `roles` | `admin` được vào `/api/v1/admin/*` |
| Sở hữu tài nguyên | Từng service (`resource.userId === user.id`) | Sửa hoặc xoá quiz, phòng thi, tài liệu… |
| Theo phòng | assessment, study-room | Host/cohost, whitelist, mã mời, ban/mute |
| Theo gói | finance `GetUserBenefits` | Giới hạn upload, model AI, số lượt chat |

**Multi-tenancy:** không áp dụng. Nếu sau này bán cho trường học (B2B) thì thêm claim `org_id` và cột `org_id` theo mô hình "tenant theo cột" của hệ thống tham chiếu.

---

## 6. Giao tiếp giữa các service

### 6.1 Khi nào dùng kiểu nào

| Nhu cầu | Kiểu | Ví dụ |
|---|---|---|
| Client gọi backend | **REST qua gateway** (+ SSE, WS) | `POST /api/v1/quizsets` |
| Cần kết quả ngay (đọc, hoặc ghi cần phản hồi) | **gRPC** đồng bộ | assessment lấy snapshot đề; content trừ credit (`Debit`) |
| Stream kết quả LLM | **gRPC server-streaming** | ai-chat → ai `StreamChat`, rồi ai-chat phát lại cho client bằng SSE |
| Báo cho service khác tự xử lý, không cần chờ | **RabbitMQ** event | `auth.user.registered` → finance tạo ví |
| Việc chạy lâu (giây → phút) | **RabbitMQ** request/completed | `document.uploaded` → `ai.document.processed` |
| Thu hồi token, đổi cấu hình edge | **gRPC** sang gateway | `RevokeSession`, `SetPageFlags` |
| HTTP giữa các service | **Cấm**, trừ trong giai đoạn chuyển tiếp | exam → ai-service HTTP hiện tại: sẽ thay bằng gRPC hoặc event |
| Truy cập DB của service khác | **Cấm tuyệt đối** | admin ghi `wallet` hiện tại: sẽ thay bằng finance `AdjustBalance` |

### 6.2 gRPC

**Quy ước proto** (`examio-be/proto/`, quản lý bằng buf):

```proto
syntax = "proto3";
package examio.finance.v1;                         // examio.<svc>.v<major>

import "examio/common/v1/pagination.proto";

service WalletService {
  rpc GetWallet (GetWalletRequest) returns (Wallet);
  rpc Debit (DebitRequest) returns (WalletTransaction);    // idempotency_key bắt buộc
  rpc Credit (CreditRequest) returns (WalletTransaction);
  rpc GetWalletsByUserIds (GetWalletsByUserIdsRequest) returns (GetWalletsByUserIdsResponse); // batch, tránh N+1
}

message DebitRequest {
  string user_id = 1;
  int64 amount = 2;
  string reason = 3;            // "ai.generation.quiz"
  string idempotency_key = 4;   // ví dụ jobId: gọi lại không trừ hai lần
}
```

- Tên RPC theo dạng `GetX`, `GetXsByIds` (batch), `ListX`, `CreateX`, `UpdateX`, `DeleteX`, hoặc động từ nghiệp vụ (`Debit`, `RevokeSession`).
- **Thay đổi tương thích ngược:** chỉ thêm field hoặc RPC. Muốn breaking thì tạo package `v2` và chạy song song. `buf breaking` chặn ngay trong CI.
- **Mọi RPC ghi tiền hay ghi trạng thái quan trọng** phải có `idempotency_key`.

**Pipeline sinh code:**

```
proto/**/*.proto ──► buf lint ──► buf breaking (so với main) ──► buf generate
                                                                  │
                         ┌────────────────────────────────────────┼─────────────────────┐
                         ▼                                        ▼                     ▼
              libs/contracts/src/generated/          apps/ai-service/src/       (sau này: package
              (ts-proto, outputServices=grpc-js,     grpc_generated/            npm/pypi có version
               nestJs=true)                          (grpcio-tools)             nếu tách repo)
```

- Code sinh ra **không commit** mà được sinh ở bước build (`yarn proto:gen`). Bỏ các interface TS viết tay và các xử lý `file_id`/`fileId` hiện tại.

**gRPC server (NestJS):** mỗi service là **hybrid app** gồm HTTP `:3000` và gRPC `:50051` trong cùng process (vai trò `api`). Khi cần scale riêng thì tách thành vai trò `grpc`.

```ts
// apps/finance-service/src/modules/wallet/wallet.grpc.controller.ts
@Controller()
@WalletServiceControllerMethods()                    // sinh từ ts-proto
export class WalletGrpcController implements WalletServiceController {
  constructor(private readonly wallets: WalletService) {}

  debit(req: DebitRequest): Promise<WalletTransaction> {
    return this.wallets.debit(req);                  // dùng chung Service layer với HTTP controller
  }
}
```

**gRPC client:**
- `libs/grpc` cung cấp `GrpcClientModule.register({ name, package, url })`, kèm:
  - deadline mặc định 3 giây (AI 60 giây, stream không giới hạn),
  - retry có backoff cho `UNAVAILABLE`,
  - chuyển tiếp metadata danh tính và trace,
  - chuyển gRPC status sang HTTP.
- Mỗi service gói lời gọi ra ngoài trong một class `clients/<x>.client.ts` (ví dụ `FinanceClient.debit()`). Code nghiệp vụ không gọi stub trực tiếp.

| gRPC status | HTTP (ở service gọi) |
|---|---|
| `INVALID_ARGUMENT` | 400 |
| `UNAUTHENTICATED` / `PERMISSION_DENIED` | 401 / 403 |
| `NOT_FOUND` | 404 |
| `ALREADY_EXISTS` / `ABORTED` | 409 |
| `FAILED_PRECONDITION` | 422 (ví dụ `INSUFFICIENT_BALANCE`) |
| `RESOURCE_EXHAUSTED` | 429 |
| `UNAVAILABLE` / `DEADLINE_EXCEEDED` | 503 / 504 |

**Địa chỉ:** `<svc>-service:50051` (DNS của Docker network; trên K8s là `<svc>-service.<ns>.svc.cluster.local:50051`). Mọi service dùng **cùng một cổng** vì mỗi container có network namespace riêng. Cách này xoá luôn lỗi trùng cổng hiện tại.

**Danh mục RPC (đích):**

| Proto | RPC | Server | Client |
|---|---|---|---|
| `auth/v1` | `GetUser`, `GetUsersByIds`, `FindUserByEmail`, `ListUsers`, `SetUserStatus`, `SetUserRoles`, `RevokeUserSessions` | auth | content, assessment, study-room, ai-chat, admin |
| `gateway/v1` | `RevokeSession`, `InvalidateUser`, `SetPageFlags` | gateway | auth, admin |
| `finance/v1` | `GetWallet`, `GetWalletsByUserIds`, `Debit`, `Credit`, `Refund`, `GetUserBenefits`, `ChangeTier`, `ListPayments`, `GetFinanceStats` | finance | content, vocabulary, ai-chat, document, admin |
| `r2/v1` | `CreatePresignedUpload`, `CreatePresignedDownload`, `GetPublicUrl`, `DeleteObjects` | r2 | document, content, auth (avatar), mọi service khi xoá dữ liệu |
| `document/v1` | `GetDocumentsByIds`, `AssertOwnership`, `GetQuota` | document | content, ai-chat |
| `content/v1` | `GetQuizSetSnapshot`, `GetQuizSetsByIds` | content | assessment |
| `ai/v1` | `StreamChat`, `Query`, `GenerateWordFamily`, `ListModels` | ai-service | ai-chat, vocabulary, content |
| `vocabulary/v1` | `ListCategories`, `UpsertCategory`, `DeleteCategory` | vocabulary | admin |
| `admin/v1` | `GetPageFlags` | admin | gateway (lúc khởi động) |

### 6.3 RabbitMQ

**Topology:**

```
exchange: examio.events (topic, durable)            exchange: examio.dlx (topic)
   │ routing key = <domain>.<entity>.<verb-past>        │
   ├─► queue finance.events     (bind auth.user.registered, auth.user.deleted)
   ├─► queue document.events    (bind ai.document.*, auth.user.deleted)
   ├─► queue ai.events          (bind document.uploaded, document.deleted, content.generation.requested)
   ├─► queue content.events     (bind ai.generation.*, document.deleted, auth.user.*)
   ├─► ...                       mỗi queue: x-dead-letter-exchange=examio.dlx
   └─►                           retry: <svc>.events.retry (TTL 10s/60s/5m) → về queue chính
                                 quá 5 lần → <svc>.events.dlq (cảnh báo + replay thủ công)
```

- **Topic theo domain event, không theo service nhận** (đây là cải tiến so với hệ thống tham chiếu). Bên gửi không cần biết ai nghe. Service nào cần thì tự bind.
- Mỗi service **một queue** `<svc>.events`, tên lấy theo service. Bỏ fallback `common-queue`.
- `prefetch` = 10–20. Ack **sau khi** xử lý xong và commit DB. Lỗi tạm thời thì nack vào retry queue, lỗi vĩnh viễn (dữ liệu sai) thì đưa thẳng vào DLQ.

**Envelope chung** (dùng cho cả Nest và Python):

```json
{
  "id": "evt_01JAB...",
  "type": "auth.user.registered",
  "version": 1,
  "occurredAt": "2026-10-17T08:00:00Z",
  "source": "auth-service",
  "correlationId": "req_01JAB...",
  "data": { "userId": "usr_01J...", "email": "a@example.com", "name": "Nguyen Van A" }
}
```

- Schema `data` của từng event khai báo trong `proto/examio/events/v1/*.proto` (hoặc JSON Schema). Kiểu sinh ra dùng chung cho producer và consumer.
- Header AMQP mang `traceparent` để trace nối tiếp qua broker.

**Producer — outbox pattern:**
1. Trong **cùng transaction** với thay đổi nghiệp vụ, ghi một dòng vào bảng `outbox_events` của service.
2. Vai trò `worker` chạy **relay**: đọc các dòng chưa gửi (`FOR UPDATE SKIP LOCKED`), publish với **publisher confirms**, rồi đánh dấu đã gửi.
3. Nhờ đó không mất event khi DB commit xong mà broker lỗi. Hiện tại auth publish kiểu fire-and-forget sau khi ghi DB.

**Consumer — idempotent:**
- Bảng `processed_events(event_id PK, processed_at)` trong DB của service consumer. Ghi dòng này trong cùng transaction với tác dụng của event. Event trùng thì bỏ qua.
- Handler phân loại theo `type`:

  ```ts
  @EventHandler('auth.user.registered')
  async onUserRegistered(evt: EventEnvelope<UserRegistered>) {
    await this.wallets.bootstrap(evt.data.userId);   // tạo ví + gói Free + 20 credit, trong 1 transaction
  }
  ```

**Danh mục event:**

| Event | Bên gửi | Bên nhận | Tác dụng |
|---|---|---|---|
| `auth.user.registered` | auth | finance, admin | Tạo ví, gói mặc định, bonus credit. Đếm user mới. |
| `auth.user.updated` | auth | study-room, content, assessment, ai-chat | Xoá cache tên/avatar. study-room kick socket nếu user bị ban. |
| `auth.user.deleted` | auth | **mọi service có dữ liệu user** | Xoá dữ liệu của user **và file trên R2** (`r2.DeleteObjects`) |
| `auth.user.logged_in` | auth | admin | KPI DAU/MAU |
| `finance.payment.succeeded` | finance | admin | KPI doanh thu |
| `finance.subscription.changed` | finance | ai-chat, document, content | Xoá cache benefits |
| `document.uploaded` | document | ai-service | Parse, OCR, chunk, embed, dựng graph |
| `ai.document.processed` / `ai.document.failed` | ai-service | document | Cập nhật `processingStatus`, trừ credit (`Debit`, key = `storageId`) |
| `document.deleted` | document | ai-service, content, ai-chat | Xoá vector. Gỡ liên kết `storageId`. |
| `content.generation.requested` | content | ai-service | Sinh quiz/flashcard |
| `ai.generation.completed` / `ai.generation.failed` | ai-service | content | Ghi quiz/flashcard, lịch sử sinh, trừ credit (key = `jobId`) |
| `content.quizset.deleted` | content | assessment | Đánh dấu phòng thi "nguồn đã xoá". Phiên thi vẫn dùng snapshot. |
| `assessment.attempt.submitted` | assessment | admin | KPI bài làm |

### 6.4 Không có transaction phân tán

- Nhất quán giữa các service đạt được dần qua event (eventual consistency) + outbox + consumer idempotent.
- **Tiền:** chỉ finance được ghi. Mọi lần trừ hoặc cộng tiền đi qua `Debit`/`Credit` có `idempotency_key`, nên retry không bao giờ trừ hai lần.
- **Trường hợp cần bù trừ** (ví dụ AI sinh lỗi sau khi đã trừ tiền): consumer `ai.generation.failed` gọi `Refund(idempotency_key)`. Đây là saga dạng choreography, không cần orchestrator.

---

## 7. Dữ liệu

### 7.1 Nguyên tắc

- **Mỗi service một database.**
  - Giai đoạn đầu: một server Postgres, mỗi service một **schema** (`auth`, `finance`, `content`…) + một **role** chỉ có quyền trên schema đó.
  - Prisma kết nối bằng `DATABASE_URL=postgresql://content_svc:***@postgres:5432/examio?schema=content`.
  - Giai đoạn sau: mỗi service một database riêng. Chỉ phải `pg_dump --schema` sang DB mới và đổi URL, code không đổi.
- **Không FK xuyên service.**
  - Cột như `userId`, `quizSetId`, `storageId` trỏ sang service khác chỉ là `String` có index.
  - FK **trong** cùng service giữ nguyên (ví dụ `QuizQuestion → QuizSet`, `AIChat → Subject`).
- **Đọc dữ liệu service khác:** gọi RPC **batch** (`GetUsersByIds`), cache Redis TTL ngắn (5–10 phút) và xoá cache khi nhận event `*.updated`. **Không** lưu bản sao lâu dài, trừ snapshot có chủ đích (7.3) và read model của admin.
- **Migration thuộc về service:** mỗi service có `prisma/schema.prisma` và `prisma/migrations/` riêng. Vai trò `migrate` chạy `prisma migrate deploy` trước vai trò `api`. **Bỏ `db push`** trên production. ai-service dùng Alembic.

### 7.2 Thay FK `onDelete: Cascade` bằng event

Hiện tại xoá `User` thì DB tự cascade xuyên mọi domain. Ở kiến trúc đích:

1. auth xoá mềm user (đánh dấu `deletedAt`), thu hồi session và publish `auth.user.deleted` qua outbox.
2. Mỗi service nhận event và xoá dữ liệu của mình trong một transaction. Service nào lưu file trên R2 thì gom key lại và gọi `r2.DeleteObjects`. Đây là quy tắc bắt buộc của repo: xoá bản ghi có ảnh thì phải xoá cả ảnh trên R2.
3. Sau N ngày, auth xoá cứng.

### 7.3 Snapshot có chủ đích

| Nơi lưu | Snapshot | Lý do |
|---|---|---|
| `ExamSession.quizSnapshot` (assessment) | Câu hỏi và đáp án lúc tạo hoặc mở phiên | Kết quả thi bất biến. Không gọi content mỗi lần làm bài. |
| `ExamAttempt.userDisplayName` (assessment) | Tên thí sinh lúc nộp | Bảng điểm vẫn hiển thị đúng khi user đổi tên hoặc bị xoá |
| `admin_metrics_daily` (admin) | Số đếm theo ngày | Dashboard không query chéo DB |

### 7.4 Redis

| Prefix | Chủ sở hữu | Dùng cho |
|---|---|---|
| `gw:` | gateway | Revoke list, page flags, rate limit |
| `auth:` | auth | Mã OAuth exchange một lần, cache user |
| `finance:` | finance | Cache ví, thống kê |
| `content:` | content | Cache quiz/flashcard, khoá sinh AI `content:gen:lock:<userId>:<type>` |
| `assessment:` | assessment | Cache phòng thi, phiên thi |
| `studyroom:` | study-room | State sống (timer, media, chat, presence) + Socket.io adapter |
| `vocab:`, `aichat:`, `doc:`, `admin:` | service tương ứng | Cache |
| `cache:user:` | mỗi service tự giữ bản của mình (`content:cache:user:<id>`) | Cache tên/avatar lấy từ `GetUsersByIds` |

- Mỗi service một **Redis ACL user** chỉ được truy cập prefix của mình. Bỏ `libs/common/src/constants/cache-keys.ts` dùng chung.
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

### 8.2 Cây thư mục chuẩn (monorepo `examio-be`)

```
examio-be/
├─ proto/                                 # NGUỒN GỐC mọi contract
│  ├─ buf.yaml  buf.gen.yaml
│  └─ examio/
│     ├─ common/v1/*.proto                # pagination, money, error detail
│     ├─ auth/v1/auth.proto
│     ├─ finance/v1/{wallet,subscription,finance_admin}.proto
│     ├─ gateway/v1/gateway_control.proto
│     ├─ ...
│     └─ events/v1/*.proto                # schema data của event
├─ apps/
│  ├─ gateway-service/
│  │  └─ config/routes.{local,production}.yaml
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
│  │  │  ├─ clients/ auth.client.ts  finance.client.ts   (gRPC ra ngoài)
│  │  │  └─ config/  env.schema.ts       # zod validate env lúc khởi động
│  │  ├─ test/  *.e2e-spec.ts  contract/
│  │  └─ .env.example
│  └─ ai-service/                         # Python: alembic/, src/grpc_server.py, src/workers/
├─ libs/                                  # CHỈ hạ tầng, KHÔNG nghiệp vụ, KHÔNG Prisma dùng chung
│  ├─ contracts/      # code sinh từ proto (build-time)
│  ├─ auth-jwt/       # JWKS verify, @CurrentUser, RolesGuard
│  ├─ grpc/           # client factory: deadline, retry, metadata, error mapping
│  ├─ messaging/      # publisher (confirm), outbox relay, consumer (idempotent, retry, DLQ)
│  ├─ observability/  # pino logger, OpenTelemetry, /metrics, health (terminus)
│  ├─ http/           # error envelope filter, zod pipe, pagination helper
│  └─ redis/          # client factory theo prefix
├─ deploy/
│  ├─ Dockerfile.node     # ARG SERVICE; bundle riêng 1 app + prisma client của nó
│  ├─ docker-compose.yml  # mỗi service: <svc>-api, <svc>-worker, <svc>-migrate
│  └─ k8s/                # (giai đoạn sau) Helm chart chuẩn dùng chung, values theo service
└─ .dependency-cruiser.cjs # cấm apps/A import apps/B; cấm libs import @prisma/client
```

**Đi đâu những thứ đang nằm trong `libs/common`:**

| Hiện ở `libs/common` | Chuyển về |
|---|---|
| Guard đọc Prisma (`auth.guard.ts`, `admin.guard.ts`, `optional-auth.guard.ts`) | `libs/auth-jwt` (bản không DB) |
| Mail, password, refresh-token cipher, turnstile, Google OAuth guard, `sanitizeUser` | auth-service |
| PDF, image processing | document-service hoặc ai-service |
| Enum và payload event của mọi domain | `proto/examio/events/v1` |
| `BaseRepository` (`prisma[modelName]`) | Bỏ. Mỗi service viết repository kiểu tường minh. |
| `grpc-clients.module.ts`, `protos/` | `libs/grpc` + `proto/` |
| `AuditWriterService` | admin-service |
| `libs/database` (Prisma chung) | **Bỏ.** Mỗi service có Prisma riêng. |

### 8.3 Một image, nhiều vai trò

Mỗi service build **một image riêng**, chỉ chứa bundle của service đó và Prisma client của nó. Vai trò chọn qua biến `ROLE`.

| Vai trò | Lệnh | Compose service | Có ở |
|---|---|---|---|
| `api` | HTTP `:3000` + gRPC `:50051` (hybrid) | `<svc>` | mọi service |
| `worker` | Outbox relay + RabbitMQ consumer | `<svc>-worker` | service có event |
| `migrate` | `prisma migrate deploy` rồi thoát (one-shot) | `<svc>-migrate` | service có DB |

ai-service: `api` (gRPC + health), `worker` (aio-pika consumer; xử lý tài liệu nặng nên scale riêng), `migrate` (`alembic upgrade head`).

### 8.4 Quy ước REST

- Đường dẫn ngoài là `/api/v1/<resource>`, **giữ nguyên như hiện tại**. Service tự mount đúng prefix nên gateway không phải rewrite.
- Guard: `JwtAuthGuard`, `RolesGuard('admin')`, kiểm tra sở hữu trong Service.
- Response thành công giữ shape hiện tại để FE không vỡ. Phân trang `{ data, meta: { page, limit, total } }`.
- Lỗi, chốt một envelope chung (áp dụng cho endpoint mới; endpoint cũ chuyển dần cùng FE):

  ```json
  { "statusCode": 422, "code": "INSUFFICIENT_BALANCE", "message": "Số dư không đủ", "requestId": "req_01J..." }
  ```

### 8.5 Biến môi trường chính của một service

```dotenv
NODE_ENV=production
ROLE=api
SERVICE_NAME=content-service
HTTP_PORT=3000
GRPC_PORT=50051
DATABASE_URL=postgresql://content_svc:***@postgres:5432/examio?schema=content
REDIS_URL=redis://content_svc:***@redis:6379
REDIS_KEY_PREFIX=content:
RABBITMQ_URL=amqp://content_svc:***@rabbitmq:5672
AUTH_JWKS_URL=http://auth-service:3000/.well-known/jwks.json
JWT_ISSUER=https://examio.top/auth
JWT_AUDIENCE=examio-api
AUTH_GRPC_URL=auth-service:50051
FINANCE_GRPC_URL=finance-service:50051
DOCUMENT_GRPC_URL=document-service:50051
R2_GRPC_URL=r2-service:50051
AI_GRPC_URL=ai-service:50051
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

- **Không còn `JWT_SECRET` ở service nào ngoài auth.** auth giữ `JWT_PRIVATE_KEY` (PEM) + `JWT_KID`.
- Mỗi service đọc `.env` **của riêng nó** (`deploy/env/<svc>.env`), thay cho một `.env` chung chứa mọi secret.

---

## 9. Các luồng mẫu

### 9.1 Đăng nhập rồi gọi API

```mermaid
sequenceDiagram
    participant B as Browser
    participant G as Gateway
    participant A as Auth
    participant C as Content
    participant F as Finance

    B->>G: POST /api/v1/auth/login
    G->>A: proxy (route auth: none)
    A->>A: kiểm tra mật khẩu, tạo UserSession, ký JWT RS256 (sub, sid, roles)
    A-->>B: Set-Cookie accessToken, refreshToken (HttpOnly, Lax)
    B->>G: POST /api/v1/ai/generate-from-file (cookie)
    G->>G: verify JWKS, check gw:revoked:sid, invalid_before, rate limit
    G->>C: proxy + Authorization Bearer + traceparent
    C->>C: JwtAuthGuard (chỉ verify chữ ký, không query DB)
    C->>F: gRPC GetWallet(user_id)
    F-->>C: balance
    C-->>B: 202 { jobId }
```

### 9.2 Đăng ký → tạo ví (outbox + consumer idempotent)

```mermaid
sequenceDiagram
    participant A as Auth
    participant ADB as auth DB
    participant R as RabbitMQ
    participant F as Finance worker
    participant FDB as finance DB

    A->>ADB: BEGIN; INSERT User; INSERT outbox_events(auth.user.registered); COMMIT
    A-->>A: (relay trong auth-worker) đọc outbox SKIP LOCKED
    A->>R: publish (confirm) → examio.events / auth.user.registered
    R-->>F: queue finance.events
    F->>FDB: BEGIN; INSERT processed_events(id) — trùng thì bỏ qua
    F->>FDB: INSERT Wallet, UserSubscription(Free), WalletTransaction(+20); COMMIT
    F-->>R: ack
```

### 9.3 Upload tài liệu → AI xử lý → trừ credit

```mermaid
sequenceDiagram
    participant B as Browser
    participant D as Document
    participant R2 as r2-service
    participant Q as RabbitMQ
    participant AI as ai-service worker
    participant F as Finance

    B->>D: POST /api/v1/ai/upload (qua gateway, stream multipart)
    D->>F: gRPC GetUserBenefits → kiểm tra quota tháng
    D->>R2: gRPC CreatePresignedUpload / upload object
    D->>D: INSERT UserStorage(status=PENDING) + outbox(document.uploaded, presigned GET URL)
    D-->>B: 201 { uploadId, status: PENDING }
    Q-->>AI: document.uploaded
    AI->>AI: tải file, OCR/parse, chunk, embed, lưu vào DB ai (pgvector)
    AI->>Q: ai.document.processed { storageId, pages, credits }
    Q-->>D: ai.document.processed
    D->>F: gRPC Debit(user, credits, idempotency_key=storageId)
    D->>D: UPDATE UserStorage status=COMPLETED
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
    AS->>C: gRPC GetQuizSetSnapshot(quizSetId)
    C-->>AS: câu hỏi + đáp án + version
    AS->>AS: INSERT ExamSession(quizSnapshot)
    S->>AS: POST /api/v1/examattempts/start
    AS-->>S: đề đã mã hoá AES (từ snapshot, không gọi content)
    S->>AS: POST /api/v1/examattempts/:id/secure-submit
    AS->>AS: chấm theo snapshot + outbox(assessment.attempt.submitted)
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

    AD->>A: gRPC SetUserStatus(user_id, BANNED)
    A->>A: UPDATE User, DELETE UserSession*, outbox(auth.user.updated)
    A->>G: gRPC InvalidateUser(user_id)
    G->>R: SET gw:user:{id}:invalid_before = now
    A-->>SR: (event) auth.user.updated {banned:true}
    SR->>B: room:kicked + disconnect socket
    B->>G: request với token cũ
    G->>R: iat < invalid_before
    G-->>B: 401 TOKEN_STALE → refresh → session đã xoá → 401 → về login
```

---

## 10. Hạ tầng và triển khai

### 10.1 Docker Compose trên VPS (giai đoạn hiện tại)

```yaml
networks:
  edge:      {}                       # examio-fe nginx ↔ gateway
  internal:  { internal: true }       # gateway ↔ service ↔ data; không ra Internet trực tiếp
  egress:    {}                       # chỉ service cần gọi ra ngoài (ai, finance/SePay, r2, auth/OAuth/mail)

services:
  gateway:
    image: ghcr.io/<owner>/examio-gateway:${GATEWAY_TAG}
    networks: [edge, internal]
    ports: ["6369:3000"]              # cổng duy nhất publish ra host
  content-migrate:
    image: ghcr.io/<owner>/examio-content:${CONTENT_TAG}
    environment: { ROLE: migrate }
    env_file: env/content.env
    networks: [internal]
    restart: "no"
  content:
    image: ghcr.io/<owner>/examio-content:${CONTENT_TAG}
    environment: { ROLE: api }
    env_file: env/content.env
    networks: [internal]
    depends_on: { content-migrate: { condition: service_completed_successfully } }
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/health/ready"] }
  content-worker:
    image: ghcr.io/<owner>/examio-content:${CONTENT_TAG}
    environment: { ROLE: worker }
    env_file: env/content.env
    networks: [internal]
  postgres:
    image: pgvector/pgvector:pg16
    networks: [internal]              # KHÔNG publish 5411 nữa
```

- `depends_on` chỉ dùng cho quan hệ `migrate → api` **của chính service đó**. Bỏ chuỗi "gateway chờ mọi service". Service phải tự chịu được việc phụ thuộc chưa sẵn sàng: retry khi kết nối, và readiness trả 503 tới khi kết nối được.
- Health: `/health/live` (process còn sống) và `/health/ready` (DB, Redis, broker kết nối được) qua `@nestjs/terminus`. Thay `{status:'ok'}` tĩnh hiện tại.
- Tài nguyên: khoảng 12 service × (api + worker). Đặt `mem_limit` cho từng container và build bundle bằng webpack để giảm RAM. Gộp `api` và `worker` vào một process cho service ít tải (vocabulary, admin) bằng `ROLE=api,worker`.

### 10.2 Docker image

- `deploy/Dockerfile.node`, `ARG SERVICE`:
  1. Stage deps.
  2. Stage build: `buf generate`, `prisma generate --schema apps/$SERVICE/prisma/schema.prisma`, `nest build $SERVICE --webpack`.
  3. Stage runtime: node:20-alpine, chỉ chứa `dist/apps/$SERVICE/main.js`, Prisma engine của service và `node_modules` production đã prune.
- Bỏ `ENABLE_OCR` (tesseract, ghostscript) khỏi image Node, vì OCR thuộc ai-service.
- Tag: `ghcr.io/<owner>/examio-<svc>:<git-sha>` và `:main`. Rollback bằng cách đổi `<SVC>_TAG` về sha cũ.

### 10.3 CI/CD

```
PR ───────────► (theo service bị ảnh hưởng) lint · typecheck · unit test · buf lint · buf breaking
                 · dependency-cruiser · e2e test (service + Postgres/Redis/RabbitMQ testcontainers)
merge main ───► detect service đổi: apps/<svc>/** → <svc>; libs/<x>/** → service dùng lib đó;
                 proto/** → server + client của proto đó
             ──► build + push ghcr.io/.../examio-<svc>:<sha>
             ──► SSH VPS: docker compose pull <svc> <svc>-worker <svc>-migrate
                          docker compose up -d --no-deps <svc>-migrate <svc> <svc>-worker
             ──► smoke /health/ready của service đó → lỗi thì tự đổi tag về sha trước
```

- **Không còn `docker compose down` toàn bộ.** Mỗi lần deploy chỉ restart service bị đổi. Gateway nên chạy 2 replica sau nginx để deploy chính gateway không gây downtime.
- Migration **phải tương thích ngược** (expand → migrate → contract) vì api cũ và mới có thể chạy song song trong lúc chuyển.

### 10.4 Sẵn sàng cho K8s (giai đoạn sau)

| Compose | K8s tương ứng |
|---|---|
| `<svc>` (ROLE=api) | Deployment `<svc>` + Service (`http:3000`, `grpc:50051`) |
| `<svc>-worker` | Deployment `<svc>-worker` (HPA theo độ dài queue) |
| `<svc>-migrate` | Job (Helm pre-upgrade hook) |
| Mạng `internal` | NetworkPolicy: chỉ cho ingress từ gateway và từ client gRPC đã khai báo |
| `env/<svc>.env` | ConfigMap + Secret (External Secrets) |
| — | Một Helm chart chuẩn `examio-service`, mỗi service chỉ có `values-<svc>.yaml` |
| gRPC insecure trong mạng internal | mTLS qua Linkerd |

---

## 11. Bảng quy ước

| Hạng mục | Quy ước |
|---|---|
| Tên service | `<domain>-service` (`content-service`). Image `examio-<domain>`. |
| Path public | `/api/v1/<resource>` (giữ nguyên); WS `/ws/<feature>` |
| Cổng | HTTP `3000`, gRPC `50051` ở **mọi** container |
| Host nội bộ | `<domain>-service` (Compose); `<domain>-service.<ns>.svc.cluster.local` (K8s) |
| Env host gRPC | `<DOMAIN>_GRPC_URL=<domain>-service:50051` |
| Package proto | `examio.<domain>.v<major>` |
| Service gRPC | `<Entity>Service`; controller `<feature>.grpc.controller.ts` |
| JWT | RS256, `iss`/`aud` cố định, claims `sub`, `sid`, `roles` |
| Header xuống service | `Authorization: Bearer <jwt>`, `X-Request-Id`, `traceparent` |
| Metadata gRPC | `x-user-id`, `x-user-roles`, `x-request-id`, `traceparent` |
| Exchange | `examio.events` (topic), `examio.dlx` |
| Routing key / event type | `<domain>.<entity>.<verb quá khứ>`, snake_case cho entity nhiều từ (`auth.user.logged_in`) |
| Queue | `<svc>.events`, `<svc>.events.retry`, `<svc>.events.dlq` |
| Envelope | `{ id, type, version, occurredAt, source, correlationId, data }` |
| Bảng hạ tầng trong DB service | `outbox_events`, `processed_events` |
| DB | schema `<domain>`, role `<domain>_svc` |
| Redis | prefix `<domain>:`, ACL user `<domain>_svc` |
| ID | `cuid`/`ulid` dạng chuỗi (giữ như Prisma hiện tại) |
| Lỗi | `{ statusCode, code, message, requestId }`, `code` là UPPER_SNAKE |
| Image tag | `<git-sha>` và `main` |
| Branch | `main` = production (giữ như hiện tại) |

---

## 12. Lộ trình migration

**Chiến lược:** strangler fig, từng bước nhỏ, mỗi phase deploy được và rollback được. API public không đổi trong suốt quá trình. Không "big bang".

```
P0 Rào chắn ─► P1 Edge & Auth ─► P2 Contract & Event ─► P3 Cắt truy cập chéo DB
                                                              │
         P6 ai-service & document ◄─ P5 Tách exam-service ◄─ P4 Tách schema per service
                     │
                     └─► P7 Tách DB vật lý & deploy độc lập ─► (P8 K8s, khi cần)
```

| Phase | Việc chính | Điều kiện xong | Rollback |
|---|---|---|---|
| **P0 — Rào chắn** | CI chạy unit/e2e hiện có. Snapshot danh sách route gateway (contract test FE). Thêm `dependency-cruiser` ở chế độ báo cáo. Health ready thật. pino + requestId. Bỏ publish Postgres `5411`, bỏ in `DATABASE_URL` ra log. Backup DB hằng ngày. | CI xanh. Có baseline log và latency. | — |
| **P1 — Edge & Auth** | auth ký **RS256 + JWKS**, phát token có `roles`, chạy song song với HS256 trong 1 TTL. `libs/auth-jwt` (không DB) thay guard cũ ở mọi service. Gateway chuyển sang **route YAML + proxy stream** (sửa SSE AI chat). Thêm `GatewayControl` gRPC + revoke trong Redis. Cookie chỉ do auth set. Rate limit lưu Redis. Bỏ `DatabaseModule` khỏi gateway. | 0 query `userSession`/`user` ngoài auth. 208 handler → 1 file YAML. SSE stream thật. | Flag `AUTH_VERIFY_MODE=legacy` giữ guard cũ thêm 1 sprint |
| **P2 — Contract & Event** | Dựng `proto/` + buf + ts-proto/grpcio. Sinh code cho các proto hiện có. Sửa trùng cổng. Xoá code chết (ocr-service, `admin.proto`, `registerAuthClient`, `ExamProxyController`/`FinanceProxyController`, wallet client chưa dùng trong auth, `SessionValidationMiddleware`). `libs/messaging`: envelope v1, outbox, idempotency, retry, DLQ. Chuyển `user.created` sang `auth.user.registered` qua outbox. | `buf breaking` chạy trong CI. Không còn interface gRPC viết tay. Một luồng event chạy qua outbox với DLQ. | Giữ binding routing key cũ song song |
| **P3 — Cắt truy cập chéo DB** | finance thêm `AdjustBalance`/`Refund`/`ChangeTier`/`ListPayments`. admin gọi các RPC này thay vì ghi `wallet`. auth thêm `ListUsers`/`SetUserStatus`. admin KPI chuyển sang read model từ event (backfill một lần). auth bỏ tạo `UserSubscription`. exam đọc user qua `GetUsersByIds` + cache thay vì `include: { user }`. `PageFeatureFlag` đi qua `SetPageFlags`. | `dependency-cruiser` + một script quét `prisma.<model>` khẳng định mỗi model chỉ có một service chạm tới. | Từng RPC có feature flag |
| **P4 — Tách schema** | Mỗi service có `prisma/schema.prisma` riêng. `ALTER TABLE … SET SCHEMA <svc>` (không copy dữ liệu). Drop FK xuyên service, giữ cột + index. Role DB per service. Chuyển từ `db push` sang `migrate deploy`. Event `auth.user.deleted` thay cho cascade (kèm xoá file R2). | Mỗi service kết nối bằng role chỉ thấy schema của mình. Không còn `libs/database`. | Script đảo `SET SCHEMA public`. FK drop được ghi lại để tạo lại nếu cần. |
| **P5 — Tách exam-service** | Thứ tự từ ít phụ thuộc tới nhiều: **study-room** (đã không có FK) → **vocabulary** → **ai-chat** (+ subject) → **content** → **assessment** (+ snapshot đề). Mỗi lần tách: tạo app mới, chuyển module, chuyển schema, đổi route trong YAML, chạy song song, rồi xoá khỏi exam. | `exam-service` bị xoá. Mỗi service mới deploy độc lập. | Đổi route YAML về exam-service, vì cùng DB schema trong thời gian chạy song song |
| **P6 — ai-service & document** | Tạo document-service (`UserStorage`, quota). DB `ai` + Alembic, chuyển `Document`, `DocumentEntity`, graph, `BenchmarkItem` vào đó. Bỏ `CREATE TABLE` lúc chạy. ai-service chuyển sang gRPC (`StreamChat`…) + event (`document.uploaded`, `content.generation.requested`). Bỏ HTTP nội bộ và `INTERNAL_SERVICE_TOKEN`. | ai-service chỉ dùng `DATABASE_URL` của DB `ai`. Không còn HTTP giữa các service. | Giữ HTTP endpoint cũ của ai-service sau flag trong 1 sprint |
| **P7 — Tách DB & deploy độc lập** | Một database (hoặc server) riêng cho mỗi service. Image riêng, GHCR, tag theo sha. CI build và deploy theo service. `env/<svc>.env` riêng. Redis ACL. Grafana/Loki/Tempo/Prometheus. Admin đọc log từ Loki. | Đổi một service → chỉ service đó build và restart. Trace xuyên gateway → gRPC → RabbitMQ. | Đổi tag về sha trước |
| **P8 — K8s** (khi cần) | Helm chart chuẩn, NetworkPolicy, Linkerd mTLS, HPA cho worker. | — | — |

**Nguyên tắc khi chạy migration:**
- Mỗi PR chỉ làm một bước, không trộn refactor với đổi hành vi.
- Mọi thay đổi schema theo kiểu expand → migrate → contract.
- Phase nào chạm tới tiền (P3, P5 content, P6) phải có test e2e cho luồng trừ, cộng và hoàn credit trước khi merge.
- Trước P4 và P7 phải có bản backup đã thử restore.

---

## 13. Checklist thêm một service mới

1. **Proto:** viết `proto/examio/<svc>/v1/*.proto` (và `events/v1` nếu có event). Chạy `buf lint` và `buf generate`.
2. **App:** `nest g app <svc>-service` theo cây thư mục 8.2:
   - `main.ts` đọc `ROLE`; `config/env.schema.ts` validate env.
   - `libs/auth-jwt`, `libs/grpc`, `libs/messaging`, `libs/observability`, `libs/http`.
   - `prisma/schema.prisma` với `schema=<svc>`, có bảng `outbox_events` và `processed_events`.
3. **DB:** tạo schema `<svc>` + role `<svc>_svc` (script `deploy/sql/create-service-db.sql`). Tạo Redis ACL user `<svc>_svc` cho prefix `<svc>:`. Tạo RabbitMQ user và queue `<svc>.events` + binding.
4. **Compose:** thêm `<svc>-migrate`, `<svc>`, `<svc>-worker` và `env/<svc>.env` (+ `.env.example`).
5. **Gateway:** thêm upstream và route vào `routes.{local,production}.yaml` (`auth`, `public`, `rateLimit`, `roles`).
6. **Bên gọi:** thêm `<SVC>_GRPC_URL` và class `clients/<svc>.client.ts` ở service cần gọi.
7. **Dữ liệu user:** nếu lưu dữ liệu theo `userId` thì **bắt buộc** xử lý `auth.user.deleted`, kể cả xoá file trên R2.
8. **CI:** thêm vào ma trận detect-changes, test e2e với testcontainers.
9. **Observability:** dashboard Grafana (RED metrics), alert DLQ > 0.
10. **Docs:** cập nhật `docs/system/architecture.md` và bảng sở hữu dữ liệu (Phụ lục A).

---

## 14. Quyết định đã chốt và câu hỏi mở

### 14.1 Đã chốt (17/10/2026)

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Event broker | **Giữ RabbitMQ**, thêm outbox, DLQ, idempotency, topic theo domain | Đã có sẵn. Quy mô hiện tại chưa cần replay log của Kafka. |
| Triển khai | **Compose trên VPS, thiết kế sẵn cho K8s** (image, registry, deploy theo service) | Chi phí vận hành thấp, chuyển sang Helm không phải sửa code |
| Tách exam-service | **Tách mạnh:** content, assessment, study-room, vocabulary, ai-chat | Theo yêu cầu. Ranh giới theo vòng đời dữ liệu, có snapshot để content và assessment không phụ thuộc runtime. |
| Dữ liệu tài liệu / RAG | **document-service** giữ metadata và quota. **ai-service** có DB riêng cho chunk, vector, graph. | ai-service thôi ghi bảng của người khác. Trạng thái đồng bộ qua event. |
| Repo | Giữ **monorepo** `examio-be`, ranh giới cưỡng chế bằng dependency-cruiser + image riêng | Ít overhead hơn polyrepo. Khi tách repo thì proto publish thành package. |
| Multi-tenancy | Không áp dụng (B2C) | — |
| Auth | RS256 + JWKS, access token 15 phút, revoke ở gateway | Bỏ secret dùng chung và 2 query DB mỗi request |

### 14.2 Câu hỏi mở

1. Gateway: giữ NestJS hay chuyển sang Envoy/APISIX khi lên K8s? Đề xuất giữ NestJS tới P8.
2. Trừ credit cho AI: giữ "trừ khi xong" hay đổi sang **Reserve → Capture** để chặn tiêu vượt số dư khi chạy song song?
3. `score/database.py` trong ai-service (bảng `students`, `subjects`, `scores`): còn dùng không?
4. Có cần notification-service (email, push cho mobile) trong 6 tháng tới không? Nếu có thì tách khỏi auth ở P7.
5. Khoảng 12 service × 2 vai trò trên một VPS: cần đo RAM thực tế ở P5. Có thể gộp `api,worker` cho service ít tải.

---

## 15. Phụ lục

### A. Bản đồ sở hữu dữ liệu (model hiện tại → service đích)

| Model (Prisma hiện tại) | Service đích | Tham chiếu ra ngoài sau khi cắt FK |
|---|---|---|
| `User`, `UserSession`, `VerifyAccountCode`, `ResetPasswordCode` | auth | — |
| `Wallet`, `WalletTransaction`, `Payment`, `UserSubscription` | finance | `userId` |
| `UserStorage`, `UserMonthlyFileUpload` | document | `userId` |
| `Document` (vector), `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup`, `BenchmarkItem` | ai-service | `storageId`, `userId` |
| `QuizSet`, `QuizSetLabel`, `QuizQuestion`, `DetailsQuizQuestion`, `FlashCardSet`, `FlashCardSetLabel`, `FlashCard`, `DetailsFlashCard`, `HistoryGeneratedQuizz`, `HistoryGeneratedFlashcard`, `QuizPracticeAttempt`, `FlashCardViewHistory`, `UserPinnedFlashcard`, `FlashcardStudyProgress` | content | `userId`, `storageId` |
| `ExamRoom`, `ExamSession`, `ExamAttempt`, `CheatingLog`, `UserPinnedExamRoom` | assessment | `userId`/`hostId`, `quizSetId` (+ snapshot) |
| `StudyRoom`, `StudyRoomMember`, `StudyRoomPlaylistItem`, `StudyRoomChatBlock` | study-room | `hostId`, `userId` |
| `WordFamilyCategory`, `WordFamily`, `UserSavedWordFamily` | vocabulary | `userId` |
| `AIChat`, `AIChatMessage`, `AIChatDocument`, `SubjectCategory`, `Subject` | ai-chat | `userId`, `storageId` |
| `AdminAudit`, `PageFeatureFlag` (+ `admin_metrics_daily`) | admin | `adminId`, `targetId` |

### B. Bản đồ route public → service đích

*(cần đối chiếu đầy đủ với `docs/generated/route-list.md` trước P1)*

| Prefix / path | Hiện tại | Đích |
|---|---|---|
| `/api/v1/auth/*`, `/api/v1/profile`, `/api/v1/devices` | auth | auth |
| `/api/v1/wallet/*`, `/api/v1/payment/*`, webhook SePay | finance | finance |
| `/api/v1/exam/*`, `/api/v1/finance/*` (alias trong `exam-proxy`/`finance-proxy.controller.ts`) | **không chạy**: hai controller không được đăng ký trong `gateway.module.ts` | Bỏ (code chết, xoá ở P2) |
| `/api/v1/quizsets/*`, `/flashcardsets/*`, `/flashcard-study/*` | exam | content |
| `/api/v1/ai/{generate-from-file, regenerate/:id, job/:id, upload/:id/history, models}` | exam | content |
| `/api/v1/student/{recent-flashcards, pin-flashcard/:id}` | exam | content |
| `/api/v1/examrooms/*`, `/examsessions/*`, `/examattempts/*`, `/cheatinglogs/*` | exam | assessment |
| `/api/v1/student/{recent-exams, pin-exam-room/:id}` | exam | assessment |
| `/api/v1/studyrooms/*`, WS `/ws/study` | exam | study-room |
| `/api/v1/word-family/*` | exam | vocabulary |
| `/api/v1/ai-chat/*`, `/api/v1/subjects/*` | exam | ai-chat |
| `/api/v1/ai/{upload, upload/:id, quick-upload, recent-uploads, upload-image}`, `/api/v1/r2/image` | exam | document |
| `/api/v1/admin/*` | admin | admin |
| `/api/v1/config/*` | gateway | gateway |

### C. File tham chiếu hiện trạng

| Chủ đề | File |
|---|---|
| Schema chung | `examio-be/libs/database/src/base.prisma`, `libs/database/src/models/*.prisma` |
| Guard đọc DB | `examio-be/libs/common/src/guard/{auth,admin,optional-auth}.guard.ts` |
| Ký JWT | `examio-be/apps/auth-service/src/auth.module.ts`, `auth.service.ts` |
| Refresh token (giữ) | `examio-be/libs/common/src/services/refresh-token-cipher.service.ts` |
| Proxy gateway | `examio-be/apps/gateway-service/src/controllers/*-proxy.controller.ts`, `services/proxy.service.ts`, `main.ts` (WS) |
| gRPC | `examio-be/libs/common/src/protos/*.proto`, `libs/common/src/grpc/` |
| gRPC đúng mẫu (giữ) | `examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts` |
| Event | `examio-be/libs/common/src/events/`, `apps/finance-service/src/events/user-event.handler.ts` |
| Admin ghi chéo | `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.service.ts`, `admin-stats/admin-stats.service.ts` |
| ai-service ghi DB chung | `examio-be/apps/ai-service/src/backend/services/{ocr_service,generation_service,graph_storage_service,benchmark_index_service}.py`, `src/rag/vector_store_pg.py` |
| Deploy | `examio-be/deploy/{Dockerfile,docker-compose.yml,entrypoint-migration.sh}`, `.github/workflows/deploy.yml` |
| Kiến trúc hiện tại (docs) | `docs/system/architecture.md` |
