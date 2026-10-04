# KMAEdu

Nền tảng học tập trực tuyến hỗ trợ bởi AI — biến tài liệu thành quiz, flashcard và phòng luyện thi.

## Cấu trúc

```
kmaedu/
├── kmaedu-be/        # Backend — NestJS microservices + Python AI service
│   ├── apps/         # 10 service Nest + ai-service (Python)
│   ├── libs/         # @kmaedu/* dùng chung (auth-jwt, messaging, grpc, ...)
│   ├── proto/        # Contract gRPC (buf)
│   └── deploy/       # Docker Compose, Dockerfile, env mẫu, runbook
├── kmaedu-fe/        # Frontend — React 19 + Vite
├── docker-development/  # Chạy dev cả hệ thống bằng ./project up
├── docs/             # Tài liệu hệ thống, tính năng, changelog
├── ARCHITECTURE.md   # Kiến trúc đích
├── DESIGN.md         # Design system tokens
└── CLAUDE.md         # Hướng dẫn cho AI coding assistants
```

Backend và frontend là hai package root riêng, không có workspace chung. Luôn chạy lệnh trong `kmaedu-be/` hoặc `kmaedu-fe/`.

## Yêu cầu

- Chế độ dev bằng `docker-development/`: chỉ cần Docker + Compose 2.24+ (và RAM, xem Cách 2)
- Node.js 20+, Yarn 4 (`corepack enable`): chỉ khi chạy lệnh test/typecheck hoặc một service ngoài Docker
- Docker + Docker Compose **2.24+**
- Python 3.12: tùy chọn, chỉ khi chạy ai-service ngoài Docker
- `jq`, `openssl`

## Cách 1 — Chạy cả hệ thống bằng Docker (khuyến nghị)

Giống production nhất: mọi service, migration, Postgres, Redis, RabbitMQ đều chạy trong container. Cổng duy nhất ra máy là nginx của frontend.

### 1. Chuẩn bị env

```bash
cd kmaedu-be
cp .env.example .env                 # giá trị cấp compose: mật khẩu DB/broker, JWT, service secret, FRONTEND_URL
scripts/gen-jwt-keypair.sh           # in JWT_KID + JWT_PRIVATE_KEY → dán vào .env
scripts/gen-service-secret.sh content  # lặp cho assessment studyroom vocabulary document ai-chat admin gateway:
                                       # secret → <SVC>_SERVICE_CLIENT_SECRET, hash → SERVICE_CLIENTS
cd deploy
./setup-env.sh                       # chép .env, tạo env/<svc>.env từ mẫu, render RabbitMQ definitions
```

Điền các dòng `KEY=` còn trống trong `deploy/env/*.env` (Gemini, R2, Google OAuth, email...). Danh sách biến và file nào chứa gì: `kmaedu-be/deploy/README.md` và `kmaedu-be/deploy/env/README.md`.

### 2. Chạy backend

```bash
cd kmaedu-be/deploy
docker compose up -d --build                    # migrate (<svc>-migrate, ai-migrate) chạy trước, rồi tới service
docker compose --profile seed run --rm seed     # tùy chọn: user mẫu + dữ liệu tham chiếu (profile dev)
docker compose ps
```

Admin đầu tiên: email trong `ADMIN_EMAILS` (`env/auth.env`) được auth-service cấp quyền SYSTEM_ADMIN lúc khởi động.

### 3. Chạy frontend

```bash
cd kmaedu-fe
docker compose up -d --build     # dùng network kmaedu-edge do backend tạo, nên bật backend trước
```

Mở `http://localhost:6368` (`FE_PORT`). Nginx phục vụ SPA và chuyển `/api/`, `/ws/` vào gateway.

Đổi tên DB, user Postgres hoặc mật khẩu sau khi đã chạy thì phải `docker compose down -v` (xóa dữ liệu) vì script khởi tạo Postgres chỉ chạy trên volume rỗng.

## Cách 2 — Chế độ dev (hot reload)

Dùng khi đang sửa code. `docker-development/` dựng cả hệ thống từ source, có hot reload, không cần tự chép file `.env` hay cài Node/Python trên máy:

```bash
cd docker-development
./project up      # lần đầu tự tạo file services (chọn service chạy) và .env (khóa R2, Gemini, Google)
./project seed    # tùy chọn: user mẫu và dữ liệu tham chiếu
```

Mở `http://localhost:5173` (web và API cùng origin). API cho curl và trang quản trị Traefik/RabbitMQ ở `http://localhost:8000`. Mặc định chạy đủ 12 service, cần khoảng 7 GiB RAM cho Docker; máy yếu thì giữ `gateway auth content assessment fe` trong `docker-development/services` (riêng `gateway auth fe` đo được khoảng 1,8 GiB). Lần chạy đầu chậm vì phải build image và cài package.

