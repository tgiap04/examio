# Workshop Survey Report

## Scope
Current RAG / Hybrid GraphRAG architecture in `examio-be/apps/ai-service`, focused on quiz and flashcard generation.

## Relevant Files
- `examio-be/apps/ai-service/src/backend/services/hybrid_retrieval_service.py` - Main HybridGraphRAG orchestration; modes `vector`, `graph`, `hybrid`; builds graph cache, vector seed retrieval, graph expansion, generation groups.
- `examio-be/apps/ai-service/src/backend/services/generation_service.py` - Quiz/flashcard generation service; calls `hybrid_retrieval_service.retrieve_for_generation`, allocates questions/cards to graph groups, invokes LLM, stores history.
- `examio-be/apps/ai-service/src/backend/api/generation.py` - FastAPI endpoints `/generate-quiz` and `/generate-flashcards`; validates request and calls generation service.
- `examio-be/apps/ai-service/src/backend/api/file.py` - File upload / processing entrypoints; feeds OCR chunks into storage/vector pipeline.
- `examio-be/apps/ai-service/src/backend/services/ocr_service.py` - Document extraction/chunk model source for `DocumentChunk`.
- `examio-be/apps/ai-service/src/rag/vector_store_pg.py` - PostgreSQL vector store; Gemini embeddings; `search_similar`, `search_and_combine`, document storage.
- `examio-be/apps/ai-service/src/graph_rag/graph_builder.py` - Builds NetworkX document graph from chunks with structural, metadata, and semantic edges; optional FAISS semantic edge acceleration.
- `examio-be/apps/ai-service/src/graph_rag/subgraph_partitioner.py` - Community detection and query routing; Louvain/greedy/asyn label propagation; community summaries/metadata.
- `examio-be/apps/ai-service/src/graph_rag/graph_retriever.py` - Older/standalone graph-routed retriever used by experiments.
- `examio-be/apps/ai-service/src/backend/services/graph_storage_service.py` - Persists graph state/groups/nodes/edges to DB and reloads them.
- `examio-be/apps/ai-service/src/backend/services/tutor_knowledge_storage_service.py` - Stores tutor knowledge artifacts related to ingestion.
- `examio-be/apps/ai-service/src/genai_tutor/knowledge_base/ingestion_pipeline.py` - Tutor knowledge ingestion pipeline.
- `examio-be/apps/ai-service/src/genai_tutor/knowledge_base/graph_extractor.py` - Extracts knowledge graph entities/relationships for tutor KB.
- `examio-be/apps/ai-service/src/rag/table_aware_chunking.py` - Chunking implementation for table-aware document splitting.
- `examio-be/apps/ai-service/src/rag/rag_graph.py` and `src/rag/retriever.py` - Older/general RAG graph/retriever flows.
- `examio-be/apps/ai-service/build_graph.py`, `build_department_graphs.py`, `warmup_graph_cache.py`, `clear_graph_cache.py`, `test_graph_rag_with_llm.py` - Operational scripts for graph build/cache/test.
- `examio-be/apps/ai-service/src/backend/scripts/benchmark_hybrid_retrieval.py` - Hybrid retrieval benchmark script.
- `examio-be/apps/ai-service/src/backend/tests/test_hybrid_retrieval_service.py` - Tests for the hybrid retrieval service.
- `examio-be/apps/ai-service/pyproject.toml` - Dependencies: `faiss-cpu`, `python-louvain`, vector/LLM stack.
- `examio-be/apps/ai-service/requirements.txt` and `poetry.lock` - Runtime dependency pins.

## Key Classes And Functions
- `HybridRetrievalService` (`hybrid_retrieval_service.py`)
  - `_resolve_mode()` reads `AI_RETRIEVAL_MODE`; valid: `vector`, `graph`, `hybrid`; default `hybrid`.
  - `_vector_seed_chunks()` queries PG vector store to find semantically relevant seed chunks.
  - `_build_graph_cache_entry()` converts chunks to LangChain docs, builds `DocumentGraph`, partitions communities, persists graph state.
  - `_get_or_build_graph_entry()` uses in-memory cache, DB persisted graph state, or rebuilds from OCR chunks.
  - `_select_graph_connected_chunks()` expands from vector seeds through graph neighbors and edge scores.
  - `retrieve_for_chat()` produces combined context for chat.
  - `retrieve_for_generation()` selects generation chunks and graph groups for quiz/flashcard generation.
  - `plan_generation_groups()` allocates `GenerationGroup`s by community/page/content quality.
