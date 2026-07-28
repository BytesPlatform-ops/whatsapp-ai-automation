"""Durable repository for generated SEO PDF report metadata.

Stores metadata (NOT the PDF bytes themselves) so the bytes can be re-streamed
on download without re-generating. The bytes are held in-process cache (for the
memory backend) or returned inline for the route to stream — we do NOT upload PDFs
to Supabase Storage to avoid mixing binary blobs with structured metadata.

Table: seo_generated_reports
Envelope: { id, tenant_id, created_at, updated_at, data (jsonb) }

Download tokens are signed HMAC-SHA256 short-TTL tokens (stdlib only), following
the same pattern as seo/google/oauth.py.

Environment variables:
  SEO_PDF_DOWNLOAD_SECRET  — HMAC key for download tokens (auto-ephemeral if unset).
  SEO_PDF_TOKEN_TTL        — seconds until download token expires (default 300).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import persistence

# Reuse helpers from seo.stores
from seo.stores import _Repo, _uid, _now  # noqa: F401

_log = logging.getLogger("pixie.seo.reporting.store")

# ── Token config ──────────────────────────────────────────────────────────────

_EPHEMERAL_SECRET: str = secrets.token_hex(32)
_WARNED_NO_SECRET = False
_DEFAULT_TOKEN_TTL = 300  # 5 minutes


def _download_secret() -> bytes:
    global _WARNED_NO_SECRET
    raw = os.getenv("SEO_PDF_DOWNLOAD_SECRET", "").strip()
    if not raw:
        if not _WARNED_NO_SECRET:
            _log.warning(
                "seo.reporting.store: SEO_PDF_DOWNLOAD_SECRET not set; "
                "using ephemeral HMAC key (restarts will invalidate outstanding tokens)"
            )
            _WARNED_NO_SECRET = True
        return _EPHEMERAL_SECRET.encode("utf-8")
    return raw.encode("utf-8")


def _token_ttl() -> int:
    try:
        return int(os.getenv("SEO_PDF_TOKEN_TTL", str(_DEFAULT_TOKEN_TTL)))
    except (ValueError, TypeError):
        return _DEFAULT_TOKEN_TTL


# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class GeneratedReport:
    tenant_id: str
    site_id: str
    kind: str
    date_from: str
    date_to: str
    byte_size: int                   = 0
    sha256: str                      = ""
    expires_at: str                  = ""   # ISO — when the download link expires
    status: str                      = "ready"   # "ready" | "error"
    error: str                       = ""
    created_at: str                  = ""
    updated_at: str                  = ""
    extra: Dict                      = field(default_factory=dict)


# ── Repository ────────────────────────────────────────────────────────────────

class GeneratedReportRepository(_Repo):
    table_name = "seo_generated_reports"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, GeneratedReport]]:
        if not row:
            return None
        d = row.get("data", {})
        obj = GeneratedReport(
            tenant_id  = d.get("tenant_id", ""),
            site_id    = d.get("site_id", ""),
            kind       = d.get("kind", ""),
            date_from  = d.get("date_from", ""),
            date_to    = d.get("date_to", ""),
            byte_size  = d.get("byte_size", 0),
            sha256     = d.get("sha256", ""),
            expires_at = d.get("expires_at", ""),
            status     = d.get("status", "ready"),
            error      = d.get("error", ""),
            created_at = row.get("created_at", ""),
            updated_at = row.get("updated_at", ""),
            extra      = d.get("extra", {}),
        )
        return row["id"], obj

    def create(self, obj: GeneratedReport) -> Tuple[str, GeneratedReport]:
        rid = _uid("pdfrpt_")
        ts  = _now()
        if not obj.created_at:
            obj.created_at = ts
        if not obj.updated_at:
            obj.updated_at = ts
        self._save(rid, obj.tenant_id, obj)
        return rid, obj

    def get(self, tenant_id: str, report_id: str) -> Optional[Tuple[str, GeneratedReport]]:
        return self._build(self._repo.get(tenant_id, report_id))

    def delete(self, tenant_id: str, report_id: str) -> bool:
        return self._repo.delete(tenant_id, report_id)

    def list_by_tenant(self, tenant_id: str) -> List[Tuple[str, GeneratedReport]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        out = [p for p in pairs if p]
        out.sort(key=lambda p: p[1].created_at or "", reverse=True)
        return out

    def list_by_site(self, tenant_id: str, site_id: str) -> List[Tuple[str, GeneratedReport]]:
        return [
            (rid, r) for rid, r in self.list_by_tenant(tenant_id)
            if r.site_id == site_id
        ]


# ── Singleton ─────────────────────────────────────────────────────────────────

_REPO_CACHE: dict = {}


def get_generated_report_repository() -> GeneratedReportRepository:
    if "generated_report" not in _REPO_CACHE:
        _REPO_CACHE["generated_report"] = GeneratedReportRepository()
    return _REPO_CACHE["generated_report"]


def reset_repository() -> None:
    """Clear cached repo singleton — call between tests."""
    _REPO_CACHE.clear()


# ── Download token (stdlib HMAC, no external deps) ────────────────────────────

class DownloadTokenError(ValueError):
    """Raised when a download token is invalid, tampered, or expired."""


def generate_download_token(report_id: str, tenant_id: str) -> str:
    """Generate a short-TTL signed download token.

    Token format (URL-safe base64, dot-separated):
      <payload_b64>.<signature_b64>

    Payload JSON: { "rid": report_id, "tid": tenant_id, "iat": issued_at }

    The signature is HMAC-SHA256 over the payload base64 string, using the
    SEO_PDF_DOWNLOAD_SECRET key. Tokens expire after SEO_PDF_TOKEN_TTL seconds.
    """
    payload = json.dumps({
        "rid": report_id,
        "tid": tenant_id,
        "iat": int(time.time()),
    }, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    mac = hmac.new(_download_secret(), payload_b64.encode(), hashlib.sha256)
    sig_b64 = base64.urlsafe_b64encode(mac.digest()).decode().rstrip("=")
    return f"{payload_b64}.{sig_b64}"


def validate_download_token(
    token: str,
    *,
    expected_tenant_id: str,
    expected_report_id: str,
) -> dict:
    """Validate a download token.

    Returns the decoded payload dict on success.

    Raises DownloadTokenError when:
      - Token is malformed or missing
      - HMAC signature does not match (tampered)
      - Token has expired (beyond TTL)
      - tenant_id or report_id in token do not match expected values (cross-tenant block)
    """
    if not token or "." not in token:
        raise DownloadTokenError("malformed token")

    try:
        payload_b64, sig_b64 = token.rsplit(".", 1)
    except ValueError:
        raise DownloadTokenError("malformed token")

    # Constant-time HMAC comparison
    expected_mac = hmac.new(_download_secret(), payload_b64.encode(), hashlib.sha256)
    expected_sig = base64.urlsafe_b64encode(expected_mac.digest()).decode().rstrip("=")
    if not hmac.compare_digest(sig_b64, expected_sig):
        raise DownloadTokenError("invalid token signature")

    # Decode payload
    try:
        # Re-pad base64
        padding = 4 - len(payload_b64) % 4
        padded = payload_b64 + ("=" * (padding % 4))
        payload_json = base64.urlsafe_b64decode(padded).decode()
        payload = json.loads(payload_json)
    except Exception:
        raise DownloadTokenError("malformed token payload")

    # Expiry check
    iat = payload.get("iat", 0)
    if time.time() - iat > _token_ttl():
        raise DownloadTokenError("token expired")

    # Tenant + report binding
    if payload.get("tid") != expected_tenant_id:
        raise DownloadTokenError("token tenant mismatch")
    if payload.get("rid") != expected_report_id:
        raise DownloadTokenError("token report_id mismatch")

    return payload


# ── In-process PDF byte cache (memory mode) ──────────────────────────────────
# When PIXIE_PERSIST=memory the PDF bytes are held here so they can be streamed
# on download without re-generating. In supabase/file mode the bytes are also
# held here (the download route streams from this cache or returns 404 if the
# server was restarted). A production deployment would use Supabase Storage or
# a shared object store; for now inline-cache is correct and safe.

_PDF_BYTES_CACHE: Dict[str, bytes] = {}


def cache_pdf_bytes(report_id: str, pdf_bytes: bytes) -> None:
    """Store raw PDF bytes keyed by report_id (in-process)."""
    _PDF_BYTES_CACHE[report_id] = pdf_bytes


def get_pdf_bytes(report_id: str) -> Optional[bytes]:
    """Retrieve cached PDF bytes, or None if not in cache."""
    return _PDF_BYTES_CACHE.get(report_id)


def clear_pdf_cache() -> None:
    """Clear the in-process PDF bytes cache. Call between tests."""
    _PDF_BYTES_CACHE.clear()
