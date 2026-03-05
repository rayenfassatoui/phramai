from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_ignore_empty=True, extra="ignore")

    # App
    APP_NAME: str = "FastAPI App"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    API_PREFIX: str = "/api"
    UPLOAD_DIR: str = "uploads"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/app_db"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # NVIDIA NIM
    NVIDIA_API_KEY: str = ""
    LLM_MODEL: str = "meta/llama-3.3-70b-instruct"
    NVIDIA_EMBEDDING_MODEL: str = "nvidia/nv-embedqa-e5-v5"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
