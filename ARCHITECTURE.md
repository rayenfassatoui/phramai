# PharmAI — System Architecture

## Table of Contents

1. [Overview](#1-overview)
2. [System Diagram](#2-system-diagram)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Data Flow](#5-data-flow)
6. [Database Schema](#6-database-schema)
7. [Multi-Tenancy](#7-multi-tenancy)
8. [Security](#8-security)
9. [Rate Limiting & Resilience](#9-rate-limiting--resilience)
10. [Infrastructure](#10-infrastructure)
11. [Design Decisions](#11-design-decisions)

---

## 1. Overview

PharmAI is a multi-tenant RAG platform for pharmaceutical regulatory compliance (EMA, FDA, ICH). Users upload regulatory documents (PDF/text), which are chunked, embedded, and stored in per-tenant pgvector tables. When a user asks a question, the system retrieves relevant chunks via semantic similarity, feeds them as context to an LLM, and returns a cited, auditable answer with confidence scoring.

**Key design principles:**
- Strict tenant isolation at the storage layer
- Streaming-first UX (SSE token-by-token)
- Full source traceability from LLM output back to PDF page

---

## 2. System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                   │
│                                                                     │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ ChatMessage  │ │ ChatInput    │ │ DocLibrary  │ │ PDFUpload   │ │
│  │ + Citations  │ │              │ │             │ │             │ │
│  └──────┬──────┘ └──────┬───────┘ └──────┬──────┘ └──────┬──────┘ │
│         │               │                │               │         │
│         └───────────────┼────────────────┼───────────────┘         │
│                         │                │                         │
│                    ┌────▼────────────────▼────┐                    │
│                    │  Next.js App Router       │                    │
│                    │  /api/chat/route.ts       │                    │
│                    │  (SSE Bridge)             │                    │
│                    └────────────┬─────────────┘                    │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │ HTTP / SSE
                                  │ X-API-Key header
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FASTAPI (Port 8000)                            │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Rate     │  │ CORS     │  │ API Key      │  │ Endpoints     │  │
│  │ Limiter  │  │ Middle-  │  │ Auth         │  │ /api/query    │  │
│  │ (slowapi)│  │ ware     │  │ (X-API-Key)  │  │ /api/docs     │  │
│  └──────────┘  └──────────┘  └──────────────┘  │ /api/chat     │  │
│                                                 └───────┬───────┘  │
│                                                         │          │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────▼───────┐  │
│  │ PDF Service    │  │ Chat Service   │  │ RAG Service          │  │
│  │ (PyMuPDF)      │  │                │  │  ├─ embed (NVIDIA)   │  │
│  └────────┬───────┘  └────────┬───────┘  │  ├─ retrieve (pgvec) │  │
│           │                   │          │  ├─ generate (LLM)   │  │
│           │                   │          │  └─ stream (SSE)     │  │
│  ┌────────▼───────┐           │          └──────────┬───────────┘  │
│  │ Blob Service   │           │                     │              │
│  │ (Azure/Local)  │           │                     │              │
│  └────────────────┘           │                     │              │
│                               ▼                     ▼              │
│                    ┌──────────────────────────────────────────┐     │
│                    │  PostgreSQL + pgvector (Neon)            │     │
│                    │  ├─ docs_{tenant_id}  (vector tables)   │     │
│                    │  ├─ chat_sessions                        │     │
│                    │  ├─ chat_messages                        │     │
│                    │  ├─ documents        (metadata)          │     │
│                    │  └─ query_logs       (audit)             │     │
│                    └──────────────────────────────────────────┘     │
│                                                                     │
│                    ┌──────────────────────────────────────────┐     │
│                    │  NVIDIA NIM API                          │     │
│                    │  ├─ meta/llama-3.3-70b-instruct (LLM)   │     │
│                    │  └─ nvidia/nv-embedqa-e5-v5 (Embedding) │     │
│                    └──────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Architecture

### Layer Breakdown

```
app/
├── api/endpoints/       →  HTTP layer (request/response, validation)
├── services/            →  Business logic (no HTTP knowledge)
├── repositories/        →  Data access (SQL queries only)
├── models/              →  SQLAlchemy ORM models
├── schemas/             →  Pydantic v2 request/response DTOs
├── core/                →  Cross-cutting concerns (config, auth, rate limit)
└── db/                  →  Database engine + session factory
```

### Services

| Service | File | Responsibility |
|---------|------|----------------|
| **RAGService** | `rag_service.py` | Vector store init, embedding, retrieval, LLM generation, streaming |
| **PDFService** | `pdf_service.py` | PDF text extraction via PyMuPDF, page-level metadata |
| **ChatService** | `chat_service.py` | Session CRUD, message persistence, tenant-scoped queries |
| **DocumentService** | `document_service.py` | Document metadata CRUD, query logging, metrics |
| **BlobService** | `blob_service.py` | Azure Blob Storage upload/download/delete with local fallback |
| **SeedService** | `seed_service.py` | Idempotent startup seeding of test documents for tenant-1 |

### Startup Lifecycle (`lifespan`)

1. Connect to PostgreSQL
2. Create `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
3. Run `Base.metadata.create_all` (auto-creates tables)
4. Seed tenant-1 vector store with test documents (idempotent, swallows errors)
5. On shutdown: dispose engine

---

## 4. Frontend Architecture

### Component Tree

```
app/
├── layout.tsx              →  Root layout + providers
├── page.tsx                →  Main chat page
├── providers.tsx           →  React context providers
└── api/chat/route.ts       →  SSE bridge (Next.js → FastAPI)

components/chat/
├── ChatHistory.tsx         →  Session list sidebar
├── ChatInput.tsx           →  Message input with submit
├── ChatMessage.tsx         →  Message bubble + inline citation parsing
├── CitationSidebar.tsx     →  Resizable PDF viewer panel
├── CitationTag.tsx         →  Clickable [1] [2] badge components
├── ConfidenceScore.tsx     →  Visual confidence indicator
├── DocumentLibrary.tsx     →  File list with preview + CRUD
├── ExportButtons.tsx       →  PDF / Markdown export
├── MetricsPanel.tsx        →  Query performance stats
├── PDFUpload.tsx           →  Drag-and-drop file upload
├── SourceList.tsx          →  Retrieved sources list
├── SourcePreview.tsx       →  Source content preview
└── TenantSelector.tsx      →  Tenant switcher dropdown
```

### SSE Bridge Pattern

The frontend can't call the FastAPI SSE endpoint directly from the browser (CORS + credentials). Instead:

1. Browser sends a POST to Next.js `/api/chat/route.ts`
2. Route handler forwards to FastAPI `/api/query/stream` with the real `X-API-Key`
3. FastAPI streams tokens via SSE
4. Route handler bridges the SSE stream back to the browser
5. `ChatMessage` renders tokens as they arrive via `Streamdown`

---

## 5. Data Flow

### 5.1 Document Ingestion

```
User uploads PDF
       │
       ▼
  Next.js proxy → FastAPI /api/documents/upload
       │
       ├─→ PDFService: Extract text (PyMuPDF, page by page)
       ├─→ BlobService: Store original PDF in Azure Blob / local filesystem
       ├─→ RecursiveCharacterTextSplitter: Chunk (1000 chars, 200 overlap)
       ├─→ NVIDIA NV-Embed-E5-V5: Generate 1024-dim embeddings
       └─→ PGVector: Insert into docs_{tenant_id} table
```

### 5.2 RAG Query (Streaming)

```
User asks question
       │
       ▼
  SSE Bridge → FastAPI /api/query/stream
       │
       ├─→ NVIDIA Embeddings: Embed the query (1024-dim)
       ├─→ PGVector: Similarity search in docs_{tenant_id} (top-k)
       ├─→ Format sources as numbered context: [1] ... [2] ...
       ├─→ NVIDIA Llama 3.3 70B: Generate answer with [n] citations
       ├─→ StreamingResponse: Token-by-token SSE events
       ├─→ QueryLog: Record duration, nb_sources, tenant_id
       └─→ Browser: Render tokens + parse [n] into CitationTags
```

### 5.3 Citation Click

```
User clicks [2] in a message
       │
       ▼
  ChatMessage → handleCitationClick(index=2)
       │
       ├─→ Resolve source object by index from message.sources
       ├─→ Open CitationSidebar (resizable panel, 35% default width)
       └─→ Render react-pdf page viewer with yellow-highlighted passage
```

---

## 6. Database Schema

### Vector Tables (per-tenant)

**`docs_{tenant_id}`** — Created by LangChain PGVector

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `collection_id` | UUID | LangChain collection reference |
| `embedding` | vector(1024) | NV-Embed-E5-V5 embedding |
| `document` | text | Chunk text content |
| `cmetadata` | jsonb | Source filename, page number, chunk index |

### Application Tables

**`chat_sessions`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | varchar | Owning tenant |
| `title` | varchar | Session title (auto-generated from first message) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last activity |

**`chat_messages`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | UUID | FK → chat_sessions |
| `role` | varchar | `user` or `assistant` |
| `content` | text | Message content |
| `sources` | jsonb | Array of source objects (for assistant messages) |
| `created_at` | timestamp | Timestamp |

**`query_logs`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | varchar | Tenant identifier |
| `question` | text | User's query |
| `nb_sources` | integer | Number of sources retrieved |
| `duration_ms` | float | Query processing time |
| `created_at` | timestamp | Timestamp |

**`documents`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | varchar | Owning tenant |
| `filename` | varchar | Original filename |
| `status` | varchar | `processing`, `completed`, `failed` |
| `page_count` | integer | Number of pages |
| `chunk_count` | integer | Number of chunks created |
| `created_at` | timestamp | Upload time |

---

## 7. Multi-Tenancy

### Isolation Model: Table-per-Tenant

Each tenant gets a dedicated pgvector table: `docs_tenant-1`, `docs_tenant-2`, etc.

**Why not a shared table with `WHERE tenant_id = ?`**
- Zero risk of cross-tenant data leakage — no filter to forget
- Better query performance (each table is independently indexed)
- Simple data deletion for compliance (drop the table)
- pgvector similarity search only scans relevant data

### Tenant Resolution Flow

```
Request with X-API-Key header
       │
       ▼
  get_tenant_from_api_key()
       │
       ├─→ Look up key in TENANT_API_KEYS dict
       ├─→ Compare using secrets.compare_digest (constant-time)
       └─→ Return tenant_id (used for all subsequent DB queries)
```

### Tenant-Switch Isolation Guard

A race condition exists when switching tenants while a conversation is open: React batches state updates from two `useEffect` hooks in the same commit, causing the persistence effect to see stale messages with the new tenant's API key.

**Fix:** A `messagesTenantKeyRef` tracks which tenant owns the current in-memory messages. Updated only during legitimate mutations (`handleSendMessage`, `handleSelectSession`, `handleNewSession`). The persistence effect bails out when `messagesTenantKeyRef.current !== selectedTenant.key`.

---

## 8. Security

| Measure | Implementation |
|---------|----------------|
| **Authentication** | `X-API-Key` header validated with `secrets.compare_digest` |
| **CORS** | Explicit origin allowlist via `ALLOWED_ORIGINS` |
| **Rate Limiting** | IP-based via slowapi (see §9) |
| **SQL Injection** | SQLAlchemy parameterized queries |
| **File Upload** | PyMuPDF validation, Azure Blob Storage (not local in prod) |
| **Secrets** | Environment variables, never committed (`.env` in `.gitignore`) |
| **Container** | Non-root user (`appuser`), minimal base image (`python:3.12-slim`) |
| **SSL** | Enforced by Azure App Service (HTTPS only) + `?ssl=require` on DB |

---

## 9. Rate Limiting & Resilience

### Rate Limits (per IP, via slowapi)

| Tier | Limit | Endpoints |
|------|-------|-----------|
| **Read** | 120/min | Document listing, session listing, PDF serving, metrics |
| **Write** | 60/min | Session CRUD, document create/update/delete |
| **Upload** | 20/min | PDF file uploads |
| **AI** | 30/min | RAG query, streaming, ingestion, similarity search |

Exceeded limits return HTTP `429 Too Many Requests`.

### Retry with Exponential Backoff (NVIDIA API)

The RAG service uses tenacity for automatic retry on NVIDIA NIM calls:

| Parameter | Value |
|-----------|-------|
| Max attempts | 3 |
| Wait strategy | Exponential: 1s → 2s → 4s |
| Retry on | `TimeoutError`, `ConnectionError`, `RuntimeError` |
| Applied to | `_retrieve_with_retry()`, `_llm_invoke_with_retry()` |

---

## 10. Infrastructure

### Production (Azure)

```
Azure App Service (B1, Linux, francecentral)
├── phramai-backend    →  FastAPI container from ACR
├── phramai-frontend   →  Next.js container from ACR
│
Azure Container Registry (Basic)
├── phramai-backend:latest
├── phramai-frontend:latest
│
Azure Blob Storage (Standard_LRS)
└── documents/         →  Uploaded PDFs ({tenant_id}/{filename})
│
Neon PostgreSQL (Serverless)
└── pharma_db          →  pgvector enabled
```

### CI/CD (GitHub Actions)

```
push to main
     │
     ▼
  test-backend (uv run pytest)
     │
     ├─→ build-and-deploy-backend  (parallel)
     │     ├─ docker build → ACR push → Azure deploy
     │
     └─→ build-and-deploy-frontend (parallel)
           ├─ docker build → ACR push → Azure deploy
```

### Local Development

```bash
docker compose up --build    # or run backend/frontend separately
```

---

## 11. Design Decisions

### SSE Streaming via Bridge Pattern
FastAPI emits SSE directly. Next.js route handler acts as a transparent proxy. This approach lets the backend finalize audit logs and metrics after the stream completes, while the frontend receives tokens in real-time without CORS complications.

### Table-per-Tenant Vector Storage
Chosen over row-level filtering for zero-leak isolation, better pgvector performance (smaller index per table), and compliance-friendly data deletion (drop table). Trade-off: slightly more complex table management.

### PyMuPDF for PDF Processing
Selected over alternatives (pdfplumber, pypdf) for speed, accuracy on multi-column layouts, and page-level metadata extraction that enables precise citation mapping.

### Azure Blob Storage with Local Fallback
Production uses Azure Blob for durability and scalability. When `AZURE_STORAGE_CONNECTION_STRING` is empty, falls back to local filesystem — zero config for local development.

### Inline Citation System
The RAG prompt instructs the LLM to place `[1]`, `[2]` markers inline. The frontend uses a regex (`/\[(\d+)\]/g`) to split text into segments — plain text renders via markdown, citations render as clickable `CitationTag` badges that open the source in a resizable PDF sidebar with highlighted passages.

### Resizable Citation Sidebar
Uses `react-resizable-panels` with a drag handle. Default 35% width, min 15%, max 80%. On mobile viewports, renders as a full-screen overlay instead.
