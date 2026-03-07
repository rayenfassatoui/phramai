import logging
from io import BytesIO

from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient

from app.core.config import Settings

logger = logging.getLogger(__name__)


class BlobStorageService:
    """Async Azure Blob Storage service for PDF document storage."""

    def __init__(self, settings: Settings) -> None:
        self._connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
        self._container_name = settings.AZURE_STORAGE_CONTAINER

    def _blob_path(self, tenant_id: str, filename: str) -> str:
        return f"{tenant_id}/{filename}"

    async def upload(self, tenant_id: str, filename: str, data: bytes) -> str:
        """Upload a file to blob storage. Returns the blob path."""
        blob_path = self._blob_path(tenant_id, filename)
        async with BlobServiceClient.from_connection_string(self._connection_string) as client:
            container = client.get_container_client(self._container_name)
            await container.upload_blob(
                name=blob_path,
                data=data,
                overwrite=True,
                content_settings=ContentSettings(content_type="application/pdf"),
            )
        logger.info("Uploaded blob: %s", blob_path)
        return blob_path

    async def download(self, tenant_id: str, filename: str) -> bytes:
        """Download a file from blob storage. Returns the file bytes."""
        blob_path = self._blob_path(tenant_id, filename)
        async with BlobServiceClient.from_connection_string(self._connection_string) as client:
            blob = client.get_blob_client(self._container_name, blob_path)
            stream = await blob.download_blob()
            buf = BytesIO()
            await stream.readinto(buf)
            return buf.getvalue()

    async def delete(self, tenant_id: str, filename: str) -> None:
        """Delete a file from blob storage."""
        blob_path = self._blob_path(tenant_id, filename)
        async with BlobServiceClient.from_connection_string(self._connection_string) as client:
            blob = client.get_blob_client(self._container_name, blob_path)
            await blob.delete_blob(delete_snapshots="include")
        logger.info("Deleted blob: %s", blob_path)

    async def exists(self, tenant_id: str, filename: str) -> bool:
        """Check if a blob exists."""
        blob_path = self._blob_path(tenant_id, filename)
        async with BlobServiceClient.from_connection_string(self._connection_string) as client:
            blob = client.get_blob_client(self._container_name, blob_path)
            return await blob.exists()
