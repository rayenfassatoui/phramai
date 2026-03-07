import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_key import get_tenant_from_api_key
from app.core.rate_limit import RATE_READ, RATE_WRITE, limiter
from app.db.database import get_db
from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionList,
    ChatSessionResponse,
    ChatSessionWithMessages,
)
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def get_chat_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatService:
    return ChatService(db=db)


# ── Sessions ──────────────────────────────────────────────────────────────────


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
@limiter.limit(RATE_WRITE)
async def create_session(
    request: Request,
    body: ChatSessionCreate,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    return await chat_service.create_session(tenant_id=tenant_id, data=body)


@router.get("/sessions", response_model=ChatSessionList)
@limiter.limit(RATE_READ)
async def list_sessions(
    request: Request,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await chat_service.list_sessions(
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionWithMessages)
@limiter.limit(RATE_READ)
async def get_session(
    request: Request,
    session_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    result = await chat_service.get_session(session_id, tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return result


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
@limiter.limit(RATE_WRITE)
async def update_session_title(
    request: Request,
    session_id: str,
    body: ChatSessionCreate,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    result = await chat_service.update_title(session_id, tenant_id, body.title)
    if not result:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return result


@router.delete("/sessions/{session_id}", status_code=204)
@limiter.limit(RATE_WRITE)
async def delete_session(
    request: Request,
    session_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    deleted = await chat_service.delete_session(session_id, tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found.")


# ── Messages ──────────────────────────────────────────────────────────────────


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatMessageResponse,
    status_code=201,
)
@limiter.limit(RATE_WRITE)
async def add_message(
    request: Request,
    session_id: str,
    body: ChatMessageCreate,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    try:
        return await chat_service.add_message(session_id, tenant_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[ChatMessageResponse],
)
@limiter.limit(RATE_READ)
async def get_messages(
    request: Request,
    session_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_from_api_key)],
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
):
    try:
        return await chat_service.get_messages(session_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
