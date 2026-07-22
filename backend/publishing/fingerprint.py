"""Idempotency fingerprint for publish jobs — PURE STDLIB.

A stable hash of (tenant, destination, content snapshot, scheduled instant, mode)
so the same request — a double-click, a proxy retry, a worker retry — resolves to
ONE job. An explicit client idempotency key takes precedence. Editing content
changes the snapshot → a new fingerprint → a legitimately new job.
"""

from __future__ import annotations

import hashlib
import json


def compute(
    tenant_id: str,
    connection_id: str,
    platform: str,
    account_id: str,
    snapshot: dict,
    scheduled_utc: str,
    mode: str,
    *,
    idempotency_key: str = "",
) -> str:
    if idempotency_key:
        basis = {"tenant": tenant_id, "key": idempotency_key.strip()}
    else:
        snap = {
            "format": snapshot.get("content_format", ""),
            "text": snapshot.get("text", ""),
            "link": snapshot.get("link", ""),
            "media": sorted(snapshot.get("media_asset_ids", []) or []),
            "document_id": snapshot.get("document_id", ""),
            "version_id": snapshot.get("version_id", ""),
            "influencer_video_id": snapshot.get("influencer_video_id", ""),
            "first_comment": snapshot.get("first_comment", ""),
        }
        basis = {
            "tenant": tenant_id,
            "connection": connection_id,
            "platform": platform,
            "account": account_id,
            "snapshot": snap,
            "scheduled_utc": scheduled_utc,
            "mode": mode,
        }
    blob = json.dumps(basis, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "fp_" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]
