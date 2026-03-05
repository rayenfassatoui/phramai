from pydantic import BaseModel, ConfigDict


# ── Source Document ───────────────────────────────────────────────────────────
class SourceDocument(BaseModel):
    content: str
    metadata: dict[str, str]


# ── Query ─────────────────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    answer: str
    sources: list[SourceDocument]
    tenant_id: str
    duration_ms: float
    confidence_score: float = 0.0


# ── Ingest ────────────────────────────────────────────────────────────────────
class IngestRequest(BaseModel):
    document_name: str
    text: str

class IngestResponse(BaseModel):
    document_id: str
    chunks_created: int
    tenant_id: str


# ── Metrics ───────────────────────────────────────────────────────────────────
class MetricsResponse(BaseModel):
    tenant_id: str
    total_queries: int
    avg_response_time_ms: float


# ── PDF Upload ───────────────────────────────────────────────────────────────
class PDFUploadResponse(BaseModel):
    job_id: str
    filename: str
    status: str = "processing"
    message: str = "PDF upload accepted. Processing in background."


class PDFJobStatusResponse(BaseModel):
    job_id: str
    status: str  # pending | processing | complete | failed
    filename: str
    chunks_created: int | None = None
    total_pages: int | None = None
    error: str | None = None


# ── Tenant Documents ─────────────────────────────────────────────────────────
class TenantDocumentInfo(BaseModel):
    filename: str
    chunk_count: int
    first_page: str | None = None
    last_page: str | None = None


class TenantDocumentListResponse(BaseModel):
    tenant_id: str
    documents: list[TenantDocumentInfo]


class DocumentPreviewResponse(BaseModel):
    tenant_id: str
    filename: str
    content: str


class DeleteDocumentResponse(BaseModel):
    tenant_id: str
    filename: str
    chunks_deleted: int
