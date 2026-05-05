"""
Supabase Storage service for permanent document storage.

Uploaded PDFs/docs are stored in the Supabase "materials" bucket.
The local ./uploads folder is used only as a temp directory during
background processing, then cleaned up immediately.
"""

from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET

_client: Client = None


def _get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env\n"
                "Get them from: Supabase Dashboard → Settings → API"
            )
        if SUPABASE_SERVICE_KEY == "your_service_role_key_here":
            raise ValueError("SUPABASE_SERVICE_KEY is not set. Replace the placeholder in .env")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def upload_material(filename: str, content: bytes) -> str:
    """
    Upload file bytes to Supabase Storage.
    Returns the public URL of the uploaded file.
    """
    sb = _get_client()
    sb.storage.from_(SUPABASE_BUCKET).upload(
        path=filename,
        file=content,
        file_options={"content-type": "application/octet-stream"},
    )
    return sb.storage.from_(SUPABASE_BUCKET).get_public_url(filename)


def delete_material(filename: str) -> None:
    """Delete a file from Supabase Storage. Silently ignores errors."""
    try:
        sb = _get_client()
        sb.storage.from_(SUPABASE_BUCKET).remove([filename])
    except Exception:
        pass
