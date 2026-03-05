# Pharma AI Regulatory Assistant â€” Work Plan

## TL;DR

> **Quick Summary**: Build a full-stack RAG-based pharmaceutical regulatory assistant on top of the existing FastAPI + Next.js codebase. Adds LangChain RAG pipeline with pgvector (PostgreSQL) vector store and NVIDIA NIM API (for both LLM and embeddings), multi-tenant document isolation via separate tables per tenant, API key auth, request logging with metrics, and a Next.js chat interface powered by Vercel AI SDK v5 (useChat + DefaultChatTransport + createUIMessageStream) for real-time streaming UX. Delivers a complete, scoreable submission for the B'right Tunisie technical recruitment test.
>
> **Deliverables**:
> - FastAPI RAG endpoints: POST /api/query, POST /api/documents/ingest, GET /api/metrics/{tenant_id}
> - LangChain LCEL pipeline with pgvector on NeonDB PostgreSQL (table-per-tenant isolation) + NVIDIA NIM embeddings (nvidia/nv-embedqa-e5-v5)
> - API key authentication middleware (X-API-Key header)
> - QueryLog model + request logging + metrics aggregation
> - 3 simulated regulatory TXT documents (GMP, Clinical Trials, Drug Approval)
> - Next.js App Router chat interface with source panel, tenant selector, loading/error/empty states
> - 2+ pytest tests (RAG pipeline + tenant isolation)
> - Dockerfile + docker-compose.yml (backend + frontend + PostgreSQL)
> - ARCHITECTURE.md + updated README.md + .env.example
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES â€” 4 waves + final verification
> **Critical Path**: Task 1 â†’ Task 2 â†’ Task 5 â†’ Task 8 â†’ Task 12 â†’ Task 16 â†’ Final

---

## Context

### Original Request
Build a complete Pharma AI Regulatory Assistant for the B'right Tunisie technical recruitment test. The test has 4 scored parts (100 pts total, 65/100 threshold): (1) Backend FastAPI + RAG Pipeline (30 pts), (2) Multi-Tenant Architecture & Security (25 pts), (3) Next.js Chat Frontend (25 pts), (4) Bonus â€” Tests, Docker, ARCHITECTURE.md, improvement proposals (20 pts).

### Interview Summary
**Key Discussions**:
- LLM Provider: NVIDIA NIM API (https://build.nvidia.com/) â€” OpenAI-compatible, `langchain-nvidia-ai-endpoints` package with `ChatNVIDIA` + `NVIDIAEmbeddings`
- Embeddings: NVIDIA NIM API (nvidia/nv-embedqa-e5-v5) â€” cloud-based, no local model download needed
- Vector Store: pgvector on existing NeonDB PostgreSQL with table-per-tenant isolation (not metadata filtering)
- Auth: Keep existing JWT for user endpoints + add X-API-Key for RAG endpoints 
- Test Documents: 3 simulated TXT files (no real PDFs, no PDF parsing libraries) 
- Docker: Full docker-compose (backend + frontend + PostgreSQL) 
- Frontend: Next.js App Router chat with shadcn/ui components, TanStack Query for non-chat server state, Vercel AI SDK v5 for streaming chat (useChat + DefaultChatTransport)\n- AI SDK Architecture: Option A Proxy — FastAPI does ALL RAG (retrieve + generate). Next.js app/api/chat/route.ts proxies to FastAPI and wraps JSON response in createUIMessageStream for streaming UX\n- AI SDK Packages: ai@^5.0.0, @ai-sdk/react@^2.0.0 (alongside @tanstack/react-query for metrics/non-chat data) 
- Tenants: Hardcoded 2-3 tenants with pre-configured API keys (no tenant CRUD) 

**Research Findings**:
- LangChain v0.2+: Must use LCEL chains  (create_retrieval_chain + create_stuff_documents_chain), NOT deprecated RetrievalQAChain
- pgvector: table-per-tenant via `PGVectorStore.create(engine=pg_engine, table_name=f"docs_{tenant_id}")` using `langchain-postgres` v2 API
- NVIDIA NIM API: OpenAI-compatible format, base URL `https://integrate.api.nvidia.com/v1`, auth via `Bearer nvapi-...` header
- NVIDIA NIM has BOTH LLM and embeddings endpoints â€” eliminates need for local sentence-transformers (major simplification)
- `langchain-nvidia-ai-endpoints` v1.1.0 provides `ChatNVIDIA`, `NVIDIAEmbeddings`, `NVIDIARerank` classes
- pgvector via `langchain-postgres` PGVectorStore is async-native via PGEngine.from_engine() â€” reuses existing asyncpg engine, no asyncio.to_thread() needed
- `langchain-postgres` requires `psycopg[binary]` as a transitive dependency â€” ensure it's installed
- Next.js App Router: `app/page.tsx` for single chat page, `'use client'` for interactive components
- Next.js + shadcn/ui: Official support, same components as Vite but `components.json` targets `next` framework
- Tailwind v4 in Next.js requires `@tailwindcss/postcss` PostCSS plugin (not `tailwindcss` directly)
- Next.js rewrites in `next.config.ts` for proxying `/api/*` to FastAPI â€” no CORS needed
- Next.js standalone output mode for Docker: `output: 'standalone'` in next.config.ts
- Vercel AI SDK v5: packages `ai@^5.0.0` + `@ai-sdk/react@^2.0.0`; `createUIMessageStream`, `createUIMessageStreamResponse` from 'ai'; `useChat`, `DefaultChatTransport` from '@ai-sdk/react'
- AI SDK v5 useChat: `transport: new DefaultChatTransport({ api: '/api/chat' })`, `sendMessage({ text })` NOT `append()`, `message.parts` array NOT `message.content`, status 'ready'|'submitted'|'streaming'|'error' NOT isLoading
- AI SDK v5 stream: `createUIMessageStream` execute callback with writer; sequence text-start then text-delta then text-end; data parts via `writer.write({ type: 'data-sources', value: [...] })`; `createUIMessageStreamResponse` sets x-vercel-ai-ui-message-stream:v1 header

### Metis Review
**Identified Gaps** (addressed):
- Python 3.14 compatibility: Changed to >=3.12 (CRITICAL â€” LangChain broken on 3.14)
- NVIDIA embeddings singleton: Initialize `NVIDIAEmbeddings` in lifespan, store on app.state (API-based, no download delay)
- pgvector PGEngine singleton: Initialize via PGEngine.from_engine(existing_async_engine) in lifespan, store PGVectorStore on app.state
- Missing frontend deps: TanStack Query + Zod not installed (mandated by AGENTS.md)
- Icon conflict: lucide-react stays (shadcn default) over @tabler/icons-react
- API route prefix: Use existing /api (not /api/v1/) to match current codebase
- Tenant provisioning: Hardcoded tenants â€” no tenant CRUD needed
- No Alembic migrations: Stays with create_all (scope control)
- pgvector via PGVectorStore is async-native â€” no asyncio.to_thread() needed for vector operations (NVIDIA LangChain classes may also be async-native)

---

## Work Objectives

### Core Objective
Deliver a complete, runnable Pharma RAG Assistant that scores maximum points on all 4 parts of the B'right recruitment test. The project must start with `docker-compose up` and work end-to-end.

### Concrete Deliverables
- POST /api/query: RAG-powered question answering with source retrieval
- POST /api/documents/ingest: Document ingestion with chunking into tenant-scoped pgvector tables
- GET /api/metrics/{tenant_id}: Query count + average response time
- Next.js chat page: message input, response display, source panel, tenant selector
- 3 simulated regulatory TXT documents with realistic pharma content
- 2+ passing pytest tests
- Docker deployment (docker-compose.yml + Dockerfiles)
- ARCHITECTURE.md documenting all technical choices
- Updated README.md with clear run instructions

### Definition of Done
- [ ] `docker compose up --build -d` starts all services without errors
- [ ] `curl POST /api/query` returns answer + sources with valid API key
- [ ] `curl POST /api/query` with tenant-2 key does NOT see tenant-1 documents
- [ ] `curl POST /api/documents/ingest` creates chunks in tenant-specific collection
- [ ] `curl GET /api/metrics/{tenant_id}` returns query count + avg duration
- [ ] Frontend builds with zero TypeScript errors (`bun run build`)
- [ ] Frontend renders chat interface, sends queries, displays responses + sources
- [ ] `uv run pytest tests/ -v` passes with >= 2 tests
- [ ] ARCHITECTURE.md exists with >50 lines of substantive content
- [ ] README.md has clear "how to run" instructions

### Must Have
- RAG pipeline with chunking, embedding, retrieval, generation (Part 1)
- Tenant isolation â€” tenant A cannot see tenant B's documents (Part 2)
- API key authentication on all RAG endpoints (Part 2)
- Request logging with metrics endpoint (Part 2)
- Chat interface with source display (Part 3)
- Loading, error, and empty states in UI (Part 3)
- Tenant selector in UI (Part 3)
- 2+ pytest tests passing (Part 4)
- Docker deployment (Part 4)
- ARCHITECTURE.md (Part 4)

### Must NOT Have (Guardrails)
- **No PDF/DOCX parsing** â€” TXT files only, no pypdf or python-docx
- **No WebSocket** — HTTP SSE streaming via AI SDK is allowed, FastAPI stays JSON-only (no streaming from backend)
- **No chat history persistence** â€” each query is independent/stateless
- **No user auth UI** â€” no login/register screens, frontend uses API key directly
- **No page routes beyond `app/page.tsx`** — API route handlers in `app/api/` are allowed (needed for AI SDK proxy)
- **No Alembic migrations** â€” use existing create_all pattern
- **No custom UI primitives** â€” shadcn only, no hand-built modals/inputs/buttons
- **No rate limiting** â€” out of scope
- **No caching/Redis** â€” direct pgvector + LLM calls
- **No CI/CD pipeline** â€” Docker only, no GitHub Actions
- **No refactoring of existing code** â€” existing auth, users, DB setup stays untouched
- **No `any` types in TypeScript** â€” strict mode enforced
- **No unbounded `max_tokens`** â€” every ChatNVIDIA call sets max_tokens
- **No `==` for API key comparison** â€” secrets.compare_digest only
- **RAG service must NOT import from app.api** â€” service layer cannot depend on endpoint layer
- **No component > 150 lines** â€” decompose if longer
- **No direct fetch calls in Next.js components** â€” service layer in `services/`
- **Route handler must NOT call NVIDIA NIM directly** — all LLM/RAG logic stays in FastAPI. `app/api/chat/route.ts` only proxies and wraps
- **Must NOT use `streamText()` or AI SDK model providers in route handler** — use `createUIMessageStream` with manual writer only
- **Frontend ChatMessage type must NOT conflict with AI SDK UIMessage** — use AI SDK's `UIMessage` type directly, do not create a separate `ChatMessage` type for chat rendering
- **Must NOT use `message.content` for rendering chat messages** — use `message.parts` array (`part.type === 'text' ? part.text : null`)
- **Custom data parts (sources) must NOT be `transient: true`** — sources need to persist across re-renders
- **No `hooks/useChat.ts` file** — AI SDK exports its own `useChat` hook from `@ai-sdk/react`, creating a custom one causes name collision
- **Must use `ai@^5.0.0` and `@ai-sdk/react@^2.0.0`** — NOT v6 beta. v5 is the stable release with DefaultChatTransport, createUIMessageStream, and useChat

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** â€” ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (pytest + pytest-asyncio + httpx + aiosqlite in conftest.py)
- **Automated tests**: YES (Tests-after â€” write implementation first, then tests)
- **Framework**: pytest with pytest-asyncio
- **RAG tests must mock LLM calls** â€” do not depend on NVIDIA NIM API availability in CI/tests

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend endpoints**: Use Bash (curl) â€” send requests, assert status + response fields
- **Frontend UI**: Use Playwright (playwright skill) â€” navigate, interact, assert DOM, screenshot
- **Docker**: Use Bash â€” docker compose up, ps, health check
- **Tests**: Use Bash â€” uv run pytest with assertion on exit code and output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately â€” foundation, config, data):
â”œâ”€â”€ Task 1: Fix Python version + install backend dependencies [quick]
â”œâ”€â”€ Task 2: Create 3 simulated regulatory TXT documents [writing]
â”œâ”€â”€ Task 3: Backend schemas + QueryLog model [quick]
â”œâ”€â”€ Task 4: API key auth dependency [quick]
â”œâ”€â”€ Task 5: Set up Next.js frontend with shadcn/ui + TanStack Query [quick]

Wave 2 (After Wave 1 â€” core backend services + frontend scaffolding):
â”œâ”€â”€ Task 6: RAG service â€” chunking, embedding, retrieval, generation (depends: 1, 2, 3) [deep]
â”œâ”€â”€ Task 7: QueryLog repository (depends: 3) [quick]
â”œâ”€â”€ Task 8: Frontend typed API service layer + types (depends: 5) [quick]
â””â”€â”€ Task 9: Frontend chat feature components (depends: 5, 8) [visual-engineering]

Wave 3 (After Wave 2 â€” endpoints + frontend integration):
â”œâ”€â”€ Task 10: RAG API endpoints â€” /query, /documents/ingest, /metrics (depends: 4, 6, 7) [unspecified-high]
â”œâ”€â”€ Task 11: Wire router + lifespan initialization (depends: 10) [quick]
â””â”€â”€ Task 12: Frontend ChatPage assembly + AI SDK v5 useChat integration (depends: 8, 9) [visual-engineering]

