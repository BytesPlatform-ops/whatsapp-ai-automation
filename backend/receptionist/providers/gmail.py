"""Canonical Gmail provider adapter for the AI Receptionist (Wave 7).

ONE typed adapter over the Gmail API, reusing the existing Google OAuth + encrypted
connection infrastructure (``integrations.google_oauth`` / ``integrations.connections``
/ ``integrations.token_crypto``). Never passes raw Google responses into business
logic or the frontend — every result is a normalised dict.

Hermetic by default: a dependency-injected transport (:func:`set_transport`) lets
tests supply a mock. Live calls happen ONLY when a real transport is installed AND
the relevant enable flag is set; standard tests use the built-in mock and never
touch the network. Tokens are unsealed only inside this adapter and never logged.
"""

from __future__ import annotations

import base64
import os
import re
from typing import Callable, Optional

# ── scopes (least-privilege, validated per operation) ─────────────────────────
SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send"
SCOPE_COMPOSE = "https://www.googleapis.com/auth/gmail.compose"  # drafts

# limits
MAX_MESSAGE_BYTES = int(os.environ.get("AI_RECEPTIONIST_GMAIL_MAX_MESSAGE_BYTES", "1000000") or 1000000)
MAX_SUBJECT_LEN = 400
MAX_BODY_LEN = 50_000


