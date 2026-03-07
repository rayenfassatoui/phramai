# PharmAI — Pharmaceutical Regulatory Assistant

A production-grade, multi-tenant RAG (Retrieval-Augmented Generation) platform for pharmaceutical regulatory compliance. Upload regulatory documents, ask questions in natural language, and get cited, auditable answers powered by NVIDIA NIM.

> **Live:** [phramai-frontend.azurewebsites.net](https://phramai-frontend.azurewebsites.net) &nbsp;|&nbsp; **API Docs:** [phramai-backend.azurewebsites.net/docs](https://phramai-backend.azurewebsites.net/docs)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, AI SDK v5 |
| **Backend** | FastAPI, Python 3.12, LangChain, SQLAlchemy (async), Pydantic v2 |
| **AI / LLM** | NVIDIA NIM — Llama 3.3 70B (generation) + NV-Embed-E5-V5 1024-dim (embeddings) |
| **Database** | Neon Serverless PostgreSQL + pgvector |
| **Storage** | Azure Blob Storage (production) / local filesystem (dev) |
| **Infra** | Azure App Service (B1), Azure Container Registry, Docker, GitHub Actions CI/CD |
| **Tooling** | uv (Python), Bun (JS), Docker Compose |

---

## Features

### RAG Pipeline
- Document ingestion with recursive chunking (1000 chars / 200 overlap)
- 1024-dimensional vector embeddings via NVIDIA NV-Embed-E5-V5
- Semantic similarity retrieval from pgvector with source attribution
- LLM generation via Llama 3.3 70B with inline citation markers (`[1]`, `[2]`)
- SSE streaming for real-time token-by-token response display
- Confidence scoring based on retrieval similarity

### Document Management
- PDF upload with automatic text extraction (PyMuPDF)
- Azure Blob Storage persistence with local filesystem fallback
- Document Library with preview (PDF, text, markdown)
- Full CRUD operations on uploaded documents
- Background processing with job status polling

### Multi-Tenancy
- Table-per-tenant vector storage (`docs_{tenant_id}`) — zero cross-tenant data leakage
- API key authentication with constant-time comparison (`secrets.compare_digest`)
- Tenant-scoped chat history, documents, and metrics
- Tenant-switch conversation isolation guard

### Chat Interface
- Persistent chat sessions backed by PostgreSQL
- Inline citation tags — click to open source in resizable PDF sidebar
- PDF viewer with yellow-highlighted source passages for precise traceability
- Conversation export to PDF and Markdown
- Mobile-responsive: full-screen citation overlay on mobile, resizable panel on desktop
- Per-tenant color theming and branding

### Production Hardening
- Rate limiting (slowapi) — 120/min reads, 60/min writes, 30/min AI, 20/min uploads
- Retry with exponential backoff (tenacity) on NVIDIA API calls
- CORS configuration with explicit origin allowlist
- Health check endpoint for container orchestration
- CI/CD via GitHub Actions with automated tests and parallel deploy

---

## Project Structure

```
phramai/
├── .github/workflows/deploy.yml   # CI/CD pipeline
├── .env.example                    # Environment variable reference
├── docker-compose.yml              # Local dev (backend + frontend)
├── ARCHITECTURE.md                 # Detailed system design
├── DEPLOYMENT.md                   # Azure deployment guide
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml              # Python deps (uv)
│   ├── app/
│   │   ├── main.py                 # FastAPI app factory + lifespan
│   │   ├── api/endpoints/          # Route handlers (chat, documents, rag)
│   │   ├── core/                   # Config, rate limiting, API key auth
│   │   ├── db/                     # Async SQLAlchemy engine + sessions
│   │   ├── models/                 # ORM models (sessions, documents, logs)
│   │   ├── repositories/           # Data access layer
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   └── services/               # Business logic (RAG, PDF, chat, blob)
│   └── tests/                      # 9 pytest tests
│
└── frontend/
    ├── Dockerfile
    ├── package.json                # JS deps (bun)
    ├── app/                        # Next.js App Router pages + API routes
    ├── components/chat/            # 13 chat UI components
    ├── components/ui/              # shadcn/ui primitives
    ├── lib/                        # Utilities
    └── services/api.ts             # Backend API client
```

---

## Quick Start

### Prerequisites

- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 20+ and [Bun](https://bun.sh/)
- NVIDIA NIM API key ([build.nvidia.com](https://build.nvidia.com))
- PostgreSQL with pgvector (or [Neon](https://neon.tech) free tier)

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and NVIDIA_API_KEY
```

### 2. Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

API at http://localhost:8000 &nbsp;|&nbsp; Docs at http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
bun install
bun dev
```

App at http://localhost:3000

### Docker (alternative)

```bash
docker compose up --build
```

Starts both services — frontend at `:3000`, backend at `:8000`.

---

## Environment Variables

See [.env.example](.env.example) for the full reference. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL+asyncpg connection string |
| `NVIDIA_API_KEY` | Yes | NVIDIA NIM API key |
| `LLM_MODEL` | No | LLM model (default: `meta/llama-3.3-70b-instruct`) |
| `NVIDIA_EMBEDDING_MODEL` | No | Embedding model (default: `nvidia/nv-embedqa-e5-v5`) |
| `AZURE_STORAGE_CONNECTION_STRING` | Prod | Azure Blob Storage (empty = local filesystem) |
| `ALLOWED_ORIGINS` | No | JSON array of CORS origins |
| `NEXT_PUBLIC_FASTAPI_URL` | No | Backend URL for frontend (build-time) |

---

## API Reference

All endpoints require an `X-API-Key` header.

### RAG

| Method | Endpoint | Rate | Description |
|--------|----------|------|-------------|
| `POST` | `/api/query` | 30/min | RAG query — full JSON response |
| `POST` | `/api/query/stream` | 30/min | RAG query — SSE streaming |

### Documents

| Method | Endpoint | Rate | Description |
|--------|----------|------|-------------|
| `POST` | `/api/documents/ingest` | 30/min | Ingest text into vector store |
| `POST` | `/api/documents/upload` | 20/min | Upload and parse PDF |
| `GET` | `/api/documents/` | 120/min | List documents in vector store |
| `GET` | `/api/documents/search/similarity` | 30/min | Semantic similarity search |
| `DELETE` | `/api/documents/{id}` | 60/min | Delete a document |
| `GET` | `/api/documents/jobs/{job_id}` | 120/min | Check processing job status |

### Tenant Documents (uploaded files)

| Method | Endpoint | Rate | Description |
|--------|----------|------|-------------|
| `GET` | `/api/tenant-documents` | 120/min | List uploaded documents |
| `GET` | `/api/tenant-documents/{filename}/preview` | 120/min | Preview document content |
| `GET` | `/api/tenant-documents/{filename}/file` | 120/min | Serve original PDF file |
| `DELETE` | `/api/tenant-documents/{filename}` | 60/min | Delete uploaded document |

### Chat Sessions

| Method | Endpoint | Rate | Description |
|--------|----------|------|-------------|
| `POST` | `/api/chat/sessions` | 60/min | Create session |
| `GET` | `/api/chat/sessions` | 120/min | List sessions |
| `GET` | `/api/chat/sessions/{id}/messages` | 120/min | Get session messages |
| `DELETE` | `/api/chat/sessions/{id}` | 60/min | Delete session |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/metrics/{tenant_id}` | Query performance metrics |

---

## Authentication

Include `X-API-Key` in every request header.

| Tenant | API Key |
|--------|---------|
| tenant-1 | `tenant-1-secret-key` |
| tenant-2 | `tenant-2-secret-key` |
| tenant-3 | `tenant-3-secret-key` |

---

## Tests

```bash
cd backend
uv run pytest -v
```

9 tests covering RAG pipeline, document operations, chat sessions, and API key security.

---

## Deployment

The app is deployed on **Azure App Service** (francecentral) with CI/CD via GitHub Actions.

- Full deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)
- Architecture deep-dive: [ARCHITECTURE.md](ARCHITECTURE.md)

```
push to main → GitHub Actions → run tests → build Docker images → push to ACR → deploy to Azure
```

