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

The backend provides a RESTful API for:

1. User authentication
2. Conversation management
3. Message processing through the RAG pipeline
4. Data persistence in MongoDB

```
Client Request → FastAPI Router → Business Logic → RAG Processing → Database → Response
```

### Tech Stack

- **FastAPI**: High-performance web framework
- **MongoDB**: Document database for storing conversations and messages
- **Pydantic**: Data validation and settings management
- **JWT**: Authentication mechanism
- **Python 3.12**: Core programming language

### Features

- RESTful API endpoints for conversation and message management
- User authentication and authorization
- Persistent storage of conversations and message history
- Rate limiting and request validation
- Conversation memory management

### Installation and Setup

```bash
# Install MongoDB
# Follow instructions at https://docs.mongodb.com/manual/installation/

# Set up environment variables
# Make sure MongoDB connection string is set in .env

# Run the API server
uvicorn src.backend.main:app --reload --port 8000

# API will be available at http://localhost:8000
# Swagger documentation at http://localhost:8000/docs
```

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

Run the backend API with `yarn dev:ai` from `examio-be/` (or `uvicorn src.backend.main:app --port 8000` inside this directory).

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

Nếu muốn xem graph stats của một file đã OCR:

```bash
curl http://localhost:8000/api/ai/graph-stats/<userStorageId>
```

Endpoint này trả về:
- số chunks của file;
- số nodes/edges trong graph;
- số communities;
- artifact path;
- graph đang có trong RAM hay chỉ nằm ở persisted artifact.

## Getting Started

To run the entire system:

1. Start MongoDB:

```bash
mongod --dbpath /path/to/data/directory
```

2. Start the AI backend:

```bash
yarn dev:ai
```

3. The API is served at http://localhost:8000

## Environment Variables

Create a `.env` file with the following variables:

```
# LLM API Keys
GEMINI_API_KEY=your_gemini_api_key

# MongoDB
MONGODB_CONNECTION_STRING=mongodb://localhost:27017
MONGODB_DATABASE_NAME=kma_chat_agent

# JWT Authentication
JWT_SECRET_KEY=your_jwt_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## Project Structure

```
kma_chat_agent/
├── mermaid/                  # Generated workflow diagrams
├── src/
│   ├── backend/              # FastAPI backend
│   │   ├── api/              # API routes
│   │   ├── db/               # Database connections
│   │   ├── models/           # Pydantic models
│   │   └── main.py           # API entry point
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
