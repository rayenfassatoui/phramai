from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.repositories.document_repository import DocumentRepository
from app.schemas.document import (
    DocumentCreate,
    DocumentReadWithScore,
    DocumentUpdate,
    SimilaritySearchRequest,
)


class DocumentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = DocumentRepository(session)

    async def create(self, payload: DocumentCreate) -> Document:
        document = Document(
            title=payload.title,
            content=payload.content,
            embedding=payload.embedding,
            meta=payload.meta,
        )
        return await self._repo.create(document)

    async def get_or_404(self, document_id: int) -> Document:
        document = await self._repo.get_by_id(document_id)
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document {document_id} not found.",
            )
        return document

    async def list(self, *, offset: int = 0, limit: int = 20) -> list[Document]:
        return await self._repo.list(offset=offset, limit=limit)

    async def update(self, document_id: int, payload: DocumentUpdate) -> Document:
        document = await self.get_or_404(document_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(document, field, value)
        return await self._repo.update(document)

    async def delete(self, document_id: int) -> None:
        document = await self.get_or_404(document_id)
        await self._repo.delete(document)

    async def similarity_search(
        self, request: SimilaritySearchRequest
    ) -> list[DocumentReadWithScore]:
        rows = await self._repo.similarity_search(
            request.query_vector,
            top_k=request.top_k,
            metric=request.metric,
        )
        return [
            DocumentReadWithScore(
                **{
                    k: getattr(doc, k)
                    for k in ("id", "title", "content", "embedding", "meta", "created_at", "updated_at")
                },
                score=score,
            )
            for doc, score in rows
        ]
