# Issues — pharma-rag-assistant

## [2026-03-04] LSP Diagnostics
- basedpyright-langserver not available on PATH; created wrapper at C:\Users\rayen\AppData\Local\Python\bin but LSP initialize timed out.

## [2026-03-04] Known Issues / Gotchas

- langchain-postgres requires psycopg[binary] as transitive dep — must be installed explicitly
- Tailwind v4 in Next.js requires @tailwindcss/postcss plugin (user already set up)
- Next.js API route handler is at app/api/chat/route.ts — NOT a rewrite for this endpoint
- The next.config.ts rewrites are ONLY for non-chat /api/* calls (e.g. /api/metrics)
- NVIDIA NIM embeddings vector size is 1024 — must match ainit_vectorstore_table call
- Plan line 64: API route prefix is /api (not /api/v1/) to match existing codebase
  BUT Task 8 references /api/v1/query for the route handler proxy call to FastAPI
  RESOLUTION: Use /api/query (no v1 prefix) per Metis guidance
- Do NOT commit real NVIDIA_API_KEY — use placeholder in .env.example only
