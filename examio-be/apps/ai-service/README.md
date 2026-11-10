# KMA Chat Agent

A conversational AI system built on RAG (Retrieval-Augmented Generation) and GraphRAG, serving document Q&A and quiz/flashcard generation for ExamIO.

## Table of Contents

- [RAG Agentic](#rag-agentic)
- [Backend API](#backend-api)
- [Running the Application](#running-the-application)

## RAG Agentic

### Architecture

The RAG (Retrieval-Augmented Generation) component enhances the AI's responses by retrieving relevant information from a knowledge base before generating answers.

```
Query → Document Retrieval → Context Augmentation → LLM Generation → Response
```

### Workflow Visualization

The following Mermaid diagram shows the agent's workflow graph:

```mermaid
graph TD;
	__start__([<p>__start__</p>]):::first
	process_user_query(process_user_query)
	retrieve_documents(retrieve_documents)
	rewrite_question(rewrite_question)
	generate_answer(generate_answer)
	__end__([<p>__end__</p>]):::last
	__start__ --> process_user_query;
	process_user_query --> retrieve_documents;
	retrieve_documents -.-> generate_answer;
	retrieve_documents -.-> rewrite_question;
	rewrite_question --> process_user_query;
	generate_answer --> __end__;
	retrieve_documents -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2
	classDef first fill-opacity:0
	classDef last fill:#bfb6fc
```

### Tech Stack

- **Langchain**: Framework for RAG implementation
- **Vector Database**: For document indexing and semantic search
- **Python 3.12**: Core programming language
- **Gemini LLM**: Base language model

### Features

- Semantic search across knowledge documents
- Context-aware responses based on retrieved information
- Handles domain-specific knowledge about the educational system

### Installation and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/kma_chat_agent.git
cd kma_chat_agent

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Index your documents (example)
python src/rag/indexing.py
```

## Backend API

### Architecture

The service has no public HTTP API. Callers are other services:

1. **gRPC** `examio.ai.v1.AiService` (`StreamChat`, `Query`, `GenerateWordFamily`, `ListModels`) on `GRPC_PORT` (50051), accepted only with a service token (RS256, `aud=ai`, allowed callers `svc:ai-chat`, `svc:vocabulary`, `svc:content`).
2. **RabbitMQ events** on queue `ai.events`: `document.uploaded` (OCR, chunking, embedding, graph), `document.deleted` (drop vectors/entities/graph), `content.generation.requested` (quiz/flashcard generation). Answers: `ai.document.processed|failed`, `ai.generation.completed|failed`.
3. **HTTP**: only `/` and `/health` (liveness). The former compat routes and their shared HTTP secret are gone.

```
gRPC / event → Business Logic → RAG Processing → PostgreSQL schema `ai` (pgvector) → Response / event
```

### Tech Stack

- **grpc.aio** + **FastAPI** (`/health`, compat routes)
- **PostgreSQL + pgvector**: schema `ai`, one shared asyncpg pool, Alembic migrations (`alembic/versions`), no runtime DDL
- **aio-pika**: `src/backend/messaging` (envelope, consumer, outbox relay, purge)
- **python-jose**: service-token verification (`src/backend/auth/service_token.py`)
- **Python 3.12**

### Running

See [Running the Application](#running-the-application) for `ROLE`, migrations and tests. `yarn dev:ai` (in `examio-be`) starts `ROLE=api,worker`.

## Evaluation Module

Evaluation module nam trong `src/evaluation` de benchmark AI Tutor cho bai toan lap trinh Python/C.

### Deploy requirements

- Docker runtime cua `ai-service` can co ca:
  - `python3`
  - `gcc`, `g++`, `build-essential`, `libc6-dev`
- Cac Python package benchmark da duoc dua vao `requirements.txt` cua service.
- Neu muon chay benchmark trong production/staging, container `ai-service` can truy cap duoc endpoint tutor local.

### Smoke check sau deploy

```bash
python -m src.evaluation.scripts.run_benchmark \
  --dataset humaneval \
  --dataset-path src/evaluation/datasets/samples/humaneval_smoke.jsonl \
  --model-type minimax-m2.5-free \
  --limit 2 \
  --fast-mode true \
  --report-name deploy_smoke_report.json
```

Neu command tren chay thanh cong va sinh file report thi module evaluation da san sang o moi truong deploy.

Luu y: evaluation runtime tmp/report mac dinh duoc ghi vao `data-source/evaluation/` thay vi `src/` de tranh trigger auto-reload khi chay dev mode.

## Running the Application

One entrypoint, `python -m src.main`, selects its work with `ROLE` (comma-separated):

| ROLE | Runs |
|---|---|
| `api` (default) | gRPC `examio.ai.v1.AiService` on `GRPC_PORT` (50051, service-token guarded) + FastAPI `/health` on `PORT` |
| `worker` | event consumer (`ai.events`), outbox relay, daily purge |
| `migrate` | `alembic upgrade head`, then exit (exclusive) |

```bash
export DATABASE_URL=postgresql://ai_svc:...@localhost:5432/examio DB_SEARCH_PATH=ai,extensions
ROLE=migrate ./venv/bin/python -m src.main
ROLE=api,worker ./venv/bin/python -m src.main
./venv/bin/pytest -q          # DB/broker tests need AI_TEST_DATABASE_URL / AI_TEST_RABBITMQ_URL (throwaway containers)
```

The service owns schema `ai` (Alembic, `alembic/versions`); it never reads or writes another service's tables. Processing status flows back through events (`ai.document.processed|failed`, `ai.generation.completed|failed`).

## Benchmark Hybrid GraphRAG

Bạn có thể benchmark nhanh sự khác nhau giữa `vector` và `hybrid` retrieval trên một tài liệu đã OCR bằng script sau:

```bash
cd examio-be/apps/ai-service
./venv/bin/python src/backend/scripts/benchmark_hybrid_retrieval.py \
  --user-storage-id <userStorageId> \
  --query "Tóm tắt nội dung chính" \
  --query "Các khái niệm quan trọng là gì?" \
  --model-type gemini \
  --top-k 8 \
  --output benchmark-result.json
```

Script sẽ:
- chạy cùng một query với `AI_RETRIEVAL_MODE=vector` và `AI_RETRIEVAL_MODE=hybrid`;
- in ra số chunk được chọn, seed chunks, độ dài context, page range, chunk ids;
- ghi JSON kết quả nếu truyền `--output`.

Tiêu chí bạn nên so sánh:
- `selected_chunks`: hybrid có gom được cụm chunk liên quan hơn không;
- `pages`: hybrid có phủ được các trang liên quan tốt hơn không;
- `context_length`: context có đầy đủ hơn nhưng vẫn không quá dài không;
- `elapsed_ms`: độ trễ có tăng trong mức chấp nhận được không.

Để benchmark retrieval cho flow generate quiz/flashcard, dùng script sau:

```bash
cd examio-be/apps/ai-service
./venv/bin/python src/backend/scripts/benchmark_generation_modes.py \
  --user-storage-id <userStorageId> \
  --generation-type quiz \
  --requested-items 12 \
  --keyword "kiến trúc hệ thống" \
  --model-type gemini \
  --output benchmark-generation.json
```

Script này không gọi LLM generate toàn bộ nội dung, mà tập trung đo:
- retrieval mode nào chọn được source chunks tốt hơn cho generation;
- phân phối số item trên các chunk (`distribution`) có hợp lý không;
- narrow search có được graph mở rộng tốt hơn không.

## Getting Started

To run the AI service locally (from `examio-be`):

1. Create the schema: `cd apps/ai-service && ROLE=migrate ./venv/bin/python -m src.main` (needs `DATABASE_URL` for role `ai_svc` and `DB_SEARCH_PATH=ai,extensions`; see `.env.example`).
2. Start it: `yarn dev:ai` (gRPC on 50051, `/health` on `PORT`, event worker).

## Environment Variables

Copy `.env.example` to `.env` and fill it. The groups that matter:

```
DATABASE_URL=postgresql://ai_svc:...@localhost:5432/examio   # no ?schema=
DB_SEARCH_PATH=ai,extensions
ROLE=api            # api | worker | migrate (comma-separated, migrate is exclusive)
GRPC_PORT=50051
AUTH_JWKS_URL=...   # service-token verification (aud=ai)
R2_ALLOWED_HOSTS=   # hosts document.uploaded may download from (fail-closed if empty and no R2_PUBLIC_URL)
GEMINI_API_KEYS=...
```

## Project Structure

```
ai-service/
├── alembic/                  # Migrations for schema `ai`
├── mermaid/                  # Generated workflow diagrams
├── src/
│   ├── main.py               # ROLE entrypoint (api | worker | migrate)
│   ├── grpc_server.py        # AiService
│   ├── db.py                 # shared asyncpg pool
│   ├── backend/
│   │   ├── api/              # HTTP compat routes (chat.py)
│   │   ├── auth/             # service-token verifier
│   │   ├── messaging/        # envelope, consumer, outbox relay, purge
│   │   ├── services/         # OCR, generation, graph storage
│   │   └── main.py           # FastAPI app (/health, compat)
│   ├── llm/                  # LLM configuration
│   └── rag/                  # RAG implementation
└── requirements.txt          # Project dependencies
```

## License

[MIT License](LICENSE)

## Acknowledgements

- [LangChain](https://www.langchain.com/)
- [LangGraph](https://python.langchain.com/docs/langgraph)
- [FastAPI](https://fastapi.tiangolo.com/)
