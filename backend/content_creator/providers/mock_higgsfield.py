"""Deterministic mock Higgsfield provider — PURE STDLIB, no network, no key.

generate() is seeded by sha1(identity_ref + script) so the same prompt always
yields the same asset/preview refs. It echoes the locked-identity invariant
(identity_ref, background, script, aspect_ratio) straight back so downstream
quality checks can verify the identity survived generation.
"""

from __future__ import annotations

import hashlib

from content_creator.providers.base import HiggsfieldProvider


def _seed(prompt: dict) -> str:
    identity_ref = str(prompt.get("identity_ref", ""))
    script = str(prompt.get("script", ""))
    raw = (identity_ref + "|" + script).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


class MockHiggsfieldProvider(HiggsfieldProvider):
    name = "mock"

    def generate(self, prompt: dict, *, duration_seconds: int = 15) -> dict:
        digest = _seed(prompt)[:12]
        return {
            "status": "mock",
            "asset_ref": "mock-video-" + digest,
            "preview_ref": "mock-preview-" + digest,
            "aspect_ratio": prompt.get("aspect_ratio", "9:16"),
            "duration_seconds": duration_seconds,
            "model": prompt.get("model", "mock-fast"),
            "identity_ref": prompt.get("identity_ref", ""),
            "background": prompt.get("background", ""),
            "script": prompt.get("script", ""),
        }
