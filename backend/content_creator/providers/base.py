"""Provider abstractions + env-gated factories — PURE STDLIB (base only).

Two provider families:
  * HiggsfieldProvider — turns an (already locked-identity) prompt into a video
    asset. Real generation is an ASYNC job: ``submit_job`` returns a provider job
    id, ``get_job_status`` polls it, ``download_result`` fetches the finished
    bytes. The legacy synchronous ``generate`` is retained for the offline mock /
    quality-retry ladder; the base gives every sync provider a working async
    surface for free (submit → sync-generate → ready), so the mock and demo speak
    the same job protocol as the real connector.
  * StorageProvider — persists an asset (by ref or by bytes) and returns a URI.

Factory policy (the important part): in REAL mode there is **no silent fallback
to a mock**. If a real credential + model are present we return the real
connector; if not, we return a provider that raises ``ProviderNotConfigured`` on
any generation call. The deterministic mock is returned ONLY in mock mode.
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod

from content_creator import config


class ProviderNotConfigured(RuntimeError):
    """Real mode is on but the provider has no usable credential/model."""


class ProviderError(RuntimeError):
    """The real provider returned an error (network / auth / generation)."""


# Process-local registry so a synchronous provider's ``submit_job`` result is
# retrievable by a later ``get_job_status`` / ``download_result`` call (different
# provider instance, later HTTP request). Only the mock/sync path uses this — the
# real connector keys everything off the provider's own request id.
_SYNC_JOBS: dict = {}


class HiggsfieldProvider(ABC):
    """Generates a (mock or real) short-form video from a locked-identity prompt."""

    name = "base"
    connection_type = "mock"

    # ---- capability / connection --------------------------------------- #
    def available(self) -> bool:
        return True

    def capabilities(self) -> dict:
        return {"video_generation": True, "job_status": True, "result_download": True}

    def connect(self, credential: str = "") -> dict:
        """Validate/prepare a connection. Base is always 'connected' (mock)."""
        return self.test_connection()

    def test_connection(self) -> dict:
        return {
            "connected": self.available(),
            "provider": self.name,
            "connection_type": self.connection_type,
            "capabilities": self.capabilities(),
        }

    # ---- generation (sync legacy) -------------------------------------- #
    @abstractmethod
    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:
        """Return an asset dict echoing the locked-identity invariant."""
        raise NotImplementedError

    # ---- generation (async job protocol) ------------------------------- #
    def submit_job(
        self,
        prompt: dict,
        *,
        duration_seconds: int = 15,
        aspect_ratio: str = "9:16",
        image_url: str = "",
    ) -> dict:
        """Default: synchronous providers generate now and expose the finished
        asset through the job registry so the async endpoints resolve instantly."""
        asset = self.generate(prompt, duration_seconds=duration_seconds)
        job_id = "syncjob-" + hashlib.sha1(
            (str(asset.get("asset_ref", "")) + "|" + str(asset.get("preview_ref", ""))).encode("utf-8")
        ).hexdigest()[:16]
        _SYNC_JOBS[job_id] = asset
        return {
            "provider_job_id": job_id,
            "provider": self.name,
            "status": asset.get("status", "mock"),
            "model": asset.get("model", ""),
            "aspect_ratio": asset.get("aspect_ratio", aspect_ratio),
            "duration_seconds": int(asset.get("duration_seconds", duration_seconds) or duration_seconds),
            "asset_ref": asset.get("asset_ref", ""),
            "preview_ref": asset.get("preview_ref", ""),
            "identity_ref": asset.get("identity_ref", prompt.get("identity_ref", "")),
        }

    def get_job_status(self, job_id: str) -> dict:
        asset = _SYNC_JOBS.get(job_id) or {}
        return {
            "status": "completed",
            "progress": 1.0,
            "result_url": asset.get("preview_ref", ""),
            "asset_ref": asset.get("asset_ref", ""),
            "preview_ref": asset.get("preview_ref", ""),
            "model": asset.get("model", ""),
            "error": "",
        }

    def download_result(self, job_id: str) -> dict:
        asset = _SYNC_JOBS.get(job_id) or {}
        return {
            "content": None,  # mock/sync path has no real bytes
            "content_type": "video/mp4",
            "source_url": asset.get("preview_ref", ""),
            "asset_ref": asset.get("asset_ref", ""),
            "preview_ref": asset.get("preview_ref", ""),
        }

    def upload_reference_image(self, content: bytes, content_type: str = "image/png") -> str:
        """Host a reference image on the provider's own CDN, returning a public URL.
        Only the real connector supports this; the base refuses rather than fake one."""
        raise ProviderNotConfigured(
            "Provider-hosted reference upload requires a configured Higgsfield provider."
        )


class _NotConfiguredProvider(HiggsfieldProvider):
    """Returned in REAL mode when no credential/model is available. Every
    generation call raises ``ProviderNotConfigured`` — it NEVER mocks a success."""

    name = "higgsfield"
    connection_type = "api_key"

    def __init__(self, reason: str = "") -> None:
        self._reason = reason or (
            "Higgsfield provider is not configured. Add HIGGSFIELD_API_KEY / "
            "HIGGSFIELD_API_SECRET and HIGGSFIELD_VIDEO_MODEL, or connect a client key."
        )

    def available(self) -> bool:
        return False

    def capabilities(self) -> dict:
        return {"video_generation": False, "job_status": False, "result_download": False}

    def test_connection(self) -> dict:
        return {
            "connected": False,
            "provider": self.name,
            "connection_type": self.connection_type,
            "status": "provider_not_configured",
            "message": self._reason,
            "capabilities": self.capabilities(),
        }

    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:
        raise ProviderNotConfigured(self._reason)

    def submit_job(self, prompt: dict, **kwargs) -> dict:
        raise ProviderNotConfigured(self._reason)

    def get_job_status(self, job_id: str) -> dict:
        raise ProviderNotConfigured(self._reason)

    def download_result(self, job_id: str) -> dict:
        raise ProviderNotConfigured(self._reason)


class StorageProvider(ABC):
    """Persists an asset/preview reference, returning a stable URI."""

    name = "base"

    @abstractmethod
    def store(self, kind: str, ref: str) -> str:
        raise NotImplementedError

    def store_bytes(
        self,
        tenant_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> dict:
        """Persist raw bytes; return ``{storage_provider, storage_path, storage_url}``.

        Base default (mock/sync) has no real bucket — it returns a deterministic
        ``mock://`` URI. The real provider overrides this to upload to Supabase."""
        uri = self.store("video", filename or (tenant_id + ":bytes"))
        return {"storage_provider": self.name, "storage_path": filename, "storage_url": uri}


