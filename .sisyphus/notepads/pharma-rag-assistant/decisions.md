# Decisions — pharma-rag-assistant

## [2026-03-04] Task 6 — RAG Service
- Used PGEngine.from_engine(AsyncEngine) per langchain-postgres v2 pattern.
- Hardcoded required NVIDIA models in RAG service to meet task constraints.

## [2026-03-04] Architecture Decisions

- Use table-per-tenant for pgvector (not metadata filter) — prevents data leakage
- NVIDIA NIM for both LLM and embeddings — eliminates local model downloads
- Next.js standalone output for Docker — no nginx needed
- AI SDK v5 Proxy pattern (Option A) — FastAPI does all RAG, Next.js wraps JSON in streaming format
- Hardcoded 3 tenants (tenant-1, tenant-2, tenant-3) — no tenant CRUD
- Python 3.12 (not 3.14) — LangChain compatibility
- Tests mock LLM calls — no real NVIDIA API dependency in CI
- Seed docs only for tenant-1 — tenant-2 remains empty for isolation test
