import logging
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_key import get_tenant_from_api_key
from app.core.config import settings
from app.db.database import engine, get_db
from app.schemas.rag import (
    DeleteDocumentResponse,
    DocumentPreviewResponse,
    IngestRequest,
    IngestResponse,
    MetricsResponse,
    PDFJobStatusResponse,
    PDFUploadResponse,
    QueryRequest,
    QueryResponse,
    TenantDocumentInfo,
    TenantDocumentListResponse,
)
from app.repositories.query_log_repository import QueryLogRepository
from app.services.pdf_service import PDFService
from app.services.rag_service import RAGService

router = APIRouter(tags=["rag"])

# In-memory job tracking for async PDF processing
_pdf_jobs: dict[str, dict] = {}


def get_rag_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RAGService:
    return RAGService(settings=settings, engine=engine)


def get_query_log_repo(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QueryLogRepository:
    return QueryLogRepository(db=db)


@router.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}


@router.post("/query", response_model=QueryResponse)
async def query(
    body: QueryRequest,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
    query_log_repo: Annotated[QueryLogRepository, Depends(get_query_log_repo)],
):
    try:
        response = await rag_service.query(tenant_id=tenant_id, question=body.question)
    except Exception as exc:
        logging.getLogger(__name__).error("RAG query failed for tenant %s: %s", tenant_id, exc)
        raise HTTPException(
            status_code=502, detail="The AI service is temporarily unavailable. Please try again."
        ) from exc
    await query_log_repo.create(
        tenant_id=tenant_id,
        question=body.question,
        answer=response.answer,
        duration_ms=response.duration_ms,
        nb_sources=len(response.sources),
    )
    return response


@router.post("/query/stream")
async def query_stream(
    body: QueryRequest,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
):
    """Stream query response as Server-Sent Events (SSE)."""
    return StreamingResponse(
        rag_service.query_stream(tenant_id=tenant_id, question=body.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/documents/ingest", response_model=IngestResponse)
async def ingest_document(
    body: IngestRequest,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
):
    try:
        response = await rag_service.ingest_document(
            tenant_id=tenant_id,
            text=body.text,
            filename=body.document_name,
            metadata={},
        )
    except Exception as exc:
        logging.getLogger(__name__).error(
            "Document ingestion failed for tenant %s: %s", tenant_id, exc
        )
        raise HTTPException(
            status_code=502, detail="Document ingestion failed. Please try again."
        ) from exc
    return response


async def _process_pdf_background(
    job_id: str,
    tenant_id: str,
    content: bytes,
    filename: str,
) -> None:
    """Background task: parse PDF and ingest into RAG pipeline."""
    try:
        _pdf_jobs[job_id]["status"] = "processing"

        pdf_service = PDFService()
        result = await pdf_service.parse_pdf(content, filename)

        rag_service = RAGService(settings=settings, engine=engine)

        total_chunks = 0
        for page in result.pages:
            ingest_result = await rag_service.ingest_document(
                tenant_id=tenant_id,
                text=page.text,
                filename=filename,
                metadata={"page_number": str(page.page_number), "source": filename},
            )
            total_chunks += ingest_result.chunks_created

        _pdf_jobs[job_id].update(
            {
                "status": "complete",
                "chunks_created": total_chunks,
                "total_pages": result.total_pages,
            }
        )
        logging.getLogger(__name__).info(
            "PDF processing complete: job=%s file=%s pages=%d chunks=%d",
            job_id,
            filename,
            result.total_pages,
            total_chunks,
        )
    except Exception as exc:
        logging.getLogger(__name__).error(
            "PDF processing failed: job=%s file=%s error=%s",
            job_id,
            filename,
            exc,
            exc_info=True,
        )
        _pdf_jobs[job_id].update(
            {
                "status": "failed",
                "error": str(exc),
            }
        )


@router.post(
    "/documents/upload",
    response_model=PDFUploadResponse,
    status_code=202,
)
async def upload_pdf(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
):
    """Upload a PDF file for async background processing and RAG ingestion."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50MB.")

    # Validate PDF magic bytes early
    if not content[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    # Persist original PDF to disk for later preview/serving
    upload_dir = Path(settings.UPLOAD_DIR) / tenant_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / file.filename).write_bytes(content)


    job_id = str(uuid.uuid4())
    _pdf_jobs[job_id] = {
        "status": "pending",
        "filename": file.filename,
        "chunks_created": None,
        "total_pages": None,
        "error": None,
    }

    background_tasks.add_task(
        _process_pdf_background,
        job_id=job_id,
        tenant_id=tenant_id,
        content=content,
        filename=file.filename,
    )

    return PDFUploadResponse(job_id=job_id, filename=file.filename)


@router.get("/documents/jobs/{job_id}", response_model=PDFJobStatusResponse)
async def get_job_status(
    job_id: str,
    _: Annotated[str, Depends(get_tenant_from_api_key)],
):
    """Check the status of an async PDF processing job."""
    job = _pdf_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return PDFJobStatusResponse(job_id=job_id, **job)


@router.get("/metrics/{tenant_id}", response_model=MetricsResponse)
async def get_metrics(
    tenant_id: str,
    _: Annotated[str, Depends(get_tenant_from_api_key)],
    query_log_repo: Annotated[QueryLogRepository, Depends(get_query_log_repo)],
):
    metrics = await query_log_repo.get_metrics(tenant_id=tenant_id)
    return MetricsResponse(**metrics)


@router.get("/tenant-documents", response_model=TenantDocumentListResponse)
async def list_tenant_documents(
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
):
    """List all ingested documents for the authenticated tenant."""
    docs = await rag_service.list_tenant_documents(tenant_id)
    return TenantDocumentListResponse(
        tenant_id=tenant_id,
        documents=[TenantDocumentInfo(**d) for d in docs],
    )


@router.get("/tenant-documents/{filename}/preview", response_model=DocumentPreviewResponse)
async def get_document_preview(
    filename: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
):
    """Get the full reconstructed text of a document for preview."""
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    content = await rag_service.get_document_preview(tenant_id, filename)
    if not content:
        raise HTTPException(status_code=404, detail=f"Document '{filename}' not found.")
    return DocumentPreviewResponse(
        tenant_id=tenant_id,
        filename=filename,
        content=content,
    )


@router.get("/tenant-documents/{filename}/file")
async def serve_document_file(
    filename: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
):
    """Serve the original uploaded PDF file for in-browser preview."""
    # Guard against path traversal attacks
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = Path(settings.UPLOAD_DIR) / tenant_id / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": "inline"},
    )

@router.delete("/tenant-documents/{filename}", response_model=DeleteDocumentResponse)
async def delete_tenant_document(
    filename: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    rag_service: Annotated[RAGService, Depends(get_rag_service)],
):
    """Delete all chunks for a document from the tenant's vector store."""
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    chunks_deleted = await rag_service.delete_tenant_document(tenant_id, filename)
    # Also remove the original PDF file from disk
    pdf_path = Path(settings.UPLOAD_DIR) / tenant_id / filename
    if pdf_path.is_file():
        pdf_path.unlink()
    if chunks_deleted == 0:
        raise HTTPException(status_code=404, detail=f"Document '{filename}' not found.")
    return DeleteDocumentResponse(
        tenant_id=tenant_id,
        filename=filename,
        chunks_deleted=chunks_deleted,
    )
