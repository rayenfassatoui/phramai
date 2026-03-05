import secrets
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

# Hardcoded tenant API keys: {api_key: tenant_id}
TENANT_API_KEYS: dict[str, str] = {
    "tenant-1-secret-key": "tenant-1",
    "tenant-2-secret-key": "tenant-2",
    "tenant-3-secret-key": "tenant-3",
}

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_tenant_from_api_key(
    api_key: str | None = Security(api_key_header),
) -> str:
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header is required",
        )
    for stored_key, tenant_id in TENANT_API_KEYS.items():
        if secrets.compare_digest(api_key, stored_key):
            return tenant_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )
