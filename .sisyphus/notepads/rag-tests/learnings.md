## RAG Test Learnings

### langchain 1.2.x no longer ships `langchain.chains`
- `langchain` 1.2.10 is a slim package; `create_retrieval_chain` lives in `langchain_classic` (installed via `langchain-community`).
- At test time, stub missing langchain sub-modules in `sys.modules` BEFORE any app code is imported.
- Pattern: add stubs at top of `conftest.py` (before imports) using `sys.modules[mod] = MagicMock()`.
- Modules to stub: `langchain.chains`, `langchain.chains.combine_documents`, `langchain_nvidia_ai_endpoints`, `langchain_postgres`, `langchain_postgres.vectorstores`, `langchain_text_splitters`.

### SQLite vs PostgreSQL types in autouse setup_db
- `Base.metadata.create_all` creates ALL registered models; models with `JSONB` or `pgvector.Vector` columns fail on SQLite.
- Fix: pass `tables=[...]` explicitly to `create_all` / `drop_all` to restrict to SQLite-compatible models only.
- For this project: `User.__table__` and `QueryLog.__table__` are safe; `Document.__table__` is not.

### FastAPI multiple Body() parameters embedding
- When an endpoint has `body: SomePydanticModel` AND `text: Annotated[str, Body(...)]`, FastAPI embeds the model under its parameter name.
- Request JSON must be: `{"body": {"document_name": "..."}, "text": "..."}` — NOT `{"document_name": ..., "text": ...}`.
- The `loc` in 422 error `['body', 'body']` confirms the model is expected under key `body`.

### Dependency override pattern
- Override `get_rag_service` and `get_query_log_repo` (the factory functions, not the classes) for clean mocking.
- Override `get_tenant_from_api_key` with `lambda: "tenant-1"` to bypass auth entirely in happy-path tests.
- Use separate `unauthed_client` fixture with NO overrides to test 401 behavior.

### lifespan suppression
- `patch("app.main.lifespan")` suppresses the lifespan context manager so the `AsyncClient` doesn't attempt DB/pgvector startup.
- This is needed when `rag_client` doesn't use the session-scoped `setup_db` fixture path.
