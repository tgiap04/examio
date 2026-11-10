# Examio

Nền tảng học tập trực tuyến hỗ trợ bởi AI — biến tài liệu thành quiz, flashcard và phòng luyện thi.

## Cấu trúc

```
examio/
├── examio-be/     # Backend — NestJS microservices + Python AI service
├── examio-fe/     # Frontend — React 19 + Vite
|-- examio-app/    # App native
├── DESIGN.md      # Design system tokens (cream + coral + dark navy)
└── CLAUDE.md      # Hướng dẫn cho AI coding assistants
```

Backend và frontend là hai package root riêng biệt. Chạy lệnh trong đúng thư mục con.

## Yêu cầu

- Node.js 20+
- Yarn 4 (Corepack)
- Docker + Docker Compose (production)
- Python 3.12+ (AI service)

## Quick Start

### Frontend

```bash
cd examio-fe
corepack enable
yarn install
yarn dev
```

Chạy ở `http://localhost:5173`.

### Backend

```bash
cd examio-be
yarn install
yarn dev:all
```

Cần PostgreSQL, Redis, RabbitMQ chạy local hoặc qua Docker.

### AI Service

```bash
cd examio-be/apps/ai-service
python -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn src.backend.main:app --reload --port 8000
```

## Kiến trúc

### Backend Services

| Service | Vai trò |
|---|---|
| `gateway-service` | HTTP public entry point, proxy |
| `auth-service` | Xác thực, OAuth, session |
| `content-service` | Quiz, flashcard, sinh nội dung bằng AI |
| `assessment-service` | Phòng thi, phiên thi, lượt làm bài |
| `r2-service` | Lưu trữ file (Cloudflare R2) |
| `ai-service` | RAG, document processing, AI generation (Python/FastAPI) |

### Frontend

- React 19 + Vite + React Router v6
- Zustand (state) + Axios (API)
- Tailwind CSS 4 + Radix UI + Framer Motion
- Self-hosted fonts (Cormorant Garamond, Inter, JetBrains Mono)

### Giao tiếp

- Gateway → downstream services qua HTTP proxy
- Inter-service: gRPC + RabbitMQ events
- Frontend → Gateway qua REST API
- AI chat: SSE streaming

## Deploy

Hiện chưa có deploy tự động: workflow `deploy.yml` đã bị gỡ để làm lại flow CD. Deploy tay theo `examio-be/deploy/README.md` (script `deploy/deploy-service.sh`).

Flow nhánh: tách nhánh feature từ `develop` rồi PR vào `develop`; release là PR từ `develop` vào `main`.

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Zustand, React Router |
| Backend | NestJS, Prisma, PostgreSQL, Redis, RabbitMQ |
| AI | FastAPI, LangChain, LangGraph, Gemini, FAISS |
| Storage | Cloudflare R2 |
| Deploy | Docker, nginx, GitHub Actions, VPS |

## License

Private — Examio Team.