Wave 4 (After Wave 3 â€” tests, Docker, docs):
â”œâ”€â”€ Task 13: Pytest tests â€” RAG pipeline + tenant isolation (depends: 11) [deep]
â”œâ”€â”€ Task 14: Dockerfiles + docker-compose.yml (depends: 11) [unspecified-high]
â”œâ”€â”€ Task 15: ARCHITECTURE.md (depends: 11) [writing]
â”œâ”€â”€ Task 16: Update README.md + .env.example (depends: 14) [writing]
â””â”€â”€ Task 17: Pre-seed tenant documents on startup (depends: 6, 11) [quick]

Wave FINAL (After ALL tasks â€” independent review, 4 parallel):
â”œâ”€â”€ Task F1: Plan compliance audit (oracle)
â”œâ”€â”€ Task F2: Code quality review (unspecified-high)
â”œâ”€â”€ Task F3: Real QA â€” curl + Playwright end-to-end (unspecified-high)
â””â”€â”€ Task F4: Scope fidelity check (deep)

Critical Path: Task 1 â†’ Task 6 â†’ Task 10 â†’ Task 11 â†’ Task 13 â†’ F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | â€” | 6, 7, 10, 11 | 1 |
| 2 | â€” | 6 | 1 |
| 3 | â€” | 6, 7, 10 | 1 |
| 4 | â€” | 10 | 1 |
| 5 | â€” | 8, 9, 12 | 1 |
| 6 | 1, 2, 3 | 10, 17 | 2 |
| 7 | 3 | 10 | 2 |
| 8 | 5 | 9, 12 | 2 |
| 9 | 5, 8 | 12 | 2 |
| 10 | 4, 6, 7 | 11, 13, 14, 15 | 3 |
| 11 | 10 | 13, 14, 15, 16, 17 | 3 |
| 12 | 8, 9 | F3 | 3 |
| 13 | 11 | F1-F4 | 4 |
| 14 | 11 | 16, F1-F4 | 4 |
| 15 | 11 | F1-F4 | 4 |
| 16 | 14 | F1-F4 | 4 |
| 17 | 6, 11 | F3 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks â€” T1 `quick`, T2 `writing`, T3 `quick`, T4 `quick`, T5 `quick`
- **Wave 2**: 4 tasks â€” T6 `deep`, T7 `quick`, T8 `quick`, T9 `visual-engineering`
- **Wave 3**: 3 tasks â€” T10 `unspecified-high`, T11 `quick`, T12 `visual-engineering`
- **Wave 4**: 5 tasks â€” T13 `deep`, T14 `unspecified-high`, T15 `writing`, T16 `writing`, T17 `quick`
- **FINAL**: 4 tasks â€” F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high` + `playwright`, F4 `deep`

---

## TODOs

- [ ] 1. Fix Python Version + Install Backend Dependencies

  **What to do**:
  - Change `requires-python` from `">=3.14"` to `">=3.12"` in `backend/pyproject.toml`
  - Add backend dependencies via `uv add`:
    - `langchain` `langchain-nvidia-ai-endpoints` `langchain-postgres` `langchain-text-splitters`
    - `pgvector` `psycopg[binary]`
  - Run `uv sync` to verify all dependencies resolve correctly
  - Verify import works: `uv run python -c "import langchain; import langchain_postgres; import langchain_nvidia_ai_endpoints; print('OK')"`

  **Must NOT do**:
  - Do NOT modify any existing code files â€” only pyproject.toml
  - Do NOT add Alembic or any migration-related packages
  - Do NOT add pypdf, python-docx, or any PDF/document parsing libraries

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit + package installation â€” trivial task
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: No git operations in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 7, 10, 11 (all backend tasks need these deps)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `backend/pyproject.toml` â€” Current dependency list and python version constraint to modify

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - LangChain installation: https://python.langchain.com/docs/get_started/installation
  - langchain-postgres: https://github.com/langchain-ai/langchain-postgres â€” PGVectorStore v2 API

  **WHY Each Reference Matters**:
  - `pyproject.toml`: The ONLY file to edit. Contains the `requires-python` line that must change from `>=3.14` to `>=3.12`, and the `[project.dependencies]` list where new packages are added

  **Acceptance Criteria**:
  - [ ] `requires-python` in pyproject.toml reads `">=3.12"`
  - [ ] `uv sync` completes with exit code 0
  - [ ] `uv run python -c "import langchain; import langchain_postgres; import langchain_nvidia_ai_endpoints; print('OK')"` prints OK

  **QA Scenarios:**

  ```
  Scenario: Dependencies install and import correctly
    Tool: Bash
    Preconditions: backend/pyproject.toml has been edited
    Steps:
      1. cd backend && uv sync
      2. uv run python -c "import langchain; import langchain_postgres; import langchain_nvidia_ai_endpoints; import pgvector; import langchain_text_splitters; print('ALL_IMPORTS_OK')"
      3. Assert output contains 'ALL_IMPORTS_OK'
    Expected Result: Exit code 0, output contains ALL_IMPORTS_OK
    Failure Indicators: ImportError, ModuleNotFoundError, uv sync failure
    Evidence: .sisyphus/evidence/task-1-deps-install.txt

  Scenario: Python version constraint is correct
    Tool: Bash (grep)
    Preconditions: pyproject.toml edited
    Steps:
      1. grep 'requires-python' backend/pyproject.toml
      2. Assert output contains '>=3.12'
      3. Assert output does NOT contain '>=3.14'
    Expected Result: Line reads requires-python = ">=3.12"
    Failure Indicators: Still shows >=3.14 or missing line
    Evidence: .sisyphus/evidence/task-1-python-version.txt
  ```

  **Commit**: YES
  - Message: `chore: fix python version and add RAG dependencies`
  - Files: `backend/pyproject.toml`, `backend/uv.lock`
  - Pre-commit: `uv sync`

- [ ] 2. Create 3 Simulated Regulatory TXT Documents

  **What to do**:
  - Create directory `backend/test_docs/`
  - Create 3 TXT files with realistic pharmaceutical regulatory content:
    - `gmp_guidelines.txt` â€” Good Manufacturing Practice guidelines (EU GMP Annex 11 style). Include sections on quality management, personnel, premises, documentation, production, quality control. Use realistic section numbering (e.g., "Section 4.2 â€” Personnel Qualifications"), regulatory references ("per ICH Q7 Section 4.2"), and technical terminology
    - `clinical_trials.txt` â€” Clinical trial phases and regulations (ICH GCP style). Cover Phase I-IV, informed consent, adverse event reporting, data integrity. Include references to "ICH E6(R2) Section 5.0", "21 CFR Part 312"
    - `drug_approval_process.txt` â€” Drug approval and submission process (EMA/FDA style). Cover NDA/MAA submissions, review timelines, post-market surveillance, labeling requirements. Reference "EU Directive 2001/83/EC", "FDA 21 CFR Part 314"
  - Each file should be 2000-4000 words (enough to produce 5-10 meaningful chunks at 1500-char chunk size)
  - Content must be factually plausible but clearly simulated (not copied from real documents)

  **Must NOT do**:
  - Do NOT use real copyrighted regulatory documents
  - Do NOT create PDF files â€” TXT only
  - Do NOT create more than 3 documents

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Content creation task â€” writing realistic technical documents
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 6 (RAG service needs docs to test against)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - None (new directory)

  **External References**:
  - ICH Q7 (API GMP): https://www.ich.org/page/quality-guidelines â€” section structure reference
  - ICH E6 (GCP): https://www.ich.org/page/efficacy-guidelines â€” clinical trial terminology
  - EMA regulatory process: https://www.ema.europa.eu/en/about-us/what-we-do/authorisation-medicines â€” approval workflow reference

  **WHY Each Reference Matters**:
  - ICH guidelines: These are the real document standards being simulated. The test evaluator will recognize authentic-looking section numbers and terminology. Documents should LOOK like they came from these sources without copying verbatim

  **Acceptance Criteria**:
  - [ ] `backend/test_docs/gmp_guidelines.txt` exists, >2000 words, has section numbering
  - [ ] `backend/test_docs/clinical_trials.txt` exists, >2000 words, references ICH/FDA
  - [ ] `backend/test_docs/drug_approval_process.txt` exists, >2000 words, covers EMA/FDA
  - [ ] All 3 files are valid UTF-8 text

  **QA Scenarios:**

  ```
  Scenario: Documents exist with sufficient content
    Tool: Bash
    Preconditions: Files created in backend/test_docs/
    Steps:
      1. ls backend/test_docs/ â€” assert 3 .txt files present
      2. wc -w backend/test_docs/gmp_guidelines.txt â€” assert > 2000
      3. wc -w backend/test_docs/clinical_trials.txt â€” assert > 2000
      4. wc -w backend/test_docs/drug_approval_process.txt â€” assert > 2000
      5. grep -l 'GMP\|ICH\|Section' backend/test_docs/*.txt â€” assert all 3 files match
    Expected Result: 3 files, each >2000 words, containing regulatory terminology
    Failure Indicators: Missing files, <2000 words, no regulatory terms
    Evidence: .sisyphus/evidence/task-2-docs-validation.txt
  ```

  **Commit**: YES (grouped with Tasks 3, 4)
  - Message: `feat(backend): add schemas, models, auth, and test documents for RAG pipeline`
  - Files: `backend/test_docs/*.txt`
  - Pre-commit: â€”

- [ ] 3. Backend Schemas + QueryLog Model

  **What to do**:
  - Create `backend/app/schemas/rag.py` with Pydantic v2 models:
    - `QueryRequest`: `question: str`, `tenant_id: str` (optional â€” can be derived from API key)
    - `QueryResponse`: `answer: str`, `sources: list[SourceDocument]`, `tenant_id: str`, `duration_ms: float`
    - `SourceDocument`: `content: str`, `metadata: dict[str, str]` (doc_name, page/section)
    - `IngestRequest`: model for document ingestion metadata (tenant_id, document_name)
    - `IngestResponse`: `document_id: str`, `chunks_created: int`, `tenant_id: str`
    - `MetricsResponse`: `tenant_id: str`, `total_queries: int`, `avg_response_time_ms: float`
  - Create `backend/app/models/query_log.py` with SQLAlchemy model:
    - `QueryLog`: id (UUID, PK), tenant_id (str, indexed), question (str), answer (str), nb_sources (int), duration_ms (float), success (bool), created_at (datetime, server_default=now). Add composite index on (tenant_id, created_at)
  - Import QueryLog in `backend/app/models/__init__.py` (create if needed) so create_all picks it up

  **Must NOT do**:
  - Do NOT use `Any` type in schemas â€” all fields explicitly typed
  - Do NOT modify existing `schemas/user.py` or `models/user.py`
  - Do NOT add Alembic migration files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema/model definition â€” straightforward Pydantic + SQLAlchemy classes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Tasks 6 (RAG service uses schemas), 7 (repository uses model), 10 (endpoints use schemas)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `backend/app/schemas/user.py` â€” Follow exact Pydantic v2 style (BaseModel, field types, model_config)
  - `backend/app/models/user.py` â€” Follow exact SQLAlchemy model pattern (Base, Column types, mapped_column)

  **API/Type References**:
  - `backend/app/db/database.py:Base` â€” The declarative base class all models must inherit from

  **WHY Each Reference Matters**:
  - `schemas/user.py`: Copy the exact Pydantic v2 pattern â€” `model_config = ConfigDict(from_attributes=True)`, field declarations, Optional types. The RAG schemas must match this style exactly
  - `models/user.py`: Copy the SQLAlchemy pattern â€” `class QueryLog(Base)`, `__tablename__`, `mapped_column()` usage, UUID primary key generation
  - `database.py:Base`: QueryLog must inherit from this exact Base class so `create_all` picks it up automatically at startup

  **Acceptance Criteria**:
  - [ ] `backend/app/schemas/rag.py` exists with all 6 schema classes
  - [ ] `backend/app/models/query_log.py` exists with QueryLog model
  - [ ] QueryLog model imports Base from `app.db.database`
  - [ ] No `Any` type used in any schema or model
  - [ ] `uv run python -c "from app.schemas.rag import QueryRequest, QueryResponse, IngestResponse, MetricsResponse, SourceDocument; print('OK')"` works
  - [ ] `uv run python -c "from app.models.query_log import QueryLog; print(QueryLog.__tablename__)"` prints table name

  **QA Scenarios:**

  ```
  Scenario: Schemas import and validate correctly
    Tool: Bash
    Preconditions: Schema file created
    Steps:
      1. cd backend && uv run python -c "
         from app.schemas.rag import QueryRequest, QueryResponse, SourceDocument, IngestResponse, MetricsResponse;
         q = QueryRequest(question='test');
         s = SourceDocument(content='text', metadata={'doc_name': 'test.txt'});
         r = QueryResponse(answer='ans', sources=[s], tenant_id='t1', duration_ms=100.0);
         print('SCHEMAS_OK')"
      2. Assert output contains SCHEMAS_OK
    Expected Result: All schemas instantiate without validation errors
    Failure Indicators: ImportError, ValidationError, missing fields
    Evidence: .sisyphus/evidence/task-3-schemas.txt

  Scenario: QueryLog model has correct columns
    Tool: Bash
    Preconditions: Model file created
    Steps:
      1. cd backend && uv run python -c "
         from app.models.query_log import QueryLog;
         cols = [c.name for c in QueryLog.__table__.columns];
         assert 'tenant_id' in cols;
         assert 'question' in cols;
         assert 'duration_ms' in cols;
         assert 'created_at' in cols;
         print('MODEL_OK')"
      2. Assert output contains MODEL_OK
    Expected Result: Model has all required columns
    Failure Indicators: ImportError, AssertionError, missing columns
    Evidence: .sisyphus/evidence/task-3-model.txt
  ```

  **Commit**: YES (grouped with Tasks 2, 4)
  - Message: `feat(backend): add schemas, models, auth, and test documents for RAG pipeline`
  - Files: `backend/app/schemas/rag.py`, `backend/app/models/query_log.py`
  - Pre-commit: Import validation commands above

- [ ] 4. API Key Authentication Dependency

  **What to do**:
  - Create `backend/app/core/api_key.py`:
    - Define a dict of tenant API keys in settings or hardcoded: `TENANT_API_KEYS = {"tenant-1-secret-key": "tenant-1", "tenant-2-secret-key": "tenant-2", "tenant-3-secret-key": "tenant-3"}`
    - Create `api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)` from `fastapi.security`
    - Create async dependency `get_tenant_from_api_key(api_key: str = Security(api_key_header))` that:
      - Returns 401 HTTPException if api_key is None or empty
      - Iterates TENANT_API_KEYS and uses `secrets.compare_digest(api_key, stored_key)` for timing-safe comparison
      - Returns the tenant_id string if match found
      - Returns 401 HTTPException if no match
    - Also add these API keys to `core/config.py` Settings class as `TENANT_API_KEYS: dict[str, str]` with default values, so they can be overridden via environment variables

  **Must NOT do**:
  - Do NOT modify existing `dependencies.py` â€” create a NEW file `api_key.py`
  - Do NOT use `==` for API key comparison â€” use `secrets.compare_digest` only
  - Do NOT store API keys in plaintext in .env (use the Settings default for demo, document in README)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation with well-defined FastAPI security pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 10 (RAG endpoints use this dependency)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `backend/app/core/dependencies.py` â€” Follow the same async dependency pattern (async def, Depends/Security, HTTPException on failure). This file has `get_current_user` â€” our `get_tenant_from_api_key` follows the same shape but validates API key instead of JWT
  - `backend/app/core/config.py` â€” Settings class pattern for adding TENANT_API_KEYS config

  **API/Type References**:
  - `fastapi.security.APIKeyHeader` â€” The FastAPI security class for X-API-Key header extraction

  **External References**:
  - FastAPI Security: https://fastapi.tiangolo.com/reference/security/ â€” APIKeyHeader docs
  - Python secrets module: https://docs.python.org/3/library/secrets.html#secrets.compare_digest

  **WHY Each Reference Matters**:
  - `dependencies.py`: The existing `get_current_user` dependency is the template â€” same async function shape, same HTTPException pattern, same use of Security() parameter injection. Copy this exact pattern but swap JWT validation for API key lookup
  - `config.py`: Settings class where TENANT_API_KEYS config should be added so keys are overridable via .env

  **Acceptance Criteria**:
  - [ ] `backend/app/core/api_key.py` exists with `get_tenant_from_api_key` dependency
  - [ ] Uses `secrets.compare_digest` (not `==`) for key comparison
  - [ ] Returns tenant_id string on valid key
  - [ ] Returns HTTP 401 on invalid/missing key
  - [ ] `uv run python -c "from app.core.api_key import get_tenant_from_api_key; print('OK')"` works

  **QA Scenarios:**

  ```
  Scenario: API key dependency imports correctly
    Tool: Bash
    Preconditions: api_key.py created
    Steps:
      1. cd backend && uv run python -c "from app.core.api_key import get_tenant_from_api_key, TENANT_API_KEYS; print(len(TENANT_API_KEYS)); print('AUTH_OK')"
      2. Assert output contains AUTH_OK and >= 2 tenant keys
    Expected Result: Module imports, at least 2 tenant keys defined
    Failure Indicators: ImportError, 0 keys
    Evidence: .sisyphus/evidence/task-4-api-key.txt

  Scenario: Uses secrets.compare_digest not == operator
    Tool: Bash (grep)
    Preconditions: api_key.py created
    Steps:
      1. grep 'compare_digest' backend/app/core/api_key.py â€” assert match found
      2. grep -n '==' backend/app/core/api_key.py â€” should NOT match any API key comparison (== for None check is OK)
    Expected Result: compare_digest found, no == used for key comparison
    Failure Indicators: compare_digest missing, == used for key comparison
    Evidence: .sisyphus/evidence/task-4-security-check.txt
  ```

  **Commit**: YES (grouped with Tasks 2, 3)
  - Message: `feat(backend): add schemas, models, auth, and test documents for RAG pipeline`
  - Files: `backend/app/core/api_key.py`, `backend/app/core/config.py` (modified)
  - Pre-commit: Import validation

- [ ] 5. Complete Next.js Frontend Setup (Deps, Config, Providers)

  **What to do**:
  NOTE: The user has ALREADY scaffolded the Next.js App Router project manually. The `frontend/` directory contains:
  - Next.js 16.1.6 with App Router (`app/` at root, NOT `src/app/`)
  - React 19.2.3, Tailwind CSS v4, shadcn/ui (radix-lyra style, @tabler/icons-react)
  - 13 shadcn/ui components already installed: alert-dialog, badge, button, card, combobox, dropdown-menu, field, input-group, input, label, select, separator, textarea
  - `@` path alias pointing to `./` (root, NOT `./src/`)
  - bun as package manager
  - Dark mode CSS variables configured in `app/globals.css`

  This task ONLY handles the MISSING pieces:

  - Install missing dependencies:
    - `bun add @tanstack/react-query zod ai @ai-sdk/react`
  - Install missing shadcn/ui components needed by later tasks:
    - `bunx --bun shadcn@latest add scroll-area skeleton alert`
    - User already has: button, card, input, select, badge, separator, textarea, combobox, dropdown-menu, field, input-group, label, alert-dialog
  - Create `frontend/components/providers.tsx` â€” TanStack Query provider wrapper:
    - `'use client'` directive at top
    - `const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }))` (SSR-safe pattern)
    - Wrap children in `<QueryClientProvider client={queryClient}>`
    - Export as default
  - Update `frontend/app/layout.tsx`:
    - Import and wrap `{children}` with `<Providers>` component
    - Keep existing font imports and globals.css import
  - Configure Next.js API proxy in `frontend/next.config.ts`:
    - Add `output: 'standalone'` (for Docker)
    - Add rewrites: `{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }` (dev mode)
    - For Docker: use `FASTAPI_URL` env var: `destination: \`${process.env.FASTAPI_URL || 'http://localhost:8000'}/api/:path*\``
  - Verify: `bun run build` exits with code 0

  **Must NOT do**:
  - Do NOT delete the existing `frontend/` directory â€” it is already a working Next.js project
  - Do NOT run `bun create next-app` or `bunx --bun shadcn@latest init` â€” already done by user
  - Do NOT install react-router or any routing library â€” Next.js App Router handles this
  - Do NOT install axios â€” use native fetch via service layer
  - Do NOT install react-markdown â€” plain text display only
  - Do NOT create `tailwind.config.js` â€” Tailwind v4 CSS-first config is already set up
  - Do NOT use Pages Router â€” App Router only
  - Do NOT create an `src/` directory â€” project uses root-level `app/`, `components/`, `lib/`
  - Do NOT reinstall shadcn components that already exist (see list above)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Install 4 npm packages + add 3 shadcn components + create 1 file + edit 2 configs — trivial
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 8 (API service uses TanStack Query), 9 (components use shadcn), 12 (ChatPage needs both)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `frontend/app/layout.tsx` â€” The existing layout file to modify. Currently has Roboto + Geist fonts, `<html lang="en">`, but no Providers wrapper. Add `<Providers>` around `{children}`
  - `frontend/next.config.ts` â€” Currently an empty config object. Add `output: 'standalone'` and `rewrites()` async function
  - `frontend/components.json` â€” shadcn config file (radix-lyra style, tabler icons, `@/` aliases). Confirms shadcn is already initialized
  - `frontend/lib/utils.ts` â€” Existing utility file with `cn()` function

  **External References**:
  - TanStack Query + Next.js: https://tanstack.com/query/latest/docs/framework/react/guides/ssr â€” SSR-safe provider pattern
  - Next.js rewrites: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites â€” API proxy config
  - Next.js standalone output: https://nextjs.org/docs/app/api-reference/config/next-config-js/output â€” Docker optimization

  **WHY Each Reference Matters**:
  - `layout.tsx`: Must wrap children in `<Providers>` for TanStack Query to work app-wide
  - `next.config.ts`: Needs standalone output for Docker + rewrites to proxy API calls to FastAPI backend
  - TanStack Query SSR docs: The provider MUST use `useState(() => new QueryClient())` pattern to avoid shared state across SSR requests

  **Acceptance Criteria**:
  - [ ] `@tanstack/react-query` and `zod` appear in `frontend/package.json` dependencies
  - [ ] shadcn components exist in `frontend/components/ui/`: scroll-area.tsx, skeleton.tsx, alert.tsx (newly added)
  - [ ] `frontend/components/providers.tsx` exports QueryClientProvider wrapper with `'use client'`
  - [ ] `frontend/app/layout.tsx` wraps children in Providers
  - [ ] `frontend/next.config.ts` has `output: 'standalone'` and API rewrites
  - [ ] `bun run build` exits with code 0 (no TypeScript errors)
  - [ ] No `src/` directory exists â€” all paths are root-level
  - [ ] `ai` and `@ai-sdk/react` appear in `frontend/package.json` dependencies (AI SDK v5 packages)

  **QA Scenarios:**

  ```
  Scenario: Next.js project builds successfully with new deps
    Tool: Bash
    Preconditions: Missing deps installed, config updated
    Steps:
      1. cd frontend && bun run build
      2. Assert exit code 0
      3. ls .next/standalone/ â€” assert directory exists (standalone output)
      4. ls components/ui/ â€” assert scroll-area.tsx, skeleton.tsx, alert.tsx exist (newly added)
      5. test ! -d src && echo 'NO_SRC_DIR_OK' â€” assert no src/ directory
    Expected Result: Build succeeds, standalone output generated, new shadcn components present, no src/ dir
    Failure Indicators: Build error, missing .next/standalone, missing component files, src/ directory exists
    Evidence: .sisyphus/evidence/task-5-nextjs-build.txt

  Scenario: TanStack Query provider is wired with SSR-safe pattern
    Tool: Bash (grep)
    Preconditions: providers.tsx and layout.tsx updated
    Steps:
      1. grep "'use client'" frontend/components/providers.tsx â€” assert found
      2. grep 'QueryClientProvider' frontend/components/providers.tsx â€” assert found
      3. grep 'useState' frontend/components/providers.tsx â€” assert found (SSR-safe pattern)
      4. grep 'Providers' frontend/app/layout.tsx â€” assert Providers component is imported and used
    Expected Result: Provider uses 'use client' + useState pattern, layout wraps in Providers
    Failure Indicators: Missing 'use client', missing useState (not SSR-safe), layout doesn't use Providers
    Evidence: .sisyphus/evidence/task-5-query-provider.txt

  Scenario: Next.js API rewrites configured
    Tool: Bash (grep)
    Preconditions: next.config.ts updated
    Steps:
      1. grep 'standalone' frontend/next.config.ts â€” assert found
      2. grep 'rewrites' frontend/next.config.ts â€” assert found
      3. grep 'localhost:8000' frontend/next.config.ts â€” assert found (proxy target)
    Expected Result: Standalone output and API rewrites both configured
    Failure Indicators: Missing standalone, missing rewrites
    Evidence: .sisyphus/evidence/task-5-nextjs-config.txt
  ```

  Scenario: AI SDK packages installed correctly
    Tool: Bash (grep)
    Preconditions: Dependencies installed
    Steps:
      1. grep '"ai"' frontend/package.json — assert found
      2. grep '@ai-sdk/react' frontend/package.json — assert found
      3. grep '@tanstack/react-query' frontend/package.json — assert found
    Expected Result: ai, @ai-sdk/react, and @tanstack/react-query all in package.json
    Failure Indicators: Missing packages
    Evidence: .sisyphus/evidence/task-5-ai-sdk-packages.txt

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-5-{scenario-slug}.txt
  - [ ] Terminal output for build, grep results for config verification

  **Commit**: YES
  - Message: `chore(frontend): add AI SDK, TanStack Query, zod, missing shadcn components, and API proxy config`
  - Files: `frontend/package.json`, `frontend/bun.lock`, `frontend/components/providers.tsx`, `frontend/app/layout.tsx`, `frontend/next.config.ts`, `frontend/components/ui/scroll-area.tsx`, `frontend/components/ui/skeleton.tsx`, `frontend/components/ui/alert.tsx`
  - Pre-commit: `bun run build`
---

- [ ] 6. RAG Service â€” Chunking, Embedding, Retrieval, Generation

  **What to do**:
  - Create `backend/app/services/rag_service.py` with a `RAGService` class:
    - Constructor receives `pg_engine` (PGEngine) and `embeddings` (NVIDIAEmbeddings) as injected dependencies (from app.state)
    - `async def ingest_document(self, tenant_id: str, document_name: str, content: str) -> dict`:
      - Use `RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=300, add_start_index=True)` to chunk content
      - Initialize tenant vectorstore table via `await pg_engine.ainit_vectorstore_table(table_name=f"docs_{tenant_id}", vector_size=1024, metadata_columns=[Column(name="doc_name", data_type="TEXT"), Column(name="tenant_id", data_type="TEXT")])` (idempotent â€” safe to call repeatedly)
      - Create `PGVectorStore` via `await PGVectorStore.create(engine=pg_engine, table_name=f"docs_{tenant_id}", embedding_service=embeddings, metadata_columns=["doc_name", "tenant_id"])`
      - Add documents with metadata `{"doc_name": document_name, "tenant_id": tenant_id}`
      - Return `{"document_id": generated_id, "chunks_created": len(chunks)}`
    - `async def query(self, tenant_id: str, question: str) -> dict`:
      - Create tenant vectorstore via `await PGVectorStore.create(engine=pg_engine, table_name=f"docs_{tenant_id}", embedding_service=embeddings, metadata_columns=["doc_name", "tenant_id"])`
      - Get retriever: `vectorstore.as_retriever(search_kwargs={"k": 4})`
      - Build LCEL chain:
        - `ChatNVIDIA(model=settings.LLM_MODEL, api_key=settings.NVIDIA_API_KEY, max_tokens=1024, temperature=0.1)`
        - Prompt template: system message explaining pharma regulatory assistant role, user message with context + question
        - Use `create_stuff_documents_chain` + `create_retrieval_chain` from langchain.chains
      - Chain invocation is async-native (`await chain.ainvoke(...)`) â€” no `asyncio.to_thread()` needed (PGVectorStore + ChatNVIDIA are both async)
      - Return answer string + list of source documents with content and metadata
    - Handle edge cases: empty collection (no docs ingested yet) returns "I don't have documents for this tenant" gracefully
    - Handle LLM errors: wrap chain.invoke in try/except, return descriptive error on NVIDIA NIM failure
  - Add config values to `backend/app/core/config.py` Settings:
    - `NVIDIA_API_KEY: str = ""` 
    - `LLM_MODEL: str = "meta/llama-3.3-70b-instruct"`
    - `NVIDIA_EMBEDDING_MODEL: str = "nvidia/nv-embedqa-e5-v5"`
    - `NVIDIA_EMBEDDING_MODEL: str = "nvidia/nv-embedqa-e5-v5"`

  **Must NOT do**:
  - Do NOT import from `app.api` â€” service layer cannot depend on endpoint layer
  - Do NOT use deprecated `RetrievalQAChain` or `ConversationalRetrievalChain` â€” LCEL only
  - Do NOT leave `max_tokens` unbounded on ChatNVIDIA
  - Do NOT call LLM synchronously â€” use async chain invocation (`await chain.ainvoke(...)`) throughout
  - Do NOT create a global PGEngine or PGVectorStore â€” receive pg_engine as parameter
  - Do NOT hardcode model names â€” use Settings

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core RAG pipeline â€” complex async orchestration with multiple libraries (LangChain, pgvector/PGVectorStore, NVIDIA NIM). Requires understanding LCEL chain composition, async patterns, and error handling
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Tasks 10 (endpoints call this service), 17 (seed uses ingest)
  - **Blocked By**: Tasks 1 (deps), 2 (test docs), 3 (schemas)

  **References**:

  **Pattern References**:
  - `backend/app/services/user_service.py` â€” Follow this exact class structure: class with constructor accepting dependencies, async methods, type hints. RAGService follows the same pattern but receives pg_engine + embeddings instead of AsyncSession
  - `backend/app/core/config.py` â€” Settings class where new config values (NVIDIA_API_KEY, LLM_MODEL, NVIDIA_EMBEDDING_MODEL) are added. No CHROMA_PERSIST_DIR needed â€” pgvector uses the existing DATABASE_URL

  **API/Type References**:
  - `backend/app/schemas/rag.py:QueryResponse` â€” Return shape the service must produce
  - `backend/app/schemas/rag.py:SourceDocument` â€” Source document structure the service must output

  **External References**:
  - LangChain LCEL QA chain: https://python.langchain.com/v0.2/docs/how_to/qa_sources/ â€” create_retrieval_chain pattern
  - LangChain text splitters: https://python.langchain.com/docs/how_to/recursive_text_splitter/
  - langchain-postgres PGVectorStore: https://github.com/langchain-ai/langchain-postgres â€” PGVectorStore.create(), PGEngine.from_engine(), ainit_vectorstore_table() usage
  - NVIDIA NIM + LangChain: https://python.langchain.com/docs/integrations/chat/nvidia_ai_endpoints/ â€” ChatNVIDIA and NVIDIAEmbeddings usage

  **WHY Each Reference Matters**:
  - `user_service.py`: The class pattern to follow â€” constructor DI, async methods, clean separation. RAGService is the equivalent for RAG operations
  - `config.py`: Where to add NVIDIA_API_KEY, LLM_MODEL, NVIDIA_EMBEDDING_MODEL â€” same pydantic-settings pattern. No CHROMA_PERSIST_DIR needed (uses existing DATABASE_URL)
  - `schemas/rag.py`: The response contracts â€” service must produce data matching these exact types
  - LangChain LCEL docs: The ONLY correct way to compose chains in v0.2+. Do not use any deprecated chain classes

  **Acceptance Criteria**:
  - [ ] `backend/app/services/rag_service.py` exists with `RAGService` class
  - [ ] Has `ingest_document` and `query` async methods
  - [ ] Uses async-native PGVectorStore operations (`await PGVectorStore.create(...)`, `await chain.ainvoke(...)`) â€” no `asyncio.to_thread()` needed
  - [ ] Uses `create_retrieval_chain` or LCEL chain composition (no deprecated chains)
  - [ ] ChatNVIDIA has `max_tokens=1024` (or similar bounded value)
  - [ ] `backend/app/core/config.py` has NVIDIA_API_KEY, LLM_MODEL, NVIDIA_EMBEDDING_MODEL (no CHROMA_PERSIST_DIR â€” uses existing DATABASE_URL)
  - [ ] `uv run python -c "from app.services.rag_service import RAGService; print('OK')"` works

  **QA Scenarios:**

  ```
  Scenario: RAG service imports and instantiates
    Tool: Bash
    Preconditions: All deps installed, service file created
    Steps:
      1. cd backend && uv run python -c "
         from app.services.rag_service import RAGService;
         from app.core.config import settings;
         print(settings.LLM_MODEL);
         print('SERVICE_OK')"
         print('SERVICE_OK')"
      2. Assert output contains SERVICE_OK and model name
    Expected Result: Service imports, config has new fields
    Failure Indicators: ImportError, missing config fields
    Evidence: .sisyphus/evidence/task-6-rag-service.txt

  Scenario: async-native PGVectorStore usage verified
    Tool: Bash (grep)
    Preconditions: rag_service.py created
    Steps:
      1. grep -c 'PGVectorStore.create' backend/app/services/rag_service.py â€” assert count >= 2 (one for ingest, one for query)
      2. grep -c 'ainit_vectorstore_table' backend/app/services/rag_service.py â€” assert count >= 1
      3. grep 'max_tokens' backend/app/services/rag_service.py â€” assert found
      4. grep -c 'asyncio.to_thread' backend/app/services/rag_service.py â€” assert count == 0 (not needed with async-native pgvector)
    Expected Result: PGVectorStore async calls present, max_tokens set, no asyncio.to_thread
    Failure Indicators: 0 PGVectorStore.create calls, missing max_tokens, unexpected asyncio.to_thread
  ```

  **Commit**: YES (grouped with Task 7)
  - Message: `feat(backend): implement RAG service with pgvector and query logging`
  - Files: `backend/app/services/rag_service.py`, `backend/app/core/config.py`
  - Pre-commit: Import validation

- [ ] 7. QueryLog Repository

  **What to do**:
  - Create `backend/app/repositories/query_log_repository.py` with `QueryLogRepository` class:
    - Constructor receives `session: AsyncSession`
    - `async def create(self, tenant_id: str, question: str, answer: str, nb_sources: int, duration_ms: float, success: bool) -> QueryLog`:
      - Create QueryLog instance with all fields
      - `session.add(log)`, `await session.commit()`, `await session.refresh(log)`
      - Return the created log
    - `async def get_metrics(self, tenant_id: str) -> dict`:
      - `select(func.count(QueryLog.id), func.avg(QueryLog.duration_ms)).where(QueryLog.tenant_id == tenant_id)`
      - Return `{"total_queries": count, "avg_response_time_ms": avg or 0.0}`

  **Must NOT do**:
  - Do NOT add raw SQL queries â€” use SQLAlchemy ORM/core only
  - Do NOT modify existing `user_repository.py`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CRUD repository following exact existing pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9)
  - **Blocks**: Task 10 (endpoints use this repository)
  - **Blocked By**: Task 3 (QueryLog model)

  **References**:

  **Pattern References**:
  - `backend/app/repositories/user_repository.py` â€” Follow this EXACT class structure: constructor takes AsyncSession, async methods for CRUD operations, session.add/commit/refresh pattern. QueryLogRepository is the same pattern but for QueryLog model

  **API/Type References**:
  - `backend/app/models/query_log.py:QueryLog` â€” The ORM model this repository operates on
  - `sqlalchemy:func` â€” Used for count/avg aggregation in get_metrics

  **WHY Each Reference Matters**:
  - `user_repository.py`: The EXACT pattern to copy â€” same class shape, same session handling, same commit pattern. The only difference is the model class (QueryLog instead of User) and the specific query methods

  **Acceptance Criteria**:
  - [ ] `backend/app/repositories/query_log_repository.py` exists
  - [ ] Has `create` and `get_metrics` async methods
  - [ ] Uses SQLAlchemy func.count and func.avg for metrics
  - [ ] `uv run python -c "from app.repositories.query_log_repository import QueryLogRepository; print('OK')"` works

  **QA Scenarios:**

  ```
  Scenario: Repository imports correctly
    Tool: Bash
    Preconditions: Repository file created
    Steps:
      1. cd backend && uv run python -c "from app.repositories.query_log_repository import QueryLogRepository; print('REPO_OK')"
      2. Assert output contains REPO_OK
    Expected Result: Module imports without errors
    Failure Indicators: ImportError, syntax error
    Evidence: .sisyphus/evidence/task-7-repo.txt
  ```

  **Commit**: YES (grouped with Task 6)
  - Message: `feat(backend): implement RAG service with pgvector and query logging`
  - Files: `backend/app/repositories/query_log_repository.py`
  - Pre-commit: Import validation

- [ ] 8. Frontend Typed API Service Layer + Types + AI SDK Route Handler

  **What to do**:
  - Create `frontend/types/api.ts` with TypeScript interfaces:
    - `QueryRequest`: `{ question: string }`
    - `SourceDocument`: `{ content: string; metadata: Record<string, string> }`
    - `QueryResponse`: `{ answer: string; sources: SourceDocument[]; tenant_id: string; duration_ms: number }`
    - `IngestResponse`: `{ document_id: string; chunks_created: number; tenant_id: string }`
    - `MetricsResponse`: `{ tenant_id: string; total_queries: number; avg_response_time_ms: number }`
    - NOTE: Do NOT create a `ChatMessage` type for chat rendering — AI SDK provides `UIMessage` from `@ai-sdk/react`. Only create types for non-chat API responses
  - Create `frontend/services/api.ts` with typed API client:
    - `const API_BASE = '/api'` (Next.js rewrites proxy this to FastAPI â€” no VITE_ env vars needed)
    - Helper function `apiFetch<T>(path: string, options: RequestInit & { apiKey: string }): Promise<T>` that:
      - Sets `Content-Type: application/json`
      - Sets `X-API-Key` header from apiKey parameter
      - Calls `fetch(API_BASE + path, ...)`
      - Throws typed error on non-2xx response
    - `queryDocuments(question: string, apiKey: string): Promise<QueryResponse>`
    - `getMetrics(tenantId: string, apiKey: string): Promise<MetricsResponse>`
  - Validate all API responses with Zod schemas (create corresponding Zod schemas in `frontend/types/api.ts` alongside the TS interfaces)
  - Create `frontend/app/api/chat/route.ts` — AI SDK proxy route handler:
    - `export async function POST(req: Request)` handler
    - Parse request body: `const { messages, data } = await req.json()` (AI SDK sends `{ messages, data }` — `data` contains extra body fields from `sendMessage`)
    - Extract the last user message text: `const lastMessage = messages[messages.length - 1]`, then `lastMessage.content` (string)
    - Extract API key: `data.apiKey` (passed from client via `sendMessage({ text }, { body: { apiKey } })`)
    - Call FastAPI backend: `fetch(process.env.FASTAPI_URL || 'http://localhost:8000' + '/api/v1/query', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ question: userText }) })`
    - Parse FastAPI JSON response: `{ answer, sources, tenant_id, duration_ms }`
    - Wrap response in AI SDK streaming format using `createUIMessageStream` + `createUIMessageStreamResponse`:
      ```
      import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: 'text', text: data.answer });
          writer.write({ type: 'data', data: [{ sources: data.sources }] });
        },
      });
      return createUIMessageStreamResponse({ stream });
      ```
    - Handle errors: if FastAPI returns non-2xx, return `Response.json({ error }, { status: 500 })`
    - CRITICAL: Do NOT import any AI SDK model provider (no `streamText`, no `@ai-sdk/nvidia`). This handler only wraps pre-computed JSON in streaming format
  **Must NOT do**:
  - Do NOT use axios â€” native fetch only
  - Do NOT use `any` type â€” all functions fully typed
  - Do NOT put API calls directly in components â€” they go through this service only
  - Do NOT create `hooks/useChat.ts` — AI SDK provides its own `useChat` hook, custom file would cause name collision

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions + thin fetch wrapper â€” straightforward TypeScript
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9)
  - **Blocks**: Tasks 9 (components import types), 12 (ChatPage uses API + route handler)
  - **Blocked By**: Task 5 (needs zod installed)

  **References**:

  **Pattern References**:
  - `frontend/components/ui/button.tsx` â€” TypeScript style reference: explicit prop types, no `any`, functional exports
  - `frontend/lib/utils.ts` â€” Existing utility pattern in the codebase

  **API/Type References**:
  - `backend/app/schemas/rag.py` â€” The backend Pydantic schemas that define the API contract. Frontend types must mirror these exactly

  **External References**:
  - Zod: https://zod.dev/?id=basic-usage — Schema definition and parse/safeParse
  - AI SDK createUIMessageStream: https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream — Streaming response format
  - AI SDK Route Handler pattern: https://ai-sdk.dev/docs/getting-started/nextjs-app-router — Next.js route handler setup

  **WHY Each Reference Matters**:
  - `schemas/rag.py`: The source of truth for API shapes. Frontend TypeScript interfaces + Zod schemas must match these exactly â€” same field names, same types, same optionality
  - `button.tsx`: TypeScript strictness reference â€” no `any`, explicit types, clean exports

  **Acceptance Criteria**:
  - [ ] `frontend/types/api.ts` exists with all interfaces + Zod schemas (no ChatMessage type — AI SDK provides UIMessage)
  - [ ] `frontend/services/api.ts` exists with `getMetrics` (and optionally `queryDocuments` for non-chat uses)
  - [ ] `frontend/app/api/chat/route.ts` exists with POST handler using `createUIMessageStream`
  - [ ] Route handler does NOT import `streamText` or any AI SDK model provider
  - [ ] Route handler calls FastAPI `/api/v1/query` and wraps JSON response
  - [ ] No `any` type in any file
  - [ ] Zod schemas validate response shapes
  - [ ] `bun run build` passes (no TypeScript errors)

  **QA Scenarios:**

  ```
  Scenario: Frontend builds with new types, service, and route handler
    Tool: Bash
    Preconditions: Type, service, and route handler files created
    Steps:
      1. cd frontend && bun run build
      2. Assert exit code 0
      3. grep -r 'any' types/api.ts — assert no matches
      4. grep -r 'any' services/api.ts — assert no matches
      5. test -f app/api/chat/route.ts — assert route handler exists
      6. grep 'createUIMessageStream' app/api/chat/route.ts — assert found
      7. grep 'streamText' app/api/chat/route.ts — assert NOT found
    Expected Result: Build succeeds, zero 'any' types, route handler uses createUIMessageStream not streamText
    Failure Indicators: TypeScript errors, 'any' found, missing route handler, streamText usage
    Evidence: .sisyphus/evidence/task-8-frontend-types.txt

  Scenario: Route handler proxies to FastAPI correctly
    Tool: Bash (curl)
    Preconditions: FastAPI running on :8000 with test data ingested, Next.js dev running on :3000
    Steps:
      1. curl -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"What are GMP guidelines?"}],"data":{"apiKey":"tenant-1-secret-key"}}' --no-buffer
      2. Assert response is chunked/streaming (Transfer-Encoding or content-type includes stream)
      3. Assert response body contains answer text from FastAPI RAG
    Expected Result: Streaming response with answer text from FastAPI RAG
    Failure Indicators: 500 error, empty response, non-streaming response
    Evidence: .sisyphus/evidence/task-8-route-handler-proxy.txt
  ```
  **Commit**: YES (grouped with Task 9)
  - Message: `feat(frontend): add API service layer, types, and AI SDK chat route handler`
  - Files: `frontend/types/api.ts`, `frontend/services/api.ts`, `frontend/app/api/chat/route.ts`
  - Pre-commit: `bun run build`

- [ ] 9. Frontend Chat Feature Components

  **What to do**:
  - Create `frontend/features/chat/` directory with these components:
    - `ChatMessage.tsx` â€” Single message bubble. Props: `message: ChatMessage`. User messages right-aligned with primary bg, assistant messages left-aligned with muted bg. Render text by filtering message.parts for part.type === "text" and displaying part.text. Render sources by filtering parts for part.type === "data-sources" and rendering Badge + content preview. Use `cn()` for conditional styles. Must be < 60 lines
    - `ChatMessageList.tsx` â€” Scrollable message list. Uses shadcn ScrollArea. Maps over messages array, renders ChatMessage for each. Has a `useRef` scroll anchor div at bottom + `useEffect` to scroll on new messages. Shows empty state when no messages ("Ask a question about pharmaceutical regulations"). Must be < 80 lines
    - `ChatInput.tsx` â€” Input field + send button. Uses shadcn Input + existing Button. Props: `onSend: (text: string) => void`, `disabled: boolean` (caller passes status === "streaming" || status === "submitted"). Disable button and input while disabled (prevent double-submit). Submit on Enter key. Clear input after send. Must be < 50 lines
    - `SourcePanel.tsx` â€” Displays sources for the selected/latest message. Uses shadcn Card for each source. Shows doc_name as title, content extract as body. Shows empty state when no sources. Must be < 60 lines
    - `TenantSelector.tsx` â€” Dropdown to switch tenant. Uses shadcn Select. Hardcoded options: Tenant 1 (key: tenant-1-secret-key), Tenant 2 (key: tenant-2-secret-key). Props: `value: string`, `onChange: (tenantKey: string) => void`. Must be < 40 lines
  - Each component MUST have `'use client'` directive at the top (Next.js App Router requirement for interactive components)
  - Use Tailwind CSS for all styling â€” mobile-first, dark mode variants
  - Use `rounded-xl` for cards, `rounded-full` for message bubbles
  - All components functional, typed props, no `any`

  **Must NOT do**:
  - Do NOT build custom modal, dropdown, or input primitives â€” shadcn only
  - Do NOT exceed 150 lines per component (target much lower: 40-80 lines each)
  - Do NOT add routing or navigation
  - Do NOT add user authentication UI
  - Do NOT import fetch/axios directly â€” use the service layer from Task 8

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation with design considerations â€” layout, spacing, dark mode, responsive
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not testing yet, just building components
    - `frontend-ui-ux`: The components are simple chat widgets, not complex design work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 12 (ChatPage assembles these components)
  - **Blocked By**: Tasks 5 (shadcn components), 8 (types for props)

  **References**:

  **Pattern References**:
  - `frontend/components/ui/button.tsx` â€” Component structure: functional, typed props, cn() utility, clean exports
  - `frontend/components/ui/card.tsx` â€” Card component to use in SourcePanel (user already has it)
  - `frontend/components/ui/scroll-area.tsx` (after Task 5 installs it) â€” ScrollArea for ChatMessageList
  - `frontend/components/ui/select.tsx` â€” Select for TenantSelector (user already has it)
  - `frontend/components/ui/input.tsx` â€” Input for ChatInput (user already has it)
  - `frontend/components/ui/skeleton.tsx` (after Task 5 installs it) â€” Loading skeleton
  - `frontend/components/ui/badge.tsx` â€” Source document badges (user already has it)

  **API/Type References**:
  - AI SDK `UIMessage` from `@ai-sdk/react` — The message type used by `useChat`. Components receive `UIMessage` objects with `role`, `parts` array, and `id`. Do NOT import a custom `ChatMessage` type for chat rendering
  - `frontend/types/api.ts:SourceDocument` — Source type with content, metadata (used when extracting sources from data parts)

  **WHY Each Reference Matters**:
  - `button.tsx`: The gold standard for component structure â€” copy this pattern for all new components
  - shadcn components (card, scroll-area, select, input, skeleton, badge): These are the building blocks. Do NOT reinvent any of these â€” import and compose them
  - `types/api.ts`: Provides SourceDocument type for rendering source badges. Chat messages use AI SDK's UIMessage (not a custom type)
  - AI SDK UIMessage: Components receive `message.parts` array — filter by `part.type === 'text'` for text, and check data annotations for sources

  **Acceptance Criteria**:
  - [ ] All 5 component files exist in `frontend/features/chat/`
  - [ ] Each component is < 150 lines (target < 80)
  - [ ] No `any` types in any component
  - [ ] All use shadcn primitives (no custom inputs/buttons/selects)
  - [ ] ChatMessage.tsx uses `message.parts` for rendering (NOT `message.content`)
  - [ ] ChatInput.tsx uses `disabled` prop (NOT `isLoading`) — caller maps AI SDK `status` to boolean
  - [ ] `grep 'message.content' features/chat/ChatMessage.tsx` returns NO matches (parts-based rendering only)
  - [ ] `bun run build` passes

  **QA Scenarios:**

  ```
  Scenario: All chat components exist and build
    Tool: Bash
    Preconditions: Component files created
    Steps:
      1. ls frontend/features/chat/ â€” assert ChatMessage.tsx, ChatMessageList.tsx, ChatInput.tsx, SourcePanel.tsx, TenantSelector.tsx exist
      2. cd frontend && bun run build â€” assert exit code 0
      3. wc -l frontend/features/chat/*.tsx â€” assert each file < 150 lines
    Expected Result: 5 files, all under 150 lines, build passes
    Failure Indicators: Missing files, build errors, oversized components
    Evidence: .sisyphus/evidence/task-9-chat-components.txt
  ```

  **Commit**: YES (grouped with Task 8)
  - Message: `feat(frontend): add API service layer and chat feature components`
  - Files: `frontend/features/chat/*.tsx`
  - Pre-commit: `bun run build`

- [ ] 10. RAG API Endpoints â€” /query, /documents/ingest, /metrics

  **What to do**:
  - Create `backend/app/api/endpoints/rag.py` with 3 endpoints:
    - `POST /query`:
      - Depends: `tenant_id: str = Depends(get_tenant_from_api_key)`, `db: AsyncSession = Depends(get_db)`
      - Request body: `QueryRequest` (question field)
      - Call `RAGService.query(tenant_id, question)` â€” get RAG service from `request.app.state`
      - Measure duration with `time.perf_counter()`
      - Log query via `QueryLogRepository.create(...)` with duration, success, nb_sources
      - Return `QueryResponse` with answer, sources, tenant_id, duration_ms
      - `response_model=QueryResponse`
    - `POST /documents/ingest`:
      - Depends: `tenant_id = Depends(get_tenant_from_api_key)`
      - Accept file upload via `UploadFile` OR JSON body with content string
      - Call `RAGService.ingest_document(tenant_id, filename, content)`
      - Return `IngestResponse` with document_id, chunks_created, tenant_id
      - `response_model=IngestResponse`
    - `GET /metrics/{tenant_id}`:
      - Depends: `api_tenant = Depends(get_tenant_from_api_key)`, `db = Depends(get_db)`
      - Call `QueryLogRepository.get_metrics(tenant_id)` (path param tenant_id)
      - Return `MetricsResponse`
      - `response_model=MetricsResponse`
  - All handlers are THIN â€” delegate to service/repository, handle HTTP concerns only
  - Proper error handling: try/except around service calls, return 500 with detail on LLM failure, 400 on bad input

  **Must NOT do**:
  - Do NOT put business logic in endpoint handlers â€” service layer only
  - Do NOT create global DB sessions â€” use Depends(get_db)
  - Do NOT skip `response_model=` on any endpoint
  - Do NOT access pgvector tables directly â€” go through RAGService

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple endpoints with dependency injection, error handling, and integration of auth + service + repository. Not just CRUD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on multiple Wave 2 tasks)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12)
  - **Blocks**: Tasks 11 (router wiring), 13 (tests), 14 (Docker needs working backend)
  - **Blocked By**: Tasks 4 (API key auth), 6 (RAG service), 7 (QueryLog repo)

  **References**:

  **Pattern References**:
  - `backend/app/api/endpoints/auth.py` â€” EXACT pattern to follow: thin handler, Depends() for deps, response_model, HTTPException for errors. The `register` and `login` endpoints show the correct handler shape
  - `backend/app/api/endpoints/users.py` â€” Shows CRUD endpoint patterns with path params and Depends(get_current_user). The `/metrics/{tenant_id}` endpoint follows this path param pattern

  **API/Type References**:
  - `backend/app/schemas/rag.py` â€” All request/response models for the 3 endpoints
  - `backend/app/core/api_key.py:get_tenant_from_api_key` â€” Auth dependency for all RAG endpoints
  - `backend/app/core/dependencies.py:get_db` â€” DB session dependency (do NOT duplicate, import from here or database.py)
  - `backend/app/services/rag_service.py:RAGService` â€” Service to call for query/ingest
  - `backend/app/repositories/query_log_repository.py:QueryLogRepository` â€” For logging queries and getting metrics

  **WHY Each Reference Matters**:
  - `auth.py`: The gold standard for endpoint structure â€” thin handlers that validate input, call service, return response. Copy this exact pattern: async def, Depends injection, try/except, HTTPException
  - `schemas/rag.py`: The API contract. Every endpoint's request/response must use these exact types
  - `api_key.py`: Every RAG endpoint depends on this â€” injects tenant_id automatically from the X-API-Key header

  **Acceptance Criteria**:
  - [ ] `backend/app/api/endpoints/rag.py` exists with 3 endpoints
  - [ ] All endpoints have `response_model=` parameter
  - [ ] All endpoints use `Depends(get_tenant_from_api_key)` for auth
  - [ ] POST /query logs the request via QueryLogRepository
  - [ ] Handlers are < 30 lines each (thin delegation)
  - [ ] `uv run python -c "from app.api.endpoints.rag import router; print(len(router.routes))"` shows 3 routes

  **QA Scenarios:**

  ```
  Scenario: Endpoint module imports and has 3 routes
    Tool: Bash
    Preconditions: rag.py created with all 3 endpoints
    Steps:
      1. cd backend && uv run python -c "from app.api.endpoints.rag import router; print(f'ROUTES={len(router.routes)}')"
      2. Assert output contains ROUTES=3
    Expected Result: 3 routes registered on the router
    Failure Indicators: ImportError, wrong route count
    Evidence: .sisyphus/evidence/task-10-endpoints.txt

  Scenario: Endpoint handlers are thin (< 30 lines each)
    Tool: Bash
    Preconditions: rag.py created
    Steps:
      1. wc -l backend/app/api/endpoints/rag.py â€” assert < 150 lines total for 3 endpoints
    Expected Result: File is < 150 lines (thin handlers + imports)
    Failure Indicators: > 150 lines means business logic leaked into handlers
    Evidence: .sisyphus/evidence/task-10-handler-size.txt
  ```

  **Commit**: YES (grouped with Task 11)
  - Message: `feat(backend): add RAG endpoints and wire router with lifespan init`
  - Files: `backend/app/api/endpoints/rag.py`
  - Pre-commit: Import validation

- [ ] 11. Wire Router + Lifespan Initialization

  **What to do**:
  - Modify `backend/app/api/router.py`:
    - Import rag router from `app.api.endpoints.rag`
    - Add `api_router.include_router(rag_router, prefix="", tags=["RAG"])` (endpoints already have their own paths)
  - Modify `backend/app/main.py` lifespan function:
    - Import `PGEngine` from `langchain_postgres`
    - Import `langchain_nvidia_ai_endpoints.NVIDIAEmbeddings`
    - Import `RAGService` from services
    - In lifespan startup (before `yield`):
      - Create `pg_engine = PGEngine.from_engine(engine=async_engine)` (reuses the existing async SQLAlchemy engine from `database.py` â€” no second connection pool)
      - Create `embeddings = NVIDIAEmbeddings(model=settings.NVIDIA_EMBEDDING_MODEL)` â€” cloud API call, no local model download needed
      - Create `rag_service = RAGService(pg_engine=pg_engine, embeddings=embeddings)`
      - Store on `app.state`: `app.state.rag_service = rag_service`, `app.state.pg_engine = pg_engine`
    - In lifespan shutdown (after `yield`): no special cleanup needed (PGEngine reuses existing engine lifecycle)
  - Ensure `Base.metadata.create_all` in lifespan picks up QueryLog model (verify import chain)

  **Must NOT do**:
  - Do NOT remove existing lifespan code (DB table creation, existing setup)
  - Do NOT remove existing router includes (auth, users)
  - Do NOT create global singletons â€” use lifespan + app.state only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small edits to 2 existing files â€” add imports and a few lines
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 10)
  - **Parallel Group**: Wave 3 (with Tasks 10, 12)
  - **Blocks**: Tasks 13 (tests need running server), 14 (Docker), 15 (docs), 16 (README), 17 (seed)
  - **Blocked By**: Task 10 (endpoints must exist before wiring)

  **References**:

  **Pattern References**:
  - `backend/app/api/router.py` â€” The file to modify. Currently includes auth and users routers. Add rag router in the same pattern
  - `backend/app/main.py` â€” The lifespan function to modify. Currently creates DB tables. Add PGEngine + embeddings initialization in the same function

  **API/Type References**:
  - `backend/app/core/config.py:settings` â€” NVIDIA_EMBEDDING_MODEL setting. No CHROMA_PERSIST_DIR needed (pgvector uses existing DATABASE_URL)
  - `backend/app/services/rag_service.py:RAGService` â€” The service to instantiate and store on app.state

  **WHY Each Reference Matters**:
  - `router.py`: The existing include_router pattern to follow â€” add one more line for the rag router
  - `main.py`: The lifespan function where singletons (PGEngine, embeddings) must be initialized. Putting them here ensures they're created once and shared across all requests. NVIDIAEmbeddings is API-based (no model download). PGEngine wraps the existing async engine

  **Acceptance Criteria**:
  - [ ] `backend/app/api/router.py` includes rag router
  - [ ] `backend/app/main.py` lifespan initializes PGEngine (from existing async engine) + NVIDIAEmbeddings + RAGService
  - [ ] Singletons stored on `app.state` (not global variables)
  - [ ] Server starts without errors: `uv run uvicorn app.main:app --port 8000`
  - [ ] Health check works: `curl http://localhost:8000/health` returns 200

  **QA Scenarios:**

  ```
  Scenario: Server starts and health check passes
    Tool: Bash
    Preconditions: Router wired, lifespan updated
    Steps:
      1. cd backend && timeout 60 uv run uvicorn app.main:app --port 8000 &
      2. sleep 10 (NVIDIA embeddings are API-based, no model download needed)
      3. curl -s http://localhost:8000/health
      4. Assert response contains 'ok' or 'healthy'
      5. curl -s http://localhost:8000/docs â€” assert 200 (Swagger UI loads)
      6. Kill the uvicorn process
    Expected Result: Server starts, health returns OK, Swagger has RAG endpoints
    Failure Indicators: Startup crash, import errors, health check fails
    Evidence: .sisyphus/evidence/task-11-server-start.txt

  Scenario: RAG routes appear in OpenAPI spec
    Tool: Bash
    Preconditions: Server running
    Steps:
      1. curl -s http://localhost:8000/openapi.json | python -m json.tool | grep '/api/query\|/api/documents\|/api/metrics'
      2. Assert all 3 RAG paths appear
    Expected Result: /api/query, /api/documents/ingest, /api/metrics/{tenant_id} in spec
    Failure Indicators: Missing routes in OpenAPI
    Evidence: .sisyphus/evidence/task-11-openapi.txt
  ```

  **Commit**: YES (grouped with Task 10)
  - Message: `feat(backend): add RAG endpoints and wire router with lifespan init`
  - Files: `backend/app/api/router.py`, `backend/app/main.py`
  - Pre-commit: Server start test

- [ ] 12. Frontend ChatPage Assembly + AI SDK Chat Integration

  **What to do**:
  - IMPORTANT: All interactive components MUST have `'use client'` directive at the top of the file (Next.js App Router requirement)
  - Do NOT create `frontend/hooks/useChat.ts` — AI SDK provides its own `useChat` hook from `@ai-sdk/react`. Creating a custom one causes a name collision
  - Create `frontend/features/chat/ChatPage.tsx` (with `'use client'` directive):
    - The main page layout component — assembles all chat components
    - Uses AI SDK's `useChat` hook from `@ai-sdk/react` for all chat state and streaming:
      ```typescript
      import { useChat } from '@ai-sdk/react';
      import { DefaultChatTransport } from 'ai';

      const transport = new DefaultChatTransport({ api: '/api/chat' });
      const { messages, sendMessage, status, error, setMessages } = useChat({ transport });
      ```
    - Tenant key state: `const [tenantKey, setTenantKey] = useState('tenant-1-secret-key')`
    - Send handler: `sendMessage({ text: inputText }, { body: { apiKey: tenantKey } })` — passes tenant API key in request body
    - Status handling: `status` field returns `'ready' | 'submitted' | 'streaming' | 'error'`
      - Show loading/streaming indicator when `status === 'submitted' || status === 'streaming'`
      - Pass `disabled={status !== 'ready'}` to ChatInput
    - Source extraction from messages: for the latest assistant message, check `message.parts` for data annotations containing sources
    - Layout: full-height flex column
      - Header bar with app title ("Pharma AI Regulatory Assistant") + TenantSelector
      - Main area: ChatMessageList (takes 2/3 width on desktop) + SourcePanel (1/3 width, hidden on mobile)
      - Footer: ChatInput
    - Loading state: Skeleton component shown in message list while `status === 'submitted'`
    - Streaming state: Show streaming indicator (pulsing dot or skeleton) while `status === 'streaming'`
    - Error state: Alert component shown when `error` is truthy or `status === 'error'`
    - Empty state: Centered message "Ask a question about pharmaceutical regulations"
    - On tenant switch: `setMessages([])` to clear chat history (different tenant = different data)
    - Responsive: stack vertically on mobile (< 768px), side-by-side on desktop
    - Dark mode: `dark:` Tailwind variants on all custom styles
  - Wire into App Router page `frontend/app/page.tsx`:
    - Import and render `<ChatPage />` as the page content
    - This is the Next.js App Router entry point

  **Must NOT do**:
  - Do NOT create `hooks/useChat.ts` — use AI SDK's `useChat` directly from `@ai-sdk/react`
  - Do NOT use `useMutation` from TanStack Query for chat — AI SDK handles chat state and streaming
  - Do NOT use `message.content` for rendering — use `message.parts` array
  - Do NOT add next/navigation routing — single page only
  - Do NOT store chat messages in useState — AI SDK's `useChat` manages messages internally
  - Do NOT add login/register UI
  - Do NOT add file upload UI
  - Do NOT exceed 150 lines in ChatPage (decompose if needed)
  - Do NOT use `isLoading` — use `status` field from AI SDK

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Full page assembly with responsive layout, dark mode, state management, and component composition. Design decisions involved
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Page layout design, spacing, responsive breakpoints, visual hierarchy
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not testing yet, building the page

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 10, 11 in Wave 3)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: Final QA (F3)
  - **Blocked By**: Tasks 8 (API service + route handler), 9 (chat components)

  **References**:

  **Pattern References**:
  - `frontend/features/chat/ChatMessage.tsx` (Task 9) — Component to compose in ChatMessageList
  - `frontend/features/chat/ChatInput.tsx` (Task 9) — Input component with `disabled` prop
  - `frontend/features/chat/SourcePanel.tsx` (Task 9) — Source display panel
  - `frontend/features/chat/TenantSelector.tsx` (Task 9) — Tenant dropdown
  - `frontend/app/api/chat/route.ts` (Task 8) — The AI SDK route handler that ChatPage's `useChat` will call via `/api/chat`
  - `frontend/app/page.tsx` — The App Router page entry point to render ChatPage in

  **External References**:
  - AI SDK useChat: https://ai-sdk.dev/docs/reference/ai-sdk-react/use-chat — useChat hook API (transport, sendMessage, status, messages, parts)
  - AI SDK DefaultChatTransport: https://ai-sdk.dev/docs/reference/ai-sdk-ui/default-chat-transport — Transport configuration for route handler
  - AI SDK message parts: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-display — Rendering message.parts (text, data, etc.)

  **WHY Each Reference Matters**:
  - Chat components (Task 9): These are the building blocks — ChatPage composes them into a full page layout
  - `app/api/chat/route.ts` (Task 8): The route handler at `/api/chat` that `DefaultChatTransport({ api: '/api/chat' })` targets. ChatPage does NOT call FastAPI directly
  - AI SDK docs: Critical for correct `useChat` usage — v5 uses `transport` not `api`, `sendMessage` not `append`, `status` not `isLoading`, `message.parts` not `message.content`
  - `page.tsx`: The Next.js App Router entry point — render ChatPage here

  **Acceptance Criteria**:
  - [ ] `frontend/hooks/useChat.ts` does NOT exist (no custom hook — use AI SDK's useChat)
  - [ ] `frontend/features/chat/ChatPage.tsx` exists, < 150 lines
  - [ ] `frontend/app/page.tsx` renders ChatPage
  - [ ] `grep "from '@ai-sdk/react'" features/chat/ChatPage.tsx` confirms AI SDK import
  - [ ] `grep 'sendMessage' features/chat/ChatPage.tsx` confirms AI SDK send (not custom)
  - [ ] `grep 'useMutation' features/chat/ChatPage.tsx` returns NO matches (AI SDK, not TanStack)
  - [ ] `grep 'DefaultChatTransport' features/chat/ChatPage.tsx` confirms transport usage
  - [ ] `grep 'status' features/chat/ChatPage.tsx` confirms status-based loading (not isLoading)
  - [ ] `bun run build` passes
  - [ ] No `any` types

  **QA Scenarios:**

  ```
  Scenario: Frontend builds and renders chat page with AI SDK
    Tool: Bash
    Preconditions: All frontend components created, AI SDK packages installed
    Steps:
      1. cd frontend && bun run build — assert exit code 0
      2. wc -l features/chat/ChatPage.tsx — assert < 150 lines
      3. grep "from '@ai-sdk/react'" features/chat/ChatPage.tsx — assert found
      4. grep 'sendMessage' features/chat/ChatPage.tsx — assert found
      5. grep 'useMutation' features/chat/ChatPage.tsx — assert NOT found
      6. grep 'DefaultChatTransport' features/chat/ChatPage.tsx — assert found
      7. test ! -f hooks/useChat.ts — assert custom hook does NOT exist
      8. grep 'ChatPage' app/page.tsx — assert ChatPage is imported and rendered
    Expected Result: Build succeeds, AI SDK patterns used, no TanStack useMutation, no custom useChat hook
    Failure Indicators: Build errors, useMutation found, custom useChat.ts exists, missing AI SDK imports
    Evidence: .sisyphus/evidence/task-12-chatpage.txt

  Scenario: Chat page renders in browser with all elements
    Tool: Playwright (playwright skill)
    Preconditions: Frontend dev server running on port 3000
    Steps:
      1. Navigate to http://localhost:3000
      2. Assert element with text 'Pharma AI' or 'Regulatory Assistant' is visible
      3. Assert a text input or textarea for chat is visible
      4. Assert a send button is visible
      5. Assert tenant selector (dropdown/select) is visible
      6. Screenshot the page
    Expected Result: Chat interface renders with input, send button, tenant selector
    Failure Indicators: Blank page, missing elements, React error overlay
    Evidence: .sisyphus/evidence/task-12-chat-screenshot.png

  Scenario: Streaming chat works end-to-end
    Tool: Playwright (playwright skill)
    Preconditions: FastAPI + Next.js both running, test document ingested for tenant-1
    Steps:
      1. Navigate to http://localhost:3000
      2. Wait for page to load (assert input visible)
      3. Type 'What are GMP guidelines?' into the chat input
      4. Click send button
      5. Wait up to 30s for assistant message to appear
      6. Assert assistant message contains text (non-empty response)
      7. Assert no error alert is visible
      8. Screenshot the page with the response
    Expected Result: User message appears, then assistant message streams in with answer text
    Failure Indicators: Error alert, no response after 30s, empty assistant message
    Evidence: .sisyphus/evidence/task-12-streaming-chat.png
  ```

  **Commit**: YES
  - Message: `feat(frontend): assemble chat page with AI SDK streaming integration`
  - Files: `frontend/features/chat/ChatPage.tsx`, `frontend/app/page.tsx`
  - Pre-commit: `bun run build`
- [ ] 13. Pytest Tests â€” RAG Pipeline + Tenant Isolation

  **What to do**:
  - Create `backend/tests/test_rag.py` with at least 3 tests:
    - **Test 1: Document ingestion creates chunks** â€” Call POST /api/documents/ingest with a test API key and a small text content. Assert 200 response, chunks_created > 0, correct tenant_id in response
    - **Test 2: Query returns answer with sources** â€” After ingesting a document for tenant-1, call POST /api/query with a relevant question. Assert 200, answer is non-empty string, sources is a list with >= 1 item, each source has content and metadata
    - **Test 3: Tenant isolation** â€” Ingest a document for tenant-1. Query with tenant-2 API key about the same topic. Assert sources list is empty (tenant-2 has no documents)
  - Tests must mock the LLM call (do NOT depend on NVIDIA NIM API availability):
    - Use `unittest.mock.patch` to mock `ChatNVIDIA` or the chain.invoke call
    - Mock should return a predictable answer string
    - pgvector operations should be REAL (use the test database with a unique table name via `pg_engine.ainit_vectorstore_table(table_name=f"docs_test_{uuid}", ...)`)
  - Add a `pg_engine` pytest fixture in `conftest.py`:
    - Creates a `PGEngine.from_engine(engine=test_async_engine)` (reusing the test engine)
    - Initializes a test vectorstore table: `await pg_engine.ainit_vectorstore_table(table_name="docs_test", vector_size=1024, metadata_columns=[...])`
    - Creates `NVIDIAEmbeddings` mock or a lightweight fake embeddings (real NVIDIA API calls in tests are acceptable if NVIDIA_API_KEY is set, but must also work without it via mock)
    - Creates `RAGService(pg_engine, embeddings)` and stores on test app.state
  - Follow the existing test pattern in `conftest.py` (AsyncClient, ASGI transport, dependency overrides)

  **Must NOT do**:
  - Do NOT make real NVIDIA NIM API calls in tests â€” mock the LLM (embeddings can optionally use real API if key is set, but must fallback to mock)
  - Do NOT modify existing test files (conftest.py should be APPENDED to, not rewritten)
  - Do NOT skip async test markers â€” use `@pytest.mark.asyncio`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex async test setup with mocking LLM, real pgvector fixtures, dependency overrides, and multi-step test scenarios
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15, 16, 17)
  - **Blocks**: Final verification (F1-F4)
  - **Blocked By**: Task 11 (needs working server)

  **References**:

  **Pattern References**:
  - `backend/tests/conftest.py` â€” The EXISTING test infrastructure. Follow this EXACT pattern: `engine_test`, `override_get_db`, `client` fixture via `AsyncClient(transport=ASGITransport(app=app))`. Add pgvector/PGEngine fixtures in the SAME style
  - `backend/tests/` â€” Check for any existing test files to understand assertion style

  **API/Type References**:
  - `backend/app/api/endpoints/rag.py` â€” The endpoints being tested
  - `backend/app/schemas/rag.py` â€” Expected response shapes to assert against
  - `backend/app/core/api_key.py:TENANT_API_KEYS` â€” The test API keys to use in X-API-Key header

  **External References**:
  - pytest-asyncio: https://pytest-asyncio.readthedocs.io/en/latest/
  - unittest.mock.patch for async: use `AsyncMock` for async functions

  **WHY Each Reference Matters**:
  - `conftest.py`: The test DB setup, client fixture, and dependency override pattern. New tests MUST use the existing `client` fixture and follow the same async/await test pattern
  - `api_key.py:TENANT_API_KEYS`: Need the actual key strings to set in X-API-Key header during tests
  - `schemas/rag.py`: The response shapes to validate in assertions

  **Acceptance Criteria**:
  - [ ] `backend/tests/test_rag.py` exists with >= 3 test functions
  - [ ] LLM calls are mocked (no real NVIDIA NIM API dependency)
  - [ ] pgvector uses isolated test table (cleaned up per test)
  - [ ] `uv run pytest tests/test_rag.py -v` passes with >= 3 tests, 0 failures

  **QA Scenarios:**

  ```
  Scenario: All RAG tests pass
    Tool: Bash
    Preconditions: Server code complete, test file created
    Steps:
      1. cd backend && uv run pytest tests/test_rag.py -v
      2. Assert exit code 0
      3. Assert output contains '3 passed' (or more)
      4. Assert output does NOT contain 'FAILED' or 'ERROR'
    Expected Result: >= 3 tests pass, 0 failures
    Failure Indicators: Test failures, import errors, fixture issues
    Evidence: .sisyphus/evidence/task-13-pytest.txt

  Scenario: Tests don't depend on NVIDIA API
    Tool: Bash (grep)
    Preconditions: test_rag.py created
    Steps:
      1. grep -c 'mock\|patch\|Mock' backend/tests/test_rag.py â€” assert >= 1
      2. Verify no NVIDIA_API_KEY is required to run tests (env var can be empty)
    Expected Result: Tests use mocking, don't need real API key
    Failure Indicators: Tests fail without NVIDIA_API_KEY set
    Evidence: .sisyphus/evidence/task-13-mock-check.txt
  ```

  **Commit**: YES
  - Message: `test(backend): add RAG pipeline and tenant isolation tests`
  - Files: `backend/tests/test_rag.py`, `backend/tests/conftest.py` (appended)
  - Pre-commit: `uv run pytest tests/ -v`

- [ ] 14. Dockerfiles + docker-compose.yml

  **What to do**:
  - Create `backend/Dockerfile`:
    - Base: `python:3.12-slim`
    - Install uv: `pip install uv`
    - Copy pyproject.toml + uv.lock, run `uv sync --frozen`
    - Copy app code
    - NO embedding model pre-download needed (NVIDIA NIM embeddings are cloud API-based)
    - Expose port 8000
    - CMD: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - Create `frontend/Dockerfile` (Next.js standalone 3-stage build):
    - Stage 1 (deps): `node:20-alpine`, install bun globally, copy package.json + bun.lock, `bun install --frozen-lockfile`
    - Stage 2 (build): Copy deps from stage 1, copy source, set `NEXT_TELEMETRY_DISABLED=1`, `bun run build`
    - Stage 3 (run): `node:20-alpine`, create non-root user `nextjs`, copy `.next/standalone` + `.next/static` + `public` from build stage. Set `HOSTNAME=0.0.0.0` and `PORT=3000`. CMD `node server.js`
    - Requires `output: 'standalone'` in `next.config.ts` (set in Task 5)
    - NO nginx needed â€” Next.js standalone includes its own server
  - Create `docker-compose.yml` at project root:
    - Services:
      - `db`: `postgres:16-alpine`, volume for data, env vars for user/password/db
      - `backend`: build from `./backend`, depends_on db, env vars from .env, port 8000
      - `frontend`: build from `./frontend`, depends_on backend, port 3000, env var `FASTAPI_URL=http://backend:8000` for API proxy rewrites
    - Named volumes: `postgres_data`
    - Network: default bridge

  **Must NOT do**:
  - Do NOT add CI/CD pipeline or GitHub Actions
  - Do NOT use docker-compose version key (deprecated in v2+)
  - Do NOT expose PostgreSQL port to host (internal only)
  - Do NOT hardcode secrets in docker-compose â€” use .env file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-service Docker setup with Next.js standalone build, uv-based backend, and service orchestration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 15, 16, 17)
  - **Blocks**: Task 16 (README references Docker commands)
  - **Blocked By**: Task 11 (needs working backend to test)

  **References**:

  **Pattern References**:
  - `backend/pyproject.toml` â€” Python version and dependency list for Dockerfile
  - `frontend/package.json` â€” Build script name for frontend Dockerfile

  **API/Type References**:
  - `backend/app/core/config.py` â€” All env vars the backend needs (DATABASE_URL, NVIDIA_API_KEY, etc.)

  **External References**:
  - Docker multi-stage: https://docs.docker.com/build/building/multi-stage/
  - uv in Docker: https://docs.astral.sh/uv/guides/integration/docker/

  **WHY Each Reference Matters**:
  - `pyproject.toml`: Python version constraint (3.12+) determines base image. Dependencies determine build time
  - `config.py`: Every env var needed must be listed in docker-compose environment section or .env file

  **Acceptance Criteria**:
  - [ ] `backend/Dockerfile` exists and builds: `docker build -t pharma-backend ./backend`
  - [ ] `frontend/Dockerfile` exists and builds: `docker build -t pharma-frontend ./frontend`
  - [ ] `docker-compose.yml` exists at project root
  - [ ] `docker compose config` validates without errors
  - [ ] Frontend container uses Next.js standalone (no nginx)

  **QA Scenarios:**

  ```
  Scenario: Docker compose config validates
    Tool: Bash
    Preconditions: All Docker files created
    Steps:
      1. cd project root && docker compose config
      2. Assert exit code 0
      3. Assert output contains services: db, backend, frontend
    Expected Result: Config validates, 3 services defined
    Failure Indicators: Syntax errors, missing services
    Evidence: .sisyphus/evidence/task-14-docker-config.txt

  Scenario: Docker compose builds all services
    Tool: Bash
    Preconditions: Docker files created, docker daemon running
    Steps:
      1. docker compose build --no-cache 2>&1
      2. Assert exit code 0 for all 3 services
    Expected Result: All images build successfully
    Failure Indicators: Build failures, missing dependencies
    Evidence: .sisyphus/evidence/task-14-docker-build.txt
  ```

  **Commit**: YES (grouped with Tasks 15, 16, 17)
  - Message: `feat: add Docker deployment, docs, and startup seed`
  - Files: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`
  - Pre-commit: `docker compose config`

- [ ] 15. ARCHITECTURE.md

  **What to do**:
  - Create `docs/ARCHITECTURE.md` (the test rubric says `/docs` structure) with these sections:
    - **Overview**: High-level description of the system â€” RAG-based pharma regulatory assistant
    - **System Architecture**: Diagram (ASCII or text description) showing frontend â†’ API â†’ RAG service â†’ pgvector/LLM flow
    - **Backend Architecture**:
      - Layered pattern: endpoints â†’ services â†’ repositories
      - Why FastAPI: async, OpenAPI auto-docs, dependency injection
      - Why LangChain LCEL: modern chain composition, not deprecated patterns
      - Why pgvector on PostgreSQL: production-grade vector storage, reuses existing NeonDB database, table-per-tenant hard isolation, async-native via langchain-postgres PGVectorStore
      - Why NVIDIA NIM: unified LLM + embeddings provider, OpenAI-compatible API, enterprise-grade throughput
      - Why cloud embeddings (NVIDIAEmbeddings): eliminates local model downloads, consistent with LLM provider
    - **Multi-Tenant Strategy**:
      - Table-per-tenant isolation in pgvector (`docs_{tenant_id}` tables)
      - Why not metadata filtering: data leakage risk
      - API key auth with timing-safe comparison
    - **Frontend Architecture**:
      - Next.js App Router with `app/` structure (root-level, no `src/` prefix)
      - Feature-based component organization under `features/`
      - shadcn/ui for primitives
      - Vercel AI SDK v5 (`ai@^5.0.0`, `@ai-sdk/react@^2.0.0`) for streaming chat UX:
        - `useChat` hook from `@ai-sdk/react` manages chat state, messages, and streaming
        - `DefaultChatTransport` connects to Next.js `app/api/chat/route.ts` route handler
        - Route handler proxies to FastAPI and wraps JSON response in `createUIMessageStream`
        - Messages rendered via `message.parts` array (not `message.content`)
      - TanStack Query for non-chat server state (metrics endpoint)
      - API proxy via Next.js rewrites for non-chat API calls (no CORS issues)
      - No client-side routing (single page scope)
    - **Data Flow**: Step-by-step query flow from user input to displayed answer
    - **Security Considerations**: API key auth, secrets.compare_digest, CORS, no PII logging
    - **Trade-offs and Limitations**: What was intentionally excluded and why
    - **Improvement Proposals** (Part 4 bonus):
      - True LLM streaming via FastAPI SSE + AI SDK streamText direct (current proxy simulates streaming from JSON batch response)
      - PDF/DOCX parsing with unstructured.io
      - Conversation memory with session-based history
      - Hybrid search (dense + sparse retrieval)
      - Fine-tuned embedding model for pharma domain
      - Rate limiting + quota management per tenant
      - Observability: LLM call tracing with LangSmith
  - Content should be substantive (>80 lines), technical, and demonstrate deep understanding
  - Write in English (test says French or English accepted)

  **Must NOT do**:
  - Do NOT write generic placeholder content â€” every section must be specific to this project
  - Do NOT include implementation code snippets longer than 5 lines
  - Do NOT exceed 200 lines (concise but complete)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation requiring clear explanation of architecture decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14, 16, 17)
  - **Blocks**: Final verification (F1)
  - **Blocked By**: Task 11 (needs full picture of implemented system)

  **References**:

  **Pattern References**:
  - All backend files â€” Document the actual architecture as built
  - `backend/app/services/rag_service.py` â€” Core RAG pipeline to describe
  - `backend/app/core/api_key.py` â€” Auth mechanism to document

  **WHY Each Reference Matters**:
  - The ARCHITECTURE.md must accurately describe what was ACTUALLY built, not aspirational design. Read the real code to write accurate descriptions

  **Acceptance Criteria**:
  - [ ] `docs/ARCHITECTURE.md` exists
  - [ ] > 80 lines of substantive content
  - [ ] Contains sections: Overview, Backend, Multi-Tenant, Frontend, Trade-offs, Improvements
  - [ ] Improvement proposals section has >= 5 concrete proposals

  **QA Scenarios:**

  ```
  Scenario: ARCHITECTURE.md exists with required sections
    Tool: Bash
    Preconditions: File created
    Steps:
      1. wc -l docs/ARCHITECTURE.md â€” assert > 80
      2. grep -c 'Overview\|Backend\|Frontend\|Multi-Tenant\|Trade-off\|Improvement' docs/ARCHITECTURE.md â€” assert >= 5
    Expected Result: File has > 80 lines and all required sections
    Failure Indicators: Too short, missing sections
    Evidence: .sisyphus/evidence/task-15-architecture.txt
  ```

  **Commit**: YES (grouped with Tasks 14, 16, 17)
  - Message: `feat: add Docker deployment, docs, and startup seed`
  - Files: `docs/ARCHITECTURE.md`
  - Pre-commit: â€”

- [ ] 16. Update README.md + .env.example

  **What to do**:
  - Rewrite `README.md` at project root for the evaluator:
    - **Title**: Pharma AI Regulatory Assistant
    - **Quick Start** (most important section â€” evaluator reads this first):
      - Clone repo
      - Copy `.env.example` to `.env`, add NVIDIA_API_KEY
      - `docker compose up --build -d`
      - Open http://localhost:3000 (frontend) or http://localhost:8000/docs (Swagger)
    - **Local Development** (without Docker):
      - Backend: `cd backend && uv sync && uv run uvicorn app.main:app --reload`
      - Frontend: `cd frontend && bun install && bun dev`
    - **API Endpoints** table: method, URL, auth, description for all endpoints
    - **Test API Keys**: List the hardcoded tenant keys for testing
    - **Running Tests**: `cd backend && uv run pytest tests/ -v`
    - **Project Structure**: Brief directory tree
    - **Tech Stack** table
  - Update `backend/.env.example`:
    - Add: `NVIDIA_API_KEY=nvapi-your-nvidia-api-key-here`
    - Add: `LLM_MODEL=meta/llama-3.3-70b-instruct`
    - REMOVE: `CHROMA_PERSIST_DIR=./chroma_data` (no longer needed â€” pgvector uses existing DATABASE_URL)
    - Add: `NVIDIA_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5`
    - Keep existing DATABASE_URL, SECRET_KEY vars
  - Also create a root-level `.env.example` for docker-compose that includes all vars

  **Must NOT do**:
  - Do NOT include real API keys or credentials
  - Do NOT write in French (English is safer for international evaluation)
  - Do NOT make the README > 200 lines (concise and scannable)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing with clear structure for a technical evaluator
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14, 15, 17)
  - **Blocks**: Final verification
  - **Blocked By**: Task 14 (Docker commands referenced in README)

  **References**:

  **Pattern References**:
  - `README.md` (existing) â€” Current README to REPLACE (not append). Keep the spirit but rewrite for the RAG project
  - `backend/.env.example` (existing) â€” Current env example to EXTEND with new variables

  **API/Type References**:
  - `backend/app/core/config.py` â€” All settings that need env vars
  - `backend/app/core/api_key.py:TENANT_API_KEYS` â€” Test API keys to document

  **WHY Each Reference Matters**:
  - Current `README.md`: Must be replaced, not appended. The new README serves the evaluator, not the original developer
  - `config.py` + `api_key.py`: Source of truth for env vars and test keys that must be documented

  **Acceptance Criteria**:
  - [ ] `README.md` at project root is updated with RAG project info
  - [ ] Quick Start section with Docker commands
  - [ ] Test API keys listed
  - [ ] `backend/.env.example` has all 3 new vars (NVIDIA_API_KEY, LLM_MODEL, NVIDIA_EMBEDDING_MODEL) and does NOT have CHROMA_PERSIST_DIR
  - [ ] Root `.env.example` exists for docker-compose

  **QA Scenarios:**

  ```
  Scenario: README has required sections
    Tool: Bash
    Preconditions: README rewritten
    Steps:
      1. grep -c 'Quick Start\|Docker\|API.*Key\|endpoint\|pytest' README.md â€” assert >= 3
      2. grep 'NVIDIA_API_KEY' backend/.env.example â€” assert found
      3. grep -v 'CHROMA_PERSIST_DIR' backend/.env.example â€” assert CHROMA_PERSIST_DIR is NOT present (pgvector uses DATABASE_URL)
    Expected Result: README has key sections, .env.example has all vars
    Failure Indicators: Missing sections, missing env vars
    Evidence: .sisyphus/evidence/task-16-readme.txt
  ```

  **Commit**: YES (grouped with Tasks 14, 15, 17)
  - Message: `feat: add Docker deployment, docs, and startup seed`
  - Files: `README.md`, `backend/.env.example`, `.env.example`
  - Pre-commit: â€”

- [ ] 17. Pre-seed Tenant Documents on Startup

  **What to do**:
  - Add a startup seed function in `backend/app/main.py` lifespan (after RAGService init):
    - Check if tenant-1 collection already has documents (skip if already seeded)
    - Read the 3 TXT files from `backend/test_docs/`
    - Ingest each into tenant-1's collection via `rag_service.ingest_document()`
    - This ensures the evaluator has documents available immediately without manual ingestion
  - The seed should be idempotent â€” running the server multiple times doesn't duplicate documents
  - Log the seeding action: `logger.info("Seeded N documents for tenant-1")`

  **Must NOT do**:
  - Do NOT seed documents for all tenants â€” only tenant-1 (so tenant isolation test works)
  - Do NOT block startup if seed fails â€” wrap in try/except, log warning
  - Do NOT re-seed if documents already exist

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition to lifespan function â€” read files + call existing service method
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14, 15, 16)
  - **Blocks**: Final QA (F3 â€” needs docs pre-loaded)
  - **Blocked By**: Tasks 6 (RAG service), 11 (lifespan wiring)

  **References**:

  **Pattern References**:
  - `backend/app/main.py` â€” The lifespan function where seed code goes (after RAGService init from Task 11)
  - `backend/app/services/rag_service.py:ingest_document` â€” The method to call for each document

  **API/Type References**:
  - `backend/test_docs/*.txt` â€” The 3 document files to read and ingest

  **WHY Each Reference Matters**:
  - `main.py` lifespan: The seed runs here because RAGService is available on app.state after Task 11's initialization
  - `ingest_document`: Use the existing service method rather than directly calling pgvector â€” ensures chunking and embedding happen correctly

  **Acceptance Criteria**:
  - [ ] Lifespan seeds 3 documents into tenant-1 collection on startup
  - [ ] Seed is idempotent (check before inserting)
  - [ ] Seed failure doesn't crash the server
  - [ ] After server start, POST /api/query with tenant-1 key returns sources

  **QA Scenarios:**

  ```
  Scenario: Documents are pre-seeded on startup
    Tool: Bash
    Preconditions: Server started with seed code
    Steps:
      1. Start backend server: cd backend && uv run uvicorn app.main:app --port 8000 &
      2. Wait 30s for startup + seeding
      3. curl -s -X POST http://localhost:8000/api/query -H 'Content-Type: application/json' -H 'X-API-Key: tenant-1-secret-key' -d '{"question": "What are GMP guidelines?"}'
      4. Assert response has 'sources' with length >= 1
      5. Kill server
    Expected Result: Query returns sources from pre-seeded documents
    Failure Indicators: Empty sources, 500 error, no documents found
    Evidence: .sisyphus/evidence/task-17-seed.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Preconditions: Server started twice
    Steps:
      1. Start server, wait for seed, stop server
      2. Start server again, wait for startup
      3. Query should still work, documents should not be duplicated
    Expected Result: No duplicate documents after restart
    Failure Indicators: Doubled sources in query results
    Evidence: .sisyphus/evidence/task-17-idempotent.txt
  ```

  **Commit**: YES (grouped with Tasks 14, 15, 16)
  - Message: `feat: add Docker deployment, docs, and startup seed`
  - Files: `backend/app/main.py` (modified)
  - Pre-commit: Server start test

## Final Verification Wave (MANDATORY â€” after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection â†’ fix â†’ re-run.

- [ ] F1. **Plan Compliance Audit** â€” `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns (next/navigation routing, `any` types, streaming WebSocket, PDF parsers, Alembic migration files, `==` for API key comparison). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** â€” `unspecified-high`
  Run `uv run python -m py_compile app/main.py` + `bun run build` (frontend). Review all NEW files for: `as any`/`@ts-ignore`, empty catches, console.log in prod code, commented-out code, unused imports, `type: ignore` in Python. Check AI slop: excessive comments, over-abstraction, generic variable names (data/result/item/temp). Verify all Pydantic models use typed fields. Verify all ChatNVIDIA calls have max_tokens set. Verify all PGVectorStore operations use async-native methods (no asyncio.to_thread for vector ops). Verify all interactive Next.js components have 'use client' directive. CRITICAL AI SDK v5 checks: sendMessage() used NOT append(), status used NOT isLoading, message.parts used NOT message.content.
  Output: `Backend [PASS/FAIL] | Frontend Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA â€” End-to-End** â€” `unspecified-high` + `playwright` skill
  Start backend with `uv run uvicorn app.main:app --port 8000` and frontend with `bun dev` (port 3000). Execute EVERY QA scenario from EVERY task â€” follow exact curl commands, capture responses. Use Playwright for frontend: navigate to http://localhost:3000, select tenant, type question, send, verify response + sources appear, verify loading state. Test tenant isolation end-to-end. Test error states (invalid API key, backend down). Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Backend Scenarios [N/N pass] | Frontend Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** â€” `deep`
  For each task: read "What to do", read actual files created/modified. Verify 1:1 â€” everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no PDF parsing deps, no streaming, no chat history models, no next/navigation routing, no Alembic, no custom UI primitives. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted files.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Message | Files | Pre-commit Check |
|---------------|---------|-------|------------------|
| 1 | `chore: fix python version and add RAG dependencies` | pyproject.toml, uv.lock | `uv sync` |
| 2, 3, 4 | `feat(backend): add schemas, models, auth, and test documents for RAG pipeline` | schemas/rag.py, models/query_log.py, core/api_key.py, test_docs/*.txt | â€” |
| 5 | `chore(frontend): create Next.js project with shadcn and TanStack Query` | frontend/ (entire new project) | `bun run build` |
| 6, 7 | `feat(backend): implement RAG service with pgvector and query logging` | services/rag_service.py, repositories/query_log_repository.py | â€” |
| 8, 9 | `feat(frontend): add API service layer and chat feature components` | services/api.ts, features/chat/*.tsx, types/api.ts, hooks/useChat.ts | `bun run build` |
| 10, 11 | `feat(backend): add RAG endpoints and wire router with lifespan init` | api/endpoints/rag.py, api/router.py, main.py | `uv run pytest` |
| 12 | `feat(frontend): assemble chat page with TanStack Query integration` | features/chat/ChatPage.tsx, app/page.tsx | `bun run build` |
| 13 | `test(backend): add RAG pipeline and tenant isolation tests` | tests/test_rag.py | `uv run pytest -v` |
| 14, 15, 16, 17 | `feat: add Docker deployment, docs, and startup seed` | backend/Dockerfile, frontend/Dockerfile, docker-compose.yml, ARCHITECTURE.md, README.md, .env.example | `docker compose config` |

---

## Success Criteria

### Verification Commands
```bash
# Backend starts
uv run uvicorn app.main:app --port 8000  # Expected: Uvicorn running on http://0.0.0.0:8000

# Health check
curl http://localhost:8000/health  # Expected: {"status": "ok"}

# Query endpoint works
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tenant-1-secret-key" \
  -d '{"question": "What are GMP guidelines?"}' \
  # Expected: 200, {"answer": "...", "sources": [...], "tenant_id": "tenant-1"}

# Tenant isolation
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tenant-2-secret-key" \
  -d '{"question": "What are GMP guidelines?"}' \
  # Expected: 200, sources is empty (docs belong to tenant-1)

# Metrics
curl http://localhost:8000/api/metrics/tenant-1 \
  -H "X-API-Key: tenant-1-secret-key" \
  # Expected: 200, {"total_queries": N, "avg_response_time_ms": N.N}

# Tests pass
cd backend && uv run pytest tests/ -v  # Expected: >= 2 passed

# Frontend builds
cd frontend && bun run build  # Expected: exit 0, no errors

# Docker works
docker compose up --build -d && docker compose ps  # Expected: all services running
```

### Final Checklist
- [ ] All "Must Have" items present and functional
- [ ] All "Must NOT Have" items absent from codebase
- [ ] All tests pass (>= 2)
- [ ] Frontend builds with zero TypeScript errors
- [ ] Docker compose starts all services
- [ ] ARCHITECTURE.md exists with substantive content
- [ ] README.md has clear run instructions
- [ ] .env.example has all required variables
- [ ] Test rubric scoring: targeting 85-95/100
