from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat_session import ChatMessage, ChatSession


class ChatRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Sessions ──────────────────────────────────────────────────────────

    async def create_session(self, tenant_id: str, title: str = "New Chat") -> ChatSession:
        session = ChatSession(tenant_id=tenant_id, title=title)
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_session(self, session_id: str, tenant_id: str) -> ChatSession | None:
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id, ChatSession.tenant_id == tenant_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        tenant_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[ChatSession], int]:
        count_stmt = (
            select(func.count()).select_from(ChatSession).where(ChatSession.tenant_id == tenant_id)
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar_one()

        stmt = (
            select(ChatSession)
            .where(ChatSession.tenant_id == tenant_id)
            .order_by(ChatSession.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        sessions = list(result.scalars().all())
        return sessions, total

    async def delete_session(self, session_id: str, tenant_id: str) -> bool:
        session = await self.get_session(session_id, tenant_id)
        if not session:
            return False
        await self.db.delete(session)
        await self.db.flush()
        return True

    async def update_session_title(
        self,
        session_id: str,
        tenant_id: str,
        title: str,
    ) -> ChatSession | None:
        session = await self.get_session(session_id, tenant_id)
        if not session:
            return None
        session.title = title
        await self.db.flush()
        return session

    # ── Messages ──────────────────────────────────────────────────────────

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        sources: list[dict] | None = None,
        confidence_score: float | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            sources=sources,
            confidence_score=confidence_score,
        )
        self.db.add(message)
        await self.db.flush()
        return message

    async def get_messages(self, session_id: str) -> list[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
