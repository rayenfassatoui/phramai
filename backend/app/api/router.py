from fastapi import APIRouter

from app.api.endpoints import chat, documents, rag

router = APIRouter()
router.include_router(chat.router)
router.include_router(documents.router)
router.include_router(rag.router)