- `ContentGenerationService` (`generation_service.py`)
  - `generate_quiz()` and `generate_flashcards()` are the public pipeline methods.
  - `_allocate_items_to_groups()` distributes requested item count across selected graph groups.
  - `_merge_group_chunks()` turns a `GenerationGroup` into a merged chunk payload.
  - `_generate_quiz_batch_for_chunk()` and `_generate_flashcard_batch_for_chunk()` call the LLM for each selected group/chunk.
  - `_generate_with_meta_retry()` retries if generated items are meta-document questions rather than content questions.
- `DocumentGraph` (`graph_builder.py`)
  - `build_graph()` creates graph nodes from chunks and adds edges.
  - `_add_structural_edges()` connects sequential/page-neighbor chunks.
  - `_add_metadata_edges()` connects chunks sharing metadata/category/source signals.
  - `_add_semantic_edges()` embeds chunk content and adds similarity edges; can use FAISS.
  - `_build_communities()` annotates graph/community metadata.
- `SubgraphPartitioner` (`subgraph_partitioner.py`)
  - `partition_by_community_detection()` supports Louvain, greedy modularity, async label propagation.
  - `_generate_llm_summary()` can summarize communities.
  - `route_query_to_communities()` routes query embedding to top communities.
- `PgVectorStore` (`vector_store_pg.py`)
  - `create_embedding()`, `create_embeddings_batch()` use Gemini embeddings.
  - `store_document()`, `store_documents_batch()` persist chunk + vector.
  - `search_similar()` performs similarity retrieval for seed chunks.

## Pipeline Flow
1. Document ingestion extracts/OCRs uploaded files into `DocumentChunk` records (`ocr_service.py`, API/service file flow).
2. Chunks are stored in Postgres and embedded via `PgVectorStore`; each chunk carries `user_storage_id`, `page_range`, `title`, `content`, timestamps, and vector data.
3. Quiz/flashcard endpoint in `src/backend/api/generation.py` receives `userStorageId`, item count, difficulty/type/model options.
4. `ContentGenerationService.generate_quiz()` / `generate_flashcards()` calls `HybridRetrievalService.retrieve_for_generation()`.
5. Retrieval mode is chosen by `AI_RETRIEVAL_MODE`:
   - `vector`: retrieve top chunks by vector similarity.
   - `graph`: use document graph/community grouping without vector seeding emphasis.
   - `hybrid`: vector-retrieve seed chunks, then expand/select related graph neighbors/communities.
6. If graph state is absent/stale, `HybridRetrievalService` builds a `DocumentGraph` from chunks, adds structural/metadata/semantic edges, partitions it with `SubgraphPartitioner`, creates generation groups, and persists via `graph_storage_service`.
7. `retrieve_for_generation()` returns flattened chunks plus `generation_groups`; metadata includes retrieval mode, selected count, group count, graph stats.
8. Generation service distributes requested quiz/cards across groups, merges group chunks into content prompts, calls LLM concurrently, parses structured JSON, retries meta-document outputs, normalizes page ranges, and saves history.

## Graph / Community Detection
- Graph library: NetworkX.
- Community algorithms: Louvain via `python-louvain`, NetworkX greedy modularity, async label propagation.
- Edge types include structural, metadata, semantic; semantic edges use embeddings and optional FAISS acceleration.
- Communities become `GenerationGroup`s with page ranges, token estimate, quality/weight, optional summaries, and source chunk IDs.

## Configuration And Strategy
- `AI_RETRIEVAL_MODE` controls retrieval strategy; default is `hybrid`.
- `HybridRetrievalService.DEFAULT_CHAT_TOP_K = 8`; `DEFAULT_GENERATION_TOP_K = 24`; max chat context length 8000; graph version 2.
- `pyproject.toml` includes `faiss-cpu` and `python-louvain`; confirms vector + community detection stack.
- Additional generation concurrency/model behavior is configured in `generation_service.py` via service methods/env lookups.

## LightRAG References
No direct `lightrag` or `light_rag` implementation was found in `examio-be/apps/ai-service`. The lightweight/custom equivalent is the in-house `HybridRetrievalService` + `DocumentGraph` + `SubgraphPartitioner` stack.

## Unresolved Questions
- Exact DB schema/migration files for persisted graph/vector tables were not fully traced outside `ai-service`.
- Exact file ingestion entrypoint sequence may include upstream services outside `examio-be/apps/ai-service`.
