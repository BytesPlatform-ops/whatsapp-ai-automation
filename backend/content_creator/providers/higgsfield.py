"""Real Higgsfield connector — official ``higgsfield-client`` SDK, async job model.

Verified contract (SDK + docs.higgsfield.ai):

* Base URL ``https://platform.higgsfield.ai``; auth header ``Authorization: Key
  {api_key}:{api_secret}``. ``SyncClient(api_key="key:secret")`` binds a client
  to explicit credentials WITHOUT touching process env — so per-tenant client
  keys work cleanly alongside the Pixie-managed env key.
* Submit → ``POST /{model_id}`` with ``arguments`` → ``{request_id, status_url,
  cancel_url}`` (queued job). Poll → ``GET /requests/{id}/status`` → a status of
  ``queued|in_progress|completed|failed|nsfw|canceled`` plus the media payload
  when completed. The result media URL is extracted tolerantly (``video`` /
  ``videos[]`` / ``images[]`` / top-level ``url``) because the exact video
  payload shape isn't documented and varies by model.

Design rules honored here:

* **No silent mock fallback.** Any missing credential/model or provider error is
  raised (``ProviderNotConfigured`` / ``ProviderError``) — the router turns that
  into an honest ``provider_not_configured`` / ``provider_error`` response. This
  path is NEVER exercised offline or in tests without ``RUN_HIGGSFIELD_INTEGRATION
  _TESTS=1`` and real keys.
* The SDK is imported LAZILY inside methods so this module imports cleanly even
  when ``higgsfield-client`` isn't installed (boot smoke / py_compile stay green).
* The credential is held once and never logged or returned.
"""

from __future__ import annotations

import json
import os
from typing import Optional, Tuple

import httpx

from content_creator import config
from content_creator.providers.base import (
    HiggsfieldProvider,
    ProviderError,
    ProviderNotConfigured,
)

_BASE_URL = "https://platform.higgsfield.ai"
_UPLOAD_URL_PATH = "/files/generate-upload-url"  # cheap, authed, no generation spend


# --------------------------------------------------------------------------- #
# Argument building
# --------------------------------------------------------------------------- #
def _supported_duration(duration_seconds: int) -> int:
    """Higgsfield video durations are discrete (commonly 5 or 10s). Clamp the
    pipeline's request to the nearest supported value."""
    try:
        d = int(duration_seconds)
    except (TypeError, ValueError):
        d = 5
    return 5 if d <= 7 else 10


def _compose_prompt_text(prompt: dict) -> str:
    """Flatten the deterministic prompt dict into one natural-language instruction.

    The locked identity is carried separately as ``image_url`` (image-to-video);
    here we assemble the spoken/visual direction. The fixed negative prompt is
    folded in as an 'avoid' clause since not every model accepts a separate arg.
    """
    parts = [
        prompt.get("script_hook", ""),
        prompt.get("script", ""),
        prompt.get("script_cta", ""),
    ]
    spoken = " ".join(p for p in parts if p).strip()

    direction = "; ".join(
        p for p in [
            ("style: " + prompt.get("brand_style", "")) if prompt.get("brand_style") else "",
            ("camera: " + prompt.get("camera", "")) if prompt.get("camera") else "",
            ("lighting: " + prompt.get("lighting", "")) if prompt.get("lighting") else "",
            ("realism: " + prompt.get("realism_cues", "")) if prompt.get("realism_cues") else "",
            ("voice: " + prompt.get("voice_direction", "")) if prompt.get("voice_direction") else "",
        ] if p
    )

    text = spoken
    if direction:
        text = (text + ". " if text else "") + direction
    negative = prompt.get("negative_prompt", "")
    if negative:
        text = (text + ". " if text else "") + "avoid: " + negative
    return text.strip() or "short-form vertical talking-influencer clip"


def _build_arguments(
    prompt: dict,
    *,
    duration_seconds: int,
    aspect_ratio: str,
    image_url: str,
) -> dict:
    """Assemble the SDK ``arguments`` dict for the configured model.

    Kept intentionally minimal + operator-extensible: exact per-model arg schemas
    differ across the Higgsfield catalog, so ``HIGGSFIELD_EXTRA_ARGS`` (JSON) is
    merged last to let an operator match a specific model without a code change.
    """
    defaults = config.higgsfield_defaults()
    args: dict = {
        "prompt": _compose_prompt_text(prompt),
        "aspect_ratio": aspect_ratio or defaults.get("aspect_ratio", "9:16"),
        "duration": _supported_duration(duration_seconds),
    }
    resolution = defaults.get("resolution", "")
    if resolution:
        args["resolution"] = resolution
    if image_url:
        # Image-to-video / character reference — the locked influencer.
        args["image_url"] = image_url

    extra_raw = os.getenv("HIGGSFIELD_EXTRA_ARGS", "").strip()
    if extra_raw:
        try:
            extra = json.loads(extra_raw)
            if isinstance(extra, dict):
                args.update(extra)
        except (ValueError, TypeError):
            pass  # malformed override is ignored, never fatal
    return args


