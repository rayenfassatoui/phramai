# ---------------------------------------------------------------------------
# Stub out heavy optional ML dependencies that may not be installed in the
# test environment. These must be registered in sys.modules BEFORE any app
# code is imported so that import-time references to these packages resolve
# to harmless MagicMock objects instead of raising ModuleNotFoundError.
# ---------------------------------------------------------------------------
import sys
from unittest.mock import MagicMock as _MagicMock

_STUB_MODULES = [
    "langchain.chains",
    "langchain.chains.combine_documents",
    "langchain_nvidia_ai_endpoints",
    "langchain_postgres",
    "langchain_postgres.vectorstores",
    "langchain_text_splitters",
]
for _mod in _STUB_MODULES:
    if _mod not in sys.modules:
        sys.modules[_mod] = _MagicMock()


import pytest
import pytest_asyncio
import app.db.database as db_module
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from unittest.mock import patch

from app.db.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine_test = create_async_engine(TEST_DATABASE_URL, future=True)
AsyncTestSession = async_sessionmaker(engine_test, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    # Patch the production engine with the test engine for the lifespan
    with patch.object(db_module, "engine", engine_test):
        async with engine_test.begin() as conn:
            # Only create tables that are SQLite-compatible.
            # The `documents` table uses JSONB and pgvector which SQLite cannot
            # compile; those tables are tested via mocks and never need real DDL.
            from app.models.query_log import QueryLog

            sqlite_tables = [QueryLog.__table__]
            await conn.run_sync(
                lambda sync_conn: Base.metadata.create_all(
                    sync_conn, tables=sqlite_tables
                )
            )
        yield
        async with engine_test.begin() as conn:
            from app.models.query_log import QueryLog

            sqlite_tables = [QueryLog.__table__]
            await conn.run_sync(
                lambda sync_conn: Base.metadata.drop_all(
                    sync_conn, tables=sqlite_tables
                )
            )
    await engine_test.dispose()


@pytest_asyncio.fixture
async def db_session():
    async with AsyncTestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
