# Import all models here so SQLAlchemy's metadata discovers them for create_all.
from app.models.document import Document  # noqa: F401
from app.models.query_log import QueryLog  # noqa: F401
from app.models.chat_session import ChatMessage, ChatSession  # noqa: F401
