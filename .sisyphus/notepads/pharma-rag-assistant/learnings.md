# Learnings — pharma-rag-assistant

## [2026-03-04] Session Start

### Project Layout
- Working dir: C:\Users\rayen\Desktop\project\test
- Backend: backend/ (FastAPI, Python 3.12+, uv, async SQLAlchemy, NeonDB PostgreSQL)
- Frontend: frontend/ (Next.js 16.1.6, App Router, Tailwind v4, shadcn/ui, bun — root-level app/ NOT src/)
- Path alias: `@/*` -> `./*` (root of frontend/)

### Key Architecture Decisions
- Vector store: pgvector on NeonDB via langchain-postgres PGVectorStore v2 (table-per-tenant: docs_{tenant_id})
- LLM + Embeddings: NVIDIA NIM API (ChatNVIDIA + NVIDIAEmbeddings via langchain-nvidia-ai-endpoints)
- Frontend chat: Vercel AI SDK v5 (ai@^5.0.0, @ai-sdk/react@^2.0.0) — useChat + DefaultChatTransport + createUIMessageStream
- AI SDK proxy pattern: FastAPI does ALL RAG logic; app/api/chat/route.ts proxies JSON -> streaming
- TanStack Query: kept only for non-chat server state (metrics)
- Auth: X-API-Key header, secrets.compare_digest, hardcoded 3 tenants

### Critical AI SDK v5 API Facts
- Import: `useChat` from '@ai-sdk/react'; `DefaultChatTransport`, `createUIMessageStream`, `createUIMessageStreamResponse` from 'ai'
- Usage: `new DefaultChatTransport({ api: '/api/chat' })` NOT api string directly
- Send: `sendMessage({ text })` NOT `append()`
- Status: `status` field ('ready'|'submitted'|'streaming'|'error') NOT `isLoading`
- Messages: `message.parts` array NOT `message.content`
- NO custom hooks/useChat.ts — would conflict with AI SDK's own useChat

### NVIDIA NIM API
- Base URL: https://integrate.api.nvidia.com/v1
- LLM model: meta/llama-3.3-70b-instruct
- Embedding model: nvidia/nv-embedqa-e5-v5 (vector size 1024)
- Package: langchain-nvidia-ai-endpoints
- Classes: ChatNVIDIA, NVIDIAEmbeddings

### pgvector / langchain-postgres
- PGVectorStore v2 API: `await PGVectorStore.create(engine=pg_engine, table_name=..., embedding_service=...)`
- PGEngine: `PGEngine.from_engine(engine=existing_async_engine)` — reuses existing engine
- Table init: `await pg_engine.ainit_vectorstore_table(table_name=f"docs_{tenant_id}", vector_size=1024, ...)`
- Fully async-native — NO asyncio.to_thread() needed

### Existing Backend Structure
- backend/app/core/config.py — Settings (pydantic-settings)
- backend/app/core/dependencies.py — get_current_user, get_db
- backend/app/db/database.py — async engine + Base
- backend/app/models/ — ORM models
- backend/app/schemas/ — Pydantic v2
- backend/app/repositories/ — DB access layer
- backend/app/services/ — Business logic
- backend/app/api/router.py — includes auth + users routers
- backend/app/main.py — lifespan function with create_all

### Guardrails (MUST NOT)
- No PDF/DOCX parsing, no pypdf
- No WebSocket streaming — JSON only from FastAPI
- No chat history persistence
- No Alembic migrations — use create_all
- No `any` in TypeScript
- No `==` for API key comparison — secrets.compare_digest only
- No RAG service importing from app.api
- No component > 150 lines
- No hooks/useChat.ts (conflicts with AI SDK)
- No streamText() or AI SDK model providers in route handler
- No message.content rendering — use message.parts

## T7: QueryLogRepository Creation

**Pattern Confirmed:**
- Repository class stores `AsyncSession` in `__init__`
- Methods are async and use `await db.flush()` + `await db.refresh()` (NOT commit)
- Use `select()` + `execute()` pattern for reads
- Import `func` from sqlalchemy for aggregates (count, avg)

**QueryLog Model Details:**
- Uses UUID string for `id` (NOT int like User)
- Fields: id, tenant_id, question, answer, nb_sources, duration_ms, success, created_at
- Has composite index on (tenant_id, created_at)

**Metrics Query Implementation:**
- `func.count(QueryLog.id)` for total_queries
- `func.avg(QueryLog.duration_ms)` for avg_response_time_ms
- `result.first()` returns tuple; handle None case with `or (0, 0.0)`
- Return dict with: tenant_id, total_queries, avg_response_time_ms

## [2026-03-04] Task 6 — RAG Service
- Implemented async-native PGVectorStore table init and create per tenant (docs_{tenant_id}) with vector_size=1024.
- RAG service uses ChatNVIDIA with max_tokens=1024 and NVIDIAEmbeddings with explicit model names.
- QueryResponse includes tenant_id + duration_ms; IngestResponse uses document_id + chunks_created per schemas/rag.py.
- ChatMessage: UIMessage v5 requires iterating message.parts and checking part.type. No message.content.
- SourceList: Minimalist styling with strict Record<string, string> metadata works well.
- ChatInput: Simple onInput auto-expand is sufficient without external libraries.
