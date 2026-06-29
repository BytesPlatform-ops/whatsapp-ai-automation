"""Real Higgsfield API provider — documented real path, NEVER run offline.

This is the production wiring for the Higgsfield video API using only stdlib
urllib. It is excluded from coverage and must never be exercised in tests or
without a live key. Any failure (no key, network, non-2xx, bad payload)
degrades gracefully to the deterministic MockHiggsfieldProvider instead of
raising — the pipeline must always get an asset back. The API key is read once
and never logged.
"""

from __future__ import annotations

import json
import os
import urllib.request

from content_creator.providers.base import HiggsfieldProvider
from content_creator.providers.mock_higgsfield import MockHiggsfieldProvider

_API_BASE = "https://platform.higgsfield.ai/v1"


class HiggsfieldApiProvider(HiggsfieldProvider):
    name = "higgsfield"

    def __init__(self) -> None:  # pragma: no cover - requires live env
        # Read the key once; never store it anywhere it could be logged.
        self._api_key = os.getenv("HIGGSFIELD_API_KEY", "")

    def available(self) -> bool:
        return bool(self._api_key)

    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:  # pragma: no cover - live only
        if not self.available():
            return MockHiggsfieldProvider().generate(
                prompt, duration_seconds=duration_seconds
            )
        try:
            payload = {
                "identity_ref": prompt.get("identity_ref", ""),
                "background": prompt.get("background", ""),
                "script": prompt.get("script", ""),
                "aspect_ratio": prompt.get("aspect_ratio", "9:16"),
                "model": prompt.get("model", "standard"),
                "duration_seconds": duration_seconds,
            }
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                _API_BASE + "/videos",
                data=data,
                method="POST",
                headers={
                    "Authorization": "Bearer " + self._api_key,
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return {
                "status": "ready",
                "asset_ref": body.get("asset_ref", ""),
                "preview_ref": body.get("preview_ref", ""),
                "aspect_ratio": payload["aspect_ratio"],
                "duration_seconds": duration_seconds,
                "model": payload["model"],
                "identity_ref": payload["identity_ref"],
                "background": payload["background"],
                "script": payload["script"],
            }
        except Exception:
            # Degrade to the mock rather than break the pipeline. Do not log the key.
            return MockHiggsfieldProvider().generate(
                prompt, duration_seconds=duration_seconds
            )
