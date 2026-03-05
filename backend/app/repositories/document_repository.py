from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document


class DocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create(self, document: Document) -> Document:
        self._session.add(document)
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def get_by_id(self, document_id: int) -> Document | None:
        result = await self._session.execute(
            select(Document).where(Document.id == document_id)
        )
        return result.scalar_one_or_none()

    async def list(self, *, offset: int = 0, limit: int = 20) -> list[Document]:
        result = await self._session.execute(
            select(Document).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, document: Document) -> Document:
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def delete(self, document: Document) -> None:
        await self._session.delete(document)
        await self._session.flush()

    # ------------------------------------------------------------------
    # Vector similarity search
    # ------------------------------------------------------------------

    async def similarity_search(
        self,
        query_vector: list[float],
        *,
        top_k: int = 5,
        metric: str = "cosine",
    ) -> list[tuple[Document, float]]:
        """
        Return `top_k` documents ordered by distance to `query_vector`.
        Each result is a (Document, score) tuple — score is the raw distance
        so lower is always more similar.

        Supported metrics:
          - "cosine"         -> cosine distance   (1 - cosine_similarity)
          - "l2"             -> Euclidean distance
          - "inner_product"  -> negative inner product (higher dot product = lower score)
        """
        col = Document.embedding

        match metric:
            case "cosine":
                distance_expr = col.cosine_distance(query_vector)
            case "l2":
                distance_expr = col.l2_distance(query_vector)
            case "inner_product":
                distance_expr = col.max_inner_product(query_vector)
            case _:
                distance_expr = col.cosine_distance(query_vector)

        result = await self._session.execute(
            select(Document, distance_expr.label("score"))
            .where(Document.embedding.is_not(None))
            .order_by(distance_expr)
            .limit(top_k)
        )
        return [(row.Document, row.score) for row in result.all()]
