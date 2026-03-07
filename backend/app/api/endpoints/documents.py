from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import RATE_AI, RATE_READ, RATE_WRITE, limiter
from app.db.database import get_db
from app.schemas.document import (
    DocumentCreate,
    DocumentRead,
    DocumentReadWithScore,
    DocumentUpdate,
    SimilaritySearchRequest,
)
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


def _svc(db: AsyncSession = Depends(get_db)) -> DocumentService:
    return DocumentService(db)


@router.post(
    "/",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a document (optionally with a pre-computed embedding)",
)
@limiter.limit(RATE_WRITE)
async def create_document(
    request: Request,
    payload: DocumentCreate,
    svc: DocumentService = Depends(_svc),
) -> DocumentRead:
    doc = await svc.create(payload)
    return DocumentRead.model_validate(doc)


@router.get(
    "/",
    response_model=list[DocumentRead],
    summary="List documents with pagination",
)
@limiter.limit(RATE_READ)
async def list_documents(
    request: Request,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    svc: DocumentService = Depends(_svc),
) -> list[DocumentRead]:
    docs = await svc.list(offset=offset, limit=limit)
    return [DocumentRead.model_validate(d) for d in docs]


@router.get(
    "/{document_id}",
    response_model=DocumentRead,
    summary="Get a single document by ID",
)
@limiter.limit(RATE_READ)
async def get_document(
    request: Request,
    document_id: int,
    svc: DocumentService = Depends(_svc),
) -> DocumentRead:
    doc = await svc.get_or_404(document_id)
    return DocumentRead.model_validate(doc)


@router.patch(
    "/{document_id}",
    response_model=DocumentRead,
    summary="Partially update a document",
)
@limiter.limit(RATE_WRITE)
async def update_document(
    request: Request,
    document_id: int,
    payload: DocumentUpdate,
    svc: DocumentService = Depends(_svc),
) -> DocumentRead:
    doc = await svc.update(document_id, payload)
    return DocumentRead.model_validate(doc)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
@limiter.limit(RATE_WRITE)
async def delete_document(
    request: Request,
    document_id: int,
    svc: DocumentService = Depends(_svc),
) -> None:
    await svc.delete(document_id)


@router.post(
    "/search/similarity",
    response_model=list[DocumentReadWithScore],
    summary="Semantic similarity search using a query embedding vector",
)
@limiter.limit(RATE_AI)
async def similarity_search(
    request: Request,
    body: SimilaritySearchRequest,
    svc: DocumentService = Depends(_svc),
) -> list[DocumentReadWithScore]:
    return await svc.similarity_search(body)