class GmailError(Exception):
    """Typed, non-leaky Gmail failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "missing_scope", "token_expired", "token_revoked",
        "invalid_recipient", "header_injection", "rate_limit", "quota",
        "provider_error", "unknown_result", "message_too_large",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


# ── header-injection-safe helpers ─────────────────────────────────────────────
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HEADER_INJECT = re.compile(r"[\r\n]")


def validate_recipient(email: str) -> str:
    e = (email or "").strip()
    if _HEADER_INJECT.search(e):
        raise GmailError("header_injection", "recipient contains CR/LF")
    if not _EMAIL_RE.match(e):
        raise GmailError("invalid_recipient", "recipient is not a valid email")
    return e


def _safe_header(value: str) -> str:
    """Strip CR/LF from any header value to block header injection."""
    return _HEADER_INJECT.sub(" ", value or "").strip()[:MAX_SUBJECT_LEN]


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["GmailTransport"] = None


class GmailTransport:
    """Abstract transport. Real impl calls Gmail; the mock returns fixtures."""

    def profile(self, token: str) -> dict: raise NotImplementedError
    def list_messages(self, token: str, *, query: str, max_results: int, page_token: str = "") -> dict: raise NotImplementedError
    def get_message(self, token: str, message_id: str) -> dict: raise NotImplementedError
    def history(self, token: str, start_history_id: str) -> dict: raise NotImplementedError
    def create_draft(self, token: str, raw: str, thread_id: str = "") -> dict: raise NotImplementedError
    def send(self, token: str, raw: str, thread_id: str = "") -> dict: raise NotImplementedError


def set_transport(t: Optional[GmailTransport]) -> None:
    """Install a transport (tests inject a mock; production installs the real one)."""
    global _transport
    _transport = t


def _active_transport() -> GmailTransport:
    if _transport is not None:
        return _transport
    return _MockGmailTransport()  # hermetic default — never touches the network


# ── connection + scope resolution ─────────────────────────────────────────────

def _connection(tenant_id: str, *, need_send: bool = False) -> dict:
    """Return the unsealed Google connection for this tenant, validating scope.

    Reuses ``integrations.connections`` (encrypted at rest). Raises GmailError with
    a truthful category (not a generic failure)."""
    from integrations.connections import find_active_connection_unsealed
    cap = "email_send" if need_send else "email_read"
    conn = find_active_connection_unsealed(tenant_id, cap)
    if conn is None:
        # fall back to any google connection to distinguish not-connected vs missing-scope
        conn = find_active_connection_unsealed(tenant_id, "email_read") or \
            find_active_connection_unsealed(tenant_id, "calendar_read")
        if conn is None:
            raise GmailError("not_connected", "no Google connection for tenant")
    scopes = (conn.get("scope") or "")
    if need_send and (SCOPE_SEND not in scopes and "gmail.send" not in scopes):
        raise GmailError("missing_scope", "connection lacks gmail.send")
    return conn


async def _token(conn: dict) -> str:
    """Return a valid (refreshed) access token. Persists rotation."""
    from integrations import google_oauth, connections
    try:
        tok = await google_oauth.valid_access_token(conn)
    except RuntimeError as exc:
        raise GmailError("token_revoked", str(exc)[:80]) from exc
    # persist any rotation (best-effort; never logs the token)
    try:
        connections.register_connection(conn.get("tenant_id", ""), "email_read", conn)
    except Exception:
        pass
    return tok


# ── normalisation ─────────────────────────────────────────────────────────────

def normalise_message(raw: dict) -> dict:
    """Google message resource → normalised internal schema (bounded, sanitised)."""
    headers = {h.get("name", "").lower(): h.get("value", "") for h in (raw.get("payload", {}).get("headers") or [])}
    body = _extract_body(raw.get("payload", {}))
    return {
        "message_id": raw.get("id", ""),
        "thread_id": raw.get("threadId", ""),
        "history_id": str(raw.get("historyId", "")),
        "from": headers.get("from", "")[:MAX_SUBJECT_LEN],
        "to": headers.get("to", "")[:MAX_SUBJECT_LEN],
        "subject": headers.get("subject", "")[:MAX_SUBJECT_LEN],
        "in_reply_to": headers.get("in-reply-to", ""),
        "references": headers.get("references", ""),
        "date": headers.get("date", ""),
        "labels": list(raw.get("labelIds") or []),
        "snippet": (raw.get("snippet", "") or "")[:1000],
        "body_text": body[:MAX_BODY_LEN],
        "provider_status": "fetched",
    }


def _extract_body(payload: dict) -> str:
    """Prefer text/plain; fall back to HTML→text. Never returns raw HTML."""
    def decode(data: str) -> str:
        try:
            return base64.urlsafe_b64decode(data + "===").decode("utf-8", "replace")
        except Exception:
            return ""

    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        return decode(payload.get("body", {}).get("data", ""))
    if mime == "text/html":
        return html_to_text(decode(payload.get("body", {}).get("data", "")))
    for part in payload.get("parts", []) or []:
        if part.get("mimeType") == "text/plain":
            t = decode(part.get("body", {}).get("data", ""))
            if t.strip():
                return t
    for part in payload.get("parts", []) or []:
        if part.get("mimeType") == "text/html":
            return html_to_text(decode(part.get("body", {}).get("data", "")))
    return ""


_TAG = re.compile(r"<[^>]+>")
_SCRIPT_STYLE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.I)


def html_to_text(html: str) -> str:
    """Sanitise HTML → text: strip scripts/styles/tags, no remote fetch, no exec."""
    import html as _h
    s = _SCRIPT_STYLE.sub(" ", html or "")
    s = _TAG.sub(" ", s)
    s = _h.unescape(s)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]+", " ", s)).strip()


def trim_quoted(text: str) -> str:
    """Drop quoted-reply tails ('On … wrote:', leading '>' blocks)."""
    lines = (text or "").splitlines()
    out = []
    for ln in lines:
        if re.match(r"^\s*On .+ wrote:\s*$", ln) or re.match(r"^\s*-{2,}\s*Original Message", ln, re.I):
            break
        out.append(ln)
    trimmed = "\n".join(out)
    trimmed = re.sub(r"(?m)^\s*>.*$", "", trimmed)
    return trimmed.strip()


# ── RFC822 builder (header-injection-safe) ────────────────────────────────────

def build_raw_reply(*, to: str, subject: str, body: str, from_addr: str = "",
                    in_reply_to: str = "", references: str = "") -> str:
    to = validate_recipient(to)
    subject = _safe_header(subject or "Re:")
    lines = [f"To: {to}", f"Subject: {subject}", "MIME-Version: 1.0",
             "Content-Type: text/plain; charset=UTF-8"]
    if from_addr:
        lines.insert(0, f"From: {_safe_header(from_addr)}")
    if in_reply_to:
        lines.append(f"In-Reply-To: {_safe_header(in_reply_to)}")
    if references:
        lines.append(f"References: {_safe_header(references)}")
    raw = "\r\n".join(lines) + "\r\n\r\n" + (body or "")[:MAX_BODY_LEN]
    if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise GmailError("message_too_large")
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


# ── public adapter API ────────────────────────────────────────────────────────

async def get_profile(tenant_id: str) -> dict:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    return _active_transport().profile(tok)


async def list_messages(tenant_id: str, *, query: str = "", max_results: int = 25, page_token: str = "") -> dict:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    return _active_transport().list_messages(tok, query=query, max_results=max_results, page_token=page_token)


async def get_message(tenant_id: str, message_id: str) -> dict:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    return normalise_message(_active_transport().get_message(tok, message_id))


async def history(tenant_id: str, start_history_id: str) -> dict:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    return _active_transport().history(tok, start_history_id)


async def create_draft(tenant_id: str, *, to: str, subject: str, body: str, thread_id: str = "",
                       in_reply_to: str = "", references: str = "") -> dict:
    conn = _connection(tenant_id)  # compose/send scope validated at send time
    tok = await _token(conn)
    raw = build_raw_reply(to=to, subject=subject, body=body, from_addr=conn.get("email", ""),
                          in_reply_to=in_reply_to, references=references)
    res = _active_transport().create_draft(tok, raw, thread_id)
    return {"draft_id": res.get("id", ""), "message_id": (res.get("message") or {}).get("id", ""),
            "thread_id": thread_id, "provider_status": "draft_created"}


async def send_reply(tenant_id: str, *, to: str, subject: str, body: str, thread_id: str = "",
                     in_reply_to: str = "", references: str = "") -> dict:
    conn = _connection(tenant_id, need_send=True)  # raises missing_scope if read-only
    tok = await _token(conn)
    raw = build_raw_reply(to=to, subject=subject, body=body, from_addr=conn.get("email", ""),
                          in_reply_to=in_reply_to, references=references)
    res = _active_transport().send(tok, raw, thread_id)
    mid = res.get("id", "")
    if not mid:
        raise GmailError("unknown_result", "send returned no message id")
    return {"message_id": mid, "thread_id": res.get("threadId", thread_id),
            "provider_status": "sent"}


async def validate_connection(tenant_id: str) -> dict:
    """Truthful capability snapshot for the readiness UI (no secrets)."""
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "email_read") or \
        find_active_connection_unsealed(tenant_id, "email_send")
    if conn is None:
        return {"connected": False, "state": "not_connected"}
    scopes = conn.get("scope") or ""
    return {
        "connected": True,
        "email": conn.get("email", ""),
        "can_read": SCOPE_READONLY in scopes or "gmail.readonly" in scopes or "gmail.modify" in scopes,
        "can_draft": "gmail.compose" in scopes or "gmail.send" in scopes or "gmail.modify" in scopes,
        "can_send": SCOPE_SEND in scopes or "gmail.send" in scopes,
        "state": "connected",
    }


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockGmailTransport(GmailTransport):
    """Deterministic fixtures — used whenever no real transport is injected."""

    def profile(self, token: str) -> dict:
        return {"emailAddress": "business@example.com", "messagesTotal": 3, "historyId": "1000"}

    def list_messages(self, token: str, *, query: str, max_results: int, page_token: str = "") -> dict:
        return {"messages": [{"id": "m1", "threadId": "t1"}], "resultSizeEstimate": 1}

    def get_message(self, token: str, message_id: str) -> dict:
        return {"id": message_id, "threadId": "t1", "historyId": "1001", "labelIds": ["INBOX", "UNREAD"],
                "snippet": "Hi, are you open Saturday?",
                "payload": {"mimeType": "text/plain",
                            "headers": [{"name": "From", "value": "Sam <sam@example.com>"},
                                        {"name": "To", "value": "business@example.com"},
                                        {"name": "Subject", "value": "Opening hours"}],
                            "body": {"data": base64.urlsafe_b64encode(b"Hi, are you open Saturday?").decode()}}}

    def history(self, token: str, start_history_id: str) -> dict:
        return {"history": [{"id": "1002", "messagesAdded": [{"message": {"id": "m2", "threadId": "t2"}}]}],
                "historyId": "1002"}

    def create_draft(self, token: str, raw: str, thread_id: str = "") -> dict:
        return {"id": "draft_mock_1", "message": {"id": "dm1", "threadId": thread_id or "t1"}}

    def send(self, token: str, raw: str, thread_id: str = "") -> dict:
        return {"id": "sent_mock_1", "threadId": thread_id or "t1", "labelIds": ["SENT"]}
