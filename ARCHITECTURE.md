# Technical Architecture: Pharma AI Regulatory Assistant

## System Overview
The Pharma AI Regulatory Assistant is a specialized RAG (Retrieval-Augmented Generation) platform designed for pharmaceutical regulatory compliance (EMA, FDA, ICH). It features multi-tenant isolation through per-tenant vector storage and utilizes NVIDIA NIM for high-performance inference and 1024-dimensional embeddings.

## Component Diagram
```text
[ Browser ]
      |
      | HTTP/HTTPS (Port 3000)
      v
[ Next.js 16 (App Router) ] <----------------------------+
      |                                                  |
      | SSE Bridge / Route Handlers                      |
      | (TanStack Query / React Hook Form)               |
      v                                                  |
[ FastAPI (Port 8000) ]                                  |
      |                                                  |
      |--[ RAG Service ]-------------------------------->| [ NVIDIA NIM API ]
      |      |-- StreamingResponse (SSE)                 |   |-- llama-3.3-70b
      |      |-- NVIDIAEmbeddings (1024-dim)             |   |-- nv-embed-e5-v5
      |                                                  |
      |--[ PDF Pipeline (PyMuPDF) ]                      |
      |                                                  |
      |--[ PostgreSQL + PGVector ] <---------------------+
             |-- docs_{tenant_id} (Vector Table)
             |-- chat_sessions / chat_messages
             |-- query_logs (Audit)
```

## Data Flow

### Document Ingestion and PDF Parsing
1. The client uploads a PDF or text file via the DocumentLibrary component.
2. The Next.js API route proxies the request to FastAPI `/api/documents/upload`.
3. FastAPI uses PyMuPDF (fitz) to extract text content from PDF pages.
4. `RecursiveCharacterTextSplitter` chunks text into 1000 characters with 200 overlap.
5. Chunks are embedded via NVIDIA `nv-embed-e5-v5` and stored in `docs_{tenant_id}`.

### RAG Query (JSON and Streaming)
- **Standard Query**: `/api/query` returns a full JSON object with the answer, sources, and metadata.
- **Streaming Query**: `/api/query/stream` utilizes FastAPI `StreamingResponse` with `text/event-stream`.
- **SSE Bridge**: The Next.js route handler at `/api/chat/route.ts` bridges the backend SSE stream to the frontend, allowing real-time token-by-token display.

### Chat History Persistence
1. `chat_sessions` stores session metadata (id, tenant_id, title).
2. `chat_messages` stores the full conversation history including role, content, and source citations (JSONB).
3. Sessions are tenant-scoped, ensuring users only see their organization's history.

## Multi-Tenancy and Security
- **Isolation**: Logical isolation is enforced via a table-per-tenant pattern. Each tenant has a dedicated `docs_{tenant_id}` table in PGVector.
- **Authentication**: `X-API-Key` validation using `secrets.compare_digest` for constant-time security.
- **Scope**: All database queries for documents and chat history are strictly filtered by the authenticated `tenant_id`.

## Database Schema
- `docs_{tenant_id}`: Stores embeddings, text content, and document metadata.
- `query_logs`: Audit trail (id, timestamp, tenant_id, question, nb_sources, duration_ms).
- `chat_sessions`: Session management (id, tenant_id, title, created_at, updated_at).
- `chat_messages`: Message history (id, session_id, role, content, sources, created_at).

## Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.12, SQLAlchemy (async), Pydantic v2 |
| AI | NVIDIA NIM (Llama 3.3 70B + NV-Embed-E5-V5) |
| Database | NeonDB (PostgreSQL + pgvector) |
| Parsing | PyMuPDF (fitz) |

## Design Decisions

### SSE Streaming Architecture
The system uses a bridge pattern where FastAPI emits an SSE stream and Next.js proxies it. This reduces perceived latency and provides a superior UX while allowing the backend to finalize audit logs and metrics after the stream completes.

### Table-per-Tenant Vector Storage
Instead of a single table with a `tenant_id` column, we use separate tables for each tenant. This ensures zero data leakage at the storage layer, optimizes search performance, and simplifies data deletion for compliance.

### PDF Processing Pipeline
We use PyMuPDF for high-fidelity text extraction. Processing is handled asynchronously with status polling, ensuring the UI remains responsive during large document ingestions.

### Inline Citation System
The citation pipeline ensures full auditability from LLM output to source PDF. The backend RAG prompt instructs the LLM to place numbered markers (`[1]`, `[2]`) inline within its response, corresponding to `[{i+1}]`-prefixed source documents from `format_docs()`. The SSE bridge in `route.ts` attaches an `index` field to each source object. On the frontend, `ChatMessage` uses a regex (`/\[(\d+)\]/g`) to split streamed text into segments — plain text renders via `Streamdown`, citation markers render as clickable `CitationTag` badges. Clicking a tag triggers `handleCitationClick`, which resolves the source by index and opens `CitationSidebar` — a right-side panel containing a `react-pdf` page viewer with yellow-highlighted source passages for precise traceability.

### Resizable Citation Sidebar
The citation sidebar uses `react-resizable-panels` (v4) wrapped by a shadcn `resizable.tsx` component. When a citation is active, the main chat and citation panels render inside a `ResizablePanelGroup` with a draggable handle. Panel sizes are expressed as percentage strings (`"65%"` / `"35%"` default split, `"15%"` min, `"80%"` max) to work correctly with the v4 API. On mobile viewports (`md:` breakpoint), the citation renders as a full-screen overlay instead, ensuring usability across device sizes.

### Tenant-Switch Conversation Isolation
A race condition exists when switching tenants while a conversation is open: React batches state updates from two `useEffect` hooks in the same commit, causing the persistence effect to see stale messages with the new tenant's API key — cloning the conversation into the wrong tenant. The fix introduces a `messagesTenantKeyRef` that tracks which tenant owns the current in-memory messages. It is updated only in three legitimate mutation points (`handleSendMessage`, `handleSelectSession`, `handleNewSession`). The persistence effect checks `messagesTenantKeyRef.current !== selectedTenant.key` and bails out on mismatch, preventing cross-tenant writes.

## Implemented Beyond Spec
- SSE streaming for real-time responses.
- Native PDF upload and parsing pipeline.
- Persistent chat history with session management.
- Export functionality (PDF/Markdown).
- Confidence scores based on retrieval similarity.
- Document Library with integrated preview and CRUD operations.
- Dynamic per-tenant theming.
- Inline citation tags with click-to-open PDF sidebar for source auditability.
- Resizable citation sidebar with drag handle (react-resizable-panels).
- Mobile-responsive citation overlay (full-screen on mobile, resizable panel on desktop).
- Tenant-switch conversation isolation guard preventing cross-tenant data leakage.

## Proposed Improvements
- **Hybrid Search**: Implement BM25 keyword search alongside semantic search to improve recall for specific regulatory codes.
- **Advanced Observability**: Integrate LangSmith for detailed trace-level visibility into RAG chains.
- **RBAC**: Add role-based access control within tenants (e.g., admin vs. viewer).
- **Regulatory Sync**: Automated pipeline to fetch updates from EMA/FDA sources.
- **Sovereignty & Compliance**: Architecture refinements for HDS/RGPD and Cloud EU compliance.
