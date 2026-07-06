"""Media storage — real Supabase Storage (service-role key) with a local fallback.

Real Meta publishing needs a media URL Meta can fetch, so `supabase` uploads to a
PUBLIC Supabase bucket and returns a public URL. `local` writes under
.pixie_data/uploads and returns a backend URL — fine for demo/mock, but NOT
reachable by Meta (real IG publish will fail URL validation, honestly).

    PIXIE_STORAGE_PROVIDER=supabase|local   (default: supabase)
    PIXIE_STORAGE_BUCKET=pixie-content
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (server-side only)

Never fakes a successful upload: if the configured provider is unavailable it
raises StorageNotConfigured / StorageError.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

import httpx


class StorageNotConfigured(RuntimeError):
    pass


class StorageError(RuntimeError):
    pass


def provider() -> str:
    return os.getenv("PIXIE_STORAGE_PROVIDER", "supabase").strip().lower()


def bucket() -> str:
    return os.getenv("PIXIE_STORAGE_BUCKET", "pixie-content")


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def _service_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def is_configured() -> bool:
    if provider() == "local":
        return True
    return bool(_supabase_url() and _service_key())


def status() -> dict:
    return {"provider": provider(), "bucket": bucket(), "configured": is_configured(),
            "meta_reachable": provider() == "supabase" and is_configured()}


def _safe_name(filename: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in (filename or "file"))
    return keep[-80:] or "file"


def _local_dir() -> Path:
    d = Path(os.getenv("PIXIE_DATA_DIR", str(Path(__file__).resolve().parent / ".pixie_data"))) / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ensure_bucket(http: httpx.Client) -> None:
    headers = {"Authorization": f"Bearer {_service_key()}", "Content-Type": "application/json"}
    r = http.post(f"{_supabase_url()}/storage/v1/bucket",
                  headers=headers, json={"id": bucket(), "name": bucket(), "public": True})
    # 200 created, or already-exists → fine. Anything else is a real problem.
    if r.status_code >= 300 and "exist" not in r.text.lower() and r.status_code != 409:
        raise StorageError(f"Could not ensure bucket: {r.status_code} {r.text[:200]}")


def upload(tenant_id: str, filename: str, content: bytes, content_type: str) -> dict:
    """Store bytes and return {storage_provider, storage_path, public_url}."""
    path = f"{tenant_id}/{secrets.token_hex(8)}_{_safe_name(filename)}"

    if provider() == "supabase":
        if not is_configured():
            raise StorageNotConfigured(
                "Storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
                "(or set PIXIE_STORAGE_PROVIDER=local) to the backend environment."
            )
        with httpx.Client(timeout=60) as http:
            _ensure_bucket(http)
            r = http.post(
                f"{_supabase_url()}/storage/v1/object/{bucket()}/{path}",
                headers={"Authorization": f"Bearer {_service_key()}",
                         "Content-Type": content_type or "application/octet-stream",
                         "x-upsert": "true"},
                content=content,
            )
            if r.status_code >= 300:
                raise StorageError(f"Supabase upload failed: {r.status_code} {r.text[:200]}")
        public_url = f"{_supabase_url()}/storage/v1/object/public/{bucket()}/{path}"
        return {"storage_provider": "supabase", "storage_path": path, "public_url": public_url}

    # local fallback
    dest = _local_dir() / path.replace("/", "__")
    dest.write_bytes(content)
    return {"storage_provider": "local", "storage_path": dest.name,
            "public_url": f"/api/content/assets/file/{dest.name}"}


def read_local(name: str) -> bytes | None:
    p = _local_dir() / name
    return p.read_bytes() if p.exists() else None


def delete(storage_provider: str, storage_path: str) -> None:
    if storage_provider == "supabase" and is_configured():
        try:
            with httpx.Client(timeout=20) as http:
                http.delete(f"{_supabase_url()}/storage/v1/object/{bucket()}/{storage_path}",
                            headers={"Authorization": f"Bearer {_service_key()}"})
        except httpx.HTTPError:
            pass
    elif storage_provider == "local":
        p = _local_dir() / storage_path
        if p.exists():
            p.unlink()
