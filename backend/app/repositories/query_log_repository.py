from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.query_log import QueryLog


class QueryLogRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self, tenant_id: str, question: str, answer: str, duration_ms: float, nb_sources: int = 0,
    ) -> QueryLog:
        log = QueryLog(
            tenant_id=tenant_id,
            question=question,
            answer=answer,
            duration_ms=duration_ms,
            nb_sources=nb_sources,
        )
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log)
        return log

    async def get_metrics(self, tenant_id: str) -> dict:
        stmt = select(
            func.count(QueryLog.id).label("total_queries"),
            func.avg(QueryLog.duration_ms).label("avg_response_time_ms"),
        ).where(QueryLog.tenant_id == tenant_id)

        result = await self.db.execute(stmt)
        total_queries, avg_response_time_ms = result.first() or (0, 0.0)

        return {
            "tenant_id": tenant_id,
            "total_queries": total_queries or 0,
            "avg_response_time_ms": float(avg_response_time_ms or 0.0),
        }
