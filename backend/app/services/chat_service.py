from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.chat_repository import ChatRepository
from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionList,
    ChatSessionResponse,
    ChatSessionWithMessages,
)

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ChatRepository(db)

    async def create_session(
        self,
        tenant_id: str,
        data: ChatSessionCreate,
    ) -> ChatSessionResponse:
        session = await self.repo.create_session(
            tenant_id=tenant_id,
            title=data.title,
        )
        return ChatSessionResponse.model_validate(session)

    async def get_session(
        self,
        session_id: str,
        tenant_id: str,
    ) -> ChatSessionWithMessages | None:
        session = await self.repo.get_session(session_id, tenant_id)
        if not session:
            return None
        return ChatSessionWithMessages.model_validate(session)

    async def list_sessions(
        self,
        tenant_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> ChatSessionList:
        sessions, total = await self.repo.list_sessions(
            tenant_id=tenant_id,
            limit=limit,
            offset=offset,
        )
        return ChatSessionList(
            sessions=[ChatSessionResponse.model_validate(s) for s in sessions],
            total=total,
        )

    async def delete_session(self, session_id: str, tenant_id: str) -> bool:
        return await self.repo.delete_session(session_id, tenant_id)

    async def update_title(
        self,
        session_id: str,
        tenant_id: str,
        title: str,
    ) -> ChatSessionResponse | None:
        session = await self.repo.update_session_title(session_id, tenant_id, title)
        if not session:
            return None
        return ChatSessionResponse.model_validate(session)

    async def add_message(
        self,
        session_id: str,
        tenant_id: str,
        data: ChatMessageCreate,
    ) -> ChatMessageResponse:
        # Verify session belongs to tenant
        session = await self.repo.get_session(session_id, tenant_id)
        if not session:
            raise ValueError(f"Chat session {session_id} not found for tenant {tenant_id}.")
        message = await self.repo.add_message(
            session_id=session_id,
            role=data.role,
            content=data.content,
            sources=data.sources,
            confidence_score=data.confidence_score,
        )
        return ChatMessageResponse.model_validate(message)

    async def get_messages(
        self,
        session_id: str,
        tenant_id: str,
    ) -> list[ChatMessageResponse]:
        # Verify session belongs to tenant
        session = await self.repo.get_session(session_id, tenant_id)
        if not session:
            raise ValueError(f"Chat session {session_id} not found for tenant {tenant_id}.")
        messages = await self.repo.get_messages(session_id)
        return [ChatMessageResponse.model_validate(m) for m in messages]
