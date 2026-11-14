# KMA Chat Agent

A conversational AI system built on RAG (Retrieval-Augmented Generation) and GraphRAG, serving document Q&A and quiz/flashcard generation for KMAEdu.

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

1. **gRPC** `kmaedu.ai.v1.AiService` (`StreamChat`, `Query`, `GenerateWordFamily`, `ListModels`) on `GRPC_PORT` (50051), accepted only with a service token (RS256, `aud=ai`, allowed callers `svc:ai-chat`, `svc:vocabulary`, `svc:content`).
2. **RabbitMQ events** on queue `ai.events`: `document.uploaded` (OCR, chunking, embedding, then a GraphRAG index job), `document.deleted` (drop vectors and the document's graph), `content.generation.requested` (quiz/flashcard generation). Answers: `ai.document.processed|failed`, `ai.generation.completed|failed`.
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

See [Running the Application](#running-the-application) for `ROLE`, migrations and tests. `yarn dev:ai` (in `kmaedu-be`) starts `ROLE=api,worker`.

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
| `api` (default) | gRPC `kmaedu.ai.v1.AiService` on `GRPC_PORT` (50051, service-token guarded) + FastAPI `/health` on `PORT` |
| `worker` | event consumer (`ai.events`), outbox relay, daily purge |
| `migrate` | `alembic upgrade head`, then exit (exclusive) |

```bash
export DATABASE_URL=postgresql://ai_svc:...@localhost:5432/kmaedu DB_SEARCH_PATH=ai,extensions
ROLE=migrate ./venv/bin/python -m src.main
ROLE=api,worker ./venv/bin/python -m src.main
./venv/bin/pytest -q          # DB/broker tests need AI_TEST_DATABASE_URL / AI_TEST_RABBITMQ_URL (throwaway containers)
```

The service owns schema `ai` (Alembic, `alembic/versions`); it never reads or writes another service's tables. Processing status flows back through events (`ai.document.processed|failed`, `ai.generation.completed|failed`).

## GraphRAG

Each document gets its own knowledge graph, built in the `ai-worker` (`ROLE=worker`) after OCR and embedding:

1. `document.uploaded` is processed (OCR, chunks, vectors) and a `GraphIndex` row is queued (`PENDING`).
2. The index worker (`src/graphrag/index_worker.py`) claims a row with a lease (`LOCKED`), retries up to 3 times, and a stale lease is taken over by the next poll.
3. Per chunk it extracts entities and relationships with the LLM, merges near-duplicates (`GRAPHRAG_MERGE_THRESHOLD`), runs Louvain (two levels) and writes one report per community.
4. Results live in `GraphIndex`, `GraphEntity`, `GraphRelationship`, `GraphTextUnitEntity` and `GraphCommunity` (migration `0002_graphrag`).

Reads:
- **Chat** (`src/graphrag/graphrag_retrieval.py`): local search (entities, relations, text units around the query) or global search (map-reduce over community reports); plain vector search when the document has no finished index or its vector size differs.
- **Quiz / flashcard** (`src/graphrag/generation_runner.py`): the document is split into concept slots by community; each slot is generated from its own evidence and duplicates are removed. Documents without an index use the vector path.

Tunables (all optional; empty `GRAPHRAG_LLM_MODEL` = the AI2 default model): `GRAPHRAG_LLM_MODEL` (compose default `Faye-AI`), `GRAPHRAG_CONCURRENCY=5`, `GRAPHRAG_MAX_TOKENS=8192` (Faye-AI reasons before answering), `GRAPHRAG_MERGE_THRESHOLD=0.92`, `GRAPHRAG_BUILD_TIMEOUT_MINUTES=40` (the claim lease is this + 5 minutes).

Migration `0003_drop_legacy_graph` drops the legacy tables `DocumentEntity`, `UserStorageGraph` and `UserStorageGraphGroup` (contract migration, label `migration:contract`).

### Backfill

Documents processed before GraphRAG have no index. Queue them once after `ROLE=migrate`:

```bash
cd kmaedu-be/apps/ai-service
./venv/bin/python -m src.graphrag.backfill --dry-run   # report only, writes nothing
./venv/bin/python -m src.graphrag.backfill             # queue GraphIndex rows; the worker builds them
```

`--dim N` sets the embedding size to compare against (default: probe the embedding model once). A document whose stored vectors have another size is skipped and logged; upload it again.

### Retrieval quality evaluation

```bash
./venv/bin/python -m src.backend.scripts.eval_rag_quality \
  --storage-ids ID1,ID2 --out eval-graphrag.json --label graphrag
```

Other flags: `--dataset`, `--resume`, `--quiz-count` (default 20), `--judge-model`. Run it with a different `--label` and `--out` before and after a change, then compare the JSON files. It replaces the two retrieval benchmark scripts that were removed with the legacy hybrid code.

## Getting Started

To run the AI service locally (from `kmaedu-be`):

1. Create the schema: `cd apps/ai-service && ROLE=migrate ./venv/bin/python -m src.main` (needs `DATABASE_URL` for role `ai_svc` and `DB_SEARCH_PATH=ai,extensions`; see `.env.example`).
2. Start it: `yarn dev:ai` (gRPC on `GRPC_PORT`, 50058 in the local `.env.example` so it does not clash with auth's 50051; `/health` on `PORT`; event worker).

## Environment Variables

Copy `.env.example` to `.env` and fill it. The groups that matter:

```
DATABASE_URL=postgresql://ai_svc:...@localhost:5432/kmaedu   # no ?schema=
DB_SEARCH_PATH=ai,extensions
ROLE=api            # api | worker | migrate (comma-separated, migrate is exclusive)
GRPC_PORT=50058     # 50051 inside the container
AUTH_JWKS_URL=...   # service-token verification (aud=ai)
R2_ALLOWED_HOSTS=   # hosts document.uploaded may download from (fail-closed if empty and no R2_PUBLIC_URL)
GEMINI_API_KEYS=...
GRAPHRAG_LLM_MODEL=  # + GRAPHRAG_CONCURRENCY / _MAX_TOKENS / _MERGE_THRESHOLD, see GraphRAG
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
│   │   ├── services/         # OCR, chat, generation
│   │   └── main.py           # FastAPI app (/health, compat)
│   ├── graphrag/             # per-document GraphRAG: indexer, worker, chat and generation reads
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
