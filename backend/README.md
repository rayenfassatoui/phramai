# Backend — FastAPI + UV

A production-ready FastAPI backend scaffolded with **uv**.

## Architecture

```
backend/
├── app/
│   ├── main.py                  # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py            # Settings via pydantic-settings (.env)
│   │   ├── security.py          # JWT + bcrypt helpers
│   │   └── dependencies.py      # FastAPI dependency injection (current user)
│   ├── db/
│   │   └── database.py          # Async SQLAlchemy engine + session + Base
│   ├── models/
│   │   └── user.py              # SQLAlchemy ORM models
│   ├── schemas/
│   │   └── user.py              # Pydantic v2 request/response schemas
│   ├── repositories/
│   │   └── user_repository.py   # DB access layer (no business logic)
│   ├── services/
│   │   └── user_service.py      # Business logic layer
│   └── api/v1/
│       ├── router.py            # Aggregated v1 router
│       └── endpoints/
│           ├── auth.py          # /auth/register, /auth/login
│           └── users.py         # /users/me, /users/{id}, ...
└── tests/
    ├── conftest.py              # Fixtures (test DB, async client)
    └── test_users.py            # Integration tests
```

## Quick Start

```bash
# 1. Copy env file
cp .env.example .env

# 2. Run dev server
uv run uvicorn app.main:app --reload

# 3. Run tests
uv run pytest -v
```

## API Docs

- Swagger UI → http://localhost:8000/docs  
- ReDoc    → http://localhost:8000/redoc
- Health   → http://localhost:8000/health
