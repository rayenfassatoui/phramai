from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Chat Message ──────────────────────────────────────────────────────────────


class ChatMessageCreate(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1)
    sources: list[dict] | None = None
    confidence_score: float | None = Field(None, ge=0.0, le=1.0)


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: str
    role: str
    content: str
    sources: list[dict] | None = None
    confidence_score: float | None = None
    created_at: datetime


# ── Chat Session ──────────────────────────────────────────────────────────────


class ChatSessionCreate(BaseModel):
    title: str = Field(default="New Chat", max_length=500)


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionWithMessages(ChatSessionResponse):
    messages: list[ChatMessageResponse] = []


class ChatSessionList(BaseModel):
    sessions: list[ChatSessionResponse]
    total: int
