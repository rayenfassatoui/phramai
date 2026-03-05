from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import VECTOR_DIMENSIONS


class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    embedding: list[float] | None = Field(
        default=None,
        description=f"Pre-computed embedding vector of length {VECTOR_DIMENSIONS}.",
    )
    meta: dict | None = Field(default=None)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: str | None = Field(default=None, min_length=1)
    embedding: list[float] | None = Field(default=None)
    meta: dict | None = Field(default=None)


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    embedding: list[float] | None
    meta: dict | None
    created_at: datetime
    updated_at: datetime


class DocumentReadWithScore(DocumentRead):
    """Returned by similarity search — includes distance score (lower = more similar)."""

    score: float


class SimilaritySearchRequest(BaseModel):
    query_vector: list[float] = Field(
        ...,
        description=f"Query embedding vector of length {VECTOR_DIMENSIONS}.",
    )
    top_k: int = Field(default=5, ge=1, le=100)
    metric: str = Field(
        default="cosine",
        description="Distance metric: 'cosine', 'l2', or 'inner_product'.",
        pattern="^(cosine|l2|inner_product)$",
    )
