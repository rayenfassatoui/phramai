# Pharma AI Regulatory Assistant
RAG-based application for B'right Tunisie Full-Stack Senior Developer technical test.

## Features

### Core (Test Requirements)
- RAG pipeline with chunking, embedding, retrieval, and generation
- Multi-tenant isolation using table-per-tenant pgvector storage
- Secure authentication via X-API-Key with constant-time comparison
- Document ingestion and management (POST /api/documents/ingest)
- Query logging with detailed metadata (tenant_id, duration, sources)
- Performance metrics tracking per tenant
- React chat interface with source attribution and state management
- Comprehensive test suite (9 passing pytest tests)
- Full Dockerization with docker-compose

### Beyond Spec (Extras)
- SSE streaming for real-time token-by-token response display
- PDF upload with automatic parsing and vector ingestion
- Persistent chat history backed by PostgreSQL sessions
- Conversation export to PDF and Markdown formats
- Confidence scores for RAG-generated responses
- Document Library with integrated preview (PDF, text, and markdown)
- Custom per-tenant color theming and branding
- Complete document CRUD operations
- Auto-refreshing UI after document processing
- PDF source preview with text highlighting (react-pdf page viewer with yellow marker on source passages)

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.12, LangChain, SQLAlchemy (async) |
| AI | NVIDIA NIM (Llama 3.3 70B + NV-Embed-E5-V5) |
| Database | NeonDB (PostgreSQL + pgvector) |
| Tooling | Docker, uv, bun |

## Prerequisites
- Python 3.12+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) for Python environment management
- [bun](https://bun.sh/) for JavaScript runtime and package management
- NVIDIA NIM API Key
- NeonDB or local PostgreSQL with pgvector

## Quick Start — Local Development

### Backend
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```
API available at http://localhost:8000

### Frontend
```bash
cd frontend
bun install
bun dev
```
Application available at http://localhost:3000

## Quick Start — Docker
Build and start all services (backend, frontend, database) with one command:
```bash
docker compose up --build
```

## Environment Variables
Reference `.env.example` for all required configurations. Key variables include:
- `DATABASE_URL`: PostgreSQL connection string
- `NVIDIA_API_KEY`: API key for NVIDIA NIM services
- `LLM_MODEL`: Target language model
- `NVIDIA_EMBEDDING_MODEL`: Target embedding model
- `NEXT_PUBLIC_FASTAPI_URL`: Backend API URL for the frontend

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/query | RAG query (full JSON response) |
| POST | /api/query/stream | RAG query with SSE streaming |
| POST | /api/documents/ingest | Ingest document text into vector store |
| POST | /api/documents/upload | Upload and parse PDF file |
| GET | /api/documents/jobs/{job_id} | Check document processing job status |
| GET | /api/documents/ | List all documents in vector store |
| GET | /api/documents/search/similarity | Similarity search |
| DELETE | /api/documents/{document_id} | Delete a document |
| GET | /api/metrics/{tenant_id} | Tenant query metrics |
| GET | /api/tenant-documents | List tenant's uploaded documents |
| GET | /api/tenant-documents/{filename}/preview | Preview uploaded document |
| GET | /api/tenant-documents/{filename}/file | Serve original PDF file |
| DELETE | /api/tenant-documents/{filename} | Delete uploaded document |
| POST | /api/chat/sessions | Create chat session |
| GET | /api/chat/sessions | List chat sessions |
| GET | /api/chat/sessions/{session_id}/messages | Get session messages |
| DELETE | /api/chat/sessions/{session_id} | Delete chat session |
| GET | /health | Liveness check |
| GET | /api/health | App health check |

## Tenant API Keys
Include the `X-API-Key` header in all API requests.

| Tenant | API Key |
|--------|---------|
| tenant-1 | `tenant-1-secret-key` |
| tenant-2 | `tenant-2-secret-key` |
| tenant-3 | `tenant-3-secret-key` |

## Tests
Run the backend test suite to verify implementation:
```bash
cd backend
uv run pytest -v
```
The project includes 9 passing tests covering core RAG functionality and security.

## Architecture
Detailed documentation regarding system design, data flow, and multi-tenancy logic is available in [ARCHITECTURE.md](ARCHITECTURE.md).

