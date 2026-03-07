import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api.router import router as api_router
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import Base, engine
import app.models  # noqa: F401 — ensures all models are registered with Base.metadata
from app.services.rag_service import RAGService
from app.services.seed_service import SeedService

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: enable pgvector extension, then create tables
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    # Seed tenant-1 vector store with test documents (idempotent)
    if not settings.NVIDIA_API_KEY:
        logger.warning(
            "NVIDIA_API_KEY is not set — skipping startup document seeding."
        )
    else:
        try:
            rag_service = RAGService(settings=settings, engine=engine)
            seed_service = SeedService(rag_service=rag_service)
            await seed_service.seed_if_empty(
                tenant_id="tenant-1",
                docs_dir=Path("test_docs"),
            )
        except Exception:
            logger.warning(
                "Document seeding failed — startup continues without seeded docs.",
                exc_info=True,
            )

    yield
    # Shutdown: dispose engine
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Routers
    app.include_router(api_router, prefix=settings.API_PREFIX)

    @app.get("/health", tags=["health"])
    async def health_check():
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
