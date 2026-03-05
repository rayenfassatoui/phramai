from __future__ import annotations

import logging
from pathlib import Path

from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


class SeedService:
    def __init__(self, rag_service: RAGService) -> None:
        self.rag_service = rag_service

    async def seed_if_empty(self, tenant_id: str, docs_dir: Path) -> None:
        """Ingest all .txt files from docs_dir into the tenant vector store.

        Idempotent: checks whether documents already exist before ingesting.
        If the vector store already has content, seeding is skipped entirely.
        """
        store = await self.rag_service._get_vector_store(tenant_id)
        existing = await store.asimilarity_search("test", k=1)
        if existing:
            logger.info(
                "Seed skipped — tenant %s vector store already has content.",
                tenant_id,
            )
            return

        txt_files = sorted(docs_dir.glob("*.txt"))
        if not txt_files:
            logger.warning(
                "No .txt files found in %s — nothing to seed for tenant %s.",
                docs_dir,
                tenant_id,
            )
            return

        logger.info(
            "Seeding tenant %s with %d document(s) from %s ...",
            tenant_id,
            len(txt_files),
            docs_dir,
        )
        for file_path in txt_files:
            text = file_path.read_text(encoding="utf-8")
            await self.rag_service.ingest_document(
                tenant_id=tenant_id,
                text=text,
                filename=file_path.name,
                metadata={"source": file_path.name, "tenant": tenant_id},
            )
            logger.info("Ingested: %s", file_path.name)

        logger.info("Seeding complete for tenant %s.", tenant_id)
