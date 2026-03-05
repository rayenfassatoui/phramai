from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from time import perf_counter

from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_nvidia_ai_endpoints import ChatNVIDIA, NVIDIAEmbeddings
from langchain_postgres import PGEngine, PGVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import Settings
from app.schemas.rag import IngestResponse, QueryResponse, SourceDocument

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self, settings: Settings, engine: AsyncEngine) -> None:
        self.settings = settings
        self.engine = engine
        self.llm = ChatNVIDIA(
            model="meta/llama-3.3-70b-instruct",
            max_tokens=1024,
            api_key=self.settings.NVIDIA_API_KEY,
        )
        self.embeddings = NVIDIAEmbeddings(
            model="nvidia/nv-embedqa-e5-v5",
            api_key=self.settings.NVIDIA_API_KEY,
        )

    async def _get_vector_store(self, tenant_id: str) -> PGVectorStore:
        table_name = f"docs_{tenant_id}"
        pg_engine = PGEngine.from_engine(engine=self.engine)
        try:
            await pg_engine.ainit_vectorstore_table(
                table_name=table_name,
                vector_size=1024,
                overwrite_existing=False,
            )
        except ProgrammingError:
            # Table already exists from a prior seeding/query — safe to ignore
            logging.getLogger(__name__).debug(
                "Vector store table %s already exists, skipping creation.",
                table_name,
            )
        return await PGVectorStore.create(
            engine=pg_engine,
            table_name=table_name,
            embedding_service=self.embeddings,
        )

    def _normalize_metadata(self, metadata: dict) -> dict[str, str]:
        return {str(key): str(value) for key, value in metadata.items()}

    async def ingest_document(
        self,
        tenant_id: str,
        text: str,
        filename: str,
        metadata: dict,
    ) -> IngestResponse:
        if not text or not text.strip():
            raise ValueError(f"Cannot ingest empty document: {filename}")
        splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)
        chunks = splitter.create_documents([text])

        normalized_metadata = self._normalize_metadata(metadata)
        for chunk in chunks:
            chunk.metadata = {
                **normalized_metadata,
                "filename": filename,
            }

        try:
            store = await self._get_vector_store(tenant_id)
            await store.aadd_documents(chunks)
        except Exception:
            logger.error(
                "Failed to store document chunks for tenant %s, file %s.",
                tenant_id,
                filename,
                exc_info=True,
            )
            raise

        return IngestResponse(
            document_id=filename,
            chunks_created=len(chunks),
            tenant_id=tenant_id,
        )

    async def query(self, tenant_id: str, question: str) -> QueryResponse:
        start_time = perf_counter()

        try:
            store = await self._get_vector_store(tenant_id)
        except Exception:
            logger.error(
                "Failed to connect to vector store for tenant %s.", tenant_id, exc_info=True
            )
            raise RuntimeError(f"Vector store unavailable for tenant {tenant_id}.")

        retriever = store.as_retriever()

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a pharmaceutical regulatory compliance expert. Use the "
                    "provided context to answer questions about EMA, FDA, and ICH "
                    "guidelines. Be precise and cite specific regulations when possible. "
                    "If the context does not contain enough information, say so clearly.\n"
                    "Context: {context}",
                ),
                ("human", "{question}"),
            ]
        )

        def format_docs(docs: list[Document]) -> str:
            return "\n\n".join(doc.page_content for doc in docs)

        rag_chain = (
            {
                "context": retriever | format_docs,
                "question": RunnablePassthrough(),
            }
            | prompt
            | self.llm
            | StrOutputParser()
        )

        try:
            retrieved_docs = await retriever.ainvoke(question)
        except Exception:
            logger.error("Document retrieval failed for tenant %s.", tenant_id, exc_info=True)
            raise RuntimeError("Failed to retrieve relevant documents.")

        try:
            answer = await rag_chain.ainvoke(question)
        except Exception:
            logger.error("LLM generation failed for tenant %s.", tenant_id, exc_info=True)
            raise RuntimeError(
                "The language model is temporarily unavailable. Please try again later."
            )

        sources = self._build_sources(retrieved_docs)
        confidence = self._compute_confidence(retrieved_docs)
        duration_ms = (perf_counter() - start_time) * 1000

        return QueryResponse(
            answer=answer,
            sources=sources,
            tenant_id=tenant_id,
            duration_ms=duration_ms,
            confidence_score=confidence,
        )

    async def query_stream(
        self,
        tenant_id: str,
        question: str,
    ) -> AsyncGenerator[str, None]:
        """Stream query response as SSE events using LangChain astream_events."""
        start_time = perf_counter()

        try:
            store = await self._get_vector_store(tenant_id)
        except Exception:
            logger.error(
                "Failed to connect to vector store for tenant %s.", tenant_id, exc_info=True
            )
            yield f"data: {json.dumps({'type': 'error', 'error': 'Vector store unavailable.'})}\n\n"
            return

        retriever = store.as_retriever()

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a pharmaceutical regulatory compliance expert. Use the "
                    "provided context to answer questions about EMA, FDA, and ICH "
                    "guidelines. Be precise and cite specific regulations when possible. "
                    "If the context does not contain enough information, say so clearly.\n"
                    "Context: {context}",
                ),
                ("human", "{question}"),
            ]
        )

        def format_docs(docs: list[Document]) -> str:
            return "\n\n".join(doc.page_content for doc in docs)

        rag_chain = (
            {
                "context": retriever | format_docs,
                "question": RunnablePassthrough(),
            }
            | prompt
            | self.llm
            | StrOutputParser()
        )

        # First, retrieve documents for sources and confidence
        try:
            retrieved_docs = await retriever.ainvoke(question)
        except Exception:
            logger.error("Document retrieval failed for tenant %s.", tenant_id, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Failed to retrieve documents.'})}\n\n"
            return

        sources = self._build_sources(retrieved_docs)
        confidence = self._compute_confidence(retrieved_docs)

        # Send sources and confidence first
        yield f"data: {json.dumps({'type': 'sources', 'sources': [s.model_dump() for s in sources], 'confidence_score': confidence})}\n\n"

        # Stream the LLM response token-by-token
        full_answer = ""
        try:
            async for event in rag_chain.astream_events(question, version="v2"):
                kind = event.get("event", "")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        token = chunk.content
                        full_answer += token
                        yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
        except Exception:
            logger.error("LLM streaming failed for tenant %s.", tenant_id, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': 'LLM streaming failed.'})}\n\n"
            return

        duration_ms = (perf_counter() - start_time) * 1000

        # Send completion event
        yield f"data: {json.dumps({'type': 'done', 'duration_ms': duration_ms, 'confidence_score': confidence})}\n\n"
        yield "data: [DONE]\n\n"

    def _build_sources(self, docs: list[Document]) -> list[SourceDocument]:
        sources: list[SourceDocument] = []
        for doc in docs:
            sources.append(
                SourceDocument(
                    content=doc.page_content,
                    metadata=self._normalize_metadata(doc.metadata),
                )
            )
        return sources

    @staticmethod
    def _compute_confidence(docs: list[Document]) -> float:
        """Compute a confidence score based on retrieved document relevance.

        Uses the number and metadata of retrieved documents as a heuristic.
        Score ranges from 0.0 to 1.0:
        - 0.0: No documents retrieved
        - Higher scores: More documents with richer metadata
        """
        if not docs:
            return 0.0

        # Base score from number of retrieved docs (max at 4+)
        doc_count_score = min(len(docs) / 4.0, 1.0)

        # Content quality score: average of content length ratios (longer = more relevant context)
        content_lengths = [len(doc.page_content) for doc in docs]
        avg_length = sum(content_lengths) / len(content_lengths) if content_lengths else 0
        # Normalize: 500+ chars is considered good content
        content_score = min(avg_length / 500.0, 1.0)

        # Metadata richness: docs with page_number or filename are higher quality
        metadata_scores = []
        for doc in docs:
            meta = doc.metadata or {}
            has_filename = bool(meta.get("filename"))
            has_page = bool(meta.get("page_number"))
            metadata_scores.append((0.5 * has_filename + 0.5 * has_page))
        metadata_score = sum(metadata_scores) / len(metadata_scores) if metadata_scores else 0

        # Weighted combination
        confidence = 0.5 * doc_count_score + 0.3 * content_score + 0.2 * metadata_score
        return round(min(confidence, 1.0), 3)

    async def list_tenant_documents(self, tenant_id: str) -> list[dict]:
        """List distinct ingested document filenames for a tenant."""
        from sqlalchemy import text

        table_name = f"docs_{tenant_id}"
        async with self.engine.connect() as conn:
            # Check if table exists first
            check = await conn.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :tbl)"
                ),
                {"tbl": table_name},
            )
            exists = check.scalar()
            if not exists:
                return []

            result = await conn.execute(
                text(f"""
                    SELECT
                        langchain_metadata->>'filename' AS filename,
                        COUNT(*) AS chunk_count,
                        MIN(langchain_metadata->>'page_number') AS first_page,
                        MAX(langchain_metadata->>'page_number') AS last_page
                    FROM \"{table_name}\"
                    WHERE langchain_metadata->>'filename' IS NOT NULL
                    GROUP BY langchain_metadata->>'filename'
                    ORDER BY langchain_metadata->>'filename'
                """)
            )
            rows = result.fetchall()
            return [
                {
                    "filename": row.filename,
                    "chunk_count": row.chunk_count,
                    "first_page": row.first_page,
                    "last_page": row.last_page,
                }
                for row in rows
            ]

    async def get_document_preview(self, tenant_id: str, filename: str) -> str:
        """Get the full text content of a document by reconstructing from chunks."""
        from sqlalchemy import text

        table_name = f"docs_{tenant_id}"
        async with self.engine.connect() as conn:
            result = await conn.execute(
                text(f"""
                    SELECT content
                    FROM \"{table_name}\"
                    WHERE langchain_metadata->>'filename' = :fname
                    ORDER BY (langchain_metadata->>'page_number')::int NULLS LAST
                """),
                {"fname": filename},
            )
            rows = result.fetchall()
            if not rows:
                return ""
            return "\n\n".join(row.content for row in rows)

    async def delete_tenant_document(self, tenant_id: str, filename: str) -> int:
        """Delete all chunks for a given document filename from the tenant's vector store."""
        from sqlalchemy import text

        table_name = f"docs_{tenant_id}"
        async with self.engine.begin() as conn:
            result = await conn.execute(
                text(f"""DELETE FROM \"{table_name}\" WHERE langchain_metadata->>'filename' = :fname"""),
                {"fname": filename},
            )
            return result.rowcount
