# Backend

FastAPI backend — Python 3.12, SQLAlchemy async, LangChain, NVIDIA NIM.

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000
uv run pytest -v                        # run tests
```

See [root README](../README.md) for full docs and [ARCHITECTURE.md](../ARCHITECTURE.md) for system design.
- ReDoc    → http://localhost:8000/redoc
- Health   → http://localhost:8000/health