def _extract_media_url(payload: dict) -> str:
    """Tolerantly pull the result media URL from a completed-status payload.

    Video payload shapes aren't documented and vary by model, so we probe the
    known-plausible locations in priority order (video → videos[] → output →
    images[] → top-level url)."""
    if not isinstance(payload, dict):
        return ""

    video = payload.get("video")
    if isinstance(video, dict) and video.get("url"):
        return str(video["url"])
    if isinstance(video, str) and video:
        return video

    for key in ("videos", "images", "outputs", "results"):
        seq = payload.get(key)
        if isinstance(seq, list) and seq:
            first = seq[0]
            if isinstance(first, dict) and first.get("url"):
                return str(first["url"])
            if isinstance(first, str) and first:
                return first

    output = payload.get("output")
    if isinstance(output, dict) and output.get("url"):
        return str(output["url"])

    for key in ("url", "result_url", "video_url", "output_url"):
        if payload.get(key):
            return str(payload[key])
    return ""


def _fetch_bytes(url: str) -> Tuple[Optional[bytes], str]:
    """Download the finished media so we can re-host it (never rely on the
    provider's temporary URL). Returns ``(content, content_type)``; ``(None, "")``
    on any failure — the caller decides how to degrade."""
    if not url:
        return None, ""
    try:
        with httpx.Client(timeout=180, follow_redirects=True) as http:
            resp = http.get(url)
            resp.raise_for_status()
            ctype = resp.headers.get("content-type", "") or "video/mp4"
            return resp.content, ctype
    except httpx.HTTPError:
        return None, ""


def _safe_error(exc: Exception) -> str:
    """A caller-safe error string that never leaks the credential."""
    msg = str(exc) or exc.__class__.__name__
    cred = config.higgsfield_credential()
    if cred:
        msg = msg.replace(cred, "***")
        key = cred.split(":", 1)[0]
        if key:
            msg = msg.replace(key, "***")
    return msg[:300]