Lệnh, file `services`, khóa `.env`, xử lý sự cố: [`docker-development/README.md`](docker-development/README.md).

### Chạy một service ngoài Docker

Khi cần debug từng bước, để `./project up` chạy hạ tầng (Postgres, Redis, RabbitMQ mở ở `127.0.0.1:5432/6379/5672`, mật khẩu trong `docker-development/.generated/secrets.env`), bỏ service đó khỏi `docker-development/services`, rồi chạy nó trên máy:

```bash
cd kmaedu-be
yarn install
cp -n apps/<svc>-service/.env.example apps/<svc>-service/.env   # điền DATABASE_URL, RABBITMQ_URL... trỏ vào hạ tầng trên
yarn proto:gen && yarn prisma:generate
yarn dev:<svc>                                                   # gateway, auth, content, ... (xem kmaedu-be/package.json)
```

Từ lần `up` kế tiếp, file `.env` này bị che khỏi container (container dùng env sinh sẵn), nên không ảnh hưởng stack Docker.

AI service (Python 3.12) chạy ngoài Docker:

```bash
cd kmaedu-be/apps/ai-service
python3.12 -m venv venv && ./venv/bin/pip install -r requirements.txt
ROLE=migrate ./venv/bin/python -m src.main     # tạo schema ai (Alembic), chạy một lần
cd ../.. && yarn dev:ai                         # gRPC AiService + worker event
```

Mỗi service có cổng gRPC riêng khi chạy trên máy (bảng dưới), các file `.env.example` đã trỏ sẵn theo bảng này. Trong container mọi service đều nghe gRPC 50051.

Frontend ngoài Docker: `cd kmaedu-fe && cp -n .env.example .env && yarn install && yarn dev` (`VITE_BACKEND_URL=http://localhost:3000`, Vite proxy `/api` và `/ws/study` sang gateway).

| Service | HTTP | gRPC |
|---|---|---|
| gateway | 3000 | 50052 |
| auth | 3001 | 50051 |
| r2 | 3004 | 50054 |
| admin | 7006 | 50053 |
| study-room | 3009 | — |
| vocabulary | 3010 | 50055 |
| document | 3011 | 50056 |
| ai-chat | 3012 | — |
| content | 3013 | 50057 |
| assessment | 3014 | — |
| ai (Python) | 3434 | 50058 |

## Kiểm tra code

```bash
# Backend
cd kmaedu-be
yarn test                 # jest
yarn typecheck
yarn check:ownership      # mỗi model Prisma chỉ một service sở hữu
yarn check:deps           # chặn import chéo giữa service
yarn proto:lint

# Frontend
cd kmaedu-fe
yarn test                 # vitest
yarn lint
yarn build
```

## Kiến trúc

| Service | Vai trò |
|---|---|
| `gateway-service` | Cửa HTTP/WS public: route theo `config/routes.yaml`, verify JWT, rate limit |
| `auth-service` | Đăng nhập, OAuth, session, role/permission, cấp service token |
| `content-service` | Quiz set, flashcard set, sinh nội dung từ tài liệu |
| `assessment-service` | Phòng thi, phiên thi, lượt làm bài, cheating log |
| `study-room-service` | Phòng học chung (Socket.io `/ws/study`) |
| `vocabulary-service` | Word family |
| `document-service` | File người dùng tải lên, trạng thái OCR |
| `ai-chat-service` | Hội thoại AI (SSE) và subject AI-teacher |
| `admin-service` | Thống kê, page flag, công cụ admin |
| `r2-service` | Lưu trữ file trên Cloudflare R2 |
| `ai-service` | Python: RAG, OCR, AI chat, sinh nội dung (gRPC + worker) |

- Mỗi service sở hữu một schema Postgres riêng; dữ liệu service khác chỉ lấy qua gRPC hoặc event RabbitMQ.
- Frontend → nginx → gateway → service.
- Chi tiết: `CLAUDE.md`, `ARCHITECTURE.md`, `docs/system/`.

## Deploy

Chưa có deploy tự động: workflow `deploy.yml` đã bị gỡ để làm lại flow CD. Deploy tay theo `kmaedu-be/deploy/README.md` (script `deploy/deploy-service.sh`, `deploy/cutover-runbook.md`).

Flow nhánh: tách nhánh feature từ `develop` rồi PR vào `develop`; release là PR từ `develop` vào `main`.

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Zustand, React Router, Radix UI |
| Backend | NestJS, Prisma, PostgreSQL (pgvector), Redis, RabbitMQ, gRPC (buf) |
| AI | Python 3.12, LangChain, LangGraph, Gemini, FAISS |
| Storage | Cloudflare R2 |
| Deploy | Docker Compose, nginx, GitHub Actions (CI), VPS |

## License

Private — KMAEdu Team.