def get_higgsfield_provider(tenant_id: str = ""):
    """Env-gated factory.

    * mock mode → deterministic :class:`MockHiggsfieldProvider`.
    * real mode + usable credential + model → real :class:`HiggsfieldApiProvider`.
    * real mode WITHOUT credential/model → :class:`_NotConfiguredProvider`
      (raises on use — never a silent mock).
    """
    from content_creator.providers.mock_higgsfield import MockHiggsfieldProvider

    if not config.real_mode():
        return MockHiggsfieldProvider()

    # Real mode — resolve a credential (per-tenant client key, else Pixie env key).
    from content_creator.providers import credentials

    credential = credentials.get_credential(tenant_id)
    model = config.higgsfield_video_model()
    if not credential or not model:
        missing = []
        if not credential:
            missing.append("HIGGSFIELD_API_KEY/HIGGSFIELD_API_SECRET (or a connected client key)")
        if not model:
            missing.append("HIGGSFIELD_VIDEO_MODEL")
        return _NotConfiguredProvider("Missing: " + ", ".join(missing))

    try:
        from content_creator.providers.higgsfield import HiggsfieldApiProvider

        return HiggsfieldApiProvider(credential=credential, model=model)
    except Exception as exc:  # SDK import / construction failure — surface, don't mock.
        return _NotConfiguredProvider(str(exc))


def build_real_provider(credential: str, model: str = ""):
    """Build a real Higgsfield provider from EXPLICIT credentials (mode-resolved by
    the caller). No mock fallback: returns ``_NotConfiguredProvider`` when the
    credential is missing. Used at connect-time (to test a key) and per-request
    once the router has resolved which credential/model a tenant's mode implies."""
    if not credential:
        return _NotConfiguredProvider("No Higgsfield credential for this provider mode.")
    try:
        from content_creator.providers.higgsfield import HiggsfieldApiProvider

        return HiggsfieldApiProvider(credential=credential, model=model)
    except Exception as exc:
        return _NotConfiguredProvider(str(exc))


def get_storage_provider():
    """Real Supabase-backed storage in real mode; deterministic mock otherwise."""
    if config.real_mode():
        try:
            from content_creator.providers.storage import SupabaseStorageProvider

            return SupabaseStorageProvider()
        except Exception:
            pass
    from content_creator.providers.storage import MockStorageProvider

    return MockStorageProvider()
