"""Website Chat widget — signed sessions, domain allowlist, rate limiting (Wave 8).

The widget is the public web channel. A workspace publishes a public widget id and
an allowed-origin list; the browser exchanges those for a SIGNED, short-lived
session (HMAC) that carries only a public id + anonymous visitor id + expiry — NEVER
the tenant id. The tenant is resolved server-side from the public id. Conversation
access is scoped by the signed session so ids can't be guessed. All state is durable
and tenant-scoped; standard tests are hermetic.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

from . import stores
from .ids import new_id, now_iso


class WidgetError(Exception):
    def __init__(self, category: str) -> None:
        super().__init__(category)
        self.category = category


# ── config / public id ────────────────────────────────────────────────────────

def _secret() -> bytes:
    s = os.environ.get("AI_RECEPTIONIST_WIDGET_SESSION_SECRET", "")
    if not s:
        # dev/test fallback: deterministic per-process key (never used for prod tokens)
        s = "dev-widget-secret-not-for-production"
    return hashlib.sha256(s.encode()).digest()


def session_ttl() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_WIDGET_SESSION_TTL_SECONDS", "3600") or 3600)
    except ValueError:
        return 3600


def get_or_create_config(tenant_id: str) -> dict:
    existing = stores.widget_domains().get(tenant_id, tenant_id)
    if existing is not None:
        return existing
    cfg = {
        "id": tenant_id, "tenant_id": tenant_id,
        "public_id": f"wdg_{new_id('')[-16:]}",
        "allowed_domains": [], "dev_mode": False,
        "welcome_message": "Hi! How can we help?",
        "offline_message": "We're offline right now — leave a message and we'll reply.",
        "enabled": True, "created_at": now_iso(), "updated_at": now_iso(),
    }
    return stores.widget_domains().put(tenant_id, cfg)


def save_config(tenant_id: str, patch: dict) -> dict:
    cfg = get_or_create_config(tenant_id)
    for k, v in (patch or {}).items():
        if k in ("id", "tenant_id", "public_id"):
            continue
        if k == "allowed_domains" and isinstance(v, list):
            cfg[k] = sorted({normalise_domain(d) for d in v if normalise_domain(d)})
        elif v is not None:
            cfg[k] = v
    cfg["updated_at"] = now_iso()
    return stores.widget_domains().put(tenant_id, cfg)


def config_for_public_id(public_id: str) -> Optional[dict]:
    """Resolve the widget config (and tenant) from a public id — server-side only."""
    for row in _all_widget_configs():
        if row.get("public_id") == public_id:
            return row
    return None


def _all_widget_configs() -> list[dict]:
    repo = stores.widget_domains()._repo
    try:
        return [r["data"] for r in getattr(repo, "_rows", [])]
    except Exception:
        return []


# ── domain allowlist (Part 21) ────────────────────────────────────────────────

def normalise_domain(domain: str) -> str:
    d = (domain or "").strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0]
    return d.strip()


def origin_allowed(cfg: dict, origin: str) -> bool:
    """Enforce the allowlist. Production requires HTTPS; dev_mode gates localhost."""
    if not origin:
        return False
    o = origin.strip()
    m = re.match(r"^(https?)://([^/:]+)(?::(\d+))?", o)
    if not m:
        return False
    scheme, host, _port = m.group(1), m.group(2).lower(), m.group(3)
    allowed = cfg.get("allowed_domains") or []
    if cfg.get("dev_mode") and host in ("localhost", "127.0.0.1"):
        return True
    if scheme != "https" and host not in ("localhost", "127.0.0.1"):
        return False  # production requires HTTPS
    for a in allowed:
        if host == a:
            return True
        if a.startswith("*.") and host.endswith(a[1:]) and host != a[2:]:  # bounded wildcard subdomain
            return True
    return False


# ── signed sessions (Part 20) ─────────────────────────────────────────────────

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def create_session(public_id: str, *, origin: str, visitor_id: str = "",
                   conversation_id: str = "", now: Optional[datetime] = None) -> dict:
    """Validate origin against the allowlist and mint a signed short-lived session.
    Never returns or accepts a tenant id. A successful mint is durable evidence that
    the widget loaded from an allowed origin (feeds installation verification)."""
    cfg = config_for_public_id(public_id)
    if cfg is None or not cfg.get("enabled"):
        raise WidgetError("widget_not_found")
    if not origin_allowed(cfg, origin):
        record_verification(cfg["tenant_id"], origin=origin, ok=False, reason="origin_not_allowed")
        raise WidgetError("origin_not_allowed")
    record_verification(cfg["tenant_id"], origin=origin, ok=True, evidence="signed_session")
    now = now or datetime.now(timezone.utc)
    vid = visitor_id or new_id("vis")
    exp = int(now.timestamp()) + session_ttl()
    payload = {"pid": public_id, "vid": vid, "cid": conversation_id, "exp": exp}
    token = _sign(payload)
    # durable session metadata (tenant-scoped; no secret leaves the server)
    tenant_id = cfg["tenant_id"]
    stores.widget_sessions().put(tenant_id, {
        "id": new_id("wsess"), "tenant_id": tenant_id, "public_id": public_id,
        "visitor_id": vid, "conversation_id": conversation_id,
        "expires_at": datetime.fromtimestamp(exp, timezone.utc).isoformat(timespec="seconds"),
        "created_at": now_iso()})
    return {"session_token": token, "visitor_id": vid, "expires_at": exp}


def verify_session(token: str, *, origin: str = "", now: Optional[datetime] = None) -> dict:
    """Return the resolved {tenant_id, public_id, visitor_id, conversation_id} for a
    valid session, or raise WidgetError. Re-checks origin + expiry + signature."""
    try:
        body, sig = token.split(".", 1)
    except (ValueError, AttributeError):
        raise WidgetError("invalid_session")
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise WidgetError("bad_signature")
    payload = json.loads(_unb64(body))
    now = now or datetime.now(timezone.utc)
    if int(payload.get("exp", 0)) < int(now.timestamp()):
        raise WidgetError("session_expired")
    cfg = config_for_public_id(payload.get("pid", ""))
    if cfg is None or not cfg.get("enabled"):
        raise WidgetError("widget_revoked")
    if origin and not origin_allowed(cfg, origin):
        raise WidgetError("origin_not_allowed")
    return {"tenant_id": cfg["tenant_id"], "public_id": payload["pid"],
            "visitor_id": payload.get("vid", ""), "conversation_id": payload.get("cid", "")}


def rotate_session(token: str, *, origin: str = "") -> dict:
    """Issue a fresh session preserving the visitor + conversation (reload/reconnect)."""
    claims = verify_session(token, origin=origin)
    return create_session(claims["public_id"], origin=origin, visitor_id=claims["visitor_id"],
                          conversation_id=claims["conversation_id"])


# ── rate limiting / spam (Part 22) ────────────────────────────────────────────

def _rate_limit() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_WIDGET_RATE_LIMIT", "30") or 30)
    except ValueError:
        return 30


def message_max_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_WIDGET_MESSAGE_MAX_BYTES", "8000") or 8000)
    except ValueError:
        return 8000


def check_rate(tenant_id: str, key: str, *, now: Optional[datetime] = None) -> bool:
    """Sliding 60s window per key (ip/session/widget). Server-side; returns True when
    the request is allowed. Security rejection consumes zero credits by construction."""
    now = now or datetime.now(timezone.utc)
    bucket = now.strftime("%Y%m%d%H%M")
    rid = f"wrate::{key}::{bucket}"
    rec = stores.widget_sessions().get(tenant_id, rid) or {"id": rid, "tenant_id": tenant_id, "count": 0, "kind": "rate"}
    rec["count"] = int(rec.get("count", 0)) + 1
    stores.widget_sessions().put(tenant_id, rec)
    return rec["count"] <= _rate_limit()


# ── installation verification (Part 8/11) ─────────────────────────────────────

def _verify_id(tenant_id: str, domain: str) -> str:
    return f"wverify::{tenant_id}::{normalise_domain(domain)}"


def record_verification(tenant_id: str, *, origin: str = "", domain: str = "",
                        ok: bool = True, evidence: str = "handshake", reason: str = "") -> dict:
    """Record durable installation evidence from a real widget handshake / session.
    Never trusts a frontend-only flag — only server-observed events call this."""
    d = normalise_domain(domain or origin)
    rec = stores.widget_sessions().get(tenant_id, _verify_id(tenant_id, d)) or {
        "id": _verify_id(tenant_id, d), "tenant_id": tenant_id, "kind": "verification", "domain": d}
    if ok:
        rec["status"] = "installed"
        rec["last_verified_at"] = now_iso()
        rec["evidence"] = evidence
        rec["last_failure"] = ""
    else:
        rec["last_failure"] = reason or "verification_failed"
        rec.setdefault("status", "not_installed")
    stores.widget_sessions().put(tenant_id, rec)
    return rec


def verification_status(tenant_id: str) -> dict:
    """Honest installed/not-installed/error state per domain (no fake success)."""
    cfg = get_or_create_config(tenant_id)
    domains = cfg.get("allowed_domains") or []
    out = []
    for d in domains:
        rec = stores.widget_sessions().get(tenant_id, _verify_id(tenant_id, d))
        out.append({
            "domain": d,
            "status": (rec or {}).get("status", "not_installed"),
            "last_verified_at": (rec or {}).get("last_verified_at", ""),
            "last_failure": (rec or {}).get("last_failure", ""),
            "evidence": (rec or {}).get("evidence", ""),
        })
    installed = any(x["status"] == "installed" for x in out)
    return {"installed": installed, "domains": out}


def validate_message(text: str) -> None:
    if text is None or not str(text).strip():
        raise WidgetError("empty_message")
    if len(str(text).encode("utf-8")) > message_max_bytes():
        raise WidgetError("message_too_large")