# --------------------------------------------------------------------------- #
# Provider
# --------------------------------------------------------------------------- #
class HiggsfieldApiProvider(HiggsfieldProvider):
    """Real Higgsfield video provider (async job). Requires a live credential."""

    name = "higgsfield"
    connection_type = "api_key"

    def __init__(self, credential: str = "", model: str = "") -> None:
        # Held once; never logged, never returned.
        self._credential = (credential or config.higgsfield_credential()).strip()
        self._model = (model or config.higgsfield_video_model()).strip()

    # ---- readiness ----------------------------------------------------- #
    def available(self) -> bool:
        return bool(self._credential)

    def capabilities(self) -> dict:
        ready = bool(self._credential and self._model)
        return {"video_generation": ready, "job_status": ready, "result_download": ready}

    def _client(self):
        """Build a SyncClient bound to this credential. Lazy SDK import."""
        if not self._credential:
            raise ProviderNotConfigured("Higgsfield credential missing.")
        try:
            from higgsfield_client import SyncClient
        except Exception as exc:  # pragma: no cover - depends on install
            raise ProviderNotConfigured(
                "higgsfield-client SDK is not installed (pip install higgsfield-client)."
            ) from exc
        return SyncClient(api_key=self._credential)

    def test_connection(self) -> dict:
        """Real, cheap auth check: hit the authenticated upload-URL endpoint (it
        mints a presigned URL — NO generation, NO credit spend). 2xx ⇒ the key is
        valid; 401/403 ⇒ invalid. Never raises; returns a safe status dict."""
        base = {
            "provider": self.name,
            "connection_type": self.connection_type,
            "capabilities": self.capabilities(),
        }
        if not self._credential:
            return {**base, "connected": False, "status": "provider_not_configured",
                    "message": "No Higgsfield credential."}
        try:
            with httpx.Client(timeout=20) as http:
                resp = http.post(
                    _BASE_URL + _UPLOAD_URL_PATH,
                    headers={
                        "Authorization": "Key " + self._credential,
                        "Content-Type": "application/json",
                    },
                    json={"content_type": "image/png"},
                )
            if resp.status_code < 300:
                return {**base, "connected": True, "status": "connected",
                        "model_configured": bool(self._model)}
            if resp.status_code in (401, 403):
                return {**base, "connected": False, "status": "invalid_credentials",
                        "message": "Higgsfield rejected the API key."}
            return {**base, "connected": False, "status": "provider_error",
                    "message": "Higgsfield returned HTTP %d." % resp.status_code}
        except httpx.HTTPError as exc:
            return {**base, "connected": False, "status": "provider_error",
                    "message": _safe_error(exc)}

    # ---- async job protocol -------------------------------------------- #
    def submit_job(
        self,
        prompt: dict,
        *,
        duration_seconds: int = 15,
        aspect_ratio: str = "9:16",
        image_url: str = "",
    ) -> dict:
        if not self._credential:
            raise ProviderNotConfigured("Higgsfield credential missing.")
        if not self._model:
            raise ProviderNotConfigured(
                "HIGGSFIELD_VIDEO_MODEL is not set — supply a valid Higgsfield model id."
            )
        args = _build_arguments(
            prompt,
            duration_seconds=duration_seconds,
            aspect_ratio=aspect_ratio,
            image_url=image_url,
        )
        webhook = os.getenv("HIGGSFIELD_WEBHOOK_URL", "").strip() or None
        try:
            client = self._client()
            controller = (
                client.submit(self._model, args, webhook_url=webhook)
                if webhook else client.submit(self._model, args)
            )
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderError(_safe_error(exc)) from exc

        return {
            "provider_job_id": getattr(controller, "request_id", ""),
            "provider": self.name,
            "status": "generating",
            "model": self._model,
            "aspect_ratio": args.get("aspect_ratio", aspect_ratio),
            "duration_seconds": int(args.get("duration", _supported_duration(duration_seconds))),
            "asset_ref": "",
            "preview_ref": "",
            "identity_ref": prompt.get("identity_ref", ""),
        }

    def get_job_status(self, job_id: str) -> dict:
        if not job_id:
            raise ProviderError("Missing provider job id.")
        try:
            from higgsfield_client import Cancelled, Completed, Failed, InProgress, NSFW, Queued

            client = self._client()
            st = client.status(job_id)
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderError(_safe_error(exc)) from exc

        if isinstance(st, Completed):
            # Already terminal — result() returns immediately (one poll sees done).
            try:
                payload = client.result(job_id)
            except Exception as exc:
                raise ProviderError(_safe_error(exc)) from exc
            return {
                "status": "completed",
                "progress": 1.0,
                "result_url": _extract_media_url(payload),
                "error": "",
            }
        if isinstance(st, Queued):
            return {"status": "queued", "progress": 0.0, "result_url": "", "error": ""}
        if isinstance(st, InProgress):
            return {"status": "running", "progress": 0.5, "result_url": "", "error": ""}
        if isinstance(st, NSFW):
            return {"status": "failed", "progress": 0.0, "result_url": "",
                    "error": "Generation flagged as NSFW."}
        if isinstance(st, Cancelled):
            return {"status": "failed", "progress": 0.0, "result_url": "",
                    "error": "Generation was cancelled."}
        if isinstance(st, Failed):
            return {"status": "failed", "progress": 0.0, "result_url": "",
                    "error": "Provider reported a failed generation."}
        # Unknown status class — treat as still running rather than fabricate success.
        return {"status": "running", "progress": 0.5, "result_url": "", "error": ""}

    def download_result(self, job_id: str) -> dict:
        if not job_id:
            raise ProviderError("Missing provider job id.")
        try:
            client = self._client()
            payload = client.result(job_id)
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderError(_safe_error(exc)) from exc
        url = _extract_media_url(payload)
        content, content_type = _fetch_bytes(url)
        return {
            "content": content,
            "content_type": content_type,
            "source_url": url,
            "asset_ref": job_id,
            "preview_ref": url,
        }

    def upload_reference_image(self, content: bytes, content_type: str = "image/png") -> str:
        """Host a reference image on Higgsfield's CDN via the SDK's presigned
        upload, returning the public URL (fetchable by image-to-video)."""
        if not self._credential:
            raise ProviderNotConfigured("Higgsfield credential missing.")
        if not content:
            raise ProviderError("Empty reference image.")
        try:
            client = self._client()
            return client.upload(content, content_type or "image/png")
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderError(_safe_error(exc)) from exc

    # ---- sync convenience (NOT the hot path) --------------------------- #
    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:
        """Real synchronous generate: submit + block until done. Provided for
        interface completeness; the router uses the async submit/poll path so a
        request thread is never blocked for the full generation."""
        job = self.submit_job(prompt, duration_seconds=duration_seconds)
        job_id = job["provider_job_id"]
        try:
            client = self._client()
            payload = client.result(job_id)  # blocks/polls to completion
        except ProviderNotConfigured:
            raise
        except Exception as exc:
            raise ProviderError(_safe_error(exc)) from exc
        url = _extract_media_url(payload)
        return {
            "status": "ready",
            "asset_ref": job_id,
            "preview_ref": url,
            "result_url": url,
            "aspect_ratio": job.get("aspect_ratio", "9:16"),
            "duration_seconds": job.get("duration_seconds", duration_seconds),
            "model": self._model,
            "identity_ref": prompt.get("identity_ref", ""),
            "background": prompt.get("background", ""),
            "script": prompt.get("script", ""),
        }
